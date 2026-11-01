#!/usr/bin/env node
/**
 * #996 — reglas de FRAUDE CON BONOS (src/services/fraudRadar.js → bonusRules / flatness / normalizeBonusCfg).
 * Simula jugadas reales (baccarat, ruleta, tragamonedas, deportes) para medir que quien CUBRE los dos lados cae siempre y que un jugador
 * real casi nunca: `node scripts/test-bonus-fraud.js`.
 */
'use strict';
const assert = require('assert');
const fr = require('../src/services/fraudRadar');

// Generador con semilla (resultados repetibles).
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

// Baccarat: Banca 45,86 % · Jugador 44,62 % · Empate 9,52 % (Banca paga 0,95; en empate se devuelven las dos apuestas).
function baccaratRound() { const x = rnd(); return x < 0.4586 ? 'B' : (x < 0.4586 + 0.4462 ? 'P' : 'T'); }
function baccaratHedger(rounds, bet) { let wag = 0, pay = 0; for (let i = 0; i < rounds; i++) { const r = baccaratRound(); wag += 2 * bet; pay += r === 'T' ? 2 * bet : (r === 'B' ? 1.95 * bet : 2 * bet); } return { wagered: wag, payout: pay, betsCount: rounds * 2 }; }
function baccaratSingle(rounds, bet) { let wag = 0, pay = 0; for (let i = 0; i < rounds; i++) { const r = baccaratRound(); wag += bet; const side = rnd() < 0.5 ? 'B' : 'P'; pay += r === 'T' ? bet : (r === side ? (side === 'B' ? 1.95 : 2) * bet : 0); } return { wagered: wag, payout: pay, betsCount: rounds }; }
// Ruleta europea: rojo + negro a la vez (el 0 se lleva las dos).
function rouletteHedger(spins, bet) { let wag = 0, pay = 0; for (let i = 0; i < spins; i++) { wag += 2 * bet; pay += Math.floor(rnd() * 37) === 0 ? 0 : 2 * bet; } return { wagered: wag, payout: pay, betsCount: spins * 2 }; }
// Tragamonedas: RTP ~96 % con mucha varianza.
function slots(spins, bet) { let wag = 0, pay = 0; for (let i = 0; i < spins; i++) { wag += bet; const x = rnd(); pay += bet * (x < 0.7 ? 0 : x < 0.9 ? 1.5 : x < 0.98 ? 4 : x < 0.999 ? 10 : 150); } return { wagered: wag, payout: pay, betsCount: spins }; }
// Deportes: cuota pareja 1,90 a los dos resultados (cubre) vs apostador real a cuotas variadas.
function sportsHedger(events, bet) { let wag = 0, pay = 0; for (let i = 0; i < events; i++) { const odd = 1.8 + rnd() * 0.25; wag += 2 * bet; pay += odd * bet; } return { wagered: wag, payout: pay, betsCount: events * 2 }; } // cuotas parejas 1,80–2,05
function sportsReal(n, bet) { let wag = 0, pay = 0; for (let i = 0; i < n; i++) { const odd = 1.3 + rnd() * 3; wag += bet; pay += rnd() < 0.95 / odd ? bet * odd : 0; } return { wagered: wag, payout: pay, betsCount: n }; }

const withCasino = (c, extra) => Object.assign({ wagered: c.wagered, payout: c.payout, netwin: c.wagered - c.payout, betsCount: c.betsCount, bonusGranted: 0, categories: { casino: c, sports: { wagered: 0, payout: 0, betsCount: 0 } } }, extra || {});
const withSports = (s) => ({ wagered: s.wagered, payout: s.payout, netwin: s.wagered - s.payout, betsCount: s.betsCount, categories: { casino: { wagered: 0, payout: 0, betsCount: 0 }, sports: s } });
const keys = (hits) => hits.map((h) => h.key);
const baseCtx = (recent, extra) => Object.assign({ username: 'x', recent, giftInWindow: 20000, askedInWindow: 60000, linked: [], giftTimes: [], wdTimes: [] }, extra || {});
const rate = (n, fn) => { let k = 0; for (let i = 0; i < n; i++) if (fn()) k++; return k / n; };

let ok = 0; const fails = [];
function caso(name, fn) { try { fn(); ok++; console.log('✔ ' + name); } catch (e) { fails.push(name); console.log('✘ ' + name + '\n   ' + e.message); } }

caso('cubrir Banca y Jugador en baccarat con bono ⇒ "juega al ras" SIEMPRE (100 simulaciones)', () => {
  const r = rate(100, () => keys(fr.bonusRules(baseCtx(withCasino(baccaratHedger(40, 5000))))).includes('bonus_flat_play'));
  assert.strictEqual(r, 1, 'cayó ' + r);
});
caso('rojo + negro en ruleta con bono ⇒ "juega al ras" en la mayoría (≥ 55 %: el 0 se lleva las dos y lo hace menos parejo)', () => {
  const r = rate(500, () => keys(fr.bonusRules(baseCtx(withCasino(rouletteHedger(40, 5000))))).includes('bonus_flat_play'));
  console.log('   detección ruleta rojo+negro: ' + (r * 100).toFixed(1) + ' %');
  assert.ok(r >= 0.55, 'cayó ' + r);
});
caso('jugador REAL de baccarat (un solo lado, mismas apuestas) ⇒ cae poco (< 15 %) y sola la regla no llega a observación', () => {
  const r = rate(2000, () => keys(fr.bonusRules(baseCtx(withCasino(baccaratSingle(40, 5000))))).includes('bonus_flat_play'));
  console.log('   falsos positivos baccarat un lado: ' + (r * 100).toFixed(1) + ' %');
  assert.ok(r < 0.15, 'falsos positivos ' + r);
  assert.ok(fr.RULES.bonus_flat_play.pts < 60);
});
caso('jugador de tragamonedas con bono ⇒ casi nunca (< 3 %)', () => {
  const r = rate(2000, () => keys(fr.bonusRules(baseCtx(withCasino(slots(200, 2500))))).includes('bonus_flat_play'));
  console.log('   falsos positivos tragamonedas: ' + (r * 100).toFixed(1) + ' %');
  assert.ok(r < 0.03, 'falsos positivos ' + r);
});
caso('sin bono, sin retiro o con apuestas chicas ⇒ no cae', () => {
  const h = withCasino(baccaratHedger(40, 5000));
  assert.ok(!keys(fr.bonusRules(baseCtx(h, { giftInWindow: 0 }))).includes('bonus_flat_play'));
  assert.ok(!keys(fr.bonusRules(baseCtx(h, { askedInWindow: 0 }))).includes('bonus_flat_play'));
  assert.ok(!keys(fr.bonusRules(baseCtx(withCasino(baccaratHedger(40, 500))))).includes('bonus_flat_play')); // $40.000 apostado: menos del mínimo
  assert.ok(keys(fr.bonusRules(baseCtx(h, { giftInWindow: 0 }), { flatMinWagered: 100000 })).length === 0);
  assert.ok(keys(fr.bonusRules(baseCtx(withCasino(baccaratHedger(40, 5000), { bonusGranted: 15000 }), { giftInWindow: 0 }))).includes('bonus_flat_play'), 'el bono que informa 1girox también cuenta');
});
caso('deportes cubriendo los dos resultados ⇒ "deportes al ras" (≥ 85 %); apostador real casi nunca (< 8 %)', () => {
  const rh = rate(500, () => keys(fr.bonusRules(baseCtx(withSports(sportsHedger(10, 10000))))).includes('sports_flat'));
  console.log('   detección deportes cubiertos: ' + (rh * 100).toFixed(1) + ' %'); assert.ok(rh >= 0.85, 'cayó ' + rh);
  const r = rate(2000, () => keys(fr.bonusRules(baseCtx(withSports(sportsReal(15, 8000))))).includes('sports_flat'));
  console.log('   falsos positivos deportes: ' + (r * 100).toFixed(1) + ' %');
  assert.ok(r < 0.08, 'falsos positivos ' + r);
});
caso('GRUPO ESPEJO: el que retira ganó $100.000 y su cuenta vinculada perdió $97.000 ⇒ cae con el grupo', () => {
  const me = { wagered: 300000, payout: 400000, netwin: -100000, betsCount: 60 };
  const mate = { userId: 'u2', username: 'primo', why: 'mismo celular', recent: { wagered: 300000, payout: 203000, netwin: 97000, betsCount: 60 } };
  const hits = fr.bonusRules(baseCtx(me, { linked: [mate] }));
  const h = hits.find((x) => x.key === 'mirror_group'); assert.ok(h, 'no cayó');
  assert.deepStrictEqual(h.group, [{ userId: 'u2', username: 'primo' }]);
  assert.ok(/primo \[mismo celular\]: perdió \$97\.000/.test(h.evidence), h.evidence);
});
caso('grupo espejo: si la vinculada también ganó, no jugó o perdió poco ⇒ no cae', () => {
  const me = { wagered: 300000, payout: 400000, netwin: -100000, betsCount: 60 };
  const L = (nw, wag) => [{ userId: 'u2', username: 'primo', why: 'mismo celular', recent: { wagered: wag, payout: wag - nw, netwin: nw, betsCount: 30 } }];
  assert.ok(!keys(fr.bonusRules(baseCtx(me, { linked: L(-20000, 300000) }))).includes('mirror_group'));
  assert.ok(!keys(fr.bonusRules(baseCtx(me, { linked: L(0, 0) }))).includes('mirror_group'));
  assert.ok(!keys(fr.bonusRules(baseCtx(me, { linked: L(20000, 300000) }))).includes('mirror_group'));
  assert.ok(!keys(fr.bonusRules(baseCtx({ wagered: 300000, payout: 200000, netwin: 100000, betsCount: 60 }, { linked: L(97000, 300000) }))).includes('mirror_group'), 'el que retira perdió');
});
caso('grupo espejo de 3 cuentas (dos pierden lo que gana una) ⇒ cae', () => {
  const me = { wagered: 200000, payout: 290000, netwin: -90000, betsCount: 40 };
  const linked = [{ userId: 'a', username: 'a', why: 'su referido', recent: { wagered: 100000, payout: 55000, netwin: 45000, betsCount: 20 } }, { userId: 'b', username: 'b', why: 'mismo CBU de retiro', recent: { wagered: 100000, payout: 57000, netwin: 43000, betsCount: 20 } }];
  const h = fr.bonusRules(baseCtx(me, { linked })).find((x) => x.key === 'mirror_group'); assert.ok(h); assert.strictEqual(h.group.length, 2);
});
caso('CAZADOR DE BONOS: 3 retiros a < 48 h de un regalo ⇒ cae; 2 ⇒ no', () => {
  const d = (h) => new Date(Date.UTC(2026, 9, 1) + h * 3600000);
  const ctx = (n) => baseCtx(null, { giftTimes: [d(0), d(100), d(200), d(300)], wdTimes: [d(10), d(120), d(230), d(400)].slice(0, n) });
  assert.ok(keys(fr.bonusRules(ctx(3))).includes('bonus_hunter'));
  assert.ok(!keys(fr.bonusRules(ctx(2))).includes('bonus_hunter'));
  assert.ok(!keys(fr.bonusRules(baseCtx(null, { giftTimes: [d(0), d(100), d(200)], wdTimes: [d(60), d(160), d(260)] }))).includes('bonus_hunter'), 'a 60 h no es ciclo');
});
caso('apagado desde el panel ⇒ ninguna regla; valores fuera de rango se acotan', () => {
  assert.strictEqual(fr.bonusRules(baseCtx(withCasino(baccaratHedger(40, 5000))), { enabled: false }).length, 0);
  const c = fr.normalizeBonusCfg({ windowHours: 99999, flatMaxZ: -3, groupMaxNetPct: 7, hunterCycles: 1, holdAfterBonus: { enabled: false, hours: 0 } });
  assert.strictEqual(c.windowHours, 336); assert.strictEqual(c.flatMaxZ, 0.01); assert.strictEqual(c.groupMaxNetPct, 0.5); assert.strictEqual(c.hunterCycles, 2);
  assert.strictEqual(c.holdAfterBonus.enabled, false); assert.strictEqual(c.holdAfterBonus.hours, 1);
  assert.deepStrictEqual(fr.normalizeBonusCfg(null), Object.assign({}, fr.BONUS_DEFAULT, { holdAfterBonus: Object.assign({}, fr.BONUS_DEFAULT.holdAfterBonus) }));
});
caso('las 4 reglas nuevas son de CONDUCTA en server.js (cuentan para el bloqueo automático)', () => {
  const s = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
  const m = s.match(/const FRAUD_BEHAVIOR_RULES = new Set\(\[([\s\S]*?)\]\)/); assert.ok(m);
  for (const k of ['bonus_flat_play', 'sports_flat', 'mirror_group', 'bonus_hunter']) { assert.ok(m[1].includes("'" + k + "'"), k); assert.ok(fr.RULES[k], k); }
});

console.log(`\n${ok}/${ok + fails.length} casos OK`);
process.exit(fails.length ? 1 : 0);
