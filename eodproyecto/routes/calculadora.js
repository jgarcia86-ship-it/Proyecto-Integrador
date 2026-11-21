const express = require('express');
const pool = require('../db');
const { requiereAuth } = require('../middleware/auth');

// Calculadora ambiental (todos los roles).
//  - Entrega los factores por tipo de residuo para que la calculadora haga la simulación en el navegador.
//  - Entrega también el impacto REAL ya registrado, según el rol:
//      administrador: toda su institución · docente: estudiantes de sus grupos · estudiante: solo lo suyo.
const router = express.Router();
router.use(requiereAuth);

// Un árbol absorbe ≈ 22 kg de CO2 al año (valor de referencia que usa la pantalla para "árboles salvados")
const KG_CO2_POR_ARBOL = 22;
const n = x => Number(x || 0);

function alcance(u) {
  let sql = 'c.nInstitucionFK = ?';
  const params = [u.inst];
  if (u.rol === 'docente') {
    sql += ` AND r.nEstudianteFK IN (SELECT e.nEstudianteID FROM tEstudiante e
                                      JOIN tDocenteGrupo dg ON dg.nGrupoFK = e.nGrupoFK WHERE dg.nUsuarioFK = ?)`;
    params.push(u.id);
  } else if (u.rol === 'estudiante') {
    sql += ' AND r.nEstudianteFK IN (SELECT nEstudianteID FROM tEstudiante WHERE nUsuarioFK = ?)';
    params.push(u.id);
  }
  return { sql, params };
}

const MES = "DATE_FORMAT(r.dFecha, '%Y-%m')";
const PERIODOS = {
  mes: `${MES} = DATE_FORMAT(CURDATE(), '%Y-%m')`,
  mesAnterior: `${MES} = DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m')`,
  anio: 'YEAR(r.dFecha) = YEAR(CURDATE())',
  anioAnterior: 'YEAR(r.dFecha) = YEAR(CURDATE()) - 1',
  total: '1 = 1'
};
const METRICAS = {
  kg: 'r.nPesoKg',
  co2: 'r.nCo2EvitadoKg',                       // el CO2 queda guardado en cada recolección (histórico)
  energia: 'r.nPesoKg * t.nFactorEnergiaKwh',   // energía y agua usan el factor vigente del tipo
  agua: 'r.nPesoKg * t.nFactorAguaL'
};

router.get('/', async (req, res, next) => {
  try {
    const u = req.usuario, a = alcance(u);

    const [tipos] = await pool.query(
      `SELECT nTipoResiduoID AS id, cNombre AS nombre, nFactorConversionCo2 AS co2, nFactorEnergiaKwh AS energia,
              nFactorAguaL AS agua, nPesoUnitarioKg AS pesoUnitario, cUnidad AS unidad
         FROM tTipoResiduo ORDER BY nTipoResiduoID`);

    // Una sola consulta con una suma condicional por periodo y por métrica
    const columnas = [];
    for (const [p, cond] of Object.entries(PERIODOS)) {
      for (const [m, expr] of Object.entries(METRICAS)) columnas.push(`COALESCE(SUM(CASE WHEN ${cond} THEN ${expr} END), 0) AS ${p}_${m}`);
    }
    const [[fila]] = await pool.query(
      `SELECT ${columnas.join(', ')}
         FROM tRecoleccion r JOIN tCampana c ON c.nCampanaID = r.nCampanaFK
         JOIN tTipoResiduo t ON t.nTipoResiduoID = r.nTipoResiduoFK
        WHERE ${a.sql}`, a.params);
    const real = {};
    for (const p of Object.keys(PERIODOS)) {
      real[p] = {};
      for (const m of Object.keys(METRICAS)) real[p][m] = n(fila[`${p}_${m}`]);
    }

    // Kg reales por tipo (para el botón "usar mis datos reales")
    const [porTipo] = await pool.query(
      `SELECT r.nTipoResiduoFK AS tipoId,
              COALESCE(SUM(CASE WHEN ${PERIODOS.mes} THEN r.nPesoKg END), 0) AS mes,
              COALESCE(SUM(CASE WHEN ${PERIODOS.anio} THEN r.nPesoKg END), 0) AS anio,
              COALESCE(SUM(r.nPesoKg), 0) AS total
         FROM tRecoleccion r JOIN tCampana c ON c.nCampanaID = r.nCampanaFK
        WHERE ${a.sql} GROUP BY r.nTipoResiduoFK`, a.params);

    res.json({
      ok: true,
      alcance: u.rol,
      constantes: { kgCo2PorArbol: KG_CO2_POR_ARBOL },
      tipos: tipos.map(t => ({
        id: t.id, nombre: t.nombre, co2: n(t.co2), energia: n(t.energia), agua: n(t.agua),
        pesoUnitario: t.pesoUnitario === null ? null : n(t.pesoUnitario), unidad: t.unidad || ''
      })),
      real,
      realPorTipo: porTipo.map(x => ({ tipoId: x.tipoId, mes: n(x.mes), anio: n(x.anio), total: n(x.total) }))
    });
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({ ok: false, error: 'Falta ejecutar la migración sql/migracion_calculadora.sql en MySQL Workbench' });
    }
    next(e);
  }
});

module.exports = router;
