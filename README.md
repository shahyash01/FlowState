# FlowState — Smart Stadium Experience Platform

FlowState is a real-time, event-driven platform for managing large-scale sporting venues, complete with a digital twin ops dashboard and a mobile-optimized AR companion app for fans. Built for the modern connected stadium, it merges IoT telemetry with gamified crowd management to eliminate bottlenecks and optimize revenue.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your GEMINI_API_KEY
npm start
```

## Security & Deployment

### Environment Variables
This project uses environment variables for sensitive data. **Never commit `.env` files to version control.**

Required variables:
- `GEMINI_API_KEY`: Your Google AI Studio API key.
- `JWT_SECRET`: A secure string for signing JSON Web Tokens.

### Firebase Deployment
When deploying to Firebase (via Cloud Functions or App Hosting), you must set these secrets securely using the Google Cloud Secret Manager.

#### Setting Secrets via Firebase CLI:
```bash
# Set Gemini API Key
firebase functions:secrets:set GEMINI_API_KEY

# Set JWT Secret
firebase functions:secrets:set JWT_SECRET
```

For **Firebase App Hosting**, you can configure secrets in the Firebase Console under the App Hosting settings or via your `apphosting.yaml` (if used).

## Routes

### Pages
- `GET /` — Main Operations Dashboard
- `GET /fan` — Fan Companion App (mobile-optimized)

### REST API
- `GET /api/state` — Full current state JSON
- `GET /api/zones` — Zones array
- `GET /api/zones/:id` — Single zone details
- `GET /api/concessions` — Concessions array
- `GET /api/gates` — Gates array
- `GET /api/alerts` — Last 20 system alerts
- `GET /api/metrics` — Core metrics object
- `POST /api/emergency` — Sets all zones to 'emergency' and triggers global override
- `POST /api/reroute` — Marks a gate as rerouting with a specified reason

## Architecture

```text
[ IoT Sensors ] --> [ Edge Compute ] --> [ Simulator (Node) ]
      |                   |                     |
      |                   |                     | (WebSocket push)
      v                   v                     v
[ Private 5G ]      [ Core Backend ]     [ Socket.IO Bus ]
      |                   |                     |
      v                   v                     v
[ Computer Vision]  [ Redis Cache ]      [ Next.js Frontend ]
```

## Simulator Engine

The backend runs a deterministic `simulator.js` engine that fires every 2 seconds. It mocks live IoT hardware by randomly nudging zone occupancy, concession wait times, and gate queues within realistic bounds. It automatically recalculates statuses (e.g., triggering a zone 'critical' status if capacity exceeds 90%) and emits `state:update` events. These are instantly pushed to all connected clients over Socket.IO to power the real-time digital twin and fan apps without polling.

## Hackathon Demo Talking Points

1. "All sensor data is simulated — in production, replace simulator.js events with real BLE/RFID webhook callbacks."
2. "Socket.IO makes this real-time without polling — same architecture scales to 60,000 concurrent connections with Redis adapter."
3. "FlowCoins incentive layer is the key behavioral innovation — it makes attendees active participants in crowd management."
4. "The fan app AR navigation button simulates what would be a native ARCore/ARKit experience in the shipped product."
5. "The digital twin SVG updates live — in production this connects to a 3D venue model."
