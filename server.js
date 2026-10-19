const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');
const util = require('./util');
const tablas = require('./routes/tablas');
const { montar } = require('./routes/crud');
const api = require('./routes/api');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', api);

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'eventapp-clave-local',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
  })
);

app.use((req, res, next) => {
  res.locals.admin = req.session.admin || null;
  res.locals.aviso = req.session.aviso || null;
  delete req.session.aviso;
  res.locals.formatear = util.formatear;
  res.locals.fechaLima = util.fechaLima;
  res.locals.inputLima = util.inputLima;
  next();
});

app.get('/', (req, res) => res.redirect(req.session.admin ? '/dashboard' : '/login'));

app.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

app.post('/ingresar', async (req, res) => {
  const u = await db.uno("SELECT * FROM usuarios WHERE correo = ? AND rol = 'ADMIN'", [String(req.body.correo || '').trim()]);
  if (u && db.claveValida(db.sha256(String(req.body.clave || '')), u.contrasena)) {
    req.session.admin = { id: u.id, nombre: u.nombre };
    return res.redirect('/dashboard');
  }
  res.render('login', { error: 'Correo o contraseña incorrectos.' });
});

app.get('/salir', (req, res) => req.session.destroy(() => res.redirect('/login')));

// todo lo que sigue exige sesión de administrador
app.use((req, res, next) => (req.session.admin ? next() : res.redirect('/login')));

app.get('/dashboard', async (req, res) => {
  const n = async (sql) => (await db.uno(sql)).n;
  const cifras = {
    Usuarios: await n('SELECT COUNT(*) AS n FROM usuarios'),
    'Eventos activos': await n("SELECT COUNT(*) AS n FROM eventos WHERE estado = 'Activo'"),
    'Entradas emitidas': await n('SELECT COUNT(*) AS n FROM entradas'),
    'Reportes pendientes': await n("SELECT COUNT(*) AS n FROM reportes WHERE estado = 'Pendiente'"),
  };
  const eventos = await db.consultar(
    'SELECT e.id, e.titulo, e.fecha_hora, e.estado, u.nombre AS organizador FROM eventos e JOIN usuarios u ON u.id = e.id_usuario ORDER BY e.id DESC LIMIT 5'
  );
  const reportes = await db.consultar(
    "SELECT r.id, e.titulo, r.motivo FROM reportes r JOIN eventos e ON e.id = r.id_evento WHERE r.estado = 'Pendiente' ORDER BY r.id DESC LIMIT 5"
  );
  res.render('dashboard', { titulo: 'Panel', activa: 'dashboard', cifras, eventos, reportes });
});

tablas.forEach((cfg) => montar(app, cfg));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Ocurrió un error en el servidor.');
});

const puerto = process.env.PORT || 3000;
db.iniciar()
  .then(() => app.listen(puerto, () => console.log(`Portal EventApp en el puerto ${puerto}`)))
  .catch((e) => {
    console.error('No se pudo conectar a la base de datos:', e.message);
    process.exit(1);
  });
