const express = require('express');
const pool = require('../db');

// Endpoints PÚBLICOS (sin sesión) para las páginas informativas: solo datos no sensibles
// (nombre, descripción, fechas, meta y avance de las campañas; nunca nombres de estudiantes).
const router = express.Router();

const ESTADO_SQL = `CASE WHEN c.eEstado = 'finalizada' OR CURDATE() > c.dFechaFin THEN 'finalizada'
                         WHEN CURDATE() < c.dFechaInicio THEN 'programada'
                         ELSE 'en_curso' END`;
const ORDEN = { en_curso: 0, programada: 1, finalizada: 2 };

// GET /api/publico/campanas  ->  campañas de instituciones activas + totales generales
router.get('/campanas', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.nCampanaID AS id, c.cNombre AS nombre, c.cDescripcion AS descripcion,
              i.cNombre AS institucion,
              DATE_FORMAT(c.dFechaInicio, '%Y-%m-%d') AS inicio, DATE_FORMAT(c.dFechaFin, '%Y-%m-%d') AS fin,
              c.nMetaKg AS metaKg, ${ESTADO_SQL} AS estado,
              (SELECT COUNT(*) FROM tInscripcionCampana x WHERE x.nCampanaFK = c.nCampanaID) AS participantes,
              COALESCE((SELECT SUM(r.nPesoKg) FROM tRecoleccion r WHERE r.nCampanaFK = c.nCampanaID), 0) AS kg
         FROM tCampana c
         JOIN tInstitucion i ON i.nInstitucionID = c.nInstitucionFK
        WHERE i.lActiva = 1
        ORDER BY c.dFechaInicio DESC
        LIMIT 60`);

    const campanas = rows.map(r => {
      const meta = Number(r.metaKg), kg = Number(r.kg);
      return {
        id: r.id, nombre: r.nombre, descripcion: r.descripcion || '', institucion: r.institucion,
        inicio: r.inicio, fin: r.fin, estado: r.estado, metaKg: meta, kg,
        participantes: Number(r.participantes),
        porcentaje: meta > 0 ? Math.min(100, Math.round(kg / meta * 1000) / 10) : 0
      };
    }).sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado]); // en curso, próximas y luego finalizadas (más recientes primero)

    const [[t]] = await pool.query(
      `SELECT (SELECT COALESCE(SUM(nPesoKg), 0) FROM tRecoleccion) AS kg,
              (SELECT COUNT(*) FROM tInstitucion WHERE lActiva = 1) AS instituciones`);

    res.json({
      ok: true, campanas,
      totales: {
        kg: Number(t.kg), instituciones: Number(t.instituciones),
        enCurso: campanas.filter(c => c.estado === 'en_curso').length,
        participantes: campanas.reduce((s, c) => s + c.participantes, 0)
      }
    });
  } catch (e) { next(e); }
});

module.exports = router;
