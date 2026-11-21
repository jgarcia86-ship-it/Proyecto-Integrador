require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

app.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM tInstitucion');
    res.json({ ok: true, instituciones: rows[0].total });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log('Servidor EOD en http://localhost:' + process.env.PORT);
});