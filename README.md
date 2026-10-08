🚑 Smart Ambulance Signal Control (Backend)
Real-time ambulance tracking with automatic traffic-signal preemption. An ambulance streams its GPS location to the server; the server calculates the route, turns signals on that route green ahead of the ambulance, and returns them to normal once it has passed. Signal timing under normal conditions adapts to traffic density.
Stack: Node.js · Express.js · WebSockets (`ws`) · NeonDB (serverless PostgreSQL) · OSRM / Google Directions
---
Features
Ambulance GPS/location tracking (REST or WebSocket)
Shortest/fastest route calculation (free OSRM by default, Google Directions optional)
Automatic signal priority: signals on the route, ahead of the ambulance, within a configurable radius switch to emergency green
Emergency alerts pushed to nearby signal controllers over WebSocket
Live dashboard feed (ambulance position, signal state changes, trip events)
Traffic-density-based green timing for normal operation
Atomic signal locking, so two ambulances can't claim the same signal
---
How it works
```
Ambulance ──location──▶ Server ──▶ finds signals ahead on route within radius
                           │
                           ├──▶ EMERGENCY_GREEN  ──▶ Signal controller (WebSocket)
                           ├──▶ RESUME_NORMAL    ──▶ Signal controller (after ambulance passes)
                           └──▶ AMBULANCE_UPDATE / SIGNAL_UPDATE ──▶ Dashboard (WebSocket)
```
Register an ambulance and start a trip with a destination. The route is calculated and stored.
The ambulance sends location updates every second or so.
On each update the server preempts signals that are on the route, ahead, and within `PREEMPT_RADIUS_M`, and releases signals the ambulance has already passed.
Green time for normal operation scales with density (0–100) from `BASE_GREEN_SECONDS` up to `MAX_GREEN_SECONDS`.
---
Project structure
```
.
├── package.json
├── .env.example
├── scripts/
│   └── simulate.js          # demo: drives a fake ambulance along a route
└── src/
    ├── server.js            # Express + WebSocket bootstrap
    ├── routes.js            # REST API
    ├── ws.js                # WebSocket hub (dashboard / signal / ambulance)
    ├── db.js                # Neon Postgres pool, schema, queries
    ├── signalController.js  # preemption, release, density timing
    ├── routing.js           # OSRM / Google Directions
    └── geo.js               # distance and route-matching helpers
```
---
Getting started
Prerequisites
Node.js 18+
A free Neon project
Setup
```bash
git clone https://github.com/<your-username>/smart-ambulance-signal-control.git
cd smart-ambulance-signal-control
npm install
cp .env.example .env
```
Open your Neon dashboard, click Connect, copy the connection string, and paste it into `.env` as `DATABASE_URL`. Tables are created automatically on first start.
```bash
npm start          # or: npm run dev (auto-reload)
```
The server listens on `http://localhost:4000`.
Try the demo
With the server running, in another terminal:
```bash
npm run simulate
```
This registers an ambulance, starts a trip, places signals along the route and moves the ambulance through it. Edit the `origin` and `destination` coordinates in `scripts/simulate.js` to match your city. Connect a WebSocket client as `role=dashboard` to watch signals change state.
---
Configuration
Variable	Default	Description
`PORT`	`4000`	Server port
`DATABASE_URL`	none	Neon Postgres connection string (required)
`GOOGLE_MAPS_API_KEY`	empty	If set, uses Google Directions; otherwise OSRM
`PREEMPT_RADIUS_M`	`400`	Distance ahead at which signals are preempted
`ROUTE_MATCH_M`	`30`	Max distance from the route for a signal to count as "on route"
`BASE_GREEN_SECONDS`	`20`	Green time at zero density
`MAX_GREEN_SECONDS`	`60`	Green time at 100 density
---
REST API
Base path: `/api`
Method	Endpoint	Body	Description
POST	`/signals`	`signalId, name, lat, lng`	Register a signal
GET	`/signals`	none	List signals
PATCH	`/signals/:signalId/density`	`density` (0–100)	Update traffic density
POST	`/ambulances`	`ambulanceId, name, lat, lng`	Register an ambulance
GET	`/ambulances`	none	List ambulances
POST	`/ambulances/:ambulanceId/location`	`lat, lng, speed`	Send a location update
POST	`/trips/start`	`ambulanceId, destination{lat,lng}, origin?{lat,lng}`	Start a trip and calculate the route
GET	`/trips/active`	none	List active trips
POST	`/trips/:id/end`	none	End a trip and release its signals
Health check: `GET /health`
Example
```bash
curl -X POST localhost:4000/api/signals -H "Content-Type: application/json" \
  -d '{"signalId":"SIG1","name":"Main St","lat":22.58,"lng":88.34}'

curl -X POST localhost:4000/api/ambulances -H "Content-Type: application/json" \
  -d '{"ambulanceId":"AMB1","name":"Ambulance 1","lat":22.57,"lng":88.36}'

curl -X POST localhost:4000/api/trips/start -H "Content-Type: application/json" \
  -d '{"ambulanceId":"AMB1","destination":{"lat":22.59,"lng":88.26}}'
```
---
WebSocket API
Endpoint: `ws://localhost:4000/ws`
Connect as	URL	Purpose
Dashboard	`?role=dashboard`	Receives live events
Signal controller	`?role=signal&signalId=SIG1`	Receives commands for that signal
Ambulance	`?role=ambulance&ambulanceId=AMB1`	Sends location updates
Ambulance sends:
```json
{ "type": "LOCATION", "lat": 22.5726, "lng": 88.3639, "speed": 50 }
```
Dashboard receives: `AMBULANCE_UPDATE`, `SIGNAL_UPDATE`, `TRIP_STARTED`, `TRIP_ENDED`
Signal controller receives:
```json
{ "type": "SIGNAL_COMMAND", "command": "EMERGENCY_GREEN", "ambulanceId": "AMB1", "etaSeconds": 24 }
{ "type": "SIGNAL_COMMAND", "command": "RESUME_NORMAL", "greenSeconds": 30 }
{ "type": "SIGNAL_COMMAND", "command": "SET_TIMING", "greenSeconds": 42 }
```
---
Database schema
Three tables, created automatically by `initSchema()` in `src/db.js`:
`signals`: position, mode (`NORMAL` / `EMERGENCY`), `overridden_by`, density, green seconds
`ambulances`: position, speed, status (`IDLE` / `ON_TRIP`), active trip
`trips`: origin, destination, route (JSONB), distance, duration, status
---
Known limitations
The server does not choose which direction gets the green at a junction; the signal controller hardware or software handles that.
A signal is released once the ambulance has passed it along the route, not when the trip ends.
The public OSRM server is for demos only; use your own instance or Google Directions in production.
No authentication yet. Add API keys or JWT before exposing the endpoints publicly.
---
Roadmap
[ ] Live dashboard frontend (map with ambulance and signal states)
[ ] Direction-aware signal control
[ ] Authentication for ambulances and signal controllers
[ ] Tests for the preemption logic
---
License
MIT