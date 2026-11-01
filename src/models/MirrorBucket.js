const mongoose = require('mongoose');
// #1004: totales de 1girox de TODOS los jugadores activos en una franja horaria (sólo los que apostaron). key 'YYYY-MM-DDTHH+<horas>' única.
// Se piden una vez (franja cerrada = no cambia) y se borran a los días+2.
const mirrorBucketSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  from: { type: Date, required: true, index: true },
  to: { type: Date, required: true },
  players: { type: mongoose.Schema.Types.Mixed, default: {} }, // username → { wagered, netwin, bonusGranted }
  asked: { type: Number, default: 0 },
  complete: { type: Boolean, default: false },
  fetchedAt: { type: Date, default: Date.now }
});
module.exports = mongoose.models.MirrorBucket || mongoose.model('MirrorBucket', mirrorBucketSchema);
