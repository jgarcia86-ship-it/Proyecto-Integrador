// Módulo "Incentivos y premios" (los tres roles ven algo distinto).
//  - Estudiante: catálogo con su saldo, canjea premios y ve "Mis canjes" con su código de entrega.
//  - Docente: catálogo (solo lectura) y "Canjes" de sus grupos: confirma la entrega con el código del estudiante.
//  - Administrador: lo anterior para toda la institución, más crear, editar y retirar incentivos.
// Uso (desde app-shell.js):  EODIncentivos.render(elemento, { usuario, api, toast, sub })
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 0) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: d });
  const fecha = s => { if (!s) return ''; const [d] = s.split(' '); const [y, m, dd] = d.split('-'); return dd + '/' + m + '/' + y; };

  const IC = {
    regalo: '<rect x="3" y="9" width="18" height="4" rx="1"/><path d="M5 13v7h14v-7M12 9v11M12 9S10 4 8 5s0 4 4 4zM12 9s2-5 4-4 0 4-4 4"/>',
    estrella: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    hoja: '<path d="M5 19C4 10 9 4 20 4c0 11-6 16-15 15zM5 19c3-5 6-8 10-11"/>',
    laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>',
    libro: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
    ticket: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v12"/>',
    trofeo: '<path d="M8 4h8v6a4 4 0 0 1-8 0V4zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 14v4M8 20h8"/>',
    caja: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>',
    reciclar: '<path d="M5 12a7 7 0 0 1 12-4M18 4v4h-4M19 12a7 7 0 0 1-12 4M6 20v-4h4"/>',
    lupa: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'
  };
  const svg = n => `<svg viewBox="0 0 24 24">${IC[n]}</svg>`;

  const CATS = [['todos', 'Todos los premios'], ['tecnologia', 'Tecnología'], ['utiles_escolares', 'Útiles escolares'], ['experiencias', 'Experiencias'], ['sostenibles', 'Sostenibles']];
  const CAT_NOMBRE = { tecnologia: 'Tecnología', utiles_escolares: 'Útiles escolares', experiencias: 'Experiencias', sostenibles: 'Sostenibles' };
  const CAT_ICONO = { tecnologia: 'laptop', utiles_escolares: 'libro', experiencias: 'ticket', sostenibles: 'hoja' };
  const ORDENES = [['mas', 'Más puntos'], ['menos', 'Menos puntos'], ['nombre', 'Nombre (A-Z)']];
  const ESTADOS = [['pendiente', 'Por entregar'], ['entregado', 'Entregados'], ['cancelado', 'Cancelados'], ['todos', 'Todos']];

  // Estado que se conserva al cambiar de pestaña
  const vista = { cat: 'todos', orden: 'mas', estado: 'pendiente', q: '' };
  let seq = 0;            // evita que una respuesta lenta pise una pantalla más nueva
  let pendientesCache = 0; // para mostrar el contador en la pestaña de canjes

  const codigoTexto = c => 'EOD-' + c;
  const pillEstado = e => e === 'pendiente' ? `<span class="cp-pill prog">${svg('reloj')}Por entregar</span>`
    : e === 'entregado' ? `<span class="cp-pill">${svg('check')}Entregado</span>` : '<span class="cp-pill fin">Cancelado</span>';

  const stat = (ic, label, valor, nota) => `<div class="cp-stat"><div class="cp-stat-ic">${svg(ic)}</div><div><span>${label}</span><b>${valor}</b>${nota ? `<small>${nota}</small>` : ''}</div></div>`;

  function banner(titulo, subtitulo) {
    return `<section class="cp-banner"><div class="cp-banner-txt"><svg class="cp-banner-ic" viewBox="0 0 24 24">${IC.regalo}</svg>
      <div><h1>${titulo}</h1><p>${subtitulo}</p></div></div><div class="cp-art">${window.EOD ? EOD.globoSVG() : ''}</div></section>`;
  }

  // Ventana modal reutilizable (usa los estilos .cp-modal de campanas.css)
  function modal(titulo, cuerpo, pie, ancho) {
    const m = document.createElement('div');
    m.className = 'cp-modal';
    m.innerHTML = `<div class="cp-dialog" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" style="max-width:${ancho || 480}px">
      <header><h2>${esc(titulo)}</h2><button type="button" class="cp-x" data-cerrar aria-label="Cerrar">×</button></header>
      <div class="cp-form"><div class="cp-form-cuerpo">${cuerpo}</div><footer>${pie}</footer></div></div>`;
    document.body.appendChild(m);
    const q = id => m.querySelector('#' + id);
    const tecla = ev => { if (ev.key === 'Escape') cerrar(); };
    function cerrar() { m.remove(); document.removeEventListener('keydown', tecla); }
    const enlazar = () => m.querySelectorAll('[data-cerrar]').forEach(b => { b.onclick = cerrar; });
    document.addEventListener('keydown', tecla);
    m.addEventListener('mousedown', ev => { if (ev.target === m) cerrar(); });
    enlazar();
    // Cambia el contenido de la misma ventana (por ejemplo, al mostrar el código tras canjear)
    const mostrar = (c, p) => { m.querySelector('.cp-form-cuerpo').innerHTML = c; m.querySelector('footer').innerHTML = p; enlazar(); };
    return { m, q, cerrar, mostrar };
  }

  // =====================================================================
  function render(el, ctx) {
    const { usuario, api, toast } = ctx;
    const esAdmin = usuario.rol === 'administrador', esEst = usuario.rol === 'estudiante';
    const mi = ++seq;
    let datos = null;      // respuesta de GET /incentivos
    let canjes = [];       // respuesta de GET /incentivos/canjes

    function errorPantalla(msg, reintentar) {
      el.innerHTML = `<div class="cp"><div class="cp-vacio"><b>No se pudo cargar</b>${esc(msg)}<br><br><button class="cp-btn" type="button" id="inReintentar">Reintentar</button></div></div>`;
      el.onclick = e => { if (e.target.closest('#inReintentar')) reintentar(); };
    }

    const tabsPagina = activa => `<div class="cp-bar"><div class="cp-tabs">
      <a class="cp-tab ${activa === 'catalogo' ? 'on' : ''}" href="#incentivos">Catálogo</a>
      <a class="cp-tab ${activa === 'canjes' ? 'on' : ''}" href="#incentivos/canjes">${esEst ? 'Mis canjes' : 'Canjes'}${pendientesCache > 0 ? ` (${pendientesCache})` : ''}</a></div></div>`;

    const subtitulo = esAdmin ? 'Administra los premios de tu institución y confirma sus entregas.'
      : esEst ? 'Completa campañas, acumula puntos y canjea increíbles premios.'
        : 'Consulta los premios y confirma las entregas a tus estudiantes.';

    // ================= CATÁLOGO =================
    function statsCatalogo(r) {
      return esEst
        ? stat('estrella', 'Mis puntos', num(r.saldo) + ' <span style="font-size:15px;font-weight:600">pts</span>', 'disponibles para canjear')
          + stat('regalo', 'Incentivos disponibles', r.disponibles, 'opciones')
          + stat('trofeo', 'Premios canjeados', r.canjeadosMes, 'este mes')
          + stat('caja', 'Por entregar', r.pendientes, 'canjes pendientes')
        : stat('regalo', 'Incentivos disponibles', r.disponibles, 'opciones')
          + stat('caja', 'Por entregar', r.pendientes, 'canjes pendientes')
          + stat('check', 'Entregados', r.entregadosMes, 'este mes')
          + stat('estrella', 'Puntos canjeados', num(r.puntosMes), 'este mes');
    }

    function tarjeta(c) {
      const r = datos.resumen;
      const agotado = c.disponibles <= 0;
      let boton = '';
      if (esEst) {
        const falta = c.costo - r.saldo;
        if (r.autorizacion !== 'autorizada') boton = '<button type="button" class="cp-btn in-btn" disabled>Autorización pendiente</button>';
        else if (agotado) boton = '<button type="button" class="cp-btn in-btn" disabled>Agotado</button>';
        else if (falta > 0) boton = `<button type="button" class="cp-btn in-btn" disabled>Te faltan ${num(falta)} pts</button>`;
        else boton = `<button type="button" class="cp-btn in-btn" data-canjear="${c.id}">${svg('regalo')}Canjear premio</button>`;
      } else if (esAdmin) {
        boton = `<button type="button" class="cp-btn sec in-btn" data-editar="${c.id}">${svg('editar')}Editar</button>`;
      }
      const stock = agotado ? '<span class="cp-pill fin">Agotado</span>'
        : c.disponibles <= 3 ? `<span class="cp-pill prog">Últimas ${c.disponibles}</span>` : `<small>Quedan ${num(c.disponibles)}</small>`;
      return `<article class="in-card ${c.activo ? '' : 'off'}">
        <div class="in-img ${c.imagen ? '' : 'sin-img'}">
          ${c.imagen ? `<img src="${esc(c.imagen)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('sin-img');this.remove()">` : ''}
          <span class="in-ico">${svg(CAT_ICONO[c.categoria] || 'regalo')}</span>
          ${c.activo ? '' : '<span class="in-retirado">Retirado</span>'}
        </div>
        <div class="in-cuerpo">
          <h3>${esc(c.nombre)}</h3>
          <p>${esc(c.descripcion) || '<i>Sin descripción</i>'}</p>
          <div class="in-precio"><b>${svg('estrella')}${num(c.costo)} pts</b>${stock}</div>
          ${boton}
        </div></article>`;
    }

    function pasos() {
      const lista = esEst
        ? [['Participa en las campañas', 'Entrega residuos y suma puntos.'], ['Acumula puntos', 'Tu docente los registra con cada entrega.'], ['Canjea y recoge', 'Muestra tu código de entrega a tu docente.']]
        : esAdmin
          ? [['Crea los premios', 'Define costo e inventario.'], ['Los estudiantes canjean', 'Sus puntos se descuentan al instante.'], ['Confirma la entrega', 'Con el código que muestra el estudiante.']]
          : [['El estudiante canjea', 'Queda "por entregar" con un código.'], ['Entrega el premio', 'Pídele su código de 6 dígitos.'], ['Confirma en "Canjes"', 'Así queda el registro de la entrega.']];
      return `<aside class="in-info"><h2>${svg('hoja')}¿Cómo funciona?</h2>
        ${lista.map((p, i) => `<div class="in-paso"><span class="rs-num">${i + 1}</span><div><b>${p[0]}</b><small>${p[1]}</small></div></div>`).join('')}</aside>`;
    }

    function ordenar(lista) {
      const l = [...lista];
      if (vista.orden === 'menos') l.sort((a, b) => a.costo - b.costo);
      else if (vista.orden === 'nombre') l.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      else l.sort((a, b) => b.costo - a.costo);
      return l;
    }

    function pintarCatalogo() {
      let lista = datos.catalogo.filter(c => vista.cat === 'todos' || c.categoria === vista.cat);
      lista = ordenar(lista);
      const aviso = esEst && datos.resumen.autorizacion !== 'autorizada'
        ? '<div class="cp-aviso">Tu autorización de tratamiento de datos está <b>pendiente</b>. Cuando tu institución la confirme podrás canjear premios.</div>' : '';
      el.innerHTML = `<div class="cp">
        ${banner('Incentivos y premios', subtitulo)}
        <div class="cp-stats">${statsCatalogo(datos.resumen)}</div>
        ${aviso}
        ${tabsPagina('catalogo')}
        <div class="cp-bar">
          <div class="cp-tabs">${CATS.map(([k, t]) => `<button type="button" class="cp-tab ${vista.cat === k ? 'on' : ''}" data-cat="${k}">${t}</button>`).join('')}</div>
          <div class="cp-tools">
            <select class="rs-select" id="inOrden" aria-label="Ordenar">${ORDENES.map(([k, t]) => `<option value="${k}" ${vista.orden === k ? 'selected' : ''}>Ordenar por: ${t}</option>`).join('')}</select>
            ${esAdmin ? `<button type="button" class="cp-btn" id="inNuevo">${svg('mas')}Nuevo incentivo</button>` : ''}
          </div>
        </div>
        <div class="in-layout">
          <div>${lista.length
            ? `<div class="in-grid">${lista.map(tarjeta).join('')}</div>`
            : `<div class="cp-vacio"><b>${datos.catalogo.length ? 'No hay premios en esta categoría' : 'Aún no hay incentivos'}</b>${esAdmin && !datos.catalogo.length ? 'Crea el primero con el botón "Nuevo incentivo".' : 'Pronto habrá premios para canjear.'}</div>`}
          </div>
          ${pasos()}
        </div></div>`;
    }

    async function cargarCatalogo() {
      try { datos = await api('/incentivos'); } catch (e) { if (mi === seq) errorPantalla(e.message, cargarCatalogo); return; }
      if (mi !== seq) return;
      pendientesCache = datos.resumen.pendientes || 0;
      pintarCatalogo();
    }

    // ---------- canjear (estudiante) ----------
    function abrirCanje(id) {
      const c = datos.catalogo.find(x => x.id === id);
      if (!c) return;
      const saldo = datos.resumen.saldo;
      const w = modal('Canjear premio',
        `<div class="in-conf"><b>${esc(c.nombre)}</b>${c.descripcion ? `<span>${esc(c.descripcion)}</span>` : ''}</div>
         <div class="in-cuenta"><div><span>Tu saldo</span><b>${num(saldo)} pts</b></div><div><span>Costo</span><b>- ${num(c.costo)} pts</b></div><div><span>Te quedarán</span><b>${num(saldo - c.costo)} pts</b></div></div>
         <p class="cp-nota">Al confirmar se descuentan los puntos y el premio queda reservado para ti. Recibirás un <b>código de entrega</b> para mostrárselo a tu docente.</p>
         <div class="cp-err" id="cjErr" role="alert"></div>`,
        '<button type="button" class="cp-btn sec" data-cerrar>Cancelar</button><button type="button" class="cp-btn" id="cjOk">Confirmar canje</button>', 460);
      w.q('cjOk').onclick = async function () {
        this.disabled = true; w.q('cjErr').textContent = '';
        try {
          const r = await api('/incentivos/' + id + '/canjear', { method: 'POST' });
          w.mostrar(`<div class="in-exito"><span class="in-exito-ic">${svg('check')}</span><b>¡Canje realizado!</b>
              <span>Muéstrale este código a tu docente para recibir tu premio:</span>
              <div class="in-codigo-grande">${codigoTexto(esc(r.codigo))}</div>
              <small>También lo encuentras en "Mis canjes". Ahora tienes ${num(r.saldo)} pts.</small></div>`,
            '<a class="cp-btn sec" href="#incentivos/canjes" data-cerrar>Ver mis canjes</a><button type="button" class="cp-btn" data-cerrar>Listo</button>');
          toast('Canje realizado');
          cargarCatalogo();
        } catch (e) { w.q('cjErr').textContent = e.message; this.disabled = false; }
      };
    }

    // ---------- crear / editar (administrador) ----------
    function abrirFormulario(inc) {
      const edit = !!inc;
      const v = inc || { nombre: '', descripcion: '', categoria: 'sostenibles', costo: '', disponibles: '', imagen: '', activo: true };
      const w = modal(edit ? 'Editar incentivo' : 'Nuevo incentivo',
        `<label>Nombre<input id="fNombre" maxlength="150" value="${esc(v.nombre)}" placeholder="Ej. Botella ecológica"></label>
         <label>Descripción (opcional)<input id="fDesc" maxlength="150" value="${esc(v.descripcion)}" placeholder="Una frase corta sobre el premio"></label>
         <div class="cp-fila" style="grid-template-columns:1.2fr 1fr 1fr">
           <label>Categoría<select id="fCat">${Object.keys(CAT_NOMBRE).map(k => `<option value="${k}" ${v.categoria === k ? 'selected' : ''}>${CAT_NOMBRE[k]}</option>`).join('')}</select></label>
           <label>Costo (puntos)<input id="fCosto" type="number" min="1" step="1" value="${esc(v.costo)}"></label>
           <label>Cantidad disponible<input id="fCant" type="number" min="0" step="1" value="${esc(v.disponibles)}"></label>
         </div>
         <label>Imagen (opcional, enlace)<input id="fImg" maxlength="255" value="${esc(v.imagen)}" placeholder="https://..."></label>
         ${edit ? `<label class="in-check"><input id="fActivo" type="checkbox" ${v.activo ? 'checked' : ''}> Visible para estudiantes y docentes (desmárcalo para retirar el premio)</label>` : ''}
         <div class="cp-err" id="fErr" role="alert"></div>`,
        `<button type="button" class="cp-btn sec" data-cerrar>Cancelar</button><button type="button" class="cp-btn" id="fOk">${edit ? 'Guardar cambios' : 'Crear incentivo'}</button>`, 560);
      w.q('fNombre').focus();
      w.q('fOk').onclick = async function () {
        const err = t => { w.q('fErr').textContent = t; };
        const body = {
          nombre: w.q('fNombre').value.trim(), descripcion: w.q('fDesc').value.trim(), categoria: w.q('fCat').value,
          costo: Number(w.q('fCosto').value), cantidad: Number(w.q('fCant').value), imagen: w.q('fImg').value.trim()
        };
        if (edit) body.activo = w.q('fActivo').checked;
        if (body.nombre.length < 2) return err('Escribe el nombre del premio');
        if (!Number.isInteger(body.costo) || body.costo < 1) return err('El costo debe ser un número entero de puntos mayor que 0');
        if (!Number.isInteger(body.cantidad) || body.cantidad < 0) return err('La cantidad disponible debe ser 0 o más');
        err(''); this.disabled = true;
        try {
          await api('/incentivos' + (edit ? '/' + inc.id : ''), { method: edit ? 'PUT' : 'POST', body });
          w.cerrar(); toast(edit ? 'Incentivo actualizado' : 'Incentivo creado');
          cargarCatalogo();
        } catch (e) { err(e.message); this.disabled = false; }
      };
    }

    // ================= CANJES =================
    function filaStaff(c) {
      const detalle = c.estado === 'entregado' ? `<small>${fecha(c.fechaEntrega)}${c.entregadoPor ? ' · ' + esc(c.entregadoPor) : ''}</small>`
        : c.estado === 'cancelado' && c.motivo ? `<small>${esc(c.motivo)}</small>` : '';
      const acciones = c.estado === 'pendiente'
        ? `<button type="button" class="cp-btn mini" data-entregar="${c.id}">Confirmar entrega</button> <button type="button" class="cp-btn mini peligro" data-cancelar="${c.id}">Cancelar</button>` : '';
      return `<tr><td>${fecha(c.fecha)}</td><td><b>${esc(c.nombre)} ${esc(c.apellido)}</b><small>${esc(c.grupo)}</small></td>
        <td>${esc(c.incentivo)}<small>${esc(CAT_NOMBRE[c.categoria] || '')}</small></td>
        <td class="n">${num(c.puntos)} pts</td><td>${pillEstado(c.estado)}${detalle}</td><td class="n in-acc">${acciones}</td></tr>`;
    }

    function tarjetaEst(c) {
      let pie = '';
      if (c.estado === 'pendiente') pie = `<div class="in-codigo"><span>Tu código de entrega</span><b>${codigoTexto(esc(c.codigo))}</b><small>Muéstraselo a tu docente para recibir el premio.</small></div>`;
      else if (c.estado === 'entregado') pie = `<p class="in-pie">Entregado el ${fecha(c.fechaEntrega)}${c.entregadoPor ? ' por ' + esc(c.entregadoPor) : ''}.</p>`;
      else pie = `<p class="in-pie">Cancelado${c.motivo ? ': ' + esc(c.motivo) : ''}. Tus ${num(c.puntos)} puntos fueron devueltos.</p>`;
      return `<article class="in-canje"><div class="in-canje-cab"><span class="in-ico">${svg(CAT_ICONO[c.categoria] || 'regalo')}</span>
        <div><b>${esc(c.incentivo)}</b><small>${fecha(c.fecha)} · ${num(c.puntos)} pts</small></div>${pillEstado(c.estado)}</div>${pie}</article>`;
    }

    function pintarCanjes() {
      const lista = canjes;
      let cuerpo;
      if (esEst) {
        cuerpo = lista.length ? `<div class="in-canjes">${lista.map(tarjetaEst).join('')}</div>`
          : '<div class="cp-vacio"><b>Aún no has canjeado premios</b>Cuando canjees uno aparecerá aquí con su código de entrega.</div>';
      } else {
        cuerpo = lista.length
          ? `<section class="rs-card"><div class="rs-scroll"><table class="rs-tabla"><thead><tr><th>Fecha</th><th>Estudiante</th><th>Premio</th><th class="n">Puntos</th><th>Estado</th><th></th></tr></thead>
              <tbody>${lista.map(filaStaff).join('')}</tbody></table></div></section>`
          : `<div class="cp-vacio"><b>${vista.estado === 'pendiente' ? 'No hay canjes por entregar' : 'No hay canjes con este filtro'}</b>${vista.estado === 'pendiente' ? 'Cuando un estudiante canjee un premio aparecerá aquí.' : ''}</div>`;
      }
      const filtros = esEst ? '' : `<div class="cp-bar">
        <div class="cp-tabs">${ESTADOS.map(([k, t]) => `<button type="button" class="cp-tab ${vista.estado === k ? 'on' : ''}" data-estado="${k}">${t}</button>`).join('')}</div>
        <div class="cp-tools"><label class="cp-buscar">${svg('lupa')}<input id="inQ" type="search" placeholder="Buscar estudiante..." value="${esc(vista.q)}"></label></div></div>`;
      el.innerHTML = `<div class="cp">
        ${banner(esEst ? 'Mis canjes' : 'Canjes de premios', esEst ? 'Aquí ves el estado de cada premio y tu código de entrega.' : 'Confirma la entrega con el código que te muestra el estudiante.')}
        ${tabsPagina('canjes')}${filtros}${cuerpo}</div>`;
    }

    async function cargarCanjes(soloTabla) {
      const qs = new URLSearchParams();
      if (!esEst && vista.estado !== 'todos') qs.set('estado', vista.estado);
      if (!esEst && vista.q) qs.set('q', vista.q);
      try { canjes = (await api('/incentivos/canjes?' + qs.toString())).canjes; }
      catch (e) { if (mi === seq) errorPantalla(e.message, () => cargarCanjes()); return; }
      if (mi !== seq) return;
      if (esEst) pendientesCache = canjes.filter(c => c.estado === 'pendiente').length;
      else if (vista.estado === 'pendiente') pendientesCache = canjes.length;
      if (soloTabla) pintarCanjesParcial(); else pintarCanjes();
    }

    // Al escribir en el buscador se repinta la pantalla y se devuelve el foco y el cursor al campo
    function pintarCanjesParcial() {
      const q = el.querySelector('#inQ'), pos = q ? q.selectionStart : 0;
      pintarCanjes();
      const q2 = el.querySelector('#inQ');
      if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); }
    }

    // ---------- confirmar entrega / cancelar (docente y administrador) ----------
    function abrirEntrega(id) {
      const c = canjes.find(x => x.id === id);
      if (!c) return;
      const w = modal('Confirmar entrega',
        `<div class="in-conf"><b>${esc(c.incentivo)}</b><span>Para ${esc(c.nombre)} ${esc(c.apellido)} · ${esc(c.grupo)}</span></div>
         <label>Código de entrega del estudiante<input id="eCod" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="EOD-000000" class="in-input-cod"></label>
         <p class="cp-nota">Pídele al estudiante que te muestre su código en "Mis canjes". Solo confirma cuando le hayas entregado el premio.</p>
         <div class="cp-err" id="eErr" role="alert"></div>`,
        '<button type="button" class="cp-btn sec" data-cerrar>Cancelar</button><button type="button" class="cp-btn" id="eOk">Confirmar entrega</button>', 440);
      w.q('eCod').focus();
      const enviar = async function () {
        const btn = w.q('eOk'); btn.disabled = true; w.q('eErr').textContent = '';
        try {
          await api('/incentivos/canjes/' + id + '/entregar', { method: 'POST', body: { codigo: w.q('eCod').value } });
          w.cerrar(); toast('Entrega confirmada'); cargarCanjes();
        } catch (e) { w.q('eErr').textContent = e.message; btn.disabled = false; }
      };
      w.q('eOk').onclick = enviar;
      w.q('eCod').addEventListener('keydown', ev => { if (ev.key === 'Enter') enviar(); });
    }

    function abrirCancelar(id) {
      const c = canjes.find(x => x.id === id);
      if (!c) return;
      const w = modal('Cancelar canje',
        `<div class="in-conf"><b>${esc(c.incentivo)}</b><span>Para ${esc(c.nombre)} ${esc(c.apellido)} · ${num(c.puntos)} pts</span></div>
         <label>Motivo de la cancelación<input id="xMotivo" maxlength="150" placeholder="Ej. Premio sin existencias"></label>
         <p class="cp-nota">Se devolverán ${num(c.puntos)} puntos al estudiante y el premio volverá al inventario.</p>
         <div class="cp-err" id="xErr" role="alert"></div>`,
        '<button type="button" class="cp-btn sec" data-cerrar>Volver</button><button type="button" class="cp-btn peligro" id="xOk">Cancelar canje</button>', 440);
      w.q('xMotivo').focus();
      w.q('xOk').onclick = async function () {
        this.disabled = true; w.q('xErr').textContent = '';
        try {
          await api('/incentivos/canjes/' + id + '/cancelar', { method: 'POST', body: { motivo: w.q('xMotivo').value } });
          w.cerrar(); toast('Canje cancelado'); cargarCanjes();
        } catch (e) { w.q('xErr').textContent = e.message; this.disabled = false; }
      };
    }

    // ---------------- eventos ----------------
    let tBusca = null;
    el.onclick = e => {
      const t = e.target;
      let b;
      if ((b = t.closest('[data-cat]'))) { vista.cat = b.dataset.cat; return pintarCatalogo(); }
      if ((b = t.closest('[data-canjear]'))) return abrirCanje(Number(b.dataset.canjear));
      if (t.closest('#inNuevo')) return abrirFormulario(null);
      if ((b = t.closest('[data-editar]'))) return abrirFormulario(datos.catalogo.find(x => x.id === Number(b.dataset.editar)));
      if ((b = t.closest('[data-estado]'))) { vista.estado = b.dataset.estado; return cargarCanjes(); }
      if ((b = t.closest('[data-entregar]'))) return abrirEntrega(Number(b.dataset.entregar));
      if ((b = t.closest('[data-cancelar]'))) return abrirCancelar(Number(b.dataset.cancelar));
    };
    el.onchange = e => { if (e.target.id === 'inOrden') { vista.orden = e.target.value; pintarCatalogo(); } };
    el.oninput = e => {
      if (e.target.id !== 'inQ') return;
      vista.q = e.target.value.trim();
      clearTimeout(tBusca);
      tBusca = setTimeout(() => cargarCanjes(true), 300);
    };

    // ---------------- arranque ----------------
    if (ctx.sub === 'canjes') cargarCanjes(); else cargarCatalogo();
  }

  window.EODIncentivos = { render };
})();
