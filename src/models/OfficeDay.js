/**
 * #1013 OFICINA: el informe y las tareas de UN puesto en UN día (hora argentina).
 * Lo arma `_officeBuild` (server.js) a las 07 h y cada 6 h; las tareas tildadas se conservan al rehacerlo
 * (services/office.mergeTasks). Se borra solo a los 120 días.
 */
const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  id: String, text: String, kind: String, sev: String,
  done: { type: Boolean, default: false }, doneBy: String, doneAt: Date, note: String, stale: Boolean
}, { _id: false });

const officeDaySchema = new mongoose.Schema({
  dateKey: { type: String, required: true },
  desk: { type: String, required: true },
  report: { type: mongoose.Schema.Types.Mixed, default: null },
  tasks: { type: [taskSchema], default: [] },
  builtAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
officeDaySchema.index({ dateKey: 1, desk: 1 }, { unique: true });
officeDaySchema.index({ createdAt: 1 }, { expireAfterSeconds: 120 * 86400 });

module.exports = mongoose.models.OfficeDay || mongoose.model('OfficeDay', officeDaySchema);
