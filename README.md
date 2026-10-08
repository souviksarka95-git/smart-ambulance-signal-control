# 🚑 Smart Ambulance Signal Control System (Backend)

Real-time ambulance tracking with automatic traffic-signal preemption. As an ambulance moves through traffic, it streams its GPS location to the server. The system alerts upcoming traffic signals to switch to emergency green ahead of the ambulance and returns them to normal operation once it has passed.

**Tech Stack**: Node.js · Express.js · Socket.IO · MongoDB & Mongoose (MongoDB Compass) · Dotenv

---

## 🌟 Features

- **Real-Time Tracking**: Bi-directional communication between ambulances, traffic signals, and monitoring dashboards via Socket.IO.
- **Traffic Signal Override**: Emergency signals turn green when an ambulance approaches and resume normal cycle after it passes.
- **MongoDB Integration**: Managed via Mongoose, compatible with local MongoDB and MongoDB Compass.
- **Health Monitoring**: Dedicated health check API for server and service uptime status.
- **Traffic Density Management**: Adaptable signal timings based on real-time traffic density.

---

## 🔄 How It Works

```text
Ambulance ──(ambulance:update)──▶ Server ──▶ Checks route & signals ahead
                                    │
                                    ├──(signal:status)────▶ Traffic Signals (Emergency Green / Normal)
                                    └──(ambulance:location)▶ Live Dashboard (Real-time tracking)
```

1. **Ambulance emits location**: Streams current coordinates and status to the backend.
2. **Server evaluates signals**: Broadcasts priority commands to affected intersections.
3. **Signal override**: Intersections clear traffic by granting emergency green lights.
4. **Resumption**: Once the ambulance passes, signals return to normal traffic-density schedules.

---

## 📁 Project Structure

```text
.
├── config/
│   ├── db.js             # MongoDB connection setup (Mongoose)
│   └── index.js          # Config entry point (delegates to root index.js)
├── index.js              # Express & Socket.IO server entry point
├── .env                  # Environment variables (MongoDB URI, Port)
├── package.json          # Dependencies and scripts
└── README.md             # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [MongoDB](https://www.mongodb.com/try/download/community) installed and running locally, or a MongoDB Atlas URI
- [MongoDB Compass](https://www.mongodb.com/try/download/compass) (GUI for visualizing the database)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/souviksarka95-git/smart-ambulance-signal-control.git
   cd smart-ambulance-signal-control
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory (or update existing):
   ```env
   PORT=4000
   MONGODB_URI=mongodb://localhost:27017/smart-ambulance-signal
   MONGO_URI=mongodb://localhost:27017/smart-ambulance-signal
   DATABASE_URL=mongodb://localhost:27017/smart-ambulance-signal
   ```
   > In **MongoDB Compass**, connect using the URI `mongodb://localhost:27017/` to inspect the `smart-ambulance-signal` database.

4. **Start the Development Server**:
   ```bash
   npm run dev
   ```

   The server will start at `http://localhost:4000` with nodemon auto-reload:
   ```text
   🚀 Smart Ambulance Signal Control Server running at http://localhost:4000
   Connected to MongoDB: localhost
   ```

---

## ⚙️ Configuration (`.env`)

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `4000` | Port for the Express and Socket.IO server |
| `MONGODB_URI` | `mongodb://localhost:27017/smart-ambulance-signal` | MongoDB connection string (Compass compatible) |
| `MONGO_URI` | `mongodb://localhost:27017/smart-ambulance-signal` | Alternative alias for MongoDB URI |

---

## 📡 API & Socket.IO Specification

### REST API

- **Health Check**:
  - `GET /api/health`
  - Response:
    ```json
    {
      "status": "online",
      "service": "Smart Ambulance Signal Control System",
      "timestamp": "2026-10-08T15:51:39.123Z"
    }
    ```

### Socket.IO Events

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `ambulance:update` | Client ➔ Server | `{ ambulanceId, lat, lng, speed, heading }` | Ambulance sends its updated GPS location |
| `ambulance:location` | Server ➔ Broadcast | `{ ambulanceId, lat, lng, speed, heading }` | Broadcasted to traffic controllers and dashboard |
| `signal:override` | Client ➔ Server | `{ signalId, status, duration }` | Command to override signal state |
| `signal:status` | Server ➔ Broadcast | `{ signalId, status, duration }` | Broadcasted signal change notification |

---

## 🗺️ Roadmap

- [x] Express and Socket.IO real-time infrastructure
- [x] Local MongoDB / MongoDB Compass database integration
- [ ] Mongoose Schemas (Ambulances, Signals, Trips)
- [ ] Preemption routing algorithm (OSRM / Google Maps API)
- [ ] Live interactive dashboard frontend (Leaflet / Mapbox)
- [ ] Authentication & Role-based Access Control (JWT)

---

## 📄 License

This project is licensed under the MIT License.