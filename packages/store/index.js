// store.js
const state = {
  venue: { name: 'Riverside Arena', capacity: 62400, currentOccupancy: 54288 },
  zones: [
    { id: 'sw', name: 'SW Stand', capacity: 8000, current: 7840, status: 'critical' },
    { id: 'se', name: 'SE Stand', capacity: 8000, current: 6320, status: 'high' },
    { id: 'ne', name: 'NE Stand', capacity: 8000, current: 4880, status: 'medium' },
    { id: 'nw', name: 'NW Stand', capacity: 8000, current: 3440, status: 'low' },
    { id: 'wlwr', name: 'West Lower', capacity: 6000, current: 3480, status: 'medium' },
    { id: 'elwr', name: 'East Lower', capacity: 6000, current: 4920, status: 'high' },
    { id: 'north', name: 'North Stand', capacity: 10000, current: 5800, status: 'medium' },
    { id: 'south_a', name: 'South A', capacity: 4200, current: 2268, status: 'low' },
    { id: 'south_b', name: 'South B', capacity: 4200, current: 1722, status: 'low' },
  ],
  concessions: [
    { id: 'w3', name: 'Stand W3', type: 'Hot dogs', zone: 'West', waitMinutes: 2, discount: 15 },
    { id: 'n1', name: 'Stand N1', type: 'Drinks', zone: 'North', waitMinutes: 6, discount: 0 },
    { id: 'n2', name: 'Stand N2', type: 'Snacks', zone: 'North', waitMinutes: 4, discount: 0 },
    { id: 'e2', name: 'Stand E2', type: 'Burgers', zone: 'East', waitMinutes: 11, discount: 0 },
    { id: 's1', name: 'Stand S1', type: 'Pizza', zone: 'South', waitMinutes: 3, discount: 10 },
  ],
  gates: [
    { id: 'a', name: 'Gate A', status: 'open', queueLength: 45 },
    { id: 'b', name: 'Gate B', status: 'open', queueLength: 62 },
    { id: 'c', name: 'Gate C', status: 'open', queueLength: 18 },
    { id: 'd', name: 'Gate D', status: 'congested', queueLength: 134 },
  ],
  alerts: [],
  metrics: {
    avgWaitMinutes: 4.2,
    activeReroutes: 12,
    flowCoinsIssued: 3841,
    activeAppUsers: 2104,
  },
  flowcoins: {
    totalIssued: 3841,
    reroutes_followed: 687,
    redemptions: 143,
  }
};

module.exports = {
  getState: () => state,
  setState: (newState) => {
    Object.assign(state, newState);
  },
  addAlert: (alert) => {
    state.alerts.unshift(alert);
    if (state.alerts.length > 20) {
      state.alerts.pop();
    }
  }
};
