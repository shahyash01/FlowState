/**
 * anomaly.js — Velocity-aware anomaly detector
 *
 * Goes beyond the simulator's simple threshold alerts (e.g. zone > 90%).
 * Detects *rate-of-change* anomalies:
 *   - Surge: zone growing 3x faster than its 2-minute baseline
 *   - Rapid drain: sudden mass exit from a zone
 *   - Concession spike: wait time jumping >3 min in one cycle
 *   - Gate flood: queue growing faster than scanner throughput allows
 *
 * Emits structured anomaly objects consumed by routes/ai.js and
 * fed as context into the Gemini advisor.
 */

const history = require('./stateHistory');

// Baseline velocity multiplier to trigger a surge anomaly
const SURGE_THRESHOLD_MULTIPLIER = 2.5;
// Min velocity to even consider (ignore noise at very low occupancy change)
const MIN_VELOCITY_FOR_SURGE = 8; // people/tick
// Max acceptable queue growth per tick (scanners do ~25 people/min = ~0.8/tick)
const GATE_QUEUE_SAFE_GROWTH = 3; // per tick

let lastAnomalyTimestamps = {}; // { anomalyKey: timestamp } — prevent alert spam

/**
 * Check whether enough time has passed to re-fire an anomaly alert.
 * @param {string} key
 * @param {number} cooldownMs - milliseconds (default 60s)
 */
function isCooledDown(key, cooldownMs = 60000) {
  const last = lastAnomalyTimestamps[key];
  if (!last || Date.now() - last > cooldownMs) {
    lastAnomalyTimestamps[key] = Date.now();
    return true;
  }
  return false;
}

/**
 * Detect all current anomalies across zones, concessions, and gates.
 * Returns an array of anomaly objects.
 *
 * Each anomaly: {
 *   type: 'surge' | 'rapid-drain' | 'concession-spike' | 'gate-flood' | 'cascade-risk',
 *   severity: 'info' | 'warning' | 'critical',
 *   entityId: string,
 *   entityName: string,
 *   description: string,
 *   velocity: number,
 *   detectedAt: string (ISO),
 *   isNew: boolean,
 * }
 */
function detectAnomalies(currentState) {
  const anomalies = [];
  const velocities = history.getAllZoneVelocities();

  if (!velocities.length) return anomalies;

  // --- Zone surge & rapid-drain detection ---
  for (const { id, velocity, accelerating } of velocities) {
    const zone = currentState.zones.find(z => z.id === id);
    if (!zone) continue;

    // Surge: growing very fast (velocity well above normal + accelerating)
    if (velocity >= MIN_VELOCITY_FOR_SURGE) {
      // Compute baseline velocity from older window (last 30 ticks vs last 5)
      const longVel = getBaselineVelocity(id, 30);
      const isSurge = velocity > Math.max(longVel * SURGE_THRESHOLD_MULTIPLIER, MIN_VELOCITY_FOR_SURGE);

      if (isSurge && isCooledDown(`surge-${id}`)) {
        const minutesToCritical = zone.capacity * 0.90 > zone.current
          ? Math.round((zone.capacity * 0.90 - zone.current) / (velocity * 30))
          : 0;

        anomalies.push({
          type: 'surge',
          severity: minutesToCritical > 0 && minutesToCritical <= 5 ? 'critical' : 'warning',
          entityId: id,
          entityName: zone.name,
          description: `Rapid crowd surge: +${Math.round(velocity * 30)}/min (${minutesToCritical > 0 ? `critical in ~${minutesToCritical} min` : 'already critical'
            })`,
          velocity,
          accelerating,
          detectedAt: new Date().toISOString(),
          isNew: true,
        });
      }
    }

    // Rapid drain: zone losing people very fast (could signal emergency exit)
    if (velocity <= -MIN_VELOCITY_FOR_SURGE && zone.current > zone.capacity * 0.3) {
      if (isCooledDown(`drain-${id}`, 90000)) {
        anomalies.push({
          type: 'rapid-drain',
          severity: velocity < -MIN_VELOCITY_FOR_SURGE * 2 ? 'warning' : 'info',
          entityId: id,
          entityName: zone.name,
          description: `Rapid exit detected: ${Math.round(Math.abs(velocity) * 30)}/min leaving zone`,
          velocity,
          detectedAt: new Date().toISOString(),
          isNew: true,
        });
      }
    }
  }

  // --- Concession wait spike detection ---
  if (currentState.concessions) {
    for (const c of currentState.concessions) {
      const vel = history.getConcessionVelocity(c.id, 3); // very short window (6s)
      if (vel > 1.5 && isCooledDown(`cspike-${c.id}`, 90000)) {
        anomalies.push({
          type: 'concession-spike',
          severity: c.waitMinutes > 10 ? 'warning' : 'info',
          entityId: c.id,
          entityName: c.name,
          description: `Wait time spiking at ${c.name}: now ${c.waitMinutes} min (+${Math.round(vel * 30)}/min trend)`,
          velocity: vel,
          detectedAt: new Date().toISOString(),
          isNew: true,
        });
      }
    }
  }

  // --- Gate queue flood detection ---
  if (currentState.gates) {
    for (const gate of currentState.gates) {
      if (gate.status === 'rerouting') continue; // already handled

      const snapshots = history.getHistory();
      if (snapshots.length < 3) continue;

      const prev = snapshots[snapshots.length - 3].gates?.find(g => g.id === gate.id);
      if (!prev) continue;

      const queueGrowth = (gate.queueLength - prev.queueLength) / 2; // per tick
      if (queueGrowth > GATE_QUEUE_SAFE_GROWTH * 2 && gate.queueLength > 80) {
        if (isCooledDown(`gflood-${gate.id}`, 120000)) {
          anomalies.push({
            type: 'gate-flood',
            severity: gate.queueLength > 150 ? 'critical' : 'warning',
            entityId: gate.id,
            entityName: gate.name,
            description: `${gate.name} queue flooding: ${gate.queueLength} people, +${Math.round(queueGrowth * 30)}/min`,
            velocity: queueGrowth,
            detectedAt: new Date().toISOString(),
            isNew: true,
          });
        }
      }
    }
  }

  // --- Cascade risk: multiple zones rising simultaneously ---
  const risingSurges = anomalies.filter(a => a.type === 'surge').length;
  if (risingSurges >= 2 && isCooledDown('cascade-risk', 180000)) {
    anomalies.push({
      type: 'cascade-risk',
      severity: 'critical',
      entityId: 'venue',
      entityName: 'Venue-wide',
      description: `Cascade risk: ${risingSurges} zones surging simultaneously — possible mass movement event`,
      velocity: null,
      detectedAt: new Date().toISOString(),
      isNew: true,
    });
  }

  return anomalies;
}

/**
 * Compute average velocity over a longer window for surge baselining.
 * @param {string} zoneId
 * @param {number} windowTicks
 * @returns {number}
 */
function getBaselineVelocity(zoneId, windowTicks = 30) {
  const h = history.getHistory();
  if (h.length < 2) return 0;
  const window = h.slice(0, -5); // exclude most recent 5 ticks to get "historical" baseline
  const sliced = window.slice(-windowTicks);

  if (sliced.length < 2) return 0;
  const first = sliced[0].zones.find(z => z.id === zoneId);
  const last = sliced[sliced.length - 1].zones.find(z => z.id === zoneId);
  if (!first || !last) return 0;

  return (last.current - first.current) / sliced.length;
}

/**
 * Returns a formatted list of active anomalies for API consumption.
 * @param {object} currentState
 * @returns {{ anomalies: Array, hasCritical: boolean, summary: string }}
 */
function getAnomalyReport(currentState) {
  const anomalies = detectAnomalies(currentState);
  const hasCritical = anomalies.some(a => a.severity === 'critical');
  const hasWarning = anomalies.some(a => a.severity === 'warning');

  let summary = 'All systems normal — no velocity anomalies detected.';
  if (hasCritical) {
    summary = `⚠ CRITICAL: ${anomalies.filter(a => a.severity === 'critical').length} critical anomalies require immediate action.`;
  } else if (hasWarning) {
    summary = `${anomalies.filter(a => a.severity === 'warning').length} warning(s) — monitor and prepare reroutes.`;
  }

  return { anomalies, hasCritical, hasWarning, summary };
}

module.exports = {
  detectAnomalies,
  getAnomalyReport,
};
