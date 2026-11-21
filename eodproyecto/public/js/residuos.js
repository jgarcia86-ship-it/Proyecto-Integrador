// Módulo "Residuos y recolecciones" (administrador y docente).
//  - Resumen: totales, residuos por tipo, evolución mensual y últimas recolecciones.
//  - Historial: todas las recolecciones con filtros y paginación (el administrador puede anular).
//  - Registro: formulario para anotar lo que entrega un estudiante; los triggers de la base
//    calculan el CO2 evitado y los puntos.
// Uso (desde app-shell.js):  EODResiduos.render(elemento, { usuario, api, toast, sub })
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 1) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: d });
  const fecha = s => { if (!s) return ''; const [d] = s.split(' '); const [y, m, dd] = d.split('-'); return dd + '/' + m + '/' + y; };
  const MESC = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const PALETA = ['#1f6b3a', '#4aa557', '#b7d65a', '#7cc462', '#f2c94c', '#9aa5a0'];

  const IC = {
    hoja: '<path d="M5 19C4 10 9 4 20 4c0 11-6 16-15 15zM5 19c3-5 6-8 10-11"/>',
    bolsa: '<path d="M8 6l1-3h6l1 3M7 6h10l2 14H5z"/><path d="M9.5 13a2.5 2.5 0 0 1 4-1.5M14.5 14a2.5 2.5 0 0 1-4 1.5"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4M9 14l2 2 4-4"/>',
    mega: '<path d="M3 11v3l12 5V6L3 11z"/><path d="M7 15l1 5h3l-1-4M18 9a4 4 0 0 1 0 6"/>',
    nube: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z"/><path d="M10 13.5a2 2 0 1 0 0 .01M14 12v3"/>',
    sube: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    baja: '<path d="M3 7l6 6 4-4 8 8M15 17h6v-6"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    atras: '<path d="M15 6l-6 6 6 6"/>',
    lupa: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    reciclar: '<path d="M5 12a7 7 0 0 1 12-4M18 4v4h-4M19 12a7 7 0 0 1-12 4M6 20v-4h4"/>',
    balanza: '<path d="M6 8h12l2 12H4zM9 8a3 3 0 0 1 6 0"/><path d="M12 12v4"/>',
    mano: '<rect x="5" y="9" width="14" height="11" rx="2"/><path d="M9 9V7a3 3 0 0 1 6 0v2M12 13v3"/>',
    celular: '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M11 18h2"/>',
    laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>',
    cable: '<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5"/>',
    electro: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 9h14M9 6h.01M12 6h.01M12 14a2.5 2.5 0 1 0 0 .01"/>',
    pila: '<rect x="7" y="5" width="10" height="16" rx="2"/><path d="M10 3h4M12 9l-2 4h3l-2 4"/>'
  };
  const svg = n => `<svg viewBox="0 0 24 24">${IC[n]}</svg>`;
  function iconoTipo(nombre) {
    const n = String(nombre).toLowerCase();
    const k = /celular|tablet|móvil|movil/.test(n) ? 'celular' : /computador|perif|laptop/.test(n) ? 'laptop'
      : /cable|cargador/.test(n) ? 'cable' : /electrodom/.test(n) ? 'electro' : /pila|bater/.test(n) ? 'pila' : 'reciclar';
    return `<span class="rs-ico">${svg(k)}</span>`;
  }

  // ---------- piezas de la pantalla ----------
  const CANECA = `<svg viewBox="0 0 160 130" class="rs-chart" aria-hidden="true">
    <g><path d="M20 118C8 96 18 68 44 56c8 26-2 50-24 62z" fill="#4aa557"/><path d="M146 118c10-22 0-48-24-58-8 24 2 46 24 58z" fill="#2e7d3a"/><path d="M40 118c-2-20 8-38 26-46 4 20-6 38-26 46z" fill="#7cc462"/></g>
    <path d="M52 40h56l-6 78H58z" fill="#1f6b3a"/><rect x="46" y="30" width="68" height="12" rx="4" fill="#2e7d3a"/><rect x="70" y="22" width="20" height="8" rx="3" fill="#1f6b3a"/>
    <g transform="translate(45.4 43.4) scale(.72)" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M24 46a24 24 0 0 1 42-14"/><path d="M68 18v15H53"/><path d="M72 50a24 24 0 0 1-42 14"/><path d="M28 78V63h15"/></g></svg>`;

  function tendencia(actual, ant) {
    if (ant > 0) {
      const p = Math.round((actual - ant) / ant * 100);
      return `<small class="rs-trend ${p < 0 ? 'bajo' : ''}">${svg(p < 0 ? 'baja' : 'sube')}${p > 0 ? '+' : ''}${p}% vs. mes anterior</small>`;
    }
    return actual > 0 ? '<small class="rs-trend">Primer registro este mes</small>' : '<small class="rs-trend neutro">Sin registros este mes</small>';
  }
  const stat = (ic, label, valor, pie) => `<div class="cp-stat rs-stat"><div class="cp-stat-ic">${svg(ic)}</div><div><span>${label}</span><b>${valor}</b>${pie}</div></div>`;

  function donaHTML(porTipo) {
    const total = porTipo.reduce((s, t) => s + t.kg, 0);
    const items = porTipo.slice(0, 5).map(t => ({ nombre: t.nombre, kg: t.kg }));
    const resto = porTipo.slice(5).reduce((s, t) => s + t.kg, 0);
    if (resto > 0) items.push({ nombre: 'Otros', kg: resto });
    items.forEach((it, i) => { it.color = PALETA[i]; it.pct = total ? it.kg / total * 100 : 0; });
    const R = 60, C = 2 * Math.PI * R;
    let acc = 0;
    const segs = total ? items.map(it => {
      const len = it.pct / 100 * C;
      const s = `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${it.color}" stroke-width="26" stroke-dasharray="${Math.max(len - 1.5, 0)} ${C}" stroke-dashoffset="${-acc}" transform="rotate(-90 80 80)"/>`;
      acc += len; return s;
    }).join('') : `<circle cx="80" cy="80" r="${R}" fill="none" stroke="#e3eadc" stroke-width="26"/>`;
    return `<div class="rs-dona"><svg viewBox="0 0 160 160" class="rs-chart" role="img" aria-label="Residuos por tipo">${segs}
        <text x="80" y="78" text-anchor="middle" font-size="19" font-weight="800" fill="#1b4a2a" font-family="Inter,sans-serif">${num(total, 0)} kg</text>
        <text x="80" y="95" text-anchor="middle" font-size="11" fill="#5d6b62" font-family="Inter,sans-serif">total</text></svg>
      <div class="rs-leyenda">${total ? items.map(it => `<div class="rs-ley"><i style="background:${it.color}"></i><span>${esc(it.nombre)}</span><b>${Math.round(it.pct)}%</b><em>${num(it.kg, 0)} kg</em></div>`).join('')
        : '<span style="color:#5d6b62">Aún no hay recolecciones registradas.</span>'}</div></div>`;
  }

  function mezcla(a, b, t) {
    const h = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
    const A = h(a), B = h(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function barrasHTML(porMes, mesActual, meses) {
    const lista = [];
    const [y, m] = mesActual.split('-').map(Number);
    for (let i = meses - 1; i >= 0; i--) {
      let mm = m - i, yy = y;
      while (mm <= 0) { mm += 12; yy--; }
      const key = yy + '-' + String(mm).padStart(2, '0');
      const f = porMes.find(x => x.mes === key);
      lista.push({ label: MESC[mm - 1], kg: f ? f.kg : 0 });
    }
    const max = Math.max(...lista.map(x => x.kg), 0);
    let paso = 25;
    if (max > 0) {
      const x = max / 4, pot = Math.pow(10, Math.floor(Math.log10(x))), f = x / pot;
      paso = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pot;
    }
    const tope = Math.max(Math.ceil(max / paso) * paso, paso * 4);
    const L = 46, R = 452, T = 22, B = 204, alto = B - T, slot = (R - L) / meses, ancho = slot * (meses > 6 ? .6 : .55);
    let g = '';
    for (let v = 0; v <= tope + 1e-9; v += paso) {
      const yy = B - v / tope * alto;
      g += `<line x1="${L}" x2="${R}" y1="${yy}" y2="${yy}" stroke="#e3eadc" stroke-width="1"/><text x="${L - 8}" y="${yy + 3.5}" text-anchor="end" font-size="10" fill="#5d6b62" font-family="Inter,sans-serif">${num(v, 0)}</text>`;
    }
    lista.forEach((it, i) => {
      const h = it.kg / tope * alto, x = L + slot * i + (slot - ancho) / 2, yy = B - h;
      const col = mezcla('#8ccf6e', '#2e7d3a', meses > 1 ? i / (meses - 1) : 1);
      if (it.kg > 0) g += `<rect x="${x}" y="${yy}" width="${ancho}" height="${h}" rx="3" fill="${col}"/>`;
      if (it.kg > 0 && meses <= 6) g += `<text x="${x + ancho / 2}" y="${yy - 6}" text-anchor="middle" font-size="10" fill="#1b4a2a" font-family="Inter,sans-serif">${num(it.kg, 0)} kg</text>`;
      g += `<text x="${x + ancho / 2}" y="${B + 17}" text-anchor="middle" font-size="11" fill="#41607a" font-family="Inter,sans-serif">${it.label}</text>`;
    });
    return `<svg viewBox="0 0 460 228" class="rs-chart" role="img" aria-label="Residuos recolectados por mes">${g}</svg>`;
  }

  const INFO = `<section class="rs-card rs-info">
    <div class="rs-info-cab"><div class="cp-stat-ic">${svg('hoja')}</div><div><h2>¿Qué pasa con los residuos?</h2>
      <p>Los residuos son clasificados, pesados y entregados a gestores ambientales para su tratamiento y reciclaje.</p></div></div>
    <div class="rs-pasos">
      <div class="rs-paso"><span class="rs-num">1</span><div class="cp-stat-ic">${svg('reciclar')}</div><div><b>Clasificación</b><small>Por tipo de residuo</small></div></div>
      <div class="rs-paso"><span class="rs-num">2</span><div class="cp-stat-ic">${svg('balanza')}</div><div><b>Pesaje</b><small>Registro en el sistema</small></div></div>
      <div class="rs-paso"><span class="rs-num">3</span><div class="cp-stat-ic">${svg('mano')}</div><div><b>Entrega a gestor</b><small>Reciclaje y disposición final</small></div></div>
    </div></section>`;

  // ---------- estado global ----------
  const vista = { meses: 6, f: { pagina: 1, campana: '', tipo: '', q: '' } };
  let seq = 0;

  function render(el, ctx) {
    const { usuario, api, toast } = ctx;
    const esAdmin = usuario.rol === 'administrador';
    const mi = ++seq;

    function errorPantalla(msg, reintentar) {
      el.innerHTML = `<div class="cp"><a class="cp-atras" href="#residuos">${svg('atras')}Residuos y recolecciones</a>
        <div class="cp-vacio"><b>No se pudo cargar</b>${esc(msg)}<br><br><button class="cp-btn" type="button" id="rReintentar">Reintentar</button></div></div>`;
      el.onclick = e => { if (e.target.closest('#rReintentar')) reintentar(); };
    }

    // ================= RESUMEN =================
    function filaUltima(r) {
      return `<tr><td><div class="rs-celda">${iconoTipo(r.tipo)}${fecha(r.fecha)}</div></td>
        <td><b>${esc(r.nombre)} ${esc(r.apellido)}</b><small>${esc(r.grupo)} · ${esc(r.sede)}</small></td>
        <td>${esc(r.campana)}</td><td>${esc(r.tipo)}</td>
        <td>${num(r.pesoKg, 2)} kg<small>${r.cantidad} ítem${r.cantidad === 1 ? '' : 's'}</small></td>
        <td class="n"><span class="cp-pill">+${num(r.puntos, 0)} pts</span></td></tr>`;
    }

    async function pantallaResumen() {
      el.innerHTML = '<div class="cp"><p style="padding:24px;color:#5d6b62">Cargando…</p></div>';
      let d;
      try { d = await api('/recolecciones/resumen?meses=' + vista.meses); } catch (e) { if (mi === seq) errorPantalla(e.message, pantallaResumen); return; }
      if (mi !== seq) return;
      const t = d.totales, total = d.porTipo.reduce((s, x) => s + x.kg, 0);

      el.innerHTML = `<div class="cp">
        <section class="cp-banner"><div class="cp-banner-txt"><svg class="cp-banner-ic" viewBox="0 0 24 24">${IC.hoja}</svg>
          <div><h1>Residuos y recolecciones</h1><p>Gestiona los residuos recolectados y consulta el historial de recolecciones.</p></div></div>
          <div class="rs-art"><div class="rs-frase">¡Cada residuo<br>cuenta!</div>${CANECA}</div></section>

        <div class="rs-acciones"><button type="button" class="cp-btn" data-registrar>${svg('mas')}Registrar recolección</button></div>

        <div class="cp-stats">
          ${stat('bolsa', 'Total de residuos recolectados', num(t.kg, 0) + ' kg', tendencia(t.mes.kg, t.anterior.kg))}
          ${stat('cal', 'Recolecciones realizadas', num(t.recolecciones, 0), tendencia(t.mes.recolecciones, t.anterior.recolecciones))}
          ${stat('mega', 'Campañas activas', d.campanas.activas, `<small>de ${d.campanas.total} totales</small>`)}
          ${stat('nube', 'CO₂ evitado', num(t.co2, 0) + ' kg', tendencia(t.mes.co2, t.anterior.co2))}
        </div>

        <div class="rs-fila2">
          <section class="rs-card"><div class="rs-cab"><h2>Residuos por tipo</h2></div>${donaHTML(d.porTipo)}</section>
          <section class="rs-card"><div class="rs-cab"><h2>Residuos recolectados por mes</h2>
              <select class="rs-select" id="rMeses" aria-label="Periodo"><option value="6" ${d.meses === 6 ? 'selected' : ''}>Últimos 6 meses</option><option value="12" ${d.meses === 12 ? 'selected' : ''}>Últimos 12 meses</option></select></div>
            <div class="rs-barras" id="rBarras">${barrasHTML(d.porMes, d.mesActual, d.meses)}</div></section>
          ${INFO}
        </div>

        <div class="rs-fila3">
          <section class="rs-card"><div class="rs-cab"><h2>Últimas recolecciones</h2><a class="rs-link" href="#residuos/historial">Ver todas ${svg('flecha')}</a></div>
            ${d.ultimas.length ? `<div class="rs-scroll"><table class="rs-tabla"><thead><tr><th>Fecha</th><th>Estudiante / Grupo</th><th>Campaña</th><th>Tipo de residuo</th><th>Cantidad</th><th class="n">Puntos</th></tr></thead>
              <tbody>${d.ultimas.map(filaUltima).join('')}</tbody></table></div>`
              : '<div class="cp-vacio"><b>Aún no hay recolecciones</b>Cuando registres la primera, aparecerá aquí.</div>'}</section>
          <div class="rs-col">
            <section class="rs-card"><div class="rs-cab"><h2>Tipos de residuos más recolectados</h2></div>
              ${d.porTipo.length ? d.porTipo.map(x => { const p = total ? x.kg / total * 100 : 0; return `<div class="rs-top">${iconoTipo(x.nombre)}<span>${esc(x.nombre)}</span><div class="cp-bar-bg"><i style="width:${Math.round(p)}%"></i></div><b>${Math.round(p)}%</b></div>`; }).join('')
                : '<p class="cp-nota">Sin datos todavía.</p>'}</section>
            <section class="rs-card rs-juntos"><div><b>¡Juntos hacemos la diferencia!</b><p>Cada residuo que se recolecta hoy, es un planeta más limpio mañana.</p></div>${window.EOD ? EOD.globoSVG() : ''}</section>
          </div>
        </div></div>`;

      el.oninput = null; el.onkeydown = null;
      el.onchange = async e => {
        if (e.target.id !== 'rMeses') return;
        vista.meses = Number(e.target.value);
        try {
          const n = await api('/recolecciones/resumen?meses=' + vista.meses);
          const cont = document.getElementById('rBarras');
          if (cont && mi === seq) cont.innerHTML = barrasHTML(n.porMes, n.mesActual, n.meses);
        } catch (err) { toast(err.message); }
      };
      el.onclick = e => { if (e.target.closest('[data-registrar]')) abrirRegistro(pantallaResumen); };
    }

    // ================= HISTORIAL =================
    async function pantallaHistorial() {
      el.innerHTML = '<div class="cp"><p style="padding:24px;color:#5d6b62">Cargando…</p></div>';
      let fl;
      try { fl = await api('/recolecciones/filtros'); } catch (e) { if (mi === seq) errorPantalla(e.message, pantallaHistorial); return; }
      if (mi !== seq) return;
      const f = vista.f;
      el.innerHTML = `<div class="cp">
        <a class="cp-atras" href="#residuos">${svg('atras')}Volver a residuos y recolecciones</a>
        <section class="rs-card"><div class="rs-cab"><h2>Historial de recolecciones</h2>
            <button type="button" class="cp-btn" data-registrar>${svg('mas')}Registrar recolección</button></div>
          <div class="rs-filtros">
            <label class="cp-buscar">${svg('lupa')}<input id="hBuscar" type="search" placeholder="Buscar por estudiante..." value="${esc(f.q)}"></label>
            <select class="rs-select" id="hCampana" aria-label="Campaña"><option value="">Todas las campañas</option>${fl.campanas.map(c => `<option value="${c.id}" ${String(f.campana) === String(c.id) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
            <select class="rs-select" id="hTipo" aria-label="Tipo de residuo"><option value="">Todos los tipos</option>${fl.tipos.map(t => `<option value="${t.id}" ${String(f.tipo) === String(t.id) ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select>
          </div>
          <div id="hTabla"></div></section></div>`;

      let temporizador;
      async function cargarFilas() {
        const cont = document.getElementById('hTabla');
        if (!cont) return;
        const qs = new URLSearchParams({ pagina: f.pagina, limite: 15, campana: f.campana, tipo: f.tipo, q: f.q });
        let d;
        try { d = await api('/recolecciones?' + qs.toString()); } catch (e) { cont.innerHTML = `<div class="cp-vacio"><b>No se pudo cargar</b>${esc(e.message)}</div>`; return; }
        if (mi !== seq) return;
        const paginas = Math.max(1, Math.ceil(d.total / d.limite));
        if (f.pagina > paginas) { f.pagina = paginas; return cargarFilas(); }
        cont.innerHTML = d.filas.length ? `<div class="rs-scroll"><table class="rs-tabla"><thead><tr><th>Fecha</th><th>Estudiante / Grupo</th><th>Campaña</th><th>Tipo de residuo</th><th>Cantidad</th><th>CO₂ evitado</th><th>Puntos</th><th>Registró</th>${esAdmin ? '<th class="n"></th>' : ''}</tr></thead>
          <tbody>${d.filas.map(r => `<tr><td><div class="rs-celda">${iconoTipo(r.tipo)}${fecha(r.fecha)}</div></td>
            <td><b>${esc(r.nombre)} ${esc(r.apellido)}</b><small>${esc(r.grupo)} · ${esc(r.sede)}</small></td><td>${esc(r.campana)}</td><td>${esc(r.tipo)}</td>
            <td>${num(r.pesoKg, 2)} kg<small>${r.cantidad} ítem${r.cantidad === 1 ? '' : 's'}</small></td><td>${num(r.co2, 2)} kg</td>
            <td><span class="cp-pill">+${num(r.puntos, 0)}</span></td><td><small style="display:block;font-size:12.5px;color:#2d3f33">${esc(r.registradoPor)}</small></td>
            ${esAdmin ? `<td class="n"><button type="button" class="cp-btn mini peligro" data-anular="${r.id}">Anular</button></td>` : ''}</tr>`).join('')}</tbody></table></div>
          <div class="rs-pager"><span>${d.total} recolección${d.total === 1 ? '' : 'es'} · página ${f.pagina} de ${paginas}</span>
            <span><button type="button" class="cp-btn mini sec" data-pag="-1" ${f.pagina <= 1 ? 'disabled' : ''}>Anterior</button> <button type="button" class="cp-btn mini sec" data-pag="1" ${f.pagina >= paginas ? 'disabled' : ''}>Siguiente</button></span></div>`
          : '<div class="cp-vacio"><b>Sin resultados</b>No hay recolecciones con esos filtros.</div>';
      }
      cargarFilas();

      el.oninput = e => {
        if (e.target.id !== 'hBuscar') return;
        clearTimeout(temporizador);
        temporizador = setTimeout(() => { f.q = e.target.value.trim(); f.pagina = 1; cargarFilas(); }, 300);
      };
      el.onchange = e => {
        if (e.target.id === 'hCampana') { f.campana = e.target.value; f.pagina = 1; cargarFilas(); }
        if (e.target.id === 'hTipo') { f.tipo = e.target.value; f.pagina = 1; cargarFilas(); }
      };
      el.onclick = async e => {
        if (e.target.closest('[data-registrar]')) return abrirRegistro(cargarFilas);
        const pag = e.target.closest('[data-pag]');
        if (pag) { f.pagina += Number(pag.dataset.pag); return cargarFilas(); }
        const an = e.target.closest('[data-anular]');
        if (an) {
          if (!confirm('¿Anular esta recolección? Se quitarán también los puntos que otorgó. Esta acción no se puede deshacer.')) return;
          an.disabled = true;
          try { await api('/recolecciones/' + an.dataset.anular, { method: 'DELETE' }); toast('Recolección anulada'); cargarFilas(); }
          catch (err) { toast(err.message); an.disabled = false; }
        }
      };
    }

    // ================= REGISTRO =================
    async function abrirRegistro(despues) {
      let op;
      try { op = await api('/recolecciones/opciones'); } catch (e) { return toast(e.message); }
      if (!op.campanas.length) return toast('No hay campañas en curso para registrar recolecciones');

      const m = document.createElement('div');
      m.className = 'cp-modal';
      m.innerHTML = `<div class="cp-dialog" role="dialog" aria-modal="true" aria-label="Registrar recolección" style="max-width:520px">
        <header><h2>Registrar recolección</h2><button type="button" class="cp-x" data-cerrar aria-label="Cerrar">×</button></header>
        <div class="cp-form"><div class="cp-form-cuerpo">
          <label>Campaña<select id="rCampana">${op.campanas.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select></label>
          <label>Estudiante<select id="rEst"></select></label>
          <label>Tipo de residuo<select id="rTipo">${op.tipos.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}</select></label>
          <div class="cp-fila" style="grid-template-columns:1fr 1fr"><label>Cantidad (ítems)<input id="rCant" type="number" min="1" step="1" value="1"></label>
            <label>Peso total (kg)<input id="rPeso" type="number" min="0.01" step="0.01" placeholder="Ej. 2.5"></label></div>
          <div class="rs-prev" id="rPrev"></div>
          <div class="rs-ok" id="rOk" hidden></div>
          <div class="cp-err" id="rErr" role="alert"></div>
        </div><footer><button type="button" class="cp-btn sec" data-cerrar>Cerrar</button><button type="button" class="cp-btn" id="rGuardar">Registrar</button></footer></div></div>`;
      document.body.appendChild(m);
      const q = id => m.querySelector('#' + id);
      const cerrar = () => { m.remove(); document.removeEventListener('keydown', tecla); };
      const tecla = ev => { if (ev.key === 'Escape') cerrar(); };
      document.addEventListener('keydown', tecla);
      m.addEventListener('mousedown', ev => { if (ev.target === m) cerrar(); });
      m.querySelectorAll('[data-cerrar]').forEach(b => b.onclick = cerrar);

      function llenarEstudiantes() {
        const c = op.campanas.find(x => x.id === Number(q('rCampana').value));
        const sel = q('rEst');
        sel.innerHTML = c.estudiantes.length
          ? c.estudiantes.map(e => `<option value="${e.id}">${esc(e.apellido)} ${esc(e.nombre)} · ${esc(e.grupo)}</option>`).join('')
          : '<option value="">Nadie inscrito con autorización vigente</option>';
        q('rGuardar').disabled = !c.estudiantes.length;
        q('rErr').textContent = c.estudiantes.length ? '' : 'Inscribe estudiantes desde Campañas ("Inscribir grupo") y confirma su autorización en Grupos y estudiantes.';
      }
      function vistaPrevia() {
        const t = op.tipos.find(x => x.id === Number(q('rTipo').value)), peso = Number(q('rPeso').value);
        q('rPrev').textContent = peso > 0 && t
          ? `Sumará ${num(Math.round(peso * t.puntosPorKg), 0)} puntos y evitará ${num(peso * t.factor, 2)} kg de CO₂.`
          : 'Al registrar, el sistema calcula los puntos y el CO₂ evitado.';
      }
      llenarEstudiantes(); vistaPrevia();
      m.addEventListener('change', ev => { if (ev.target.id === 'rCampana') { llenarEstudiantes(); q('rOk').hidden = true; } if (ev.target.id === 'rTipo') vistaPrevia(); });
      m.addEventListener('input', ev => { if (ev.target.id === 'rPeso') vistaPrevia(); });

      q('rGuardar').onclick = async function () {
        const body = { campanaId: Number(q('rCampana').value), estudianteId: Number(q('rEst').value), tipoResiduoId: Number(q('rTipo').value), cantidad: Number(q('rCant').value), pesoKg: Number(q('rPeso').value) };
        const err = t => { q('rErr').textContent = t; };
        q('rOk').hidden = true;
        if (!body.estudianteId) return err('Elige un estudiante');
        if (!Number.isInteger(body.cantidad) || body.cantidad < 1) return err('La cantidad debe ser un número entero mayor que 0');
        if (!(body.pesoKg > 0)) return err('Escribe el peso en kg');
        err(''); this.disabled = true;
        try {
          const r = await api('/recolecciones', { method: 'POST', body });
          const est = q('rEst').selectedOptions[0].textContent.split(' · ')[0];
          q('rOk').textContent = `Registrado: ${est} ganó ${num(r.puntos, 0)} puntos y evitó ${num(r.co2, 2)} kg de CO₂.`;
          q('rOk').hidden = false;
          q('rPeso').value = ''; q('rCant').value = '1'; vistaPrevia(); q('rPeso').focus();
          toast('Recolección registrada');
          despues();
        } catch (e) { err(e.message); }
        this.disabled = false;
      };
      q('rPeso').focus();
    }

    // ---------------- arranque ----------------
    if (ctx.sub === 'historial') pantallaHistorial(); else pantallaResumen();
  }

  window.EODResiduos = { render };
})();
