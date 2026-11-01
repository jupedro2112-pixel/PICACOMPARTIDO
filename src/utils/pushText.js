'use strict';
/**
 * #997 (owner 2026-11-01): "cuando la gente recibe una notificación en el teléfono, que sea resumida y concisa, que se entienda pero no tan
 * cargada; si es bono, remarcar esa parte". Último filtro de TODA push (notificationService._sanitizeAndCapPayload), así vale también para
 * textos que se escriben en el panel (lotes, Centro de avisos, comandos):
 *   - título ≤ 45 caracteres; si el texto trae un bono (+N %, $monto en fichas, "duplicamos") y el título no lo dice, se le pone adelante.
 *   - cuerpo ≤ 100 caracteres: se sacan las aclaraciones entre paréntesis y "ya está activo en el botón…", y si sigue largo se quedan las
 *     oraciones que entran, priorizando la que tiene el bono / la plata.
 *   - mensajes de chat (tag 'chat-message' / 'support'): sólo se recorta el largo (es lo que escribió la persona).
 * Test: node scripts/test-push-text.js
 */
const TITLE_MAX = 45;
const BODY_MAX = 100;

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
function cut(s, max) {
  s = clean(s); if (s.length <= max) return s;
  const arr = Array.from(s); if (arr.length <= max) return s; // emojis cuentan como 1
  let t = arr.slice(0, max - 1).join(''); const sp = t.lastIndexOf(' ');
  if (sp > max * 0.6) t = t.slice(0, sp);
  return t.replace(/[\s,;:.\-–—·]+$/, '') + '…';
}
const len = (s) => Array.from(String(s || '')).length;

// Qué bono menciona el texto (para ponerlo adelante en el título).
function bonusOf(text) {
  const t = String(text || '');
  if (/duplic/i.test(t)) return { label: 'DUPLICAMOS tu carga', re: /duplic|\+?100\s?%/i };
  const m = t.match(/\+\s?(\d{1,3})\s?%/) || t.match(/(\d{1,3})\s?%\s*(?:extra|de bono|bono)/i) || t.match(/bono[^.%\d]{0,20}(\d{1,3})\s?%/i);
  if (m) return { label: 'BONO +' + m[1] + '%', re: new RegExp('\\+?\\s?' + m[1] + '\\s?%') };
  const f = t.match(/\$\s?([\d.]{3,})\s*(?:en fichas|de regalo|gratis|de bono)/i);
  if (f) return { label: '$' + f[1] + ' en fichas', re: new RegExp('\\$\\s?' + f[1].replace(/\./g, '\\.')) };
  return null;
}

const FLUFF = [
  /\s*\((?:con (?:el )?tope[^)]*|ya (?:est[aá] )?activo[^)]*|automático|autom[aá]tico)\)/gi,
  /\s*Ya est[aá] activo en el bot[oó]n [^.!]*[.!]?/gi,
  /\s*\(con el tope de bonos\)/gi
];

function concise(title, body, data) {
  const tag = String((data && data.tag) || '');
  const isChat = /chat|support|soporte/i.test(tag) || (data && data.kind === 'chat');
  let t = clean(title), b = clean(body);
  if (isChat) return { title: cut(t, 60), body: cut(b, 140) };
  for (const re of FLUFF) b = b.replace(re, '');
  b = clean(b);
  // Bono adelante en el título.
  const bo = bonusOf(t) || bonusOf(b);
  if (bo && !bo.re.test(t) && !/duplic/i.test(t)) t = '🎁 ' + bo.label + ' · ' + t.replace(/^🎁\s*/, '');
  // Cuerpo: oraciones que entran, la del bono / plata primero.
  if (len(b) > BODY_MAX) {
    const sents = b.split(/(?<=[.!?…])\s+/).filter(Boolean);
    const prio = (s) => (/\+\s?\d+\s?%|\$\s?[\d.]+|duplic|bono|regalo|fichas|acredit/i.test(s) ? 0 : 1);
    const order = sents.map((s, i) => ({ s, i })).sort((x, y) => prio(x.s) - prio(y.s) || x.i - y.i);
    const keep = []; let total = 0;
    for (const o of order) { const add = len(o.s) + (keep.length ? 1 : 0); if (total + add <= BODY_MAX) { keep.push(o); total += add; } }
    b = keep.length ? keep.sort((x, y) => x.i - y.i).map((o) => o.s).join(' ') : cut(order[0].s, BODY_MAX);
  }
  return { title: cut(t, TITLE_MAX), body: cut(b, BODY_MAX) };
}

module.exports = { concise, bonusOf, TITLE_MAX, BODY_MAX };
