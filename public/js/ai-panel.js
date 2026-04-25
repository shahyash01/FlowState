/**
 * ai-panel.js — FlowState Intelligence Panel
 *
 * Adds the AI Intelligence Panel to the existing ops dashboard.
 * Works alongside the existing dashboard.js — both listen to the same
 * Socket.IO feed. This file handles the NEW intelligence data:
 *   - Situation narrative (narrative:update event)
 *   - Zone forecast trend indicators
 *   - Anomaly badges
 *   - Ops assistant chat interface
 *   - Recommendations panel
 *
 * Include in dashboard.html AFTER dashboard.js:
 *   <script src="/js/ai-panel.js"></script>
 *
 * Requires the AI panel HTML to be injected (see dashboard.html patch below).
 */

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  let latestState = null;
  let chatHistory = []; // { role: 'user'|'assistant', text: string, time: string }
  let isPanelOpen = false;
  let isQuerying  = false;

  // ─── DOM refs (resolved after DOMContentLoaded) ───────────────────────────
  let elNarrativeText, elNarrativeTone, elNarrativeTime,
      elRecommendationsList, elAnomalyBadge, elChatMessages,
      elChatInput, elChatSendBtn, elPanelToggle, elAiPanel,
      elForecastContainer;

  // ─── Tone → CSS class map ─────────────────────────────────────────────────
  const TONE_CLASS = {
    normal:   'narrative--normal',
    alert:    'narrative--alert',
    critical: 'narrative--critical',
  };

  // ─── Trend icon ──────────────────────────────────────────────────────────
  function trendIcon(trend, alertLevel) {
    if (alertLevel === 'critical') return '<span class="trend-icon trend--critical">▲▲</span>';
    if (alertLevel === 'warning')  return '<span class="trend-icon trend--warning">▲</span>';
    if (trend === 'rising')        return '<span class="trend-icon trend--rising">↑</span>';
    if (trend === 'falling')       return '<span class="trend-icon trend--falling">↓</span>';
    return '<span class="trend-icon trend--stable">→</span>';
  }

  // ─── Render narrative ─────────────────────────────────────────────────────
  function renderNarrative(narrative) {
    if (!elNarrativeText) return;

    // Remove old tone class
    Object.values(TONE_CLASS).forEach(c => elNarrativeText.classList.remove(c));
    elNarrativeText.classList.add(TONE_CLASS[narrative.tone] || TONE_CLASS.normal);

    // Animate text swap
    elNarrativeText.style.opacity = '0';
    setTimeout(() => {
      elNarrativeText.textContent = narrative.text;
      elNarrativeText.style.opacity = '1';
    }, 200);

    if (elNarrativeTone) {
      elNarrativeTone.textContent = narrative.tone.toUpperCase();
      elNarrativeTone.className = `narrative-tone tone--${narrative.tone}`;
    }

    if (elNarrativeTime) {
      const d = new Date(narrative.generatedAt);
      elNarrativeTime.textContent = `Updated ${d.toLocaleTimeString()}`;
    }
  }

  // ─── Render forecast overlays on zone bars ────────────────────────────────
  function renderForecastOverlays(intelligence) {
    if (!intelligence?.zones) return;

    intelligence.zones.forEach(forecast => {
      // Find zone bar element in the existing dashboard
      const zoneBar = document.querySelector(`[data-zone-id="${forecast.zoneId}"]`);
      if (!zoneBar) return;

      // Inject or update forecast badge
      let badge = zoneBar.querySelector('.forecast-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'forecast-badge';
        zoneBar.appendChild(badge);
      }

      badge.innerHTML = `${trendIcon(forecast.trend, forecast.alertLevel)} ${forecast.velocityPerMin > 0 ? '+' : ''}${forecast.velocityPerMin || 0}/min`;
      badge.title = forecast.message;
      badge.dataset.alertLevel = forecast.alertLevel;
    });
  }

  // ─── Render anomaly badge on header ──────────────────────────────────────
  function renderAnomalyBadge(anomalies) {
    if (!elAnomalyBadge) return;

    const critical = anomalies?.anomalies?.filter(a => a.severity === 'critical').length || 0;
    const warnings = anomalies?.anomalies?.filter(a => a.severity === 'warning').length || 0;
    const total = critical + warnings;

    if (total === 0) {
      elAnomalyBadge.style.display = 'none';
      return;
    }

    elAnomalyBadge.style.display = 'inline-flex';
    elAnomalyBadge.textContent = total;
    elAnomalyBadge.className = `anomaly-badge ${critical > 0 ? 'badge--critical' : 'badge--warning'}`;
    elAnomalyBadge.title = anomalies.summary;
  }

  // ─── Load and render recommendations ─────────────────────────────────────
  async function loadRecommendations() {
    if (!elRecommendationsList) return;

    elRecommendationsList.innerHTML = '<li class="rec-loading">Loading recommendations…</li>';

    try {
      const res = await fetch('/api/ai/recommendations');
      const json = await res.json();

      if (!json.ok || !json.data?.recommendations?.length) {
        elRecommendationsList.innerHTML = '<li class="rec-empty">No active recommendations.</li>';
        return;
      }

      const items = json.data.recommendations;
      elRecommendationsList.innerHTML = items.map(rec => `
        <li class="rec-item rec-priority-${rec.priority}" data-zone="${rec.zone || ''}">
          <span class="rec-priority-dot"></span>
          <div class="rec-content">
            <span class="rec-action">${escapeHtml(rec.action)}</span>
            <span class="rec-reason">${escapeHtml(rec.reason)}</span>
          </div>
        </li>
      `).join('');
    } catch (err) {
      elRecommendationsList.innerHTML = '<li class="rec-error">Failed to load recommendations.</li>';
      console.error('[ai-panel] recommendations error:', err);
    }
  }

  // ─── Chat interface ───────────────────────────────────────────────────────
  function appendChatMessage(role, text, time) {
    if (!elChatMessages) return;

    const msg = document.createElement('div');
    msg.className = `chat-msg chat-msg--${role}`;
    msg.innerHTML = `
      <div class="chat-bubble">${escapeHtml(text)}</div>
      <span class="chat-time">${time}</span>
    `;

    elChatMessages.appendChild(msg);
    elChatMessages.scrollTop = elChatMessages.scrollHeight;
  }

  async function sendChatQuery() {
    if (isQuerying) return;

    const question = elChatInput?.value?.trim();
    if (!question) return;

    isQuerying = true;
    elChatInput.value = '';
    elChatSendBtn.disabled = true;
    elChatSendBtn.textContent = '…';

    const now = new Date().toLocaleTimeString();
    appendChatMessage('user', question, now);

    // Typing indicator
    const typingEl = document.createElement('div');
    typingEl.className = 'chat-msg chat-msg--assistant chat-typing';
    typingEl.innerHTML = '<div class="chat-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
    elChatMessages.appendChild(typingEl);
    elChatMessages.scrollTop = elChatMessages.scrollHeight;

    try {
      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const json = await res.json();

      elChatMessages.removeChild(typingEl);
      appendChatMessage('assistant', json.data?.answer || 'No response.', new Date().toLocaleTimeString());
    } catch (err) {
      elChatMessages.removeChild(typingEl);
      appendChatMessage('assistant', 'Error contacting intelligence advisor.', new Date().toLocaleTimeString());
    } finally {
      isQuerying = false;
      elChatSendBtn.disabled = false;
      elChatSendBtn.textContent = 'Ask';
    }
  }

  // ─── Socket.IO listeners ──────────────────────────────────────────────────
  function attachSocketListeners(socket) {
    // Main state update — extract intelligence + anomaly data
    socket.on('state', (state) => {
      latestState = state;

      if (state.intelligence) {
        renderForecastOverlays(state.intelligence);
      }
      if (state.anomalies) {
        renderAnomalyBadge(state.anomalies);
      }
    });

    // Narrative updates (30s cadence from narrator.js)
    socket.on('narrative:update', (narrative) => {
      renderNarrative(narrative);
    });

    // Real-time Q&A push (other operators' questions appear too)
    socket.on('ai:qa', (qa) => {
      // Only show if the chat panel is open
      if (isPanelOpen && elChatMessages) {
        appendChatMessage('user', qa.question, new Date(qa.askedAt).toLocaleTimeString());
        appendChatMessage('assistant', qa.answer, new Date().toLocaleTimeString());
      }
    });
  }

  // ─── Panel toggle ─────────────────────────────────────────────────────────
  function togglePanel() {
    isPanelOpen = !isPanelOpen;
    elAiPanel?.classList.toggle('panel--open', isPanelOpen);
    elPanelToggle?.setAttribute('aria-expanded', isPanelOpen);

    if (isPanelOpen) {
      loadRecommendations(); // refresh recommendations when panel opens
    }
  }

  // ─── Quick-question chips ─────────────────────────────────────────────────
  const QUICK_QUESTIONS = [
    'Which zone needs action most urgently?',
    'What should I do about concession wait times?',
    'Are there any cascade risks right now?',
    'What\'s the safest gate to reroute Gate D to?',
  ];

  function buildQuickChips() {
    const container = document.getElementById('ai-quick-chips');
    if (!container) return;

    container.innerHTML = QUICK_QUESTIONS.map(q => `
      <button class="quick-chip" aria-label="Ask: ${q}">${q}</button>
    `).join('');

    container.querySelectorAll('.quick-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        if (elChatInput) {
          elChatInput.value = btn.textContent;
          sendChatQuery();
        }
      });
    });
  }

  // ─── HTML injection (creates the panel DOM if not already in template) ────
  function injectPanelHTML() {
    if (document.getElementById('ai-intelligence-panel')) return; // already in template

    const panel = document.createElement('div');
    panel.id = 'ai-intelligence-panel';
    panel.className = 'ai-panel';
    panel.setAttribute('aria-label', 'AI Intelligence Panel');
    panel.innerHTML = `
      <div class="ai-panel__header">
        <div class="ai-panel__title">
          <span class="ai-panel__icon" aria-hidden="true">◈</span>
          Intelligence
          <span id="ai-anomaly-badge" class="anomaly-badge" style="display:none">0</span>
        </div>
        <button id="ai-panel-toggle" class="ai-panel__toggle" aria-label="Toggle Intelligence Panel" aria-expanded="false">
          <span>▲</span>
        </button>
      </div>

      <div class="ai-panel__body">
        <!-- Situation Narrative -->
        <section class="ai-section" aria-label="AI Situation Report">
          <div class="ai-section__label">
            SITREP <span id="ai-narrative-tone" class="narrative-tone tone--normal">NORMAL</span>
            <span id="ai-narrative-time" class="narrative-time"></span>
          </div>
          <p id="ai-narrative-text" class="narrative-text narrative--normal">
            Initialising intelligence engine…
          </p>
        </section>

        <!-- Recommendations -->
        <section class="ai-section" aria-label="AI Recommendations">
          <div class="ai-section__label">RECOMMENDED ACTIONS</div>
          <ul id="ai-recommendations-list" class="rec-list"></ul>
          <button class="rec-refresh-btn" id="ai-recs-refresh" aria-label="Refresh recommendations">↺ Refresh</button>
        </section>

        <!-- Ops Chat -->
        <section class="ai-section ai-section--chat" aria-label="Ops AI Assistant">
          <div class="ai-section__label">OPS ASSISTANT</div>
          <div id="ai-chat-messages" class="chat-messages" role="log" aria-live="polite"></div>
          <div id="ai-quick-chips" class="quick-chips"></div>
          <div class="chat-input-row">
            <input
              type="text"
              id="ai-chat-input"
              class="chat-input"
              placeholder="Ask about any zone, gate, or trend…"
              maxlength="500"
              aria-label="Ask the ops intelligence advisor"
            />
            <button id="ai-chat-send" class="chat-send-btn" aria-label="Send question">Ask</button>
          </div>
        </section>
      </div>
    `;

    // Insert before closing body or append to dashboard main
    const main = document.querySelector('.dashboard-main') || document.querySelector('main') || document.body;
    main.appendChild(panel);
  }

  // ─── CSS injection ────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* ── AI Panel ── */
      .ai-panel {
        position: fixed; bottom: 0; right: 24px; width: 360px; z-index: 200;
        background: #11141a; border: 1px solid rgba(255,255,255,0.09);
        border-bottom: none; border-radius: 12px 12px 0 0;
        box-shadow: 0 -8px 40px rgba(0,0,0,0.5);
        transition: transform 0.3s ease; transform: translateY(calc(100% - 52px));
        font-family: 'DM Sans', sans-serif; color: #f0f2f5;
      }
      .ai-panel.panel--open { transform: translateY(0); }
      .ai-panel__header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 16px; cursor: pointer; user-select: none;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .ai-panel__title {
        display: flex; align-items: center; gap: 8px;
        font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
        color: #8a90a0;
      }
      .ai-panel__icon { color: #3b82f6; font-size: 16px; }
      .ai-panel__toggle {
        background: none; border: none; color: #8a90a0; cursor: pointer;
        font-size: 12px; padding: 4px; transition: transform 0.3s;
      }
      .panel--open .ai-panel__toggle span { display: inline-block; transform: rotate(180deg); }
      .ai-panel__body { max-height: 520px; overflow-y: auto; padding: 4px 0 16px; }

      /* ── AI Sections ── */
      .ai-section { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); }
      .ai-section:last-child { border-bottom: none; }
      .ai-section__label {
        font-size: 10px; font-weight: 600; letter-spacing: 0.12em;
        text-transform: uppercase; color: #8a90a0; margin-bottom: 8px;
        display: flex; align-items: center; gap: 8px;
      }

      /* ── Narrative ── */
      .narrative-text {
        font-size: 13px; line-height: 1.65; color: #c8cbd4;
        transition: opacity 0.2s ease; margin: 0;
      }
      .narrative--alert   { border-left: 2px solid #f59e0b; padding-left: 10px; }
      .narrative--critical{ border-left: 2px solid #ef4444; padding-left: 10px; color: #fca5a5; }
      .narrative-tone { font-size: 9px; padding: 1px 6px; border-radius: 4px; }
      .tone--normal   { background: rgba(34,197,94,0.15);  color: #22c55e; }
      .tone--alert    { background: rgba(245,158,11,0.15); color: #f59e0b; }
      .tone--critical { background: rgba(239,68,68,0.15);  color: #ef4444; }
      .narrative-time { font-size: 9px; color: #8a90a0; margin-left: auto; }

      /* ── Anomaly badge ── */
      .anomaly-badge {
        display: inline-flex; align-items: center; justify-content: center;
        width: 18px; height: 18px; border-radius: 50%; font-size: 10px; font-weight: 700;
      }
      .badge--critical { background: #ef4444; color: #fff; }
      .badge--warning  { background: #f59e0b; color: #000; }

      /* ── Recommendations ── */
      .rec-list { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
      .rec-item {
        display: flex; align-items: flex-start; gap: 10px;
        background: rgba(255,255,255,0.03); border-radius: 8px; padding: 8px 10px;
        border-left: 3px solid transparent;
      }
      .rec-priority-1 { border-left-color: #ef4444; }
      .rec-priority-2 { border-left-color: #f59e0b; }
      .rec-priority-3 { border-left-color: #3b82f6; }
      .rec-priority-dot {
        width: 6px; height: 6px; border-radius: 50%; margin-top: 5px; flex-shrink: 0;
        background: currentColor;
      }
      .rec-priority-1 .rec-priority-dot { color: #ef4444; }
      .rec-priority-2 .rec-priority-dot { color: #f59e0b; }
      .rec-priority-3 .rec-priority-dot { color: #3b82f6; }
      .rec-content { display: flex; flex-direction: column; gap: 2px; }
      .rec-action { font-size: 12px; font-weight: 600; color: #f0f2f5; }
      .rec-reason { font-size: 11px; color: #8a90a0; line-height: 1.4; }
      .rec-loading, .rec-empty, .rec-error { font-size: 12px; color: #8a90a0; padding: 4px 0; list-style: none; }
      .rec-refresh-btn {
        font-size: 11px; color: #3b82f6; background: none; border: none; cursor: pointer;
        padding: 0; text-decoration: underline;
      }

      /* ── Chat ── */
      .chat-messages {
        max-height: 200px; overflow-y: auto; display: flex; flex-direction: column;
        gap: 8px; margin-bottom: 10px;
      }
      .chat-msg { display: flex; flex-direction: column; gap: 2px; }
      .chat-msg--user  { align-items: flex-end; }
      .chat-msg--assistant { align-items: flex-start; }
      .chat-bubble {
        max-width: 88%; font-size: 12px; line-height: 1.5; padding: 8px 10px; border-radius: 10px;
      }
      .chat-msg--user .chat-bubble     { background: #1e40af; color: #fff; border-radius: 10px 10px 2px 10px; }
      .chat-msg--assistant .chat-bubble{ background: rgba(255,255,255,0.06); color: #c8cbd4; border-radius: 10px 10px 10px 2px; }
      .chat-time { font-size: 10px; color: #8a90a0; }
      .chat-typing .chat-bubble { display: flex; gap: 4px; align-items: center; }
      .typing-dot {
        width: 5px; height: 5px; border-radius: 50%; background: #8a90a0;
        animation: typingBounce 1.2s infinite ease-in-out;
      }
      .typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typingBounce {
        0%, 100% { transform: translateY(0); opacity: 0.4; }
        50%       { transform: translateY(-4px); opacity: 1; }
      }
      .quick-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
      .quick-chip {
        font-size: 10px; padding: 4px 8px; border-radius: 20px; cursor: pointer;
        background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3);
        color: #93c5fd; white-space: nowrap; transition: background 0.15s;
      }
      .quick-chip:hover { background: rgba(59,130,246,0.2); }
      .chat-input-row { display: flex; gap: 8px; }
      .chat-input {
        flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px; padding: 8px 12px; font-size: 12px; color: #f0f2f5;
        outline: none;
      }
      .chat-input:focus { border-color: rgba(59,130,246,0.5); }
      .chat-input::placeholder { color: #8a90a0; }
      .chat-send-btn {
        background: #3b82f6; color: #fff; border: none; border-radius: 8px;
        padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer;
        transition: background 0.15s;
      }
      .chat-send-btn:hover { background: #2563eb; }
      .chat-send-btn:disabled { background: #374151; cursor: not-allowed; }

      /* ── Forecast badges on zone bars ── */
      .forecast-badge {
        display: inline-flex; align-items: center; gap: 3px;
        font-size: 10px; font-family: 'Space Mono', monospace;
        margin-left: 8px; opacity: 0.8;
      }
      .trend-icon { font-size: 10px; }
      .trend--critical { color: #ef4444; }
      .trend--warning  { color: #f59e0b; }
      .trend--rising   { color: #fb923c; }
      .trend--falling  { color: #22c55e; }
      .trend--stable   { color: #8a90a0; }
    `;
    document.head.appendChild(style);
  }

  // ─── Utility ──────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    injectPanelHTML();

    // Resolve DOM refs
    elNarrativeText      = document.getElementById('ai-narrative-text');
    elNarrativeTone      = document.getElementById('ai-narrative-tone');
    elNarrativeTime      = document.getElementById('ai-narrative-time');
    elRecommendationsList= document.getElementById('ai-recommendations-list');
    elAnomalyBadge       = document.getElementById('ai-anomaly-badge');
    elChatMessages       = document.getElementById('ai-chat-messages');
    elChatInput          = document.getElementById('ai-chat-input');
    elChatSendBtn        = document.getElementById('ai-chat-send');
    elPanelToggle        = document.getElementById('ai-panel-toggle');
    elAiPanel            = document.getElementById('ai-intelligence-panel');

    // Toggle on header click
    const header = elAiPanel?.querySelector('.ai-panel__header');
    header?.addEventListener('click', togglePanel);

    // Chat send
    elChatSendBtn?.addEventListener('click', sendChatQuery);
    elChatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) sendChatQuery();
    });

    // Recommendations refresh
    document.getElementById('ai-recs-refresh')?.addEventListener('click', loadRecommendations);

    // Build quick chips
    buildQuickChips();

    // Connect to the existing Socket.IO connection (created by dashboard.js)
    // Wait a tick to ensure dashboard.js has already initialised the socket
    setTimeout(() => {
      const socket = window._flowstateSocket || window.io?.();
      if (socket) {
        attachSocketListeners(socket);
      } else {
        console.warn('[ai-panel] Could not find Socket.IO instance. Ensure dashboard.js exposes window._flowstateSocket.');
      }
    }, 100);

    // Hydrate with current AI summary on load
    fetch('/api/ai/summary')
      .then(r => r.json())
      .then(json => {
        if (json.ok) {
          if (json.data.narrative) renderNarrative(json.data.narrative);
          if (json.data.anomalies) renderAnomalyBadge(json.data.anomalies);
        }
      })
      .catch(err => console.warn('[ai-panel] Initial hydration failed:', err));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
