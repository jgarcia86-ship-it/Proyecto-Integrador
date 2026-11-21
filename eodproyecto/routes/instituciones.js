const express = require('express');
const pool = require('../db');
const { requiereAuth, requiereRol } = require('../middleware/auth');

// Cada administrador gestiona la institución a la que pertenece (no crea instituciones nuevas).
const router = express.Router();
router.use(requiereAuth, requiereRol('administrador'));

const t = v => (typeof v === 'string' ? v.trim() : '');
const RE_TEL = /^[0-9+()\-\s]{0,20}$/;

function idParam(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ ok: false, error: 'Identificador inválido' }); return null; }
  return id;
}
const mal = (res, error) => res.status(400).json({ ok: false, error });

async function sedeDeInstitucion(id, inst) {
  const [r] = await pool.query('SELECT nSedeID FROM tSede WHERE nSedeID = ? AND nInstitucionFK = ?', [id, inst]);
  return r.length > 0;
}
async function grupoDeInstitucion(id, inst) {
  const [r] = await pool.query(
    `SELECT g.nGrupoID FROM tGrupo g JOIN tSede s ON s.nSedeID = g.nSedeFK
      WHERE g.nGrupoID = ? AND s.nInstitucionFK = ?`, [id, inst]);
  return r.length > 0;
}

// ---------- GET /api/instituciones/mi ----------
router.get('/mi', async (req, res, next) => {
  try {
    const inst = req.usuario.inst;
    const [i] = await pool.query(
      'SELECT nInstitucionID AS id, cNombre AS nombre, cDireccion AS direccion, cTelefono AS telefono FROM tInstitucion WHERE nInstitucionID = ?', [inst]);
    if (!i.length) return res.status(404).json({ ok: false, error: 'Institución no encontrada' });
    const [s] = await pool.query(
      'SELECT nSedeID AS id, cNombre AS nombre, cDireccion AS direccion, lActiva AS activa FROM tSede WHERE nInstitucionFK = ? ORDER BY cNombre', [inst]);
    const [g] = await pool.query(
      `SELECT g.nGrupoID AS id, g.nSedeFK AS sedeId, g.cNombre AS nombre, g.nAnio AS anio,
              (SELECT COUNT(*) FROM tEstudiante e WHERE e.nGrupoFK = g.nGrupoID) AS estudiantes
         FROM tGrupo g JOIN tSede s ON s.nSedeID = g.nSedeFK
        WHERE s.nInstitucionFK = ? ORDER BY g.nAnio DESC, g.cNombre`, [inst]);
    res.json({
      ok: true,
      institucion: i[0],
      sedes: s.map(x => ({
        id: x.id, nombre: x.nombre, direccion: x.direccion || '', activa: !!x.activa,
        grupos: g.filter(y => y.sedeId === x.id).map(y => ({ id: y.id, nombre: y.nombre, anio: y.anio, estudiantes: Number(y.estudiantes) }))
      }))
    });
  } catch (e) { next(e); }
});

// ---------- PUT /api/instituciones/mi ----------
router.put('/mi', async (req, res, next) => {
  try {
    const b = req.body || {};
    const nombre = t(b.nombre), direccion = t(b.direccion), telefono = t(b.telefono);
    if (nombre.length < 3 || nombre.length > 150) return mal(res, 'El nombre debe tener entre 3 y 150 caracteres');
    if (direccion.length > 200) return mal(res, 'La dirección es demasiado larga (máx. 200)');
    if (!RE_TEL.test(telefono)) return mal(res, 'Teléfono inválido (solo números, +, - y paréntesis; máx. 20)');
    await pool.query('UPDATE tInstitucion SET cNombre = ?, cDireccion = ?, cTelefono = ? WHERE nInstitucionID = ?',
      [nombre, direccion || null, telefono || null, req.usuario.inst]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'Ya existe una institución con ese nombre' });
    next(e);
  }
});

// ---------- POST /api/instituciones/sedes ----------
router.post('/sedes', async (req, res, next) => {
  try {
    const b = req.body || {};
    const nombre = t(b.nombre), direccion = t(b.direccion);
    if (nombre.length < 2 || nombre.length > 150) return mal(res, 'El nombre de la sede debe tener entre 2 y 150 caracteres');
    if (direccion.length > 200) return mal(res, 'La dirección es demasiado larga (máx. 200)');
    const [r] = await pool.query('INSERT INTO tSede (nInstitucionFK, cNombre, cDireccion) VALUES (?, ?, ?)',
      [req.usuario.inst, nombre, direccion || null]);
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'Ya existe una sede con ese nombre' });
    next(e);
  }
});

// ---------- PUT /api/instituciones/sedes/:id  (nombre, dirección y activa) ----------
// Una sede inactiva deja de aparecer en el registro de estudiantes; sus datos se conservan.
router.put('/sedes/:id', async (req, res, next) => {
  try {
    const id = idParam(req, res); if (id === null) return;
    const b = req.body || {};
    const nombre = t(b.nombre), direccion = t(b.direccion);
    if (nombre.length < 2 || nombre.length > 150) return mal(res, 'El nombre de la sede debe tener entre 2 y 150 caracteres');
    if (direccion.length > 200) return mal(res, 'La dirección es demasiado larga (máx. 200)');
    if (typeof b.activa !== 'boolean') return mal(res, 'Estado inválido');
    if (!(await sedeDeInstitucion(id, req.usuario.inst))) return res.status(404).json({ ok: false, error: 'Sede no encontrada' });
    await pool.query('UPDATE tSede SET cNombre = ?, cDireccion = ?, lActiva = ? WHERE nSedeID = ?',
      [nombre, direccion || null, b.activa ? 1 : 0, id]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'Ya existe una sede con ese nombre' });
    next(e);
  }
});

// ---------- POST /api/instituciones/sedes/:id/grupos ----------
router.post('/sedes/:id/grupos', async (req, res, next) => {
  try {
    const id = idParam(req, res); if (id === null) return;
    const nombre = t((req.body || {}).nombre), anio = Number((req.body || {}).anio);
    if (nombre.length < 1 || nombre.length > 100) return mal(res, 'El nombre del grupo es obligatorio (máx. 100)');
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return mal(res, 'Año inválido');
    if (!(await sedeDeInstitucion(id, req.usuario.inst))) return res.status(404).json({ ok: false, error: 'Sede no encontrada' });
    const [r] = await pool.query('INSERT INTO tGrupo (nSedeFK, cNombre, nAnio) VALUES (?, ?, ?)', [id, nombre, anio]);
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'Ese grupo ya existe en esa sede y año' });
    next(e);
  }
});

// ---------- PUT /api/instituciones/grupos/:id  (renombrar / cambiar año) ----------
router.put('/grupos/:id', async (req, res, next) => {
  try {
    const id = idParam(req, res); if (id === null) return;
    const nombre = t((req.body || {}).nombre), anio = Number((req.body || {}).anio);
    if (nombre.length < 1 || nombre.length > 100) return mal(res, 'El nombre del grupo es obligatorio (máx. 100)');
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return mal(res, 'Año inválido');
    if (!(await grupoDeInstitucion(id, req.usuario.inst))) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });
    await pool.query('UPDATE tGrupo SET cNombre = ?, nAnio = ? WHERE nGrupoID = ?', [nombre, anio, id]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'Ese grupo ya existe en esa sede y año' });
    next(e);
  }
});

// ---------- DELETE /api/instituciones/grupos/:id ----------
// Solo si no tiene estudiantes ni participa en campañas (esos datos no se pueden perder).
router.delete('/grupos/:id', async (req, res, next) => {
  let conn;
  try {
    const id = idParam(req, res); if (id === null) return;
    if (!(await grupoDeInstitucion(id, req.usuario.inst))) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });
    const [[est]] = await pool.query('SELECT COUNT(*) AS n FROM tEstudiante WHERE nGrupoFK = ?', [id]);
    if (est.n > 0) return res.status(409).json({ ok: false, error: 'El grupo tiene estudiantes; no se puede eliminar' });
    const [[cam]] = await pool.query('SELECT COUNT(*) AS n FROM tCampanaGrupo WHERE nGrupoFK = ?', [id]);
    if (cam.n > 0) return res.status(409).json({ ok: false, error: 'El grupo participa en campañas; no se puede eliminar' });
    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.query('DELETE FROM tDocenteGrupo WHERE nGrupoFK = ?', [id]);
    await conn.query('DELETE FROM tGrupo WHERE nGrupoID = ?', [id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    if (conn) await conn.rollback();
    next(e);
  } finally { if (conn) conn.release(); }
});

module.exports = router;
