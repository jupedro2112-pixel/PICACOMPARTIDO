'use strict';
/**
 * #1004 (owner 2026-11-01): "hay usuarios que repiten una apuesta, uno gana y otro pierde: hay que analizar TODO el panel según lo apostado,
 * no sólo ganadores; cuando quieren estafar 1 o 2 pierden y otro gana con el bono". Juego ESPEJO entre cuentas que NO tienen por qué estar
 * vinculadas (otro celular, otro CBU).
 *
 * 1girox no da apuesta por apuesta: se piden los totales de TODOS los jugadores activos por FRANJAS de `bucketHours` (stats batch) y se buscan
 * en cada franja ganadores cuya ganancia la explica la pérdida de 1 o 2 cuentas (±tol) con un volumen apostado parecido. Una coincidencia
 * suelta es azar (con cientos de jugadores pasa); lo que delata el espejo es que el MISMO grupo coincide en VARIAS franjas y que casi siempre
 * que juega uno juega el otro. Funciones puras (test: scripts/test-mirror-scan.js); el motor que pide los datos está en server.js.
 */
const DEFAULT = { enabled: false, bucketHours: 3, days: 7, minWagered: 10000, minWin: 10000, tol: 0.25, wagRatio: 3, minHits: 2, minHitsNoFlag: 3, coactivity: 0.5, nightFrom: 3, nightTo: 8, rpm: 15 };
function normalize(c) {
  c = c || {}; const n = (v, d, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; }; const D = DEFAULT;
  const bh = [1, 2, 3, 4, 6, 8, 12, 24].includes(Number(c.bucketHours)) ? Number(c.bucketHours) : D.bucketHours;
  return { enabled: c.enabled === true, bucketHours: bh, days: Math.round(n(c.days, D.days, 1, 30)), minWagered: n(c.minWagered, D.minWagered, 500, 1e8), minWin: n(c.minWin, D.minWin, 500, 1e8),
    tol: n(c.tol, D.tol, 0.05, 0.6), wagRatio: n(c.wagRatio, D.wagRatio, 1.2, 10), minHits: Math.round(n(c.minHits, D.minHits, 1, 20)), minHitsNoFlag: Math.round(n(c.minHitsNoFlag, D.minHitsNoFlag, 1, 30)),
    coactivity: n(c.coactivity, D.coactivity, 0, 1), nightFrom: Math.round(n(c.nightFrom, D.nightFrom, 0, 23)), nightTo: Math.round(n(c.nightTo, D.nightTo, 1, 24)), rpm: Math.round(n(c.rpm, D.rpm, 2, 40)) };
}
const num = (v) => Number(v) || 0;
/**
 * buckets: [{ key, from, to, players: { username: { wagered, netwin, bonusGranted } } }]   (netwin > 0 = el jugador PERDIÓ)
 * flags:   { bonus: Set<username> (recibió regalo en el período), wd: Set<username> (pidió retiro en el período) }
 * → [{ members, hits: [{ key, from, to, winner, win, losers: [{ username, loss, wagered }], wagWinner }], score, moved, coactivity, flagged }]
 */
function analyze(buckets, flags, cfgRaw) {
  const cfg = normalize(cfgRaw); flags = flags || {}; const bonus = flags.bonus || new Set(), wd = flags.wd || new Set();
  const active = new Map(); // username → franjas donde jugó en serio
  const groups = new Map(); // "a|b(|c)" → { members, hits: Map(key → hit) }
  for (const b of buckets || []) {
    const ps = Object.entries(b.players || {}).map(([u, s]) => ({ u, wag: num(s.wagered), nw: num(s.netwin), bon: num(s.bonusGranted) }));
    for (const p of ps) if (p.wag >= cfg.minWagered * 0.3) active.set(p.u, (active.get(p.u) || 0) + 1);
    // #1006: topes para que nunca trabe el servidor (los 150 que más ganaron y los 600 que más perdieron de la franja)
    const winners = ps.filter((p) => -p.nw >= cfg.minWin && p.wag >= cfg.minWagered).sort((a, b) => a.nw - b.nw).slice(0, 150);
    if (!winners.length) continue;
    const losers = ps.filter((p) => p.nw > 0 && p.wag >= cfg.minWagered * 0.3).sort((a, b) => b.nw - a.nw).slice(0, 600).sort((a, b) => a.nw - b.nw);
    const okWag = (w, ls) => { const lw = ls.reduce((a, l) => a + l.wag, 0); return lw > 0 && w.wag / lw <= cfg.wagRatio && lw / w.wag <= cfg.wagRatio; };
    const add = (w, ls) => {
      const members = [w.u, ...ls.map((l) => l.u)].sort(); const k = members.join('|');
      if (!groups.has(k)) groups.set(k, { members, hits: new Map() });
      const g = groups.get(k); if (g.hits.has(b.key)) return;
      g.hits.set(b.key, { key: b.key, from: b.from, to: b.to, winner: w.u, win: Math.round(-w.nw), wagWinner: Math.round(w.wag), bonusWinner: Math.round(w.bon), losers: ls.map((l) => ({ username: l.u, loss: Math.round(l.nw), wagered: Math.round(l.wag) })) });
    };
    for (const w of winners) {
      const win = -w.nw, lo = win * (1 - cfg.tol), hi = win * (1 + cfg.tol);
      const cand = losers.filter((l) => l.u !== w.u && l.nw <= hi);
      for (const l of cand) if (l.nw >= lo && okWag(w, [l])) add(w, [l]);
      // 2 cuentas que pierden entre las dos lo que ganó la otra (cada una aporta al menos el 20 %). Lista ordenada ⇒ para cada i el
      // compañero válido está en un tramo contiguo: búsqueda binaria + recorrido corto (tope de pasos y de hallazgos).
      let made = 0, steps = 0;
      for (let i = 0; i < cand.length && made < 25 && steps < 20000; i++) {
        const a = cand[i].nw; if (a < win * 0.2) continue; if (a * 2 > hi) break;
        let L = i + 1, R = cand.length; const want = lo - a; while (L < R) { const m = (L + R) >> 1; if (cand[m].nw < want) L = m + 1; else R = m; }
        for (let k = Math.max(L, i + 1); k < cand.length && cand[k].nw <= hi - a && made < 25 && steps < 20000; k++, steps++) {
          if (okWag(w, [cand[i], cand[k]])) { add(w, [cand[i], cand[k]]); made++; }
        }
      }
    }
  }
  const out = [];
  for (const g of groups.values()) {
    const hits = [...g.hits.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
    const flagged = g.members.some((m) => bonus.has(m) || wd.has(m)) || hits.some((h) => h.bonusWinner > 0);
    if (hits.length < (flagged ? cfg.minHits : cfg.minHitsNoFlag)) continue;
    const minAct = Math.min(...g.members.map((m) => active.get(m) || hits.length));
    const co = minAct ? hits.length / minAct : 1;
    if (co < cfg.coactivity) continue;
    const moved = hits.reduce((a, h) => a + h.win, 0);
    out.push({ members: g.members, hits, moved, coactivity: Math.round(co * 100) / 100, flagged,
      bonusMembers: g.members.filter((m) => bonus.has(m)), wdMembers: g.members.filter((m) => wd.has(m)),
      score: hits.length * 10 + Math.round(co * 20) + (flagged ? 15 : 0) + Math.min(30, Math.round(moved / 50000)) });
  }
  // un par que ya está dentro de un trío con las mismas franjas no se repite
  out.sort((a, b) => b.score - a.score || b.moved - a.moved);
  return out.filter((g, i) => !out.some((o, j) => j < i && g.members.every((m) => o.members.includes(m)) && g.hits.every((h) => o.hits.some((x) => x.key === h.key))));
}
/** Franjas cerradas (inicio alineado a la hora ART) de los últimos `days` días. */
function bucketsFor(now, cfg) {
  cfg = normalize(cfg); const H = cfg.bucketHours * 3600000, art = 3 * 3600000;
  const end = Math.floor((now.getTime() - art) / H) * H + art; const out = [];
  for (let t = end - H; t >= end - cfg.days * 86400000; t -= H) out.push({ key: new Date(t - art).toISOString().slice(0, 13) + '+' + cfg.bucketHours, from: new Date(t), to: new Date(t + H - 1000) });
  return out.reverse();
}
module.exports = { analyze, bucketsFor, normalize, DEFAULT };
