const db = require('../db');
const { desdeInput } = require('../util');

const POR_PAGINA = 12;

async function opcionesFk(campo) {
  const [tabla, etiqueta] = campo.fk;
  const filas = await db.consultar(`SELECT id, ${etiqueta} AS texto FROM ${tabla} ORDER BY ${etiqueta}`);
  const op = {};
  filas.forEach((f) => (op[f.id] = `${f.id} - ${f.texto}`));
  return op;
}

function leerDatos(cfg, cuerpo, actual) {
  const datos = {};
  for (const c of cfg.campos) {
    const n = c.nombre;
    if (actual && c.solo_crear) continue;
    if (c.tipo === 'check') { datos[n] = cuerpo[n] ? 1 : 0; continue; }
    let v = String(cuerpo[n] ?? '').trim();
    if (c.tipo === 'password' && v === '' && actual) continue;
    if (v === '') {
      if (c.requerido) throw new Error(`El campo ${c.etiqueta} es obligatorio.`);
      datos[n] = null;
      continue;
    }
    if (c.tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('El correo no tiene un formato válido.');
    if (['number', 'decimal', 'fk'].includes(c.tipo) && isNaN(Number(v))) throw new Error(`El campo ${c.etiqueta} debe ser numérico.`);
    if (c.tipo === 'number' && Number(v) < (c.min ?? 0)) throw new Error(`El campo ${c.etiqueta} no puede ser menor a ${c.min ?? 0}.`);
    if (c.tipo === 'decimal' && Number(v) < 0) throw new Error(`El campo ${c.etiqueta} no puede ser negativo.`);
    if (c.tipo === 'select' && !(v in c.opciones)) throw new Error(`Valor no válido en ${c.etiqueta}.`);
    if (c.tipo === 'datetime') {
      v = desdeInput(v);
      if (isNaN(v)) throw new Error(`La fecha de ${c.etiqueta} no es válida.`);
    }
    datos[n] = v;
  }
  return datos;
}

function mensajeError(e) {
  if (e.code === 'ER_DUP_ENTRY') return 'Ya existe un registro con esos datos (valor duplicado).';
  if (e.code === 'ER_NO_REFERENCED_ROW_2') return 'La referencia indicada no existe.';
  if (e.code && e.code.startsWith('ER_')) { console.error(e); return 'No se pudo completar la operación.'; }
  return e.message;
}

function montar(app, cfg) {
  const base = '/' + cfg.ruta;
  const cargar = (id) => db.uno(`SELECT * FROM ${cfg.tabla} WHERE id = ?`, [id]);

  app.get(base, async (req, res) => {
    const q = String(req.query.q || '').trim();
    const pagina = Math.max(1, parseInt(req.query.p || '1', 10));
    let filtro = '';
    let params = [];
    if (q) {
      filtro = ' WHERE (' + cfg.buscar.map((c) => `t.${c} LIKE ?`).join(' OR ') + ')';
      params = cfg.buscar.map(() => `%${q}%`);
    }
    const total = (await db.uno(`SELECT COUNT(*) AS n FROM (${cfg.sql}) t${filtro}`, params)).n;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    const actual = Math.min(pagina, paginas);
    const filas = await db.consultar(
      `SELECT * FROM (${cfg.sql}) t${filtro} ORDER BY t.id DESC LIMIT ${POR_PAGINA} OFFSET ${(actual - 1) * POR_PAGINA}`,
      params
    );
    res.render('lista', { titulo: cfg.titulo, activa: cfg.ruta, cfg, filas, q, paginas, pagina: actual });
  });

  app.get(`${base}/nuevo`, async (req, res) => {
    res.render('formulario', { titulo: 'Nuevo ' + cfg.singular, activa: cfg.ruta, cfg, actual: null, opciones: await opciones(cfg) });
  });

  app.get(`${base}/:id/editar`, async (req, res) => {
    const actual = await cargar(req.params.id);
    if (!actual) { req.session.aviso = ['error', 'El registro no existe.']; return res.redirect(base); }
    res.render('formulario', { titulo: 'Editar ' + cfg.singular, activa: cfg.ruta, cfg, actual, opciones: await opciones(cfg) });
  });

  app.post(`${base}/guardar`, async (req, res) => {
    const id = parseInt(req.body.id || '0', 10);
    try {
      const actual = id ? await cargar(id) : null;
      if (id && !actual) throw new Error('El registro ya no existe.');
      let datos = leerDatos(cfg, req.body, actual);
      if (cfg.antes) datos = await cfg.antes(datos, actual, req);
      if (actual) {
        const sets = Object.keys(datos).map((k) => `${k} = ?`).join(', ');
        await db.ejecutar(`UPDATE ${cfg.tabla} SET ${sets} WHERE id = ?`, [...Object.values(datos), actual.id]);
      } else {
        const cols = Object.keys(datos);
        await db.ejecutar(`INSERT INTO ${cfg.tabla} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, Object.values(datos));
      }
      req.session.aviso = ['ok', actual ? 'Registro actualizado.' : 'Registro creado.'];
      res.redirect(base);
    } catch (e) {
      req.session.aviso = ['error', mensajeError(e)];
      res.redirect(id ? `${base}/${id}/editar` : `${base}/nuevo`);
    }
  });

  app.post(`${base}/:id/eliminar`, async (req, res) => {
    try {
      const actual = await cargar(req.params.id);
      if (actual && cfg.antesEliminar) await cfg.antesEliminar(actual, req);
      await db.ejecutar(`DELETE FROM ${cfg.tabla} WHERE id = ?`, [req.params.id]);
      req.session.aviso = ['ok', 'Registro eliminado.'];
    } catch (e) {
      req.session.aviso = ['error', mensajeError(e)];
    }
    res.redirect(base);
  });

  app.post(`${base}/:id/accion/:nombre`, async (req, res) => {
    try {
      const accion = (cfg.acciones || {})[req.params.nombre];
      const fila = await db.uno(`SELECT * FROM (${cfg.sql}) t WHERE t.id = ?`, [req.params.id]);
      if (!accion || !fila) throw new Error('La acción no se pudo realizar.');
      req.session.aviso = ['ok', await accion.hacer(fila)];
    } catch (e) {
      req.session.aviso = ['error', mensajeError(e)];
    }
    res.redirect(base);
  });
}

async function opciones(cfg) {
  const o = {};
  for (const c of cfg.campos) if (c.tipo === 'fk') o[c.nombre] = await opcionesFk(c);
  return o;
}

module.exports = { montar };
