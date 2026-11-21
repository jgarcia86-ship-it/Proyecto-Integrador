// Contenido compartido de "Sobre Nosotros": lo usan nosotros.html (público) y app.html (con sesión)
(function () {
  const ROL = 'Con la fe en Dios de ser ingeniero';

  // Para poner una foto real: guarda el archivo en public/img/equipo/ y escribe su ruta en "foto".
  // Mientras sea null (o el archivo no exista) se muestran las iniciales.
  const EQUIPO = [
    { nombre: 'Henry Alfonso Orellano Martínez', ini: 'HO', foto: 'equipo/Henry.jpg' },
    { nombre: 'Andrés Camilo Camargo Mise',      ini: 'AC', foto: null },
    { nombre: 'Juan José García Duarte',         ini: 'JG', foto: 'equipo/Juan.jpg' },
    { nombre: 'Andrés Serna Jiménez',            ini: 'AS', foto: null },
    { nombre: 'José Manuel Pava Mercado',        ini: 'JP', foto: null }
  ];

  const HOJA = `<svg class="sn-hoja" viewBox="0 0 48 48"><path d="M8 40C6 20 18 6 42 6c0 24-12 36-30 34z" fill="#3f9a45"/><path d="M10 38C18 26 26 18 36 12" fill="none" stroke="#e8f5dd" stroke-width="2" stroke-linecap="round"/></svg>`;

  function globoSVG() {
    return `<svg viewBox="0 0 320 200" aria-hidden="true">
      <defs><radialGradient id="gl" cx=".35" cy=".3"><stop offset="0" stop-color="#3b9fd0"/><stop offset="1" stop-color="#0f6c9a"/></radialGradient></defs>
      <g fill="#3f9a45">
        <path d="M70 150c-24-10-40-34-34-60 22 6 42 24 34 60z"/>
        <path d="M92 168c-6-24 2-48 26-60 8 24-2 48-26 60z" fill="#2e7d3a"/>
        <path d="M258 70c20 6 34 26 30 48-20-4-36-24-30-48z"/>
        <path d="M244 150c8-22 28-36 52-32-6 24-26 38-52 32z" fill="#2e7d3a"/>
        <path d="M120 40c-10-16-6-32 10-40 10 16 4 32-10 40z" fill="#5fae48"/>
      </g>
      <circle cx="165" cy="105" r="72" fill="url(#gl)"/>
      <g fill="#6fbf4f">
        <path d="M118 78c10-14 28-18 38-8 4 10-8 14-6 24s-14 14-22 6-18-8-10-22z"/>
        <path d="M168 120c12-6 28 0 30 14 0 14-10 24-20 22s-8-14-16-18-6-14 6-18z"/>
        <path d="M178 66c10-8 26-6 32 4s-4 16-14 14-24-8-18-18z"/>
        <path d="M206 100c10 2 14 14 8 24-8-2-14-12-8-24z"/>
      </g>
      <ellipse cx="140" cy="76" rx="26" ry="14" fill="#fff" opacity=".12" transform="rotate(-25 140 76)"/>
    </svg>`;
  }

  function bannerHTML(o) {
    return `<section class="sn-banner">
      <div class="sn-banner-txt">${HOJA}<div>
        <h1>${o.titulo}</h1><h3>${o.subtitulo}</h3><p>${o.texto}</p>
      </div></div>
      <div class="sn-art">${globoSVG()}${o.frase ? '<div class="sn-frase">Pequeñas acciones, grandes cambios</div>' : ''}</div>
    </section>`;
  }

  function miembroHTML(m) {
    const img = m.foto ? `<img src="${m.foto}" alt="${m.nombre}" onerror="this.remove()">` : '';
    return `<article class="miembro">
      <div class="av">${m.ini}${img}</div>
      <h4>${m.nombre}</h4>
      <span class="pill">${ROL}</span>
    </article>`;
  }

  function equipoHTML() {
    return `<section class="sn-card">
      <div class="sn-titulo">
        <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5M15 15c3 0 6 1.3 6 4.5"/></svg>
        <h2>Nuestro equipo</h2>
      </div>
      <p class="sn-sub">Somos el equipo que construye EOD con compromiso por la educación y el medio ambiente.</p>
      <div class="sn-equipo">${EQUIPO.map(miembroHTML).join('')}</div>
    </section>`;
  }

  const DECO = `<svg class="sn-mv-deco" viewBox="0 0 120 120" aria-hidden="true"><path d="M20 118C14 70 44 30 112 24c0 62-34 98-92 94z" fill="#7cc462" opacity=".55"/><path d="M60 118C58 86 76 62 112 58c-2 34-22 56-52 60z" fill="#3f9a45" opacity=".7"/></svg>`;

  function mvHTML() {
    return `<div class="sn-mv">
      <section class="sn-mv-card">
        <header><div class="sn-mv-ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 12l7-7"/></svg></div><h2>Nuestra misión</h2></header>
        <p>Fomentar la educación ambiental y la gestión responsable de residuos eléctricos, electrónicos y chatarra en las instituciones educativas de Barrancabermeja, a través de una plataforma tecnológica que incentive la participación, la cultura del reciclaje y la generación de un impacto positivo en el medio ambiente.</p>
        ${DECO}
      </section>
      <section class="sn-mv-card">
        <header><div class="sn-mv-ico"><svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></div><h2>Nuestra visión</h2></header>
        <p>Ser la plataforma líder en la gestión de residuos electrónicos y chatarra en instituciones educativas de Barrancabermeja, contribuyendo a la formación de una generación consciente, comprometida con el medio ambiente y la sostenibilidad del planeta.</p>
        ${DECO}
      </section>
    </div>`;
  }

  function renderNosotros(el) {
    el.innerHTML = '<div class="sn-wrap">' +
      bannerHTML({
        titulo: 'Sobre Nosotros',
        subtitulo: 'EOD - Entidad Organizadora de Desechos',
        texto: 'Somos una plataforma educativa y ambiental que promueve la correcta gestión de residuos eléctricos, electrónicos y chatarra en las instituciones educativas de Barrancabermeja, fomentando la conciencia ambiental, la economía circular y la participación de toda la comunidad educativa.',
        frase: true
      }) + equipoHTML() + mvHTML() + '</div>';
  }

  window.EOD = { renderNosotros, bannerHTML, globoSVG };
})();
