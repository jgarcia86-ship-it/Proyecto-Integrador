(async () => {
  const $ = id => document.getElementById(id);
  const TODOS = ['administrador', 'docente', 'estudiante'];
  const ADM_DOC = ['administrador', 'docente'];

  // ---------- iconos ----------
  const IC = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    inst: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
    grupos: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5M15 15c3 0 6 1.3 6 4.5"/>',
    campanas: '<path d="M3 11v3l12 5V6L3 11z"/><path d="M7 15l1 5h3l-1-4M18 9a4 4 0 0 1 0 6"/>',
    residuos: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    gamificacion: '<path d="M8 4h8v6a4 4 0 0 1-8 0V4zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 14v4M8 20h8"/>',
    incentivos: '<rect x="3" y="9" width="18" height="4" rx="1"/><path d="M5 13v7h14v-7M12 9v11M12 9S10 4 8 5s0 4 4 4zM12 9s2-5 4-4 0 4-4 4"/>',
    calculadora: '<circle cx="12" cy="12" r="9"/><path d="M8 14c2-5 6-5 8-8M9 17c3 0 5-2 6-5"/>',
    informes: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    nosotros: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5M15 15c3 0 6 1.3 6 4.5"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    ayuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
    salir: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>'
  };
  const svg = n => `<svg viewBox="0 0 24 24">${IC[n]}</svg>`;

  // ---------- módulos y permisos por rol ----------
  const MENU = [
    { id: 'inicio',        t: 'Inicio',                   i: 'home',         roles: TODOS },
    { id: 'instituciones', t: 'Instituciones y sedes',    i: 'inst',         roles: ['administrador'] },
    { id: 'grupos',        t: 'Grupos y estudiantes',     i: 'grupos',       roles: ADM_DOC },
    { id: 'campanas',      t: 'Campañas',                 i: 'campanas',     roles: TODOS },
    { id: 'residuos',      t: 'Residuos y recolecciones', i: 'residuos',     roles: ADM_DOC },
    { id: 'gamificacion',  t: 'Gamificación',             i: 'gamificacion', roles: TODOS },
    { id: 'incentivos',    t: 'Incentivos',               i: 'incentivos',   roles: TODOS },
    { id: 'calculadora',   t: 'Calculadora ambiental',    i: 'calculadora',  roles: TODOS },
    { id: 'informes',      t: 'Informes y estadísticas',  i: 'informes',     roles: ADM_DOC },
    { id: 'nosotros',      t: 'Sobre Nosotros',           i: 'nosotros',     roles: TODOS }
  ];
  const LISTOS = ['campanas', 'grupos', 'instituciones', 'residuos', 'incentivos', 'gamificacion', 'informes', 'calculadora'];   // módulos ya construidos
  const ROLES = { administrador: 'Administrador', docente: 'Docente', estudiante: 'Estudiante' };

  // ---------- sesión ----------
  const leerToken = () => localStorage.getItem('eod_token') || sessionStorage.getItem('eod_token');
  const borrarToken = () => { localStorage.removeItem('eod_token'); sessionStorage.removeItem('eod_token'); };
  const salir = () => { borrarToken(); location.replace('index.html'); };

  function toast(t) {
    const el = $('toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 3000);
  }

  const token = leerToken();
  if (!token) return location.replace('index.html');

  // Llamadas a la API con el token de la sesión
  async function api(ruta, o = {}) {
    let r;
    try {
      r = await fetch('/api' + ruta, {
        method: o.method || 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: o.body ? JSON.stringify(o.body) : undefined
      });
    } catch { throw new Error('No hay conexión con el servidor'); }
    if (r.status === 401) { salir(); throw new Error('Tu sesión venció'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || 'Error inesperado');
    return d;
  }

  let usuario;
  try {
    const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 401) return salir();
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || 'Error');
    usuario = d.usuario;
  } catch {
    $('vista').innerHTML = '<p style="padding:30px;color:#b3261e">No se pudo conectar con el servidor. Verifica que esté encendido y recarga la página.</p>';
    return;
  }

  // ---------- barra superior ----------
  $('uAv').textContent = usuario.nombre.charAt(0).toUpperCase();
  $('uNombre').textContent = usuario.nombre + ' ' + usuario.apellido;
  $('uRol').textContent = ROLES[usuario.rol] || usuario.rol;
  $('uInst').textContent = usuario.institucion ? 'Institución: ' + usuario.institucion : '';

  $('userBtn').onclick = e => { e.stopPropagation(); $('userMenu').classList.toggle('hidden'); };
  document.addEventListener('click', () => $('userMenu').classList.add('hidden'));
  $('salirTop').onclick = salir;

  // ---------- cambiar contraseña ----------
  function abrirCambiarClave() {
    const m = document.createElement('div');
    m.className = 'cp-modal';
    m.innerHTML = `<div class="cp-dialog" role="dialog" aria-modal="true" aria-label="Cambiar contraseña" style="max-width:440px">
      <header><h2>Cambiar contraseña</h2><button type="button" class="cp-x" data-cerrar aria-label="Cerrar">×</button></header>
      <div class="cp-form"><div class="cp-form-cuerpo">
        <label>Contraseña actual<input id="cpActual" type="password" autocomplete="current-password"></label>
        <label>Nueva contraseña<input id="cpNueva" type="password" autocomplete="new-password" placeholder="8+ caracteres, con letras y números"></label>
        <label>Repite la nueva contraseña<input id="cpNueva2" type="password" autocomplete="new-password"></label>
        <div class="cp-err" id="cpErr" role="alert"></div></div>
        <footer><button type="button" class="cp-btn sec" data-cerrar>Cancelar</button><button type="button" class="cp-btn" id="cpGuardar">Cambiar contraseña</button></footer></div></div>`;
    document.body.appendChild(m);
    const cerrar = () => { m.remove(); document.removeEventListener('keydown', tecla); };
    const tecla = ev => { if (ev.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', tecla);
    m.addEventListener('mousedown', ev => { if (ev.target === m) cerrar(); });
    m.querySelectorAll('[data-cerrar]').forEach(b => b.onclick = cerrar);
    const q = id => m.querySelector('#' + id), err = t => { q('cpErr').textContent = t; };
    q('cpActual').focus();
    q('cpGuardar').onclick = async function () {
      const actual = q('cpActual').value, nueva = q('cpNueva').value;
      if (!actual) return err('Escribe tu contraseña actual');
      if (nueva.length < 8 || !/[A-Za-z]/.test(nueva) || !/\d/.test(nueva)) return err('La nueva contraseña necesita 8+ caracteres, con letras y números');
      if (nueva !== q('cpNueva2').value) return err('Las contraseñas nuevas no coinciden');
      err(''); this.disabled = true;
      try { await api('/auth/cambiar-contrasena', { method: 'POST', body: { actual, nueva } }); cerrar(); toast('Contraseña actualizada'); }
      catch (e) { err(e.message); this.disabled = false; }
    };
  }
  $('clavTop').onclick = abrirCambiarClave;

  $('campana').onclick = () => toast('Aún no tienes notificaciones');
  $('buscar').addEventListener('keydown', e => { if (e.key === 'Enter') toast('La búsqueda estará disponible pronto'); });

  // ---------- menú lateral ----------
  const visibles = MENU.filter(m => m.roles.includes(usuario.rol));
  $('menu').innerHTML = visibles.map(m =>
    `<a class="mi" href="#${m.id}" data-id="${m.id}">${svg(m.i)}<span>${m.t}</span></a>`).join('');
  $('menuInferior').innerHTML =
    `<button class="mi" type="button" id="bConfig">${svg('config')}<span>Configuración</span></button>
     <button class="mi" type="button" id="bAyuda">${svg('ayuda')}<span>Ayuda</span></button>
     <button class="mi" type="button" id="bSalir">${svg('salir')}<span>Cerrar sesión</span></button>`;
  $('bConfig').onclick = () => toast('Configuración estará disponible pronto');
  $('bAyuda').onclick = () => toast('Ayuda estará disponible pronto');
  $('bSalir').onclick = salir;

  // menú móvil
  const cerrarMenu = () => { $('side').classList.remove('open'); $('overlay').classList.remove('show'); };
  $('burger').onclick = () => { $('side').classList.add('open'); $('overlay').classList.add('show'); };
  $('overlay').onclick = cerrarMenu;

  // ---------- vistas ----------
  function vistaInicio() {
    const modulos = visibles.filter(m => m.id !== 'inicio' && m.id !== 'nosotros');
    return '<div class="sn-wrap">' +
      EOD.bannerHTML({
        titulo: '¡Hola, ' + usuario.nombre + '!',
        subtitulo: (ROLES[usuario.rol] || '') + (usuario.institucion ? ' · ' + usuario.institucion : ''),
        texto: 'Bienvenido a EOD. Desde aquí podrás participar en campañas, registrar residuos, ganar puntos y canjearlos por incentivos mientras cuidas el planeta.'
      }) +
      (usuario.autorizacion === 'pendiente'
        ? '<div class="sn-card" style="border-color:#f0d98a;background:#fffaf0;font-size:13.5px">Tu autorización de tratamiento de datos está <b>pendiente</b> de confirmación por tu institución.</div>' : '') +
      '<div><h2 class="sec-titulo" style="margin-top:4px">Módulos</h2><div class="modulos">' +
      modulos.map(m => `<a class="modulo" href="#${m.id}"><div class="ic">${svg(m.i)}</div><b>${m.t}</b>${LISTOS.includes(m.id) ? '' : '<span class="etiqueta">Próximamente</span>'}</a>`).join('') +
      '</div></div></div>';
  }

  function vistaPendiente(m) {
    return '<div class="sn-wrap">' + EOD.bannerHTML({
      titulo: m.t,
      subtitulo: 'EOD - Entidad Organizadora de Desechos',
      texto: 'Este módulo está en construcción. Pronto estará disponible aquí.'
    }) + '</div>';
  }

  function render() {
    const [id, sub] = (location.hash || '#inicio').slice(1).split('/');
    const m = visibles.find(x => x.id === id) || visibles[0];
    document.querySelectorAll('.mi[data-id]').forEach(a => a.classList.toggle('active', a.dataset.id === m.id));
    document.title = m.t + ' · EOD';
    const v = $('vista');
    if (m.id === 'nosotros') EOD.renderNosotros(v);
    else if (m.id === 'inicio') v.innerHTML = vistaInicio();
    else if (m.id === 'campanas') EODCampanas.render(v, { usuario, api, toast, sub });
    else if (m.id === 'grupos') EODGrupos.render(v, { usuario, api, toast, sub });
    else if (m.id === 'instituciones') EODInstituciones.render(v, { usuario, api, toast });
    else if (m.id === 'residuos') EODResiduos.render(v, { usuario, api, toast, sub });
    else if (m.id === 'gamificacion') EODGamificacion.render(v, { usuario, api, toast });
    else if (m.id === 'incentivos') EODIncentivos.render(v, { usuario, api, toast, sub });
    else if (m.id === 'informes') EODInformes.render(v, { usuario, api, toast });
    else if (m.id === 'calculadora') EODCalculadora.render(v, { usuario, api, toast });
    else v.innerHTML = vistaPendiente(m);
    window.scrollTo(0, 0);
    cerrarMenu();
  }
  window.addEventListener('hashchange', render);
  render();
})();
