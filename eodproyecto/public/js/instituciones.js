// Módulo "Instituciones y sedes" (solo administrador).
// Edita los datos de la institución y administra sus sedes y grupos.
// Uso (desde app-shell.js):  EODInstituciones.render(elemento, { usuario, api, toast })
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IC = {
    inst: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    grupos: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5M15 15c3 0 6 1.3 6 4.5"/>',
    casa: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>'
  };
  const svg = n => `<svg viewBox="0 0 24 24">${IC[n]}</svg>`;
  const stat = (ic, label, valor) => `<div class="cp-stat"><div class="cp-stat-ic">${svg(ic)}</div><div><span>${label}</span><b>${valor}</b></div></div>`;
  let seq = 0;

  function render(el, ctx) {
    const { usuario, api, toast } = ctx;
    const mi = ++seq;
    let datos = null;

    async function cargar() {
      el.innerHTML = '<div class="cp"><p style="padding:24px;color:#5d6b62">Cargando…</p></div>';
      try { datos = await api('/instituciones/mi'); }
      catch (e) {
        if (mi === seq) {
          el.innerHTML = `<div class="cp"><div class="cp-vacio"><b>No se pudo cargar</b>${esc(e.message)}<br><br><button class="cp-btn" type="button" id="iReintentar">Reintentar</button></div></div>`;
          el.onclick = ev => { if (ev.target.closest('#iReintentar')) cargar(); };
        }
        return;
      }
      if (mi !== seq) return;
      pintar();
    }

    function sedeHTML(s) {
      const filas = s.grupos.map(g => `<tr>
        <td><b>${esc(g.nombre)}</b></td><td>${g.anio}</td><td class="n">${g.estudiantes}</td>
        <td class="n" style="white-space:nowrap"><button type="button" class="cp-btn mini sec" data-editar-grupo="${g.id}">Editar</button>
          <button type="button" class="cp-btn mini peligro" data-eliminar-grupo="${g.id}" ${g.estudiantes ? 'disabled title="Tiene estudiantes"' : ''}>Eliminar</button></td></tr>`).join('');
      return `<section class="cp-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <div><h2 style="margin:0">${esc(s.nombre)} ${s.activa ? '<span class="cp-pill" style="margin-left:8px">Activa</span>' : '<span class="cp-pill fin" style="margin-left:8px">Inactiva</span>'}</h2>
            <div class="sub" style="margin:2px 0 0">${esc(s.direccion) || 'Sin dirección'}</div></div>
          <div class="cp-acciones"><button type="button" class="cp-btn mini sec" data-nuevo-grupo="${s.id}">${svg('plus')}Nuevo grupo</button>
            <button type="button" class="cp-btn mini sec" data-editar-sede="${s.id}">Editar sede</button></div></div>
        ${s.grupos.length ? `<div class="cp-scroll"><table class="cp-tabla"><thead><tr><th>Grupo</th><th>Año</th><th class="n">Estudiantes</th><th class="n">Acciones</th></tr></thead><tbody>${filas}</tbody></table></div>`
          : '<div class="cp-vacio" style="padding:20px">Esta sede aún no tiene grupos.</div>'}
        ${!s.activa ? '<p class="cp-nota">Una sede inactiva no aparece en el registro de estudiantes nuevos.</p>' : ''}</section>`;
    }

    function pintar() {
      const { institucion: i, sedes } = datos;
      const grupos = sedes.reduce((n, s) => n + s.grupos.length, 0);
      const est = sedes.reduce((n, s) => n + s.grupos.reduce((m, g) => m + g.estudiantes, 0), 0);
      el.innerHTML = `<div class="cp">
        <section class="cp-banner"><div class="cp-banner-txt"><svg class="cp-banner-ic" viewBox="0 0 24 24">${IC.inst}</svg>
          <div><h1>Instituciones y sedes</h1><p>Administra los datos de tu institución, sus sedes y sus grupos.</p></div></div>
          <div class="cp-art">${window.EOD ? EOD.globoSVG() : ''}</div></section>
        <div class="cp-stats" style="grid-template-columns:repeat(3,minmax(0,1fr))">${stat('casa', 'Sedes', sedes.length)}${stat('grupos', 'Grupos', grupos)}${stat('persona', 'Estudiantes', est)}</div>
        <section class="cp-card"><h2>Datos de la institución</h2><div class="sub">Se muestran a los estudiantes cuando se registran.</div>
          <div class="cp-form"><div class="cp-form-cuerpo" style="padding:0">
            <label>Nombre<input id="iNombre" maxlength="150" value="${esc(i.nombre)}"></label>
            <div class="cp-fila" style="grid-template-columns:2fr 1fr"><label>Dirección<input id="iDir" maxlength="200" value="${esc(i.direccion)}"></label>
              <label>Teléfono<input id="iTel" maxlength="20" value="${esc(i.telefono)}"></label></div>
            <div class="cp-err" id="iErr" role="alert"></div>
            <div><button type="button" class="cp-btn" id="iGuardar">Guardar datos</button></div></div></div></section>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <h2 class="cp-sec" style="margin:0">Sedes y grupos</h2><button type="button" class="cp-btn" data-nueva-sede>${svg('plus')}Nueva sede</button></div>
        ${sedes.length ? sedes.map(sedeHTML).join('') : '<div class="cp-vacio"><b>Aún no hay sedes</b>Crea la primera sede y luego sus grupos para que los estudiantes puedan registrarse.</div>'}
      </div>`;

      el.onclick = async e => {
        const t = e.target;
        if (t.closest('#iGuardar')) return guardarInstitucion(t.closest('#iGuardar'));
        if (t.closest('[data-nueva-sede]')) return modalSede(null);
        const es = t.closest('[data-editar-sede]');
        if (es) return modalSede(sedes.find(s => s.id === Number(es.dataset.editarSede)));
        const ng = t.closest('[data-nuevo-grupo]');
        if (ng) return modalGrupo(Number(ng.dataset.nuevoGrupo), null);
        const eg = t.closest('[data-editar-grupo]');
        if (eg) {
          const id = Number(eg.dataset.editarGrupo);
          const s = sedes.find(x => x.grupos.some(g => g.id === id));
          return modalGrupo(s.id, s.grupos.find(g => g.id === id));
        }
        const dg = t.closest('[data-eliminar-grupo]');
        if (dg) {
          if (!confirm('¿Eliminar este grupo? Esta acción no se puede deshacer.')) return;
          dg.disabled = true;
          try { await api('/instituciones/grupos/' + dg.dataset.eliminarGrupo, { method: 'DELETE' }); toast('Grupo eliminado'); cargar(); }
          catch (err) { toast(err.message); dg.disabled = false; }
        }
      };
    }

    async function guardarInstitucion(btn) {
      const q = s => document.querySelector(s);
      const err = m => { q('#iErr').textContent = m; };
      const body = { nombre: q('#iNombre').value.trim(), direccion: q('#iDir').value.trim(), telefono: q('#iTel').value.trim() };
      if (body.nombre.length < 3) return err('El nombre debe tener al menos 3 caracteres');
      err(''); btn.disabled = true;
      try { await api('/instituciones/mi', { method: 'PUT', body }); toast('Datos guardados'); usuario.institucion = body.nombre; const u = document.getElementById('uInst'); if (u) u.textContent = 'Institución: ' + body.nombre; }
      catch (e) { err(e.message); }
      btn.disabled = false;
    }

    // ---------- modales ----------
    function modal(titulo, cuerpo, textoGuardar, alGuardar) {
      const m = document.createElement('div');
      m.className = 'cp-modal';
      m.innerHTML = `<div class="cp-dialog" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" style="max-width:480px">
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
        try { await alGuardar(m); cerrar(); } catch (e) { err(e.message); this.disabled = false; }
      };
      const primero = m.querySelector('input'); if (primero) primero.focus();
      return m;
    }

    function modalSede(s) {
      modal(s ? 'Editar sede' : 'Nueva sede',
        `<label>Nombre<input id="sNombre" maxlength="150" value="${esc(s ? s.nombre : '')}" placeholder="Ej. Sede Principal"></label>
         <label>Dirección<input id="sDir" maxlength="200" value="${esc(s ? s.direccion : '')}"></label>
         ${s ? `<label class="cp-chk" style="border:0;padding:0"><input type="checkbox" id="sActiva" ${s.activa ? 'checked' : ''}><span>Sede activa (aparece en el registro de estudiantes)</span></label>` : ''}`,
        s ? 'Guardar cambios' : 'Crear sede', async m => {
          const nombre = m.querySelector('#sNombre').value.trim(), direccion = m.querySelector('#sDir').value.trim();
          if (nombre.length < 2) throw new Error('Escribe el nombre de la sede');
          if (s) await api('/instituciones/sedes/' + s.id, { method: 'PUT', body: { nombre, direccion, activa: m.querySelector('#sActiva').checked } });
          else await api('/instituciones/sedes', { method: 'POST', body: { nombre, direccion } });
          toast(s ? 'Sede actualizada' : 'Sede creada'); cargar();
        });
    }

    function modalGrupo(sedeId, g) {
      modal(g ? 'Editar grupo' : 'Nuevo grupo',
        `<label>Nombre del grupo<input id="gNombre" maxlength="100" value="${esc(g ? g.nombre : '')}" placeholder="Ej. 10-A"></label>
         <label>Año<input id="gAnio" type="number" min="2000" max="2100" value="${g ? g.anio : new Date().getFullYear()}"></label>`,
        g ? 'Guardar cambios' : 'Crear grupo', async m => {
          const nombre = m.querySelector('#gNombre').value.trim(), anio = Number(m.querySelector('#gAnio').value);
          if (!nombre) throw new Error('Escribe el nombre del grupo');
          if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new Error('Año inválido');
          if (g) await api('/instituciones/grupos/' + g.id, { method: 'PUT', body: { nombre, anio } });
          else await api('/instituciones/sedes/' + sedeId + '/grupos', { method: 'POST', body: { nombre, anio } });
          toast(g ? 'Grupo actualizado' : 'Grupo creado'); cargar();
        });
    }

    cargar();
  }

  window.EODInstituciones = { render };
})();
