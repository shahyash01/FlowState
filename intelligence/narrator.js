/**
 * narrator.js — Automated AI Situation Report Generator
 *
 * Runs on a 30-second interval. Calls the Gemini API to produce a
 * short, plain-English "situation report" (SITREP) that summarises
 * what's happening in the venue RIGHT NOW, based on live state and
 * velocity data.
 *
 * Emits a 'narrative:update' event on the shared EventEmitter so
 * server.js can push it over Socket.IO to all connected dashboards.
 *
 * Usage:
 *   const { startNarrator } = require('./intelligence/narrator');
 *   startNarrator(eventEmitter, getState);
 */

const { getIntelligenceSummary } = require('./predictor');
const { getAnomalyReport } = require('./anomaly');

const NARRATOR_INTERVAL_MS = 30000; // 30 seconds

let currentNarrative = {
  text: 'Intelligence engine initialising — first situation report in 30 seconds.',
  generatedAt: new Date().toISOString(),
  tone: 'normal', // 'normal' | 'alert' | 'critical'
};

/**
 * Fetch a fresh narrative from Gemini.
 * @param {object} state
 * @returns {Promise<{text: string, tone: string}>}
 */
async function generateNarrative(state) {
  const forecasts = getIntelligenceSummary();
  const anomalyReport = getAnomalyReport(state);

  // Build compact state digest for the prompt
  const criticalZones = (state.zones || []).filter(z => z.status === 'critical' || z.status === 'high');
  const longestQueue = (state.concessions || []).sort((a, b) => b.waitMinutes - a.waitMinutes)[0];
  const congestedGates = (state.gates || []).filter(g => g.status === 'congested' || g.queueLength > 100);
  const surgingZones = forecasts.zones?.filter(f => f.alertLevel === 'critical' || f.alertLevel === 'warning') || [];

  const digest = {
    occupancyPct: Math.round((state.venue?.currentOccupancy / state.venue?.capacity) * 100),
    criticalZones: criticalZones.map(z => z.name),
    surgingZones: surgingZones.map(z => z.message),
    longestWait: longestQueue ? `${longestQueue.name}: ${longestQueue.waitMinutes} min` : 'N/A',
    congestedGates: congestedGates.map(g => `${g.name} (${g.queueLength})`),
    anomalySummary: anomalyReport.summary,
    activeAnomalies: anomalyReport.anomalies.length,
  };

  const systemPrompt = `You are the FlowState AI Narrator for ${state.venue?.name || 'Riverside Arena'}.
Write a 2-3 sentence situation report for the operations centre screen.
Be factual, specific, and use an appropriate tone (calm if normal, urgent if critical).
Do not use bullet points, headers, or markdown. Plain prose only.
Always start with current occupancy. Mention the most important issue (or note all is well).
End with one proactive note — something ops should watch or do next.`;

  const userPrompt = `Current venue snapshot: ${JSON.stringify(digest)}
Write the situation report now.`;

  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({});

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: systemPrompt + '\n\n' + userPrompt,
  });

  const text = response.text || 'Narrative unavailable.';

  // Infer tone from content
  const tone = anomalyReport.hasCritical ? 'critical'
    : (anomalyReport.hasWarning || digest.criticalZones.length > 0) ? 'alert'
    : 'normal';

  return { text, tone };
}

/**
 * Start the narrator loop.
 *
 * @param {EventEmitter} emitter - shared event bus (same one used by simulator)
 * @param {Function} getState - reference to store.getState
 */
function startNarrator(emitter, getState) {
  console.log('[narrator] Starting AI narrative engine (30s interval)');

  const tick = async () => {
    const state = getState();
    try {
      const { text, tone } = await generateNarrative(state);
      currentNarrative = {
        text,
        tone,
        generatedAt: new Date().toISOString(),
      };
      emitter.emit('narrative:update', currentNarrative);
      console.log(`[narrator] Updated narrative (tone: ${tone})`);
    } catch (err) {
      console.error('[narrator] Failed to generate narrative:', err.message);
      // Keep last good narrative — don't overwrite with error state
    }
  };

  // Fire first one after a short delay (let simulator warm up)
  setTimeout(tick, 8000);
  setInterval(tick, NARRATOR_INTERVAL_MS);
}

/**
 * Returns the most recently generated narrative (synchronous).
 * Used by GET /api/ai/narrative.
 */
function getCurrentNarrative() {
  return currentNarrative;
}

module.exports = { startNarrator, getCurrentNarrative };
