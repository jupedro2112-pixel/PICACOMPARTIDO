#!/usr/bin/env node
// #1003 — historias por segmento (nuevos = informativas, activos = rotación) y reparto de los regalos al azar. node scripts/test-story-segments.js
'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const A = require('../src/services/storyAutopilot.js');
const S = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const fn = (name) => { const m = new RegExp('^function ' + name + '\\(', 'm').exec(S); let d = 0; const i = S.indexOf('{', m.index); for (let j = i; j < S.length; j++) { if (S[j] === '{') d++; else if (S[j] === '}' && !--d) return S.slice(m.index, j + 1); } return ''; };
const giftDay = new Function('require', fn('_storyGiftDayFor') + '; return _storyGiftDayFor;')(require);
let ok = 0; const fails = [];
const caso = (n, f) => { try { f(); ok++; console.log('✔ ' + n); } catch (e) { fails.push(n); console.log('✘ ' + n + '\n   ' + e.message); } };
const ctx = { firstPct: 50, dow: 4, winners: [{ username: 'jugador123', amount: 250000 }], games: [{ name: 'Sugar Rush', path: '/play/2/x' }, { name: 'Gates', path: '/play/2/y' }] };
caso('5 informativas para NUEVOS + 5 de rotación para ACTIVOS', () => { const p = A.planDay('2026-11-05', [], ctx); assert.strictEqual(p.filter((x) => x.audience === 'new').length, 5); assert.strictEqual(p.filter((x) => x.audience === 'active').length, 5); });
caso('los nuevos sólo ven temas del servicio (cómo funciona, carga, retiro, seguridad…)', () => { for (let d = 1; d <= 20; d++) { const p = A.planDay('2026-11-' + String(d).padStart(2, '0'), [], ctx); p.filter((x) => x.audience === 'new').forEach((x) => assert.ok(x.theme === 'soporte' || A.NEW_KEYS.includes(x.theme), x.theme)); } });
caso('la primera de cada segmento es Soporte', () => { const p = A.planDay('2026-11-05', [], ctx); assert.strictEqual(p.find((x) => x.slot === 0).theme, 'soporte'); assert.strictEqual(p.find((x) => x.slot === 'a0').theme, 'soporte'); });
caso('activos: ganadores de ayer con usuario ENMASCARADO y slot del día', () => { const p = A.planDay('2026-11-05', [], ctx); const g = p.find((x) => x.kind === 'ganadores'); assert.ok(g && !/jugador123/.test(g.text) && /ju\*\*\*3/.test(g.text)); assert.ok(p.find((x) => x.slot !== 0 && x.kind === 'slot' && x.audience === 'active')); });
caso('sin ganadores no inventa la historia', () => { const p = A.planDay('2026-11-05', [], Object.assign({}, ctx, { winners: [] })); assert.ok(!p.find((x) => x.kind === 'ganadores')); assert.strictEqual(p.filter((x) => x.audience === 'active').length, 5); });
caso('la rotación de los activos cambia día a día', () => { const t = (d) => A.planDay(d, [], ctx).filter((x) => x.audience === 'active' && x.kind === 'servicio' && x.theme !== 'soporte').map((x) => x.title).join('|'); assert.notStrictEqual(t('2026-11-05'), t('2026-11-06')); });
caso('el bono de la semana y los partidos los ven todos', () => { const p = A.planDay('2026-11-04', [{ home: 'River', away: 'Boca', league: 'LPF', hour: '21:00', score: 20 }], Object.assign({}, ctx, { dow: 3, weeklyBonus: { pct: 100, hours: 3 }, bonusDays: [3] })); assert.strictEqual(p.find((x) => x.kind === 'bono').audience, 'all'); assert.strictEqual(p.find((x) => x.kind === 'deporte').audience, 'all'); });
caso('regalo al azar: cada cliente exactamente 1 vez por tanda de 7 días', () => { for (const uid of ['u1', 'u2', 'abc', 'zz9']) for (let b = 0; b < 5; b++) { let n = 0; for (let d = b * 7; d < b * 7 + 7; d++) if (giftDay(uid, 20000 * 7 + d, 7)) n++; assert.strictEqual(n, 1, uid); } });
caso('regalo al azar: repartido (no a todos el mismo día)', () => { const c = new Array(7).fill(0); for (let i = 0; i < 700; i++) for (let d = 0; d < 7; d++) if (giftDay('user' + i, 140000 + d, 7)) c[d]++; assert.ok(Math.min(...c) > 60 && Math.max(...c) < 140, c.join(',')); });
console.log(`\n${ok}/${ok + fails.length} casos OK`); process.exit(fails.length ? 1 : 0);
