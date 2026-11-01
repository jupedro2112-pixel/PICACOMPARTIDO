// #1013 OFICINA (página aparte del panel). Mismo login (cookie admin_api_session, Path=/api). Admin con clave de INICIO ⇒ toda la oficina
// (/api/admin/inicio/office); el resto del equipo ⇒ sus puestos (/api/admin/office/mine). Cada 60 s recarga y avisa "estoy conectado" (ping).
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtT = (d) => d ? new Date(d).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' }) : '';
  const fmtDT = (d) => d ? new Date(d).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const artKey = (d) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
  const COLORS = ['#e60023', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c'];
  const colorOf = (u) => { let h = 0; for (const c of String(u)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (_) {} } };
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };

  let me = null, mode = 'mine', data = null, openDesk = null, day = null, seenFeed = null;

  function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 2600); }
  function show(v) { for (const id of ['loginView', 'pinView', 'appView']) $(id).hidden = id !== v; }
  async function api(url, opt) {
    const o = Object.assign({ credentials: 'same-origin', headers: {} }, opt || {});
    o.headers = Object.assign({ 'Content-Type': 'application/json' }, o.headers);
    const pin = ss.get('inicio_pin'); if (pin && url.indexOf('/api/admin/inicio/') === 0) o.headers['x-inicio-pin'] = pin;
    const r = await fetch(url, o); let j = {}; try { j = await r.json(); } catch (_) {}
    if (r.status === 401) { show('loginView'); throw new Error('Sesión vencida: volvé a entrar'); }
    if (r.status === 423 || r.status === 428) { ss.set('inicio_pin', null); show('pinView'); $('perr').textContent = j.error || 'Clave incorrecta'; throw new Error('clave'); }
    if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
    return j;
  }

  // ---------- arranque / login ----------
  async function boot() {
    if (ls.get('office_theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    try {
      const r = await fetch('/api/admin/me', { credentials: 'same-origin' });
      if (!r.ok) { show('loginView'); return; }
      me = (await r.json()).user;
    } catch (_) { show('loginView'); return; }
    if (!me || me.role === 'publisher_admin') { show('loginView'); $('lerr').textContent = 'Este usuario no tiene puesto en la oficina.'; return; }
    if (me.role === 'admin' && ss.get('office_mode') !== 'mine') { if (ss.get('inicio_pin')) { mode = 'all'; startApp(); } else show('pinView'); return; }
    mode = 'mine'; startApp();
  }
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('lerr').textContent = '';
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('lu').value.trim(), password: $('lp').value }) });
      const j = await r.json().catch(() => ({}));
      if (!j.token) { $('lerr').textContent = j.error || 'Usuario o clave incorrectos'; return; }
      if (j.user && j.user.needsPasswordChange) { $('lerr').textContent = 'Primero cambiá tu clave en el panel.'; return; }
      $('lp').value = ''; boot();
    } catch (_) { $('lerr').textContent = 'Error de conexión'; }
  });
  $('pinForm').addEventListener('submit', (e) => { e.preventDefault(); ss.set('inicio_pin', $('pinIn').value); ss.set('office_mode', null); $('pinIn').value = ''; $('perr').textContent = ''; mode = 'all'; startApp(); });
  $('pinMine').addEventListener('click', () => { ss.set('office_mode', 'mine'); mode = 'mine'; startApp(); });
  $('btnOut').addEventListener('click', async () => { try { await fetch('/api/auth/admin-logout', { method: 'POST', credentials: 'same-origin' }); } catch (_) {} ss.set('inicio_pin', null); ss.set('office_mode', null); location.reload(); });
  $('btnTheme').addEventListener('click', () => { const d = document.documentElement.getAttribute('data-theme') === 'dark'; if (d) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', 'dark'); ls.set('office_theme', d ? 'light' : 'dark'); });
  $('btnRefresh').addEventListener('click', () => load(true));
  $('btnRebuild').addEventListener('click', async () => {
    $('btnRebuild').disabled = true; toast('🤖 Los analistas están revisando los números…'); document.querySelectorAll('.monitor .bot').forEach((b) => { b.insertAdjacentHTML('beforeend', '<span class="typing"><i></i><i></i><i></i></span>'); });
    try { await api('/api/admin/inicio/office/rebuild', { method: 'POST', body: '{}' }); toast('✅ Análisis nuevo listo'); await load(true); } catch (e) { toast('❌ ' + e.message); } finally { $('btnRebuild').disabled = false; }
  });
  $('daySel').addEventListener('change', () => { day = $('daySel').value; seenFeed = null; load(true); });
  $('drawer').addEventListener('click', (e) => { if (e.target === $('drawer')) closeDesk(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDesk(); });

  let timers = [];
  function startApp() {
    show('appView'); $('who').textContent = '· ' + me.username + (mode === 'all' ? ' (toda la oficina)' : '');
    $('btnRebuild').hidden = mode !== 'all';
    const sel = $('daySel'); sel.innerHTML = ''; const now = new Date();
    for (let i = 0; i < 7; i++) { const k = artKey(new Date(now.getTime() - i * 86400000)); sel.insertAdjacentHTML('beforeend', '<option value="' + k + '">' + (i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : k.slice(8, 10) + '/' + k.slice(5, 7)) + '</option>'); }
    day = artKey(now);
    timers.forEach(clearInterval); timers = [];
    timers.push(setInterval(tick, 1000)); tick();
    timers.push(setInterval(() => { if (!document.hidden) load(false); }, 60000));
    timers.push(setInterval(() => { if (!document.hidden) ping(); }, 60000));
    load(true); ping();
  }
  function tick() { $('clock').textContent = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  function ping() { const desk = openDesk || (data && data.desks && data.desks.find((d) => d.people.some((p) => p.username === me.username)) || {}).key || null; api('/api/admin/office/ping', { method: 'POST', body: JSON.stringify({ desk }) }).catch(() => {}); }

  async function load(force) {
    try {
      const url = (mode === 'all' ? '/api/admin/inicio/office' : '/api/admin/office/mine') + '?date=' + encodeURIComponent(day || '');
      if (force && !data) $('desks').innerHTML = '<div class="small">🤖 Los analistas están armando los informes del día… (la primera vez tarda unos segundos)</div>';
      data = await api(url);
      render();
      if (openDesk) { const a = document.activeElement; if (!(a && $('pane').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) renderDesk(openDesk); }
    } catch (e) { if (e.message !== 'clave') toast('❌ ' + e.message); }
  }

  // ---------- plano de la oficina ----------
  function avatar(p, big) {
    const ini = String(p.username).replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?';
    const t = p.username + ' · turno ' + p.shift + (p.online ? ' · 🟢 conectado' : p.lastAt ? ' · visto ' + fmtDT(p.lastAt) : ' · nunca entró');
    return '<span class="av' + (p.online ? ' on' : '') + (p.here ? ' here' : '') + '" title="' + esc(t) + '" style="background:' + colorOf(p.username) + (big ? ';width:38px;height:38px;font-size:14px' : '') + '">' + esc(ini) + '<span class="dot"></span></span>';
  }
  const VD = { ok: '🟢 en orden', warn: '🟡 a mirar', bad: '🔴 urgente' };
  function render() {
    const ds = data.desks || [];
    if (!ds.length) { $('desks').innerHTML = '<div class="card" style="background:var(--card);padding:16px;border-radius:14px">Todavía no tenés un puesto asignado. Pedile al encargado que te asigne uno.</div>'; $('feed').innerHTML = ''; $('team').textContent = '—'; return; }
    $('desks').innerHTML = ds.map((d) => {
      const r = d.report || {}; const pr = d.progress || { done: 0, total: 0 }; const pct = pr.total ? Math.round(pr.done * 100 / pr.total) : 0;
      const working = d.people.some((p) => p.here);
      return '<div class="desk ' + esc(r.verdict || 'ok') + (d.key === 'direccion' ? ' big' : '') + '" data-desk="' + esc(d.key) + '" tabindex="0">' +
        '<div class="top"><span class="ico">' + d.icon + '</span><span class="nm">' + esc(d.name) + '</span><span class="vd">' + (VD[r.verdict] || '—') + '</span></div>' +
        '<div class="monitor"><div class="bot">🤖 analista' + (working ? ' · <span style="color:var(--ok)">' + esc(d.people.filter((p) => p.here).map((p) => p.username).join(', ')) + ' trabajando</span><span class="typing"><i></i><i></i><i></i></span>' : '') + '</div>' + esc(r.head || 'Sin informe todavía.') + '</div>' +
        '<div class="people">' + (d.people.length ? d.people.map((p) => avatar(p)).join('') : '<span class="empty">⚠️ Puesto sin persona</span>') + '<span class="small" style="margin-left:auto">' + pr.done + '/' + pr.total + ' tareas</span></div>' +
        '<div class="bar"><i style="width:' + pct + '%;background:' + (pct >= 80 ? 'var(--ok)' : pct >= 40 ? 'var(--warn)' : 'var(--bad)') + '"></i></div></div>';
    }).join('');
    $('desks').querySelectorAll('.desk').forEach((el) => { el.addEventListener('click', () => openDeskView(el.dataset.desk)); el.addEventListener('keydown', (e) => { if (e.key === 'Enter') openDeskView(el.dataset.desk); }); });
    const b = ds.map((d) => d.builtAt).filter(Boolean).sort().pop();
    $('builtAt').textContent = b ? '🤖 Análisis armado ' + fmtDT(b) + ' · se rehace solo a las 07 h y cada 6 h' + (data.date !== data.today ? ' · estás viendo el ' + data.date : '') : '';
    // equipo conectado
    const ppl = new Map(); ds.forEach((d) => d.people.forEach((p) => { const x = ppl.get(p.username) || Object.assign({ desks: [] }, p); x.desks.push(d.icon); if (p.online) x.online = true; if (p.here) x.hereDesk = d.name; ppl.set(p.username, x); }));
    const arr = [...ppl.values()].sort((a, b) => (!!b.online - !!a.online) || a.username.localeCompare(b.username));
    $('team').innerHTML = arr.length ? arr.map((p) => '<div class="row" style="margin:4px 0">' + avatar(p) + '<span><b>' + esc(p.username) + '</b> ' + p.desks.join('') + '<br><span class="small">' + (p.online ? (p.hereDesk ? '🟢 trabajando en ' + esc(p.hereDesk) : '🟢 conectado') : '💤 ' + (p.lastAt ? 'visto ' + fmtDT(p.lastAt) : 'nunca entró')) + ' · turno ' + esc(p.shift) + '</span></span></div>').join('') : '<span class="small">Nadie asignado todavía.</span>';
    // feed
    const fd = data.feed || []; const first = seenFeed == null; const seen = seenFeed || new Set();
    $('feed').innerHTML = fd.length ? fd.map((f) => { const k = f.desk + f.text + f.at; const isNew = !first && !seen.has(k); seen.add(k); return '<div class="it' + (isNew ? ' new' : '') + '">' + (f.icon || '') + ' <b>' + esc(f.by || '') + '</b> ' + esc(f.text) + (f.note ? '<br><span class="small">📝 ' + esc(f.note) + '</span>' : '') + '<br><span class="small">' + fmtT(f.at) + '</span></div>'; }).join('') : '<span class="small">Todavía nada' + (data.date === data.today ? ' hoy' : '') + '.</span>';
    seenFeed = seen;
    // puestos vacíos (admin)
    const empty = mode === 'all' ? ds.filter((d) => !d.people.length) : [];
    $('gaps').innerHTML = empty.length ? '<div class="alert" style="margin:0 0 12px"><b>👥 Qué nos falta:</b> ' + empty.length + ' puestos sin persona: ' + empty.map((d) => d.icon + ' ' + esc(d.name)).join(' · ') + '. Tocá cada uno para ver cuánta gente pide y asignarla. Mientras tanto el 🤖 analista hace su informe igual.</div>' : '';
  }

  // ---------- detalle de un puesto ----------
  function openDeskView(k) { openDesk = k; $('drawer').hidden = false; renderDesk(k); ping(); }
  function closeDesk() { if ($('drawer').hidden) return; $('drawer').hidden = true; openDesk = null; ping(); }
  function canEdit(d) { return (me.role === 'admin' || d.people.some((p) => p.username === me.username)) && (data.date === data.today || data.date === artKey(new Date(Date.now() - 86400000))); }
  function renderDesk(k) {
    const d = (data.desks || []).find((x) => x.key === k); if (!d) { closeDesk(); return; }
    const r = d.report || {}; const ed = canEdit(d);
    let h = '<div class="row" style="justify-content:space-between"><h2 style="margin:0">' + d.icon + ' ' + esc(d.name) + '</h2><button class="btn sm" id="dClose">✕ Cerrar</button></div>' +
      '<div class="small" style="margin:4px 0 10px">' + esc(d.mission) + '</div>' +
      '<div class="row" style="margin-bottom:6px">' + (d.people.length ? d.people.map((p) => avatar(p, true) + '<span class="small"><b>' + esc(p.username) + '</b><br>turno ' + esc(p.shift) + '</span>').join('') : '<span class="empty">⚠️ Sin persona asignada</span>') + '</div>' +
      '<div class="small">👥 Cuánta gente pide: ' + esc(d.staffing) + '</div>';
    h += '<div class="sec">🤖 Informe del analista' + (d.builtAt ? ' · ' + fmtDT(d.builtAt) : '') + '</div><div class="monitor" style="margin:0 0 8px">' + esc(r.head || 'Sin informe.') + '</div>';
    if ((r.alerts || []).length) h += r.alerts.map((a) => '<div class="alert ' + (a.sev === 'bad' ? 'bad' : '') + '">' + (a.sev === 'bad' ? '🔴 ' : '🟡 ') + esc(a.text) + '</div>').join('');
    if ((r.lines || []).length) h += '<div class="kv">' + r.lines.map((l) => '<div>' + esc(l[0]) + '</div><div>' + esc(l[1]) + '</div>').join('') + '</div>';
    const tasks = d.tasks || []; const pr = d.progress || { done: 0, total: 0 };
    h += '<div class="sec">✅ Tareas del día · ' + pr.done + '/' + pr.total + '</div>' + (ed ? '' : '<div class="small">Sólo lectura' + (data.date !== data.today ? ' (día anterior)' : ' (no es tu puesto)') + '.</div>');
    const order = { alerta: 0, dato: 1, propia: 2, rutina: 3 };
    h += tasks.slice().sort((a, b) => (a.done - b.done) || ((order[a.kind] || 9) - (order[b.kind] || 9))).map((t) =>
      '<div class="task' + (t.done ? ' done' : '') + '"><input type="checkbox" data-t="' + esc(t.id) + '"' + (t.done ? ' checked' : '') + (ed ? '' : ' disabled') + '>' +
      '<div class="tx"><div class="tt"><span class="tag ' + esc(t.kind) + '">' + esc({ alerta: 'HOY', dato: 'LISTA', propia: 'EXTRA', rutina: 'RUTINA' }[t.kind] || t.kind) + '</span>' + esc(t.text) + (t.stale ? ' <span class="small">(ya no aparece en el análisis)</span>' : '') + '</div>' +
      (t.done ? '<div class="meta">✔ ' + esc(t.doneBy || '') + ' · ' + fmtT(t.doneAt) + '</div>' : '') +
      (ed ? '<input class="note" data-n="' + esc(t.id) + '" placeholder="Nota (qué hiciste / qué pasó)" value="' + esc(t.note || '') + '" maxlength="500">' : (t.note ? '<div class="meta">📝 ' + esc(t.note) + '</div>' : '')) + '</div></div>').join('');
    if (k === 'marketing' && ed) {
      const y = artKey(new Date(Date.now() - 86400000));
      h += '<div class="sec">💸 Cargar gasto en pauta</div><div class="row"><input type="date" id="spDate" value="' + y + '"><input type="number" id="spAmt" placeholder="Monto $" min="1" style="width:120px"><input id="spCamp" placeholder="Campaña (opcional)" style="width:150px"><input id="spNote" placeholder="Nota" style="width:140px"><button class="btn red sm" id="spSave">Guardar</button></div><div class="small">Se suma al mismo registro de gasto que usa Datos IA y 📈 Negocio.</div>';
    }
    if (mode === 'all' && me.role === 'admin') {
      const opts = (data.staff || []).map((s) => '<option value="' + esc(s.username) + '">' + esc(s.username) + ' (' + esc(s.role) + ')</option>').join('');
      h += '<div class="sec">⚙️ Personas del puesto</div><div id="pplEd">' + d.people.map((p, i) => '<div class="row" style="margin:4px 0"><b style="min-width:120px">' + esc(p.username) + '</b><select data-sh="' + i + '">' + ['mañana', 'tarde', 'noche', 'completo'].map((s) => '<option' + (s === p.shift ? ' selected' : '') + '>' + s + '</option>').join('') + '</select><button class="btn sm" data-rm="' + i + '">Quitar</button></div>').join('') + '</div>' +
        '<div class="row"><select id="addP"><option value="">+ Agregar persona del equipo…</option>' + opts + '</select><select id="addSh"><option>mañana</option><option>tarde</option><option>noche</option><option selected>completo</option></select><button class="btn sm" id="addBtn">Agregar</button></div>' +
        '<div class="small">Sólo aparecen usuarios del panel (admin / cargas / retiros / comunidad). Para alguien nuevo, crealo primero en el panel.</div>' +
        '<div class="sec">➕ Tareas extra de todos los días</div><textarea id="xTasks" rows="4" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--bg)" placeholder="Una tarea por línea">' + esc((d.extraTasks || []).join('\n')) + '</textarea><button class="btn sm" id="xSave" style="margin-top:6px">Guardar tareas extra</button> <span class="small">Aparecen desde el próximo análisis (o tocá 🤖 Rehacer análisis).</span>';
    }
    $('pane').innerHTML = h;
    $('dClose').onclick = closeDesk;
    $('pane').querySelectorAll('input[data-t]').forEach((cb) => cb.addEventListener('change', () => saveTask(d.key, cb.dataset.t, { done: cb.checked })));
    $('pane').querySelectorAll('input[data-n]').forEach((inp) => inp.addEventListener('change', () => saveTask(d.key, inp.dataset.n, { note: inp.value })));
    if ($('spSave')) $('spSave').onclick = async () => {
      try { await api('/api/admin/office/spend', { method: 'POST', body: JSON.stringify({ date: $('spDate').value, amount: Number($('spAmt').value), campaign: $('spCamp').value, note: $('spNote').value }) }); toast('✅ Gasto guardado'); $('spAmt').value = ''; } catch (e) { toast('❌ ' + e.message); }
    };
    if ($('addBtn')) {
      const people = d.people.map((p) => ({ username: p.username, shift: p.shift }));
      const savePeople = async (list) => { try { await api('/api/admin/inicio/office/config', { method: 'POST', body: JSON.stringify({ desk: d.key, people: list }) }); toast('✅ Puesto actualizado'); await load(true); } catch (e) { toast('❌ ' + e.message); } };
      $('addBtn').onclick = () => { const u = $('addP').value; if (!u) return; if (people.some((p) => p.username === u)) { toast('Ya está en el puesto'); return; } savePeople(people.concat([{ username: u, shift: $('addSh').value }])); };
      $('pane').querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => savePeople(people.filter((_, i) => i !== Number(b.dataset.rm))); });
      $('pane').querySelectorAll('[data-sh]').forEach((s) => { s.onchange = () => { const l = people.slice(); l[Number(s.dataset.sh)] = Object.assign({}, l[Number(s.dataset.sh)], { shift: s.value }); savePeople(l); }; });
      $('xSave').onclick = async () => { try { await api('/api/admin/inicio/office/config', { method: 'POST', body: JSON.stringify({ desk: d.key, extraTasks: $('xTasks').value.split('\n') }) }); toast('✅ Tareas extra guardadas'); } catch (e) { toast('❌ ' + e.message); } };
    }
  }
  async function saveTask(desk, taskId, patch) {
    try {
      await api('/api/admin/office/task', { method: 'POST', body: JSON.stringify(Object.assign({ date: data.date, desk, taskId }, patch)) });
      if (patch.done !== undefined) { toast(patch.done ? '✅ ¡Hecho!' : 'Desmarcada'); await load(false); } else toast('📝 Nota guardada');
    } catch (e) { toast('❌ ' + e.message); load(false); }
  }

  boot();
})();
