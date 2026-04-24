const express = require('express');
const router = express.Router();
const store = require('../store');

router.get('/state', (req, res) => {
  res.json({ ok: true, data: store.getState() });
});

router.get('/zones', (req, res) => {
  res.json({ ok: true, data: store.getState().zones });
});

router.get('/zones/:id', (req, res) => {
  const zone = store.getState().zones.find(z => z.id === req.params.id);
  if (zone) {
    res.json({ ok: true, data: zone });
  } else {
    res.json({ ok: false, error: 'Zone not found' });
  }
});

router.get('/concessions', (req, res) => {
  res.json({ ok: true, data: store.getState().concessions });
});

router.get('/gates', (req, res) => {
  res.json({ ok: true, data: store.getState().gates });
});

router.get('/alerts', (req, res) => {
  res.json({ ok: true, data: store.getState().alerts });
});

router.get('/metrics', (req, res) => {
  res.json({ ok: true, data: store.getState().metrics });
});

router.post('/emergency', (req, res) => {
  const state = store.getState();
  state.zones.forEach(z => z.status = 'emergency');
  
  const alert = {
    level: 'danger',
    msg: 'EMERGENCY OVERRIDE ACTIVATED. All zones set to emergency routing.',
    time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    zone: 'SYS'
  };
  store.addAlert(alert);
  
  if (req.app.get('io')) {
    req.app.get('io').emit('state', state);
  }
  
  res.json({ ok: true, data: { msg: 'Emergency mode activated' } });
});

router.post('/reroute', express.json(), (req, res) => {
  const { gateId, reason } = req.body;
  const state = store.getState();
  const gate = state.gates.find(g => g.id === gateId);
  
  if (!gate) return res.json({ ok: false, error: 'Gate not found' });
  
  gate.status = 'rerouting';
  
  const alert = {
    level: 'amber',
    msg: `Reroute active at ${gate.name}. Reason: ${reason || 'Congestion'}`,
    time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    zone: gate.name
  };
  store.addAlert(alert);
  
  if (req.app.get('io')) {
    req.app.get('io').emit('state', state);
  }
  
  res.json({ ok: true, data: { gate, alert } });
});

module.exports = router;
