const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

const falla = (res, codigo, mensaje) => res.status(codigo).json({ error: mensaje });
const envolver = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  falla(res, 500, 'Error en el servidor');
});

// fecha: la app maneja milisegundos (Long); la BD guarda DATETIME
const aFecha = (ms) => new Date(Number(ms));
const aMs = (f) => new Date(f).getTime();

function evento(e) {
  return {
    id: e.id, id_usuario: e.id_usuario, titulo: e.titulo, descripcion: e.descripcion,
    categoria: e.categoria, tipo: e.tipo, fecha_hora: aMs(e.fecha_hora), lugar: e.lugar,
    cupo: e.cupo, cupos_disponibles: e.cupos_disponibles, precio: e.precio,
    estado: e.estado, ruta_imagen: e.ruta_imagen,
  };
}

const entrada = (n) => ({
  id: n.id, id_evento: n.id_evento, id_usuario: n.id_usuario, codigo: n.codigo,
  precio: n.precio, fecha_emision: aMs(n.fecha_emision), usada: !!n.usada,
});

const usuario = (u, token) => ({ id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, token });

async function autenticar(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  const u = m ? await db.uno('SELECT * FROM usuarios WHERE token = ?', [m[1]]) : null;
  if (!u) return falla(res, 401, 'Debes iniciar sesión');
  req.usuario = u;
  next();
}

async function nuevoToken(id) {
  const token = crypto.randomBytes(24).toString('hex');
  await db.ejecutar('UPDATE usuarios SET token = ? WHERE id = ?', [token, id]);
  return token;
}

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

router.get('/', (req, res) => res.json({ servicio: 'EventApp REST', estado: 'activo' }));

// ---------- usuarios ----------
router.post('/registro', envolver(async (req, res) => {
  const nombre = texto(req.body.nombre);
  const correo = texto(req.body.correo).toLowerCase();
  const clave = texto(req.body.contrasena); // SHA-256 enviado por la app
  if (!nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || !clave) return falla(res, 400, 'Datos incompletos o correo no válido');
  if (await db.uno('SELECT id FROM usuarios WHERE correo = ?', [correo])) return falla(res, 409, 'Ese correo ya está registrado');
  const r = await db.ejecutar("INSERT INTO usuarios (nombre, correo, contrasena, rol) VALUES (?, ?, ?, 'USUARIO')", [nombre, correo, db.guardarClave(clave)]);
  const u = await db.uno('SELECT * FROM usuarios WHERE id = ?', [r.insertId]);
  res.status(201).json(usuario(u, await nuevoToken(u.id)));
}));

router.post('/login', envolver(async (req, res) => {
  const u = await db.uno('SELECT * FROM usuarios WHERE correo = ?', [texto(req.body.correo).toLowerCase()]);
  if (!u || !db.claveValida(texto(req.body.contrasena), u.contrasena)) return falla(res, 401, 'Correo o contraseña incorrectos');
  res.json(usuario(u, await nuevoToken(u.id)));
}));

router.put('/usuarios/:id', autenticar, envolver(async (req, res) => {
  if (Number(req.params.id) !== req.usuario.id) return falla(res, 403, 'No puedes editar a otro usuario');
  const nombre = texto(req.body.nombre) || req.usuario.nombre;
  const correo = texto(req.body.correo).toLowerCase() || req.usuario.correo;
  try {
    await db.ejecutar('UPDATE usuarios SET nombre = ?, correo = ? WHERE id = ?', [nombre, correo, req.usuario.id]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return falla(res, 409, 'Ese correo ya está registrado');
    throw e;
  }
  res.json({ id: req.usuario.id, nombre, correo });
}));

// ---------- eventos ----------
router.get('/eventos', envolver(async (req, res) => {
  const q = `%${texto(req.query.q)}%`;
  const cat = `%${texto(req.query.categoria)}%`;
  const filas = await db.consultar(
    "SELECT * FROM eventos WHERE estado = 'Activo' AND (titulo LIKE ? OR lugar LIKE ?) AND categoria LIKE ? ORDER BY id DESC",
    [q, q, cat]
  );
  res.json(filas.map(evento));
}));

router.get('/eventos/mios', autenticar, envolver(async (req, res) => {
  const filas = await db.consultar('SELECT * FROM eventos WHERE id_usuario = ? ORDER BY id DESC', [req.usuario.id]);
  res.json(filas.map(evento));
}));

router.get('/eventos/:id', envolver(async (req, res) => {
  const e = await db.uno('SELECT * FROM eventos WHERE id = ?', [req.params.id]);
  if (!e) return falla(res, 404, 'Evento no encontrado');
  res.json(evento(e));
}));

function leerEvento(b) {
  const d = {
    titulo: texto(b.titulo), descripcion: texto(b.descripcion), categoria: texto(b.categoria), tipo: texto(b.tipo),
    fecha_hora: aFecha(b.fecha_hora), lugar: texto(b.lugar), cupo: parseInt(b.cupo, 10),
    precio: Number(b.precio || 0), ruta_imagen: texto(b.ruta_imagen) || null,
  };
  if (!d.titulo || !d.descripcion || !d.lugar) return 'Faltan datos del evento';
  if (!['Taller', 'Webinar', 'Charla'].includes(d.categoria)) return 'Categoría no válida';
  if (!['Presencial', 'Virtual'].includes(d.tipo)) return 'Tipo de evento no válido';
  if (isNaN(d.fecha_hora)) return 'Fecha no válida';
  if (!(d.cupo >= 1)) return 'El cupo debe ser al menos 1';
  if (!(d.precio >= 0)) return 'Precio no válido';
  return d;
}

router.post('/eventos', autenticar, envolver(async (req, res) => {
  const d = leerEvento(req.body);
  if (typeof d === 'string') return falla(res, 400, d);
  const r = await db.ejecutar(
    `INSERT INTO eventos (id_usuario, titulo, descripcion, categoria, tipo, fecha_hora, lugar, cupo, cupos_disponibles, precio, ruta_imagen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.usuario.id, d.titulo, d.descripcion, d.categoria, d.tipo, d.fecha_hora, d.lugar, d.cupo, d.cupo, d.precio, d.ruta_imagen]
  );
  res.status(201).json(evento(await db.uno('SELECT * FROM eventos WHERE id = ?', [r.insertId])));
}));

async function eventoPropio(req, res) {
  const e = await db.uno('SELECT * FROM eventos WHERE id = ?', [req.params.id]);
  if (!e) { falla(res, 404, 'Evento no encontrado'); return null; }
  if (e.id_usuario !== req.usuario.id && req.usuario.rol !== 'ADMIN') { falla(res, 403, 'No es tu evento'); return null; }
  return e;
}

router.put('/eventos/:id', autenticar, envolver(async (req, res) => {
  const e = await eventoPropio(req, res);
  if (!e) return;
  const d = leerEvento({ ...e, fecha_hora: aMs(e.fecha_hora), ...req.body });
  if (typeof d === 'string') return falla(res, 400, d);
  const vendidas = e.cupo - e.cupos_disponibles;
  if (d.cupo < vendidas) return falla(res, 400, `El cupo no puede ser menor a las ${vendidas} entradas emitidas`);
  await db.ejecutar(
    `UPDATE eventos SET titulo = ?, descripcion = ?, categoria = ?, tipo = ?, fecha_hora = ?, lugar = ?,
     cupo = ?, cupos_disponibles = ?, precio = ?, ruta_imagen = ? WHERE id = ?`,
    [d.titulo, d.descripcion, d.categoria, d.tipo, d.fecha_hora, d.lugar, d.cupo, d.cupo - vendidas, d.precio, d.ruta_imagen, e.id]
  );
  res.json(evento(await db.uno('SELECT * FROM eventos WHERE id = ?', [e.id])));
}));

router.delete('/eventos/:id', autenticar, envolver(async (req, res) => {
  const e = await eventoPropio(req, res);
  if (!e) return;
  await db.ejecutar('DELETE FROM eventos WHERE id = ?', [e.id]);
  res.json({ ok: true });
}));

// ---------- entradas ----------
router.get('/entradas', autenticar, envolver(async (req, res) => {
  const filas = await db.consultar('SELECT * FROM entradas WHERE id_usuario = ? ORDER BY id DESC', [req.usuario.id]);
  res.json(filas.map(entrada));
}));

router.get('/entradas/codigo/:codigo', autenticar, envolver(async (req, res) => {
  const n = await db.uno('SELECT * FROM entradas WHERE codigo = ?', [req.params.codigo]);
  if (!n) return falla(res, 404, 'Entrada no encontrada');
  res.json(entrada(n));
}));

router.post('/entradas', autenticar, envolver(async (req, res) => {
  const idEvento = parseInt(req.body.id_evento, 10);
  const codigo = texto(req.body.codigo) || crypto.randomBytes(6).toString('hex').toUpperCase();
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[e]] = await conn.query('SELECT * FROM eventos WHERE id = ? FOR UPDATE', [idEvento]);
    if (!e || e.estado !== 'Activo') { await conn.rollback(); return falla(res, 404, 'Evento no disponible'); }
    if (new Date(e.fecha_hora) < new Date()) { await conn.rollback(); return falla(res, 400, 'El evento ya venció'); }
    if (e.cupos_disponibles <= 0) { await conn.rollback(); return falla(res, 409, 'No quedan cupos'); }
    const [[dup]] = await conn.query('SELECT id FROM entradas WHERE id_evento = ? AND id_usuario = ?', [idEvento, req.usuario.id]);
    if (dup) { await conn.rollback(); return falla(res, 409, 'Ya tienes una entrada para este evento'); }
    const fecha = req.body.fecha_emision ? aFecha(req.body.fecha_emision) : new Date();
    const [r] = await conn.query(
      'INSERT INTO entradas (id_evento, id_usuario, codigo, precio, fecha_emision) VALUES (?, ?, ?, ?, ?)',
      [idEvento, req.usuario.id, codigo, e.precio, fecha]
    );
    await conn.query('UPDATE eventos SET cupos_disponibles = cupos_disponibles - 1 WHERE id = ?', [idEvento]);
    await conn.commit();
    const [[n]] = await conn.query('SELECT * FROM entradas WHERE id = ?', [r.insertId]);
    res.status(201).json(entrada(n));
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return falla(res, 409, 'Código o entrada duplicada');
    throw err;
  } finally {
    conn.release();
  }
}));

router.put('/entradas/:id/usar', autenticar, envolver(async (req, res) => {
  const n = await db.uno(
    'SELECT n.*, e.id_usuario AS organizador FROM entradas n JOIN eventos e ON e.id = n.id_evento WHERE n.id = ?',
    [req.params.id]
  );
  if (!n) return falla(res, 404, 'Entrada no encontrada');
  if (n.organizador !== req.usuario.id && req.usuario.rol !== 'ADMIN') return falla(res, 403, 'Solo el organizador valida entradas');
  if (n.usada) return falla(res, 409, 'La entrada ya fue usada');
  await db.ejecutar('UPDATE entradas SET usada = 1 WHERE id = ?', [n.id]);
  res.json({ ...entrada(n), usada: true });
}));

// ---------- reportes ----------
router.post('/reportes', autenticar, envolver(async (req, res) => {
  const idEvento = parseInt(req.body.id_evento, 10);
  const motivo = texto(req.body.motivo);
  if (!motivo) return falla(res, 400, 'Indica el motivo');
  if (!(await db.uno('SELECT id FROM eventos WHERE id = ?', [idEvento]))) return falla(res, 404, 'Evento no encontrado');
  try {
    const r = await db.ejecutar(
      'INSERT INTO reportes (id_evento, id_usuario, motivo, comentario, fecha) VALUES (?, ?, ?, ?, ?)',
      [idEvento, req.usuario.id, motivo, texto(req.body.comentario) || null, req.body.fecha ? aFecha(req.body.fecha) : new Date()]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return falla(res, 409, 'Ya reportaste este evento');
    throw e;
  }
}));

router.use((req, res) => falla(res, 404, 'Servicio no encontrado'));

module.exports = router;
