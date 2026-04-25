/**
 * advisor.js — Gemini-powered Ops Intelligence Advisor
 *
 * Wraps the Gemini API with rich venue context. Two modes:
 *
 *  1. askAdvisor(question, state, forecasts, anomalies)
 *     Answers a specific ops question from a staff member.
 *
 *  2. getRecommendations(state, forecasts, anomalies)
 *     Proactively generates 3-5 prioritised action items every 60s.
 *
 * The Gemini model receives a tight system prompt with current venue
 * data as structured JSON so it can reason accurately about numbers.
 */

const { getIntelligenceSummary } = require('./predictor');
const { getAnomalyReport } = require('./anomaly');
const { getLatest } = require('./stateHistory');

const MAX_TOKENS = 600;

// Cache: avoid hammering the API if state hasn't changed significantly
let recommendationsCache = {
  lastGeneratedAt: 0,
  recommendations: [],
  ttlMs: 60000, // regenerate every 60s
};

/**
 * Builds the system prompt for the ops advisor.
 * Embeds current state as compact JSON so Gemini has real numbers.
 *
 * @param {object} state - current full state from store.js
 * @param {object} forecasts - output of getIntelligenceSummary()
 * @param {object} anomalyReport - output of getAnomalyReport()
 * @returns {string}
 */
function buildSystemPrompt(state, forecasts, anomalyReport) {
  const zoneTable = (state.zones || []).map(z => ({
    id: z.id,
    name: z.name,
    pct: Math.round((z.current / z.capacity) * 100),
    status: z.status,
    forecast5min: forecasts?.zones?.find(f => f.zoneId === z.id)?.message || 'unknown',
  }));

  const concessionTable = (state.concessions || []).map(c => ({
    id: c.id,
    name: c.name,
    wait: c.waitMinutes,
    discount: c.discount,
  }));

  const gateTable = (state.gates || []).map(g => ({
    id: g.id,
    name: g.name,
    queue: g.queueLength,
    status: g.status,
  }));

  return `You are the FlowState AI Operations Advisor for ${state.venue?.name || 'Riverside Arena'}.
You assist stadium operations staff with real-time crowd management decisions.
Be direct, concise, and action-oriented. Use numbers from the data below. Never make up facts.

CURRENT VENUE STATE (live as of ${new Date().toISOString()}):
Occupancy: ${state.venue?.currentOccupancy?.toLocaleString()} / ${state.venue?.capacity?.toLocaleString()} (${Math.round((state.venue?.currentOccupancy / state.venue?.capacity) * 100)}%)
Avg concession wait: ${state.metrics?.avgWaitMinutes} min
Active reroutes: ${state.metrics?.activeReroutes}
FlowCoins issued: ${state.metrics?.flowCoinsIssued?.toLocaleString()}

ZONES (id, name, % capacity, status, 5-min forecast):
${JSON.stringify(zoneTable, null, 2)}

CONCESSIONS (id, name, wait minutes, discount %):
${JSON.stringify(concessionTable, null, 2)}

GATES (id, name, queue length, status):
${JSON.stringify(gateTable, null, 2)}

ACTIVE ANOMALIES:
${anomalyReport?.summary || 'None'}
${(anomalyReport?.anomalies || []).map(a => `• [${a.severity.toUpperCase()}] ${a.description}`).join('\n')}

RESPONSE RULES:
- Maximum 4 sentences or 5 bullet points. Be concise.
- Always cite specific zone/stand names and real numbers.
- If asked for recommendations, output as a numbered action list.
- If the situation is normal, say so clearly.
- Do not use markdown headers. No preamble.`;
}

/**
 * Ask the ops advisor a natural-language question.
 *
 * @param {string} question - Staff member's question
 * @param {object} currentState - Full state from store.js
 * @returns {Promise<{answer: string, tokensUsed: number, error?: string}>}
 */
async function askAdvisor(question, currentState) {
  try {
    const forecasts = getIntelligenceSummary();
    const anomalyReport = getAnomalyReport(currentState);
    const systemPrompt = buildSystemPrompt(currentState, forecasts, anomalyReport);

    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt + '\n\n' + question,
    });

    const answer = response.text || 'No response from advisor.';
    const tokensUsed = 0; // We don't get exact token counts natively from this simplified call sometimes, or we can just pass 0.

    return { answer, tokensUsed };
  } catch (error) {
    console.error('[advisor] askAdvisor error:', error.message);
    return {
      answer: 'Intelligence advisor temporarily unavailable. Check server logs.',
      error: error.message,
    };
  }
}

/**
 * Proactively generate prioritised recommendations for ops staff.
 * Results are cached for 60s to avoid redundant API calls.
 *
 * @param {object} currentState
 * @returns {Promise<{recommendations: Array<{priority, action, reason}>, generatedAt: string}>}
 */
async function getRecommendations(currentState) {
  const now = Date.now();

  // Return cache if fresh
  if (
    recommendationsCache.recommendations.length > 0 &&
    now - recommendationsCache.lastGeneratedAt < recommendationsCache.ttlMs
  ) {
    return {
      recommendations: recommendationsCache.recommendations,
      generatedAt: new Date(recommendationsCache.lastGeneratedAt).toISOString(),
      fromCache: true,
    };
  }

  try {
    const forecasts = getIntelligenceSummary();
    const anomalyReport = getAnomalyReport(currentState);
    const systemPrompt = buildSystemPrompt(currentState, forecasts, anomalyReport);

    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt + '\n\nGenerate 3-5 prioritised action recommendations for ops staff right now.\nReturn ONLY a JSON array, each item having: priority (1=urgent, 2=soon, 3=monitor), action (string, ≤12 words), reason (string, ≤20 words), zone (zone id or "venue" or "concessions").\n\nExample format:\n[{"priority":1,"action":"Deploy stewards to SW Stand exits","reason":"SW Stand at 96% capacity, surge detected","zone":"sw"}]',
    });

    const rawText = response.text || '[]';

    // Strip any accidental markdown fences
    const clean = rawText.replace(/```json|```/g, '').trim();
    const recommendations = JSON.parse(clean);

    // Update cache
    recommendationsCache = {
      lastGeneratedAt: now,
      recommendations,
      ttlMs: 60000,
    };

    return {
      recommendations,
      generatedAt: new Date(now).toISOString(),
      fromCache: false,
    };
  } catch (error) {
    console.error('[advisor] getRecommendations error:', error.message);
    // Return last cached even if stale, or empty
    return {
      recommendations: recommendationsCache.recommendations,
      generatedAt: new Date(recommendationsCache.lastGeneratedAt || now).toISOString(),
      fromCache: true,
      error: error.message,
    };
  }
}

module.exports = { askAdvisor, getRecommendations };
