'use client';

import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export default function Dashboard() {
  const [activePage, setActivePage] = useState('ops');
  const [time, setTime] = useState('--:--:-- IST');
  const [state, setState] = useState(null);
  const [emergencyMode, setEmergencyMode] = useState(false);

  useEffect(() => {
    const socket = io();
    socket.on('state', (newState) => {
      setState(newState);
      if (newState.zones && newState.zones[0]?.status === 'emergency') {
        setEmergencyMode(true);
        document.body.classList.add('emergency-mode');
      }
    });

    const timer = setInterval(() => {
      const n = new Date();
      const p = v => String(v).padStart(2, '0');
      setTime(`${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())} IST`);
    }, 1000);

    return () => {
      socket.disconnect();
      clearInterval(timer);
    };
  }, []);

  const toggleEmergency = async () => {
    if (!emergencyMode) {
      await fetch('/api/emergency', { method: 'POST' });
      setEmergencyMode(true);
      document.body.classList.add('emergency-mode');
      alert('EMERGENCY MODE ACTIVE — AR evacuation routes pushed to all active devices.');
    } else {
      // In a real app we'd have a route to clear emergency, but for demo:
      setEmergencyMode(false);
      document.body.classList.remove('emergency-mode');
      alert('Emergency mode deactivated. Normal routing resumed.');
    }
  };

  const exportReport = () => {
    alert('Report exported: FlowState_Ops_Report_' + new Date().toISOString().slice(0, 10) + '.pdf\n\nIn production this downloads a full PDF with crowd analytics, incident log, and performance KPIs.');
  };

  const pageTitles = {
    ops: 'Operations Dashboard',
    alerts: 'Live Alerts',
    arch: 'System Architecture',
    fan: 'Fan Companion App',
    journey: 'User Journey',
    privacy: 'Privacy & Safety'
  };

  const waitColor = (w) => w <= 4 ? 'rgba(34,197,94,0.12)' : w <= 7 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
  const waitText = (w) => w <= 4 ? 'var(--green)' : w <= 7 ? 'var(--amber)' : 'var(--red)';
  const alertColors = { 'danger': 'var(--red)', 'warning': 'var(--amber)', 'success': 'var(--green)', 'info': 'var(--accent2)', 'red': 'var(--red)', 'amber': 'var(--amber)', 'green': 'var(--green)' };

  const renderAlerts = (count) => {
    const alerts = state?.alerts || [];
    const items = count ? alerts.slice(0, count) : alerts;
    return items.map((a, i) => (
      <div className="alert-item" key={i}>
        <div className="alert-dot" style={{ background: alertColors[a.level] || 'var(--accent2)' }}></div>
        <div className="alert-body">
          <div className="alert-msg">{a.msg}</div>
          <div className="alert-meta">
            <span className="alert-tag">{a.time}</span>
            <span className="alert-tag">Zone: {a.zone}</span>
          </div>
        </div>
      </div>
    ));
  };

  // Tooltip state
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, title: '', pct: 0, detail: '' });

  const showTip = (e, title, pct, detail) => {
    const wrap = e.currentTarget.closest('.stadium-wrap');
    const rect = wrap.getBoundingClientRect();
    const bRect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      show: true,
      x: (bRect.left - rect.left + bRect.width / 2),
      y: (bRect.top - rect.top - 76),
      title,
      pct,
      detail
    });
  };

  const hideTip = () => setTooltip({ ...tooltip, show: false });

  // Map zone names from state for digital twin
  const getZonePct = (id) => {
    if (!state) return 0;
    const z = state.zones.find(z => z.id === id);
    if (!z) return 0;
    return Math.round((z.current / z.capacity) * 100);
  };
  
  const getZoneWait = (id) => {
    if (!state) return 0;
    // Basic mapping logic for demo
    const c = state.concessions.find(c => c.zone.toLowerCase().includes(id.replace('_', '').replace('lwr','').replace('north','n').substring(0,1)));
    return c ? c.waitMinutes : 2;
  };

  const getZoneStatusColor = (pct) => {
    if (pct > 90) return 'rgba(239,68,68,0.22)';
    if (pct > 75) return 'rgba(245,158,11,0.18)';
    return 'rgba(34,197,94,0.12)';
  };
  
  const getZoneStrokeColor = (pct) => {
    if (pct > 90) return 'rgba(239,68,68,0.6)';
    if (pct > 75) return 'rgba(245,158,11,0.4)';
    return 'rgba(34,197,94,0.25)';
  };

  const getZoneTextColor = (pct) => {
    if (pct > 90) return 'rgba(239,68,68,0.95)';
    if (pct > 75) return 'rgba(245,158,11,0.9)';
    return 'rgba(34,197,94,0.7)';
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">
            <svg viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="#fff" strokeWidth="1.5" />
              <path d="M6.5 10.5L9.5 13.5L14 6.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="logo-title">FlowState</div>
          <div className="logo-sub">Stadium Platform v1.0</div>
          <div className="live-chip"><span className="live-dot"></span>LIVE FEED</div>
        </div>

        <div className="nav-section">
          <div className="nav-label">Operations</div>
          <button className={`nav-item ${activePage === 'ops' ? 'active' : ''}`} onClick={() => setActivePage('ops')}>
            <svg viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            Dashboard
          </button>
          <button className={`nav-item ${activePage === 'alerts' ? 'active' : ''}`} onClick={() => setActivePage('alerts')}>
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6v4.5L2 12h12l-1.5-1.5V6C12.5 3.5 10.5 1.5 8 1.5Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6.5 12.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            Live Alerts
          </button>
          <button className={`nav-item ${activePage === 'arch' ? 'active' : ''}`} onClick={() => setActivePage('arch')}>
            <svg viewBox="0 0 16 16" fill="none">
              <circle cx="3" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="8" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="13" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="8" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M4.5 8H6.5M9.5 8H11.5M8 4.5V6.5M8 9.5V11.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            Architecture
          </button>
        </div>

        <div className="nav-section" style={{ marginTop: '12px' }}>
          <div className="nav-label">Attendee</div>
          <button className={`nav-item ${activePage === 'fan' ? 'active' : ''}`} onClick={() => setActivePage('fan')}>
            <svg viewBox="0 0 16 16" fill="none">
              <rect x="3" y="1" width="10" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6 4h4M6 7h4M6 10h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Fan App
          </button>
          <button className={`nav-item ${activePage === 'journey' ? 'active' : ''}`} onClick={() => setActivePage('journey')}>
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            User Journey
          </button>
        </div>

        <div className="nav-section" style={{ marginTop: '12px' }}>
          <div className="nav-label">Compliance</div>
          <button className={`nav-item ${activePage === 'privacy' ? 'active' : ''}`} onClick={() => setActivePage('privacy')}>
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5L2.5 4v4c0 3 2.5 5.5 5.5 6.3C11 13.5 13.5 11 13.5 8V4L8 1.5Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M5.5 8l1.8 1.8L10.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Privacy & Safety
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="venue-info">
            Riverside Arena<br />
            62,400 capacity<br />
            <span style={{ color: 'var(--green)' }}>●</span> All systems nominal
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="topbar-title">{pageTitles[activePage]}</div>
          <div className="topbar-actions">
            <div className="topbar-time">{time}</div>
            <button className="btn" onClick={toggleEmergency}>{emergencyMode ? 'Normal Mode' : 'Emergency Mode'}</button>
            <button className="btn primary" onClick={exportReport}>Export Report</button>
          </div>
        </div>

        <div className="content">
          
          <div className={`page ${activePage === 'ops' ? 'active' : ''}`}>
            <div className="metric-grid">
              <div className="metric-card">
                <div className="metric-label">Occupancy</div>
                <div className="metric-val">{state ? Math.round((state.venue.currentOccupancy / state.venue.capacity) * 100) : 0}%</div>
                <div className="metric-delta up">{state ? state.venue.currentOccupancy.toLocaleString() : 0} / {state?.venue.capacity.toLocaleString()}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Avg wait time</div>
                <div className="metric-val">{state ? state.metrics.avgWaitMinutes : 0}m</div>
                <div className="metric-delta up">↓ 1.1m from peak</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Active reroutes</div>
                <div className="metric-val warn">{state ? state.metrics.activeReroutes : 0}</div>
                <div className="metric-delta warn">2 gates congested</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">FlowCoins issued</div>
                <div className="metric-val info">{state ? state.metrics.flowCoinsIssued.toLocaleString() : 0}</div>
                <div className="metric-delta up">↑ 214 this half</div>
              </div>
            </div>

            <div className="panel-row">
              <div className="panel">
                <div className="panel-title">Digital twin — live crowd density</div>
                <div className="stadium-wrap">
                  <div className={`zone-tooltip ${tooltip.show ? 'show' : ''}`} style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text)', marginBottom: '3px' }}>{tooltip.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{tooltip.detail}</div>
                    <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: tooltip.pct > 90 ? 'var(--red)' : tooltip.pct > 75 ? 'var(--amber)' : 'var(--green)', marginTop: '4px' }}>{tooltip.pct}% capacity</div>
                  </div>
                  <svg viewBox="0 0 520 300" width="100%" style={{ cursor: 'default' }}>
                    <rect x="2" y="2" width="516" height="296" rx="10" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                    <rect x="155" y="85" width="210" height="130" rx="6" fill="rgba(20,184,166,0.06)" stroke="rgba(20,184,166,0.2)" strokeWidth="1" />
                    <text x="260" y="155" fill="rgba(20,184,166,0.3)" fontSize="10" fontFamily="var(--mono)" textAnchor="middle">PITCH</text>

                    {/* North */}
                    <rect x="155" y="24" width="210" height="52" rx="5" 
                      fill={getZoneStatusColor(getZonePct('north'))} stroke={getZoneStrokeColor(getZonePct('north'))} strokeWidth="1" 
                      onMouseEnter={(e) => showTip(e, 'North Stand', getZonePct('north'), `Wait time: ${getZoneWait('north')} min`)} onMouseLeave={hideTip} />
                    <text x="260" y="52" fill={getZoneTextColor(getZonePct('north'))} fontSize="9" fontFamily="var(--mono)" textAnchor="middle" pointerEvents="none">NORTH · {getZonePct('north')}%</text>

                    {/* South A */}
                    <rect x="155" y="224" width="100" height="52" rx="5" 
                      fill={getZoneStatusColor(getZonePct('south_a'))} stroke={getZoneStrokeColor(getZonePct('south_a'))} strokeWidth="1" 
                      onMouseEnter={(e) => showTip(e, 'South A', getZonePct('south_a'), `Wait time: ${getZoneWait('south_a')} min`)} onMouseLeave={hideTip} />
                    <text x="205" y="253" fill={getZoneTextColor(getZonePct('south_a'))} fontSize="9" fontFamily="var(--mono)" textAnchor="middle" pointerEvents="none">S-A · {getZonePct('south_a')}%</text>

                    {/* South B */}
                    <rect x="265" y="224" width="100" height="52" rx="5" 
                      fill={getZoneStatusColor(getZonePct('south_b'))} stroke={getZoneStrokeColor(getZonePct('south_b'))} strokeWidth="1" 
                      onMouseEnter={(e) => showTip(e, 'South B', getZonePct('south_b'), `Wait time: ${getZoneWait('south_b')} min`)} onMouseLeave={hideTip} />
                    <text x="315" y="253" fill={getZoneTextColor(getZonePct('south_b'))} fontSize="9" fontFamily="var(--mono)" textAnchor="middle" pointerEvents="none">S-B · {getZonePct('south_b')}%</text>

                    {/* West Lower */}
                    <rect x="28" y="120" width="80" height="60" rx="5" 
                      fill={getZoneStatusColor(getZonePct('wlwr'))} stroke={getZoneStrokeColor(getZonePct('wlwr'))} strokeWidth="1" 
                      onMouseEnter={(e) => showTip(e, 'West Lower', getZonePct('wlwr'), `Wait time: ${getZoneWait('wlwr')} min`)} onMouseLeave={hideTip} />
                    <text x="68" y="152" fill={getZoneTextColor(getZonePct('wlwr'))} fontSize="9" fontFamily="var(--mono)" textAnchor="middle" pointerEvents="none">W-LWR·{getZonePct('wlwr')}%</text>

                    {/* East Lower */}
                    <rect x="412" y="120" width="80" height="60" rx="5" 
                      fill={getZoneStatusColor(getZonePct('elwr'))} stroke={getZoneStrokeColor(getZonePct('elwr'))} strokeWidth="1" 
                      onMouseEnter={(e) => showTip(e, 'East Lower', getZonePct('elwr'), `Wait time: ${getZoneWait('elwr')} min`)} onMouseLeave={hideTip} />
                    <text x="452" y="152" fill={getZoneTextColor(getZonePct('elwr'))} fontSize="9" fontFamily="var(--mono)" textAnchor="middle" pointerEvents="none">E-LWR·{getZonePct('elwr')}%</text>

                    {/* NW */}
                    <rect x="28" y="40" width="100" height="68" rx="5" 
                      fill={getZoneStatusColor(getZonePct('nw'))} stroke={getZoneStrokeColor(getZonePct('nw'))} strokeWidth="1" 
                      onMouseEnter={(e) => showTip(e, 'NW Stand', getZonePct('nw'), `Wait time: ${getZoneWait('nw')} min`)} onMouseLeave={hideTip} />
                    <text x="78" y="76" fill={getZoneTextColor(getZonePct('nw'))} fontSize="9" fontFamily="var(--mono)" textAnchor="middle" pointerEvents="none">NW · {getZonePct('nw')}%</text>

                    {/* NE */}
                    <rect x="392" y="40" width="100" height="68" rx="5" 
                      fill={getZoneStatusColor(getZonePct('ne'))} stroke={getZoneStrokeColor(getZonePct('ne'))} strokeWidth="1" 
                      onMouseEnter={(e) => showTip(e, 'NE Stand', getZonePct('ne'), `Wait time: ${getZoneWait('ne')} min`)} onMouseLeave={hideTip} />
                    <text x="442" y="76" fill={getZoneTextColor(getZonePct('ne'))} fontSize="9" fontFamily="var(--mono)" textAnchor="middle" pointerEvents="none">NE · {getZonePct('ne')}%</text>

                    {/* SW */}
                    <rect x="28" y="192" width="100" height="80" rx="5" 
                      fill={getZoneStatusColor(getZonePct('sw'))} stroke={getZoneStrokeColor(getZonePct('sw'))} strokeWidth={getZonePct('sw') > 90 ? "1.5" : "1"} 
                      onMouseEnter={(e) => showTip(e, 'SW Stand', getZonePct('sw'), `Wait time: ${getZoneWait('sw')} min`)} onMouseLeave={hideTip} />
                    <text x="78" y="232" fill={getZoneTextColor(getZonePct('sw'))} fontSize="9" fontFamily="var(--mono)" textAnchor="middle" pointerEvents="none">SW · {getZonePct('sw')}%</text>
                    {getZonePct('sw') > 90 && (
                      <circle cx="78" cy="246" r="5" fill="rgba(239,68,68,0.8)">
                        <animate attributeName="r" values="5;10;5" dur="1.4s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.8;0.2;0.8" dur="1.4s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* SE */}
                    <rect x="392" y="192" width="100" height="80" rx="5" 
                      fill={getZoneStatusColor(getZonePct('se'))} stroke={getZoneStrokeColor(getZonePct('se'))} strokeWidth="1" 
                      onMouseEnter={(e) => showTip(e, 'SE Stand', getZonePct('se'), `Wait time: ${getZoneWait('se')} min`)} onMouseLeave={hideTip} />
                    <text x="442" y="232" fill={getZoneTextColor(getZonePct('se'))} fontSize="9" fontFamily="var(--mono)" textAnchor="middle" pointerEvents="none">SE · {getZonePct('se')}%</text>

                    {/* legend */}
                    <rect x="12" y="282" width="10" height="8" rx="1" fill="rgba(34,197,94,0.5)" />
                    <text x="26" y="290" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="var(--sans)">Low</text>
                    <rect x="56" y="282" width="10" height="8" rx="1" fill="rgba(245,158,11,0.5)" />
                    <text x="70" y="290" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="var(--sans)">High</text>
                    <rect x="100" y="282" width="10" height="8" rx="1" fill="rgba(239,68,68,0.6)" />
                    <text x="114" y="290" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="var(--sans)">Critical</text>
                    <text x="430" y="290" fill="rgba(255,255,255,0.2)" fontSize="8" fontFamily="var(--mono)">hover zones for detail</text>
                  </svg>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="panel">
                  <div className="panel-title">Zone capacity</div>
                  <div>
                    {state?.zones.sort((a,b) => (b.current/b.capacity) - (a.current/a.capacity)).slice(0, 6).map((z, i) => {
                      const pct = Math.round((z.current / z.capacity) * 100);
                      const color = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#22c55e';
                      return (
                        <div className="zone-row" key={i}>
                          <span className="zone-name">{z.name}</span>
                          <div className="zone-track"><div className="zone-fill" style={{ width: `${pct}%`, background: color }}></div></div>
                          <span className="zone-pct">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-title">Live alerts</div>
                  <div>{renderAlerts(3)}</div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-title">Concession wait times — all stands</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                {state?.concessions.map((c, i) => (
                  <div key={i} style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text)' }}>{c.name} {c.discount > 0 && <span style={{color: 'var(--amber)'}}>(-{c.discount}%)</span>}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '8px' }}>{c.type} · {c.zone}</div>
                    <div style={{ background: waitColor(c.waitMinutes), color: waitText(c.waitMinutes), fontSize: '12px', fontFamily: 'var(--mono)', padding: '4px 8px', borderRadius: '5px', textAlign: 'center' }}>
                      {c.waitMinutes} min
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`page ${activePage === 'alerts' ? 'active' : ''}`}>
            <div className="panel">
              <div className="panel-title">All system alerts — real-time feed</div>
              <div>{renderAlerts()}</div>
            </div>
          </div>

          <div className={`page ${activePage === 'arch' ? 'active' : ''}`}>
            <div className="panel">
              <div className="panel-title">System architecture — FlowState layers</div>
              <div className="arch-layers">
                <div className="arch-layer">
                  <div className="arch-label">IoT / Sensors</div>
                  <div className="arch-nodes">
                    <div className="arch-node" style={{ borderColor: 'rgba(59,130,246,0.3)', color: 'var(--accent2)' }}>Smart cameras (CV)</div>
                    <div className="arch-node" style={{ borderColor: 'rgba(59,130,246,0.3)', color: 'var(--accent2)' }}>BLE beacons</div>
                    <div className="arch-node" style={{ borderColor: 'rgba(59,130,246,0.3)', color: 'var(--accent2)' }}>RFID gates</div>
                    <div className="arch-node" style={{ borderColor: 'rgba(59,130,246,0.3)', color: 'var(--accent2)' }}>Pressure mats</div>
                    <div className="arch-node" style={{ borderColor: 'rgba(59,130,246,0.3)', color: 'var(--accent2)' }}>LiDAR depth sensors</div>
                  </div>
                </div>
                <div className="arch-arrow">↓</div>
                <div className="arch-layer">
                  <div className="arch-label">Edge Computing</div>
                  <div className="arch-nodes">
                    <div className="arch-node" style={{ borderColor: 'rgba(20,184,166,0.35)', color: 'var(--teal)' }}>NVIDIA Jetson nodes</div>
                    <div className="arch-node" style={{ borderColor: 'rgba(20,184,166,0.35)', color: 'var(--teal)' }}>On-device CV inference</div>
                    <div className="arch-node" style={{ borderColor: 'rgba(20,184,166,0.35)', color: 'var(--teal)' }}>Anonymized heat maps</div>
                  </div>
                </div>
                <div className="arch-arrow">↓</div>
                <div className="arch-layer">
                  <div className="arch-label">Network</div>
                  <div className="arch-nodes">
                    <div className="arch-node" style={{ borderColor: 'rgba(245,158,11,0.3)', color: 'var(--amber)' }}>Private 5G backbone</div>
                    <div className="arch-node" style={{ borderColor: 'rgba(245,158,11,0.3)', color: 'var(--amber)' }}>Wi-Fi 6E failover</div>
                  </div>
                </div>
                <div className="arch-arrow">↓</div>
                <div className="arch-layer">
                  <div className="arch-label">Cloud / Backend</div>
                  <div className="arch-nodes">
                    <div className="arch-node" style={{ borderColor: 'rgba(168,85,247,0.3)', color: '#c084fc' }}>Kubernetes on AWS</div>
                    <div className="arch-node" style={{ borderColor: 'rgba(168,85,247,0.3)', color: '#c084fc' }}>Redis real-time cache</div>
                    <div className="arch-node" style={{ borderColor: 'rgba(168,85,247,0.3)', color: '#c084fc' }}>AI prediction engine</div>
                    <div className="arch-node" style={{ borderColor: 'rgba(168,85,247,0.3)', color: '#c084fc' }}>Digital twin renderer</div>
                  </div>
                </div>
                <div className="arch-arrow">↓</div>
                <div className="arch-layer">
                  <div className="arch-label">Client Layer</div>
                  <div className="arch-nodes">
                    <div className="arch-node" style={{ borderColor: 'rgba(34,197,94,0.3)', color: 'var(--green)' }}>FlowState Web Dashboard</div>
                    <div className="arch-node" style={{ borderColor: 'rgba(34,197,94,0.3)', color: 'var(--green)' }}>React Native fan app</div>
                    <div className="arch-node" style={{ borderColor: 'rgba(34,197,94,0.3)', color: 'var(--green)' }}>ARCore / ARKit</div>
                    <div className="arch-node" style={{ borderColor: 'rgba(34,197,94,0.3)', color: 'var(--green)' }}>PA system integration</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`page ${activePage === 'fan' ? 'active' : ''}`}>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>
               <div className="phone-frame">
                 <div className="phone-status">
                   <span>9:41</span><span>●●●●</span>
                 </div>
                 <div className="phone-content">
                   <div className="app-header">
                     <div className="app-title">FlowState</div>
                     <div className="coin-chip">★ {state?.flowcoins.totalIssued || 0}</div>
                   </div>
                   <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: '12px' }}>Seat 47B · North Upper · Riverside Arena</div>
                   <div className="ar-card">
                     <div className="ar-title">AR Navigation — Reroute suggested</div>
                     <div className="ar-sub">Gate D is congested. Take Gate C to save ~9 min and earn 20 FlowCoins.</div>
                     <button className="ar-nav-btn" onClick={() => alert('AR navigation activated — follow the blue arrows')}>Start AR navigation → Gate C</button>
                   </div>
                   <div className="panel-title" style={{ marginBottom: '10px' }}>Concession wait times</div>
                   {state?.concessions.slice(0, 3).map((c, i) => (
                      <div className="concession-item" key={i}>
                        <div>
                          <div className="con-name">{c.name} — {c.type}</div>
                          <div className="con-loc">{c.zone} concourse</div>
                        </div>
                        <span className={`wait-badge ${c.waitMinutes <= 4 ? 'w-low' : c.waitMinutes <= 7 ? 'w-med' : 'w-high'}`}>{c.waitMinutes} min</span>
                      </div>
                   ))}
                   
                   {state?.concessions.find(c => c.discount > 0) && (() => {
                     const c = state.concessions.find(c => c.discount > 0);
                     return (
                      <div className="deal-banner">
                        <div className="deal-title">{c.discount}% off at {c.name}</div>
                        <div className="deal-sub">Dynamic pricing · Low-density zone incentive</div>
                      </div>
                     )
                   })()}
                 </div>
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 <div className="panel">
                   <div className="panel-title">FlowCoins economy</div>
                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                     <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '12px' }}>
                       <div className="metric-label">Total issued today</div>
                       <div className="metric-val info" style={{ fontSize: '22px' }}>{state?.flowcoins.totalIssued.toLocaleString()}</div>
                     </div>
                     <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '12px' }}>
                       <div className="metric-label">Active users</div>
                       <div className="metric-val" style={{ fontSize: '22px' }}>{state?.metrics.activeAppUsers.toLocaleString()}</div>
                     </div>
                     <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '12px' }}>
                       <div className="metric-label">Reroutes followed</div>
                       <div className="metric-val up" style={{ fontSize: '22px' }}>{state?.flowcoins.reroutes_followed.toLocaleString()}</div>
                     </div>
                     <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '12px' }}>
                       <div className="metric-label">Redemptions</div>
                       <div className="metric-val warn" style={{ fontSize: '22px' }}>{state?.flowcoins.redemptions.toLocaleString()}</div>
                     </div>
                   </div>
                 </div>
                 <div className="panel">
                   <div className="panel-title">Gamification achievements</div>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: 'var(--bg3)', borderRadius: '7px' }}>
                       <div style={{ fontSize: '18px' }}>🏃</div>
                       <div>
                         <div style={{ fontSize: '12px', fontWeight: 500 }}>Flow Master</div>
                         <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Follow 5 reroute suggestions · 127 unlocked</div>
                       </div>
                     </div>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: 'var(--bg3)', borderRadius: '7px' }}>
                       <div style={{ fontSize: '18px' }}>🌿</div>
                       <div>
                         <div style={{ fontSize: '12px', fontWeight: 500 }}>Green Mover</div>
                         <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Visit 3 low-density zones · 84 unlocked</div>
                       </div>
                     </div>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: 'var(--bg3)', borderRadius: '7px' }}>
                       <div style={{ fontSize: '18px' }}>⚡</div>
                       <div>
                         <div style={{ fontSize: '12px', fontWeight: 500 }}>Early Exit</div>
                         <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Leave before 85% rush · 41 unlocked</div>
                       </div>
                     </div>
                   </div>
                 </div>
               </div>
             </div>
          </div>

          <div className={`page ${activePage === 'journey' ? 'active' : ''}`}>
             <div className="journey-grid">
               <div className="journey-card">
                 <div className="journey-num">1</div>
                 <div className="journey-title">Pre-arrival</div>
                 <div className="journey-desc">App predicts optimal entry gate using live traffic, parking sensor data and forecast crowd density.</div>
                 <div className="journey-tech"><span className="tech-pill">GPS</span><span className="tech-pill">Traffic API</span><span className="tech-pill">Push alerts</span></div>
               </div>
               <div className="journey-card">
                 <div className="journey-num">2</div>
                 <div className="journey-title">Entry & scan</div>
                 <div className="journey-desc">QR or RFID ticket scan links the fan session. Optional facial recognition fast-lane for enrolled users.</div>
                 <div className="journey-tech"><span className="tech-pill">RFID</span><span className="tech-pill">QR scan</span><span className="tech-pill">Opt-in FaceID</span></div>
               </div>
               <div className="journey-card">
                 <div className="journey-num">3</div>
                 <div className="journey-title">AR wayfinding</div>
                 <div className="journey-desc">Phone camera renders directional AR overlays, routing attendees via the least congested corridor.</div>
                 <div className="journey-tech"><span className="tech-pill">ARCore</span><span className="tech-pill">ARKit</span><span className="tech-pill">BLE positioning</span></div>
               </div>
               <div className="journey-card">
                 <div className="journey-num">4</div>
                 <div className="journey-title">In-event UX</div>
                 <div className="journey-desc">Real-time concession wait times, restroom queues, order-ahead, and dynamic discount nudges.</div>
                 <div className="journey-tech"><span className="tech-pill">IoT sensors</span><span className="tech-pill">POS API</span><span className="tech-pill">Redis streams</span></div>
               </div>
               <div className="journey-card">
                 <div className="journey-num">5</div>
                 <div className="journey-title">Gamification</div>
                 <div className="journey-desc">FlowCoins earned for following reroutes, off-peak concession visits, and low-density zone exploration.</div>
                 <div className="journey-tech"><span className="tech-pill">FlowCoins ledger</span><span className="tech-pill">Leaderboard</span><span className="tech-pill">Merch API</span></div>
               </div>
               <div className="journey-card">
                 <div className="journey-num">6</div>
                 <div className="journey-title">Post-match exit</div>
                 <div className="journey-desc">Digital twin predicts crowd surge 5 min ahead. Gradient lighting + AR guide staggered departure waves.</div>
                 <div className="journey-tech"><span className="tech-pill">Predictive AI</span><span className="tech-pill">PA sync</span><span className="tech-pill">Transit API</span></div>
               </div>
             </div>
          </div>

          <div className={`page ${activePage === 'privacy' ? 'active' : ''}`}>
             <div className="privacy-grid">
               <div className="privacy-card">
                 <div className="priv-icon" style={{ background: 'rgba(59,130,246,0.1)' }}>
                   <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                     <path d="M10 2L3 5.5v5c0 4 3 7.5 7 8.7C17 18 20 14.5 20 10.5v-5L10 2Z" stroke="#3b82f6" strokeWidth="1.5" />
                     <path d="M7 10l2.3 2.3L13 8" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                   </svg>
                 </div>
                 <div className="priv-title">Biometric data handling</div>
                 <div className="priv-desc">Facial recognition is strictly opt-in. All biometric processing happens on edge nodes — raw images never leave the device boundary. Analytics use anonymized crowd vectors only.</div>
                 <div className="priv-badge" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent2)' }}>On-device processing</div>
               </div>
               <div className="privacy-card">
                 <div className="priv-icon" style={{ background: 'rgba(34,197,94,0.1)' }}>
                   <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                     <rect x="3" y="8" width="14" height="10" rx="2" stroke="#22c55e" strokeWidth="1.5" />
                     <path d="M7 8V6a3 3 0 0 1 6 0v2" stroke="#22c55e" strokeWidth="1.5" />
                   </svg>
                 </div>
                 <div className="priv-title">Regulatory compliance</div>
                 <div className="priv-desc">Full GDPR and India DPDP Act compliance. Attendees are shown a clear one-screen consent flow at app launch. Data is deleted within 24 hours of event close.</div>
                 <div className="priv-badge" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)' }}>GDPR · DPDP compliant</div>
               </div>
               <div className="privacy-card">
                 <div className="priv-icon" style={{ background: 'rgba(239,68,68,0.1)' }}>
                   <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                     <circle cx="10" cy="10" r="7.5" stroke="#ef4444" strokeWidth="1.5" />
                     <path d="M10 6v4M10 13.5v.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
                   </svg>
                 </div>
                 <div className="priv-title">Emergency protocol</div>
                 <div className="priv-desc">In a declared emergency, FlowState overrides normal routing. AR evacuation paths are pushed to all active devices. Digital twin identifies lowest-density exit corridors in real time.</div>
                 <div className="priv-badge" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>Auto-override ready</div>
               </div>
               <div className="privacy-card">
                 <div className="priv-icon" style={{ background: 'rgba(245,158,11,0.1)' }}>
                   <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                     <circle cx="10" cy="10" r="7.5" stroke="#f59e0b" strokeWidth="1.5" />
                     <path d="M7 10h6M10 7v6" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
                   </svg>
                 </div>
                 <div className="priv-title">Accessibility</div>
                 <div className="priv-desc">Voice navigation mode, haptic reroute alerts, high-contrast UI, wheelchair-optimised routing with real-time elevator status. Complies with WCAG 2.1 AA and Indian Rights of PWD Act.</div>
                 <div className="priv-badge" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)' }}>WCAG 2.1 AA · RPwD Act</div>
               </div>
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}
