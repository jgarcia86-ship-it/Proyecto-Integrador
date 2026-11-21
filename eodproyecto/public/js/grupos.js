// Módulo "Grupos y estudiantes".
//  administrador: ve todos los grupos, confirma autorizaciones y gestiona docentes (crear, asignar grupos, activar).
//  docente:       ve solo sus grupos y confirma la autorización de sus estudiantes.
// Uso (desde app-shell.js):  EODGrupos.render(elemento, { usuario, api, toast, sub })
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fecha = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return d + ' ' + MES[+m - 1] + ' ' + y; };
  const IC = {
    grupos: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5M15 15c3 0 6 1.3 6 4.5"/>',
    atras: '<path d="M15 6l-6 6 6 6"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    casa: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>'
  };
  const svg = n => `<svg viewBox="0 0 24 24">${IC[n]}</svg>`;
  const stat = (ic, label, valor) => `<div class="cp-stat"><div class="cp-stat-ic">${svg(ic)}</div><div><span>${label}</span><b>${valor}</b></div></div>`;
  const ROL = { administrador: 'Administrador', docente: 'Docente' };

  const pillAut = a => a === 'autorizada' ? `<span class="cp-pill">${svg('check')}Autorizada</span>`
    : a === 'revocada' ? '<span class="cp-pill fin">Revocada</span>'
    : `<span class="cp-pill prog">${svg('reloj')}Pendiente</span>`;

  function banner(titulo, texto) {
    return `<section class="cp-banner"><div class="cp-banner-txt"><svg class="cp-banner-ic" viewBox="0 0 24 24">${IC.grupos}</svg>
      <div><h1>${titulo}</h1><p>${texto}</p></div></div><div class="cp-art">${window.EOD ? EOD.globoSVG() : ''}</div></section>`;
  }

  const vista = { tab: 'grupos' };   // se conserva al volver desde un detalle
  let seq = 0;

  function render(el, ctx) {
    const { usuario, api, toast } = ctx;
    const esAdmin = usuario.rol === 'administrador';
    const mi = ++seq;
    let grupos = [];

    function errorPantalla(msg, reintentar) {
      el.innerHTML = `<div class="cp"><a class="cp-atras" href="#grupos">${svg('atras')}Grupos</a>
        <div class="cp-vacio"><b>No se pudo cargar</b>${esc(msg)}<br><br><button class="cp-btn" type="button" id="gReintentar">Reintentar</button></div></div>`;
      el.onclick = e => { if (e.target.closest('#gReintentar')) reintentar(); };
    }

    // ---------------- LISTA DE GRUPOS ----------------
    function filaGrupo(g) {
      const pctAut = g.estudiantes ? Math.round(g.autorizados / g.estudiantes * 100) : 0;
      const estado = !g.estudiantes ? '<span class="cp-pill fin">Sin estudiantes</span>'
        : g.pendientes ? `<span class="cp-pill prog">${svg('reloj')}${g.pendientes} pendiente${g.pendientes === 1 ? '' : 's'}</span>`
        : `<span class="cp-pill">${svg('check')}Todos autorizados</span>`;
      return `<article class="cp-row" data-id="${g.id}" tabindex="0" role="link" aria-label="Abrir grupo ${esc(g.nombre)}">
        <div class="cp-thumb ic">${svg('grupos')}</div>
        <div class="cp-info"><h3>${esc(g.nombre)}</h3><p>${esc(g.sede)} · ${g.anio}</p>
          <div class="cp-meta"><span>${svg('grupos')}${g.estudiantes} estudiante${g.estudiantes === 1 ? '' : 's'}</span>
            <span>${svg('persona')}${g.docentes ? esc(g.docentes) : 'Sin docente asignado'}</span></div></div>
        <div class="cp-side"><div class="cp-tags">${estado}</div>
          <div class="cp-prog"><div class="cp-bar-bg"><i style="width:${pctAut}%"></i></div><b>${pctAut}%</b></div></div>
        <svg class="cp-chev" viewBox="0 0 24 24">${IC.chev}</svg></article>`;
    }

    async function pantallaLista() {
      el.innerHTML = '<div class="cp"><p style="padding:24px;color:#5d6b62">Cargando…</p></div>';
      try { grupos = (await api('/grupos')).grupos; } catch (e) { if (mi === seq) errorPantalla(e.message, pantallaLista); return; }
      if (mi !== seq) return;
      if (!esAdmin) vista.tab = 'grupos';

      const total = grupos.reduce((s, g) => s + g.estudiantes, 0);
      const aut = grupos.reduce((s, g) => s + g.autorizados, 0);
      const pen = grupos.reduce((s, g) => s + g.pendientes, 0);
      el.innerHTML = `<div class="cp">
        ${banner('Grupos y estudiantes', esAdmin ? 'Confirma autorizaciones y asigna docentes a cada grupo.' : 'Confirma la autorización de los estudiantes de tus grupos.')}
        ${esAdmin ? `<div class="cp-tabs" style="align-self:flex-start"><button type="button" class="cp-tab ${vista.tab === 'grupos' ? 'on' : ''}" data-tab="grupos">Grupos</button><button type="button" class="cp-tab ${vista.tab === 'docentes' ? 'on' : ''}" data-tab="docentes">Docentes y administradores</button></div>` : ''}
        <div id="gContenido"></div></div>`;

      const pintarGrupos = () => {
        document.getElementById('gContenido').innerHTML = `
          <div class="cp-stats">${stat('grupos', esAdmin ? 'Grupos' : 'Mis grupos', grupos.length)}${stat('persona', 'Estudiantes', total)}${stat('check', 'Autorizados', aut)}${stat('reloj', 'Pendientes', pen)}</div>
          <h2 class="cp-sec" style="margin:18px 0 12px">Grupos</h2>
          <div class="cp-lista">${grupos.length ? grupos.map(filaGrupo).join('') :
            `<div class="cp-vacio"><b>${esAdmin ? 'Aún no hay grupos' : 'Todavía no tienes grupos asignados'}</b>${esAdmin ? 'Crea sedes y grupos en la base de datos para empezar.' : 'Pídele al administrador que te asigne tus grupos.'}</div>`}</div>`;
      };
      if (vista.tab === 'docentes' && esAdmin) pantallaDocentes(); else pintarGrupos();

      el.onclick = e => {
        const t = e.target;
        const tab = t.closest('[data-tab]');
        if (tab) {
          vista.tab = tab.dataset.tab;
          el.querySelectorAll('.cp-tab').forEach(b => b.classList.toggle('on', b === tab));
          return vista.tab === 'docentes' ? pantallaDocentes() : pintarGrupos();
        }
        const fila = t.closest('.cp-row');
        if (fila) location.hash = '#grupos/' + fila.dataset.id;
        if (t.closest('[data-nuevo]')) abrirNuevoUsuario();
        const asig = t.closest('[data-asignar]');
        if (asig) abrirAsignar(Number(asig.dataset.asignar));
        const act = t.closest('[data-activo]');
        if (act) cambiarActivo(Number(act.dataset.activo), act.dataset.val === '1', act);
      };
      el.onkeydown = e => {
        const fila = e.target.closest && e.target.closest('.cp-row');
        if (fila && e.target === fila && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); location.hash = '#grupos/' + fila.dataset.id; }
      };
    }

    // ---------------- DETALLE DE UN GRUPO ----------------
    async function pantallaDetalle(id) {
      el.innerHTML = '<div class="cp"><p style="padding:24px;color:#5d6b62">Cargando grupo…</p></div>';
      let d;
      try { d = await api('/grupos/' + encodeURIComponent(id) + '/estudiantes'); } catch (e) { if (mi === seq) errorPantalla(e.message, () => pantallaDetalle(id)); return; }
      if (mi !== seq) return;
      const { grupo, estudiantes } = d;
      const pend = estudiantes.filter(s => s.autorizacion === 'pendiente').length;

      const filas = estudiantes.map(s => `<tr>
        <td><b>${esc(s.nombre)} ${esc(s.apellido)}</b><br><small style="color:#5d6b62">${esc(s.correo)}</small></td>
        <td>${esc(s.documento)}</td><td>${pillAut(s.autorizacion)}</td><td>${fecha(s.fechaAutorizacion)}</td>
        <td class="n">${s.autorizacion === 'autorizada'
          ? `<button type="button" class="cp-btn mini peligro" data-est="${s.id}" data-estado="revocada">Revocar</button>`
          : `<button type="button" class="cp-btn mini" data-est="${s.id}" data-estado="autorizada">${s.autorizacion === 'revocada' ? 'Volver a autorizar' : 'Autorizar'}</button>`}</td></tr>`).join('');

      el.innerHTML = `<div class="cp">
        <a class="cp-atras" href="#grupos">${svg('atras')}Volver a grupos</a>
        <section class="cp-cab"><div class="cp-thumb ic">${svg('grupos')}</div>
          <div class="cp-cab-txt"><h1>Grupo ${esc(grupo.nombre)}</h1><p>${esc(grupo.sede)} · ${grupo.anio} · ${estudiantes.length} estudiante${estudiantes.length === 1 ? '' : 's'}</p>
            <div class="cp-acciones">${pend ? `<button type="button" class="cp-btn" data-todos>Autorizar a los ${pend} pendiente${pend === 1 ? '' : 's'}</button>` : ''}</div></div></section>
        <div class="cp-card"><h2>Autorización de tratamiento de datos</h2>
          <div class="sub">Un estudiante solo puede inscribirse en campañas cuando su autorización está confirmada. Confirma únicamente si tu institución ya tiene el consentimiento firmado del acudiente (Ley 1581).</div>
          ${estudiantes.length ? `<div class="cp-scroll"><table class="cp-tabla"><thead><tr><th>Estudiante</th><th>Documento</th><th>Autorización</th><th>Fecha</th><th class="n">Acción</th></tr></thead><tbody>${filas}</tbody></table></div>`
            : '<div class="cp-vacio">Aún no hay estudiantes en este grupo. Se agregan cuando crean su cuenta y eligen el grupo.</div>'}</div></div>`;

      el.oninput = null; el.onkeydown = null;
      el.onclick = async e => {
        const todos = e.target.closest('[data-todos]');
        const b = e.target.closest('[data-est]');
        try {
          if (todos) {
            if (!confirm('Vas a confirmar la autorización de ' + pend + ' estudiante(s). ¿Tu institución tiene el consentimiento firmado de sus acudientes?')) return;
            todos.disabled = true;
            const r = await api('/grupos/' + id + '/autorizar-todos', { method: 'POST' });
            toast(r.autorizados + ' estudiante(s) autorizados');
            pantallaDetalle(id);
          } else if (b) {
            if (b.dataset.estado === 'revocada' && !confirm('¿Revocar la autorización? El estudiante no podrá inscribirse en nuevas campañas.')) return;
            b.disabled = true;
            await api('/grupos/estudiantes/' + b.dataset.est + '/autorizacion', { method: 'POST', body: { estado: b.dataset.estado } });
            pantallaDetalle(id);
          }
        } catch (err) { toast(err.message); pantallaDetalle(id); }
      };
    }

    // ---------------- DOCENTES (solo administrador) ----------------
    let usuarios = [];
    async function pantallaDocentes() {
      const cont = document.getElementById('gContenido');
      cont.innerHTML = '<p style="padding:24px;color:#5d6b62">Cargando…</p>';
      try { usuarios = (await api('/grupos/docentes')).usuarios; } catch (e) { cont.innerHTML = `<div class="cp-vacio"><b>No se pudo cargar</b>${esc(e.message)}</div>`; return; }
      if (mi !== seq) return;
      const filas = usuarios.map(u => `<tr>
        <td><b>${esc(u.nombre)} ${esc(u.apellido)}</b><br><small style="color:#5d6b62">${esc(u.correo)}</small></td>
        <td>${ROL[u.rol]}</td>
        <td>${u.rol === 'docente' ? (u.grupos.length ? u.grupos.map(g => `<span class="cp-chip">${esc(g.nombre)}</span>`).join('') : '<small style="color:#b3261e">Sin grupos</small>') : '<small style="color:#5d6b62">Acceso total</small>'}</td>
        <td>${u.activo ? '<span class="cp-pill">Activo</span>' : '<span class="cp-pill fin">Inactivo</span>'}</td>
        <td class="n" style="white-space:nowrap">${u.rol === 'docente' ? `<button type="button" class="cp-btn mini sec" data-asignar="${u.id}">Asignar grupos</button> ` : ''}
          ${u.id !== usuario.id ? `<button type="button" class="cp-btn mini sec" data-activo="${u.id}" data-val="${u.activo ? 0 : 1}">${u.activo ? 'Desactivar' : 'Activar'}</button>` : ''}</td></tr>`).join('');
      cont.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
          <h2 class="cp-sec" style="margin:0">Docentes y administradores</h2>
          <button type="button" class="cp-btn" data-nuevo>${svg('plus')}Nuevo usuario</button></div>
        <div class="cp-card"><div class="cp-scroll"><table class="cp-tabla"><thead><tr><th>Nombre</th><th>Rol</th><th>Grupos</th><th>Estado</th><th class="n">Acciones</th></tr></thead><tbody>${filas}</tbody></table></div>
          <p class="cp-nota">Los estudiantes no se crean aquí: se registran solos desde la página de inicio y eligen su grupo.</p></div>`;
    }

    async function cambiarActivo(uid, activo, boton) {
      if (!activo && !confirm('¿Desactivar esta cuenta? No podrá iniciar sesión.')) return;
      boton.disabled = true;
      try { await api('/grupos/docentes/' + uid + '/activo', { method: 'PUT', body: { activo } }); toast(activo ? 'Cuenta activada' : 'Cuenta desactivada'); pantallaDocentes(); }
      catch (e) { toast(e.message); boton.disabled = false; }
    }

    // ---------------- modales ----------------
    function modal(titulo, cuerpo, textoGuardar, alGuardar) {
      const m = document.createElement('div');
      m.className = 'cp-modal';
      m.innerHTML = `<div class="cp-dialog" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
        <header><h2>${esc(titulo)}</h2><button type="button" class="cp-x" data-cerrar aria-label="Cerrar">×</button></header>
        <div class="cp-form"><div class="cp-form-cuerpo">${cuerpo}<div class="cp-err" id="mErr" role="alert"></div></div>
        <footer><button type="button" class="cp-btn sec" data-cerrar>Cancelar</button><button type="button" class="cp-btn" id="mGuardar">${textoGuardar}</button></footer></div></div>`;
      document.body.appendChild(m);
      const cerrar = () => { m.remove(); document.removeEventListener('keydown', tecla); };
      const tecla = ev => { if (ev.key === 'Escape') cerrar(); };
      document.addEventListener('keydown', tecla);
      m.addEventListener('mousedown', ev => { if (ev.target === m) cerrar(); });
      m.querySelectorAll('[data-cerrar]').forEach(b => b.onclick = cerrar);
      const err = txt => { m.querySelector('#mErr').textContent = txt; };
      m.querySelector('#mGuardar').onclick = async function () {
        this.disabled = true; err('');
        try { await alGuardar(m, err); cerrar(); } catch (e) { err(e.message); this.disabled = false; }
      };
      return m;
    }
    const checks = (seleccion) => grupos.map(g => `<label class="cp-chk"><input type="checkbox" data-g="${g.id}" ${seleccion.includes(g.id) ? 'checked' : ''}>
      <span>${esc(g.nombre)} · ${esc(g.sede)} (${g.anio})</span></label>`).join('') || '<div class="cp-chk">No hay grupos creados.</div>';
    const leer = m => [...m.querySelectorAll('input[data-g]:checked')].map(c => Number(c.dataset.g));

    function abrirAsignar(uid) {
      const u = usuarios.find(x => x.id === uid); if (!u) return;
      modal('Grupos de ' + u.nombre + ' ' + u.apellido,
        `<p class="cp-nota" style="margin:0">El docente verá estos grupos, sus estudiantes y las campañas donde participen.</p><div class="cp-grupos-sel">${checks(u.grupos.map(g => g.id))}</div>`,
        'Guardar', async m => {
          await api('/grupos/docentes/' + uid + '/grupos', { method: 'PUT', body: { grupoIds: leer(m) } });
          toast('Grupos actualizados'); pantallaDocentes();
        });
    }

    function abrirNuevoUsuario() {
      const m = modal('Nuevo usuario',
        `<div class="cp-fila" style="grid-template-columns:1fr 1fr"><label>Nombre<input id="uNombre" maxlength="100"></label><label>Apellido<input id="uApellido" maxlength="100"></label></div>
         <label>Correo<input id="uCorreo" type="email" maxlength="150" autocomplete="off"></label>
         <div class="cp-fila" style="grid-template-columns:1fr 1fr"><label>Contraseña temporal<input id="uClave" type="text" autocomplete="off" placeholder="8+ caracteres, letras y números"></label>
           <label>Rol<select id="uRol" style="font:400 14px 'Inter',sans-serif;border:1px solid #d4e2c8;border-radius:10px;padding:10px 12px;background:#f6faf2"><option value="docente">Docente</option><option value="administrador">Administrador</option></select></label></div>
         <div id="uGrupos"><label style="margin-bottom:6px;display:block;font-size:13px;font-weight:600;color:#1b4a2a">Grupos que acompaña (opcional, se puede cambiar luego)</label><div class="cp-grupos-sel">${checks([])}</div></div>`,
        'Crear usuario', async (mod) => {
          const q = s => mod.querySelector(s);
          const body = { nombre: q('#uNombre').value.trim(), apellido: q('#uApellido').value.trim(), correo: q('#uCorreo').value.trim(), contrasena: q('#uClave').value, rol: q('#uRol').value, grupoIds: leer(mod) };
          if (!body.nombre || !body.apellido) throw new Error('Escribe nombre y apellido');
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.correo)) throw new Error('Correo electrónico inválido');
          if (body.contrasena.length < 8 || !/[A-Za-z]/.test(body.contrasena) || !/\d/.test(body.contrasena)) throw new Error('La contraseña necesita 8+ caracteres, con letras y números');
          await api('/grupos/docentes', { method: 'POST', body });
          toast('Usuario creado'); pantallaDocentes();
        });
      m.querySelector('#uRol').onchange = ev => { m.querySelector('#uGrupos').style.display = ev.target.value === 'docente' ? '' : 'none'; };
    }

    // ---------------- arranque ----------------
    const sub = ctx.sub && /^\d+$/.test(ctx.sub) ? ctx.sub : null;
    if (sub) pantallaDetalle(sub); else pantallaLista();
  }

  window.EODGrupos = { render };
})();
