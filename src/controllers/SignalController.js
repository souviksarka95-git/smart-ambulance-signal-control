const db = require('../services/dbService');
const { haversine, distanceToRoute, nearestIndex } = require('../utils/geo');

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

// Traffic-density-based timing: busier junction => longer green (clamped)
function greenTime(density) {
    const base = num(process.env.BASE_GREEN_SECONDS, 20);
    const max = num(process.env.MAX_GREEN_SECONDS, 60);
    return Math.round(base + (Math.min(100, Math.max(0, density)) / 100) * (max - base));
}

async function updateDensity(signalId, density, hub) {
    if (!Number.isFinite(density) || density < 0 || density > 100) throw new Error('density must be 0-100');
    const s = await db.setDensity(signalId, density, greenTime(density));
    if (!s) throw new Error('Signal not found');
    if (s.mode === 'NORMAL' && hub) {
        hub.sendToSignal(signalId, { type: 'SIGNAL_COMMAND', command: 'SET_TIMING', greenSeconds: s.greenSeconds });
    }
    if (hub) {
        hub.broadcast({ type: 'SIGNAL_UPDATE', signal: s });
    }
    return s;
}

async function release(signal, hub) {
    const s = await db.releaseSignal(signal.signalId, greenTime(signal.density));
    if (hub) {
        hub.sendToSignal(s.signalId, { type: 'SIGNAL_COMMAND', command: 'RESUME_NORMAL', greenSeconds: s.greenSeconds });
        hub.broadcast({ type: 'SIGNAL_UPDATE', signal: s });
    }
}

async function releaseAll(ambulanceId, hub) {
    const held = await db.signalsHeldBy(ambulanceId);
    for (const s of held) {
        await release(s, hub);
    }
}

// Core logic: called on every ambulance location update (REST or WebSocket)
async function handleLocationUpdate(ambulanceId, { lat, lng, speed = 0 }, hub) {
    if (typeof lat !== 'number' || typeof lng !== 'number') throw new Error('lat and lng must be numbers');

    const amb = await db.updateAmbulanceLocation(ambulanceId, lat, lng, speed);
    if (!amb) throw new Error('Ambulance not found');
    if (hub) {
        hub.broadcast({ type: 'AMBULANCE_UPDATE', ambulance: amb });
    }

    if (!amb.activeTripId) return { amb, preempted: 0, released: 0 };
    const trip = await db.getTrip(amb.activeTripId);
    if (!trip || !trip.route || !trip.route.length) return { amb, preempted: 0, released: 0 };

    const here = [lng, lat];
    const radius = num(process.env.PREEMPT_RADIUS_M, 400);
    const matchM = num(process.env.ROUTE_MATCH_M, 80);
    const ambIdx = nearestIndex(here, trip.route);
    const speedMs = Math.max(speed / 3.6, 5); // assume at least ~18 km/h for ETA

    // 1) Preempt free signals that are on the route, ahead of the ambulance, within radius
    let preempted = 0;
    const nearby = await db.signalsNear(lat, lng, radius);
    for (const s of nearby) {
        if (s.overriddenBy && s.overriddenBy !== ambulanceId) continue;
        const pos = [s.lng, s.lat];
        const dist = haversine(here, pos);
        if (dist > radius) continue;
        if (distanceToRoute(pos, trip.route) > matchM) continue;
        if (nearestIndex(pos, trip.route) < ambIdx) continue;

        const locked = await db.acquireSignal(s.signalId, ambulanceId);
        if (!locked) continue;
        if (hub) {
            hub.sendToSignal(locked.signalId, {
                type: 'SIGNAL_COMMAND',
                command: 'EMERGENCY_GREEN',
                ambulanceId,
                etaSeconds: Math.round(dist / speedMs),
            });
            hub.broadcast({ type: 'SIGNAL_UPDATE', signal: locked });
        }
        preempted++;
    }

    // 2) Release signals this ambulance has already passed
    let released = 0;
    const held = await db.signalsHeldBy(ambulanceId);
    for (const s of held) {
        const pos = [s.lng, s.lat];
        if (nearestIndex(pos, trip.route) < ambIdx && haversine(here, pos) > 30) {
            await release(s, hub);
            released++;
        }
    }

    return { amb, preempted, released };
}

module.exports = {
    greenTime,
    updateDensity,
    release,
    releaseAll,
    handleLocationUpdate
};
