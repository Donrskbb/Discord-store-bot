const mongoose = require('mongoose');

// Define the schema for storing links
const nitroSchema = new mongoose.Schema({
  url: { type: String, required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Create the model based on the schema
const Nitro = mongoose.model('Nitro', nitroSchema);

module.exports = Nitro;