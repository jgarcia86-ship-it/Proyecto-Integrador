const jwt = require('jsonwebtoken');
const pool = require('../db');

// Exige un JWT válido en el header  Authorization: Bearer <token>
// y confirma en la base de datos que la cuenta siga activa. El rol y la institución
// se leen de la base (no del token), así un cambio de rol o una desactivación
// se aplican de inmediato y no hasta que venza la sesión.
async function requiereAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token' });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET); // { id, rol, inst }
  } catch {
    return res.status(401).json({ ok: false, error: 'Sesión inválida o vencida' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT eRol, nInstitucionFK, lActivo FROM tUsuario WHERE nUsuarioID = ?', [payload.id]);
    const u = rows[0];
    if (!u || !u.lActivo) {
      return res.status(401).json({ ok: false, error: 'Tu cuenta está desactivada o ya no existe' });
    }
    req.usuario = { id: payload.id, rol: u.eRol, inst: u.nInstitucionFK };
    next();
  } catch (e) { next(e); }
}

// Uso: router.post('/x', requiereAuth, requiereRol('administrador','docente'), ...)
function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

module.exports = { requiereAuth, requiereRol };
