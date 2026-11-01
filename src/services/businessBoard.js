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
  // #1010: "siguen activos" NO es un paso después de las 5 cargas: se compara con los que hicieron la 1ª carga (antes daba "1615 %").
  ].map((s, i, a) => Object.assign(s, { ofTotal: pct(s.n, f.registered), ofPrev: !i ? null : pct(s.n, s.key === 'active30' ? f.d1 : a[i - 1].n), lost: !i || s.key === 'active30' ? null : Math.max(0, a[i - 1].n - s.n) }));
  // #1010: el paso donde más GENTE se pierde (2ª carga o 5 cargas), no el % más bajo: con 210 → 57 → 13 el problema es la 2ª carga (153
  // personas), aunque 57 → 13 dé un % menor.
  let worst = null; for (let i = 2; i < f.steps.length; i++) { const s = f.steps[i]; if (s.lost != null && f.steps[i - 1].n >= 10 && (!worst || s.lost > worst.lost)) worst = s; }
  f.worst = worst ? { key: worst.key, label: worst.label, ofPrev: worst.ofPrev, lost: worst.lost } : null;
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
  const f = b.funnel; if (f && f.worst && f.worst.ofPrev < 0.5) alerts.push({ level: 'ok', text: `Donde más gente se pierde: "${f.worst.label}" (sólo pasa el ${pc(f.worst.ofPrev)} del paso anterior${f.worst.lost != null ? ': se quedan ' + f.worst.lost + ' personas' : ''}).`, fix: f.worst.key === 'd2' ? 'Es la 2ª carga: reforzá el bono de 2ª carga y el aviso del día siguiente a la 1ª.' : 'Reforzá el recorrido de esa etapa en el Centro de avisos.' });
  for (const g of b.gifts || []) if (g.verdict === 'bad' && g.cost >= Math.max(50000, (m.deposits || 0) * 0.01)) alerts.push({ level: 'bad', text: `${g.label}: costó ${money(g.cost)} y los que lo recibieron cargaron ${g.lift >= 0 ? 'sólo ' + money(g.lift) + ' más' : money(-g.lift) + ' MENOS'} que antes.`, fix: 'Bajá el % o pedí una carga mínima para darlo.' });
  for (const c of b.campaigns || []) if (c.verdict === 'bad' && c.users >= 20) alerts.push({ level: 'bad', text: `Campaña ${c.campaign}${c.publisher ? ' (' + c.publisher + ')' : ''}: costó ${money(c.spend)} y sus clientes dejaron ${money(c.net)}.`, fix: 'Pausala o bajale el presupuesto hasta que traiga gente que vuelva.' });
  const bad = alerts.filter((a) => a.level === 'bad').length;
  const color = m.result < 0 ? 'bad' : bad ? 'ok' : 'good';
  const dir = m.resultChg == null ? '' : (m.resultChg >= 0 ? ` (▲ ${pc(m.resultChg)} vs el período anterior)` : ` (▼ ${pc(-m.resultChg)} vs el período anterior)`);
  let headline = (m.result >= 0 ? `Entraron ${money(m.result)} más de lo que salió` : `Salieron ${money(-m.result)} más de lo que entró`) + dir + '.';
  headline += alerts.length ? ' Lo más importante: ' + alerts[0].text.charAt(0).toLowerCase() + alerts[0].text.slice(1) : ' No hay nada para corregir.';
  return { color, headline, alerts };
}

// #1010 (owner: "apretando un botón que me dé un análisis semanal"): informe de la semana en lenguaje simple, armado SÓLO con números
// (board = _bizBoard('week'); extra = oferta de 2ª carga, antifraude, revisión del de turno, banco). No cambia nada: sólo lee y recomienda.
// Metas: retiros que salen solos ≥ 90 %, cargas que entran solas ≥ 85 %, regalos ≤ 20 % de lo depositado, 2ª carga usada ≥ 20 %.
const AUTO_PAY_GOAL = 0.90, AUTO_DEP_GOAL = 0.85, SECOND_GOAL = 0.20;
function weeklyAnalysis(b, x) {
  b = b || {}; x = x || {};
  const $ = (v) => '$' + Math.round(v || 0).toLocaleString('es-AR'); const pc = (v) => v == null ? '—' : Math.round(v * 100) + '%';
  const arrow = (c) => c == null ? '' : c >= 0 ? ` (▲ ${pc(c)})` : ` (▼ ${pc(-c)})`;
  const m = b.money || {}; const p = m.prev || {}; const sections = []; const actions = [];
  const act = (level, text) => actions.push({ level, text });
  // 1) PLATA
  sections.push({ icon: '💰', title: 'Plata de la semana', lines: [
    `Cargas: ${$(m.deposits)} en ${m.depositCount || 0} cargas de ${m.depositors || 0} clientes${arrow(m.depositsChg)}.`,
    `Retiros pagados: ${$(m.withdrawals)} (${m.withdrawalCount || 0} retiros).`,
    `Resultado (cargas − retiros): ${$(m.result)}${arrow(m.resultChg)}. Semana anterior: ${$(p.result)}.`,
    `Carga promedio: ${$(m.ticket)} · Registros nuevos: ${m.registered || 0}.`] });
  if (m.result < 0) act('bad', 'La semana dio NEGATIVA: revisá en 🛡️ Antifraude los retiros más grandes y en 👀 Para revisar lo marcado.');
  // 2) REGALOS
  const top = (m.giftsByType || []).slice(0, 4).map((g) => `${g.label} ${$(g.total)}`).join(' · ');
  sections.push({ icon: '🎁', title: 'Regalos', lines: [
    `Se regaló ${$(m.gifts)} = ${pc(m.giftRatio)} de lo depositado (meta: ${Math.round(GIFT_YELLOW * 100)}% o menos).`,
    top ? `Lo que más costó: ${top}.` : 'Sin regalos en la semana.'] });
  if (m.giftRatio != null && m.giftRatio > GIFT_YELLOW) act('bad', `Los regalos están en ${pc(m.giftRatio)} de lo depositado: no sumar regalos nuevos y mirar en Negocio → "¿Qué regalo rinde?" cuál bajar.`);
  // 3) RETENCIÓN
  const r = b.retention || []; const rn = r[r.length - 1] || {}; const rp = r[r.length - 2] || {};
  const sd = x.secondDeposit || null; const sdRate = sd && sd.offered ? sd.used / sd.offered : null;
  const ret = [`Volvieron a cargar: ${pc(rn.rate)} de los que cargaron la semana anterior (${rn.returned || 0} de ${rn.prevDepositors || 0}). Semana anterior: ${pc(rp.rate)}.`];
  const f = b.funnel; if (f && f.worst) ret.push(`Donde más gente se pierde: "${f.worst.label}" (pasa el ${pc(f.worst.ofPrev)}${f.worst.lost != null ? ', se pierden ' + f.worst.lost + ' personas' : ''}).`);
  if (sd) ret.push(`Oferta del 50% en la 2ª carga: se mandó a ${sd.offered}, la usaron ${sd.used} (${pc(sdRate)}).`);
  sections.push({ icon: '🔁', title: 'Clientes que vuelven', lines: ret });
  if (rn.rate != null && rp.rate != null && rn.rate < rp.rate - 0.03) act('ok', `Volvieron menos clientes que la semana anterior (${pc(rp.rate)} → ${pc(rn.rate)}): mirar si salieron los avisos (Centro de avisos) y si hubo trabas en cargas.`);
  if (sd && sd.offered >= 10 && sdRate < SECOND_GOAL) act('ok', `Pocos usan el 50% de la 2ª carga (${pc(sdRate)}): probar cambiar el texto del aviso (/sys_second_deposit_offer) para que se entienda mejor.`);
  // 4) RULETA
  const ro = b.roulette;
  if (ro) { const fr = ro.free || {}, go = ro.gold || {};
    sections.push({ icon: '🎰', title: 'Ruleta diaria', lines: [
      `Giro gratis: ${fr.spins || 0} giros (${fr.perDay || 0} por día, ${fr.users || 0} clientes); cargaron ese mismo día ${pc(fr.depositRate)}.`,
      `Giro dorado: ${go.spins || 0} giros; premios en plata ${$(go.cash)}.`] }); }
  // 5) AUTOMÁTICO
  const st = b.stalls;
  if (st) { const py = st.payouts || {}, dp = st.deposits || {};
    const paid = (py.paidAuto || 0) + (py.paidManual || 0); const autoPay = paid ? py.paidAuto / paid : null;
    const tot = (dp.auto || 0) + (dp.manual || 0) + (dp.review || 0) + (dp.noMatch || 0); const autoDep = tot ? dp.auto / tot : null;
    const lines = [
      `Retiros que salieron solos: ${pc(autoPay)} (${py.paidAuto || 0} de ${paid}; meta ${Math.round(AUTO_PAY_GOAL * 100)}%). Tardan ${py.autoMinutes != null ? py.autoMinutes + ' min' : '—'} solos y ${py.manualMinutes != null ? py.manualMinutes + ' min' : '—'} a mano.`,
      `Retiros frenados: ${py.held || 0}${(py.reasons || []).length ? ' — ' + py.reasons.slice(0, 3).map((q) => q.label + ' ' + q.n).join(' · ') : ''}. Esperando ahora: ${py.waitingNow || 0}.`,
      `Cargas que entraron solas: ${pc(autoDep)} (${dp.auto || 0} de ${tot}; meta ${Math.round(AUTO_DEP_GOAL * 100)}%). A mano ${dp.manual || 0} · en revisión ${dp.review || 0} · sin dueño ${dp.noMatch || 0}.`,
      `Comprobantes que la IA no leyó: ${(dp.aiFailed || 0) + (dp.aiFallback || 0)} (${dp.aiFallback || 0} siguieron solos por ser clientes de confianza).`];
    sections.push({ icon: '⚙️', title: 'Qué tan automático fue', lines });
    if (autoPay != null && paid >= 10 && autoPay < AUTO_PAY_GOAL) act('bad', `Sólo ${pc(autoPay)} de los retiros salió solo: el motivo principal fue "${(py.reasons[0] || {}).label || 'pagos que fallaron'}". Revisar eso primero.`);
    if (autoDep != null && tot >= 10 && autoDep < AUTO_DEP_GOAL) act('bad', `Sólo ${pc(autoDep)} de las cargas entró sola${(dp.reviewReasons || [])[0] ? ': lo que más frena es "' + dp.reviewReasons[0].label + '"' : ''}. Revisar con el encargado de cargas.`);
    if ((dp.noMatch || 0) >= 5) act('ok', `${dp.noMatch} transferencias sin dueño: que el encargado de cargas las asigne o devuelva.`);
    if ((py.waitingNow || 0) > 0) act('ok', `Hay ${py.waitingNow} retiros esperando en Pagos a confirmar: resolverlos hoy.`); }
  // 6) ANTIFRAUDE Y TURNOS
  const af = x.antifraud || {}; const sh = x.shift || {};
  sections.push({ icon: '🛡️', title: 'Antifraude y control del de turno', lines: [
    `Bloqueos: ${af.blocks || 0} · clientes puestos en observación: ${af.watches || 0} · retiros rechazados: ${af.rejects || 0}.`,
    `👀 Para revisar: ${sh.reviewed || 0} retiros revisados por el de turno (${sh.suspicious || 0} marcados sospechosos); quedaron ${sh.pending || 0} retiros con señal sin revisar.`] });
  if ((sh.pending || 0) > 0) act('ok', `Quedaron ${sh.pending} retiros con señal sin revisar en 👀 Para revisar: pedirle a los encargados que lo cierren en cada turno.`);
  // 7) BANCO
  const bk = x.bank; if (bk && bk.balance != null) {
    sections.push({ icon: '🏦', title: 'Banco', lines: [`Saldo al momento del informe: ${$(bk.balance)} (alerta en ${$(bk.minArs)}).`] });
    if (bk.balance < bk.minArs) act('bad', 'El banco está por debajo del mínimo: fondear para que los retiros sigan saliendo solos.'); }
  for (const a of (b.alerts || [])) if (!actions.some((y) => y.text === a.fix) && a.fix) act(a.level, a.fix);
  // 8) GENTE CON SEÑALES DE ESTAFA (owner: "poné la gente de estafa"): bloqueados, en observación, retiros rechazados, cuentas secundarias
  //    nuevas, marcados sospechosos por el de turno y retiros frenados ahora. Sólo usuario + qué pasó + motivo (sin datos personales).
  const fr = x.fraud || {}; const ppl = fr.people || []; const held = fr.heldNow || [];
  const fl = [`Personas con alguna señal esta semana: ${ppl.length}${fr.dupNew ? ` · cuentas secundarias nuevas: ${fr.dupNew}` : ''}.`];
  for (const q of ppl.slice(0, 25)) fl.push(`${q.username || '—'}: ${q.what}${q.why ? ' — ' + q.why : ''}${q.by ? ' (' + q.by + ')' : ''}`);
  if (ppl.length > 25) fl.push(`… y ${ppl.length - 25} más (ver 🛡️ Antifraude → Historial).`);
  if (held.length) { fl.push(`Retiros frenados esperando una persona AHORA: ${held.length}`); for (const h of held.slice(0, 15)) fl.push(`⏸️ ${h.username || '—'} ${$(h.amount)} — ${h.why || 'sin motivo'} (hace ${h.hours} h)`); }
  sections.push({ icon: '🚨', title: 'Gente con señales de estafa', lines: fl });
  const oldHeld = held.filter((h) => h.hours >= 2).length;
  if (oldHeld) act('bad', `${oldHeld} retiros frenados hace más de 2 horas sin resolver: confirmar o rechazar con motivo (el cliente está esperando).`);
  if ((fr.dupNew || 0) >= 5) act('ok', `${fr.dupNew} cuentas secundarias nuevas en la semana: mirar en 🛡️ Antifraude → Cuentas secundarias si vienen de la misma campaña.`);
  // NÚMEROS CLAVE (se guardan en cada cierre semanal para comparar).
  const py = (st && st.payouts) || {}, dp = (st && st.deposits) || {}; const paidN = (py.paidAuto || 0) + (py.paidManual || 0); const depN = (dp.auto || 0) + (dp.manual || 0) + (dp.review || 0) + (dp.noMatch || 0);
  const numbers = { deposits: Math.round(m.deposits || 0), depositCount: m.depositCount || 0, depositors: m.depositors || 0, withdrawals: Math.round(m.withdrawals || 0), result: Math.round(m.result || 0),
    gifts: Math.round(m.gifts || 0), giftRatio: m.giftRatio == null ? null : m.giftRatio, registered: m.registered || 0, ticket: Math.round(m.ticket || 0), repeatRate: rn.rate == null ? null : rn.rate,
    secondRate: sdRate, autoPay: paidN ? py.paidAuto / paidN : null, autoDep: depN ? dp.auto / depN : null, held: py.held || 0,
    blocks: af.blocks || 0, watches: af.watches || 0, fraudPeople: ppl.length, freeSpins: ro && ro.free ? ro.free.spins || 0 : 0 };
  // 9) COMPARADO CON LAS SEMANAS CERRADAS + CÓMO VA EL PROYECTO
  const closes = (x.closes || []).filter((c) => c && c.numbers); const pv = closes[0] && closes[0].numbers;
  const cmp = (k, label, fmt, upGood) => { if (!pv || pv[k] == null || numbers[k] == null) return null; const d = numbers[k] - pv[k];
    const good = d === 0 ? null : (d > 0) === upGood; return `${label}: ${fmt(numbers[k])} vs ${fmt(pv[k])} ${d === 0 ? '(igual)' : (good ? '✅' : '⚠️') + (d > 0 ? ' ▲' : ' ▼')}`; };
  if (pv) {
    const cl = [`Contra la semana cerrada del ${closes[0].from || '—'} al ${closes[0].to || '—'}:`].concat([
      cmp('deposits', 'Cargas', $, true), cmp('result', 'Resultado', $, true), cmp('depositors', 'Clientes que cargaron', String, true), cmp('registered', 'Registros', String, true),
      cmp('repeatRate', 'Volvieron a cargar', pc, true), cmp('giftRatio', 'Regalos / depósitos', pc, false), cmp('autoPay', 'Retiros solos', pc, true), cmp('autoDep', 'Cargas solas', pc, true),
      cmp('fraudPeople', 'Personas con señal de estafa', String, false)].filter(Boolean));
    sections.push({ icon: '📊', title: 'Comparado con la semana anterior', lines: cl });
  }
  const serie = [numbers].concat(closes.map((c) => c.numbers)).slice(0, 8); // de la más nueva a la más vieja
  const pl = [];
  if (serie.length >= 2) {
    const n = serie.length; const sum = (k) => serie.reduce((a, q) => a + (Number(q[k]) || 0), 0);
    const half = Math.floor(n / 2); const avg = (arr, k) => arr.reduce((a, q) => a + (Number(q[k]) || 0), 0) / (arr.length || 1);
    const recent = serie.slice(0, half), older = serie.slice(half); const dTrend = avg(older, 'deposits') > 0 ? avg(recent, 'deposits') / avg(older, 'deposits') - 1 : null;
    pl.push(`Últimas ${n} semanas: cargas ${$(sum('deposits'))}, resultado acumulado ${$(sum('result'))}, regalado ${$(sum('gifts'))}.`);
    if (dTrend != null) pl.push(`Tendencia de las cargas: ${dTrend >= 0.05 ? '📈 creciendo' : dTrend <= -0.05 ? '📉 bajando' : '➡️ estable'} (${dTrend >= 0 ? '+' : ''}${Math.round(dTrend * 100)}% las semanas recientes vs las anteriores).`);
    const negs = serie.filter((q) => q.result < 0).length; if (negs) pl.push(`Semanas en negativo: ${negs} de ${n}.`);
    const gr = serie.map((q) => q.giftRatio).filter((v) => v != null); if (gr.length >= 2) pl.push(`Regalos / depósitos: ${gr.slice().reverse().map(pc).join(' → ')} (de la más vieja a esta).`);
    const rr = serie.map((q) => q.repeatRate).filter((v) => v != null); if (rr.length >= 2) pl.push(`Clientes que vuelven: ${rr.slice().reverse().map(pc).join(' → ')}.`);
    if (dTrend != null && dTrend <= -0.15) act('bad', `Las cargas vienen bajando (${Math.round(dTrend * 100)}% en las últimas semanas): revisar pauta, avisos y trabas de carga.`);
    if (negs >= 2 && serie[0].result < 0 && serie[1] && serie[1].result < 0) act('bad', 'Dos semanas seguidas en negativo: revisar retiros grandes y regalos antes de seguir.');
  } else pl.push('Es la primera medición: desde el primer cierre semanal (lunes) vas a ver acá la evolución semana a semana.');
  sections.push({ icon: '🚀', title: 'Cómo va el proyecto', lines: pl });
  const bad = actions.filter((a) => a.level === 'bad').length;
  const verdict = m.result < 0 || bad >= 2 ? 'bad' : bad || actions.length ? 'ok' : 'good';
  const head = verdict === 'good' ? '✅ Semana bien: no hay nada urgente para corregir.' : verdict === 'ok' ? '🟡 Semana aceptable: hay cosas para ajustar.' : '🔴 Semana con problemas: corregir lo marcado en rojo.';
  const range = b.range && b.range.from ? `${String(new Date(b.range.from).toISOString()).slice(0, 10)} al ${String(new Date(b.range.to).toISOString()).slice(0, 10)}` : 'últimos 7 días';
  const text = [`ANÁLISIS SEMANAL PICAROJA (${range})`, head, ''].concat(...sections.map((s) => [s.icon + ' ' + s.title.toUpperCase()].concat(s.lines.map((l) => '• ' + l), ['']))
    , ['⚠️ ALERTAS Y QUÉ HACER ESTA SEMANA'], actions.length ? actions.map((a, i) => `${i + 1}. ${a.level === 'bad' ? '🔴' : '🟡'} ${a.text}`) : ['Nada urgente: seguir midiendo.']).join('\n');
  return { verdict, head, range, sections, actions, text, numbers };
}

module.exports = { retention, funnel, giftLift, campaigns, giftLevel, diagnose, weeklyAnalysis, pct, chg, GIFT_LABELS, NO_LIFT, GIFT_GREEN, GIFT_YELLOW };
