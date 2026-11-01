/**
 * BlockEvent — HISTORIAL DE BLOQUEOS (#996, owner 2026-11-01).
 *
 * "Si se rechaza el pago, que quede en información de bloqueados para tener yo la info, y un agente no pueda bloquear sin que quede en
 * historial y siempre con motivo; quiero el detalle". Cada bloqueo, desbloqueo, rechazo de retiro y observación automática deja un
 * registro PERMANENTE (sin TTL, sin ruta de borrado): quién, con qué rol, cuándo, el motivo y la evidencia del antifraude que vio.
 * Lo escribe `_blockLog` (server.js); lo lee sólo el admin general (panel → Alertas de estafa → 📜 Historial de bloqueos).
 */
const mongoose = require('mongoose');

const blockEventSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  username: { type: String, default: null, index: true },
  // block / unblock (persona) · auto_block / auto_watch (antifraude) · payout_reject (retiro rechazado) · payout_reject_block (rechazo + bloqueo)
  action: { type: String, required: true, enum: ['block', 'unblock', 'auto_block', 'auto_watch', 'payout_reject', 'payout_reject_block', 'watch', 'legit'], index: true },
  by: { type: String, required: true },          // usuario del panel o 'antifraude'
  role: { type: String, default: null },         // admin / depositor / withdrawer / sistema
  reason: { type: String, required: true },      // motivo (obligatorio)
  evidence: { type: mongoose.Schema.Types.Mixed, default: null }, // { score, reasons:[{key,label,pts,evidence}], group }
  payoutId: { type: String, default: null },
  amount: { type: Number, default: null },
  ip: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true }
});
blockEventSchema.index({ createdAt: -1 });

module.exports = mongoose.models.BlockEvent || mongoose.model('BlockEvent', blockEventSchema);
