require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./src/config/db');
const { createRouter } = require('./src/routes/route');
const { handleLocationUpdate } = require('./src/controllers/SignalController');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PATCH']
    }
});

const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Real-time communication hub bridging controllers, routes, and connected clients
const hub = {
    sendToSignal: (signalId, payload) => {
        io.to(`signal:${signalId}`).emit('signal:command', payload);
        io.emit('signal:command', { signalId, ...payload });
        io.emit('signal:status', { signalId, ...payload });
    },
    broadcast: (payload) => {
        io.emit(payload.type, payload);
        if (payload.type === 'AMBULANCE_UPDATE') {
            io.emit('ambulance:location', payload.ambulance);
        }
        if (payload.type === 'SIGNAL_UPDATE') {
            io.emit('signal:status', payload.signal);
        }
    }
};

// Mount REST API routes
app.use('/api', createRouter(hub));

app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        service: 'Smart Ambulance Signal Control System',
        timestamp: new Date().toISOString()
    });
});

io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Join signal-specific notification rooms if needed
    socket.on('signal:subscribe', (signalId) => {
        socket.join(`signal:${signalId}`);
        console.log(`[Socket] ${socket.id} subscribed to signal ${signalId}`);
    });

    // Receive real-time GPS updates from ambulance hardware / mobile app
    socket.on('ambulance:update', async (data) => {
        try {
            if (data && data.lat && data.lng) {
                const ambId = data.ambulanceId || data.id || 'AMB1';
                const res = await handleLocationUpdate(ambId, {
                    lat: Number(data.lat),
                    lng: Number(data.lng),
                    speed: Number(data.speed || 0)
                }, hub);
                socket.emit('ambulance:update:ack', { success: true, ...res });
            }
        } catch (err) {
            console.error('[Socket] ambulance:update error:', err.message);
        }
    });

    // Signal override event
    socket.on('signal:override', (signalData) => {
        io.emit('signal:status', signalData);
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Smart Ambulance Signal Control Server running at http://localhost:${PORT}`);
});
