// Módulo "Calculadora ambiental" (todos los roles).
//  - Calcula el impacto de una cantidad de residuos (CO2 evitado, árboles, energía y agua) con los
//    factores de cada tipo de residuo guardados en la base de datos.
//  - Compara el impacto ya registrado (estudiante: el suyo · docente: sus grupos · administrador: toda la institución).
// Uso (desde app-shell.js):  EODCalculadora.render(elemento, { usuario, api, toast })
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 0) => Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: d });

  const IC = {
    hoja: '<path d="M5 19C4 10 9 4 20 4c0 11-6 16-15 15zM5 19c3-5 6-8 10-11"/>',
    arbol: '<circle cx="12" cy="8" r="5"/><circle cx="6.5" cy="13" r="3.5"/><circle cx="17.5" cy="13" r="3.5"/><path d="M12 13v8M9 21h6"/>',
    rayo: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    gota: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
    nube: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z"/><path d="M10 13.5a2 2 0 1 0 0 .01M14 12v3"/>',
    refrescar: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
    flecha: '<path d="M9 6l6 6-6 6"/>',
    reciclar: '<path d="M5 12a7 7 0 0 1 12-4M18 4v4h-4M19 12a7 7 0 0 1-12 4M6 20v-4h4"/>',
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
  const globo = () => (window.EOD ? EOD.globoSVG() : '');

  const PERIODOS = {
    mes: { act: 'mes', ant: 'mesAnterior', texto: 'Este mes', vs: 'vs. mes anterior' },
    anio: { act: 'anio', ant: 'anioAnterior', texto: 'Este año', vs: 'vs. año anterior' },
    total: { act: 'total', ant: null, texto: 'Total registrado', vs: '' }
  };
  const ALCANCE = {
    estudiante: 'Lo que has recolectado tú.',
    docente: 'Lo recolectado por los estudiantes de tus grupos.',
    administrador: 'Lo recolectado en toda tu institución.'
  };
  const DEFECTO = [10, 5, 3, 2, 1, 0];   // cantidades de ejemplo para que la calculadora arranque con resultados
  const estado = { periodo: 'mes' };
  let seq = 0;

  function render(el, ctx) {
    const { usuario, api, toast } = ctx;
    const mi = ++seq;
    let d = null, filas = [];

    // ---------- carga ----------
    async function cargar() {
      el.innerHTML = '<div class="cp"><p style="padding:24px;color:#5d6b62">Cargando…</p></div>';
      try { d = await api('/calculadora'); }
      catch (e) {
        if (mi === seq) {
          el.innerHTML = `<div class="cp"><div class="cp-vacio"><b>No se pudo cargar la calculadora</b>${esc(e.message)}<br><br><button class="cp-btn" type="button" id="caReintentar">Reintentar</button></div></div>`;
          el.onclick = ev => { if (ev.target.closest('#caReintentar')) cargar(); };
        }
        return;
      }
      if (mi !== seq) return;
      filas = d.tipos.slice(0, 6).map((t, i) => ({ tipoId: t.id, valor: DEFECTO[i] || 0, unidad: 'kg' }));
      pintar();
    }

    // ---------- cálculo ----------
    const tipo = id => d.tipos.find(t => t.id === id);
    const kgDe = f => {
      const t = tipo(f.tipoId), v = Math.max(0, Number(f.valor) || 0);
      return f.unidad === 'u' && t && t.pesoUnitario ? v * t.pesoUnitario : v;
    };
    function calcular() {
      const r = { kg: 0, co2: 0, energia: 0, agua: 0 };
      filas.forEach(f => { const t = tipo(f.tipoId), k = kgDe(f); r.kg += k; r.co2 += k * t.co2; r.energia += k * t.energia; r.agua += k * t.agua; });
      r.arboles = r.co2 / d.constantes.kgCo2PorArbol;
      return r;
    }
    function textoEquiv(f) {
      const t = tipo(f.tipoId), v = Number(f.valor) || 0;
      if (!(v > 0)) return 'Ingresa una cantidad para ver la equivalencia';
      if (!t.pesoUnitario) return 'Equivale a residuos varios';
      if (f.unidad === 'u') return `Equivale a aproximadamente ${num(v * t.pesoUnitario, 1)} kg`;
      return `Equivale a aproximadamente ${num(Math.round(v / t.pesoUnitario))} ${t.unidad || 'unidades'}`;
    }

    // ---------- piezas ----------
    function filaHTML(f, i) {
      const t = tipo(f.tipoId), usados = filas.map(x => x.tipoId);
      const opciones = d.tipos.filter(x => x.id === f.tipoId || !usados.includes(x.id))
        .map(x => `<option value="${x.id}" ${x.id === f.tipoId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
      return `<div class="ca-fila" data-i="${i}">${iconoTipo(t.nombre)}
        <select class="ca-tipo" data-campo="tipo" aria-label="Tipo de residuo">${opciones}</select>
        <div class="ca-cant"><button type="button" data-paso="-1" aria-label="Restar">−</button>
          <input type="number" inputmode="decimal" min="0" max="1000000" step="any" value="${esc(f.valor)}" data-campo="valor" aria-label="Cantidad">
          <button type="button" data-paso="1" aria-label="Sumar">+</button></div>
        <div class="ca-uni"><select data-campo="unidad" aria-label="Unidad"><option value="kg" ${f.unidad === 'kg' ? 'selected' : ''}>kg</option>${t.pesoUnitario ? `<option value="u" ${f.unidad === 'u' ? 'selected' : ''}>unid.</option>` : ''}</select></div>
        <button type="button" class="ca-quitar" data-quitar aria-label="Quitar este residuo" ${filas.length <= 1 ? 'hidden' : ''}>×</button>
        <small class="ca-eq">${esc(textoEquiv(f))}</small></div>`;
    }
    function pintarFilas() {
      document.getElementById('caFilas').innerHTML = filas.map(filaHTML).join('');
      const ag = document.getElementById('caAgregar');
      ag.disabled = filas.length >= d.tipos.length;
    }

    function tile(ic, label, valor, pie) {
      return `<div class="ca-tile"><span class="rs-ico">${svg(ic)}</span><span>${label}</span><b>${valor}</b><small>${pie}</small></div>`;
    }
    function pintarResultados() {
      const r = calcular();
      document.getElementById('caResultados').innerHTML = `
        <div class="ca-total"><div class="ca-arbol">${svg('arbol')}</div><div><span>Total recuperado</span><b>${num(r.kg, 1)} kg</b><small>de residuos electrónicos y chatarra</small></div></div>
        <div class="ca-tiles">
          ${tile('hoja', 'CO₂ evitado', num(r.co2, 1) + ' kg', 'de CO₂')}
          ${tile('arbol', 'Árboles salvados', num(r.arboles, 1), num(r.arboles, 1) === '1' ? 'árbol' : 'árboles')}
          ${tile('rayo', 'Energía ahorrada', num(r.energia, 1) + ' kWh', 'de energía')}
          ${tile('gota', 'Agua ahorrada', num(r.agua, 0) + ' L', 'de agua')}</div>`;
    }

    const METRICAS = [
      { k: 'co2', label: 'CO₂ evitado', u: 'kg', dec: 1, ic: 'nube' },
      { k: 'arboles', label: 'Árboles salvados', u: '', dec: 1, ic: 'arbol' },
      { k: 'energia', label: 'Energía ahorrada', u: 'kWh', dec: 1, ic: 'rayo' },
      { k: 'agua', label: 'Agua ahorrada', u: 'L', dec: 0, ic: 'gota' }
    ];
    function valorReal(periodo, k) {
      const r = d.real[periodo];
      return k === 'arboles' ? r.co2 / d.constantes.kgCo2PorArbol : r[k];
    }
    function pintarComparativa() {
      const p = PERIODOS[estado.periodo];
      const hay = d.real[p.act].kg > 0;
      document.getElementById('caComp').innerHTML = METRICAS.map(m => {
        const cur = valorReal(p.act, m.k), prev = p.ant ? valorReal(p.ant, m.k) : 0;
        const ancho = p.ant ? (cur > 0 || prev > 0 ? cur / Math.max(cur, prev) * 100 : 0) : (cur > 0 ? 100 : 0);
        let nota = '';
        if (p.ant) {
          if (prev > 0) { const c = Math.round((cur - prev) / prev * 100); nota = `${c > 0 ? '+' : ''}${c}% ${p.vs}`; }
          else if (cur > 0) nota = 'Sin datos del periodo anterior';
        }
        return `<div class="ca-m"><span class="rs-ico">${svg(m.ic)}</span><span>${m.label}</span>
          <div class="cp-bar-bg"><i style="width:${Math.round(ancho)}%"></i></div><b>${num(cur, m.dec)}${m.u ? ' ' + m.u : ''}</b>${nota ? `<em>${esc(nota)}</em>` : ''}</div>`;
      }).join('') + (hay ? '' : '<p class="ca-vacio">Aún no hay recolecciones registradas en este periodo.</p>');
      const btn = document.getElementById('caReal');
      if (btn) btn.querySelector('span').textContent = `Usar mis recolecciones reales (${p.texto.toLowerCase()})`;
    }

    function referencia() {
      const elec = d.tipos.filter(t => !/chatarra|metal/i.test(t.nombre) && t.co2 > 0);
      const prom = k => elec.length ? elec.reduce((s, t) => s + t[k], 0) / elec.length : 0;
      const l = [];
      if (elec.length) {
        l.push(['nube', `1 kg de residuos electrónicos evita en promedio <b>${num(prom('co2'), 1)} kg</b> de CO₂`]);
        if (prom('energia') > 0) l.push(['rayo', `1 kg de residuos electrónicos ahorra en promedio <b>${num(prom('energia'), 1)} kWh</b> de energía`]);
        if (prom('agua') > 0) l.push(['gota', `1 kg de residuos electrónicos ahorra en promedio <b>${num(prom('agua'), 0)} litros</b> de agua`]);
      }
      l.push(['arbol', `1 árbol puede absorber ≈ <b>${d.constantes.kgCo2PorArbol} kg</b> de CO₂ al año`]);
      return l.map(([ic, t]) => `<div class="ca-r"><span class="rs-ico">${svg(ic)}</span><div>${t}</div></div>`).join('');
    }

    // ---------- pantalla ----------
    function pintar() {
      const sinFactores = d.tipos.every(t => !t.energia && !t.agua);
      el.innerHTML = `<div class="cp">
        <section class="cp-banner ca-banner"><div class="cp-banner-txt"><svg class="cp-banner-ic" viewBox="0 0 24 24">${IC.hoja}</svg>
          <div><h1>Calculadora ambiental</h1><p>Convierte los residuos en un impacto positivo para el planeta.</p>
            <p style="margin-top:8px;font-size:13.5px">Descubre cuánto ayudas al medio ambiente con cada kilo de residuos que recolectas.</p></div></div>
          <div class="ca-art"><div class="globo">${globo()}</div><div class="ca-frase">Pequeñas acciones, grandes cambios</div></div></section>

        <div class="ca-grid">
          <div class="ca-col"><section class="ca-card"><h2>Calcula tu impacto</h2>
            <p class="sub">Selecciona el tipo de residuo y la cantidad que deseas calcular para conocer el impacto ambiental que generas.</p>
            <div class="ca-filas" id="caFilas"></div>
            <button type="button" class="ca-agregar" id="caAgregar"><i>+</i>Agregar otro tipo de residuo</button>
            <div class="ca-btns"><button type="button" class="cp-btn" id="caCalc">${svg('hoja')}Calcular impacto</button><button type="button" class="cp-btn sec" id="caLimpiar">${svg('refrescar')}Limpiar</button></div>
            <button type="button" class="ca-real" id="caReal">${svg('reciclar')}<span></span></button>
            ${sinFactores ? '<div class="ca-aviso">Los factores de energía y agua aún no están configurados, por eso esos resultados aparecen en cero. Ejecuta <b>sql/migracion_calculadora.sql</b> en MySQL.</div>' : ''}</section></div>

          <div class="ca-col"><section class="ca-card" id="caCardRes"><h2>Tu impacto ambiental</h2><div id="caResultados" style="margin-top:12px"></div>
            <div class="ca-esfuerzo"><div class="globo">${globo()}</div><div><b>¡Tu esfuerzo cuenta!</b><p>Con cada residuo que reciclas, reduces la contaminación y ayudas a preservar el planeta.</p></div></div></section></div>

          <div class="ca-col">
            <section class="ca-card"><div class="ca-cab"><h2>Comparativa de impacto</h2>
                <select class="ca-select" id="caPeriodo" aria-label="Periodo">${Object.entries(PERIODOS).map(([k, p]) => `<option value="${k}" ${estado.periodo === k ? 'selected' : ''}>${p.texto}</option>`).join('')}</select></div>
              <p class="sub" style="margin-bottom:6px">${ALCANCE[usuario.rol] || ''}</p><div class="ca-comp" id="caComp"></div></section>
            <section class="ca-card"><h2 style="margin-bottom:6px">Datos de referencia</h2><div class="ca-ref">${referencia()}</div>
              <p class="ca-nota">Valores estimados: pueden variar según el tipo y el estado del equipo.</p></section></div>
        </div>

        <section class="ca-pie"><div class="globo">${globo()}</div>
          <div><h3>Juntos por un futuro más verde</h3><p>Cada residuo cuenta. Realiza el cálculo, descubre tu impacto y sé parte del cambio.</p></div>
          <a class="cp-btn" href="iniciativas.html">Ver más iniciativas ${svg('flecha')}</a></section></div>`;

      pintarFilas(); pintarResultados(); pintarComparativa();

      // ----- eventos -----
      const filaDe = t => t.closest('.ca-fila');
      const refrescarFila = (fila, f) => {
        const eq = fila.querySelector('.ca-eq'); if (eq) eq.textContent = textoEquiv(f);
      };

      el.oninput = e => {
        if (e.target.dataset.campo !== 'valor') return;
        const f = filas[Number(filaDe(e.target).dataset.i)];
        let v = e.target.value;
        if (Number(v) < 0) { v = '0'; e.target.value = '0'; }
        if (Number(v) > 1000000) { v = '1000000'; e.target.value = v; }
        f.valor = v;
        refrescarFila(filaDe(e.target), f);
        pintarResultados();
      };
      el.onchange = e => {
        const campo = e.target.dataset.campo;
        if (e.target.id === 'caPeriodo') { estado.periodo = e.target.value; return pintarComparativa(); }
        if (!campo || campo === 'valor') return;
        const f = filas[Number(filaDe(e.target).dataset.i)];
        if (campo === 'tipo') {
          f.tipoId = Number(e.target.value);
          if (!tipo(f.tipoId).pesoUnitario) f.unidad = 'kg';
        } else if (campo === 'unidad') {
          const t = tipo(f.tipoId), v = Number(f.valor) || 0;
          if (e.target.value === 'u' && f.unidad === 'kg') f.valor = String(Math.round(v / t.pesoUnitario));       // kg → unidades
          if (e.target.value === 'kg' && f.unidad === 'u') f.valor = String(Math.round(v * t.pesoUnitario * 100) / 100); // unidades → kg
          f.unidad = e.target.value;
        }
        pintarFilas(); pintarResultados();
      };
      el.onkeydown = null;
      el.onclick = e => {
        const t = e.target;
        const paso = t.closest('[data-paso]');
        if (paso) {
          const fila = filaDe(paso), f = filas[Number(fila.dataset.i)];
          f.valor = String(Math.min(1000000, Math.max(0, Math.round(((Number(f.valor) || 0) + Number(paso.dataset.paso)) * 100) / 100)));
          fila.querySelector('input').value = f.valor;
          refrescarFila(fila, f); return pintarResultados();
        }
        if (t.closest('[data-quitar]')) { filas.splice(Number(filaDe(t).dataset.i), 1); pintarFilas(); return pintarResultados(); }
        if (t.closest('#caAgregar')) {
          const libre = d.tipos.find(x => !filas.some(f => f.tipoId === x.id));
          if (libre) { filas.push({ tipoId: libre.id, valor: 0, unidad: 'kg' }); pintarFilas(); pintarResultados(); }
          return;
        }
        if (t.closest('#caCalc')) {
          pintarResultados();
          if (calcular().kg <= 0) toast('Ingresa al menos una cantidad para calcular');
          const card = document.getElementById('caCardRes');
          card.classList.remove('ca-flash'); void card.offsetWidth; card.classList.add('ca-flash');
          if (window.innerWidth < 1300) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (t.closest('#caLimpiar')) { filas.forEach(f => { f.valor = 0; f.unidad = 'kg'; }); pintarFilas(); return pintarResultados(); }
        if (t.closest('#caReal')) {
          const p = PERIODOS[estado.periodo].act;
          const reales = d.realPorTipo.filter(x => x[p] > 0 && tipo(x.tipoId)).slice(0, 12);
          if (!reales.length) return toast('Aún no hay recolecciones registradas en ese periodo');
          filas = reales.map(x => ({ tipoId: x.tipoId, valor: String(Math.round(x[p] * 100) / 100), unidad: 'kg' }));
          pintarFilas(); pintarResultados();
          toast('Cargamos tus recolecciones reales');
        }
      };
    }

    cargar();
  }

  window.EODCalculadora = { render };
})();
