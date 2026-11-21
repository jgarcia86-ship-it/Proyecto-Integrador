// Módulo "Gamificación".
//  - Estudiante: sus puntos, nivel, logros, misiones del mes (con botón para reclamar) y ranking de grupos.
//  - Docente / administrador: resumen de la institución, logros otorgados y mejores estudiantes.
// Uso (desde app-shell.js):  EODGamificacion.render(elemento, { usuario, api, toast })
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 0) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: d });

  const IC = {
    trofeo: '<path d="M8 4h8v6a4 4 0 0 1-8 0V4zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 14v4M8 20h8"/>',
    estrella: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    medalla: '<circle cx="12" cy="9" r="5"/><path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5-1.5-7.5"/>',
    check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12.5l3 3 5-6"/>',
    barras: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    hoja: '<path d="M5 19C4 10 9 4 20 4c0 11-6 16-15 15zM5 19c3-5 6-8 10-11"/>',
    reciclar: '<path d="M5 12a7 7 0 0 1 12-4M18 4v4h-4M19 12a7 7 0 0 1-12 4M6 20v-4h4"/>',
    idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    grupo: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5M15 15c3 0 6 1.3 6 4.5"/>',
    planta: '<path d="M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2-5 6-5 0 3-2 5-6 5z"/>',
    campana: '<path d="M3 11v3l12 5V6L3 11z"/><path d="M7 15l1 5h3l-1-4M18 9a4 4 0 0 1 0 6"/>',
    flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    tendencia: '<path d="M4 17l6-6 4 4 6-7M15 8h5v5"/>',
    persona: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/>',
    regalo: '<rect x="3" y="9" width="18" height="4" rx="1"/><path d="M5 13v7h14v-7M12 9v11M12 9S10 4 8 5s0 4 4 4zM12 9s2-5 4-4 0 4-4 4"/>',
    laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>',
    libro: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
    ticket: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v12"/>',
    caja: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>'
  };
  const svg = (n, cls) => `<svg viewBox="0 0 24 24"${cls ? ` class="${cls}"` : ''}>${IC[n] || IC.estrella}</svg>`;
  const ICONOS_LOGRO = ['hoja', 'reciclar', 'idea', 'grupo', 'planta'];

  const ICONOS_MISION = { kg5: 'reciclar', rec3: 'caja', campana: 'grupo' };
  const CAT_ICONO = { tecnologia: 'laptop', utiles_escolares: 'libro', experiencias: 'ticket', sostenibles: 'hoja' };

  let seq = 0;
  let periodo = 'todos';

  const stat = (ic, label, valor, nota, extra) =>
    `<div class="cp-stat gm-stat"><div class="cp-stat-ic">${svg(ic)}</div><div><span>${label}</span><b>${valor}</b>${extra || ''}${nota ? `<small>${nota}</small>` : ''}</div></div>`;

  function banner() {
    return `<section class="gm-banner">
      <div class="gm-banner-txt"><div class="gm-trofeo">${svg('trofeo')}</div>
        <div><h1>Gamificación</h1><p>Participa, acumula puntos y gana premios por cuidar el planeta.</p>
        <small>Cada acción cuenta. Reciclar, participar y aprender también te da puntos.</small></div></div>
      <div class="gm-art">${window.EOD ? EOD.globoSVG() : ''}<div class="gm-frase">¡Pequeñas acciones, grandes cambios!</div></div>
    </section>`;
  }

  // Insignia hexagonal (dorada si está desbloqueada, gris si no)
  function hexagono(i, ok) {
    const ic = IC[ICONOS_LOGRO[i % ICONOS_LOGRO.length]];
    return `<svg viewBox="0 0 80 80" class="gm-hex${ok ? '' : ' off'}" aria-hidden="true">
      <defs><linearGradient id="gmh${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8de7e"/><stop offset="1" stop-color="#d49512"/></linearGradient></defs>
      <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" fill="url(#gmh${i})" stroke="#b9820a" stroke-width="1.5"/>
      <polygon points="40,12 65,26 65,54 40,68 15,54 15,26" fill="#2e7d3a"/>
      <g transform="translate(24 24) scale(1.33)" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ic}</g></svg>`;
  }

  function logrosHTML(d, esEst) {
    const hay = d.logros.length;
    return `<section class="cp-card gm-panel"><div class="gm-head"><h2>${esEst ? 'Mis logros' : 'Logros de la institución'}</h2></div>
      ${hay ? `<div class="gm-logros">${d.logros.map((l, i) => `<div class="gm-logro" title="${esc(l.descripcion || '')}">
          ${hexagono(i, l.desbloqueado)}<b>${esc(l.nombre)}</b>
          ${esEst
            ? (l.desbloqueado ? '<span class="gm-chip ok">Desbloqueado</span>' : `<span class="gm-chip">${num(l.requeridos)} pts</span>`)
            : `<span class="gm-chip ${l.cuantos ? 'ok' : ''}">${num(l.cuantos)} estudiante${l.cuantos === 1 ? '' : 's'}</span>`}
        </div>`).join('')}</div>`
        : '<div class="cp-vacio"><b>Aún no hay logros</b>El administrador de la plataforma puede crearlos en la tabla tLogro.</div>'}
    </section>`;
  }

  function misionesHTML(d) {
    const p = d.personal;
    return `<section class="cp-card gm-panel"><div class="gm-head"><h2>Misiones activas</h2><span class="gm-nota">Se renuevan cada mes</span></div>
      <div class="gm-misiones">${d.misiones.map(m => {
        const pct = Math.min(100, Math.round(m.actual / m.meta * 100));
        const pie = m.reclamada ? '<span class="gm-chip ok">Completada</span>'
          : m.completa ? `<button type="button" class="cp-btn mini" data-reclamar="${esc(m.id)}">Reclamar</button>` : '';
        return `<article class="gm-mision"><div class="gm-mision-top"><div class="gm-mi-ic">${svg(ICONOS_MISION[m.id])}</div><b>${esc(m.titulo)}</b></div>
          <p>${esc(m.desc)}</p>
          <div class="cp-prog"><div class="cp-bar-bg"><i style="width:${pct}%"></i></div><b>${num(m.actual, 1)} / ${num(m.meta)}${m.unidad ? ' ' + m.unidad : ''}</b></div>
          <div class="gm-mision-pie"><span class="gm-pts">${svg('estrella')} + ${num(m.puntos)} pts</span>${pie}</div></article>`;
      }).join('')}</div>
      ${p.autorizacion !== 'autorizada' ? '<p class="gm-aviso">Tu autorización de datos aún no está vigente, por eso no puedes reclamar misiones todavía.</p>' : ''}
    </section>`;
  }

  function topHTML(d) {
    return `<section class="cp-card gm-panel"><div class="gm-head"><h2>Mejores estudiantes</h2><span class="gm-nota">Puntos acumulados</span></div>
      ${d.top.length ? `<div class="gm-top">${d.top.map((t, i) => `<div class="gm-top-fila"><span class="gm-pos">${i + 1}</span>
        <div class="gm-av">${svg('persona')}</div><div><b>${esc(t.nombre)} ${esc(t.apellido)}</b><small>${esc(t.grupo)}</small></div><strong>${num(t.puntos)} pts</strong></div>`).join('')}</div>`
        : '<div class="cp-vacio"><b>Aún no hay puntos</b>Cuando se registren recolecciones, los mejores estudiantes aparecerán aquí.</div>'}
    </section>`;
  }

  function rankingHTML(d) {
    const filas = d.ranking.map(r => `<tr class="${r.mio ? 'yo' : ''}"><td class="gm-n">${r.pos}</td>
      <td><div class="gm-grp"><span class="gm-av">${svg('grupo')}</span><div><b>${esc(r.grupo)}</b><small>${esc(r.sede)}${r.mio ? ' · tu grupo' : ''}</small></div></div></td>
      <td class="gm-pt">${num(r.puntos)}</td></tr>`).join('');
    return `<section class="cp-card gm-panel"><div class="gm-head"><h2>Ranking general</h2>
      <select id="gmPeriodo" aria-label="Periodo del ranking"><option value="todos"${d.periodo === 'todos' ? ' selected' : ''}>Todos</option><option value="mes"${d.periodo === 'mes' ? ' selected' : ''}>Este mes</option></select></div>
      ${d.ranking.length ? `<div class="gm-tabla"><table><thead><tr><th>#</th><th>Grupo</th><th class="gm-pt">Puntos</th></tr></thead><tbody>${filas}</tbody></table></div>`
        : '<div class="cp-vacio"><b>Sin grupos todavía</b>Crea grupos y registra recolecciones para ver el ranking.</div>'}
    </section>`;
  }

  function recompensasHTML(d, saldo) {
    return `<section class="cp-card gm-panel"><div class="gm-head"><h2>Recompensas disponibles</h2><a href="#incentivos" class="gm-ver">Ver todas ${svg('flecha')}</a></div>
      ${d.recompensas.length ? `<div class="gm-rec">${d.recompensas.map(r => `<a class="gm-rec-i" href="#incentivos">
        <div class="gm-rec-img">${r.imagen ? `<img src="${esc(r.imagen)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${svg(CAT_ICONO[r.categoria] || 'regalo')}</div>
        <b>${esc(r.nombre)}</b><span>${num(r.costo)} pts</span>${saldo != null && saldo >= r.costo ? '<em>¡Ya puedes canjearlo!</em>' : ''}</a>`).join('')}</div>`
        : '<div class="cp-vacio"><b>Sin premios por ahora</b>El administrador puede agregarlos en Incentivos.</div>'}
    </section>`;
  }

  function llamado() {
    return `<section class="gm-cta"><div class="gm-cta-art">${window.EOD ? EOD.globoSVG() : ''}</div>
      <div><h3>¡Sigue sumando puntos!</h3><p>Tu esfuerzo hace la diferencia. Cada residuo que se recicla, cada campaña que completas y cada compañero que se une te acerca a un mundo más limpio.</p></div>
      <a class="cp-btn" href="#incentivos">${svg('estrella')} Ver recompensas</a></section>`;
  }

  function vistaEstudiante(d) {
    const p = d.personal, n = p.nivel;
    const pct = n.hasta ? Math.min(100, Math.round((p.ganado - n.desde) / (n.hasta - n.desde) * 100)) : 100;
    const nivelExtra = `<small class="gm-niv">${esc(n.nombre)}</small><div class="cp-bar-bg gm-barra"><i style="width:${pct}%"></i></div>`;
    return `<div class="gm-stats">
      ${stat('estrella', 'Tus puntos', num(p.saldo) + ' pts', 'Ganados en total: ' + num(p.ganado))}
      ${stat('medalla', 'Nivel actual', 'Nivel ' + n.n, n.hasta ? num(p.ganado) + ' / ' + num(n.hasta) + ' pts' : 'Nivel máximo', nivelExtra)}
      ${stat('trofeo', 'Logros desbloqueados', p.logrosOk + ' / ' + p.logrosTotal, '<a href="#gamificacion" class="gm-ver" data-logros>Mira tus insignias</a>')}
      ${stat('check', 'Campañas completadas', num(p.campanasHechas), 'de ' + num(p.campanasTotal) + ' campañas')}
      ${stat('barras', 'Tu posición en el ranking', p.posicion ? '#' + p.posicion : '—', p.participantes ? 'de ' + num(p.participantes) + ' participantes' : '')}
    </div>
    <div class="gm-cols"><div class="gm-col">${logrosHTML(d, true)}${misionesHTML(d)}${llamado()}</div>
      <div class="gm-col">${rankingHTML(d)}${recompensasHTML(d, p.saldo)}</div></div>`;
  }

  function vistaStaff(d) {
    const i = d.institucion;
    return `<div class="gm-stats">
      ${stat('estrella', 'Puntos entregados', num(i.puntos) + ' pts', 'En toda la institución')}
      ${stat('persona', 'Estudiantes con puntos', num(i.activos), 'Han recolectado al menos una vez')}
      ${stat('trofeo', 'Logros otorgados', num(i.logrosOtorgados), 'Entre todos los estudiantes')}
      ${stat('check', 'Campañas finalizadas', num(i.campanasHechas), 'de ' + num(i.campanasTotal) + ' campañas')}
      ${stat('regalo', 'Canjes por entregar', num(i.canjesPendientes), '<a href="#incentivos" class="gm-ver">Ir a Incentivos</a>')}
    </div>
    <div class="gm-cols"><div class="gm-col">${logrosHTML(d, false)}${topHTML(d)}${llamado()}</div>
      <div class="gm-col">${rankingHTML(d)}${recompensasHTML(d, null)}</div></div>`;
  }

  function render(el, ctx) {
    const mi = ++seq;
    el.innerHTML = '<div class="gm"><div class="cp-vacio">Cargando gamificación…</div></div>';
    ctx.api('/gamificacion/resumen?periodo=' + periodo).then(d => {
      if (mi !== seq) return;
      el.innerHTML = `<div class="gm">${banner()}${d.rol === 'estudiante' ? vistaEstudiante(d) : vistaStaff(d)}</div>`;
      const sel = el.querySelector('#gmPeriodo');
      if (sel) sel.onchange = () => { periodo = sel.value; render(el, ctx); };
      const lg = el.querySelector('[data-logros]');
      if (lg) lg.onclick = e => { e.preventDefault(); el.querySelector('.gm-logros') && el.querySelector('.gm-logros').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
      el.querySelectorAll('[data-reclamar]').forEach(b => b.onclick = async () => {
        b.disabled = true;
        try {
          const r = await ctx.api('/gamificacion/misiones/' + encodeURIComponent(b.dataset.reclamar) + '/reclamar', { method: 'POST' });
          ctx.toast('¡Misión completada! +' + num(r.puntos) + ' puntos');
          render(el, ctx);
        } catch (e) { ctx.toast(e.message); b.disabled = false; }
      });
    }).catch(e => {
      if (mi !== seq) return;
      el.innerHTML = `<div class="gm"><div class="cp-vacio"><b>No se pudo cargar</b>${esc(e.message)}<br><br><button class="cp-btn" type="button" id="gmReintentar">Reintentar</button></div></div>`;
      el.querySelector('#gmReintentar').onclick = () => render(el, ctx);
    });
  }

  window.EODGamificacion = { render };
})();
