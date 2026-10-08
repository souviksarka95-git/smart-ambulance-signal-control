const Signal = require('../models/Signal');
const Ambulance = require('../models/Ambulance');
const Trip = require('../models/Trip');
const { haversine } = require('../utils/geo');

const dbService = {
    // ---------- Signals ----------
    async createSignal(data) {
        return await Signal.findOneAndUpdate(
            { signalId: data.signalId },
            { $set: data },
            { upsert: true, returnDocument: 'after' }
        );
    },

    async listSignals() {
        return await Signal.find().sort({ signalId: 1 }).lean();
    },

    async setDensity(signalId, density, greenSeconds) {
        return await Signal.findOneAndUpdate(
            { signalId },
            { $set: { density, greenSeconds } },
            { returnDocument: 'after' }
        );
    },

    async releaseSignal(signalId, greenSeconds) {
        return await Signal.findOneAndUpdate(
            { signalId },
            {
                $set: {
                    mode: 'NORMAL',
                    overriddenBy: null,
                    ...(greenSeconds !== undefined && { greenSeconds })
                }
            },
            { returnDocument: 'after' }
        );
    },

    async signalsHeldBy(ambulanceId) {
        return await Signal.find({ overriddenBy: ambulanceId });
    },

    async signalsNear(lat, lng, radiusMeters) {
        // Approximate degree bounding box for efficiency (~111km per deg)
        const degDelta = (radiusMeters / 111000) * 1.5;
        const candidates = await Signal.find({
            lat: { $gte: lat - degDelta, $lte: lat + degDelta },
            lng: { $gte: lng - degDelta, $lte: lng + degDelta }
        }).lean();

        // Exact haversine filter
        return candidates.filter((s) => haversine({ lat, lng }, { lat: s.lat, lng: s.lng }) <= radiusMeters);
    },

    async acquireSignal(signalId, ambulanceId) {
        return await Signal.findOneAndUpdate(
            {
                signalId,
                $or: [{ overriddenBy: null }, { overriddenBy: ambulanceId }]
            },
            {
                $set: {
                    mode: 'EMERGENCY_OVERRIDE',
                    overriddenBy: ambulanceId,
                    lastPreemptedAt: new Date()
                }
            },
            { returnDocument: 'after' }
        );
    },

    // ---------- Ambulances ----------
    async createAmbulance(data) {
        return await Ambulance.findOneAndUpdate(
            { ambulanceId: data.ambulanceId },
            { $set: data },
            { upsert: true, returnDocument: 'after' }
        );
    },

    async listAmbulances() {
        return await Ambulance.find().sort({ ambulanceId: 1 }).lean();
    },

    async getAmbulance(ambulanceId) {
        return await Ambulance.findOne({ ambulanceId });
    },

    async updateAmbulanceLocation(ambulanceId, lat, lng, speed = 0) {
        return await Ambulance.findOneAndUpdate(
            { ambulanceId },
            { $set: { lat, lng, speed } },
            { returnDocument: 'after' }
        );
    },

    async setAmbulanceTrip(ambulanceId, status, tripId, lat, lng) {
        const update = { status, activeTripId: tripId };
        if (typeof lat === 'number' && typeof lng === 'number') {
            update.lat = lat;
            update.lng = lng;
        }
        return await Ambulance.findOneAndUpdate(
            { ambulanceId },
            { $set: update },
            { returnDocument: 'after' }
        );
    },

    // ---------- Trips ----------
    async createTrip(data) {
        const trip = new Trip(data);
        return await trip.save();
    },

    async getTrip(tripId) {
        try {
            return await Trip.findById(tripId).lean();
        } catch {
            return await Trip.findOne({ _id: tripId }).lean();
        }
    },

    async listActiveTrips() {
        return await Trip.find({ status: 'ACTIVE' }).sort({ createdAt: -1 }).lean();
    },

    async endTrip(tripId) {
        try {
            return await Trip.findByIdAndUpdate(
                tripId,
                { $set: { status: 'COMPLETED' } },
                { returnDocument: 'after' }
            );
        } catch {
            return null;
        }
    }
};

module.exports = dbService;
