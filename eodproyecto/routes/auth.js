const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requiereAuth } = require('../middleware/auth');

const router = express.Router();

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HASH_FALSO = bcrypt.hashSync('relleno-para-igualar-tiempos', 10);

// ---------- utilidades ----------
function firmarSesion(u) {
  return jwt.sign({ id: u.nUsuarioID, rol: u.eRol, inst: u.nInstitucionFK },
    process.env.JWT_SECRET, { expiresIn: '8h' });
}

function datosPublicos(u, estudiante) {
  return {
    id: u.nUsuarioID,
    nombre: u.cNombre,
    apellido: u.cApellido,
    correo: u.cCorreo,
    rol: u.eRol,
    institucionId: u.nInstitucionFK,
    estudianteId: estudiante ? estudiante.nEstudianteID : null,
    autorizacion: estudiante ? estudiante.eEstadoAutorizacion : null
  };
}

// Igual que datosPublicos pero agrega el nombre de la institución (para la barra superior)
async function usuarioCompleto(u, estudiante) {
  const [r] = await pool.query('SELECT cNombre FROM tInstitucion WHERE nInstitucionID = ?', [u.nInstitucionFK]);
  return { ...datosPublicos(u, estudiante), institucion: r[0] ? r[0].cNombre : '' };
}

async function cargarEstudiante(usuarioId) {
  const [r] = await pool.query(
    'SELECT nEstudianteID, eEstadoAutorizacion FROM tEstudiante WHERE nUsuarioFK = ?', [usuarioId]);
  return r[0] || null;
}

// Limitador simple en memoria: máx. 10 intentos de login por IP cada 15 min
const intentos = new Map();
function limitarLogin(req, res, next) {
  const ahora = Date.now(), ventana = 15 * 60 * 1000;
  const reg = (intentos.get(req.ip) || []).filter(t => ahora - t < ventana);
  if (reg.length >= 10) {
    return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera unos minutos.' });
  }
  reg.push(ahora);
  intentos.set(req.ip, reg);
  next();
}

// Valida los campos comunes del registro; devuelve texto de error o null
function validarRegistro(b) {
  const t = v => (typeof v === 'string' ? v.trim() : '');
  if (t(b.nombre).length < 2 || t(b.nombre).length > 100) return 'Escribe tu nombre';
  if (t(b.apellido).length < 2 || t(b.apellido).length > 100) return 'Escribe tu apellido';
  if (!RE_CORREO.test(t(b.correo)) || t(b.correo).length > 150) return 'Correo electrónico inválido';
  {
    if (typeof b.contrasena !== 'string' || b.contrasena.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
    if (b.contrasena.length > 72) return 'La contraseña es demasiado larga (máx. 72)';
    if (!/[A-Za-z]/.test(b.contrasena) || !/\d/.test(b.contrasena)) return 'La contraseña debe incluir letras y números';
  }
  if (!/^\d{4,20}$/.test(t(b.documento))) return 'Documento inválido (solo números, 4 a 20 dígitos)';
  if (!Number.isInteger(Number(b.institucionId)) || Number(b.institucionId) < 1) return 'Selecciona tu institución';
  if (!Number.isInteger(Number(b.grupoId)) || Number(b.grupoId) < 1) return 'Selecciona tu grupo';
  if (b.acepta !== true) return 'Debes aceptar el tratamiento de datos (Ley 1581)';
  return null;
}

// Crea usuario + estudiante en UNA transacción. Devuelve { usuario, estudiante }.
async function crearEstudiante(b, hash) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ru] = await conn.query(
      `INSERT INTO tUsuario (nInstitucionFK, cNombre, cApellido, cCorreo, cContrasenaHash, eRol)
       VALUES (?, ?, ?, ?, ?, 'estudiante')`,
      [Number(b.institucionId), b.nombre.trim(), b.apellido.trim(), b.correo.trim().toLowerCase(), hash]);
    // El trigger valida rol e institución del grupo; la autorización del acudiente queda 'pendiente'
    const [re] = await conn.query(
      'INSERT INTO tEstudiante (nUsuarioFK, nGrupoFK, cDocumento) VALUES (?, ?, ?)',
      [ru.insertId, Number(b.grupoId), b.documento.trim()]);
    await conn.commit();
    const [u] = await pool.query('SELECT * FROM tUsuario WHERE nUsuarioID = ?', [ru.insertId]);
    return { usuario: u[0], estudiante: { nEstudianteID: re.insertId, eEstadoAutorizacion: 'pendiente' } };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Traduce errores de MySQL a mensajes claros
function responderErrorDB(e, res, next) {
  if (e.code === 'ER_DUP_ENTRY') {
    if (/cCorreo/.test(e.message)) return res.status(409).json({ ok: false, error: 'Ese correo ya está registrado' });
    if (/cDocumento/.test(e.message)) return res.status(409).json({ ok: false, error: 'Ese documento ya está registrado' });
    return res.status(409).json({ ok: false, error: 'La cuenta ya existe' });
  }
  if (e.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ ok: false, error: 'Institución o grupo inexistente' });
  if (e.sqlState === '45000') return res.status(400).json({ ok: false, error: e.sqlMessage }); // mensajes de los triggers
  next(e);
}

// ---------- POST /api/auth/registro ----------
router.post('/registro', async (req, res, next) => {
  const b = req.body || {};
  const err = validarRegistro(b);
  if (err) return res.status(400).json({ ok: false, error: err });
  try {
    const hash = await bcrypt.hash(b.contrasena, 10);
    const { usuario, estudiante } = await crearEstudiante(b, hash);
    res.status(201).json({ ok: true, token: firmarSesion(usuario), usuario: await usuarioCompleto(usuario, estudiante) });
  } catch (e) { responderErrorDB(e, res, next); }
});

// ---------- POST /api/auth/login ----------
router.post('/login', limitarLogin, async (req, res, next) => {
  try {
    const correo = String((req.body || {}).correo || '').trim().toLowerCase();
    const contrasena = String((req.body || {}).contrasena || '');
    if (!correo || !contrasena) return res.status(400).json({ ok: false, error: 'Escribe correo y contraseña' });

    const [rows] = await pool.query('SELECT * FROM tUsuario WHERE cCorreo = ?', [correo]);
    const u = rows[0];
    // Se compara siempre contra un hash para no revelar si el correo existe
    const ok = await bcrypt.compare(contrasena, (u && u.cContrasenaHash) || HASH_FALSO);
    if (!u || !ok) {
      return res.status(401).json({ ok: false, error: 'Correo o contraseña incorrectos' });
    }
    if (!u.lActivo) return res.status(403).json({ ok: false, error: 'Tu cuenta está desactivada' });

    const est = u.eRol === 'estudiante' ? await cargarEstudiante(u.nUsuarioID) : null;
    res.json({ ok: true, token: firmarSesion(u), usuario: await usuarioCompleto(u, est) });
  } catch (e) { next(e); }
});

// ---------- GET /api/auth/me ----------
router.get('/me', requiereAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tUsuario WHERE nUsuarioID = ?', [req.usuario.id]);
    const u = rows[0];
    if (!u || !u.lActivo) return res.status(401).json({ ok: false, error: 'Sesión inválida' });
    const est = u.eRol === 'estudiante' ? await cargarEstudiante(u.nUsuarioID) : null;
    res.json({ ok: true, usuario: await usuarioCompleto(u, est) });
  } catch (e) { next(e); }
});

// ---------- POST /api/auth/cambiar-contrasena ----------
// Responde 400 (no 401) si la contraseña actual es incorrecta, para no cerrar la sesión del usuario.
router.post('/cambiar-contrasena', requiereAuth, limitarLogin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const actual = typeof b.actual === 'string' ? b.actual : '';
    const nueva = typeof b.nueva === 'string' ? b.nueva : '';
    if (!actual) return res.status(400).json({ ok: false, error: 'Escribe tu contraseña actual' });
    if (nueva.length < 8) return res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    if (nueva.length > 72) return res.status(400).json({ ok: false, error: 'La nueva contraseña es demasiado larga (máx. 72)' });
    if (!/[A-Za-z]/.test(nueva) || !/\d/.test(nueva)) return res.status(400).json({ ok: false, error: 'La nueva contraseña debe incluir letras y números' });
    if (nueva === actual) return res.status(400).json({ ok: false, error: 'La nueva contraseña debe ser distinta de la actual' });

    const [rows] = await pool.query('SELECT cContrasenaHash FROM tUsuario WHERE nUsuarioID = ?', [req.usuario.id]);
    if (!rows[0] || !(await bcrypt.compare(actual, rows[0].cContrasenaHash))) {
      return res.status(400).json({ ok: false, error: 'La contraseña actual no es correcta' });
    }
    await pool.query('UPDATE tUsuario SET cContrasenaHash = ? WHERE nUsuarioID = ?', [await bcrypt.hash(nueva, 10), req.usuario.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
