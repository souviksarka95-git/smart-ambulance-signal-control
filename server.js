import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { initSchema } from './db.js';
import { createHub } from './ws.js';
import { createRouter } from './routes.js';
import { handleLocationUpdate } from './signalController.js';

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is missing. Copy .env.example to .env and paste your Neon connection string.');
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// hub is referenced lazily so the WS handler and REST routes share one instance
let hub;
hub = createHub(server, {
    onAmbulanceLocation: (ambulanceId, msg) => handleLocationUpdate(ambulanceId, msg, hub),
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', createRouter(hub));

await initSchema(); // creates tables on first run
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`API + WebSocket listening on :${PORT}`));
