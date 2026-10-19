const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'eventapp',
  timezone: '-05:00',
  waitForConnections: true,
  connectionLimit: 5,
  multipleStatements: true,
  decimalNumbers: true,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

async function consultar(sql, params = []) {
  const [filas] = await pool.query(sql, params);
  return filas;
}

async function uno(sql, params = []) {
  const filas = await consultar(sql, params);
  return filas[0] || null;
}

async function ejecutar(sql, params = []) {
  const [r] = await pool.query(sql, params);
  return r;
}

const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex');

// La app envía su contraseña ya en SHA-256; el servidor la guarda con bcrypt encima.
const guardarClave = (sha) => bcrypt.hashSync(sha, 10);
const claveValida = (sha, guardada) => bcrypt.compareSync(sha, guardada);

async function iniciar() {
  const script = fs.readFileSync(path.join(__dirname, 'sql', 'eventapp.sql'), 'utf8');
  await pool.query(script);

  const admin = await uno("SELECT id FROM usuarios WHERE rol = 'ADMIN' LIMIT 1");
  if (!admin) {
    const correo = process.env.ADMIN_CORREO || 'admin@eventapp.com';
    const clave = process.env.ADMIN_CLAVE || 'admin123';
    await ejecutar("INSERT INTO usuarios (nombre, correo, contrasena, rol) VALUES (?, ?, ?, 'ADMIN')", [
      'Administrador',
      correo,
      guardarClave(sha256(clave)),
    ]);
    console.log(`Administrador creado: ${correo}`);
  }
}

module.exports = { consultar, uno, ejecutar, iniciar, sha256, guardarClave, claveValida, pool };
