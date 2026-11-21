(() => {
  const $ = id => document.getElementById(id);
  const API = '/api';

  // ---------- utilidades ----------
  function toast(texto) {
    const t = $('toast');
    t.textContent = texto;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  async function api(ruta, opciones = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const tk = leerToken();
    if (tk) headers.Authorization = 'Bearer ' + tk;
    let r;
    try {
      r = await fetch(API + ruta, { ...opciones, headers });
    } catch {
      throw new Error('No hay conexión con el servidor');
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) throw new Error(data.error || 'Error inesperado');
    return data;
  }

  const leerToken = () => localStorage.getItem('eod_token') || sessionStorage.getItem('eod_token');
  function guardarToken(token, recordar) {
    localStorage.removeItem('eod_token'); sessionStorage.removeItem('eod_token');
    (recordar ? localStorage : sessionStorage).setItem('eod_token', token);
  }
  function borrarToken() { localStorage.removeItem('eod_token'); sessionStorage.removeItem('eod_token'); }

  function mostrarMsg(id, texto, ok = false) {
    const el = $(id);
    el.textContent = texto || '';
    el.classList.toggle('ok', ok);
  }

  // ---------- pestañas ----------
  function ir(vista) {
    const login = vista === 'login', reg = vista === 'registro', ses = vista === 'sesion';
    $('formLogin').classList.toggle('hidden', !login);
    $('formRegistro').classList.toggle('hidden', !reg);
    $('vistaSesion').classList.toggle('hidden', !ses);
    $('tabLogin').classList.toggle('active', login);
    $('tabRegistro').classList.toggle('active', reg);
    $('tabLogin').setAttribute('aria-selected', login);
    $('tabRegistro').setAttribute('aria-selected', reg);
    document.querySelector('.tabs').classList.toggle('hidden', ses);
    document.querySelector('.tabs').dataset.vista = reg ? 'registro' : 'login';
    mostrarMsg('msgLogin', ''); mostrarMsg('msgRegistro', '');
  }
  $('tabLogin').onclick = () => ir('login');
  $('tabRegistro').onclick = () => ir('registro');
  document.querySelectorAll('[data-goto]').forEach(a =>
    a.addEventListener('click', e => { e.preventDefault(); ir(a.dataset.goto); }));
  $('olvide').addEventListener('click', e => { e.preventDefault(); toast('La recuperación de contraseña estará disponible pronto'); });
  $('navUser').onclick = () => { if (leerToken()) location.href = 'app.html'; else ir('login'); };

  // mostrar / ocultar contraseña
  document.querySelectorAll('[data-eye]').forEach(btn => btn.addEventListener('click', () => {
    const inp = $(btn.dataset.eye);
    const ver = inp.type === 'password';
    inp.type = ver ? 'text' : 'password';
    btn.classList.toggle('on', ver);
  }));

  // ---------- catálogo (institución -> grupos) ----------
  async function cargarInstituciones() {
    const sel = $('rInstitucion');
    try {
      const { instituciones } = await api('/catalogo/instituciones');
      sel.innerHTML = '<option value="">Selecciona tu institución</option>' +
        instituciones.map(i => `<option value="${i.id}">${esc(i.nombre)}</option>`).join('');
      if (instituciones.length === 1) { sel.value = instituciones[0].id; cargarGrupos(); }
    } catch {
      sel.innerHTML = '<option value="">No se pudo cargar</option>';
    }
  }
  async function cargarGrupos() {
    const sel = $('rGrupo'), inst = $('rInstitucion').value;
    sel.disabled = true;
    if (!inst) { sel.innerHTML = '<option value="">Primero elige tu institución</option>'; return; }
    try {
      const { grupos } = await api('/catalogo/grupos?institucionId=' + encodeURIComponent(inst));
      sel.innerHTML = grupos.length
        ? '<option value="">Selecciona tu grupo</option>' + grupos.map(g => `<option value="${g.id}">${esc(g.nombre)} · ${esc(g.sede)} (${g.anio})</option>`).join('')
        : '<option value="">Esta institución aún no tiene grupos</option>';
      sel.disabled = !grupos.length;
    } catch { sel.innerHTML = '<option value="">No se pudo cargar</option>'; }
  }
  $('rInstitucion').addEventListener('change', () => { cargarGrupos().then(() => { if (tocados.has('rGrupo')) validar('rGrupo'); }); });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- validación en vivo ----------
  const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const REQ_CLAVE = {
    len: v => v.length >= 8,
    let: v => /[A-Za-z]/.test(v),
    num: v => /\d/.test(v)
  };
  // cada regla devuelve '' si es válido o el mensaje de error
  const REGLAS = {
    lCorreo:      v => !v ? 'Escribe tu correo' : !RE_CORREO.test(v) ? 'Correo electrónico inválido' : '',
    lClave:       v => !v ? 'Escribe tu contraseña' : '',
    rNombre:      v => !v.trim() ? 'Escribe tu nombre' : '',
    rApellido:    v => !v.trim() ? 'Escribe tu apellido' : '',
    rCorreo:      v => !v ? 'Escribe tu correo' : !RE_CORREO.test(v) ? 'Correo electrónico inválido' : '',
    rDocumento:   v => !v ? 'Escribe tu documento' : !/^\d{4,20}$/.test(v) ? 'Solo números, entre 4 y 20 dígitos' : '',
    rInstitucion: v => !v ? 'Selecciona tu institución' : '',
    rGrupo:       v => !v ? 'Selecciona tu grupo' : '',
    rClave:       v => !v ? 'Crea una contraseña' : !Object.values(REQ_CLAVE).every(f => f(v)) ? 'Debe tener 8+ caracteres, con letras y números' : '',
    rClave2:      v => !v ? 'Repite la contraseña' : v !== $('rClave').value ? 'Las contraseñas no coinciden' : ''
  };
  const tocados = new Set();

  function validar(id, mostrar) {
    const inp = $(id), campo = inp.closest('.field');
    const err = REGLAS[id](inp.value);
    if (mostrar || tocados.has(id)) {
      tocados.add(id);
      campo.classList.toggle('error', !!err);
      campo.classList.toggle('valid', !err);
      let h = campo.parentNode.querySelector(`.hint[data-for="${id}"]`);
      if (!h) {
        h = document.createElement('p'); h.className = 'hint'; h.dataset.for = id; h.setAttribute('role', 'alert');
        campo.insertAdjacentElement('afterend', h);
        // en la contraseña el medidor va justo debajo del campo; el aviso queda entre ambos
      }
      h.textContent = err;
    }
    return !err;
  }

  function fuerzaClave() {
    const v = $('rClave').value, caja = $('fuerza');
    caja.hidden = !v;
    if (!v) return;
    const ok = Object.fromEntries(Object.entries(REQ_CLAVE).map(([k, f]) => [k, f(v)]));
    document.querySelectorAll('#reqs li').forEach(li => li.classList.toggle('ok', ok[li.dataset.req]));
    let n = 1, txt = 'Débil';
    if (Object.values(ok).every(Boolean)) {
      // cumple lo mínimo; sube de nivel con mayúsculas+minúsculas, símbolos y longitud ≥ 12
      const extra = [/[a-z]/.test(v) && /[A-Z]/.test(v), /[^A-Za-z0-9]/.test(v), v.length >= 12].filter(Boolean).length;
      [n, txt] = extra === 0 ? [2, 'Aceptable'] : extra === 1 ? [3, 'Buena'] : [4, 'Fuerte'];
    }
    caja.dataset.n = n;
    $('fuerzaTxt').textContent = 'Seguridad: ' + txt + (n > 1 && n < 4 ? ' · añade mayúsculas o símbolos' : '');
  }

  Object.keys(REGLAS).forEach(id => {
    const inp = $(id);
    inp.addEventListener('blur', () => validar(id, true));
    inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (id === 'rDocumento') inp.value = inp.value.replace(/\D/g, '');   // solo números mientras escribe
      validar(id);
      if (id === 'rClave') { fuerzaClave(); if (tocados.has('rClave2')) validar('rClave2'); }
    });
  });
  $('rAcepta').addEventListener('change', () => { if ($('rAcepta').checked) mostrarMsg('msgRegistro', ''); });

  // valida un grupo de campos, enfoca el primero con error y devuelve si todo está bien
  function validarGrupo(ids) {
    let primero = null;
    ids.forEach(id => { if (!validar(id, true) && !primero) primero = id; });
    if (primero) $(primero).focus();
    return !primero;
  }

  // ---------- login ----------
  $('formLogin').addEventListener('submit', async e => {
    e.preventDefault();
    const correo = $('lCorreo').value.trim(), contrasena = $('lClave').value;
    if (!validarGrupo(['lCorreo', 'lClave'])) return mostrarMsg('msgLogin', '');
    const btn = $('btnLogin'); btn.disabled = true;
    try {
      const d = await api('/auth/login', { method: 'POST', body: JSON.stringify({ correo, contrasena }) });
      guardarToken(d.token, $('lRecordar').checked);
      mostrarSesion(d.usuario);
    } catch (err) { mostrarMsg('msgLogin', err.message); }
    finally { btn.disabled = false; }
  });

  // ---------- registro ----------
  $('formRegistro').addEventListener('submit', async e => {
    e.preventDefault();
    const doc = $('rDocumento').value.trim();
    const datos = {
      nombre: $('rNombre').value.trim(),
      apellido: $('rApellido').value.trim(),
      correo: $('rCorreo').value.trim(),
      documento: doc,
      institucionId: Number($('rInstitucion').value),
      grupoId: Number($('rGrupo').value),
      acepta: $('rAcepta').checked
    };
    // validación en el cliente (el servidor vuelve a validar)
    if (!validarGrupo(['rNombre', 'rApellido', 'rCorreo', 'rDocumento', 'rInstitucion', 'rGrupo', 'rClave', 'rClave2']))
      return mostrarMsg('msgRegistro', 'Revisa los campos marcados en rojo');
    const c1 = $('rClave').value;
    datos.contrasena = c1;
    if (!datos.acepta) return mostrarMsg('msgRegistro', 'Debes aceptar el tratamiento de datos');

    const btn = $('btnRegistro'); btn.disabled = true;
    try {
      const d = await api('/auth/registro', { method: 'POST', body: JSON.stringify(datos) });
      guardarToken(d.token, false);
      mostrarSesion(d.usuario, true);
    } catch (err) { mostrarMsg('msgRegistro', err.message); }
    finally { btn.disabled = false; }
  });

  // ---------- sesión ----------
  // Con sesión iniciada se entra al panel
  function mostrarSesion() { location.href = 'app.html'; }
  $('btnSalir').onclick = () => { borrarToken(); ir('login'); toast('Sesión cerrada'); };

  async function restaurarSesion() {
    if (!leerToken()) return;
    try { const d = await api('/auth/me'); mostrarSesion(d.usuario); }
    catch { borrarToken(); }
  }

  // ---------- arranque ----------
  cargarInstituciones();
  restaurarSesion();
  if (location.hash === '#registro') ir('registro');
})();
