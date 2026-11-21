const express = require('express');
const pool = require('../db');
const { requiereAuth, requiereRol } = require('../middleware/auth');

// Módulo Incentivos y canje.
//  - Catálogo: todos lo ven; solo el administrador crea, edita y retira premios.
//  - Canje: lo hace el estudiante con sus puntos (procedimiento sp_registrar_canje, en una transacción).
//    Queda "pendiente" con un código de entrega de 6 dígitos que solo ve el estudiante.
//  - Entrega: el docente de ese estudiante (o el administrador) escribe el código que le muestra
//    el estudiante y confirma. Si no se puede entregar, se cancela: se devuelven puntos e inventario.
const router = express.Router();
router.use(requiereAuth);
const SOLO_ADMIN = requiereRol('administrador');
const SOLO_EST = requiereRol('estudiante');
const ADM_DOC = requiereRol('administrador', 'docente');

const mal = (res, error, code = 400) => res.status(code).json({ ok: false, error });
const entero = (v, def = 0) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : def; };
const CATEGORIAS = ['tecnologia', 'utiles_escolares', 'experiencias', 'sostenibles'];

async function estudianteDe(usuarioId) {
  const [r] = await pool.query(
    'SELECT nEstudianteID AS id, nGrupoFK AS grupo, eEstadoAutorizacion AS autorizacion FROM tEstudiante WHERE nUsuarioFK = ?', [usuarioId]);
  return r[0] || null;
}

async function saldoDe(estudianteId) {
  const [[s]] = await pool.query('SELECT COALESCE(SUM(nPuntos), 0) AS saldo FROM tPunto WHERE nEstudianteFK = ?', [estudianteId]);
  return Number(s.saldo);
}

// Qué canjes puede ver cada rol (alias: cj = tCanje, i = tIncentivo, e = tEstudiante)
//  estudiante: los suyos · docente: los de estudiantes de sus grupos · administrador: los de su institución
const FROM_CANJES = `FROM tCanje cj
    JOIN tIncentivo i ON i.nIncentivoID = cj.nIncentivoFK
    JOIN tEstudiante e ON e.nEstudianteID = cj.nEstudianteFK
    JOIN tUsuario ue ON ue.nUsuarioID = e.nUsuarioFK
    JOIN tGrupo g ON g.nGrupoID = e.nGrupoFK
    LEFT JOIN tUsuario ud ON ud.nUsuarioID = cj.nUsuarioEntregaFK`;

function alcanceCanjes(u, estudianteId) {
  if (u.rol === 'estudiante') return { sql: 'cj.nEstudianteFK = ?', params: [estudianteId] };
  let sql = 'i.nInstitucionFK = ?';
  const params = [u.inst];
  if (u.rol === 'docente') {
    sql += ' AND e.nGrupoFK IN (SELECT nGrupoFK FROM tDocenteGrupo WHERE nUsuarioFK = ?)';
    params.push(u.id);
  }
  return { sql, params };
}

// Valida los datos de un incentivo; devuelve { error } o { v }
function leerIncentivo(b) {
  const t = x => (typeof x === 'string' ? x.trim() : '');
  const nombre = t(b.nombre), descripcion = t(b.descripcion), imagen = t(b.imagen);
  const costo = Number(b.costo), cantidad = Number(b.cantidad);
  if (nombre.length < 2 || nombre.length > 150) return { error: 'El nombre debe tener entre 2 y 150 caracteres' };
  if (descripcion.length > 150) return { error: 'La descripción admite máximo 150 caracteres' };
  if (!CATEGORIAS.includes(b.categoria)) return { error: 'Elige una categoría válida' };
  if (!Number.isInteger(costo) || costo < 1 || costo > 10000000) return { error: 'El costo debe ser un número entero de puntos mayor que 0' };
  if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 1000000) return { error: 'La cantidad disponible debe ser un entero de 0 o más' };
  if (imagen && (imagen.length > 255 || !/^https?:\/\/\S+$/i.test(imagen))) return { error: 'La imagen debe ser un enlace que empiece por http:// o https://' };
  return { v: { nombre, descripcion: descripcion || null, imagen: imagen || null, categoria: b.categoria, costo, cantidad } };
}

// ---------- GET /api/incentivos  (catálogo + tarjetas de resumen según el rol) ----------
router.get('/', async (req, res, next) => {
  try {
    const u = req.usuario;
    const esAdmin = u.rol === 'administrador';
    const [rows] = await pool.query(
      `SELECT nIncentivoID AS id, cNombre AS nombre, cDescripcion AS descripcion, cImagen AS imagen,
              eCategoria AS categoria, nCostoPuntos AS costo, nCantidadDisponible AS disponibles, lActivo AS activo
         FROM tIncentivo WHERE nInstitucionFK = ?${esAdmin ? '' : ' AND lActivo = 1'}
        ORDER BY nCostoPuntos DESC, cNombre`, [u.inst]);
    const catalogo = rows.map(r => ({ ...r, costo: Number(r.costo), disponibles: Number(r.disponibles), activo: !!r.activo }));
    const resumen = { disponibles: catalogo.filter(c => c.activo && c.disponibles > 0).length };
    const MES = "DATE_FORMAT(CURDATE(), '%Y-%m')";

    if (u.rol === 'estudiante') {
      const est = await estudianteDe(u.id);
      if (!est) return mal(res, 'Tu cuenta de estudiante está incompleta', 403);
      const [[c]] = await pool.query(
        `SELECT COALESCE(SUM(eEstado = 'pendiente'), 0) AS pendientes,
                COALESCE(SUM(eEstado <> 'cancelado' AND DATE_FORMAT(dFecha, '%Y-%m') = ${MES}), 0) AS mes
           FROM tCanje WHERE nEstudianteFK = ?`, [est.id]);
      Object.assign(resumen, {
        saldo: await saldoDe(est.id), autorizacion: est.autorizacion,
        pendientes: Number(c.pendientes), canjeadosMes: Number(c.mes)
      });
    } else {
      const a = alcanceCanjes(u);
      const [[c]] = await pool.query(
        `SELECT COALESCE(SUM(cj.eEstado = 'pendiente'), 0) AS pendientes,
                COALESCE(SUM(cj.eEstado = 'entregado' AND DATE_FORMAT(cj.dFechaEntrega, '%Y-%m') = ${MES}), 0) AS entregadosMes,
                COALESCE(SUM(CASE WHEN cj.eEstado <> 'cancelado' AND DATE_FORMAT(cj.dFecha, '%Y-%m') = ${MES}
                                  THEN cj.nPuntosUsados END), 0) AS puntosMes
           ${FROM_CANJES} WHERE ${a.sql}`, a.params);
      Object.assign(resumen, {
        pendientes: Number(c.pendientes), entregadosMes: Number(c.entregadosMes), puntosMes: Number(c.puntosMes)
      });
    }
    res.json({ ok: true, catalogo, resumen });
  } catch (e) { next(e); }
});

// ---------- POST /api/incentivos  (crear; solo administrador) ----------
router.post('/', SOLO_ADMIN, async (req, res, next) => {
  try {
    const r = leerIncentivo(req.body || {});
    if (r.error) return mal(res, r.error);
    const v = r.v;
    const [ins] = await pool.query(
      `INSERT INTO tIncentivo (nInstitucionFK, cNombre, cDescripcion, cImagen, eCategoria, nCostoPuntos, nCantidadDisponible)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.usuario.inst, v.nombre, v.descripcion, v.imagen, v.categoria, v.costo, v.cantidad]);
    res.status(201).json({ ok: true, id: ins.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return mal(res, 'Ya existe un incentivo con ese nombre', 409);
    next(e);
  }
});

// ---------- PUT /api/incentivos/:id  (editar o retirar; solo administrador) ----------
router.put('/:id', SOLO_ADMIN, async (req, res, next) => {
  try {
    const id = entero(req.params.id);
    if (!id) return mal(res, 'Identificador inválido');
    const b = req.body || {};
    const r = leerIncentivo(b);
    if (r.error) return mal(res, r.error);
    const v = r.v;
    const activo = typeof b.activo === 'boolean' ? (b.activo ? 1 : 0) : null;
    const [ex] = await pool.query('SELECT 1 FROM tIncentivo WHERE nIncentivoID = ? AND nInstitucionFK = ?', [id, req.usuario.inst]);
    if (!ex.length) return mal(res, 'Incentivo no encontrado', 404);
    await pool.query(
      `UPDATE tIncentivo SET cNombre = ?, cDescripcion = ?, cImagen = ?, eCategoria = ?, nCostoPuntos = ?,
              nCantidadDisponible = ?, lActivo = COALESCE(?, lActivo)
        WHERE nIncentivoID = ? AND nInstitucionFK = ?`,
      [v.nombre, v.descripcion, v.imagen, v.categoria, v.costo, v.cantidad, activo, id, req.usuario.inst]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return mal(res, 'Ya existe un incentivo con ese nombre', 409);
    next(e);
  }
});

// ---------- POST /api/incentivos/:id/canjear  (solo estudiante) ----------
// El procedimiento verifica inventario, saldo e institución, descuenta los puntos y reserva el premio.
router.post('/:id/canjear', SOLO_EST, async (req, res, next) => {
  let conn;
  try {
    const u = req.usuario, id = entero(req.params.id);
    if (!id) return mal(res, 'Incentivo inválido');
    const est = await estudianteDe(u.id);
    if (!est) return mal(res, 'Tu cuenta de estudiante está incompleta', 403);
    if (est.autorizacion !== 'autorizada') return mal(res, 'Tu autorización de datos aún no está vigente. Consulta con tu docente.', 403);
    const [inc] = await pool.query('SELECT lActivo FROM tIncentivo WHERE nIncentivoID = ? AND nInstitucionFK = ?', [id, u.inst]);
    if (!inc.length || !inc[0].lActivo) return mal(res, 'Ese incentivo no está disponible', 404);

    conn = await pool.getConnection(); // el @nCanjeID vive en la sesión: hay que usar la misma conexión
    await conn.query('CALL sp_registrar_canje(?, ?, ?, @nCanjeID)', [est.id, id, u.id]);
    const [[o]] = await conn.query('SELECT @nCanjeID AS id');
    const [[c]] = await pool.query('SELECT cCodigoEntrega AS codigo FROM tCanje WHERE nCanjeID = ?', [o.id]);
    res.status(201).json({ ok: true, id: Number(o.id), codigo: c.codigo, saldo: await saldoDe(est.id) });
  } catch (e) {
    // Mensajes del procedimiento: "Puntos insuficientes", "No hay inventario disponible"...
    if (e.sqlState === '45000') return mal(res, e.sqlMessage, 409);
    next(e);
  } finally { if (conn) conn.release(); }
});

// ---------- GET /api/incentivos/canjes?estado=&q= ----------
router.get('/canjes', async (req, res, next) => {
  try {
    const u = req.usuario;
    let estId = null;
    if (u.rol === 'estudiante') {
      const est = await estudianteDe(u.id);
      if (!est) return res.json({ ok: true, canjes: [] });
      estId = est.id;
    }
    const a = alcanceCanjes(u, estId);
    let where = a.sql;
    const params = [...a.params];
    if (['pendiente', 'entregado', 'cancelado'].includes(req.query.estado)) { where += ' AND cj.eEstado = ?'; params.push(req.query.estado); }
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (q && u.rol !== 'estudiante') {
      where += " AND CONCAT(ue.cNombre, ' ', ue.cApellido) LIKE ?";
      params.push('%' + q.replace(/[\\%_]/g, '\\$&') + '%');
    }
    const [rows] = await pool.query(
      `SELECT cj.nCanjeID AS id, DATE_FORMAT(cj.dFecha, '%Y-%m-%d %H:%i') AS fecha,
              ue.cNombre AS nombre, ue.cApellido AS apellido, g.cNombre AS grupo,
              i.cNombre AS incentivo, i.eCategoria AS categoria, cj.nPuntosUsados AS puntos, cj.eEstado AS estado,
              DATE_FORMAT(cj.dFechaEntrega, '%Y-%m-%d %H:%i') AS fechaEntrega,
              CONCAT(ud.cNombre, ' ', ud.cApellido) AS entregadoPor,
              cj.cMotivoCancelacion AS motivo, cj.cCodigoEntrega AS codigo
         ${FROM_CANJES} WHERE ${where}
        ORDER BY FIELD(cj.eEstado, 'pendiente', 'entregado', 'cancelado'), cj.dFecha DESC, cj.nCanjeID DESC LIMIT 200`, params);
    res.json({
      ok: true,
      // El código solo lo recibe el estudiante dueño del canje y solo mientras está pendiente
      canjes: rows.map(r => ({ ...r, puntos: Number(r.puntos), codigo: u.rol === 'estudiante' && r.estado === 'pendiente' ? r.codigo : null }))
    });
  } catch (e) { next(e); }
});

// ---------- POST /api/incentivos/canjes/:id/entregar  { codigo } ----------
router.post('/canjes/:id/entregar', ADM_DOC, async (req, res, next) => {
  try {
    const u = req.usuario, id = entero(req.params.id);
    if (!id) return mal(res, 'Canje inválido');
    const codigo = String((req.body || {}).codigo || '').replace(/\D/g, '');
    if (codigo.length !== 6) return mal(res, 'Escribe el código de 6 dígitos que muestra el estudiante');
    const a = alcanceCanjes(u);
    const [r] = await pool.query(
      `SELECT cj.eEstado AS estado, cj.cCodigoEntrega AS codigo ${FROM_CANJES} WHERE cj.nCanjeID = ? AND ${a.sql}`, [id, ...a.params]);
    if (!r.length) return mal(res, 'Canje no encontrado (o el estudiante no es de tus grupos)', 404);
    if (r[0].estado !== 'pendiente') return mal(res, 'Este canje ya no está pendiente', 409);
    if (r[0].codigo !== codigo) return mal(res, 'El código no coincide con el de este canje. Pídele al estudiante que lo revise en "Mis canjes".');
    const [up] = await pool.query(
      `UPDATE tCanje SET eEstado = 'entregado', nUsuarioEntregaFK = ?, dFechaEntrega = NOW()
        WHERE nCanjeID = ? AND eEstado = 'pendiente'`, [u.id, id]);
    if (!up.affectedRows) return mal(res, 'Este canje ya no está pendiente', 409);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- POST /api/incentivos/canjes/:id/cancelar  { motivo } ----------
// Devuelve los puntos al estudiante (quita el movimiento negativo) y el premio al inventario.
router.post('/canjes/:id/cancelar', ADM_DOC, async (req, res, next) => {
  const u = req.usuario, id = entero(req.params.id);
  if (!id) return mal(res, 'Canje inválido');
  const motivo = typeof (req.body || {}).motivo === 'string' ? req.body.motivo.trim() : '';
  if (motivo.length < 3 || motivo.length > 150) return mal(res, 'Escribe el motivo de la cancelación (3 a 150 caracteres)');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const a = alcanceCanjes(u);
    const [r] = await conn.query(
      `SELECT cj.eEstado AS estado, cj.nIncentivoFK AS incentivo ${FROM_CANJES}
        WHERE cj.nCanjeID = ? AND ${a.sql} FOR UPDATE OF cj`, [id, ...a.params]);
    if (!r.length) { await conn.rollback(); return mal(res, 'Canje no encontrado (o el estudiante no es de tus grupos)', 404); }
    if (r[0].estado !== 'pendiente') { await conn.rollback(); return mal(res, 'Solo se pueden cancelar canjes pendientes', 409); }
    await conn.query(
      `UPDATE tCanje SET eEstado = 'cancelado', dFechaCancelacion = NOW(), cMotivoCancelacion = ? WHERE nCanjeID = ?`, [motivo, id]);
    await conn.query('DELETE FROM tPunto WHERE nCanjeFK = ?', [id]);
    await conn.query('UPDATE tIncentivo SET nCantidadDisponible = nCantidadDisponible + 1 WHERE nIncentivoID = ?', [r[0].incentivo]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

module.exports = router;
