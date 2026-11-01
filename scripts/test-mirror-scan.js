#!/usr/bin/env node
// #1004 — juego espejo entre cuentas NO vinculadas (una gana, una o dos pierden lo mismo, varias veces). node scripts/test-mirror-scan.js
'use strict';
const assert = require('assert'); const M = require('../src/services/mirrorScan.js');
let ok = 0; const fails = []; const caso = (n, f) => { try { f(); ok++; console.log('✔ ' + n); } catch (e) { fails.push(n); console.log('✘ ' + n + '\n   ' + e.message); } };
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
// 300 jugadores "normales" en 40 franjas (juegan al azar, ganan o pierden al azar)
function base(nb) { const B = []; for (let b = 0; b < nb; b++) { const players = {}; for (let i = 0; i < 300; i++) if (rnd() < 0.35) { const wag = 5000 + rnd() * 120000; players['p' + i] = { wagered: wag, netwin: wag * (rnd() * 0.5 - 0.27), bonusGranted: 0 }; } B.push({ key: 'b' + String(b).padStart(2, '0'), players }); } return B; }
const put = (B, b, u, wag, nw, bon) => { B[b].players[u] = { wagered: wag, netwin: nw, bonusGranted: bon || 0 }; };
caso('par espejo (gana uno con bono, pierde el otro lo mismo) en 3 franjas ⇒ detectado', () => {
  const B = base(40); for (const b of [5, 12, 30]) { put(B, b, 'gana1', 80000, -40000, 20000); put(B, b, 'pierde1', 82000, 41500); }
  const r = M.analyze(B, { bonus: new Set(['gana1']), wd: new Set(['gana1']) }); const g = r.find((x) => x.members.join() === 'gana1,pierde1');
  assert.ok(g, 'no lo encontró'); assert.strictEqual(g.hits.length, 3); assert.ok(r.indexOf(g) < 3, 'tiene que estar arriba: ' + r.indexOf(g));
});
caso('dos pierden y uno gana (trío) ⇒ detectado', () => {
  const B = base(40); for (const b of [3, 9, 22]) { put(B, b, 'G', 90000, -60000, 30000); put(B, b, 'L1', 45000, 32000); put(B, b, 'L2', 40000, 27000); }
  const r = M.analyze(B, { bonus: new Set(['G']), wd: new Set(['G']) }); assert.ok(r.find((x) => x.members.join() === 'G,L1,L2'), JSON.stringify(r.slice(0, 3).map((x) => x.members)));
});
caso('los roles se cambian (hoy gana A, mañana gana B) ⇒ sigue siendo el mismo par', () => {
  const B = base(40); put(B, 4, 'A', 60000, -30000); put(B, 4, 'Bx', 60000, 30500); put(B, 18, 'A', 70000, 35000); put(B, 18, 'Bx', 70000, -34000); put(B, 33, 'A', 50000, -25000); put(B, 33, 'Bx', 52000, 25500);
  const r = M.analyze(B, { wd: new Set(['Bx']) }); assert.ok(r.find((x) => x.members.join() === 'A,Bx' && x.hits.length === 3));
});
caso('jugadores normales al azar: casi ningún falso positivo', () => { const r = M.analyze(base(40), {}); assert.ok(r.length <= 3, 'falsos positivos: ' + r.length + ' ' + JSON.stringify(r.slice(0, 3).map((x) => [x.members, x.hits.length, x.coactivity]))); });
caso('una sola coincidencia no alcanza', () => { const B = base(40); put(B, 7, 'S1', 80000, -40000, 10000); put(B, 7, 'S2', 80000, 40000); const r = M.analyze(B, { bonus: new Set(['S1']) }); assert.ok(!r.find((x) => x.members.includes('S1') && x.members.includes('S2'))); });
caso('pérdida muy distinta de la ganancia ⇒ no es espejo', () => { const B = base(40); for (const b of [5, 12, 30]) { put(B, b, 'Q1', 80000, -40000, 1); put(B, b, 'Q2', 80000, 12000); } const r = M.analyze(B, { bonus: new Set(['Q1']) }); assert.ok(!r.find((x) => x.members.join() === 'Q1,Q2')); });
caso('franjas cerradas alineadas a hora argentina', () => { const b = M.bucketsFor(new Date('2026-11-01T15:20:00Z'), { bucketHours: 3, days: 1 }); assert.strictEqual(b.length, 8); assert.strictEqual(b[b.length - 1].to.getTime() + 1000, new Date('2026-11-01T12:00:00-03:00').getTime()); });
console.log(`\n${ok}/${ok + fails.length} casos OK`); process.exit(fails.length ? 1 : 0);
