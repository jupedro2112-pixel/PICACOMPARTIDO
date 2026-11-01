const mongoose = require('mongoose');
// #1003: un canje por cliente y por código (índice único dropId+userId). status: 'claiming' mientras se acredita → 'credited'.
const codeDropClaimSchema = new mongoose.Schema({
  dropId: { type: String, required: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'claiming' },
  reference: { type: String, default: null },
  creditedAs: { type: String, default: null },
  at: { type: Date, default: Date.now }
});
codeDropClaimSchema.index({ dropId: 1, userId: 1 }, { unique: true });
codeDropClaimSchema.index({ dropId: 1, at: 1 });
module.exports = mongoose.models.CodeDropClaim || mongoose.model('CodeDropClaim', codeDropClaimSchema);
