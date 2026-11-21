// Módulo Campañas: una sola pantalla con comportamiento distinto según el rol.
//  administrador: crea, edita, finaliza y elimina; ve todos los participantes.
//  docente:       ve las campañas de sus grupos e inscribe a sus grupos completos.
//  estudiante:    ve las campañas de su grupo, se inscribe/sale y ve su aporte.
// Uso (desde app-shell.js):  EODCampanas.render(elemento, { usuario, api, toast, sub })
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fecha = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return d + ' ' + MES[+m - 1] + ' ' + y; };
  const num = n => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 });
  const pct = n => Math.min(100, Math.round(n || 0));

  // ---------- iconos ----------
  const IC = {
    gente: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5M15 15c3 0 6 1.3 6 4.5"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    atras: '<path d="M15 6l-6 6 6 6"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z"/>',
    casa: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    mega: '<path d="M3 11v3l12 5V6L3 11z"/><path d="M7 15l1 5h3l-1-4M18 9a4 4 0 0 1 0 6"/>',
    lupa: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    filtro: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    abajo: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    hoja: '<path d="M5 19C4 10 9 4 20 4c0 11-6 16-15 15zM5 19c3-5 6-8 10-11"/>',
    meta: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    peso: '<path d="M6 8h12l2 12H4zM9 8a3 3 0 0 1 6 0"/>',
    estrella: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'
  };
  const svg = n => `<svg viewBox="0 0 24 24">${IC[n]}</svg>`;

  // ---------- ilustraciones de las tarjetas ----------
  const DG = '#1b4a2a', MG = '#2e7d3a';
  const ILUS = {
    tecno: `<rect x="16" y="24" width="44" height="30" rx="3" fill="#fff" stroke="${DG}" stroke-width="3"/><path d="M10 58h56l-3 6H13z" fill="${MG}" stroke="${DG}" stroke-width="2" stroke-linejoin="round"/><rect x="56" y="36" width="22" height="32" rx="4" fill="#fff" stroke="${DG}" stroke-width="3"/><path d="M63 63h8" stroke="${DG}" stroke-width="2.5" stroke-linecap="round"/>`,
    bateria: `<rect x="30" y="22" width="36" height="52" rx="6" fill="#fff" stroke="${DG}" stroke-width="3"/><rect x="40" y="16" width="16" height="6" rx="2" fill="${DG}"/><path d="M50 32l-8 14h7l-3 14 10-17h-7z" fill="${MG}"/><path d="M14 80c0-12 10-18 20-14M82 80c0-12-10-18-18-14" fill="none" stroke="${MG}" stroke-width="3" stroke-linecap="round"/>`,
    celular: `<rect x="30" y="12" width="36" height="70" rx="7" fill="#fff" stroke="${DG}" stroke-width="3"/><circle cx="48" cy="73" r="2.5" fill="${DG}"/><g fill="none" stroke="${MG}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M39 42a10 10 0 0 1 17-5"/><path d="M57 29v8h-8"/><path d="M57 50a10 10 0 0 1-17 5"/><path d="M39 63v-8h8"/></g>`,
    reciclar: `<g fill="none" stroke="${MG}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M24 46a24 24 0 0 1 42-14"/><path d="M68 18v15H53"/><path d="M72 50a24 24 0 0 1-42 14"/><path d="M28 78V63h15"/></g>`,
    hoja: `<path d="M24 76C18 42 38 18 78 18c0 38-22 60-54 58z" fill="${MG}"/><path d="M26 74C40 56 52 44 68 30" fill="none" stroke="#e8f5dd" stroke-width="3" stroke-linecap="round"/>`
  };
  function ilus(c) {
    const t = (c.nombre + ' ' + c.descripcion).toLowerCase();
    let k = 'reciclar';
    if (/celular|móvil|movil/.test(t)) k = 'celular';
    else if (/pila|bater/.test(t)) k = 'bateria';
    else if (/computad|tecnolog|electr|raee/.test(t)) k = 'tecno';
    else if (/planeta|verde|árbol|arbol|hoja/.test(t)) k = 'hoja';
    return `<svg viewBox="0 0 96 96">${ILUS[k]}</svg>`;
  }

  // ---------- estado global del módulo (se conserva al volver de un detalle) ----------
  const vista = { filtro: 'todas', texto: '', orden: 'recientes' };
  let seq = 0;            // evita que una respuesta lenta pise una pantalla más nueva
  let gruposCache = null; // grupos de la institución (para el formulario)

  const pill = c => c.estado === 'en_curso' ? `<span class="cp-pill">${svg('abajo')}En curso</span>`
    : c.estado === 'finalizada' ? `<span class="cp-pill fin">${svg('check')}Finalizada</span>`
    : `<span class="cp-pill prog">${svg('reloj')}Programada</span>`;

  function banner(titulo, subtitulo) {
    return `<section class="cp-banner"><div class="cp-banner-txt"><svg class="cp-banner-ic" viewBox="0 0 24 24">${IC.mega}</svg>
      <div><h1>${titulo}</h1><p>${subtitulo}</p></div></div><div class="cp-art">${window.EOD ? EOD.globoSVG() : ''}</div></section>`;
  }
  const stat = (ic, label, valor, nota) => `<div class="cp-stat"><div class="cp-stat-ic">${svg(ic)}</div><div><span>${label}</span><b>${valor}</b>${nota ? `<small>${nota}</small>` : ''}</div></div>`;

  function diasTexto(c) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const dd = iso => new Date(iso + 'T00:00:00');
    if (c.estado === 'programada') { const n = Math.round((dd(c.inicio) - hoy) / 864e5); return n <= 1 ? 'Empieza mañana' : 'Empieza en ' + n + ' días'; }
    if (c.estado === 'en_curso') { const n = Math.round((dd(c.fin) - hoy) / 864e5); return n <= 0 ? 'Termina hoy' : n === 1 ? 'Queda 1 día' : 'Quedan ' + n + ' días'; }
    return 'Finalizada';
  }

  // =====================================================================
  function render(el, ctx) {
    const { usuario, api, toast } = ctx;
    const rol = usuario.rol;
    const esAdmin = rol === 'administrador', esDoc = rol === 'docente', esEst = rol === 'estudiante';
    const mi = ++seq;
    let lista = [], resumen = { participantes: 0 };

    const TEXTOS = {
      administrador: 'Crea y gestiona las campañas de tu institución.',
      docente: 'Acompaña a tus grupos en cada campaña.',
      estudiante: '¡Participa, recolecta y gana puntos!'
    };

    function errorPantalla(msg, reintentar) {
      el.innerHTML = `<div class="cp"><a class="cp-atras" href="#campanas">${svg('atras')}Campañas</a>
        <div class="cp-vacio"><b>No se pudo cargar</b>${esc(msg)}<br><br><button class="cp-btn" type="button" id="cpReintentar">Reintentar</button></div></div>`;
      el.onclick = e => { if (e.target.closest('#cpReintentar')) reintentar(); };
    }

    // ---------------- LISTA ----------------
    const TABS = esEst
      ? [['todas', 'Todas'], ['mias', 'Mis campañas'], ['disponibles', 'Disponibles'], ['finalizada', 'Finalizadas']]
      : [['todas', 'Todas'], ['en_curso', 'En curso'], ['programada', 'Programadas'], ['finalizada', 'Finalizadas']];

    function filtrar() {
      const q = vista.texto.trim().toLowerCase();
      let r = lista.filter(c => {
        if (vista.filtro === 'mias') return c.inscrito;
        if (vista.filtro === 'disponibles') return c.estado !== 'finalizada' && !c.inscrito;
        if (vista.filtro !== 'todas') return c.estado === vista.filtro;
        return true;
      });
      if (q) r = r.filter(c => (c.nombre + ' ' + c.descripcion).toLowerCase().includes(q));
      if (vista.orden === 'avance') r.sort((a, b) => b.porcentaje - a.porcentaje);
      else if (vista.orden === 'nombre') r.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      else r.sort((a, b) => b.inicio.localeCompare(a.inicio) || b.id - a.id);
      return r;
    }

    function filaHTML(c) {
      const puedeUnirse = esEst && !c.inscrito && c.estado !== 'finalizada';
      return `<article class="cp-row" data-id="${c.id}" tabindex="0" role="link" aria-label="Abrir ${esc(c.nombre)}">
        <div class="cp-thumb">${ilus(c)}</div>
        <div class="cp-info">
          <h3>${esc(c.nombre)}</h3>
          <p>${esc(c.descripcion) || 'Sin descripción'}</p>
          <div class="cp-meta">
            <span>${svg('gente')}${c.participantes} participante${c.participantes === 1 ? '' : 's'}</span>
            <span>${svg('cal')}${fecha(c.inicio)} - ${fecha(c.fin)}</span>
            ${esEst && c.inscrito ? `<span>${svg('hoja')}Tu aporte: ${num(c.miKg)} kg</span>` : ''}
            ${puedeUnirse ? `<button type="button" class="cp-btn mini" data-inscribir="${c.id}">Participar</button>` : ''}
          </div>
        </div>
        <div class="cp-side">
          <div class="cp-tags">${esEst && c.inscrito ? '<span class="cp-pill yo">Inscrito</span>' : ''}${pill(c)}</div>
          <div class="cp-prog"><div class="cp-bar-bg"><i style="width:${pct(c.porcentaje)}%"></i></div><b>${Math.round(c.porcentaje)}%</b></div>
        </div>
        <svg class="cp-chev" viewBox="0 0 24 24">${IC.chev}</svg>
      </article>`;
    }

    function vacioHTML() {
      if (lista.length) return '<div class="cp-vacio"><b>Sin resultados</b>Prueba con otro filtro o con otra búsqueda.</div>';
      if (esAdmin) return '<div class="cp-vacio"><b>Aún no hay campañas</b>Crea la primera con el botón “Nueva campaña”.</div>';
      if (esDoc) return '<div class="cp-vacio"><b>Tus grupos aún no participan en campañas</b>Cuando el administrador asigne uno de tus grupos a una campaña, aparecerá aquí.</div>';
      return '<div class="cp-vacio"><b>Todavía no hay campañas para tu grupo</b>Cuando tu institución cree una, podrás inscribirte desde aquí.</div>';
    }

    function pintarLista() {
      const r = filtrar();
      document.getElementById('cpLista').innerHTML = r.length ? r.map(filaHTML).join('') : vacioHTML();
    }

    function statsLista() {
      const n = f => lista.filter(f).length;
      if (esEst) {
        const aporte = lista.reduce((s, c) => s + c.miKg, 0);
        return stat('play', 'En curso', n(c => c.estado === 'en_curso')) +
               stat('check', 'Mis campañas', n(c => c.inscrito)) +
               stat('hoja', 'Mi aporte', num(aporte) + ' kg') +
               stat('mega', 'Finalizadas', n(c => c.estado === 'finalizada'));
      }
      return stat('casa', esDoc ? 'Campañas de mis grupos' : 'Total de campañas', lista.length) +
             stat('play', 'En curso', n(c => c.estado === 'en_curso')) +
             stat('check', 'Finalizadas', n(c => c.estado === 'finalizada')) +
             stat('gente', esDoc ? 'Mis estudiantes inscritos' : 'Participantes', resumen.participantes);
    }

    async function pantallaLista() {
      el.innerHTML = '<div class="cp"><p style="padding:24px;color:#5d6b62">Cargando campañas…</p></div>';
      let d;
      try { d = await api('/campanas'); } catch (e) { if (mi === seq) errorPantalla(e.message, pantallaLista); return; }
      if (mi !== seq) return;
      lista = d.campanas; resumen = d.resumen;

      const aviso = esEst && usuario.autorizacion !== 'autorizada'
        ? '<div class="cp-aviso">Tu autorización de tratamiento de datos está <b>pendiente</b>. Podrás inscribirte en las campañas cuando tu institución la confirme.</div>' : '';
      const orden = [['recientes', 'Más recientes'], ['avance', 'Mayor avance'], ['nombre', 'Nombre (A-Z)']];

      el.innerHTML = `<div class="cp">
        ${banner('Campañas', 'Juntos logramos un mayor impacto ambiental. ' + TEXTOS[rol])}
        ${aviso}
        <div class="cp-bar">
          <div class="cp-tabs" id="cpTabs">${TABS.map(([k, t]) => `<button type="button" class="cp-tab ${vista.filtro === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
          <div class="cp-tools">
            <label class="cp-buscar">${svg('lupa')}<input id="cpBuscar" type="search" placeholder="Buscar campañas..." value="${esc(vista.texto)}"></label>
            <div class="cp-orden">
              <button type="button" class="cp-icbtn" id="cpOrdenBtn" aria-label="Ordenar">${svg('filtro')}</button>
              <div class="cp-orden-menu hidden" id="cpOrdenMenu">${orden.map(([k, t]) => `<button type="button" data-orden="${k}" class="${vista.orden === k ? 'on' : ''}">${t}</button>`).join('')}</div>
            </div>
            ${esAdmin ? `<button type="button" class="cp-btn" data-nueva>${svg('plus')}Nueva campaña</button>` : ''}
          </div>
        </div>
        <div class="cp-stats">${statsLista()}</div>
        <h2 class="cp-sec">${esEst ? 'Campañas de mi grupo' : 'Campañas'}</h2>
        <div class="cp-lista" id="cpLista"></div>
      </div>`;
      pintarLista();

      el.oninput = e => { if (e.target.id === 'cpBuscar') { vista.texto = e.target.value; pintarLista(); } };
      el.onkeydown = e => {
        const fila = e.target.closest && e.target.closest('.cp-row');
        if (fila && e.target === fila && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); location.hash = '#campanas/' + fila.dataset.id; }
      };
      el.onclick = async e => {
        const t = e.target;
        const tab = t.closest('[data-tab]');
        if (tab) {
          vista.filtro = tab.dataset.tab;
          document.querySelectorAll('#cpTabs .cp-tab').forEach(b => b.classList.toggle('on', b === tab));
          return pintarLista();
        }
        if (t.closest('#cpOrdenBtn')) { e.stopPropagation(); return document.getElementById('cpOrdenMenu').classList.toggle('hidden'); }
        const ord = t.closest('[data-orden]');
        if (ord) {
          vista.orden = ord.dataset.orden;
          document.querySelectorAll('#cpOrdenMenu button').forEach(b => b.classList.toggle('on', b === ord));
          document.getElementById('cpOrdenMenu').classList.add('hidden');
          return pintarLista();
        }
        if (t.closest('[data-nueva]')) return abrirFormulario(null, () => { /* la navegación al detalle la hace el formulario */ });
        const ins = t.closest('[data-inscribir]');
        if (ins) { e.stopPropagation(); return inscribirme(ins.dataset.inscribir, ins, pantallaLista); }
        const fila = t.closest('.cp-row');
        if (fila) location.hash = '#campanas/' + fila.dataset.id;
      };
      // cerrar el menú de orden al hacer clic fuera
      document.addEventListener('click', function cerrar(ev) {
        const m = document.getElementById('cpOrdenMenu');
        if (!m) return document.removeEventListener('click', cerrar);
        if (!ev.target.closest('.cp-orden')) m.classList.add('hidden');
      });
    }

    // ---------------- acciones compartidas ----------------
    async function inscribirme(id, boton, despues) {
      if (boton) boton.disabled = true;
      try {
        await api('/campanas/' + id + '/inscripcion', { method: 'POST' });
        toast('¡Listo! Ya participas en la campaña');
        despues();
      } catch (e) { toast(e.message); if (boton) boton.disabled = false; }
    }

    // ---------------- DETALLE ----------------
    async function pantallaDetalle(id) {
      el.innerHTML = '<div class="cp"><p style="padding:24px;color:#5d6b62">Cargando campaña…</p></div>';
      let d;
      try { d = await api('/campanas/' + encodeURIComponent(id)); } catch (e) { if (mi === seq) errorPantalla(e.message, () => pantallaDetalle(id)); return; }
      if (mi !== seq) return;
      const { campana: c, grupos, participantes, mio } = d;
      const activa = c.estado !== 'finalizada';
      const maxKg = Math.max(0, ...grupos.map(g => g.kg));

      // Acciones del encabezado según el rol
      let acciones = '';
      if (esAdmin) {
        acciones = (activa ? `<button type="button" class="cp-btn sec" data-editar>Editar</button><button type="button" class="cp-btn sec" data-finalizar>Finalizar campaña</button>` : '') +
          (c.participantes === 0 ? `<button type="button" class="cp-btn peligro" data-eliminar>Eliminar</button>` : '');
      } else if (esEst && mio) {
        if (mio.puedeInscribirse) acciones = `<button type="button" class="cp-btn" data-me-inscribo>Participar en esta campaña</button>`;
        else if (mio.inscrito && activa) acciones = `<button type="button" class="cp-btn sec" data-salir>Salir de la campaña</button>`;
      }
      const notaEst = esEst && mio && mio.motivo ? `<p class="cp-nota">${esc(mio.motivo)}</p>` : '';

      // Estadísticas
      const stats = stat('meta', 'Meta', num(c.metaKg) + ' kg', diasTexto(c)) +
        stat('peso', 'Recolectado', num(c.kg) + ' kg', Math.round(c.porcentaje) + '% de la meta') +
        stat('hoja', 'CO₂ evitado', num(c.co2) + ' kg') +
        stat('gente', 'Participantes', c.participantes);

      // Grupos (ranking)
      const gruposHTML = grupos.length ? grupos.map(g => {
        const base = g.metaKg ? g.kg / g.metaKg * 100 : (maxKg ? g.kg / maxKg * 100 : 0);
        const puedeInscribir = activa && (esAdmin || (esDoc && g.mio)) && g.habilitados > g.inscritos;
        return `<div class="cp-grupo ${g.mio ? 'mio' : ''}">
          <div class="cp-pos ${g.posicion === 1 && g.kg > 0 ? 'p1' : ''}">${g.posicion}</div>
          <div><b>${esc(g.nombre)}</b>${g.mio ? ' <span class="cp-pill yo" style="padding:2px 9px;font-size:11px">' + (esEst ? 'Tu grupo' : 'Mi grupo') + '</span>' : ''}
            <small>${esc(g.sede)} · ${g.inscritos} inscrito${g.inscritos === 1 ? '' : 's'}</small>
            <div class="cp-bar-bg"><i style="width:${pct(base)}%"></i></div></div>
          <div class="num">${num(g.kg)} kg<small>${g.metaKg ? '<br>de ' + num(g.metaKg) + ' kg' : ''}</small>
            ${puedeInscribir ? `<br><button type="button" class="cp-btn mini sec" data-grupo="${g.id}" style="margin-top:6px">Inscribir grupo</button>` : ''}</div>
        </div>`;
      }).join('') : '<div class="cp-vacio">Aún no hay grupos asignados.</div>';

      // Columna derecha
      let derecha;
      if (esEst) {
        const aporte = mio && mio.inscrito ? `<div class="cp-card"><h2>Tu aporte</h2><div class="sub">Lo que has recolectado en esta campaña.</div>
          <div class="cp-aporte"><div><b>${num(mio.kg)}</b><span>kg recolectados</span></div><div><b>${num(mio.co2)}</b><span>kg de CO₂ evitados</span></div><div><b>${num(mio.puntos)}</b><span>puntos ganados</span></div></div>
          ${mio.kg === 0 ? '<p class="cp-nota">Entrega tus residuos a tu docente para que los registre y empieces a sumar.</p>' : ''}</div>` : '';
        const top = participantes.length ? participantes.map((p, i) => `<div class="cp-top ${p.mio ? 'mio' : ''}">
            <div class="cp-av">${esc((p.nombre || '?').charAt(0).toUpperCase())}</div>
            <div>${esc(p.nombre)} ${esc(p.apellido)}${p.mio ? ' (tú)' : ''}<small>${esc(p.grupo)} · puesto ${i + 1}</small></div><span class="num">${num(p.kg)} kg</span></div>`).join('')
          : '<p class="cp-nota">Todavía nadie ha registrado recolecciones. ¡Sé el primero!</p>';
        derecha = aporte + `<div class="cp-card"><h2>Mejores recolectores</h2><div class="sub">Top 5 de la campaña.</div>${top}</div>`;
      } else {
        const filas = participantes.map(p => `<tr><td>${esc(p.nombre)} ${esc(p.apellido)}</td><td>${esc(p.grupo)}</td><td class="n">${num(p.kg)}</td><td class="n">${num(p.co2)}</td><td>${fecha(p.inscripcion)}</td></tr>`).join('');
        derecha = `<div class="cp-card"><h2>Participantes</h2><div class="sub">${esDoc ? 'Estudiantes de tus grupos inscritos en la campaña.' : 'Estudiantes inscritos en la campaña.'}</div>
          ${participantes.length ? `<div class="cp-scroll"><table class="cp-tabla"><thead><tr><th>Estudiante</th><th>Grupo</th><th class="n">Kg</th><th class="n">CO₂ kg</th><th>Inscripción</th></tr></thead><tbody>${filas}</tbody></table></div>`
            : '<p class="cp-nota">Aún no hay estudiantes inscritos.' + (activa ? ' Usa “Inscribir grupo” para inscribir a un grupo completo (solo estudiantes con autorización confirmada).' : '') + '</p>'}</div>`;
      }

      el.innerHTML = `<div class="cp">
        <a class="cp-atras" href="#campanas">${svg('atras')}Volver a campañas</a>
        <section class="cp-cab">
          <div class="cp-thumb">${ilus(c)}</div>
          <div class="cp-cab-txt">
            <div class="cp-tags" style="justify-content:flex-start;margin-bottom:6px">${pill(c)}${esEst && mio && mio.inscrito ? '<span class="cp-pill yo">Inscrito</span>' : ''}<span class="cp-pill" style="background:#fff">${svg('cal')}${fecha(c.inicio)} - ${fecha(c.fin)}</span></div>
            <h1>${esc(c.nombre)}</h1>
            <p>${esc(c.descripcion) || 'Sin descripción'}</p>
            <div class="cp-acciones">${acciones}</div>${notaEst}
          </div>
        </section>
        <div class="cp-stats">${stats}</div>
        <div class="cp-card"><h2>Avance hacia la meta</h2>
          <div class="cp-grande"><div class="cp-bar-bg"><i style="width:${pct(c.porcentaje)}%"></i></div><b>${Math.round(c.porcentaje)}%</b></div>
          <p class="cp-nota">${num(c.kg)} kg de ${num(c.metaKg)} kg</p></div>
        <div class="cp-dos">
          <div class="cp-card"><h2>Ranking de grupos</h2><div class="sub">Posición según los kg recolectados.</div>${gruposHTML}</div>
          <div style="display:flex;flex-direction:column;gap:18px">${derecha}</div>
        </div>
      </div>`;

      el.oninput = null; el.onkeydown = null;
      el.onclick = async e => {
        const t = e.target;
        const recargar = () => pantallaDetalle(id);
        if (t.closest('[data-me-inscribo]')) return inscribirme(c.id, t.closest('button'), recargar);
        if (t.closest('[data-salir]')) {
          if (!confirm('¿Seguro que quieres salir de esta campaña?')) return;
          try { await api('/campanas/' + c.id + '/inscripcion', { method: 'DELETE' }); toast('Saliste de la campaña'); recargar(); }
          catch (err) { toast(err.message); }
          return;
        }
        const g = t.closest('[data-grupo]');
        if (g) {
          g.disabled = true;
          try {
            const r = await api('/campanas/' + c.id + '/inscribir-grupo', { method: 'POST', body: { grupoId: Number(g.dataset.grupo) } });
            toast(r.inscritos ? r.inscritos + ' estudiante(s) inscritos' : 'No había estudiantes nuevos por inscribir');
            recargar();
          } catch (err) { toast(err.message); g.disabled = false; }
          return;
        }
        if (t.closest('[data-editar]')) return abrirFormulario(d, recargar);
        if (t.closest('[data-finalizar]')) {
          if (!confirm('¿Finalizar la campaña? Ya no se podrán inscribir más estudiantes ni editarla.')) return;
          try { await api('/campanas/' + c.id + '/finalizar', { method: 'POST' }); toast('Campaña finalizada'); recargar(); }
          catch (err) { toast(err.message); }
          return;
        }
        if (t.closest('[data-eliminar]')) {
          if (!confirm('¿Eliminar esta campaña? Esta acción no se puede deshacer.')) return;
          try { await api('/campanas/' + c.id, { method: 'DELETE' }); toast('Campaña eliminada'); location.hash = '#campanas'; }
          catch (err) { toast(err.message); }
        }
      };
    }

    // ---------------- FORMULARIO (crear / editar) ----------------
    async function abrirFormulario(detalle, despues) {
      if (!gruposCache) {
        try { gruposCache = (await api('/catalogo/grupos?institucionId=' + encodeURIComponent(usuario.institucionId))).grupos; }
        catch (e) { return toast(e.message); }
      }
      if (!gruposCache.length) return toast('Primero debe existir al menos un grupo en la institución');

      const c = detalle ? detalle.campana : null;
      const previos = {};
      if (detalle) detalle.grupos.forEach(g => { previos[g.id] = g.metaKg; });

      const modal = document.createElement('div');
      modal.className = 'cp-modal';
      modal.innerHTML = `<div class="cp-dialog" role="dialog" aria-modal="true" aria-label="${c ? 'Editar campaña' : 'Nueva campaña'}">
        <header><h2>${c ? 'Editar campaña' : 'Nueva campaña'}</h2><button type="button" class="cp-x" data-cerrar aria-label="Cerrar">×</button></header>
        <div class="cp-form"><div class="cp-form-cuerpo">
          <label>Nombre<input id="fNombre" maxlength="150" value="${esc(c ? c.nombre : '')}" placeholder="Ej. Recicla tu tecnología"></label>
          <label>Descripción<textarea id="fDesc" maxlength="1000" placeholder="¿Qué residuos se recolectan y por qué?">${esc(c ? c.descripcion : '')}</textarea></label>
          <div class="cp-fila">
            <label>Fecha de inicio<input id="fInicio" type="date" value="${c ? c.inicio : ''}"></label>
            <label>Fecha de fin<input id="fFin" type="date" value="${c ? c.fin : ''}"></label>
            <label>Meta (kg)<input id="fMeta" type="number" min="1" step="0.5" value="${c ? c.metaKg : ''}" placeholder="100"></label>
          </div>
          <div><label style="margin-bottom:6px">Grupos participantes <span style="font-weight:400;color:#5d6b62">(la sub-meta en kg es opcional)</span></label>
            <div class="cp-grupos-sel" id="fGrupos">${gruposCache.map(g => {
              const marcado = Object.prototype.hasOwnProperty.call(previos, g.id);
              return `<div class="cp-gs"><input type="checkbox" data-g="${g.id}" ${marcado ? 'checked' : ''} aria-label="Incluir ${esc(g.nombre)}">
                <span>${esc(g.nombre)} · ${esc(g.sede)} (${g.anio})</span>
                <input type="number" min="1" step="0.5" data-sub="${g.id}" placeholder="Sub-meta" ${marcado ? '' : 'disabled'} value="${marcado && previos[g.id] ? previos[g.id] : ''}"></div>`;
            }).join('')}</div>
            <div class="cp-total" id="fTotal" style="margin-top:6px"></div></div>
          <div class="cp-err" id="fErr" role="alert"></div>
        </div>
        <footer><button type="button" class="cp-btn sec" data-cerrar>Cancelar</button><button type="button" class="cp-btn" id="fGuardar">${c ? 'Guardar cambios' : 'Crear campaña'}</button></footer></div></div>`;
      document.body.appendChild(modal);
      const q = s => modal.querySelector(s);

      const cerrar = () => { modal.remove(); document.removeEventListener('keydown', esc_); };
      const esc_ = ev => { if (ev.key === 'Escape') cerrar(); };
      document.addEventListener('keydown', esc_);
      modal.addEventListener('mousedown', ev => { if (ev.target === modal) cerrar(); });
      modal.querySelectorAll('[data-cerrar]').forEach(b => b.onclick = cerrar);
      q('#fNombre').focus();

      const leerGrupos = () => [...modal.querySelectorAll('input[data-g]:checked')].map(cb => {
        const sub = modal.querySelector(`input[data-sub="${cb.dataset.g}"]`).value;
        return { id: Number(cb.dataset.g), metaKg: sub === '' ? null : Number(sub) };
      });
      const actualizarTotal = () => {
        const gs = leerGrupos(), meta = Number(q('#fMeta').value) || 0;
        const suma = gs.reduce((s, g) => s + (g.metaKg || 0), 0);
        const el_ = q('#fTotal');
        el_.textContent = `${gs.length} grupo(s) · sub-metas asignadas: ${num(suma)} kg` + (meta ? ' de ' + num(meta) + ' kg' : '');
        el_.classList.toggle('mal', meta > 0 && suma > meta + 1e-9);
      };
      modal.addEventListener('input', ev => {
        if (ev.target.matches('input[data-g]')) modal.querySelector(`input[data-sub="${ev.target.dataset.g}"]`).disabled = !ev.target.checked;
        actualizarTotal();
      });
      actualizarTotal();

      q('#fGuardar').onclick = async () => {
        const body = { nombre: q('#fNombre').value.trim(), descripcion: q('#fDesc').value.trim(), inicio: q('#fInicio').value, fin: q('#fFin').value, metaKg: Number(q('#fMeta').value), grupos: leerGrupos() };
        const err = m => { q('#fErr').textContent = m; };
        if (body.nombre.length < 3) return err('Escribe el nombre de la campaña');
        if (!body.inicio || !body.fin) return err('Elige las fechas de inicio y fin');
        if (body.fin < body.inicio) return err('La fecha de fin no puede ser anterior a la de inicio');
        if (!(body.metaKg > 0)) return err('La meta debe ser mayor que 0');
        if (!body.grupos.length) return err('Selecciona al menos un grupo');
        if (body.grupos.some(g => g.metaKg !== null && !(g.metaKg > 0))) return err('Las sub-metas deben ser mayores que 0');
        if (body.grupos.reduce((s, g) => s + (g.metaKg || 0), 0) > body.metaKg + 1e-9) return err('La suma de las sub-metas supera la meta de la campaña');
        err('');
        const btn = q('#fGuardar'); btn.disabled = true;
        try {
          const r = c ? await api('/campanas/' + c.id, { method: 'PUT', body }) : await api('/campanas', { method: 'POST', body });
          cerrar();
          toast(c ? 'Cambios guardados' : 'Campaña creada');
          if (c) despues(); else location.hash = '#campanas/' + r.id;
        } catch (e) { err(e.message); btn.disabled = false; }
      };
    }

    // ---------------- arranque ----------------
    const sub = ctx.sub && /^\d+$/.test(ctx.sub) ? ctx.sub : null;
    if (sub) pantallaDetalle(sub); else pantallaLista();
  }

  window.EODCampanas = { render };
})();
