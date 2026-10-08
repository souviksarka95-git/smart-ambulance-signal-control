const mongoose = require('mongoose');

const signalSchema = new mongoose.Schema({
    signalId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    density: { type: Number, default: 0, min: 0, max: 100 },
    greenSeconds: { type: Number, default: 20 },
    mode: { type: String, enum: ['NORMAL', 'EMERGENCY_OVERRIDE'], default: 'NORMAL' },
    overriddenBy: { type: String, default: null },
    lastPreemptedAt: { type: Date, default: null }
}, {
    timestamps: true
});

module.exports = mongoose.model('Signal', signalSchema);
