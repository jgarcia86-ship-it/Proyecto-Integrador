const express = require('express');
const pool = require('../db');
const { requiereAuth, requiereRol } = require('../middleware/auth');

// Módulo "Informes y estadísticas" (solo administrador y docente).
//  administrador: datos de toda su institución · docente: solo los de los estudiantes de sus grupos.
const router = express.Router();
router.use(requiereAuth, requiereRol('administrador', 'docente'));

const FROM_BASE = 'FROM tRecoleccion r JOIN tCampana c ON c.nCampanaID = r.nCampanaFK';
const EN_CURSO = "c.eEstado <> 'finalizada' AND CURDATE() BETWEEN c.dFechaInicio AND c.dFechaFin";
const n = x => Number(x || 0);

// Alcance de recolecciones (alias r = tRecoleccion, c = tCampana)
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

// Campañas visibles (alias c)
function campanasVisibles(u) {
  if (u.rol === 'administrador') return { sql: '', params: [] };
  return {
    sql: ` AND EXISTS (SELECT 1 FROM tCampanaGrupo cg JOIN tDocenteGrupo dg ON dg.nGrupoFK = cg.nGrupoFK
                        WHERE cg.nCampanaFK = c.nCampanaID AND dg.nUsuarioFK = ?)`,
    params: [u.id]
  };
}

// GET /api/informes?meses=3|6|12
router.get('/', async (req, res, next) => {
  try {
    const u = req.usuario, a = alcance(u), cv = campanasVisibles(u);
    const meses = [3, 6, 12].includes(Number(req.query.meses)) ? Number(req.query.meses) : 6;
    // El periodo actual empieza el día 1 de hace (meses-1) meses; el anterior tiene la misma duración justo antes.
    const S = `DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ${meses - 1} MONTH)`;
    const P = `DATE_SUB(${S}, INTERVAL ${meses} MONTH)`;
    const CUR = `r.dFecha >= ${S}`;
    const PREV = `(r.dFecha >= ${P} AND r.dFecha < ${S})`;

    const [[t]] = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN ${CUR} THEN r.nPesoKg END), 0) AS kg,
              COALESCE(SUM(CASE WHEN ${PREV} THEN r.nPesoKg END), 0) AS kgAnt,
              COALESCE(SUM(CASE WHEN ${CUR} THEN r.nCo2EvitadoKg END), 0) AS co2,
              COALESCE(SUM(CASE WHEN ${PREV} THEN r.nCo2EvitadoKg END), 0) AS co2Ant,
              COALESCE(SUM(CASE WHEN ${CUR} THEN 1 END), 0) AS recolecciones,
              COUNT(DISTINCT CASE WHEN ${CUR} THEN r.nEstudianteFK END) AS participantes,
              COUNT(DISTINCT CASE WHEN ${PREV} THEN r.nEstudianteFK END) AS participantesAnt
         ${FROM_BASE} WHERE ${a.sql} AND r.dFecha >= ${P}`, a.params);

    const [[camp]] = await pool.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(${EN_CURSO}), 0) AS activas
         FROM tCampana c WHERE c.nInstitucionFK = ?${cv.sql}`, [u.inst, ...cv.params]);

    // Estudiantes del alcance (para "X de N estudiantes")
    let sqlEst = `SELECT COUNT(*) AS total FROM tEstudiante e JOIN tGrupo g ON g.nGrupoID = e.nGrupoFK
                    JOIN tSede s ON s.nSedeID = g.nSedeFK WHERE s.nInstitucionFK = ?`;
    const pEst = [u.inst];
    if (u.rol === 'docente') { sqlEst += ' AND e.nGrupoFK IN (SELECT dg.nGrupoFK FROM tDocenteGrupo dg WHERE dg.nUsuarioFK = ?)'; pEst.push(u.id); }
    const [[est]] = await pool.query(sqlEst, pEst);

    const [tipos] = await pool.query(
      `SELECT t.nTipoResiduoID AS id, t.cNombre AS nombre, SUM(r.nPesoKg) AS kg
         ${FROM_BASE} JOIN tTipoResiduo t ON t.nTipoResiduoID = r.nTipoResiduoFK
        WHERE ${a.sql} AND ${CUR} GROUP BY t.nTipoResiduoID, t.cNombre ORDER BY kg DESC`, a.params);

    const [grupos] = await pool.query(
      `SELECT g.nGrupoID AS id, g.cNombre AS grupo, s.cNombre AS sede,
              SUM(r.nPesoKg) AS kg, SUM(r.nCo2EvitadoKg) AS co2, COALESCE(SUM(p.nPuntos), 0) AS puntos
         ${FROM_BASE}
         JOIN tEstudiante e ON e.nEstudianteID = r.nEstudianteFK
         JOIN tGrupo g ON g.nGrupoID = e.nGrupoFK
         JOIN tSede s ON s.nSedeID = g.nSedeFK
         LEFT JOIN tPunto p ON p.nRecoleccionFK = r.nRecoleccionID
        WHERE ${a.sql} AND ${CUR}
        GROUP BY g.nGrupoID, g.cNombre, s.cNombre
        ORDER BY puntos DESC, kg DESC LIMIT 10`, a.params);

    res.json({
      ok: true, meses,
      totales: {
        kg: n(t.kg), kgAnt: n(t.kgAnt), co2: n(t.co2), co2Ant: n(t.co2Ant),
        recolecciones: n(t.recolecciones), participantes: n(t.participantes), participantesAnt: n(t.participantesAnt),
        estudiantes: n(est.total)
      },
      campanas: { activas: n(camp.activas), total: n(camp.total) },
      porTipo: tipos.map(x => ({ id: x.id, nombre: x.nombre, kg: n(x.kg) })),
      grupos: grupos.map(x => ({ id: x.id, grupo: x.grupo, sede: x.sede, kg: n(x.kg), co2: n(x.co2), puntos: n(x.puntos) }))
    });
  } catch (e) { next(e); }
});

module.exports = router;
