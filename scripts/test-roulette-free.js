#!/usr/bin/env node
// #1010 — giro GRATIS de la ruleta + avisos de reembolso con monto. Usa las funciones REALES de server.js / notificationService.js
// (extraídas del código, sin base ni node_modules). Datos INVENTADOS: node scripts/test-roulette-free.js
'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const S = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const N = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'notificationService.js'), 'utf8');
const fnIn = (src, name) => { const m = new RegExp('^(?:async )?function ' + name + '\\(', 'm').exec(src); if (!m) throw new Error('no está ' + name); let d = 0; const i = src.indexOf('{', m.index); for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && !--d) return src.slice(m.index, j + 1); } return ''; };
const constIn = (src, name) => { const i = src.indexOf('const ' + name + ' = '); if (i < 0) throw new Error('no está ' + name); let d = 0; for (let j = src.indexOf('=', i); j < src.length; j++) { const c = src[j]; if (c === '[' || c === '{' || c === '(') d++; else if (c === ']' || c === '}' || c === ')') d--; else if (c === ';' && d === 0) return src.slice(i, j + 1); } return ''; };

const R = new Function(['let _giftMaxCache = 15000;', fnIn(S, '_capGift'), constIn(S, 'ROULETTE_FREE_PRIZES'), fnIn(S, '_normalizeRoulettePrizes'), fnIn(S, '_normalizeRouletteFree'), fnIn(S, '_rouletteDateKeyART'), fnIn(S, '_rouletteEndOfDayART'),
  'return { _normalizeRouletteFree, _rouletteEndOfDayART, _normalizeRoulettePrizes, _capGift };'].join('\n'))();
const G = new Function([constIn(N, 'ROULETTE_TEXT_RE'), fnIn(N, 'isRouletteText'), 'return { isRouletteText };'].join('\n'))();
// _refundRemindPlan con dependencias de mentira (rangos fijos) para ver QUÉ DÍAS sale cada aviso.
const plan = new Function('getRefundTiersByPeriod', 'periodRanges', '_schedArtKey', 'REFUND_REMIND_DEFAULT', 'REFUND_REMIND_WEEKLY_DEFAULT', 'REFUND_REMIND_MONTHLY_DEFAULT',
  fnIn(S, '_refundRemindPlan') + '\nreturn _refundRemindPlan;')(
  async () => ({ daily: [{ pct: 10 }], weekly: [{ pct: 3 }], monthly: [{ pct: 1 }] }),
  { getYesterdayRangeArgentinaEpoch: () => ({ fromEpoch: 0, toEpoch: 1 }), getLastWeekRangeArgentinaEpoch: () => ({ fromEpoch: 0, toEpoch: 1, fromDateStr: '2026-10-26' }), getLastMonthRangeArgentinaEpoch: () => ({ fromEpoch: 0, toEpoch: 1, fromDateStr: '2026-10-01' }) },
  (d) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10), 'd', 'w', 'm');

let ok = 0; const fails = [];
const caso = async (n, f) => { try { await f(); ok++; console.log('✔ ' + n); } catch (e) { fails.push(n); console.log('✘ ' + n + '\n   ' + e.message); } };
const art = (s) => new Date(s + '-03:00'); // hora argentina

(async () => {
  await caso('giro gratis: por defecto sólo % y "sin premio", nunca plata', () => { const f = R._normalizeRouletteFree(null); assert.ok(f.enabled); assert.strictEqual(f.minDeposits, 1); assert.ok(f.prizes.length >= 3); assert.ok(f.prizes.every((p) => p.type !== 'cash')); });
  await caso('giro gratis: si el panel manda plata, se descarta; el % se topea en 50', () => { const f = R._normalizeRouletteFree({ prizes: [{ type: 'cash', value: 100000, weight: 1 }, { type: 'percent', value: 200, weight: 5 }] }); assert.strictEqual(f.prizes.length, 1); assert.strictEqual(f.prizes[0].value, 50); });
  await caso('giro gratis: mínimo 1 carga real (0 no se acepta: frena multicuentas de landing)', () => { assert.strictEqual(R._normalizeRouletteFree({ minDeposits: 0 }).minDeposits, 1); assert.strictEqual(R._normalizeRouletteFree({ minDeposits: 3 }).minDeposits, 3); });
  await caso('el % del giro gratis vence a las 23:59:59 de HOY (hora argentina)', () => { const e = R._rouletteEndOfDayART(art('2026-11-01T22:30:00')); assert.strictEqual(e.toISOString(), '2026-11-02T02:59:59.999Z'); const e2 = R._rouletteEndOfDayART(art('2026-11-01T00:10:00')); assert.strictEqual(e2.toISOString(), '2026-11-02T02:59:59.999Z'); });
  await caso('guard de push: texto con "ruleta" sigue bloqueado…', () => assert.ok(G.isRouletteText('🔥 La ruleta te espera', 'girá ya', { kind: 'promo' })));
  await caso('…salvo el aviso propio del giro gratis (allowRoulette=1)', () => assert.ok(!G.isRouletteText('🎰 Tu giro GRATIS de hoy está listo', 'Entrá y girá', { type: 'roulette_ready', allowRoulette: '1' })));
  await caso('reembolso diario: primer aviso todo el día; el último aviso recién a las 20 h', async () => {
    assert.ok((await plan('daily', art('2026-11-03T11:30:00'))).due);
    assert.ok(!(await plan('daily_last', art('2026-11-03T19:59:00'))).due); assert.ok((await plan('daily_last', art('2026-11-03T20:05:00'))).due);
    const p = await plan('daily_last', art('2026-11-03T20:05:00')); assert.ok(p.last && /vence/.test(p.title) && p.kind === 'daily');
  });
  await caso('reembolso semanal: lunes y martes (los días en que se puede reclamar), NO jueves', async () => {
    assert.ok((await plan('weekly', art('2026-11-02T12:00:00'))).due); // lunes
    const mar = await plan('weekly', art('2026-11-03T12:00:00')); assert.ok(mar.due && mar.last); // martes = último aviso
    assert.ok(!(await plan('weekly', art('2026-11-05T12:00:00'))).due); // jueves
  });
  await caso('reembolso mensual: día 7 (abre el reclamo) y 15, NO el 1', async () => {
    assert.ok(!(await plan('monthly', art('2026-11-01T12:00:00'))).due);
    assert.ok((await plan('monthly', art('2026-11-07T12:00:00'))).due); assert.ok((await plan('monthly', art('2026-11-15T12:00:00'))).due);
  });
  await caso('tope por regalo $15.000: premio en plata de la ruleta y cualquier monto', () => { const p = R._normalizeRoulettePrizes([{ type: 'cash', value: 50000, weight: 1 }, { type: 'percent', value: 30, weight: 1 }]); assert.strictEqual(p[0].value, 15000); assert.strictEqual(p[1].value, 30); assert.strictEqual(R._capGift(9000), 9000); assert.strictEqual(R._capGift(40000), 15000); });
  await caso('el título del aviso lleva el monto ({monto})', async () => { const p = await plan('daily', art('2026-11-03T11:30:00')); assert.ok(p.title.includes('{monto}')); });
  console.log(`\n${ok}/${ok + fails.length} casos OK`); process.exit(fails.length ? 1 : 0);
})();
