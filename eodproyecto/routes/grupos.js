const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requiereAuth, requiereRol } = require('../middleware/auth');

const router = express.Router();
router.use(requiereAuth, requiereRol('administrador', 'docente'));
const SOLO_ADMIN = requiereRol('administrador');

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Administrador: todos los grupos de su institución · docente: solo los suyos
function filtroGrupos(u) {
  if (u.rol === 'administrador') return { sql: '', params: [] };
  return { sql: ' AND g.nGrupoID IN (SELECT nGrupoFK FROM tDocenteGrupo WHERE nUsuarioFK = ?)', params: [u.id] };
}

async function grupoVisible(id, u) {
  const f = filtroGrupos(u);
  const [r] = await pool.query(
    `SELECT g.nGrupoID AS id, g.cNombre AS nombre, g.nAnio AS anio, s.cNombre AS sede
       FROM tGrupo g JOIN tSede s ON s.nSedeID = g.nSedeFK
      WHERE g.nGrupoID = ? AND s.nInstitucionFK = ?${f.sql}`, [id, u.inst, ...f.params]);
  return r[0] || null;
}

function idParam(req, res, nombre = 'id') {
  const id = Number(req.params[nombre]);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ ok: false, error: 'Identificador inválido' }); return null; }
  return id;
}

function errorDB(e, res, next) {
  if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'Ese correo ya está registrado' });
  if (e.sqlState === '45000') return res.status(400).json({ ok: false, error: e.sqlMessage }); // mensajes de los triggers
  if (e.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ ok: false, error: 'Alguno de los grupos no existe' });
  next(e);
}

// ====================================================================
//  DOCENTES Y ADMINISTRADORES (solo administrador)
//  Se declaran primero para que '/docentes' no choque con '/:id/...'
// ====================================================================

// GET /api/grupos/docentes
router.get('/docentes', SOLO_ADMIN, async (req, res, next) => {
  try {
    const inst = req.usuario.inst;
    const [us] = await pool.query(
      `SELECT nUsuarioID AS id, cNombre AS nombre, cApellido AS apellido, cCorreo AS correo, eRol AS rol, lActivo AS activo
         FROM tUsuario WHERE nInstitucionFK = ? AND eRol IN ('docente', 'administrador')
        ORDER BY FIELD(eRol, 'administrador', 'docente'), cNombre`, [inst]);
    const [gs] = await pool.query(
      `SELECT dg.nUsuarioFK AS uid, g.nGrupoID AS id, g.cNombre AS nombre
         FROM tDocenteGrupo dg JOIN tGrupo g ON g.nGrupoID = dg.nGrupoFK JOIN tSede s ON s.nSedeID = g.nSedeFK
        WHERE s.nInstitucionFK = ? ORDER BY g.cNombre`, [inst]);
    const usuarios = us.map(u => ({
      id: u.id, nombre: u.nombre, apellido: u.apellido, correo: u.correo, rol: u.rol, activo: !!u.activo,
      grupos: gs.filter(g => g.uid === u.id).map(g => ({ id: g.id, nombre: g.nombre }))
    }));
    res.json({ ok: true, usuarios });
  } catch (e) { next(e); }
});

// POST /api/grupos/docentes   { nombre, apellido, correo, contrasena, rol, grupoIds? }
router.post('/docentes', SOLO_ADMIN, async (req, res, next) => {
  const b = req.body || {};
  const t = v => (typeof v === 'string' ? v.trim() : '');
  const nombre = t(b.nombre), apellido = t(b.apellido), correo = t(b.correo).toLowerCase();
  const rol = b.rol === 'administrador' ? 'administrador' : 'docente';
  if (nombre.length < 2 || nombre.length > 100) return res.status(400).json({ ok: false, error: 'Escribe el nombre' });
  if (apellido.length < 2 || apellido.length > 100) return res.status(400).json({ ok: false, error: 'Escribe el apellido' });
  if (!RE_CORREO.test(correo) || correo.length > 150) return res.status(400).json({ ok: false, error: 'Correo electrónico inválido' });
  const c = b.contrasena;
  if (typeof c !== 'string' || c.length < 8 || c.length > 72 || !/[A-Za-z]/.test(c) || !/\d/.test(c)) {
    return res.status(400).json({ ok: false, error: 'La contraseña necesita 8+ caracteres, con letras y números' });
  }
  const grupoIds = rol === 'docente' && Array.isArray(b.grupoIds) ? [...new Set(b.grupoIds.map(Number))] : [];
  if (grupoIds.some(g => !Number.isInteger(g) || g < 1)) return res.status(400).json({ ok: false, error: 'Grupo inválido' });

  const conn = await pool.getConnection();
  try {
    const hash = await bcrypt.hash(c, 10);
    await conn.beginTransaction();
    const [r] = await conn.query(
      'INSERT INTO tUsuario (nInstitucionFK, cNombre, cApellido, cCorreo, cContrasenaHash, eRol) VALUES (?, ?, ?, ?, ?, ?)',
      [req.usuario.inst, nombre, apellido, correo, hash, rol]);
    for (const g of grupoIds) {
      await conn.query('INSERT INTO tDocenteGrupo (nUsuarioFK, nGrupoFK) VALUES (?, ?)', [r.insertId, g]);
    }
    await conn.commit();
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    await conn.rollback();
    errorDB(e, res, next);
  } finally { conn.release(); }
});

// PUT /api/grupos/docentes/:uid/grupos   { grupoIds: [..] }  (reemplaza la lista completa)
router.put('/docentes/:uid/grupos', SOLO_ADMIN, async (req, res, next) => {
  const uid = idParam(req, res, 'uid'); if (uid === null) return;
  const ids = Array.isArray((req.body || {}).grupoIds) ? [...new Set(req.body.grupoIds.map(Number))] : null;
  if (!ids || ids.some(g => !Number.isInteger(g) || g < 1)) return res.status(400).json({ ok: false, error: 'Lista de grupos inválida' });
  let conn;
  try {
    const [d] = await pool.query("SELECT 1 FROM tUsuario WHERE nUsuarioID = ? AND nInstitucionFK = ? AND eRol = 'docente'", [uid, req.usuario.inst]);
    if (!d.length) return res.status(404).json({ ok: false, error: 'Docente no encontrado' });
    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.query('DELETE FROM tDocenteGrupo WHERE nUsuarioFK = ?', [uid]);
    for (const g of ids) await conn.query('INSERT INTO tDocenteGrupo (nUsuarioFK, nGrupoFK) VALUES (?, ?)', [uid, g]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    if (conn) await conn.rollback();
    errorDB(e, res, next);
  } finally { if (conn) conn.release(); }
});

// PUT /api/grupos/docentes/:uid/activo   { activo: true|false }
router.put('/docentes/:uid/activo', SOLO_ADMIN, async (req, res, next) => {
  try {
    const uid = idParam(req, res, 'uid'); if (uid === null) return;
    if (uid === req.usuario.id) return res.status(400).json({ ok: false, error: 'No puedes desactivar tu propia cuenta' });
    const activo = (req.body || {}).activo === true ? 1 : 0;
    const [r] = await pool.query(
      "UPDATE tUsuario SET lActivo = ? WHERE nUsuarioID = ? AND nInstitucionFK = ? AND eRol IN ('docente', 'administrador')",
      [activo, uid, req.usuario.inst]);
    if (!r.affectedRows) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ====================================================================
//  GRUPOS Y ESTUDIANTES (administrador y docente)
// ====================================================================

// GET /api/grupos
router.get('/', async (req, res, next) => {
  try {
    const u = req.usuario, f = filtroGrupos(u);
    const [rows] = await pool.query(
      `SELECT g.nGrupoID AS id, g.cNombre AS nombre, g.nAnio AS anio, s.cNombre AS sede,
        (SELECT COUNT(*) FROM tEstudiante e WHERE e.nGrupoFK = g.nGrupoID) AS estudiantes,
        (SELECT COUNT(*) FROM tEstudiante e WHERE e.nGrupoFK = g.nGrupoID AND e.eEstadoAutorizacion = 'autorizada') AS autorizados,
        (SELECT COUNT(*) FROM tEstudiante e WHERE e.nGrupoFK = g.nGrupoID AND e.eEstadoAutorizacion = 'pendiente') AS pendientes,
        (SELECT GROUP_CONCAT(CONCAT(du.cNombre, ' ', du.cApellido) ORDER BY du.cNombre SEPARATOR ', ')
           FROM tDocenteGrupo dg JOIN tUsuario du ON du.nUsuarioID = dg.nUsuarioFK WHERE dg.nGrupoFK = g.nGrupoID) AS docentes
         FROM tGrupo g JOIN tSede s ON s.nSedeID = g.nSedeFK
        WHERE s.nInstitucionFK = ?${f.sql}
        ORDER BY g.nAnio DESC, g.cNombre`, [u.inst, ...f.params]);
    res.json({
      ok: true,
      grupos: rows.map(g => ({
        id: g.id, nombre: g.nombre, anio: g.anio, sede: g.sede,
        estudiantes: Number(g.estudiantes), autorizados: Number(g.autorizados), pendientes: Number(g.pendientes),
        docentes: g.docentes || ''
      }))
    });
  } catch (e) { next(e); }
});

// GET /api/grupos/:id/estudiantes
router.get('/:id/estudiantes', async (req, res, next) => {
  try {
    const id = idParam(req, res); if (id === null) return;
    const grupo = await grupoVisible(id, req.usuario);
    if (!grupo) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });
    const [rows] = await pool.query(
      `SELECT e.nEstudianteID AS id, u.cNombre AS nombre, u.cApellido AS apellido, u.cCorreo AS correo,
              e.cDocumento AS documento, e.eEstadoAutorizacion AS autorizacion,
              DATE_FORMAT(e.dFechaAutorizacion, '%Y-%m-%d') AS fechaAutorizacion
         FROM tEstudiante e JOIN tUsuario u ON u.nUsuarioID = e.nUsuarioFK
        WHERE e.nGrupoFK = ? ORDER BY u.cApellido, u.cNombre`, [id]);
    res.json({ ok: true, grupo, estudiantes: rows });
  } catch (e) { next(e); }
});

// POST /api/grupos/:id/autorizar-todos   (autoriza a los que están 'pendiente'; no toca a los 'revocada')
router.post('/:id/autorizar-todos', async (req, res, next) => {
  try {
    const id = idParam(req, res); if (id === null) return;
    const grupo = await grupoVisible(id, req.usuario);
    if (!grupo) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });
    const [r] = await pool.query(
      `UPDATE tEstudiante SET eEstadoAutorizacion = 'autorizada', dFechaAutorizacion = CURDATE()
        WHERE nGrupoFK = ? AND eEstadoAutorizacion = 'pendiente'`, [id]);
    res.json({ ok: true, autorizados: r.affectedRows });
  } catch (e) { next(e); }
});

// POST /api/grupos/estudiantes/:eid/autorizacion   { estado: 'autorizada' | 'revocada' | 'pendiente' }
router.post('/estudiantes/:eid/autorizacion', async (req, res, next) => {
  try {
    const eid = idParam(req, res, 'eid'); if (eid === null) return;
    const estado = (req.body || {}).estado;
    if (!['autorizada', 'revocada', 'pendiente'].includes(estado)) return res.status(400).json({ ok: false, error: 'Estado inválido' });
    const u = req.usuario, f = filtroGrupos(u);
    const [r] = await pool.query(
      `SELECT e.nEstudianteID FROM tEstudiante e JOIN tGrupo g ON g.nGrupoID = e.nGrupoFK JOIN tSede s ON s.nSedeID = g.nSedeFK
        WHERE e.nEstudianteID = ? AND s.nInstitucionFK = ?${f.sql}`, [eid, u.inst, ...f.params]);
    if (!r.length) return res.status(404).json({ ok: false, error: 'Estudiante no encontrado' });
    await pool.query(
      "UPDATE tEstudiante SET eEstadoAutorizacion = ?, dFechaAutorizacion = IF(? = 'autorizada', CURDATE(), NULL) WHERE nEstudianteID = ?",
      [estado, estado, eid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
