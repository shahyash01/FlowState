/**
 * routes/ai.js — Extended Intelligence Engine REST API
 *
 * Mount this in server.js:
 *   const aiRoutes = require('./routes/ai');
 *   app.use('/api/ai', aiRoutes(getState, io));
 *
 * Endpoints:
 *   GET  /api/ai/forecast        — zone + concession trend forecasts
 *   GET  /api/ai/narrative       — current AI-generated situation report
 *   GET  /api/ai/recommendations — proactive action recommendations
 *   GET  /api/ai/anomalies       — current velocity anomaly report
 *   POST /api/ai/query           — natural language ops question → Gemini answer
 */

const express = require('express');

const { forecastAllZones, forecastConcessions, getIntelligenceSummary } = require('../intelligence/predictor');
const { getAnomalyReport } = require('../intelligence/anomaly');
const { askAdvisor, getRecommendations } = require('../intelligence/advisor');
const { getCurrentNarrative } = require('../intelligence/narrator');

/**
 * Factory function — call with (getState, io) from server.js.
 * @param {Function} getState - store.getState
 * @param {object} io - Socket.IO server instance (optional, for live push after POST)
 * @returns {express.Router}
 */
function createAiRouter(getState, io) {
  const router = express.Router();

  // ─── GET /api/ai/forecast ───────────────────────────────────────────────────
  // Returns zone and concession trend forecasts for the next 5 minutes.
  router.get('/forecast', (req, res) => {
    try {
      const minutesAhead = parseInt(req.query.minutes) || 5;
      const zones = forecastAllZones(minutesAhead);
      const concessions = forecastConcessions(minutesAhead);

      res.json({
        ok: true,
        data: {
          minutesAhead,
          zones,
          concessions,
          criticalCount: zones.filter(z => z.alertLevel === 'critical').length,
          warningCount: zones.filter(z => z.alertLevel === 'warning').length,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('[ai/forecast]', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── GET /api/ai/narrative ─────────────────────────────────────────────────
  // Returns the most recent AI-generated situation report (updated every 30s).
  router.get('/narrative', (req, res) => {
    try {
      res.json({ ok: true, data: getCurrentNarrative() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── GET /api/ai/anomalies ─────────────────────────────────────────────────
  // Returns the current velocity-based anomaly report.
  router.get('/anomalies', (req, res) => {
    try {
      const state = getState();
      const report = getAnomalyReport(state);
      res.json({ ok: true, data: report });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── GET /api/ai/recommendations ──────────────────────────────────────────
  // Returns Gemini-generated prioritised action recommendations (cached 60s).
  router.get('/recommendations', async (req, res) => {
    try {
      const state = getState();
      const result = await getRecommendations(state);
      res.json({ ok: true, data: result });
    } catch (err) {
      console.error('[ai/recommendations]', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── POST /api/ai/query ────────────────────────────────────────────────────
  // Body: { question: string }
  // Asks the Gemini ops advisor a natural-language question with live context.
  router.post('/query', async (req, res) => {
    const { question } = req.body || {};

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'question field is required' });
    }

    if (question.trim().length > 500) {
      return res.status(400).json({ ok: false, error: 'question exceeds 500 character limit' });
    }

    try {
      const state = getState();
      const { answer, tokensUsed, error } = await askAdvisor(question.trim(), state);

      // Optionally push the Q&A to all connected dashboards in real time
      if (io && !error) {
        io.emit('ai:qa', {
          question: question.trim(),
          answer,
          askedAt: new Date().toISOString(),
        });
      }

      res.json({
        ok: true,
        data: {
          question: question.trim(),
          answer,
          tokensUsed,
          askedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('[ai/query]', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── GET /api/ai/summary ──────────────────────────────────────────────────
  // One-stop endpoint that returns everything: forecasts + narrative + anomalies.
  // Used by the dashboard on initial load to hydrate the intelligence panel.
  router.get('/summary', async (req, res) => {
    try {
      const state = getState();
      const [narrative, anomalyReport] = await Promise.all([
        Promise.resolve(getCurrentNarrative()),
        Promise.resolve(getAnomalyReport(state)),
      ]);
      const intelligence = getIntelligenceSummary();

      res.json({
        ok: true,
        data: {
          narrative,
          anomalies: anomalyReport,
          intelligence,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('[ai/summary]', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = createAiRouter;
