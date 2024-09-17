// models/Transcript.js
const mongoose = require('mongoose');

const transcriptSchema = new mongoose.Schema({
    channelId: String,
    channelName: String,
    userId: String,
    userName: String,
    timestamp: Date,
    content: String,
});

module.exports = mongoose.model('Transcript', transcriptSchema);
