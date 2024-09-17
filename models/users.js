// models/users.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: { type: String },
    totalAmount: { type: Number, default: 0 },
    isAdmin: { type: Number, default: 0 }, // 1 for yes, 0 for no
    adminUsername: { type: String },
    adminPassword: { type: String }, // This should be hashed
    notes: [
        {
            _id: mongoose.Schema.Types.ObjectId,
            content: String,
            createdAt: { type: Date, default: Date.now }
        }
    ],
    warnings: [
        {
            reason: String,
            issuedBy: String,
            issuedAt: { type: Date, default: Date.now }
        }
    ],
    vouchDetails: [
        {
            product: { type: String, required: true },
            quantity: { type: Number, required: true },
            amount: { type: Number, required: true },
            person: { type: String, required: true },
            date: { type: Date, default: Date.now }
        }
    ]
});

module.exports = mongoose.model('User', userSchema);
