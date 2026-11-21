const express = require('express');
const pool = require('../db');
const { requiereAuth, requiereRol } = require('../middleware/auth');

// Módulo para administrador y docente. Los triggers de la base calculan el CO2 evitado
// y los puntos al insertar una recolección; aquí solo se valida y se inserta.
const router = express.Router();
router.use(requiereAuth, requiereRol('administrador', 'docente'));
const SOLO_ADMIN = requiereRol('administrador');

const mal = (res, error, code = 400) => res.status(code).json({ ok: false, error });
const FROM_BASE = `FROM tRecoleccion r JOIN tCampana c ON c.nCampanaID = r.nCampanaFK`;

// Qué recolecciones puede ver cada rol (alias r = tRecoleccion, c = tCampana)
//  administrador: las de su institución · docente: las de estudiantes de sus grupos
function alcance(u) {
  let sql = 'c.nInstitucionFK = ?';
  const params = [u.inst];
  if (u.rol === 'docente') {
    sql += ` AND r.nEstudianteFK IN (SELECT e.nEstudianteID FROM tEstudiante e
                                      JOIN tDocenteGrupo dg ON dg.nGrupoFK = e.nGrupoFK WHERE dg.nUsuarioFK = ?)`;
    params.push(u.id);
  }
  return { sql, params };
}

// Campañas visibles (alias c): administrador todas · docente las que incluyen alguno de sus grupos
function campanasVisibles(u) {
  if (u.rol === 'administrador') return { sql: '', params: [] };
  return {
    sql: ` AND EXISTS (SELECT 1 FROM tCampanaGrupo cg JOIN tDocenteGrupo dg ON dg.nGrupoFK = cg.nGrupoFK
                        WHERE cg.nCampanaFK = c.nCampanaID AND dg.nUsuarioFK = ?)`,
    params: [u.id]
  };
}

const EN_CURSO = "c.eEstado <> 'finalizada' AND CURDATE() BETWEEN c.dFechaInicio AND c.dFechaFin";

// ---------- listado con filtros y paginación ----------
async function listar(u, f) {
  const a = alcance(u);
  let where = a.sql;
  const params = [...a.params];
  if (f.campana) { where += ' AND r.nCampanaFK = ?'; params.push(f.campana); }
  if (f.tipo) { where += ' AND r.nTipoResiduoFK = ?'; params.push(f.tipo); }
  if (f.q) { where += " AND CONCAT(ue.cNombre, ' ', ue.cApellido) LIKE ?"; params.push('%' + f.q.replace(/[\\%_]/g, '\\$&') + '%'); }
  const FROM = `${FROM_BASE}
    JOIN tEstudiante e ON e.nEstudianteID = r.nEstudianteFK
    JOIN tUsuario ue ON ue.nUsuarioID = e.nUsuarioFK
    JOIN tGrupo g ON g.nGrupoID = e.nGrupoFK
    JOIN tSede s ON s.nSedeID = g.nSedeFK
    JOIN tTipoResiduo t ON t.nTipoResiduoID = r.nTipoResiduoFK
    JOIN tUsuario ur ON ur.nUsuarioID = r.nUsuarioFK
    LEFT JOIN tPunto p ON p.nRecoleccionFK = r.nRecoleccionID`;
  const [[tot]] = await pool.query(`SELECT COUNT(*) AS n ${FROM} WHERE ${where}`, params);
  const [rows] = await pool.query(
    `SELECT r.nRecoleccionID AS id, DATE_FORMAT(r.dFecha, '%Y-%m-%d %H:%i') AS fecha,
            ue.cNombre AS nombre, ue.cApellido AS apellido, g.cNombre AS grupo, s.cNombre AS sede,
            c.nCampanaID AS campanaId, c.cNombre AS campana, t.cNombre AS tipo,
            r.nCantidad AS cantidad, r.nPesoKg AS pesoKg, r.nCo2EvitadoKg AS co2, COALESCE(p.nPuntos, 0) AS puntos,
            CONCAT(ur.cNombre, ' ', ur.cApellido) AS registradoPor
       ${FROM} WHERE ${where}
      ORDER BY r.dFecha DESC, r.nRecoleccionID DESC LIMIT ? OFFSET ?`,
    [...params, f.limite, (f.pagina - 1) * f.limite]);
  return {
    total: Number(tot.n),
    filas: rows.map(r => ({ ...r, cantidad: Number(r.cantidad), pesoKg: Number(r.pesoKg), co2: Number(r.co2), puntos: Number(r.puntos) }))
  };
}

const entero = (v, def = 0) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : def; };

// ---------- GET /api/recolecciones/resumen?meses=6|12 ----------
router.get('/resumen', async (req, res, next) => {
  try {
    const u = req.usuario, a = alcance(u), cv = campanasVisibles(u);
    const meses = Number(req.query.meses) === 12 ? 12 : 6;
    const MES = "DATE_FORMAT(r.dFecha, '%Y-%m')";
    const ACT = "DATE_FORMAT(CURDATE(), '%Y-%m')", ANT = "DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m')";

    const [[t]] = await pool.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(r.nPesoKg), 0) AS kg, COALESCE(SUM(r.nCo2EvitadoKg), 0) AS co2,
              ${ACT} AS mesActual,
              COALESCE(SUM(CASE WHEN ${MES} = ${ACT} THEN 1 END), 0) AS nAct,
              COALESCE(SUM(CASE WHEN ${MES} = ${ACT} THEN r.nPesoKg END), 0) AS kgAct,
              COALESCE(SUM(CASE WHEN ${MES} = ${ACT} THEN r.nCo2EvitadoKg END), 0) AS co2Act,
              COALESCE(SUM(CASE WHEN ${MES} = ${ANT} THEN 1 END), 0) AS nAnt,
              COALESCE(SUM(CASE WHEN ${MES} = ${ANT} THEN r.nPesoKg END), 0) AS kgAnt,
              COALESCE(SUM(CASE WHEN ${MES} = ${ANT} THEN r.nCo2EvitadoKg END), 0) AS co2Ant
         ${FROM_BASE} WHERE ${a.sql}`, a.params);

    const [[camp]] = await pool.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(${EN_CURSO}), 0) AS activas
         FROM tCampana c WHERE c.nInstitucionFK = ?${cv.sql}`, [u.inst, ...cv.params]);

    const [tipos] = await pool.query(
      `SELECT t.nTipoResiduoID AS id, t.cNombre AS nombre, SUM(r.nPesoKg) AS kg
         ${FROM_BASE} JOIN tTipoResiduo t ON t.nTipoResiduoID = r.nTipoResiduoFK
        WHERE ${a.sql} GROUP BY t.nTipoResiduoID, t.cNombre ORDER BY kg DESC`, a.params);

    const [porMes] = await pool.query(
      `SELECT ${MES} AS mes, SUM(r.nPesoKg) AS kg
         ${FROM_BASE}
        WHERE ${a.sql} AND r.dFecha >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)
        GROUP BY mes ORDER BY mes`, [...a.params, meses - 1]);

    const ultimas = await listar(u, { limite: 5, pagina: 1 });
    const n = x => Number(x);
    res.json({
      ok: true, meses, mesActual: t.mesActual,
      totales: {
        kg: n(t.kg), recolecciones: n(t.n), co2: n(t.co2),
        mes: { kg: n(t.kgAct), recolecciones: n(t.nAct), co2: n(t.co2Act) },
        anterior: { kg: n(t.kgAnt), recolecciones: n(t.nAnt), co2: n(t.co2Ant) }
      },
      campanas: { activas: n(camp.activas), total: n(camp.total) },
      porTipo: tipos.map(x => ({ id: x.id, nombre: x.nombre, kg: n(x.kg) })),
      porMes: porMes.map(x => ({ mes: x.mes, kg: n(x.kg) })),
      ultimas: ultimas.filas
    });
  } catch (e) { next(e); }
});

// ---------- GET /api/recolecciones/filtros  (para el historial) ----------
router.get('/filtros', async (req, res, next) => {
  try {
    const a = alcance(req.usuario);
    const [campanas] = await pool.query(
      `SELECT DISTINCT c.nCampanaID AS id, c.cNombre AS nombre ${FROM_BASE} WHERE ${a.sql} ORDER BY c.cNombre`, a.params);
    const [tipos] = await pool.query('SELECT nTipoResiduoID AS id, cNombre AS nombre FROM tTipoResiduo ORDER BY cNombre');
    res.json({ ok: true, campanas, tipos });
  } catch (e) { next(e); }
});

// ---------- GET /api/recolecciones/opciones  (datos del formulario de registro) ----------
router.get('/opciones', async (req, res, next) => {
  try {
    const u = req.usuario, cv = campanasVisibles(u);
    const [tipos] = await pool.query(
      'SELECT nTipoResiduoID AS id, cNombre AS nombre, nFactorConversionCo2 AS factor, nPuntosPorKg AS puntosPorKg FROM tTipoResiduo ORDER BY cNombre');
    const [camps] = await pool.query(
      `SELECT c.nCampanaID AS id, c.cNombre AS nombre FROM tCampana c
        WHERE c.nInstitucionFK = ? AND ${EN_CURSO}${cv.sql} ORDER BY c.cNombre`, [u.inst, ...cv.params]);
    let estudiantes = [];
    if (camps.length) {
      const doc = u.rol === 'docente';
      [estudiantes] = await pool.query(
        `SELECT i.nCampanaFK AS campanaId, e.nEstudianteID AS id, us.cNombre AS nombre, us.cApellido AS apellido, g.cNombre AS grupo
           FROM tInscripcionCampana i
           JOIN tEstudiante e ON e.nEstudianteID = i.nEstudianteFK
           JOIN tUsuario us ON us.nUsuarioID = e.nUsuarioFK
           JOIN tGrupo g ON g.nGrupoID = e.nGrupoFK
          WHERE i.nCampanaFK IN (?) AND e.eEstadoAutorizacion = 'autorizada'
            ${doc ? 'AND e.nGrupoFK IN (SELECT nGrupoFK FROM tDocenteGrupo WHERE nUsuarioFK = ?)' : ''}
          ORDER BY us.cApellido, us.cNombre`, doc ? [camps.map(c => c.id), u.id] : [camps.map(c => c.id)]);
    }
    res.json({
      ok: true,
      tipos: tipos.map(t => ({ ...t, factor: Number(t.factor), puntosPorKg: Number(t.puntosPorKg) })),
      campanas: camps.map(c => ({ ...c, estudiantes: estudiantes.filter(e => e.campanaId === c.id) }))
    });
  } catch (e) { next(e); }
});

// ---------- GET /api/recolecciones?pagina=&limite=&campana=&tipo=&q= ----------
router.get('/', async (req, res, next) => {
  try {
    const f = {
      pagina: entero(req.query.pagina, 1),
      limite: Math.min(entero(req.query.limite, 15), 50),
      campana: entero(req.query.campana, 0),
      tipo: entero(req.query.tipo, 0),
      q: typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
    };
    res.json({ ok: true, pagina: f.pagina, limite: f.limite, ...(await listar(req.usuario, f)) });
  } catch (e) { next(e); }
});

// ---------- POST /api/recolecciones ----------
// { campanaId, estudianteId, tipoResiduoId, cantidad, pesoKg }
router.post('/', async (req, res, next) => {
  try {
    const u = req.usuario, b = req.body || {};
    const campanaId = entero(b.campanaId), estudianteId = entero(b.estudianteId), tipoId = entero(b.tipoResiduoId);
    const cantidad = entero(b.cantidad), peso = Math.round(Number(b.pesoKg) * 100) / 100;
    if (!campanaId || !estudianteId || !tipoId) return mal(res, 'Elige la campaña, el estudiante y el tipo de residuo');
    if (!cantidad || cantidad > 100000) return mal(res, 'La cantidad debe ser un número entero mayor que 0');
    if (!(peso > 0) || peso > 100000) return mal(res, 'El peso debe ser mayor que 0 kg');

    const [c] = await pool.query(
      `SELECT c.nCampanaID FROM tCampana c WHERE c.nCampanaID = ? AND c.nInstitucionFK = ? AND ${EN_CURSO}`, [campanaId, u.inst]);
    if (!c.length) return mal(res, 'La campaña no existe o no está en curso');

    const [e] = await pool.query(
      `SELECT e.nGrupoFK, e.eEstadoAutorizacion FROM tInscripcionCampana i
         JOIN tEstudiante e ON e.nEstudianteID = i.nEstudianteFK
        WHERE i.nCampanaFK = ? AND i.nEstudianteFK = ?`, [campanaId, estudianteId]);
    if (!e.length) return mal(res, 'El estudiante no está inscrito en esa campaña');
    if (e[0].eEstadoAutorizacion !== 'autorizada') return mal(res, 'La autorización de ese estudiante no está vigente');
    if (u.rol === 'docente') {
      const [mio] = await pool.query('SELECT 1 FROM tDocenteGrupo WHERE nUsuarioFK = ? AND nGrupoFK = ?', [u.id, e[0].nGrupoFK]);
      if (!mio.length) return mal(res, 'Ese estudiante no es de tus grupos', 403);
    }
    const [t] = await pool.query('SELECT 1 FROM tTipoResiduo WHERE nTipoResiduoID = ?', [tipoId]);
    if (!t.length) return mal(res, 'Tipo de residuo inválido');

    // Los triggers calculan nCo2EvitadoKg y crean el movimiento de puntos
    const [r] = await pool.query(
      `INSERT INTO tRecoleccion (nCampanaFK, nEstudianteFK, nTipoResiduoFK, nUsuarioFK, nCantidad, nPesoKg)
       VALUES (?, ?, ?, ?, ?, ?)`, [campanaId, estudianteId, tipoId, u.id, cantidad, peso]);
    const [[res2]] = await pool.query(
      `SELECT r.nCo2EvitadoKg AS co2, COALESCE(p.nPuntos, 0) AS puntos
         FROM tRecoleccion r LEFT JOIN tPunto p ON p.nRecoleccionFK = r.nRecoleccionID WHERE r.nRecoleccionID = ?`, [r.insertId]);
    res.status(201).json({ ok: true, id: r.insertId, co2: Number(res2.co2), puntos: Number(res2.puntos) });
  } catch (e) { next(e); }
});

// ---------- DELETE /api/recolecciones/:id  (anular; solo administrador) ----------
// Quita la recolección y sus puntos, siempre que el estudiante no haya gastado esos puntos en un canje.
router.delete('/:id', SOLO_ADMIN, async (req, res, next) => {
  const id = entero(req.params.id);
  if (!id) return mal(res, 'Identificador inválido');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `SELECT r.nEstudianteFK AS est, COALESCE(p.nPuntos, 0) AS puntos
         FROM tRecoleccion r JOIN tCampana c ON c.nCampanaID = r.nCampanaFK
         LEFT JOIN tPunto p ON p.nRecoleccionFK = r.nRecoleccionID
        WHERE r.nRecoleccionID = ? AND c.nInstitucionFK = ? FOR UPDATE`, [id, req.usuario.inst]);
    if (!r.length) { await conn.rollback(); return mal(res, 'Recolección no encontrada', 404); }
    const [[s]] = await conn.query('SELECT COALESCE(SUM(nPuntos), 0) AS saldo FROM tPunto WHERE nEstudianteFK = ? FOR UPDATE', [r[0].est]);
    if (Number(s.saldo) - Number(r[0].puntos) < 0) {
      await conn.rollback();
      return mal(res, 'No se puede anular: el estudiante ya canjeó puntos que incluyen esta recolección', 409);
    }
    await conn.query('DELETE FROM tPunto WHERE nRecoleccionFK = ?', [id]);
    await conn.query('DELETE FROM tRecoleccion WHERE nRecoleccionID = ?', [id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

module.exports = router;
