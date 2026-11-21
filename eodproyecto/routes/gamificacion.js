const express = require('express');
const pool = require('../db');
const { requiereAuth, requiereRol } = require('../middleware/auth');

// Módulo Gamificación (no necesita migración: usa tPunto, tLogro, tLogroEstudiante, tIncentivo...).
//  - Estudiante: sus puntos, nivel, logros, misiones del mes, posición y ranking de grupos.
//  - Docente / administrador: vista de la institución (puntos entregados, logros, mejores estudiantes).
//  - Logros: se otorgan solos al llegar a los puntos acumulados (nTotalGanado) que pide cada logro.
//  - Misiones: se calculan con las recolecciones reales; al completarlas el estudiante las reclama y
//    recibe un movimiento 'bono' en el libro de puntos (una sola vez por misión y por mes).
const router = express.Router();
router.use(requiereAuth);
const SOLO_EST = requiereRol('estudiante');
const mal = (res, error, code = 400) => res.status(code).json({ ok: false, error });

// Niveles según los puntos acumulados (los puntos canjeados NO bajan el nivel)
const NIVELES = [[0, 'Eco Semilla'], [500, 'Eco Brote'], [1500, 'Eco Explorador'], [3000, 'Eco Guardián'], [5000, 'Eco Héroe'], [8000, 'Eco Leyenda']];
function nivelDe(ganado) {
  let i = 0;
  NIVELES.forEach((n, k) => { if (ganado >= n[0]) i = k; });
  const sig = NIVELES[i + 1];
  return { n: i + 1, nombre: NIVELES[i][1], desde: NIVELES[i][0], hasta: sig ? sig[0] : null, siguiente: sig ? sig[1] : null };
}

// Misiones del mes. "unica" = se reclama una sola vez en la vida; las demás se renuevan cada mes.
const MISIONES = [
  { id: 'kg5', titulo: 'Recicla 5 kg de residuos', desc: 'Entrega 5 kg de residuos en las recolecciones de este mes.', meta: 5, unidad: 'kg', puntos: 200 },
  { id: 'rec3', titulo: 'Haz 3 entregas', desc: 'Registra 3 recolecciones a tu nombre este mes.', meta: 3, unidad: '', puntos: 150 },
  { id: 'campana', titulo: 'Participa en una campaña', desc: 'Inscríbete al menos en 1 campaña en curso de tu institución.', meta: 1, unidad: '', puntos: 300, unica: true }
];

const GANADO = 'COALESCE(SUM(CASE WHEN p.nPuntos > 0 THEN p.nPuntos END), 0)';

async function estudianteDe(usuarioId) {
  const [r] = await pool.query(
    'SELECT nEstudianteID AS id, nGrupoFK AS grupo, eEstadoAutorizacion AS autorizacion FROM tEstudiante WHERE nUsuarioFK = ?', [usuarioId]);
  return r[0] || null;
}

// Otorga los logros cuyos puntos ya se alcanzaron (INSERT IGNORE: no duplica)
async function otorgarLogros(inst, estudianteId) {
  await pool.query(
    `INSERT IGNORE INTO tLogroEstudiante (nLogroFK, nEstudianteFK)
     SELECT l.nLogroID, v.id FROM tLogro l
       JOIN (SELECT e.nEstudianteID AS id, ${GANADO} AS ganado
               FROM tEstudiante e JOIN tUsuario u ON u.nUsuarioID = e.nUsuarioFK
               LEFT JOIN tPunto p ON p.nEstudianteFK = e.nEstudianteID
              WHERE u.nInstitucionFK = ?${estudianteId ? ' AND e.nEstudianteID = ?' : ''}
              GROUP BY e.nEstudianteID) v
         ON l.nPuntosRequeridos > 0 AND v.ganado >= l.nPuntosRequeridos`,
    estudianteId ? [inst, estudianteId] : [inst]);
}

async function progresoMisiones(db, estId, inst) {
  const [[m]] = await db.query(
    `SELECT DATE_FORMAT(CURDATE(), '%Y-%m') AS mes,
            COALESCE((SELECT SUM(nPesoKg) FROM tRecoleccion WHERE nEstudianteFK = ? AND DATE_FORMAT(dFecha, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')), 0) AS kg,
            (SELECT COUNT(*) FROM tRecoleccion WHERE nEstudianteFK = ? AND DATE_FORMAT(dFecha, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')) AS rec,
            (SELECT COUNT(*) FROM tInscripcionCampana i JOIN tCampana c ON c.nCampanaID = i.nCampanaFK
              WHERE i.nEstudianteFK = ? AND c.eEstado = 'en_curso' AND c.nInstitucionFK = ?) AS camp`,
    [estId, estId, estId, inst]);
  const valor = { kg5: Number(m.kg), rec3: Number(m.rec), campana: Number(m.camp) };
  const [bonos] = await db.query(
    "SELECT cDescripcion AS d FROM tPunto WHERE nEstudianteFK = ? AND eTipoMovimiento = 'bono' AND cDescripcion LIKE 'Misión %'", [estId]);
  const hechas = new Set(bonos.map(b => b.d));
  const clave = x => x.unica ? `Misión ${x.id}` : `Misión ${x.id} ${m.mes}`;
  return MISIONES.map(x => {
    const actual = Math.min(valor[x.id], x.meta);
    return { id: x.id, titulo: x.titulo, desc: x.desc, meta: x.meta, unidad: x.unidad, puntos: x.puntos,
      actual: Math.round(actual * 100) / 100, completa: valor[x.id] >= x.meta, reclamada: hechas.has(clave(x)), clave: clave(x) };
  });
}

// ---------- GET /api/gamificacion/resumen?periodo=todos|mes ----------
router.get('/resumen', async (req, res, next) => {
  try {
    const u = req.usuario;
    const esEst = u.rol === 'estudiante';
    const periodo = req.query.periodo === 'mes' ? 'mes' : 'todos';
    const est = esEst ? await estudianteDe(u.id) : null;
    if (esEst && !est) return mal(res, 'Tu cuenta de estudiante está incompleta', 403);
    await otorgarLogros(u.inst, est && est.id);

    const out = { ok: true, rol: u.rol, periodo };

    // Grupos propios (para resaltarlos en el ranking)
    let mios = [];
    if (esEst) mios = [est.grupo];
    else if (u.rol === 'docente') {
      const [g] = await pool.query('SELECT nGrupoFK AS id FROM tDocenteGrupo WHERE nUsuarioFK = ?', [u.id]);
      mios = g.map(x => x.id);
    }

    // Ranking de grupos de la institución
    const cond = periodo === 'mes' ? " AND DATE_FORMAT(p.dFecha, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')" : '';
    const [gr] = await pool.query(
      `SELECT g.nGrupoID AS id, g.cNombre AS grupo, s.cNombre AS sede,
              COALESCE(SUM(CASE WHEN p.nPuntos > 0${cond} THEN p.nPuntos END), 0) AS puntos
         FROM tGrupo g JOIN tSede s ON s.nSedeID = g.nSedeFK
         LEFT JOIN tEstudiante e ON e.nGrupoFK = g.nGrupoID
         LEFT JOIN tPunto p ON p.nEstudianteFK = e.nEstudianteID
        WHERE s.nInstitucionFK = ?
        GROUP BY g.nGrupoID, g.cNombre, s.cNombre
        ORDER BY puntos DESC, g.cNombre`, [u.inst]);
    let pos = 0;
    const filas = gr.map((r, i) => {
      const p = Number(r.puntos);
      if (i === 0 || p !== Number(gr[i - 1].puntos)) pos = i + 1;
      return { id: r.id, pos, grupo: r.grupo, sede: r.sede, puntos: p, mio: mios.includes(r.id) };
    });
    out.ranking = filas.filter((f, i) => i < 10 || f.mio).slice(0, 12);
    out.totalGrupos = filas.length;

    // Recompensas destacadas (las más baratas con inventario)
    const [inc] = await pool.query(
      `SELECT nIncentivoID AS id, cNombre AS nombre, cImagen AS imagen, eCategoria AS categoria, nCostoPuntos AS costo
         FROM tIncentivo WHERE nInstitucionFK = ? AND lActivo = 1 AND nCantidadDisponible > 0
        ORDER BY nCostoPuntos, cNombre LIMIT 4`, [u.inst]);
    out.recompensas = inc.map(r => ({ ...r, costo: Number(r.costo) }));

    if (esEst) {
      const [[pt]] = await pool.query(
        `SELECT COALESCE(SUM(nPuntos), 0) AS saldo, COALESCE(SUM(CASE WHEN nPuntos > 0 THEN nPuntos END), 0) AS ganado
           FROM tPunto WHERE nEstudianteFK = ?`, [est.id]);
      const [[camp]] = await pool.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(c.eEstado = 'finalizada'), 0) AS hechas
           FROM tInscripcionCampana i JOIN tCampana c ON c.nCampanaID = i.nCampanaFK WHERE i.nEstudianteFK = ?`, [est.id]);
      const [[rk]] = await pool.query(
        `SELECT t.pos, t.total FROM (
           SELECT e.nEstudianteID AS id, RANK() OVER (ORDER BY ${GANADO} DESC) AS pos, COUNT(*) OVER () AS total
             FROM tEstudiante e JOIN tUsuario ue ON ue.nUsuarioID = e.nUsuarioFK AND ue.nInstitucionFK = ? AND ue.lActivo = 1
             LEFT JOIN tPunto p ON p.nEstudianteFK = e.nEstudianteID GROUP BY e.nEstudianteID) t
          WHERE t.id = ?`, [u.inst, est.id]);
      const [logros] = await pool.query(
        `SELECT l.nLogroID AS id, l.cNombre AS nombre, l.cDescripcion AS descripcion, l.nPuntosRequeridos AS requeridos,
                (le.nLogroFK IS NOT NULL) AS desbloqueado
           FROM tLogro l LEFT JOIN tLogroEstudiante le ON le.nLogroFK = l.nLogroID AND le.nEstudianteFK = ?
          ORDER BY l.nPuntosRequeridos, l.nLogroID`, [est.id]);
      out.logros = logros.map(l => ({ ...l, requeridos: Number(l.requeridos), desbloqueado: !!l.desbloqueado }));
      out.personal = {
        saldo: Number(pt.saldo), ganado: Number(pt.ganado), nivel: nivelDe(Number(pt.ganado)),
        logrosOk: out.logros.filter(l => l.desbloqueado).length, logrosTotal: out.logros.length,
        campanasHechas: Number(camp.hechas), campanasTotal: Number(camp.total),
        posicion: rk ? Number(rk.pos) : null, participantes: rk ? Number(rk.total) : 0, autorizacion: est.autorizacion
      };
      out.misiones = await progresoMisiones(pool, est.id, u.inst);
    } else {
      const [[k]] = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN p.nPuntos > 0 THEN p.nPuntos END), 0) AS puntos,
                COUNT(DISTINCT CASE WHEN p.nPuntos > 0 THEN p.nEstudianteFK END) AS activos
           FROM tPunto p JOIN tEstudiante e ON e.nEstudianteID = p.nEstudianteFK
           JOIN tUsuario ue ON ue.nUsuarioID = e.nUsuarioFK WHERE ue.nInstitucionFK = ?`, [u.inst]);
      const [[c]] = await pool.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(eEstado = 'finalizada'), 0) AS hechas FROM tCampana WHERE nInstitucionFK = ?`, [u.inst]);
      const [[cj]] = await pool.query(
        `SELECT COUNT(*) AS n FROM tCanje cj JOIN tIncentivo i ON i.nIncentivoID = cj.nIncentivoFK
          WHERE i.nInstitucionFK = ? AND cj.eEstado = 'pendiente'`, [u.inst]);
      const [logros] = await pool.query(
        `SELECT l.nLogroID AS id, l.cNombre AS nombre, l.cDescripcion AS descripcion, l.nPuntosRequeridos AS requeridos,
                COUNT(ue.nUsuarioID) AS cuantos
           FROM tLogro l LEFT JOIN tLogroEstudiante le ON le.nLogroFK = l.nLogroID
           LEFT JOIN tEstudiante e ON e.nEstudianteID = le.nEstudianteFK
           LEFT JOIN tUsuario ue ON ue.nUsuarioID = e.nUsuarioFK AND ue.nInstitucionFK = ?
          GROUP BY l.nLogroID, l.cNombre, l.cDescripcion, l.nPuntosRequeridos
          ORDER BY l.nPuntosRequeridos, l.nLogroID`, [u.inst]);
      out.logros = logros.map(l => ({ ...l, requeridos: Number(l.requeridos), cuantos: Number(l.cuantos), desbloqueado: Number(l.cuantos) > 0 }));
      out.institucion = {
        puntos: Number(k.puntos), activos: Number(k.activos), logrosOtorgados: out.logros.reduce((a, l) => a + l.cuantos, 0),
        campanasHechas: Number(c.hechas), campanasTotal: Number(c.total), canjesPendientes: Number(cj.n)
      };
      const [top] = await pool.query(
        `SELECT ue.cNombre AS nombre, ue.cApellido AS apellido, g.cNombre AS grupo, ${GANADO} AS puntos
           FROM tEstudiante e JOIN tUsuario ue ON ue.nUsuarioID = e.nUsuarioFK JOIN tGrupo g ON g.nGrupoID = e.nGrupoFK
           LEFT JOIN tPunto p ON p.nEstudianteFK = e.nEstudianteID
          WHERE ue.nInstitucionFK = ? AND ue.lActivo = 1${u.rol === 'docente' ? ' AND e.nGrupoFK IN (SELECT nGrupoFK FROM tDocenteGrupo WHERE nUsuarioFK = ?)' : ''}
          GROUP BY e.nEstudianteID, ue.cNombre, ue.cApellido, g.cNombre
         HAVING puntos > 0 ORDER BY puntos DESC LIMIT 5`, u.rol === 'docente' ? [u.inst, u.id] : [u.inst]);
      out.top = top.map(t => ({ ...t, puntos: Number(t.puntos) }));
    }
    res.json(out);
  } catch (e) { next(e); }
});

// ---------- POST /api/gamificacion/misiones/:id/reclamar  (solo estudiante) ----------
router.post('/misiones/:id/reclamar', SOLO_EST, async (req, res, next) => {
  const u = req.usuario;
  const conn = await pool.getConnection();
  try {
    const est = await estudianteDe(u.id);
    if (!est) return mal(res, 'Tu cuenta de estudiante está incompleta', 403);
    if (est.autorizacion !== 'autorizada') return mal(res, 'Tu autorización de datos aún no está vigente. Consulta con tu docente.', 403);
    await conn.beginTransaction();
    // Bloquea la fila del estudiante: dos clics seguidos no pueden reclamar dos veces
    await conn.query('SELECT nEstudianteID FROM tEstudiante WHERE nEstudianteID = ? FOR UPDATE', [est.id]);
    const m = (await progresoMisiones(conn, est.id, u.inst)).find(x => x.id === req.params.id);
    if (!m) { await conn.rollback(); return mal(res, 'Misión no encontrada', 404); }
    if (m.reclamada) { await conn.rollback(); return mal(res, 'Ya reclamaste esta misión', 409); }
    if (!m.completa) { await conn.rollback(); return mal(res, 'Aún no completas esta misión', 409); }
    await conn.query(
      "INSERT INTO tPunto (nEstudianteFK, nUsuarioFK, eTipoMovimiento, nPuntos, cDescripcion) VALUES (?, ?, 'bono', ?, ?)",
      [est.id, u.id, m.puntos, m.clave]);
    await conn.commit();
    res.status(201).json({ ok: true, puntos: m.puntos });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

module.exports = router;
