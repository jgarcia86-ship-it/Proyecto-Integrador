const express = require('express');
const pool = require('../db');
const router = express.Router();

// Instituciones activas (para el selector del registro)
router.get('/instituciones', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT nInstitucionID AS id, cNombre AS nombre FROM tInstitucion WHERE lActiva = 1 ORDER BY cNombre'
    );
    res.json({ ok: true, instituciones: rows });
  } catch (e) { next(e); }
});

// Grupos de una institución  ->  /api/catalogo/grupos?institucionId=1
router.get('/grupos', async (req, res, next) => {
  try {
    const institucionId = Number(req.query.institucionId);
    if (!Number.isInteger(institucionId) || institucionId < 1) {
      return res.status(400).json({ ok: false, error: 'institucionId inválido' });
    }
    const [rows] = await pool.query(
      `SELECT g.nGrupoID AS id, g.cNombre AS nombre, g.nAnio AS anio, s.cNombre AS sede
         FROM tGrupo g JOIN tSede s ON s.nSedeID = g.nSedeFK
        WHERE s.nInstitucionFK = ? AND s.lActiva = 1
        ORDER BY g.nAnio DESC, g.cNombre`,
      [institucionId]
    );
    res.json({ ok: true, grupos: rows });
  } catch (e) { next(e); }
});

module.exports = router;
