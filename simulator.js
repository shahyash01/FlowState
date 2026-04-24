const store = require('./store');

function startSimulator(eventEmitter) {
  setInterval(() => {
    const state = store.getState();
    let totalOccupancy = 0;
    
    // Update zones
    state.zones.forEach(zone => {
      // Random nudge between -200 and +200
      const nudge = Math.floor(Math.random() * 401) - 200;
      zone.current += nudge;
      
      // Bounds
      if (zone.current < 0) zone.current = 0;
      if (zone.current > zone.capacity) zone.current = zone.capacity;
      
      totalOccupancy += zone.current;
      
      // Recalculate status
      const pct = zone.current / zone.capacity;
      const oldStatus = zone.status;
      
      if (pct > 0.9) zone.status = 'critical';
      else if (pct > 0.75) zone.status = 'high';
      else if (pct > 0.6) zone.status = 'medium';
      else zone.status = 'low';
      
      // Generate alerts for status changes
      if (oldStatus !== 'critical' && zone.status === 'critical') {
        const alert = {
          level: 'danger',
          msg: `${zone.name} is at CRITICAL capacity (${Math.round(pct * 100)}%).`,
          time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          zone: zone.name
        };
        store.addAlert(alert);
      } else if (oldStatus === 'critical' && zone.status !== 'critical') {
        const alert = {
          level: 'success',
          msg: `${zone.name} has recovered from critical capacity (${Math.round(pct * 100)}%).`,
          time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          zone: zone.name
        };
        store.addAlert(alert);
      }
    });
    
    state.venue.currentOccupancy = totalOccupancy;
    
    // Update concessions
    let totalWait = 0;
    state.concessions.forEach(c => {
      const nudge = Math.floor(Math.random() * 5) - 2; // -2 to +2
      c.waitMinutes += nudge;
      if (c.waitMinutes < 0) c.waitMinutes = 0;
      
      totalWait += c.waitMinutes;
      
      if (c.waitMinutes > 10 && !c._warned) {
        c._warned = true;
        c._discounted = false;
        store.addAlert({
          level: 'warning',
          msg: `${c.name} wait time exceeds 10 minutes.`,
          time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          zone: c.zone
        });
      } else if (c.waitMinutes < 3 && !c._discounted) {
        c._discounted = true;
        c._warned = false;
        c.discount = 15;
        store.addAlert({
          level: 'info',
          msg: `Wait time dropped below 3 min at ${c.name}. 15% discount active!`,
          time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          zone: c.zone
        });
      } else if (c.waitMinutes >= 3) {
        c._discounted = false;
        c.discount = 0;
      }
    });
    
    state.metrics.avgWaitMinutes = parseFloat((totalWait / state.concessions.length).toFixed(1));
    
    // Update gates
    state.gates.forEach(g => {
      const nudge = Math.floor(Math.random() * 21) - 10;
      g.queueLength += nudge;
      if (g.queueLength < 0) g.queueLength = 0;
    });
    
    // Update metrics
    const coinNudge = Math.floor(Math.random() * 11) + 5; // 5 to 15
    state.metrics.flowCoinsIssued += coinNudge;
    state.flowcoins.totalIssued += coinNudge;
    
    // Emit state update
    eventEmitter.emit('state:update', store.getState());
  }, 2000);
}

module.exports = { startSimulator };
