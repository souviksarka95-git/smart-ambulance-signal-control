const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
    ambulanceId: { type: String, required: true },
    origin: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
    },
    destination: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
    },
    route: {
        type: [[Number]], // Array of [lng, lat] coordinate pairs
        default: []
    },
    distanceM: { type: Number, default: 0 },
    durationS: { type: Number, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE' }
}, {
    timestamps: true
});

module.exports = mongoose.model('Trip', tripSchema);
