/**
 * predictor.js — Occupancy & wait-time trend forecaster
 *
 * Uses linear regression on the stateHistory ring buffer to project
 * zone occupancy and concession wait times forward by N minutes.
 * Produces human-readable ETA warnings like:
 *   "SW Stand projected to hit critical in ~4 min"
 */

const history = require('./stateHistory');

// How many ticks ahead to forecast (30 ticks × 2s = 60s = 1 minute)
const TICKS_PER_MINUTE = 30;

/**
 * Simple linear regression: given an array of y values (evenly spaced in x),
 * returns slope (change per step) and an extrapolation function.
 *
 * @param {number[]} values
 * @returns {{ slope: number, intercept: number, predict: function(stepsAhead: number): number }}
 */
function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, predict: () => values[0] || 0 };

  const xs = values.map((_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;

  const ssXX = xs.reduce((sum, x) => sum + Math.pow(x - meanX, 2), 0);
  const ssXY = xs.reduce((sum, x, i) => sum + (x - meanX) * (values[i] - meanY), 0);

  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;

  return {
    slope,
    intercept,
    predict: (stepsAhead) => intercept + slope * (n - 1 + stepsAhead),
  };
}

/**
 * Forecast a single zone N minutes into the future.
 *
 * @param {string} zoneId
 * @param {number} minutesAhead - how far to forecast (default 5)
 * @returns {{
 *   zoneId: string,
 *   currentOccupancy: number,
 *   currentPct: number,
 *   currentStatus: string,
 *   forecastOccupancy: number,
 *   forecastPct: number,
 *   forecastStatus: string,
 *   velocity: number,
 *   trend: 'rising' | 'falling' | 'stable',
 *   alertLevel: 'none' | 'watch' | 'warning' | 'critical',
 *   etaToNextThreshold: number | null,
 *   message: string,
 * }}
 */
function forecastZone(zoneId, minutesAhead = 5) {
  const series = history.getZoneSeries(zoneId);
  const latest = history.getLatest();

  if (!series.length || !latest) {
    return { zoneId, message: 'Insufficient data' };
  }

  const zone = latest.zones.find(z => z.id === zoneId);
  if (!zone) return { zoneId, message: 'Zone not found in latest snapshot' };

  const values = series.map(s => s.current);
  const { slope, predict } = linearRegression(values);

  const ticksAhead = minutesAhead * TICKS_PER_MINUTE;
  const forecastOccupancy = Math.max(0, Math.min(zone.capacity, predict(ticksAhead)));
  const forecastPct = forecastOccupancy / zone.capacity;
  const currentPct = zone.current / zone.capacity;

  const forecastStatus = getStatus(forecastPct);
  const velocity = history.getZoneVelocity(zoneId); // people/tick

  // Determine trend direction
  let trend = 'stable';
  if (slope > 5) trend = 'rising';
  else if (slope < -5) trend = 'falling';

  // Calculate ETA to next threshold breach (if rising)
  let etaToNextThreshold = null;
  let alertLevel = 'none';
  let message = '';

  if (slope > 0) {
    // Rising — find ETA to next threshold
    const thresholds = [
      { pct: 0.60, label: 'medium', status: 'medium' },
      { pct: 0.75, label: 'high',   status: 'high' },
      { pct: 0.90, label: 'critical', status: 'critical' },
      { pct: 1.00, label: 'capacity', status: 'capacity' },
    ];

    for (const t of thresholds) {
      if (currentPct < t.pct) {
        // How many ticks until we hit this threshold?
        if (slope > 0) {
          const ticksUntil = (t.pct * zone.capacity - zone.current) / slope;
          etaToNextThreshold = Math.round(ticksUntil * 2 / 60); // convert ticks→seconds→minutes
          if (etaToNextThreshold <= 10) {
            alertLevel = t.status === 'critical' || t.status === 'capacity' ? 'critical' : 'warning';
            message = `Approaching ${t.label}: ~${etaToNextThreshold} min`;
          } else {
            alertLevel = 'watch';
            message = `Trending ${trend}: ${t.label} in ~${etaToNextThreshold} min`;
          }
        }
        break;
      }
    }
    // Already at or past all thresholds
    if (!message) {
      message = forecastPct < currentPct ? 'Stabilizing at capacity' : `Holding at ${Math.round(currentPct * 100)}%`;
    }
  } else if (slope < 0) {
    message = `Clearing: projected ${Math.round(forecastPct * 100)}% in ${minutesAhead} min`;
    alertLevel = 'none';
  } else {
    message = `Stable at ${Math.round(currentPct * 100)}%`;
  }

  return {
    zoneId,
    currentOccupancy: zone.current,
    currentPct: Math.round(currentPct * 1000) / 10,
    currentStatus: zone.status,
    forecastOccupancy: Math.round(forecastOccupancy),
    forecastPct: Math.round(forecastPct * 1000) / 10,
    forecastStatus,
    velocity: Math.round(slope * 10) / 10,        // people/tick (2s)
    velocityPerMin: Math.round(slope * 30),         // people/minute (for display)
    trend,
    alertLevel,
    etaToNextThreshold,
    message,
  };
}

/**
 * Forecast all zones and return sorted by alertLevel severity.
 * @param {number} minutesAhead
 * @returns {Array}
 */
function forecastAllZones(minutesAhead = 5) {
  const latest = history.getLatest();
  if (!latest) return [];

  const forecasts = latest.zones.map(z => forecastZone(z.id, minutesAhead));

  // Sort: critical first, then warning, then watch, then none
  const order = { critical: 0, warning: 1, watch: 2, none: 3 };
  return forecasts.sort((a, b) => (order[a.alertLevel] ?? 3) - (order[b.alertLevel] ?? 3));
}

/**
 * Forecast concession wait times.
 * @param {number} minutesAhead
 * @returns {Array<{id, currentWait, forecastWait, trend, message}>}
 */
function forecastConcessions(minutesAhead = 5) {
  const latest = history.getLatest();
  if (!latest) return [];

  return latest.concessions.map(c => {
    const vel = history.getConcessionVelocity(c.id);
    const forecastWait = Math.max(1, c.waitMinutes + vel * minutesAhead * TICKS_PER_MINUTE);

    let trend = 'stable';
    if (vel > 0.05) trend = 'rising';
    else if (vel < -0.05) trend = 'falling';

    let message = '';
    if (trend === 'rising' && forecastWait > 12) {
      message = `Warning: projected ${Math.round(forecastWait)} min wait`;
    } else if (trend === 'falling') {
      message = `Improving: projected ${Math.round(forecastWait)} min`;
    } else {
      message = `Stable ~${Math.round(c.waitMinutes)} min`;
    }

    return {
      id: c.id,
      currentWait: c.waitMinutes,
      forecastWait: Math.round(forecastWait),
      velocity: Math.round(vel * 100) / 100,
      trend,
      message,
    };
  });
}

/**
 * Returns a compact "intelligence summary" object ready to attach to
 * the Socket.IO broadcast payload.
 */
function getIntelligenceSummary() {
  return {
    generatedAt: new Date().toISOString(),
    zones: forecastAllZones(5),
    concessions: forecastConcessions(5),
    criticalZones: forecastAllZones(5).filter(f => f.alertLevel === 'critical' || f.alertLevel === 'warning').length,
  };
}

/** Map occupancy percentage to status label */
function getStatus(pct) {
  if (pct >= 0.90) return 'critical';
  if (pct >= 0.75) return 'high';
  if (pct >= 0.60) return 'medium';
  return 'low';
}

module.exports = {
  forecastZone,
  forecastAllZones,
  forecastConcessions,
  getIntelligenceSummary,
};
