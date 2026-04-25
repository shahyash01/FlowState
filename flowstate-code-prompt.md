# FlowState — Code CLI Prompt
# Paste this entire prompt into Gemini CLI to build the full end-to-end project

---

Build me a complete, production-ready full-stack application called **FlowState** — a Smart Stadium Experience Platform for large-scale sporting venues. This is a real hackathon project; build it end-to-end with working code, not boilerplate.

---

## STACK

- **Backend:** Node.js + Express + Socket.IO (real-time WebSocket events)
- **Simulation layer:** A sensor data simulator that fires fake IoT events every 2 seconds (crowd density updates, concession wait times, gate alerts) — this replaces real hardware for the demo
- **Frontend:** Single HTML/CSS/JS dashboard (no React, vanilla JS) served by Express — dark theme, stadium digital twin SVG, live updating metrics
- **Fan App:** A separate `/fan` route serving a mobile-optimised companion page
- **Data store:** In-memory store (no DB needed for hackathon demo) with a simple JavaScript object holding venue state
- **API:** REST endpoints for current state + Socket.IO for live push

---

## PROJECT STRUCTURE

```
flowstate/
├── server.js              # Express + Socket.IO server
├── simulator.js           # IoT sensor event simulator
├── store.js               # In-memory venue state store
├── routes/
│   ├── api.js             # REST API routes
│   └── pages.js           # HTML page routes
├── public/
│   ├── dashboard.html     # Ops dashboard (dark theme)
│   ├── fan.html           # Fan companion app (mobile)
│   ├── css/
│   │   └── styles.css     # Shared styles
│   └── js/
│       ├── dashboard.js   # Dashboard Socket.IO client
│       └── fan.js         # Fan app Socket.IO client
├── package.json
└── README.md
```

---

## DETAILED REQUIREMENTS

### 1. store.js — Venue State
Create an in-memory store that tracks:

```js
{
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
}
```

Export getter and setter functions. Store is a plain JS object, no database.

---

### 2. simulator.js — IoT Sensor Simulator
Write a simulator that:
- Runs on a 2-second interval (setInterval)
- Randomly nudges zone occupancy by ±50-200 people per tick (within min/max bounds)
- Recalculates zone status (low <60%, medium 60-75%, high 75-90%, critical >90%)
- Updates concession wait times with small random variation (±1-2 min)
- Updates gate queue lengths
- Recalculates total occupancy from sum of zones
- Updates avgWaitMinutes as weighted average of concession wait times
- Adds system-generated alerts when thresholds are crossed:
  - Zone goes critical → alert with level:'danger'
  - Zone recovers from critical → alert with level:'success'  
  - Concession wait > 10 min → alert with level:'warning'
  - Concession wait drops below 3 min → alert with level:'info' + announce discount
- Keeps alerts array max 20 items (shift oldest)
- Increments flowCoinsIssued by ~5-15 per tick (simulating reward activity)
- Emits a 'state:update' event via an EventEmitter so server.js can push to WebSocket clients

Export: `startSimulator(eventEmitter)` function

---

### 3. server.js — Main Server
- Express server on PORT 3000 (or process.env.PORT)
- Mount Socket.IO on the same HTTP server
- `require('./simulator')` and start it, listen for 'state:update' events, broadcast the full state to all connected Socket.IO clients on the 'state' channel
- Serve static files from /public
- Mount routes from /routes/api.js and /routes/pages.js
- Log startup with venue name and URL

---

### 4. routes/api.js — REST API
```
GET  /api/state          → full current state JSON
GET  /api/zones          → zones array
GET  /api/zones/:id      → single zone
GET  /api/concessions    → concessions array
GET  /api/gates          → gates array
GET  /api/alerts         → last 20 alerts
GET  /api/metrics        → metrics object
POST /api/emergency      → sets all zone statuses to 'emergency', fires alert, broadcasts over Socket.IO
POST /api/reroute        → body: { gateId, reason } — marks gate as rerouting, fires alert
```

All endpoints return `{ ok: true, data: ... }` or `{ ok: false, error: '...' }`.

---

### 5. public/dashboard.html — Ops Dashboard
Dark theme (#0a0c0f background). Build a full-page operations dashboard with:

**Header bar:** FlowState logo, venue name, live clock (JS), "Emergency Mode" button (calls POST /api/emergency), real-time live indicator dot

**Sidebar navigation** with sections:
- Dashboard (default active)
- Live Alerts
- Architecture  
- Fan App preview
- User Journey
- Privacy & Safety

**Dashboard page content:**

1. Metric cards row (4 cards): Occupancy %, Avg Wait Time, Active Reroutes, FlowCoins Issued — all update live from Socket.IO

2. Two-column layout:
   - Left: Stadium SVG digital twin (hardcoded SVG layout, zones colored by status: green=low, yellow=high, red=critical). Zones should pulse/animate when critical. Hovering a zone shows a tooltip with name, %, wait time.
   - Right: Zone capacity bar chart + live alerts feed (last 5)

3. Concessions grid: 5 cards showing each stand name, wait time badge (color-coded), discount badge if active

**All metric cards and zone data must update in real-time via Socket.IO** — connect to `io()`, listen on 'state' event, update DOM.

**Other pages** (Architecture, Journey, Privacy) can be static HTML tabs within the same page, shown/hidden via JS tab navigation. See the content described in the project overview for what each page should contain.

---

### 6. public/fan.html — Fan Companion App
Mobile-optimised page (max-width: 390px, centered). Dark theme. Simulates the phone UI:

- Header: FlowState logo + FlowCoins badge (live updating)
- AR Navigation card: shows current reroute suggestion (pulled from state — if Gate D congested, suggest Gate C), button "Start AR navigation" (shows alert: "AR navigation activated — follow the blue arrows")
- Concessions section: live wait times for all 5 stands, color-coded badges, discount banners for stands with discount > 0
- My achievements section: 3 hardcoded achievement badges (Flow Master, Green Mover, Early Exit) with unlock counts
- Footer: "Emergency exits" button that shows nearest exits

Fan page connects to Socket.IO and updates concession wait times and FlowCoin count in real-time.

---

### 7. package.json
```json
{
  "name": "flowstate",
  "version": "1.0.0",
  "description": "Smart Stadium Experience Platform — FlowState Hackathon Demo",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

---

### 8. README.md
Write a concise README with:
- Project overview (2 sentences)
- Setup: `npm install && npm start`
- Routes: list all pages and API endpoints
- Architecture diagram (ASCII)
- How the simulator works
- How to demo it at a hackathon (talking points)

---

## VISUAL & UX REQUIREMENTS

**Dashboard color scheme:**
```css
--bg: #0a0c0f;
--bg2: #11141a;
--bg3: #181c24;
--border: rgba(255,255,255,0.07);
--text: #f0f2f5;
--text2: #8a90a0;
--accent: #3b82f6;
--green: #22c55e;
--amber: #f59e0b;
--red: #ef4444;
--teal: #14b8a6;
```

**Typography:** `DM Sans` for body (from Google Fonts), `Space Mono` for numbers/code/timestamps.

**Animations:**
- Critical zones pulse (CSS keyframe animation on fill opacity)
- New alerts slide in from the right
- Metric cards update with a brief flash (background briefly goes to rgba(59,130,246,0.1) then fades)
- Live indicator dot blinks

**Accessibility:** All interactive elements have aria-labels. Color is never the only indicator (add text labels for status).

---

## CODE QUALITY REQUIREMENTS

- No TypeScript — plain modern JavaScript (ES2022, use const/let, async/await)
- No React, no Webpack, no build step — runs with `node server.js` only
- Socket.IO CDN in HTML: `<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>`
- Google Fonts loaded in HTML head
- All JS in separate files (dashboard.js, fan.js) — not inline in HTML
- Comments on all major functions
- Error handling with try/catch on all async operations
- The simulator should be deterministic enough that the demo always looks good (no negative values, no impossible states)

---

## WHAT TO BUILD FIRST (order matters)

1. `package.json` + `npm install`
2. `store.js` — the data foundation
3. `simulator.js` — the engine that makes everything feel live
4. `server.js` — wire it together
5. `routes/api.js` — REST endpoints
6. `public/css/styles.css` — full dark theme stylesheet
7. `public/dashboard.html` + `public/js/dashboard.js` — main ops view
8. `public/fan.html` + `public/js/fan.js` — mobile fan companion
9. `README.md`

After building, run `node server.js` and verify:
- Dashboard loads at http://localhost:3000
- Fan app loads at http://localhost:3000/fan  
- Metrics update every 2 seconds automatically
- GET /api/state returns full JSON
- POST /api/emergency triggers alerts and visual changes

---

## HACKATHON DEMO TALKING POINTS TO ENCODE IN README

1. "All sensor data is simulated — in production, replace simulator.js events with real BLE/RFID webhook callbacks"
2. "Socket.IO makes this real-time without polling — same architecture scales to 60,000 concurrent connections with Redis adapter"
3. "FlowCoins incentive layer is the key behavioral innovation — it makes attendees active participants in crowd management"
4. "The fan app AR navigation button simulates what would be a native ARCore/ARKit experience in the shipped product"
5. "The digital twin SVG updates live — in production this connects to a 3D venue model"

---

Build the complete project now. Write all files. After finishing, show me the directory tree and run the server to confirm it starts without errors.
