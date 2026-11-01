#!/usr/bin/env node
// #997 — push cortas y con el bono adelante (src/utils/pushText.js): node scripts/test-push-text.js
'use strict';
const assert = require('assert');
const { concise, TITLE_MAX, BODY_MAX } = require('../src/utils/pushText');
const L = (s) => Array.from(s).length;
let ok = 0; const fails = [];
const caso = (n, fn) => { try { fn(); ok++; console.log('✔ ' + n); } catch (e) { fails.push(n); console.log('✘ ' + n + '\n   ' + e.message); } };

caso('texto largo del panel ⇒ cuerpo ≤ 100, sin "(con el tope de bonos)" ni "ya está activo en el botón", con el bono', () => {
  const c = concise('🔥 Promo de viernes', 'Transferís, mandás la foto y se acredita solo. Hoy tenés +50% EXTRA en tu carga por 4 horas (con el tope de bonos). Ya está activo en el botón CARGAR AHORA. Y además podés retirar cuando quieras a tu CBU sin vueltas.', { tag: 'notif-batch' });
  console.log('   → ' + c.title + ' | ' + c.body);
  assert.ok(L(c.body) <= BODY_MAX); assert.ok(/\+50%/.test(c.body)); assert.ok(!/tope|CARGAR AHORA/.test(c.body));
  assert.ok(/^🎁 BONO \+50%/.test(c.title), 'el bono va adelante en el título');
});
caso('si el título ya dice el bono, no se repite', () => {
  const c = concise('🎁 BONO +30% en tu carga hoy', 'Válido 4 h. Transferís y se acredita solo ⚡', {});
  assert.strictEqual(c.title, '🎁 BONO +30% en tu carga hoy'); assert.strictEqual(c.body, 'Válido 4 h. Transferís y se acredita solo ⚡');
});
caso('fichas de regalo y duplicamos se marcan en el título', () => {
  assert.ok(/\$5\.000 en fichas/.test(concise('Te extrañamos', 'Te acreditamos $5.000 en fichas de regalo, ya están en tu cuenta.', {}).title));
  assert.ok(/DUPLICA/i.test(concise('🎄 ¡Feliz Navidad!', 'Nuestro regalo: te DUPLICAMOS la carga por 4 horas.', {}).title));
});
caso('aviso sin bono ⇒ no inventa bono', () => {
  const c = concise('✅ Carga acreditada', '$10.000 en tu cuenta. Saldo: $12.500', { tag: 'deposit' });
  assert.strictEqual(c.title, '✅ Carga acreditada'); assert.strictEqual(c.body, '$10.000 en tu cuenta. Saldo: $12.500');
});
caso('título largo ⇒ ≤ 45 cortado en palabra', () => {
  const c = concise('🎄 ¡Arranca la temporada de fiestas en Pica Roja con todo lo que tenemos!', 'Hola', {});
  assert.ok(L(c.title) <= TITLE_MAX, c.title); assert.ok(/…$/.test(c.title));
});
caso('chat: sólo se recorta el largo, no se toca el texto', () => {
  const t = 'Hola, ya te cargamos el +50% que pediste (con el tope de bonos). Cualquier cosa avisame.';
  const c = concise('💬 Te respondió Soporte', t, { tag: 'chat-message' }); assert.strictEqual(c.body, t);
});
caso('una sola oración larguísima ⇒ se corta con …', () => {
  const c = concise('Aviso', 'Esta es una oración muy larga que no tiene ningún punto en el medio y sigue y sigue contando cosas del servicio que nadie va a leer en el teléfono jamás', {});
  assert.ok(L(c.body) <= BODY_MAX); assert.ok(/…$/.test(c.body));
});
caso('todos los pasos del recorrido y del autopiloto ya salen cortos sin tocar (≤ 45 / ≤ 100)', () => {
  const j = require('../src/services/retentionJourney');
  for (const s of j.STEPS) { const c = concise(s.title.replace('{pct}', '50').replace('{first}', '50').replace('{h}', '24').replace('{monto}', '5.000'), s.text.replace(/\{\w+\}/g, '5'), {}); assert.ok(L(c.title) <= TITLE_MAX && L(c.body) <= BODY_MAX, s.id); }
});
console.log(`\n${ok}/${ok + fails.length} casos OK`); process.exit(fails.length ? 1 : 0);
