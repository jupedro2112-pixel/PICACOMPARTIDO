#!/usr/bin/env node
// #1013 OFICINA — reglas puras de los puestos (src/services/office.js). Datos INVENTADOS: node scripts/test-office.js
'use strict';
const assert = require('assert');
const office = require('../src/services/office');
let ok = 0; const fails = [];
const caso = (n, f) => { try { f(); ok++; console.log('✔ ' + n); } catch (e) { fails.push(n); console.log('✘ ' + n + '\n   ' + e.message); } };
const base = () => ({
  money: { deposits: 1000000, withdrawals: 600000, result: 400000, gifts: 100000, giftRatio: 0.1, depositors: 50, registered: 30, giftsByType: [{ label: 'Reembolso', total: 60000 }], withdrawalCount: 12 },
  prevMoney: { deposits: 800000, result: 300000 },
  stalls: { payouts: { requested: 20, paidAuto: 19, paidManual: 1, waitingNow: 0, autoMinutes: 2, manualMinutes: 30 }, deposits: { auto: 40, manual: 2, review: 0, noMatch: 0, aiFailed: 1 } },
  sys: { giroxOk: true, hgcashToken: true, hgcashEnabled: true, hgcashMode: 'auto', aiOk: true, dbMs: 40 },
  bank: { balance: 2000000, minArs: 500000, low: false, outage: false, failedPayouts: 0, unresolved: 0, lastCloseKey: '2026-10-31', lastCloseOk: true },
  sec: { blocks: 1, autoBlocks: 0, watches: 2, rejects: 0, dups: 0, watchingNow: 3, heldAntifraud: 0, unreviewedFlagged: 0, suspicious: 0, recent: [] },
  support: { openChats: 4, waiting: 0, oldestWaitMin: null, delays24: 3, avgDelayMin: 4, unanswered24: 0, pendingReceipts: 0, oldestReceiptMin: null, guestsOpen: 0 },
  mkt: { yesterdayKey: '2026-10-31', spendYesterday: 50000, spendYesterdayLoaded: true, spend7: 300000, registered24: 30, firstDeps24: 8, firstDeps7: 40, byCampaign24: [{ campaign: 'PUB1', registered: 20, firstDeps: 6 }] },
  recon: { cooling: 30, lost: 20, list: [{ username: 'juan', deposits: 5, total: 90000, lastDays: 8, hasApp: true }] },
  content: { stories24: [{ title: 'Soporte 24 h', views: 300, clicks: 20, reactions: 5, auto: true }], best7: { title: 'Pagos', views: 900, clicks: 80 }, paid24: { n: 12, total: 600000 }, tomorrowDow: 1 },
  promo: { monthGiftRatio: 0.12, freeSpins24: 40, secondOffered7: 30, secondUsed7: 6 }
});
caso('día normal: todos los puestos en verde y cada uno con su rutina', () => {
  const r = office.buildAll(base(), {});
  for (const k of office.DESK_KEYS) { assert.ok(r[k], 'falta ' + k); assert.ok(r[k].tasks.some((t) => t.kind === 'rutina'), k + ' sin rutina'); }
  for (const k of ['operaciones', 'atencion', 'seguridad', 'banco', 'marketing', 'promos']) assert.strictEqual(r[k].verdict, 'ok', k);
});
caso('banco automático apagado ⇒ Dirección en rojo con la tarea de activarlo', () => {
  const d = base(); d.sys.hgcashEnabled = false; const r = office.buildAll(d, {});
  assert.strictEqual(r.direccion.verdict, 'bad'); assert.ok(r.direccion.tasks.some((t) => /banco automático/i.test(t.text)));
});
caso('retiros esperando y cargas viejas ⇒ Operaciones con tareas concretas', () => {
  const d = base(); d.stalls.payouts.waitingNow = 6; d.support.pendingReceipts = 3; d.support.oldestReceiptMin = 45; const r = office.buildAll(d, {}).operaciones;
  assert.strictEqual(r.verdict, 'bad'); assert.ok(r.tasks.some((t) => /6 retiros/.test(t.text))); assert.ok(r.tasks.some((t) => /Cargas pendientes/.test(t.text)));
});
caso('gasto de ayer sin cargar ⇒ tarea de Marketing', () => {
  const d = base(); d.mkt.spendYesterdayLoaded = false; const r = office.buildAll(d, {}).marketing;
  assert.strictEqual(r.verdict, 'warn'); assert.ok(r.tasks.some((t) => /Cargar el gasto/.test(t.text)));
});
caso('campaña que trae registros que no cargan ⇒ alerta', () => {
  const d = base(); d.mkt.byCampaign24 = [{ campaign: 'MALA', registered: 25, firstDeps: 0 }]; assert.ok(office.buildAll(d, {}).marketing.alerts.some((a) => /MALA/.test(a.text)));
});
caso('recontacto: un cliente por tarea', () => {
  const r = office.buildAll(base(), {}).recontacto; assert.ok(r.tasks.some((t) => t.kind === 'dato' && /^Escribirle a @juan/.test(t.text)));
});
caso('regalos > 20% del mes ⇒ Promos en rojo', () => { const d = base(); d.promo.monthGiftRatio = 0.25; assert.strictEqual(office.buildAll(d, {}).promos.verdict, 'bad'); });
caso('saldo bajo ⇒ Banco en rojo', () => { const d = base(); d.bank.low = true; d.bank.balance = 100000; assert.strictEqual(office.buildAll(d, {}).banco.verdict, 'bad'); });
caso('ayer cumplió menos de la mitad ⇒ aviso en Dirección', () => { const r = office.buildAll(base(), { atencion: { done: 1, total: 6 } }); assert.ok(r.direccion.alerts.some((a) => /cumplió sólo 1\/6/.test(a.text))); });
caso('rehacer el informe conserva lo tildado y las notas', () => {
  const t1 = office.buildAll(base(), {}).atencion.tasks; const old = t1.map((t, i) => Object.assign({}, t, i === 0 ? { done: true, doneBy: 'ana', note: 'listo' } : {}));
  const m = office.mergeTasks(old, office.buildAll(base(), {}).atencion.tasks); assert.ok(m[0].done && m[0].doneBy === 'ana' && m[0].note === 'listo');
});
caso('una alerta que desaparece pero ya estaba tildada queda (marcada vieja)', () => {
  const old = [{ id: 'tx', text: 'vieja', kind: 'alerta', done: true, doneBy: 'ana' }]; const m = office.mergeTasks(old, [{ id: 'ty', text: 'nueva', kind: 'rutina' }]);
  assert.ok(m.some((t) => t.id === 'tx' && t.stale)); assert.strictEqual(m.length, 2);
});
caso('ids de tarea estables', () => { assert.strictEqual(office.taskId('a|b'), office.taskId('a|b')); assert.notStrictEqual(office.taskId('a|b'), office.taskId('a|c')); });
caso('datos faltantes no rompen ningún puesto', () => { const r = office.buildAll({}, {}); for (const k of office.DESK_KEYS) assert.ok(r[k] && typeof r[k].head === 'string', k); });
console.log(`\n${ok}/${ok + fails.length} casos OK`); process.exit(fails.length ? 1 : 0);
