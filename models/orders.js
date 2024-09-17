const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    item: { type: String, required: true, unique: true },
    quantity: { type: Number, required: true }
});

module.exports = mongoose.model('Order', orderSchema);