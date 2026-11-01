#!/usr/bin/env node
// #1001 — cierre con cuentas secundarias y pagos a mano marcados + control "¿el cierre está OK?". Usa _closeApply / _closeCheck REALES de server.js.
// Datos inventados: node scripts/test-close-accounts.js
'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const S = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const fn = (name) => { const m = new RegExp('^function ' + name + '\\(', 'm').exec(S); if (!m) throw new Error('no está ' + name); let d = 0; const i = S.indexOf('{', m.index); for (let j = i; j < S.length; j++) { if (S[j] === '{') d++; else if (S[j] === '}' && !--d) return S.slice(m.index, j + 1); } return ''; };
const datosIa = { dateKeyART: () => '2026-11-01' } /* 'hoy' del test */; const logger = { warn() {} };
const { _closeApply, _closeCheck } = new Function('datosIa', 'logger', [fn('_closeApply'), fn('_closeCheck'), 'return { _closeApply, _closeCheck };'].join('\n'))(datosIa, logger);
const cfg = { bankCommissionPct: 0, perDepositFee: 0 };
let ok = 0; const fails = [];
const caso = (n, f) => { try { f(); ok++; console.log('✔ ' + n); } catch (e) { fails.push(n); console.log('✘ ' + n + '\n   ' + e.message); } };
const base = (o) => Object.assign({ dateKey: '2026-10-31', depositos: 0, retiros: 0, cargas: 0, bankInAuto: 0, bankOutAuto: 0, bankSource: 'api', pagosExternos: 0, fondeos: 0, gastos: 0, gastosBanco: 0, bankBalanceStart: null, bankBalanceEnd: null }, o);
const det = (o) => ({ sistema: Object.assign({ fondeos: 0 }, o.s || {}), banco: Object.assign({ entradasSinAcreditar: 0 }, o.b || {}), sinExplicar: o.sinExplicar || 0, cuentas: o.cuentas || [], girox: o.girox || {} });

caso('carga a mano en SECUNDARIA no rompe el arqueo de la principal', () => {
  // banco principal: entró 100.000; sistema: 100.000 auto + 20.000 cargados a mano en la secundaria
  const d = _closeApply(base({ depositos: 120000, bankInAuto: 100000, depositosSecundaria: 20000 }), cfg);
  assert.strictEqual(d.diferencia, 0); assert.strictEqual(d.arqueo, 'cuadra'); assert.strictEqual(d.ingresosTotal, 120000);
});
caso('retiro pagado desde la SECUNDARIA: es gasto real pero no sale de la caja principal', () => {
  const d = _closeApply(base({ depositos: 50000, retiros: 30000, bankInAuto: 50000, bankOutAuto: 0, pagosSecundaria: 30000, bankBalanceStart: 200000, bankBalanceEnd: 250000 }), cfg);
  assert.strictEqual(d.resultado, 20000); assert.strictEqual(d.resultadoCaja, 50000); assert.strictEqual(d.bankBalanceExpectedEnd, 250000); assert.strictEqual(d.arqueo, 'cuadra');
});
caso('sin secundarias el cálculo es el de siempre', () => {
  const d = _closeApply(base({ depositos: 80000, retiros: 10000, bankInAuto: 80000, bankOutAuto: 10000 }), cfg);
  assert.strictEqual(d.diferencia, 0); assert.strictEqual(d.resultado, 70000);
});
caso('control OK cuando todo cuadra', () => {
  const d = _closeApply(base({ depositos: 80000, bankInAuto: 80000 }), cfg); d.detalle = det({});
  const k = _closeCheck(d); assert.strictEqual(k.estado, 'ok', JSON.stringify(k.items.filter((x) => !x.ok))); assert.strictEqual(k.enCurso, false);
});
caso('control marca carga a mano sin cuenta y retiro sin "desde dónde"', () => {
  const d = _closeApply(base({ dateKey: '2026-11-03', depositos: 80000, bankInAuto: 80000 }), cfg); d.detalle = det({ s: { depositosSinCuentaN: 1, depositosSinCuenta: 5000, pagosManualN: 2, pagosManual: 9000 } });
  const k = _closeCheck(d); assert.strictEqual(k.estado, 'revisar'); assert.strictEqual(k.pendientes, 2);
});
caso('días de antes del cambio: la carga sin cuenta sólo informa (nadie la marcaba)', () => {
  const d = _closeApply(base({ depositos: 80000, bankInAuto: 80000 }), cfg); d.detalle = det({ s: { depositosSinCuentaN: 1, depositosSinCuenta: 5000 } });
  const k = _closeCheck(d); assert.strictEqual(k.estado, 'ok'); assert.ok(k.items.find((x) => x.key === 'dep_cuenta' && x.info));
});
caso('control marca transferencias sin acreditar y retiros trabados', () => {
  const d = _closeApply(base({ depositos: 80000, bankInAuto: 90000 }), cfg); d.detalle = det({ b: { entradasSinAcreditar: 10000 }, s: { pagosTrabadosN: 1 }, sinExplicar: 0 });
  const k = _closeCheck(d); assert.ok(k.items.find((x) => x.key === 'sin_acreditar' && !x.ok)); assert.ok(k.items.find((x) => x.key === 'trabados' && !x.ok));
});
caso('cuenta secundaria con saldo que no cuadra ⇒ revisar; sin saldos ⇒ sólo informa', () => {
  const d = _closeApply(base({ depositos: 0 }), cfg);
  d.detalle = det({ cuentas: [{ id: 'main' }, { id: 's1', name: 'Fiwind', entradas: 5000, salidas: 0, entradasN: 1, salidasN: 0, diferencia: -5000 }, { id: 's2', name: 'Otra', entradas: 100, salidas: 0, entradasN: 1, diferencia: null }] });
  const k = _closeCheck(d); assert.ok(k.items.find((x) => x.key === 'acc_s1' && !x.ok)); assert.ok(k.items.find((x) => x.key === 'acc_s2' && x.info));
});
caso('día de hoy ⇒ "en curso"', () => { const d = _closeApply(base({ dateKey: '2026-11-01' }), cfg); d.detalle = det({}); assert.strictEqual(_closeCheck(d).enCurso, true); });
console.log(`\n${ok}/${ok + fails.length} casos OK`); process.exit(fails.length ? 1 : 0);
