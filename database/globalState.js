const mongoose = require('mongoose');

const globalStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed
});

const GlobalState = mongoose.models.GlobalState || mongoose.model('GlobalState', globalStateSchema);

module.exports = { GlobalState }; 