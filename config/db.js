const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/smart-ambulance-signal';
        await mongoose.connect(uri);
        console.log(` Connected to MongoDB: ${mongoose.connection.host}`);
    } catch (error) {
        console.error(' MongoDB connection failed:', error.message);
    }
};

module.exports = connectDB;
