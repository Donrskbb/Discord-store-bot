const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    staffExperience: { type: String, required: true },
    age: { type: String, required: true },
    tosAgreement: { type: String, required: true },
});

module.exports = mongoose.model('Submission', submissionSchema);
