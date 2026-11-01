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
caso('análisis semanal: semana buena ⇒ verde y "nada urgente"', () => {
  const b = { range: { from: new Date('2026-10-25T03:00:00Z'), to: new Date('2026-11-01T03:00:00Z') }, money: { deposits: 2000000, depositCount: 400, depositors: 150, withdrawals: 1500000, withdrawalCount: 80, result: 500000, resultChg: 0.1, ticket: 5000, registered: 60, gifts: 200000, giftRatio: 0.1, giftsByType: [{ label: 'Reembolso', total: 120000 }], prev: { result: 450000 } },
    retention: [{ rate: 0.4, returned: 40, prevDepositors: 100 }, { rate: 0.42, returned: 42, prevDepositors: 100 }], funnel: null, alerts: [],
    stalls: { payouts: { paidAuto: 78, paidManual: 2, held: 2, waitingNow: 0, autoMinutes: 1, manualMinutes: 30, reasons: [] }, deposits: { auto: 380, manual: 10, review: 5, noMatch: 2, aiFailed: 1, aiFallback: 3, reviewReasons: [] } } };
  const a = B.weeklyAnalysis(b, { secondDeposit: { offered: 50, used: 15 }, antifraud: {}, shift: { pending: 0 }, bank: { balance: 900000, minArs: 500000 } });
  assert.strictEqual(a.verdict, 'good', JSON.stringify(a.actions)); assert.ok(/ANÁLISIS SEMANAL/.test(a.text)); assert.ok(/98%/.test(a.text)); assert.ok(/Nada urgente/.test(a.text));
});
caso('análisis semanal: trabas, regalos altos, banco bajo y pendientes ⇒ rojo con acciones', () => {
  const b = { money: { deposits: 1000000, depositCount: 200, result: -20000, giftRatio: 0.3, gifts: 300000, giftsByType: [], prev: {} }, retention: [{ rate: 0.5 }, { rate: 0.4 }], alerts: [],
    stalls: { payouts: { paidAuto: 5, paidManual: 15, held: 15, waitingNow: 3, reasons: [{ label: 'antifraude: no se pudo chequear (API)', n: 12 }] }, deposits: { auto: 10, manual: 20, review: 5, noMatch: 6, reviewReasons: [{ label: 'posible duplicado', n: 5 }] } } };
  const a = B.weeklyAnalysis(b, { secondDeposit: { offered: 40, used: 2 }, shift: { pending: 4 }, bank: { balance: 100000, minArs: 500000 } });
  assert.strictEqual(a.verdict, 'bad'); const all = a.actions.map((x) => x.text).join(' | ');
  for (const re of [/NEGATIVA/, /regalos están en 30%/, /no se pudo chequear/, /posible duplicado/, /sin dueño/, /esperando/, /Para revisar/, /fondear/, /2ª carga/, /Volvieron menos/]) assert.ok(re.test(all), re + ' en ' + all);
});
caso('análisis semanal: sin datos no se rompe', () => { const a = B.weeklyAnalysis({}, {}); assert.ok(a.text.length > 50); assert.ok(['good', 'ok', 'bad'].includes(a.verdict)); });
caso('análisis semanal: lista la gente con señales de estafa y los retiros frenados viejos', () => {
  const a = B.weeklyAnalysis({ money: { deposits: 100000, result: 10000, prev: {} } }, { fraud: { dupNew: 6, people: [{ username: 'tester_a', what: 'bloqueado por el antifraude', why: 'juego espejo', by: 'antifraude' }], heldNow: [{ username: 'tester_b', amount: 50000, why: 'puntaje alto', hours: 5 }] } });
  assert.ok(/tester_a: bloqueado por el antifraude — juego espejo/.test(a.text)); assert.ok(/tester_b \$50\.000/.test(a.text));
  const all = a.actions.map((x) => x.text).join(' | '); assert.ok(/más de 2 horas/.test(all)); assert.ok(/cuentas secundarias nuevas/.test(all)); assert.strictEqual(a.numbers.fraudPeople, 1);
});
caso('análisis semanal: compara con el último cierre y arma la evolución del proyecto', () => {
  const closes = [{ from: '2026-10-19', to: '2026-10-25', numbers: { deposits: 2000000, result: 400000, depositors: 100, registered: 50, repeatRate: 0.4, giftRatio: 0.15, gifts: 300000, fraudPeople: 2 } },
    { from: '2026-10-12', to: '2026-10-18', numbers: { deposits: 2600000, result: -50000, gifts: 300000, giftRatio: 0.12, repeatRate: 0.45 } },
    { from: '2026-10-05', to: '2026-10-11', numbers: { deposits: 2800000, result: 100000, gifts: 200000, giftRatio: 0.1, repeatRate: 0.5 } }];
  const a = B.weeklyAnalysis({ money: { deposits: 1500000, result: -20000, depositors: 80, registered: 40, gifts: 300000, giftRatio: 0.2, prev: {} } }, { closes });
  assert.ok(/Comparado con la semana anterior/i.test(a.text)); assert.ok(/Cargas: \$1\.500\.000 vs \$2\.000\.000 ⚠️ ▼/.test(a.text), a.text);
  assert.ok(/Cómo va el proyecto/i.test(a.text)); assert.ok(/📉 bajando/.test(a.text)); assert.ok(/Semanas en negativo: 2 de 4/.test(a.text));
  assert.ok(a.actions.some((x) => /vienen bajando/.test(x.text)));
});
caso('análisis semanal: sin cierres todavía avisa que es la primera medición', () => { const a = B.weeklyAnalysis({ money: {} }, {}); assert.ok(/primera medición/.test(a.text)); });
console.log(`\n${ok}/${ok + fails.length} casos OK`); process.exit(fails.length ? 1 : 0);
