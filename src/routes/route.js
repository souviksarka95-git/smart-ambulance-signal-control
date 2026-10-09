const express = require('express');
const db = require('../services/dbService');
const { getRoute } = require('../utils/routing');
const { greenTime, updateDensity, releaseAll, handleLocationUpdate } = require('../controllers/SignalController');

const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch((e) => {
        const dup = e.code === 11000;
        res.status(dup ? 409 : 400).json({ error: dup ? 'Already exists' : e.message });
    });

const needNums = (...vals) => {
    if (vals.some((v) => typeof v !== 'number' || Number.isNaN(v))) throw new Error('lat/lng must be numbers');
};

function createRouter(hub) {
    const r = express.Router();

    // ---------- Signals ----------
    r.post('/signals', wrap(async (req, res) => {
        const { signalId, name, lat, lng } = req.body;
        if (!signalId) throw new Error('signalId required');
        needNums(Number(lat), Number(lng));
        const signal = await db.createSignal({
            signalId,
            name: name || `Signal ${signalId}`,
            lat: Number(lat),
            lng: Number(lng),
            greenSeconds: greenTime(0)
        });
        if (hub) hub.broadcast({ type: 'SIGNAL_CREATED', signal });
        res.status(201).json(signal);
    }));

    r.get('/signals', wrap(async (_req, res) => {
        res.json(await db.listSignals());
    }));

    r.patch('/signals/:signalId/density', wrap(async (req, res) => {
        const updated = await updateDensity(req.params.signalId, Number(req.body.density), hub);
        res.json(updated);
    }));

    // ---------- Ambulances ----------
    r.post('/ambulances', wrap(async (req, res) => {
        const { ambulanceId, name, lat, lng } = req.body;
        if (!ambulanceId) throw new Error('ambulanceId required');
        needNums(Number(lat), Number(lng));
        const amb = await db.createAmbulance({
            ambulanceId,
            name: name || `Ambulance ${ambulanceId}`,
            lat: Number(lat),
            lng: Number(lng)
        });
        if (hub) hub.broadcast({ type: 'AMBULANCE_CREATED', ambulance: amb });
        res.status(201).json(amb);
    }));

    r.get('/ambulances', wrap(async (_req, res) => {
        res.json(await db.listAmbulances());
    }));

    r.get('/ambulances/:ambulanceId', wrap(async (req, res) => {
        const amb = await db.getAmbulance(req.params.ambulanceId);
        if (!amb) {
            return res.status(404).json({ error: `Ambulance "${req.params.ambulanceId}" not found` });
        }
        res.json(amb);
    }));

    r.get('/ambulances/:ambulanceId/location', wrap(async (req, res) => {
        const amb = await db.getAmbulance(req.params.ambulanceId);
        if (!amb) {
            return res.status(404).json({ error: `Ambulance "${req.params.ambulanceId}" not found` });
        }
        res.json({
            ambulanceId: amb.ambulanceId,
            name: amb.name,
            lat: amb.lat,
            lng: amb.lng,
            speed: amb.speed,
            status: amb.status,
            activeTripId: amb.activeTripId,
            updatedAt: amb.updatedAt
        });
    }));

    r.post('/ambulances/:ambulanceId/location', wrap(async (req, res) => {
        const { lat, lng, speed = 0 } = req.body;
        needNums(Number(lat), Number(lng));
        const out = await handleLocationUpdate(req.params.ambulanceId, {
            lat: Number(lat),
            lng: Number(lng),
            speed: Number(speed)
        }, hub);
        res.json({ ambulance: out.amb, preempted: out.preempted, released: out.released });
    }));

    // ---------- Trips ----------
    r.post('/trips/start', wrap(async (req, res) => {
        const { ambulanceId, origin, destination } = req.body;
        const amb = await db.getAmbulance(ambulanceId);
        if (!amb) throw new Error(`Ambulance "${ambulanceId}" not found`);
        needNums(Number(destination?.lat), Number(destination?.lng));

        if (amb.activeTripId) {
            await db.endTrip(amb.activeTripId);
            await releaseAll(ambulanceId, hub);
        }

        const from = origin ? { lat: Number(origin.lat), lng: Number(origin.lng) } : { lat: amb.lat, lng: amb.lng };
        const dest = { lat: Number(destination.lat), lng: Number(destination.lng) };

        const { route, distanceM, durationS } = await getRoute(from, dest);
        const trip = await db.createTrip({
            ambulanceId,
            origin: from,
            destination: dest,
            route,
            distanceM,
            durationS,
            status: 'ACTIVE'
        });

        const updated = await db.setAmbulanceTrip(ambulanceId, 'ON_TRIP', trip._id.toString(), from.lat, from.lng);

        if (hub) hub.broadcast({ type: 'TRIP_STARTED', trip, ambulance: updated });
        res.status(201).json(trip);
    }));

    r.get('/trips/active', wrap(async (_req, res) => {
        res.json(await db.listActiveTrips());
    }));

    r.get('/trips', wrap(async (_req, res) => {
        res.json(await db.listAllTrips());
    }));

    r.post('/trips/:id/end', wrap(async (req, res) => {
        const trip = await db.endTrip(req.params.id);
        if (!trip) throw new Error('Trip not found');
        await db.setAmbulanceTrip(trip.ambulanceId, 'IDLE', null);
        await releaseAll(trip.ambulanceId, hub);
        if (hub) hub.broadcast({ type: 'TRIP_ENDED', tripId: trip._id });
        res.json(trip);
    }));

    return r;
}

module.exports = {
    createRouter
};
