const mongoose = require('mongoose');

const ambulanceSchema = new mongoose.Schema({
    ambulanceId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    speed: { type: Number, default: 0 },
    status: { type: String, enum: ['IDLE', 'ON_TRIP'], default: 'IDLE' },
    activeTripId: { type: String, default: null }
}, {
    timestamps: true
});

module.exports = mongoose.model('Ambulance', ambulanceSchema);
