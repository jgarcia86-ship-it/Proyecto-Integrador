// Módulo "Informes y estadísticas" (administrador y docente).
// Uso (desde app-shell.js):  EODInformes.render(elemento, { usuario, api, toast })
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 0) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: d });
  const PALETA = ['#1f6b3a', '#4aa557', '#7cc462', '#b7d65a', '#f2c94c', '#9aa5a0'];

  const IC = {
    barras: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    reciclar: '<path d="M5 12a7 7 0 0 1 12-4M18 4v4h-4M19 12a7 7 0 0 1-12 4M6 20v-4h4"/>',
    mega: '<path d="M3 11v3l12 5V6L3 11z"/><path d="M7 15l1 5h3l-1-4M18 9a4 4 0 0 1 0 6"/>',
    personas: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5M15 15c3 0 6 1.3 6 4.5"/>',
    hoja: '<path d="M5 19C4 10 9 4 20 4c0 11-6 16-15 15zM5 19c3-5 6-8 10-11"/>',
    sube: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    baja: '<path d="M3 7l6 6 4-4 8 8M15 17h6v-6"/>',
    bajar: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
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

  // % de cambio frente al periodo anterior
  function tendencia(actual, ant) {
    if (ant > 0) {
      const p = Math.round((actual - ant) / ant * 100);
      return `<small class="rs-trend ${p < 0 ? 'bajo' : ''}">${svg(p < 0 ? 'baja' : 'sube')}${p > 0 ? '+' : ''}${p}% vs. periodo anterior</small>`;
    }
    return actual > 0 ? '<small class="rs-trend">Sin datos del periodo anterior</small>' : '<small class="rs-trend neutro">Sin registros en el periodo</small>';
  }
  const stat = (ic, label, valor, pie) => `<div class="cp-stat rs-stat"><div class="cp-stat-ic">${svg(ic)}</div><div><span>${label}</span><b>${valor}</b>${pie}</div></div>`;

  // ---------- gráficas ----------
  function barrasHTML(porTipo) {
    if (!porTipo.length) return '<div class="cp-vacio"><b>Sin datos</b>No hay recolecciones en este periodo.</div>';
    const max = Math.max(...porTipo.map(t => t.kg));
    return `<div class="inf-barras">${porTipo.map((t, i) => `
      <div class="inf-col" title="${esc(t.nombre)}: ${num(t.kg, 1)} kg">
        <span class="inf-val">${num(t.kg, 0)} kg</span>
        <div class="inf-pista"><i style="height:${Math.max(t.kg / max * 100, 3)}%;background:${PALETA[Math.min(i, PALETA.length - 1)]}"></i></div>
        ${iconoTipo(t.nombre)}<span class="inf-nom">${esc(t.nombre)}</span>
      </div>`).join('')}</div>`;
  }

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
    return `<div class="rs-dona"><svg viewBox="0 0 160 160" class="rs-chart" role="img" aria-label="Distribución de residuos">${segs}
        <text x="80" y="78" text-anchor="middle" font-size="19" font-weight="800" fill="#1b4a2a" font-family="Inter,sans-serif">${num(total)} kg</text>
        <text x="80" y="95" text-anchor="middle" font-size="11" fill="#5d6b62" font-family="Inter,sans-serif">total</text></svg>
      <div class="rs-leyenda">${total ? items.map(it => `<div class="rs-ley"><i style="background:${it.color}"></i><span>${esc(it.nombre)}</span><b>${Math.round(it.pct)}%</b><em>${num(it.kg)} kg</em></div>`).join('')
        : '<span style="color:#5d6b62">Aún no hay recolecciones en este periodo.</span>'}</div></div>`;
  }

  // ---------- descarga (CSV que abre bien en Excel) ----------
  function descargarCSV(d, usuario) {
    const t = d.totales, q = v => '"' + String(v).replace(/"/g, '""') + '"';
    const filas = [
      ['Informe EOD', usuario.institucion || ''],
      ['Periodo', 'Últimos ' + d.meses + ' meses'],
      ['Generado', new Date().toLocaleString('es-CO')],
      [],
      ['Resumen'],
      ['Residuos recolectados (kg)', t.kg], ['Recolecciones', t.recolecciones], ['Campañas activas', d.campanas.activas],
      ['Participantes', t.participantes], ['CO2 evitado (kg)', t.co2],
      [],
      ['Residuos por tipo'], ['Tipo', 'Kg'], ...d.porTipo.map(x => [x.nombre, x.kg]),
      [],
      ['Ranking de grupos'], ['Posición', 'Grupo', 'Sede', 'Puntos', 'Residuos (kg)', 'CO2 evitado (kg)'],
      ...d.grupos.map((g, i) => [i + 1, g.grupo, g.sede, g.puntos, g.kg, g.co2])
    ];
    const csv = '﻿' + filas.map(f => f.map(v => typeof v === 'number' ? String(v).replace('.', ',') : q(v)).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'informe-eod-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- pantalla ----------
  const vista = { meses: 6 };
  let seq = 0;

  function render(el, ctx) {
    const { usuario, api, toast } = ctx;
    const mi = ++seq;

    async function cargar() {
      el.innerHTML = '<div class="cp"><p style="padding:24px;color:#5d6b62">Cargando…</p></div>';
      let d;
      try { d = await api('/informes?meses=' + vista.meses); }
      catch (e) {
        if (mi !== seq) return;
        el.innerHTML = `<div class="cp"><div class="cp-vacio"><b>No se pudo cargar</b>${esc(e.message)}<br><br><button class="cp-btn" type="button" id="iReintentar">Reintentar</button></div></div>`;
        el.onclick = ev => { if (ev.target.closest('#iReintentar')) cargar(); };
        return;
      }
      if (mi !== seq) return;
      const t = d.totales, globo = window.EOD ? EOD.globoSVG() : '';
      const alcance = usuario.rol === 'docente' ? 'tus grupos' : 'tu institución';

      el.innerHTML = `<div class="cp">
        <section class="cp-banner"><div class="cp-banner-txt"><svg class="cp-banner-ic" viewBox="0 0 24 24">${IC.barras}</svg>
          <div><h1>Informes y estadísticas</h1><p>Datos que generan un mejor futuro.</p></div></div>
          <div class="cp-art">${globo}</div></section>

        <div class="inf-barra">
          <select class="rs-select" id="iMeses" aria-label="Periodo">
            ${[3, 6, 12].map(m => `<option value="${m}" ${d.meses === m ? 'selected' : ''}>Últimos ${m} meses</option>`).join('')}
          </select>
          <button type="button" class="cp-btn" id="iDescargar">${svg('bajar')}Descargar informe</button>
        </div>

        <div class="cp-stats">
          ${stat('reciclar', 'Residuos recolectados', num(t.kg) + ' kg', tendencia(t.kg, t.kgAnt))}
          ${stat('mega', 'Campañas activas', d.campanas.activas, `<small>de ${d.campanas.total} totales</small>`)}
          ${stat('personas', 'Participantes', num(t.participantes), `<small>de ${num(t.estudiantes)} estudiantes de ${alcance}</small>`)}
          ${stat('hoja', 'CO₂ evitado', num(t.co2) + ' kg', tendencia(t.co2, t.co2Ant))}
        </div>

        <div class="inf-fila">
          <section class="rs-card"><div class="rs-cab"><h2>Residuos recolectados por tipo</h2></div>${barrasHTML(d.porTipo)}</section>
          <section class="rs-card"><div class="rs-cab"><h2>Distribución de residuos</h2></div>${donaHTML(d.porTipo)}</section>
        </div>

        <section class="rs-card"><div class="rs-cab"><h2>Ranking de grupos</h2></div>
          ${d.grupos.length ? `<div class="rs-scroll"><table class="rs-tabla"><thead><tr><th>#</th><th>Grupo</th><th class="n">Puntos</th><th class="n">Residuos recolectados</th><th class="n">CO₂ evitado</th></tr></thead>
            <tbody>${d.grupos.map((g, i) => `<tr>
              <td><span class="inf-pos ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span></td>
              <td><div class="rs-celda"><span class="rs-ico">${svg('personas')}</span><div><b>${esc(g.grupo)}</b><small>${esc(g.sede)}</small></div></div></td>
              <td class="n"><b>${num(g.puntos)}</b></td><td class="n">${num(g.kg, 1)} kg</td><td class="n">${num(g.co2, 1)} kg</td></tr>`).join('')}</tbody></table></div>`
            : '<div class="cp-vacio"><b>Aún no hay datos para el ranking</b>Aparecerá cuando se registren recolecciones en este periodo.</div>'}
        </section>

        <section class="rs-card rs-juntos"><div><b>¡Juntos estamos haciendo la diferencia!</b><p>Cada residuo cuenta. Sigue participando y ayuda a cuidar el planeta.</p></div>${globo}</section>
      </div>`;

      el.onchange = e => { if (e.target.id === 'iMeses') { vista.meses = Number(e.target.value); cargar(); } };
      el.onclick = e => { if (e.target.closest('#iDescargar')) { descargarCSV(d, usuario); toast('Informe descargado'); } };
    }
    cargar();
  }

  window.EODInformes = { render };
})();
