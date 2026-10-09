/**
 * Example: How to get and stream Ambulance GPS Location
 * 
 * Demonstrates:
 * 1. REST API: Fetch current GPS location of an ambulance
 * 2. REST API: Update/stream GPS location
 * 3. WebSocket: Real-time location listening and on-demand query
 * 4. Hardware/Mobile: Capturing real GPS coordinates
 */

const BASE_URL = process.env.API_URL || 'http://localhost:4000';

// ============================================================================
// 1. GET GPS LOCATION VIA REST API
// ============================================================================
async function getAmbulanceLocation(ambulanceId = 'AMB1') {
    try {
        const response = await fetch(`${BASE_URL}/api/ambulances/${ambulanceId}/location`);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || `HTTP ${response.status}`);
        }
        const data = await response.json();
        console.log(`📍 [REST] Current GPS Location for ${ambulanceId}:`, {
            lat: data.lat,
            lng: data.lng,
            speed: data.speed,
            status: data.status,
            activeTripId: data.activeTripId,
            lastUpdated: data.updatedAt
        });
        return data;
    } catch (err) {
        console.error('❌ Failed to get GPS location:', err.message);
    }
}

// ============================================================================
// 2. SEND GPS LOCATION UPDATE VIA REST API
// ============================================================================
async function sendAmbulanceLocation(ambulanceId = 'AMB1', lat, lng, speed = 50) {
    try {
        const response = await fetch(`${BASE_URL}/api/ambulances/${ambulanceId}/location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng, speed })
        });
        const result = await response.json();
        console.log(`📡 [REST] Location sent:`, result);
        return result;
    } catch (err) {
        console.error('❌ Failed to send GPS location:', err.message);
    }
}

// ============================================================================
// 3. WEBSOCKET REAL-TIME CLIENT (Socket.io)
// ============================================================================
function setupSocketGpsClient(ambulanceId = 'AMB1') {
    // Requires: npm install socket.io-client (if running as separate Node process)
    const { io } = require('socket.io-client');
    const socket = io(BASE_URL);

    socket.on('connect', () => {
        console.log('✅ Connected to Smart Ambulance WebSocket server (ID:', socket.id, ')');

        // A) Query current GPS location on-demand via WebSocket:
        socket.emit('ambulance:get_location', ambulanceId, (response) => {
            if (response.success) {
                console.log(`📍 [Socket Ack] Location for ${ambulanceId}:`, response.data);
            } else {
                console.error(`❌ [Socket Ack] Error:`, response.error);
            }
        });
    });

    // B) Listen for live GPS broadcast updates
    socket.on('ambulance:location', (amb) => {
        if (!ambulanceId || amb.ambulanceId === ambulanceId) {
            console.log(`🚨 [Live Broadcast] ${amb.ambulanceId} moved to: [${amb.lat}, ${amb.lng}] Speed: ${amb.speed}km/h`);
        }
    });

    // C) Sending GPS location via WebSocket:
    function streamGpsUpdate(lat, lng, speed = 45) {
        socket.emit('ambulance:update', {
            ambulanceId,
            lat,
            lng,
            speed
        });
    }

    return { socket, streamGpsUpdate };
}

// ============================================================================
// 4. HOW TO CAPTURE REAL GPS HARDWARE / MOBILE COORDINATES
// ============================================================================
/*
A) Smartphone / Web Browser (Driver Mode):
   navigator.geolocation.watchPosition(
       (pos) => {
           const lat = pos.coords.latitude;
           const lng = pos.coords.longitude;
           const speed = Math.round((pos.coords.speed || 0) * 3.6); // m/s to km/h
           sendAmbulanceLocation('AMB1', lat, lng, speed);
       },
       (err) => console.error(err),
       { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
   );

B) Hardware GPS Module (e.g. Arduino / ESP32 / Raspberry Pi with NEO-6M GPS):
   - Reads NMEA sentences (e.g., $GPRMC or $GPGGA) over UART serial.
   - Extracts Latitude and Longitude.
   - Transmits HTTP POST to: http://<SERVER_IP>:4000/api/ambulances/AMB1/location
     Payload: { "lat": 22.5726, "lng": 88.3639, "speed": 60 }
*/

module.exports = {
    getAmbulanceLocation,
    sendAmbulanceLocation,
    setupSocketGpsClient
};

// Quick self-test if executed directly: node examples/gpsTrackerClient.js
if (require.main === module) {
    (async () => {
        console.log('Testing GET GPS location...');
        await getAmbulanceLocation('AMB1');
    })();
}
