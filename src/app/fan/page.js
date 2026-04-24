'use client';

import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export default function FanApp() {
  const [state, setState] = useState(null);

  useEffect(() => {
    // Add specific body styling for fan app (centered, mobile width)
    document.body.style.display = 'flex';
    document.body.style.justifyContent = 'center';
    document.body.style.alignItems = 'center';
    document.body.style.background = '#0a0c0f';

    const socket = io();
    socket.on('state', (newState) => {
      setState(newState);
    });

    return () => {
      document.body.style = '';
      socket.disconnect();
    };
  }, []);

  if (!state) return <div style={{ color: 'white', padding: '20px' }}>Loading...</div>;

  return (
    <div style={{ width: '100%', maxWidth: '390px', minHeight: '100vh', background: 'var(--bg3)', padding: '20px', display: 'flex', flexDirection: 'column' }}>
      <div className="app-header">
        <div className="app-title" style={{ fontSize: '20px' }}>FlowState</div>
        <div className="coin-chip" style={{ padding: '6px 12px', fontSize: '14px' }}>★ {state.flowcoins.totalIssued.toLocaleString()}</div>
      </div>
      
      <div style={{ fontSize: '13px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: '20px' }}>
        Seat 47B · North Upper · Riverside Arena
      </div>
      
      <div className="ar-card" style={{ marginBottom: '24px', padding: '16px' }}>
        <div className="ar-title" style={{ fontSize: '14px' }}>AR Navigation — Reroute suggested</div>
        <div className="ar-sub" style={{ fontSize: '13px', marginTop: '6px' }}>
          Gate D is congested. Take Gate C to save ~9 min and earn 20 FlowCoins.
        </div>
        <button className="ar-nav-btn" style={{ padding: '12px', fontSize: '14px', marginTop: '16px' }} onClick={() => alert('AR navigation activated — follow the blue arrows')}>
          Start AR navigation → Gate C
        </button>
      </div>
      
      <div className="panel-title" style={{ marginBottom: '16px', fontSize: '14px' }}>Concession wait times</div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
        {state.concessions.map((c, i) => (
          <div className="concession-item" key={i} style={{ background: 'var(--bg2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div>
              <div className="con-name" style={{ fontSize: '14px' }}>{c.name} — {c.type}</div>
              <div className="con-loc" style={{ fontSize: '12px' }}>{c.zone} concourse</div>
              {c.discount > 0 && <div style={{ fontSize: '11px', color: 'var(--amber)', marginTop: '4px' }}>{c.discount}% discount active!</div>}
            </div>
            <span className={`wait-badge ${c.waitMinutes <= 4 ? 'w-low' : c.waitMinutes <= 7 ? 'w-med' : 'w-high'}`} style={{ fontSize: '12px', padding: '6px 10px' }}>
              {c.waitMinutes} min
            </span>
          </div>
        ))}
      </div>

      <div className="panel-title" style={{ marginBottom: '12px', fontSize: '14px' }}>My achievements</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '24px' }}>🏃</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>Flow Master</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Follow 5 reroutes · 127 unlocked</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '24px' }}>🌿</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>Green Mover</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Visit 3 low-density zones · 84 unlocked</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '24px' }}>⚡</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>Early Exit</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Leave before 85% rush · 41 unlocked</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
        <button style={{ width: '100%', padding: '14px', background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', fontWeight: 500, cursor: 'pointer' }} onClick={() => alert('Showing path to nearest exits via AR.')}>
          Emergency exits
        </button>
      </div>
    </div>
  );
}
