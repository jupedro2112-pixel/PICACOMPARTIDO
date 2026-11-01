'use strict';
/**
 * #1009 TABLERO DEL NEGOCIO (owner 2026-11-01): "armá el tablero de negocio completo y mostrá adentro cómo funciona".
 * Funciones PURAS (sin base): reciben los números ya agregados por server.js (`/api/admin/inicio/negocio`) y arman retención,
 * embudo, rinde de cada regalo, campañas, alertas y la frase de arriba. Test: node scripts/test-business-board.js
 */
const GIFT_LABELS = {
  bonus: 'Bonos de carga (%)', fire_reward: 'Fueguito', refund: 'Reembolsos', rakeback: 'Rakeback', vip_levelup: 'Subida de nivel VIP',
  referral_commission: 'Comisión de referidos', roulette: 'Ruleta', install_gift: 'Extra por instalar la app', mission: 'Misiones',
  review_gift: 'Regalo por reseña', code_drop: 'Código sorpresa'
};
// Regalos que vienen PEGADOS a una carga (el bono % entra con la misma carga): el "antes / después" no sirve para medirlos.
const NO_LIFT = new Set(['bonus', 'install_gift']);
const GIFT_GREEN = 0.15, GIFT_YELLOW = 0.20; // mismo semáforo que la Revisión semanal

const pct = (a, b) => (b > 0 ? a / b : null);
const chg = (cur, prev) => (prev > 0 ? (cur - prev) / prev : null);

/** blocks: Map<userId, Set<k>> con k = semanas atrás (0 = últimos 7 días). → [{ k, depositors, returned, rate }] de la más vieja a la actual */
function retention(blocks, nWeeks) {
  const by = []; for (let k = 0; k <= nWeeks; k++) by.push(new Set());
  for (const [u, ks] of blocks) for (const k of ks) if (k >= 0 && k <= nWeeks) by[k].add(u);
  const out = [];
  for (let k = nWeeks - 1; k >= 0; k--) {
    const prev = by[k + 1]; let ret = 0; for (const u of prev) if (by[k].has(u)) ret++;
    out.push({ k, depositors: by[k].size, prevDepositors: prev.size, returned: ret, rate: pct(ret, prev.size) });
  }
  return out;
}

/** rows: [{ n (cargas reales), last (Date) }] de los registrados en la ventana. */
function funnel(registered, rows, now) {
  const f = { registered, d1: 0, d2: 0, d5: 0, active30: 0 }; const cut = (now || new Date()).getTime() - 30 * 86400000;
  for (const r of rows) { if (r.n >= 1) f.d1++; if (r.n >= 2) f.d2++; if (r.n >= 5) f.d5++; if (r.last && new Date(r.last).getTime() >= cut) f.active30++; }
  f.steps = [
    { key: 'registered', label: 'Se registraron', n: f.registered },
    { key: 'd1', label: 'Hicieron la 1ª carga', n: f.d1 },
    { key: 'd2', label: 'Volvieron a cargar (2ª)', n: f.d2 },
    { key: 'd5', label: 'Llegaron a 5 cargas', n: f.d5 },
    { key: 'active30', label: 'Siguen activos (cargaron en 30 días)', n: f.active30 }
  ].map((s, i, a) => Object.assign(s, { ofTotal: pct(s.n, f.registered), ofPrev: i ? pct(s.n, a[i - 1].n) : null }));
  // el paso donde más se cae la gente (entre 1ª carga y activos)
  let worst = null; for (let i = 2; i < f.steps.length; i++) { const s = f.steps[i]; if (s.ofPrev != null && f.steps[i - 1].n >= 10 && (!worst || s.ofPrev < worst.ofPrev)) worst = s; }
  f.worst = worst ? { key: worst.key, label: worst.label, ofPrev: worst.ofPrev } : null;
  return f;
}

/** rows: [{ type, users, n, cost, before, after }] (cargas reales 7 días antes / después del primer regalo de cada cliente). */
function giftLift(rows) {
  return rows.map((r) => {
    const lift = NO_LIFT.has(r.type) ? null : (r.after - r.before);
    const roi = lift == null || !(r.cost > 0) ? null : lift / r.cost;
    const verdict = roi == null ? 'na' : roi >= 2 ? 'good' : roi >= 1 ? 'ok' : 'bad';
    return Object.assign({}, r, { label: GIFT_LABELS[r.type] || r.type, lift, roi, verdict });
  }).sort((a, b) => (b.cost || 0) - (a.cost || 0));
}

/** rows: [{ campaign, publisher, users, depositors, deposits, withdrawals, spend }] */
function campaigns(rows) {
  return rows.map((r) => {
    const net = (r.deposits || 0) - (r.withdrawals || 0);
    const cpc = r.spend > 0 && r.depositors > 0 ? r.spend / r.depositors : null;
    const verdict = !(r.spend > 0) ? 'nospend' : net >= r.spend ? 'good' : net >= r.spend * 0.6 ? 'ok' : 'bad';
    return Object.assign({}, r, { net, costPerDepositor: cpc, netPerDepositor: r.depositors ? net / r.depositors : null, conv: pct(r.depositors, r.users), verdict });
  }).sort((a, b) => (b.users || 0) - (a.users || 0));
}

function giftLevel(ratio) { return ratio == null ? 'na' : ratio <= GIFT_GREEN ? 'good' : ratio <= GIFT_YELLOW ? 'ok' : 'bad'; }

/** Alertas en castellano y la frase de arriba. */
function diagnose(b) {
  const alerts = []; const money = (v) => '$' + Math.round(v || 0).toLocaleString('es-AR'); const pc = (v) => Math.round((v || 0) * 100) + '%';
  const m = b.money || {};
  if (m.result < 0) alerts.push({ level: 'bad', text: `El período da NEGATIVO (${money(m.result)}): se pagó más en retiros que lo que entró en cargas.`, fix: 'Mirá en Antifraude los retiros grandes del período y en "¿Qué regalo rinde?" qué regalo se está llevando la plata.' });
  if (b.giftLevel === 'bad') alerts.push({ level: 'bad', text: `Los regalos son el ${pc(m.giftRatio)} de lo depositado (tope sano ${Math.round(GIFT_YELLOW * 100)}%).`, fix: 'Bajá o apagá los regalos que en "¿Qué regalo rinde?" salen en rojo.' });
  else if (b.giftLevel === 'ok') alerts.push({ level: 'ok', text: `Los regalos son el ${pc(m.giftRatio)} de lo depositado: cerca del tope (${Math.round(GIFT_YELLOW * 100)}%).`, fix: 'No sumes regalos nuevos hasta que baje.' });
  const r = b.retention || []; const last3 = r.slice(-3).map((x) => x.rate);
  if (last3.length === 3 && last3.every((x) => x != null) && last3[2] < last3[1] && last3[1] < last3[0]) alerts.push({ level: 'bad', text: `La retención bajó 2 semanas seguidas (${pc(last3[0])} → ${pc(last3[1])} → ${pc(last3[2])}).`, fix: 'Revisá qué avisos salieron esas semanas (Centro de avisos) y si hubo problemas de cargas o retiros.' });
  const f = b.funnel; if (f && f.worst && f.worst.ofPrev < 0.5) alerts.push({ level: 'ok', text: `Donde más gente se pierde: "${f.worst.label}" (sólo pasa el ${pc(f.worst.ofPrev)} del paso anterior).`, fix: f.worst.key === 'd2' ? 'Es la 2ª carga: reforzá el bono de 2ª carga y el aviso del día siguiente a la 1ª.' : 'Reforzá el recorrido de esa etapa en el Centro de avisos.' });
  for (const g of b.gifts || []) if (g.verdict === 'bad' && g.cost >= Math.max(50000, (m.deposits || 0) * 0.01)) alerts.push({ level: 'bad', text: `${g.label}: costó ${money(g.cost)} y los que lo recibieron cargaron ${g.lift >= 0 ? 'sólo ' + money(g.lift) + ' más' : money(-g.lift) + ' MENOS'} que antes.`, fix: 'Bajá el % o pedí una carga mínima para darlo.' });
  for (const c of b.campaigns || []) if (c.verdict === 'bad' && c.users >= 20) alerts.push({ level: 'bad', text: `Campaña ${c.campaign}${c.publisher ? ' (' + c.publisher + ')' : ''}: costó ${money(c.spend)} y sus clientes dejaron ${money(c.net)}.`, fix: 'Pausala o bajale el presupuesto hasta que traiga gente que vuelva.' });
  const bad = alerts.filter((a) => a.level === 'bad').length;
  const color = m.result < 0 ? 'bad' : bad ? 'ok' : 'good';
  const dir = m.resultChg == null ? '' : (m.resultChg >= 0 ? ` (▲ ${pc(m.resultChg)} vs el período anterior)` : ` (▼ ${pc(-m.resultChg)} vs el período anterior)`);
  let headline = (m.result >= 0 ? `Entraron ${money(m.result)} más de lo que salió` : `Salieron ${money(-m.result)} más de lo que entró`) + dir + '.';
  headline += alerts.length ? ' Lo más importante: ' + alerts[0].text.charAt(0).toLowerCase() + alerts[0].text.slice(1) : ' No hay nada para corregir.';
  return { color, headline, alerts };
}

module.exports = { retention, funnel, giftLift, campaigns, giftLevel, diagnose, pct, chg, GIFT_LABELS, NO_LIFT, GIFT_GREEN, GIFT_YELLOW };
