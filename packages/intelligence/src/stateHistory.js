/**
 * stateHistory.js — Rolling state snapshot buffer
 *
 * Captures every simulator tick and maintains a 60-entry ring buffer
 * (~2 minutes at 2s intervals). Exposes velocity calculations and
 * trend data used by predictor.js and anomaly.js.
 */

const BUFFER_SIZE = 60; // 2 minutes of history at 2s ticks

let snapshots = [];

/**
 * Record a new state snapshot. Call this on every 'state:update' event.
 * @param {object} state - Full state object from store.js
 */
function recordSnapshot(state) {
  const snapshot = {
    timestamp: Date.now(),
    zones: state.zones.map(z => ({
      id: z.id,
      current: z.current,
      capacity: z.capacity,
      status: z.status,
    })),
    concessions: state.concessions.map(c => ({
      id: c.id,
      waitMinutes: c.waitMinutes,
    })),
    gates: state.gates.map(g => ({
      id: g.id,
      queueLength: g.queueLength,
      status: g.status,
    })),
    metrics: { ...state.metrics },
    totalOccupancy: state.venue.currentOccupancy,
  };

  snapshots.push(snapshot);
  if (snapshots.length > BUFFER_SIZE) {
    snapshots.shift(); // drop oldest
  }
}

/**
 * Returns all snapshots (oldest first).
 */
function getHistory() {
  return snapshots;
}

/**
 * Returns the most recent snapshot, or null if buffer is empty.
 */
function getLatest() {
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}

/**
 * Returns occupancy velocity for a zone (people/tick, averaged over last N ticks).
 * Positive = growing, negative = shrinking.
 *
 * @param {string} zoneId
 * @param {number} windowTicks - how many ticks to average over (default 10 = 20 seconds)
 * @returns {number} velocity in people/tick
 */
function getZoneVelocity(zoneId, windowTicks = 10) {
  if (snapshots.length < 2) return 0;

  const window = snapshots.slice(-Math.min(windowTicks + 1, snapshots.length));
  const deltas = [];

  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1].zones.find(z => z.id === zoneId);
    const curr = window[i].zones.find(z => z.id === zoneId);
    if (prev && curr) {
      deltas.push(curr.current - prev.current);
    }
  }

  if (deltas.length === 0) return 0;
  return deltas.reduce((a, b) => a + b, 0) / deltas.length;
}

/**
 * Returns wait time velocity for a concession stand (minutes/tick).
 * Positive = getting slower, negative = getting faster.
 *
 * @param {string} concessionId
 * @param {number} windowTicks
 * @returns {number}
 */
function getConcessionVelocity(concessionId, windowTicks = 10) {
  if (snapshots.length < 2) return 0;

  const window = snapshots.slice(-Math.min(windowTicks + 1, snapshots.length));
  const deltas = [];

  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1].concessions.find(c => c.id === concessionId);
    const curr = window[i].concessions.find(c => c.id === concessionId);
    if (prev && curr) {
      deltas.push(curr.waitMinutes - prev.waitMinutes);
    }
  }

  if (deltas.length === 0) return 0;
  return deltas.reduce((a, b) => a + b, 0) / deltas.length;
}

/**
 * Returns zone occupancy series for trend analysis.
 * @param {string} zoneId
 * @returns {Array<{timestamp, current, pct}>}
 */
function getZoneSeries(zoneId) {
  return snapshots
    .map(s => {
      const z = s.zones.find(z => z.id === zoneId);
      return z ? {
        timestamp: s.timestamp,
        current: z.current,
        pct: z.current / z.capacity,
      } : null;
    })
    .filter(Boolean);
}

/**
 * Returns a summary of velocity across all zones — useful for the predictor
 * and for detecting systemwide surge events.
 * @returns {Array<{id, velocity, accelerating}>}
 */
function getAllZoneVelocities() {
  const latest = getLatest();
  if (!latest) return [];

  return latest.zones.map(z => {
    const vel = getZoneVelocity(z.id);
    const prevVel = getZoneVelocity(z.id, 5); // shorter window for acceleration
    return {
      id: z.id,
      velocity: vel,            // people/tick (avg over 20s)
      accelerating: vel > prevVel + 2, // growing faster than before
    };
  });
}

module.exports = {
  recordSnapshot,
  getHistory,
  getLatest,
  getZoneVelocity,
  getConcessionVelocity,
  getZoneSeries,
  getAllZoneVelocities,
};
