require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        service: 'Smart Ambulance Signal Control System',
        timestamp: new Date().toISOString()
    });
});

io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Receive ambulance location & status updates
    socket.on('ambulance:update', (data) => {
        // Broadcast to traffic signal controllers & dashboard
        socket.broadcast.emit('ambulance:location', data);
    });

    // Signal override event
    socket.on('signal:override', (signalData) => {
        io.emit('signal:status', signalData);
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Smart Ambulance Signal Control Server running at http://localhost:${PORT}`);
});
