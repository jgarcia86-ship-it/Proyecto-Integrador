const express = require('express');
const pool = require('../db');
const { requiereAuth, requiereRol } = require('../middleware/auth');

const router = express.Router();
router.use(requiereAuth);

const SOLO_ADMIN = requiereRol('administrador');
const ADM_DOC = requiereRol('administrador', 'docente');

// Estado efectivo: se calcula con las fechas (así nunca queda desactualizado).
// 'finalizada' también puede venir forzada por el administrador (eEstado).
const ESTADO_SQL = `CASE WHEN c.eEstado = 'finalizada' OR CURDATE() > c.dFechaFin THEN 'finalizada'
                         WHEN CURDATE() < c.dFechaInicio THEN 'programada'
                         ELSE 'en_curso' END`;

const SELECT_CAMPANA = `SELECT c.nCampanaID AS id, c.cNombre AS nombre, c.cDescripcion AS descripcion,
  DATE_FORMAT(c.dFechaInicio, '%Y-%m-%d') AS inicio, DATE_FORMAT(c.dFechaFin, '%Y-%m-%d') AS fin,
  c.nMetaKg AS metaKg, ${ESTADO_SQL} AS estado,
  (SELECT COUNT(*) FROM tInscripcionCampana i WHERE i.nCampanaFK = c.nCampanaID) AS participantes,
  COALESCE((SELECT SUM(r.nPesoKg) FROM tRecoleccion r WHERE r.nCampanaFK = c.nCampanaID), 0) AS kg,
  COALESCE((SELECT SUM(r.nCo2EvitadoKg) FROM tRecoleccion r WHERE r.nCampanaFK = c.nCampanaID), 0) AS co2`;

// ---------- utilidades ----------
function formato(r) {
  const meta = Number(r.metaKg), kg = Number(r.kg);
  return {
    id: r.id, nombre: r.nombre, descripcion: r.descripcion || '',
    inicio: r.inicio, fin: r.fin, metaKg: meta, estado: r.estado,
    participantes: Number(r.participantes), kg, co2: Number(r.co2),
    porcentaje: meta > 0 ? Math.round(kg / meta * 1000) / 10 : 0,
    inscrito: !!r.inscrito, miKg: Number(r.miKg || 0)
  };
}

// Qué campañas puede ver cada rol (siempre de su institución):
//  administrador: todas · docente: las que incluyen alguno de sus grupos · estudiante: las de su grupo
function visibilidad(u) {
  if (u.rol === 'administrador') return { sql: '', params: [] };
  if (u.rol === 'docente') {
    return {
      sql: ` AND EXISTS (SELECT 1 FROM tCampanaGrupo cg JOIN tDocenteGrupo dg ON dg.nGrupoFK = cg.nGrupoFK
                          WHERE cg.nCampanaFK = c.nCampanaID AND dg.nUsuarioFK = ?)`,
      params: [u.id]
    };
  }
  return {
    sql: ` AND EXISTS (SELECT 1 FROM tCampanaGrupo cg JOIN tEstudiante e ON e.nGrupoFK = cg.nGrupoFK
                        WHERE cg.nCampanaFK = c.nCampanaID AND e.nUsuarioFK = ?)`,
    params: [u.id]
  };
}

async function datosEstudiante(usuarioId) {
  const [r] = await pool.query(
    'SELECT nEstudianteID, nGrupoFK, eEstadoAutorizacion FROM tEstudiante WHERE nUsuarioFK = ?', [usuarioId]);
  return r[0] || null;
}

async function obtenerCampana(id, u) {
  const v = visibilidad(u);
  const [r] = await pool.query(
    `${SELECT_CAMPANA} FROM tCampana c WHERE c.nCampanaID = ? AND c.nInstitucionFK = ?${v.sql}`,
    [id, u.inst, ...v.params]);
  return r[0] ? formato(r[0]) : null;
}

function idParam(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ ok: false, error: 'Identificador inválido' }); return null; }
  return id;
}

function errorDB(e, res, next) {
  if (e.sqlState === '45000') return res.status(400).json({ ok: false, error: e.sqlMessage }); // mensajes de los triggers
  if (e.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ ok: false, error: 'Alguno de los grupos no existe' });
  if (e.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return res.status(400).json({ ok: false, error: 'Hay valores fuera de rango (fechas o metas)' });
  next(e);
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = s => RE_FECHA.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const centavos = n => Math.round(n * 100);

// Valida el cuerpo de crear/editar. Devuelve { error } o { datos }.
function validar(b) {
  const t = v => (typeof v === 'string' ? v.trim() : '');
  const nombre = t(b.nombre), descripcion = t(b.descripcion), inicio = t(b.inicio), fin = t(b.fin);
  if (nombre.length < 3 || nombre.length > 150) return { error: 'El nombre debe tener entre 3 y 150 caracteres' };
  if (descripcion.length > 1000) return { error: 'La descripción es demasiado larga (máx. 1000)' };
  if (!fechaValida(inicio) || !fechaValida(fin)) return { error: 'Fechas inválidas' };
  if (fin < inicio) return { error: 'La fecha de fin no puede ser anterior a la de inicio' };
  const metaKg = Number(b.metaKg);
  if (!(metaKg > 0) || metaKg > 99999999) return { error: 'La meta debe ser un número mayor que 0' };

  if (!Array.isArray(b.grupos) || b.grupos.length < 1 || b.grupos.length > 200) return { error: 'Selecciona al menos un grupo participante' };
  const vistos = new Set(), grupos = [];
  let suma = 0;
  for (const g of b.grupos) {
    const id = Number(g && g.id);
    if (!Number.isInteger(id) || id < 1) return { error: 'Grupo inválido' };
    if (vistos.has(id)) return { error: 'Hay un grupo repetido' };
    vistos.add(id);
    let sub = null;
    if (g.metaKg !== null && g.metaKg !== undefined && g.metaKg !== '') {
      sub = Number(g.metaKg);
      if (!(sub > 0)) return { error: 'Las sub-metas de los grupos deben ser mayores que 0' };
      suma += centavos(sub);
    }
    grupos.push({ id, metaKg: sub });
  }
  if (suma > centavos(metaKg)) return { error: 'La suma de las sub-metas supera la meta de la campaña' };
  return { datos: { nombre, descripcion: descripcion || null, inicio, fin, metaKg: Math.round(metaKg * 100) / 100, grupos } };
}

// ---------- GET /api/campanas ----------
router.get('/', async (req, res, next) => {
  try {
    const u = req.usuario, v = visibilidad(u);
    const est = u.rol === 'estudiante' ? await datosEstudiante(u.id) : null;
    const eid = est ? est.nEstudianteID : 0;
    const [rows] = await pool.query(
      `${SELECT_CAMPANA},
        EXISTS (SELECT 1 FROM tInscripcionCampana i WHERE i.nCampanaFK = c.nCampanaID AND i.nEstudianteFK = ?) AS inscrito,
        COALESCE((SELECT SUM(r.nPesoKg) FROM tRecoleccion r WHERE r.nCampanaFK = c.nCampanaID AND r.nEstudianteFK = ?), 0) AS miKg
       FROM tCampana c
       WHERE c.nInstitucionFK = ?${v.sql}
       ORDER BY c.dFechaInicio DESC, c.nCampanaID DESC`,
      [eid, eid, u.inst, ...v.params]);
    const campanas = rows.map(formato);

    // Estudiantes distintos inscritos (docente: solo los de sus grupos)
    let participantes = 0;
    if (u.rol !== 'estudiante' && campanas.length) {
      const ids = campanas.map(c => c.id);
      const doc = u.rol === 'docente';
      const [p] = await pool.query(
        `SELECT COUNT(DISTINCT i.nEstudianteFK) AS n
           FROM tInscripcionCampana i JOIN tEstudiante e ON e.nEstudianteID = i.nEstudianteFK
          WHERE i.nCampanaFK IN (?)${doc ? ' AND e.nGrupoFK IN (SELECT nGrupoFK FROM tDocenteGrupo WHERE nUsuarioFK = ?)' : ''}`,
        doc ? [ids, u.id] : [ids]);
      participantes = Number(p[0].n);
    }
    res.json({ ok: true, campanas, resumen: { participantes } });
  } catch (e) { next(e); }
});

// ---------- GET /api/campanas/:id ----------
router.get('/:id', async (req, res, next) => {
  try {
    const id = idParam(req, res); if (id === null) return;
    const u = req.usuario;
    const campana = await obtenerCampana(id, u);
    if (!campana) return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });

    // Mis grupos (docente) o mi grupo (estudiante)
    let misGrupos = [], est = null;
    if (u.rol === 'docente') {
      const [r] = await pool.query('SELECT nGrupoFK FROM tDocenteGrupo WHERE nUsuarioFK = ?', [u.id]);
      misGrupos = r.map(x => x.nGrupoFK);
    } else if (u.rol === 'estudiante') {
      est = await datosEstudiante(u.id);
      if (est) misGrupos = [est.nGrupoFK];
    }

    // Grupos de la campaña con lo recolectado (ranking por kg)
    const [gr] = await pool.query(
      `SELECT g.nGrupoID AS id, g.cNombre AS nombre, s.cNombre AS sede, cg.nMetaKg AS metaKg,
              COALESCE(SUM(r.nPesoKg), 0) AS kg, COALESCE(SUM(r.nCo2EvitadoKg), 0) AS co2,
              (SELECT COUNT(*) FROM tInscripcionCampana i JOIN tEstudiante e2 ON e2.nEstudianteID = i.nEstudianteFK
                WHERE i.nCampanaFK = cg.nCampanaFK AND e2.nGrupoFK = g.nGrupoID) AS inscritos,
              (SELECT COUNT(*) FROM tEstudiante e3
                WHERE e3.nGrupoFK = g.nGrupoID AND e3.eEstadoAutorizacion = 'autorizada') AS habilitados
         FROM tCampanaGrupo cg
         JOIN tGrupo g ON g.nGrupoID = cg.nGrupoFK
         JOIN tSede s ON s.nSedeID = g.nSedeFK
         LEFT JOIN tEstudiante e ON e.nGrupoFK = g.nGrupoID
         LEFT JOIN tRecoleccion r ON r.nEstudianteFK = e.nEstudianteID AND r.nCampanaFK = cg.nCampanaFK
        WHERE cg.nCampanaFK = ?
        GROUP BY g.nGrupoID, g.cNombre, s.cNombre, cg.nMetaKg, cg.nCampanaFK
        ORDER BY kg DESC, g.cNombre`, [id]);
    const grupos = gr.map(g => ({
      id: g.id, nombre: g.nombre, sede: g.sede,
      metaKg: g.metaKg === null ? null : Number(g.metaKg),
      kg: Number(g.kg), co2: Number(g.co2),
      inscritos: Number(g.inscritos), habilitados: Number(g.habilitados),
      mio: misGrupos.includes(g.id)
    }));
    grupos.forEach(g => { g.posicion = 1 + grupos.filter(o => o.kg > g.kg).length; });

    // Participantes: admin todos · docente solo los de sus grupos · estudiante: top 5 con nombre abreviado
    let filtro = '', params = [id];
    if (u.rol === 'docente') { filtro = ' AND e.nGrupoFK IN (SELECT nGrupoFK FROM tDocenteGrupo WHERE nUsuarioFK = ?)'; params.push(u.id); }
    const [pa] = await pool.query(
      `SELECT e.nEstudianteID AS id, u.cNombre AS nombre, u.cApellido AS apellido, g.cNombre AS grupo,
              COALESCE(SUM(r.nPesoKg), 0) AS kg, COALESCE(SUM(r.nCo2EvitadoKg), 0) AS co2,
              DATE_FORMAT(i.dFecha, '%Y-%m-%d') AS inscripcion
         FROM tInscripcionCampana i
         JOIN tEstudiante e ON e.nEstudianteID = i.nEstudianteFK
         JOIN tUsuario u ON u.nUsuarioID = e.nUsuarioFK
         JOIN tGrupo g ON g.nGrupoID = e.nGrupoFK
         LEFT JOIN tRecoleccion r ON r.nCampanaFK = i.nCampanaFK AND r.nEstudianteFK = e.nEstudianteID
        WHERE i.nCampanaFK = ?${filtro}
        GROUP BY e.nEstudianteID, u.cNombre, u.cApellido, g.cNombre, i.dFecha
        ORDER BY kg DESC, u.cNombre`, params);
    let participantes = pa.map(p => ({
      id: p.id, nombre: p.nombre, apellido: p.apellido, grupo: p.grupo,
      kg: Number(p.kg), co2: Number(p.co2), inscripcion: p.inscripcion
    }));
    if (u.rol === 'estudiante') {
      // A otros estudiantes solo se les muestra nombre + inicial del apellido
      participantes = participantes.filter(p => p.kg > 0).slice(0, 5).map(p => ({
        nombre: p.nombre, apellido: (p.apellido || '').charAt(0) + '.', grupo: p.grupo, kg: p.kg, mio: est ? p.id === est.nEstudianteID : false
      }));
    }

    const respuesta = { ok: true, campana, grupos, participantes };

    if (u.rol === 'estudiante' && est) {
      const [m] = await pool.query(
        'SELECT COALESCE(SUM(nPesoKg), 0) AS kg, COALESCE(SUM(nCo2EvitadoKg), 0) AS co2 FROM tRecoleccion WHERE nCampanaFK = ? AND nEstudianteFK = ?',
        [id, est.nEstudianteID]);
      const [p] = await pool.query(
        'SELECT COALESCE(SUM(nPuntos), 0) AS puntos FROM tPunto WHERE nCampanaFK = ? AND nEstudianteFK = ?',
        [id, est.nEstudianteID]);
      let motivo = '', puedeInscribirse = false;
      if (!campana.inscrito) {
        if (campana.estado === 'finalizada') motivo = 'Esta campaña ya finalizó.';
        else if (est.eEstadoAutorizacion !== 'autorizada') motivo = 'Podrás inscribirte cuando tu institución confirme tu autorización de tratamiento de datos.';
        else puedeInscribirse = true;
      }
      respuesta.mio = { inscrito: campana.inscrito, kg: Number(m[0].kg), co2: Number(m[0].co2), puntos: Number(p[0].puntos), puedeInscribirse, motivo };
    }
    res.json(respuesta);
  } catch (e) { next(e); }
});

// ---------- POST /api/campanas  (administrador) ----------
router.post('/', SOLO_ADMIN, async (req, res, next) => {
  const v = validar(req.body || {});
  if (v.error) return res.status(400).json({ ok: false, error: v.error });
  const d = v.datos;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO tCampana (nInstitucionFK, cNombre, cDescripcion, dFechaInicio, dFechaFin, nMetaKg, eEstado)
       VALUES (?, ?, ?, ?, ?, ?, 'programada')`,
      [req.usuario.inst, d.nombre, d.descripcion, d.inicio, d.fin, d.metaKg]);
    for (const g of d.grupos) {
      // El trigger valida misma institución y suma de sub-metas
      await conn.query('INSERT INTO tCampanaGrupo (nCampanaFK, nGrupoFK, nMetaKg) VALUES (?, ?, ?)', [r.insertId, g.id, g.metaKg]);
    }
    await conn.commit();
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    await conn.rollback();
    errorDB(e, res, next);
  } finally { conn.release(); }
});

// ---------- PUT /api/campanas/:id  (administrador) ----------
router.put('/:id', SOLO_ADMIN, async (req, res, next) => {
  const id = idParam(req, res); if (id === null) return;
  const v = validar(req.body || {});
  if (v.error) return res.status(400).json({ ok: false, error: v.error });
  const d = v.datos;
  let conn;
  try {
    const actual = await obtenerCampana(id, req.usuario);
    if (!actual) return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });
    if (actual.estado === 'finalizada') return res.status(400).json({ ok: false, error: 'Una campaña finalizada no se puede editar' });

    // No se puede quitar un grupo que ya tiene estudiantes inscritos
    const [ins] = await pool.query(
      `SELECT g.nGrupoID AS id, g.cNombre AS nombre
         FROM tInscripcionCampana i JOIN tEstudiante e ON e.nEstudianteID = i.nEstudianteFK
         JOIN tGrupo g ON g.nGrupoID = e.nGrupoFK
        WHERE i.nCampanaFK = ? GROUP BY g.nGrupoID, g.cNombre`, [id]);
    const nuevos = new Set(d.grupos.map(g => g.id));
    const bloqueado = ins.find(g => !nuevos.has(g.id));
    if (bloqueado) return res.status(400).json({ ok: false, error: `No puedes quitar el grupo ${bloqueado.nombre}: ya tiene estudiantes inscritos` });

    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.query(
      `UPDATE tCampana SET cNombre = ?, cDescripcion = ?, dFechaInicio = ?, dFechaFin = ?, nMetaKg = ?
        WHERE nCampanaID = ? AND nInstitucionFK = ?`,
      [d.nombre, d.descripcion, d.inicio, d.fin, d.metaKg, id, req.usuario.inst]);
    await conn.query('DELETE FROM tCampanaGrupo WHERE nCampanaFK = ?', [id]);
    for (const g of d.grupos) {
      await conn.query('INSERT INTO tCampanaGrupo (nCampanaFK, nGrupoFK, nMetaKg) VALUES (?, ?, ?)', [id, g.id, g.metaKg]);
    }
    await conn.commit();
    res.json({ ok: true, id });
  } catch (e) {
    if (conn) await conn.rollback();
    errorDB(e, res, next);
  } finally { if (conn) conn.release(); }
});

// ---------- POST /api/campanas/:id/finalizar  (administrador) ----------
router.post('/:id/finalizar', SOLO_ADMIN, async (req, res, next) => {
  try {
    const id = idParam(req, res); if (id === null) return;
    const [r] = await pool.query(
      "UPDATE tCampana SET eEstado = 'finalizada' WHERE nCampanaID = ? AND nInstitucionFK = ?", [id, req.usuario.inst]);
    if (!r.affectedRows) return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- DELETE /api/campanas/:id  (administrador; solo si nadie se ha inscrito) ----------
router.delete('/:id', SOLO_ADMIN, async (req, res, next) => {
  let conn;
  try {
    const id = idParam(req, res); if (id === null) return;
    const c = await obtenerCampana(id, req.usuario);
    if (!c) return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });
    if (c.participantes > 0) return res.status(409).json({ ok: false, error: 'La campaña ya tiene participantes. Finalízala en lugar de eliminarla.' });
    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.query('DELETE FROM tCampanaGrupo WHERE nCampanaFK = ?', [id]);
    await conn.query('DELETE FROM tCampana WHERE nCampanaID = ?', [id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    if (conn) await conn.rollback();
    next(e);
  } finally { if (conn) conn.release(); }
});

// ---------- POST /api/campanas/:id/inscripcion  (estudiante se inscribe) ----------
router.post('/:id/inscripcion', requiereRol('estudiante'), async (req, res, next) => {
  try {
    const id = idParam(req, res); if (id === null) return;
    const est = await datosEstudiante(req.usuario.id);
    if (!est) return res.status(403).json({ ok: false, error: 'No tienes perfil de estudiante' });
    const c = await obtenerCampana(id, req.usuario);   // ya exige que su grupo participe
    if (!c) return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });
    if (c.estado === 'finalizada') return res.status(400).json({ ok: false, error: 'Esta campaña ya finalizó' });
    if (est.eEstadoAutorizacion !== 'autorizada') {
      return res.status(403).json({ ok: false, error: 'Tu autorización de tratamiento de datos aún no está confirmada por tu institución' });
    }
    await pool.query('INSERT INTO tInscripcionCampana (nCampanaFK, nEstudianteFK) VALUES (?, ?)', [id, est.nEstudianteID]);
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'Ya estás inscrito en esta campaña' });
    errorDB(e, res, next);
  }
});

// ---------- DELETE /api/campanas/:id/inscripcion  (estudiante sale) ----------
router.delete('/:id/inscripcion', requiereRol('estudiante'), async (req, res, next) => {
  try {
    const id = idParam(req, res); if (id === null) return;
    const est = await datosEstudiante(req.usuario.id);
    if (!est) return res.status(403).json({ ok: false, error: 'No tienes perfil de estudiante' });
    const [r] = await pool.query('DELETE FROM tInscripcionCampana WHERE nCampanaFK = ? AND nEstudianteFK = ?', [id, est.nEstudianteID]);
    if (!r.affectedRows) return res.status(404).json({ ok: false, error: 'No estabas inscrito' });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ ok: false, error: 'Ya tienes recolecciones registradas en esta campaña; no puedes salir.' });
    next(e);
  }
});

// ---------- POST /api/campanas/:id/inscribir-grupo  (docente/admin inscriben a un grupo completo) ----------
// Solo se inscriben los estudiantes con autorización 'autorizada'.
router.post('/:id/inscribir-grupo', ADM_DOC, async (req, res, next) => {
  try {
    const id = idParam(req, res); if (id === null) return;
    const u = req.usuario;
    const grupoId = Number((req.body || {}).grupoId);
    if (!Number.isInteger(grupoId) || grupoId < 1) return res.status(400).json({ ok: false, error: 'Grupo inválido' });

    const c = await obtenerCampana(id, u);
    if (!c) return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });
    if (c.estado === 'finalizada') return res.status(400).json({ ok: false, error: 'Esta campaña ya finalizó' });

    const [pert] = await pool.query('SELECT 1 FROM tCampanaGrupo WHERE nCampanaFK = ? AND nGrupoFK = ?', [id, grupoId]);
    if (!pert.length) return res.status(400).json({ ok: false, error: 'Ese grupo no participa en la campaña' });
    if (u.rol === 'docente') {
      const [mio] = await pool.query('SELECT 1 FROM tDocenteGrupo WHERE nUsuarioFK = ? AND nGrupoFK = ?', [u.id, grupoId]);
      if (!mio.length) return res.status(403).json({ ok: false, error: 'No acompañas a ese grupo' });
    }
    const [r] = await pool.query(
      `INSERT IGNORE INTO tInscripcionCampana (nCampanaFK, nEstudianteFK)
       SELECT ?, e.nEstudianteID FROM tEstudiante e
        WHERE e.nGrupoFK = ? AND e.eEstadoAutorizacion = 'autorizada'`, [id, grupoId]);
    res.json({ ok: true, inscritos: r.affectedRows });
  } catch (e) { errorDB(e, res, next); }
});

module.exports = router;
