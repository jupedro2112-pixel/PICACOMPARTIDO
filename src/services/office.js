'use strict';
// #1013 OFICINA (owner 2026-11-01): "armar una oficina con un puesto en cada uno y darle un trabajo dentro de las 24 hs a cada uno, para tener un
// análisis completo de la estructura, seguridad, marketing (cargar cuánto vamos gastando), bancario, recontacto, diseño de contenido para historias…"
// + "meter personas para lo que es el rubro, lo necesario; ver qué más nos faltaría" + "en otra página" (⇒ /oficina).
// Lógica PURA (sin base): cada puesto recibe los números del día (`d`, los junta server.js `_officeGather`) y devuelve su informe
// { verdict, head, lines, alerts, tasks }. Las tareas del día = rutina fija del puesto + una por cada alerta + las propias del panel.
// Test: node scripts/test-office.js

const money = (v) => (Number(v) < 0 ? '−$' : '$') + Math.round(Math.abs(Number(v) || 0)).toLocaleString('es-AR');
const num = (v) => Math.round(Number(v) || 0).toLocaleString('es-AR');
const pctS = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v * 100) + '%');
const ratio = (a, b) => (Number(b) > 0 ? Number(a) / Number(b) : null);
const chg = (a, b) => (Number(b) > 0 ? (Number(a) - Number(b)) / Number(b) : null);
const chgS = (a, b) => { const c = chg(a, b); return c == null ? '' : ' (' + (c >= 0 ? '▲' : '▼') + Math.abs(Math.round(c * 100)) + '% vs día anterior)'; };
const mins = (m) => (m == null ? '—' : m < 60 ? Math.round(m) + ' min' : (m / 60).toFixed(1).replace('.', ',') + ' h');

// Puestos. `routine` = lo que la persona hace TODOS los días (además de las alertas del día). `staffing` = cuánta gente pide el rubro.
const DESKS = [
  { key: 'direccion', icon: '🎯', name: 'Dirección / Encargado general', mission: 'Mira todos los puestos, decide prioridades y controla que cada uno cumpla sus tareas del día.',
    staffing: '1 persona (vos o el encargado de confianza). Lee esto a la mañana y a la noche.',
    routine: ['Leer el resumen de todos los puestos y marcar qué es lo más urgente del día', 'Revisar que cada puesto tenga persona asignada y que haya cumplido las tareas de ayer', 'Cerrar el día: anotar en este puesto lo que quedó pendiente para mañana'] },
  { key: 'operaciones', icon: '💳', name: 'Operaciones (cargas y retiros)', mission: 'Que toda carga entre y todo retiro salga. Destraba lo que el sistema no pudo hacer solo.',
    staffing: '3 personas (mañana · tarde · noche) para cubrir las 24 h. Es el puesto que más se nota si falta.',
    routine: ['Vaciar "Cargas pendientes": confirmar o rechazar cada comprobante con motivo', 'Vaciar "Pagos a confirmar": pagar o rechazar con motivo cada retiro frenado', 'Mirar "👀 Para revisar" y marcar OK / Sospechoso en los retiros que salieron solos', 'Antes de entregar el turno: dejar las dos colas en cero o anotar por qué no'] },
  { key: 'atencion', icon: '💬', name: 'Atención al cliente (soporte)', mission: 'Responder rápido y bien. Ningún cliente esperando más de 5 minutos.',
    staffing: '3 personas (una por turno). Con mucho movimiento, 2 a la noche (picos de 21 a 02 h).',
    routine: ['Responder todos los chats abiertos (Chats · Soporte) y cerrar los resueltos', 'Atender la columna Visitantes (gente sin cuenta)', 'Revisar los clientes que quedaron sin respuesta ayer y escribirles', 'Anotar acá las 3 preguntas que más se repitieron hoy (sirven para Contenido y para los textos automáticos)'] },
  { key: 'seguridad', icon: '🛡️', name: 'Seguridad y antifraude', mission: 'Que no nos estafen: cuentas secundarias, juego espejo, cazadores de bonos, comprobantes truchos.',
    staffing: '1 persona de confianza (puede ser la misma de Dirección). Revisión diaria de 30-60 min.',
    routine: ['Abrir 🛡️ Antifraude → Casos y resolver los de PRIORIDAD ALTA', 'Revisar los retiros frenados por antifraude: liberar o rechazar con motivo', 'Mirar las cuentas secundarias nuevas del día', 'Revisar el historial de bloqueos: que cada bloqueo tenga motivo claro'] },
  { key: 'banco', icon: '🏦', name: 'Banco y caja (tesorería)', mission: 'Que siempre haya plata para pagar y que lo del sistema coincida con el banco.',
    staffing: '1 persona (dueño o administrativo). 2 controles por día: mañana y noche.',
    routine: ['Controlar el saldo del banco: si está cerca del mínimo, fondear', 'Revisar el cierre de ayer en Cierres: que dé ✅ OK; si no, encontrar la diferencia', 'Revisar transferencias entrantes sin dueño y retiros con pago fallido', 'Anotar en Gastos todo pago hecho por fuera del sistema'] },
  { key: 'marketing', icon: '📣', name: 'Marketing y pauta', mission: 'Saber cuánto cuesta cada cliente que carga y qué publicista o campaña rinde.',
    staffing: '1 persona (puede ser el community manager). Tiene que cargar el gasto TODOS los días.',
    routine: ['Cargar acá el gasto en pauta de AYER (por campaña si se puede)', 'Revisar registrados y primeras cargas por campaña del día', 'Pausar o achicar la campaña que trae registros que no cargan', 'Pasarle los números a cada publicista (link de resultados)'] },
  { key: 'recontacto', icon: '📞', name: 'Recontacto y retención', mission: 'Recuperar a los que dejaron de cargar antes de que se pierdan del todo.',
    staffing: '1-2 personas (puede ser alguien de Atención en el turno tranquilo, 10 a 13 h).',
    routine: ['Escribirle a cada cliente de la lista de hoy (empezando por los que más cargaron)', 'Anotar en cada uno qué respondió (no le interesa / vuelve / problema con algo)', 'Pasarle a Operaciones o Seguridad los problemas que aparezcan'] },
  { key: 'contenido', icon: '🎨', name: 'Contenido e historias', mission: 'Historias y avisos que den ganas de entrar: pagos reales, partidos, beneficios. Nada de promesas raras.',
    staffing: '1 persona creativa (diseño básico + redacción). Medio turno alcanza.',
    routine: ['Revisar qué historias de ayer se vieron y tocaron más (y repetir ese estilo)', 'Publicar al menos 1 historia manual del día con lo que propone este puesto', 'Revisar los textos automáticos (COMANDOS) que más se usan y mejorar uno por semana'] },
  { key: 'promos', icon: '🎁', name: 'Promociones y bonos', mission: 'Que los regalos traigan cargas y no se coman la ganancia.',
    staffing: '1 persona (la misma de Dirección o Marketing). Revisión diaria corta.',
    routine: ['Mirar el % regalado sobre lo cargado (sano: hasta 15-20%)', 'Revisar en 📈 Negocio qué regalo rinde y cuál no', 'Proponer en Dirección un cambio por semana (no más: si no, no se puede medir)'] }
];
const DESK_KEYS = DESKS.map((x) => x.key);

// Id estable de una tarea por su texto (así al rehacer el informe se mantiene lo ya tildado).
function taskId(text) { let h = 5381; const s = String(text || ''); for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return 't' + h.toString(36); }

// Junta tareas nuevas con las del mismo día ya guardadas: conserva done/doneBy/note; las alertas que ya no están pero se tildaron, quedan.
function mergeTasks(oldTasks, fresh) {
  const old = new Map((oldTasks || []).map((t) => [t.id, t]));
  const out = fresh.map((t) => { const o = old.get(t.id); return o ? Object.assign({}, t, { done: !!o.done, doneBy: o.doneBy || null, doneAt: o.doneAt || null, note: o.note || '' }) : Object.assign({ done: false, doneBy: null, doneAt: null, note: '' }, t); });
  for (const o of old.values()) if (!out.some((t) => t.id === o.id) && (o.done || o.note)) out.push(Object.assign({}, o, { stale: true }));
  return out;
}

function _verdict(alerts) { return alerts.some((a) => a.sev === 'bad') ? 'bad' : alerts.some((a) => a.sev === 'warn') ? 'warn' : 'ok'; }
function _pack(desk, head, lines, alerts, extraTasks) {
  const tasks = [];
  for (const a of alerts) tasks.push({ id: taskId(desk + '|a|' + (a.task || a.text)), text: a.task || a.text, kind: 'alerta', sev: a.sev });
  for (const t of extraTasks || []) tasks.push({ id: taskId(desk + '|x|' + t), text: t, kind: 'dato' });
  const meta = DESKS.find((x) => x.key === desk);
  for (const t of meta.routine) tasks.push({ id: taskId(desk + '|r|' + t), text: t, kind: 'rutina' });
  return { verdict: _verdict(alerts), head, lines, alerts, tasks };
}

const DESK_BUILD = {
  operaciones(d) {
    const s = d.stalls || {}; const p = s.payouts || {}; const dp = s.deposits || {}; const sp = d.support || {};
    const autoPay = ratio(p.paidAuto, (p.paidAuto || 0) + (p.paidManual || 0)); const autoDep = ratio(dp.auto, (dp.auto || 0) + (dp.manual || 0));
    const lines = [
      ['Retiros pedidos (24 h)', num(p.requested) + ' · solos ' + num(p.paidAuto) + ' · a mano ' + num(p.paidManual)],
      ['Retiros que salieron solos', pctS(autoPay) + ' · tardan ' + mins(p.autoMinutes) + ' (a mano ' + mins(p.manualMinutes) + ')'],
      ['Cargas por banco (24 h)', 'solas ' + num(dp.auto) + ' · a mano ' + num(dp.manual) + ' · en revisión ' + num(dp.review)],
      ['Cargas que entraron solas', pctS(autoDep)],
      ['Comprobantes que la IA no leyó', num(dp.aiFailed) + (dp.aiFallback ? ' (+' + num(dp.aiFallback) + ' por cliente de confianza)' : '')],
      ['AHORA esperando', num(p.waitingNow) + ' retiros · ' + num(sp.pendingReceipts) + ' cargas' + (sp.oldestReceiptMin != null ? ' (la más vieja hace ' + mins(sp.oldestReceiptMin) + ')' : '')]
    ];
    const al = [];
    if (p.waitingNow > 0) al.push({ sev: p.waitingNow >= 5 ? 'bad' : 'warn', text: num(p.waitingNow) + ' retiros esperando una persona', task: 'Resolver los ' + num(p.waitingNow) + ' retiros de "Pagos a confirmar" (pagar o rechazar con motivo)' });
    if (sp.pendingReceipts > 0) al.push({ sev: (sp.oldestReceiptMin || 0) > 30 ? 'bad' : 'warn', text: num(sp.pendingReceipts) + ' cargas pendientes' + (sp.oldestReceiptMin != null ? ', la más vieja hace ' + mins(sp.oldestReceiptMin) : ''), task: 'Vaciar "Cargas pendientes" (' + num(sp.pendingReceipts) + ')' });
    if (autoPay != null && autoPay < 0.85 && (p.requested || 0) >= 5) al.push({ sev: 'warn', text: 'Sólo ' + pctS(autoPay) + ' de los retiros salió solo (meta 90%)', task: 'Ver en 📈 Negocio → Dónde nos trabamos por qué se frenan los retiros y pasarlo a Dirección' });
    if (autoDep != null && autoDep < 0.8 && ((dp.auto || 0) + (dp.manual || 0)) >= 5) al.push({ sev: 'warn', text: 'Sólo ' + pctS(autoDep) + ' de las cargas entró sola (meta 85%)', task: 'Revisar las cargas hechas a mano de hoy: ¿por qué no entraron solas? (comprobante incompleto, otro titular, monto distinto)' });
    if ((dp.noMatch || 0) > 0) al.push({ sev: 'warn', text: num(dp.noMatch) + ' transferencias sin dueño', task: 'Buscar el dueño de las ' + num(dp.noMatch) + ' transferencias sin asignar (Cargas automáticas → Movimientos)' });
    const head = (p.waitingNow || sp.pendingReceipts) ? 'Hay ' + num(p.waitingNow) + ' retiros y ' + num(sp.pendingReceipts) + ' cargas esperando a una persona.' : 'Las colas están vacías. Salieron solos ' + pctS(autoPay) + ' de los retiros y ' + pctS(autoDep) + ' de las cargas.';
    return _pack('operaciones', head, lines, al);
  },
  atencion(d) {
    const s = d.support || {};
    const lines = [
      ['Chats abiertos ahora', num(s.openChats)],
      ['Clientes esperando respuesta ahora', num(s.waiting) + (s.oldestWaitMin != null ? ' · el que más espera: ' + mins(s.oldestWaitMin) : '')],
      ['Esperas de más de 2 min (24 h)', num(s.delays24) + (s.avgDelayMin != null ? ' · promedio ' + mins(s.avgDelayMin) : '')],
      ['Quedaron SIN respuesta (24 h)', num(s.unanswered24)],
      ['Visitantes sin cuenta esperando', num(s.guestsOpen)]
    ];
    const al = [];
    if (s.waiting > 0 && (s.oldestWaitMin || 0) > 5) al.push({ sev: (s.oldestWaitMin || 0) > 20 ? 'bad' : 'warn', text: num(s.waiting) + ' clientes esperando, el más viejo hace ' + mins(s.oldestWaitMin), task: 'Responder YA a los ' + num(s.waiting) + ' clientes que esperan' });
    if (s.unanswered24 > 0) al.push({ sev: s.unanswered24 >= 5 ? 'bad' : 'warn', text: num(s.unanswered24) + ' clientes quedaron sin respuesta ayer', task: 'Escribirle a los ' + num(s.unanswered24) + ' clientes que quedaron sin respuesta (Soporte → Cerrados, del día)' });
    if (s.avgDelayMin != null && s.avgDelayMin > 10) al.push({ sev: 'warn', text: 'Cuando hay demora, es de ' + mins(s.avgDelayMin) + ' en promedio', task: 'Ver en qué horario se juntan las demoras y avisarle a Dirección si falta gente en ese turno' });
    if (s.guestsOpen > 0) al.push({ sev: 'warn', text: num(s.guestsOpen) + ' visitantes sin cuenta esperando', task: 'Responder a los ' + num(s.guestsOpen) + ' visitantes (columna Visitantes)' });
    const head = s.waiting ? num(s.waiting) + ' clientes esperando respuesta ahora.' : 'Nadie esperando ahora. Ayer ' + num(s.delays24) + ' esperas largas y ' + num(s.unanswered24) + ' sin respuesta.';
    return _pack('atencion', head, lines, al);
  },
  seguridad(d) {
    const s = d.sec || {};
    const lines = [
      ['Bloqueados (24 h)', num(s.blocks) + (s.autoBlocks ? ' (' + num(s.autoBlocks) + ' por el antifraude)' : '')],
      ['Puestos en observación (24 h)', num(s.watches) + ' · en observación ahora: ' + num(s.watchingNow)],
      ['Cuentas secundarias nuevas (24 h)', num(s.dups)],
      ['Retiros rechazados (24 h)', num(s.rejects)],
      ['Retiros frenados por antifraude ahora', num(s.heldAntifraud)],
      ['Retiros que salieron solos con señales, sin revisar', num(s.unreviewedFlagged)],
      ['Marcados como sospechosos por el turno (24 h)', num(s.suspicious)]
    ];
    const al = [];
    if (s.heldAntifraud > 0) al.push({ sev: 'warn', text: num(s.heldAntifraud) + ' retiros frenados por el antifraude', task: 'Revisar los ' + num(s.heldAntifraud) + ' retiros frenados (🛡️ Antifraude → Retiros frenados): liberar o rechazar con motivo' });
    if (s.unreviewedFlagged > 0) al.push({ sev: s.unreviewedFlagged >= 10 ? 'bad' : 'warn', text: num(s.unreviewedFlagged) + ' retiros automáticos con señales sin mirar', task: 'Marcar OK / Sospechoso los ' + num(s.unreviewedFlagged) + ' retiros de "👀 Para revisar"' });
    if (s.dups > 0) al.push({ sev: 'warn', text: num(s.dups) + ' cuentas secundarias nuevas', task: 'Revisar las ' + num(s.dups) + ' cuentas secundarias nuevas (¿es la misma persona? ¿cobró algo?)' });
    if (s.suspicious > 0) al.push({ sev: 'bad', text: num(s.suspicious) + ' retiros marcados sospechosos por el turno', task: 'Investigar los ' + num(s.suspicious) + ' retiros sospechosos del día y decidir bloqueo' });
    if ((s.blocks || 0) >= 10) al.push({ sev: 'warn', text: num(s.blocks) + ' bloqueos en un día: es mucho', task: 'Revisar si los bloqueos de hoy vienen de la misma campaña o publicista y avisar a Marketing' });
    const head = al.length ? al[0].text + '.' : 'Día tranquilo: ' + num(s.blocks) + ' bloqueos, ' + num(s.dups) + ' cuentas secundarias.';
    const recent = (s.recent || []).slice(0, 8).map((e) => '@' + e.username + ' · ' + e.what + (e.reason ? ' · ' + String(e.reason).slice(0, 60) : ''));
    return _pack('seguridad', head, lines.concat(recent.length ? [['Últimos movimientos', recent.join('\n')]] : []), al);
  },
  banco(d) {
    const b = d.bank || {}; const m = d.money || {}; const pm = d.prevMoney || {};
    const lines = [
      ['Entró por cargas (24 h)', money(m.deposits) + chgS(m.deposits, pm.deposits)],
      ['Salió por retiros (24 h)', money(m.withdrawals)],
      ['Resultado de caja (24 h)', money(m.result) + chgS(m.result, pm.result)],
      ['Saldo del banco', b.balance == null ? 'sin dato' : money(b.balance) + ' (mínimo ' + money(b.minArs) + ')'],
      ['Retiros con pago fallido ahora', num(b.failedPayouts)],
      ['Transferencias en revisión / sin dueño (3 días)', num(b.unresolved)],
      ['Último cierre', b.lastCloseKey ? b.lastCloseKey + (b.lastCloseOk === true ? ' ✅ OK' : b.lastCloseOk === false ? ' ⚠️ con diferencia' : '') : '—']
    ];
    const al = [];
    if (b.low) al.push({ sev: 'bad', text: 'Saldo del banco bajo: ' + money(b.balance), task: 'Fondear la cuenta del banco (saldo ' + money(b.balance) + ', mínimo ' + money(b.minArs) + ')' });
    if (b.outage) al.push({ sev: 'bad', text: 'Alerta de BANCO CON FALLAS activa', task: 'Ver Configuración → Banco con fallas: confirmar con el banco y apagar la alerta cuando ande' });
    if (b.failedPayouts > 0) al.push({ sev: 'warn', text: num(b.failedPayouts) + ' retiros con pago fallido', task: 'Mirar en el extracto del banco los ' + num(b.failedPayouts) + ' retiros fallidos antes de reintentarlos (que no se paguen dos veces)' });
    if (b.unresolved > 0) al.push({ sev: 'warn', text: num(b.unresolved) + ' transferencias sin resolver', task: 'Resolver las ' + num(b.unresolved) + ' transferencias en revisión o sin dueño' });
    if (b.lastCloseOk === false) al.push({ sev: 'warn', text: 'El último cierre tiene diferencia', task: 'Encontrar la diferencia del cierre ' + b.lastCloseKey + ' (Cierres → detalle → conciliación)' });
    if ((m.result || 0) < 0) al.push({ sev: 'warn', text: 'Día con resultado negativo: ' + money(m.result), task: 'Ver si el negativo viene de pocos retiros grandes (normal) o de muchos chicos (pasárselo a Promos y Seguridad)' });
    const head = 'Resultado de caja 24 h: ' + money(m.result) + '. ' + (b.balance == null ? 'Sin saldo del banco.' : 'Saldo del banco ' + money(b.balance) + '.');
    return _pack('banco', head, lines, al);
  },
  marketing(d) {
    const k = d.mkt || {};
    const cpa7 = ratio(k.spend7, k.firstDeps7);
    const lines = [
      ['Gasto en pauta de AYER', k.spendYesterdayLoaded ? money(k.spendYesterday) : '⚠️ sin cargar'],
      ['Gasto últimos 7 días', money(k.spend7)],
      ['Registrados (24 h)', num(k.registered24)],
      ['Primeras cargas (24 h)', num(k.firstDeps24) + ' · últimos 7 días: ' + num(k.firstDeps7)],
      ['Costo por cliente que carga (7 días)', cpa7 == null ? '—' : money(cpa7)]
    ];
    for (const c of (k.byCampaign24 || []).slice(0, 8)) lines.push(['  · ' + c.campaign, num(c.registered) + ' registrados · ' + num(c.firstDeps) + ' cargaron']);
    const al = [];
    if (!k.spendYesterdayLoaded) al.push({ sev: 'warn', text: 'No está cargado el gasto de ayer', task: 'Cargar el gasto en pauta de ayer (' + (k.yesterdayKey || 'ayer') + ') en este puesto' });
    for (const c of (k.byCampaign24 || [])) if (c.registered >= 15 && c.firstDeps === 0) al.push({ sev: 'warn', text: c.campaign + ': ' + num(c.registered) + ' registrados y ninguno cargó', task: 'Revisar la campaña ' + c.campaign + ' (trae registros que no cargan): pausar o cambiar el anuncio' });
    if ((k.registered24 || 0) >= 20 && ratio(k.firstDeps24, k.registered24) < 0.1) al.push({ sev: 'warn', text: 'Menos del 10% de los registrados cargó', task: 'Revisar con Atención si los registrados nuevos tienen algún problema para cargar' });
    const head = (k.spendYesterdayLoaded ? 'Ayer se gastaron ' + money(k.spendYesterday) + '. ' : 'Falta cargar el gasto de ayer. ') + num(k.registered24) + ' registrados y ' + num(k.firstDeps24) + ' primeras cargas en 24 h.';
    return _pack('marketing', head, lines, al);
  },
  recontacto(d) {
    const r = d.recon || {};
    const lines = [
      ['Enfriándose (última carga hace 5-14 días)', num(r.cooling)],
      ['Por perderse (hace 15-30 días)', num(r.lost)],
      ['Lista de hoy', num((r.list || []).length) + ' clientes (los que más cargaron primero)']
    ];
    const extra = (r.list || []).map((c) => 'Escribirle a @' + c.username + ' — ' + num(c.deposits) + ' cargas, ' + money(c.total) + ', última hace ' + c.lastDays + ' días' + (c.hasApp ? '' : ' (sin app)'));
    const al = [];
    if ((r.lost || 0) > 50) al.push({ sev: 'warn', text: num(r.lost) + ' clientes con cargas que llevan 15-30 días sin volver', task: 'Proponer en Dirección una acción para los que se están perdiendo (regalo de regreso o llamada)' });
    const head = num((r.list || []).length) + ' clientes para recontactar hoy. ' + num(r.cooling) + ' enfriándose y ' + num(r.lost) + ' por perderse.';
    return _pack('recontacto', head, lines.concat([['Qué decirles', 'Hola! Te extrañamos 🙌 ¿Pasó algo con la carga o con algún retiro? Contanos y lo resolvemos. Si querés volver, te dejamos el CBU acá.']]), al, extra);
  },
  contenido(d) {
    const c = d.content || {};
    const lines = [];
    for (const s of (c.stories24 || []).slice(0, 8)) lines.push(['  · ' + String(s.title || 'historia').slice(0, 40) + (s.auto ? ' (auto)' : ''), num(s.views) + ' vistas · ' + num(s.clicks) + ' toques · ' + num(s.reactions) + ' reacciones']);
    if (!lines.length) lines.push(['Historias de las últimas 24 h', 'ninguna']);
    if (c.best7) lines.push(['La que más rindió (7 días)', String(c.best7.title || '').slice(0, 50) + ' — ' + num(c.best7.clicks) + ' toques / ' + num(c.best7.views) + ' vistas']);
    if (c.paid24 && c.paid24.n) lines.push(['Dato para una historia', 'Ayer pagamos ' + num(c.paid24.n) + ' retiros por ' + money(c.paid24.total) + ' (sin nombres)']);
    const ideas = [];
    if (c.paid24 && c.paid24.n >= 5) ideas.push('Historia "💸 Ayer pagamos ' + num(c.paid24.n) + ' retiros" (sin nombres ni montos individuales)');
    const dow = c.tomorrowDow; // 0 domingo … 6 sábado (hora AR)
    if (dow === 1) ideas.push('Mañana es lunes: historia del reembolso SEMANAL ("reclamalo lunes o martes")');
    if (dow === 3) ideas.push('Mañana es miércoles (historia con bono automática): preparar 1 historia de servicio para la tarde');
    if (dow === 5 || dow === 6) ideas.push('Finde: historia con los partidos importantes y "cargá y retirá las 24 h"');
    ideas.push('Historia de atención: "estamos las 24 h, respondemos en minutos" con la foto del estilo de la página');
    if (c.topQuestion) ideas.push('Historia que responda la pregunta más repetida: ' + c.topQuestion);
    const al = [];
    if (!(c.stories24 || []).length) al.push({ sev: 'warn', text: 'No hubo historias en 24 h', task: 'Publicar al menos 1 historia hoy (ver ideas abajo)' });
    if (c.autoErr) al.push({ sev: 'warn', text: 'Las historias automáticas avisan un problema: ' + String(c.autoErr).slice(0, 80), task: 'Revisar Historias automáticas (diagnóstico) y avisar a Dirección' });
    const head = num((c.stories24 || []).length) + ' historias en 24 h. ' + (c.best7 ? 'La mejor de la semana: "' + String(c.best7.title || '').slice(0, 40) + '".' : '');
    return _pack('contenido', head, lines.concat([['Ideas para hoy', ideas.join('\n')]]), al, ideas.slice(0, 2).map((i) => 'Idea: ' + i));
  },
  promos(d) {
    const p = d.promo || {}; const m = d.money || {};
    const lines = [
      ['Regalado / cargado (24 h)', pctS(m.giftRatio) + ' — ' + money(m.gifts) + ' de ' + money(m.deposits)],
      ['Regalado / cargado (este mes)', pctS(p.monthGiftRatio)],
      ['Giros gratis de ruleta (24 h)', num(p.freeSpins24)],
      ['2ª carga ofrecida / usada (7 días)', num(p.secondOffered7) + ' / ' + num(p.secondUsed7)]
    ];
    for (const g of (m.giftsByType || []).slice(0, 5)) lines.push(['  · ' + g.label, money(g.total)]);
    const al = [];
    if (p.monthGiftRatio != null && p.monthGiftRatio > 0.2) al.push({ sev: 'bad', text: 'Este mes se regala ' + pctS(p.monthGiftRatio) + ' de lo cargado (tope sano 20%)', task: 'Ver en 📈 Negocio qué regalo no rinde y proponer bajarlo' });
    else if (p.monthGiftRatio != null && p.monthGiftRatio > 0.15) al.push({ sev: 'warn', text: 'Este mes se regala ' + pctS(p.monthGiftRatio) + ' de lo cargado (cerca del tope)', task: 'Vigilar los regalos: no sumar promos nuevas esta semana' });
    if (p.secondOffered7 >= 20 && ratio(p.secondUsed7, p.secondOffered7) < 0.1) al.push({ sev: 'warn', text: 'La 2ª carga casi no se usa (' + pctS(ratio(p.secondUsed7, p.secondOffered7)) + ')', task: 'Revisar el texto o el % de la oferta de 2ª carga' });
    const head = 'Regalado ' + pctS(m.giftRatio) + ' en 24 h y ' + pctS(p.monthGiftRatio) + ' en el mes.';
    return _pack('promos', head, lines, al);
  }
};

// Sistema / estructura técnica: va adentro de Dirección (no es un puesto de una persona aparte).
function systemChecks(d) {
  const s = d.sys || {}; const al = [];
  if (!s.giroxOk) al.push({ sev: 'bad', text: 'La API de 1girox no está conectada', task: 'Comandos → Banco automático → API de 1girox: probar y guardar' });
  if (!s.hgcashToken) al.push({ sev: 'bad', text: 'Falta el token del banco automático', task: 'Cargar el token de hgcash en Comandos → Banco automático' });
  if (!s.hgcashEnabled || s.hgcashMode !== 'auto') al.push({ sev: 'bad', text: 'El banco automático está ' + (!s.hgcashEnabled ? 'APAGADO' : 'en modo SOMBRA') + ': las cargas no entran solas', task: 'Activar el banco automático en modo AUTO (Comandos → Banco automático)' });
  if (!s.aiOk) al.push({ sev: 'warn', text: 'La lectura de comprobantes (IA) está apagada', task: 'Revisar la clave de la IA de comprobantes' });
  if (s.pollError) al.push({ sev: 'warn', text: 'La consulta al banco da error: ' + String(s.pollError).slice(0, 80), task: 'Cargas automáticas → 🩺 Diagnóstico del banco → Revisar ahora' });
  if (s.dbMs != null && s.dbMs > 1500) al.push({ sev: 'warn', text: 'La base respondió lento (' + num(s.dbMs) + ' ms)', task: 'Si la página anda lenta, avisar (puede hacer falta un plan más grande de la base)' });
  const lines = [
    ['1girox', s.giroxOk ? '✅ conectada' : '❌ sin conectar'],
    ['Banco automático', (s.hgcashEnabled ? '✅ activo' : '❌ apagado') + ' · ' + (s.hgcashMode === 'auto' ? 'AUTO' : 'SOMBRA') + ' · token ' + (s.hgcashToken ? '✅' : '❌')],
    ['Lectura de comprobantes (IA)', s.aiOk ? '✅' : '❌'],
    ['Base de datos', s.dbMs == null ? '—' : num(s.dbMs) + ' ms'],
    ['Último aviso del banco OK', s.webhookLastOkAt ? new Date(s.webhookLastOkAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—']
  ];
  return { lines, alerts: al };
}

// Arma TODOS los puestos. `prevDone` = { desk: {done, total} } de ayer (cumplimiento).
function buildAll(d, prevDone) {
  const out = {};
  for (const k of Object.keys(DESK_BUILD)) { try { out[k] = DESK_BUILD[k](d); } catch (e) { out[k] = { verdict: 'warn', head: 'No se pudo armar el informe: ' + e.message, lines: [], alerts: [], tasks: [] }; } }
  const sys = systemChecks(d); const m = d.money || {};
  const lines = [['Resultado de caja (24 h)', money(m.result)], ['Cargas / retiros (24 h)', money(m.deposits) + ' / ' + money(m.withdrawals)], ['Clientes que cargaron (24 h)', num(m.depositors)], ['Registrados (24 h)', num(m.registered)]].concat(sys.lines);
  const board = Object.keys(out).map((k) => { const meta = DESKS.find((x) => x.key === k); const pd = (prevDone || {})[k]; return [meta.icon + ' ' + meta.name, (out[k].verdict === 'bad' ? '🔴 ' : out[k].verdict === 'warn' ? '🟡 ' : '🟢 ') + out[k].head + (pd && pd.total ? ' · ayer cumplió ' + pd.done + '/' + pd.total : '')]; });
  const al = sys.alerts.slice();
  for (const k of Object.keys(out)) for (const a of out[k].alerts) if (a.sev === 'bad') al.push({ sev: 'bad', text: DESKS.find((x) => x.key === k).icon + ' ' + a.text, task: 'Controlar que ' + DESKS.find((x) => x.key === k).name + ' resuelva: ' + a.text });
  for (const k of Object.keys(prevDone || {})) { const pd = prevDone[k]; if (pd && pd.total >= 3 && pd.done / pd.total < 0.5) al.push({ sev: 'warn', text: DESKS.find((x) => x.key === k).name + ' cumplió sólo ' + pd.done + '/' + pd.total + ' tareas ayer', task: 'Hablar con ' + DESKS.find((x) => x.key === k).name + ': ayer cumplió ' + pd.done + '/' + pd.total }); }
  const nBad = Object.values(out).filter((x) => x.verdict === 'bad').length, nWarn = Object.values(out).filter((x) => x.verdict === 'warn').length;
  const head = (sys.alerts.some((a) => a.sev === 'bad') ? '🚨 Hay un problema técnico que frena todo. ' : '') + 'Caja 24 h ' + money(m.result) + '. ' + (nBad ? nBad + ' puestos en rojo, ' : '') + nWarn + ' en amarillo.';
  out.direccion = _pack('direccion', head, lines.concat([['Puestos', board.map((x) => x[0] + ': ' + x[1]).join('\n')]]), al);
  return out;
}

module.exports = { DESKS, DESK_KEYS, taskId, mergeTasks, buildAll, systemChecks, _internals: { money, pctS, chg } };
