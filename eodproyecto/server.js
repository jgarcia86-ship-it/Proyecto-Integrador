require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Frontend estático (carpeta /public)
app.use(express.static(path.join(__dirname, 'public')));

// Prueba rápida de conexión
app.get('/api/salud', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM tInstitucion');
    res.json({ ok: true, instituciones: rows[0].total });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use('/api/catalogo', require('./routes/catalogo'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/campanas', require('./routes/campanas'));
app.use('/api/grupos', require('./routes/grupos'));
app.use('/api/instituciones', require('./routes/instituciones'));
app.use('/api/incentivos', require('./routes/incentivos'));
app.use('/api/gamificacion', require('./routes/gamificacion'));
app.use('/api/recolecciones', require('./routes/recolecciones'));
app.use('/api/publico', require('./routes/publico'));
app.use('/api/informes', require('./routes/informes'));
app.use('/api/calculadora', require('./routes/calculadora'));

// 404 para rutas /api desconocidas y manejador de errores
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

app.listen(process.env.PORT, () => {
  console.log('Servidor EOD en http://localhost:' + process.env.PORT);
});
