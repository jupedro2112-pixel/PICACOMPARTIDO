#!/usr/bin/env node
// #1009 — Tablero del negocio: retención, embudo, rinde de regalos, campañas y alertas. Datos INVENTADOS. node scripts/test-business-board.js
'use strict';
const assert = require('assert'); const B = require('../src/services/businessBoard.js');
let ok = 0; const fails = []; const caso = (n, f) => { try { f(); ok++; console.log('✔ ' + n); } catch (e) { fails.push(n); console.log('✘ ' + n + '\n   ' + e.message); } };
caso('retención: % de los de la semana anterior que volvieron', () => {
  const m = new Map([['a', [0, 1]], ['b', [1]], ['c', [0, 1, 2]], ['d', [2]]]);
  const r = B.retention(m, 2); assert.strictEqual(r.length, 2);
  assert.strictEqual(r[1].k, 0); assert.strictEqual(r[1].prevDepositors, 3); assert.strictEqual(r[1].returned, 2); assert.ok(Math.abs(r[1].rate - 2 / 3) < 1e-9);
  assert.strictEqual(r[0].k, 1); assert.strictEqual(r[0].returned, 1); assert.strictEqual(r[0].rate, 0.5);
});
caso('embudo: cuenta pasos y marca dónde más se pierde', () => {
  const now = new Date('2026-11-01T12:00:00Z'); const rows = [];
  for (let i = 0; i < 100; i++) rows.push({ n: i < 30 ? 6 : (i < 40 ? 2 : 1), last: i < 25 ? new Date('2026-10-28') : new Date('2026-09-01') });
  const f = B.funnel(200, rows, now); assert.strictEqual(f.d1, 100); assert.strictEqual(f.d2, 40); assert.strictEqual(f.d5, 30); assert.strictEqual(f.active30, 25);
  assert.strictEqual(f.worst.key, 'd2');
});
caso('embudo #1010: 210 → 57 → 13 marca la 2ª carga (más gente perdida) y "activos" se compara con la 1ª carga', () => {
  const now = new Date('2026-11-01T12:00:00Z'); const rows = [];
  for (let i = 0; i < 210; i++) rows.push({ n: i < 13 ? 5 : (i < 57 ? 2 : 1), last: new Date('2026-10-28') });
  const f = B.funnel(620, rows, now); assert.strictEqual(f.d2, 57); assert.strictEqual(f.d5, 13);
  assert.strictEqual(f.worst.key, 'd2'); assert.strictEqual(f.worst.lost, 153);
  const act = f.steps.find((s) => s.key === 'active30'); assert.strictEqual(act.ofPrev, 1); // 210 de 210, no "1615 %"
});
caso('regalos: rinde y los pegados a la carga no se miden', () => {
  const g = B.giftLift([{ type: 'refund', users: 10, n: 10, cost: 100000, before: 500000, after: 550000 }, { type: 'mission', users: 5, n: 5, cost: 10000, before: 0, after: 40000 }, { type: 'bonus', users: 9, n: 9, cost: 300000, before: 1, after: 2 }]);
  const by = Object.fromEntries(g.map((x) => [x.type, x]));
  assert.strictEqual(by.refund.verdict, 'bad'); assert.strictEqual(by.refund.roi, 0.5);
  assert.strictEqual(by.mission.verdict, 'good'); assert.strictEqual(by.bonus.roi, null); assert.strictEqual(g[0].type, 'bonus'); // ordenado por costo
});
caso('campañas: se paga / no / sin gasto', () => {
  const c = B.campaigns([{ campaign: 'A', users: 50, depositors: 20, deposits: 900000, withdrawals: 300000, spend: 400000 }, { campaign: 'B', users: 40, depositors: 5, deposits: 100000, withdrawals: 60000, spend: 300000 }, { campaign: 'ORGÁNICO', users: 30, depositors: 10, deposits: 200000, withdrawals: 0, spend: 0 }]);
  const by = Object.fromEntries(c.map((x) => [x.campaign, x]));
  assert.strictEqual(by.A.verdict, 'good'); assert.strictEqual(by.A.costPerDepositor, 20000); assert.strictEqual(by.B.verdict, 'bad'); assert.strictEqual(by['ORGÁNICO'].verdict, 'nospend');
});
caso('diagnóstico: negativo ⇒ rojo; regalos altos y campaña mala aparecen', () => {
  const b = { money: { result: -50000, resultChg: -0.4, deposits: 1000000, giftRatio: 0.3 }, giftLevel: B.giftLevel(0.3), retention: [{ rate: 0.5 }, { rate: 0.45 }, { rate: 0.4 }],
    funnel: null, gifts: [], campaigns: B.campaigns([{ campaign: 'B', users: 40, depositors: 5, deposits: 100000, withdrawals: 60000, spend: 300000 }]) };
  const d = B.diagnose(b); assert.strictEqual(d.color, 'bad'); assert.ok(d.alerts.length >= 4, JSON.stringify(d.alerts.map((a) => a.text)));
  assert.ok(/NEGATIVO/.test(d.alerts[0].text)); assert.ok(/Salieron/.test(d.headline));
});
caso('diagnóstico: todo bien ⇒ verde y "nada para corregir"', () => {
  const d = B.diagnose({ money: { result: 300000, resultChg: 0.1, deposits: 2000000, giftRatio: 0.1 }, giftLevel: B.giftLevel(0.1), retention: [{ rate: 0.4 }, { rate: 0.42 }, { rate: 0.45 }], funnel: null, gifts: [], campaigns: [] });
  assert.strictEqual(d.color, 'good'); assert.strictEqual(d.alerts.length, 0); assert.ok(/No hay nada/.test(d.headline));
});
caso('semáforo de regalos: 15% / 20%', () => { assert.strictEqual(B.giftLevel(0.15), 'good'); assert.strictEqual(B.giftLevel(0.2), 'ok'); assert.strictEqual(B.giftLevel(0.21), 'bad'); assert.strictEqual(B.giftLevel(null), 'na'); });
console.log(`\n${ok}/${ok + fails.length} casos OK`); process.exit(fails.length ? 1 : 0);
