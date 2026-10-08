// Simulation Demo: seeds signals along a route, starts a trip, and drives the ambulance.
// Usage: npm run simulate

const { fork } = require('child_process');
const path = require('path');

const DEFAULT_PORT = process.env.PORT || 4000;
let API = process.env.API || `http://127.0.0.1:${DEFAULT_PORT}/api`;
let spawnedServer = null;

const post = async (path, body) => {
    const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP error ${res.status}`);
    return data;
};

// Check if backend server is responsive, trying 127.0.0.1 then localhost
async function checkServer() {
    const targets = [
        `http://127.0.0.1:${DEFAULT_PORT}/api`,
        `http://localhost:${DEFAULT_PORT}/api`
    ];

    for (const target of targets) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 1000);
            const res = await fetch(`${target}/health`, { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
                API = target;
                return true;
            }
        } catch {
            // keep checking
        }
    }
    return false;
}

// Ensure server is online, auto-spawning if not already active
async function ensureServerRunning() {
    if (await checkServer()) return true;

    console.log('⚡ Backend server is not running. Auto-starting server process...');
    const serverEntry = path.join(__dirname, '../../index.js');
    spawnedServer = fork(serverEntry, { silent: true });

    // Poll until ready (up to 8 seconds)
    for (let i = 0; i < 16; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await checkServer()) {
            console.log('✅ Temporary backend server successfully started!');
            return true;
        }
    }
    return false;
}

async function run() {
    console.log('🚑 Starting Smart Ambulance Simulation...');

    const isOnline = await ensureServerRunning();
    if (!isOnline) {
        console.error('❌ Could not start or connect to backend server. Please run "npm run dev" manually.');
        process.exit(1);
    }

    console.log(`📡 Connected to backend at ${API}`);

    // Kolkata coordinates demo
    const origin = { lat: 22.5726, lng: 88.3639 };       // Start: Central Kolkata
    const destination = { lat: 22.5958, lng: 88.2636 };  // Destination: Hospital

    console.log('📍 Registering Ambulance AMB1...');
    await post('/ambulances', { ambulanceId: 'AMB1', name: 'Emergency EMS Unit 1', ...origin });

    console.log('🚀 Requesting calculated trip route...');
    const trip = await post('/trips/start', { ambulanceId: 'AMB1', origin, destination });
    if (!trip.route || !trip.route.length) {
        throw new Error('Trip route could not be generated: ' + JSON.stringify(trip));
    }
    console.log(`✅ Route generated: ${trip.route.length} waypoints, ~${Math.round(trip.distanceM)} meters`);

    // Place a traffic signal every ~15th-20th route waypoint
    const step = Math.max(5, Math.floor(trip.route.length / 5));
    let signalCount = 0;
    for (let i = step; i < trip.route.length - 2; i += step) {
        signalCount++;
        const [lng, lat] = trip.route[i];
        await post('/signals', {
            signalId: `SIG${signalCount}`,
            name: `Intersection Crossing ${signalCount}`,
            lat,
            lng
        });
        console.log(`🚦 Registered Traffic Signal SIG${signalCount} at [${lat.toFixed(4)}, ${lng.toFixed(4)}]`);
    }

    console.log('\n💨 Ambulance in transit! Streaming GPS updates...');
    const tripId = trip._id || trip.id;

    for (let i = 0; i < trip.route.length; i++) {
        const [lng, lat] = trip.route[i];
        const out = await post('/ambulances/AMB1/location', { lat, lng, speed: 55 });

        const pct = Math.round(((i + 1) / trip.route.length) * 100);
        let logMsg = `Progress: [${pct}%] Location: (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        if (out.preempted > 0) logMsg += ` ⚡ EMERGENCY GREEN triggered (${out.preempted} signal)`;
        if (out.released > 0) logMsg += ` 🟢 Signal released (${out.released})`;
        console.log(logMsg);

        await new Promise((r) => setTimeout(r, 200));
    }

    console.log('\n🏁 Ambulance reached hospital destination! Ending trip...');
    await fetch(`${API}/trips/${tripId}/end`, { method: 'POST' });
    console.log('✅ Trip completed. All signals returned to normal cycle.');

    if (spawnedServer) {
        spawnedServer.kill();
    }
}

run().catch((err) => {
    console.error('❌ Simulation Error:', err.message);
    if (spawnedServer) spawnedServer.kill();
    process.exit(1);
});
