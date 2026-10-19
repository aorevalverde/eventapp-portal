const db = require('../db');

const usuarios = {
  ruta: 'usuarios', titulo: 'Usuarios', singular: 'usuario', tabla: 'usuarios',
  sql: 'SELECT id, nombre, correo, rol, fecha_registro FROM usuarios',
  buscar: ['nombre', 'correo'],
  avisoEliminar: 'Se eliminarán también sus eventos, entradas y reportes. ¿Continuar?',
  columnas: {
    id: { titulo: 'ID' }, nombre: { titulo: 'Nombre' }, correo: { titulo: 'Correo' },
    rol: { titulo: 'Rol', tipo: 'estado' }, fecha_registro: { titulo: 'Registro', tipo: 'fecha' },
  },
  campos: [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'text', requerido: true },
    { nombre: 'correo', etiqueta: 'Correo', tipo: 'email', requerido: true },
    { nombre: 'contrasena', etiqueta: 'Contraseña', tipo: 'password', requerido: true },
    { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', requerido: true, defecto: 'USUARIO',
      opciones: { USUARIO: 'Usuario', ADMIN: 'Administrador' } },
  ],
  async antes(datos, actual, req) {
    if (datos.contrasena) {
      if (datos.contrasena.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
      datos.contrasena = db.guardarClave(db.sha256(datos.contrasena));
    }
    if (actual && actual.id === req.session.admin.id && datos.rol !== 'ADMIN') {
      throw new Error('No puedes quitarte el rol de administrador a ti mismo.');
    }
    return datos;
  },
  async antesEliminar(u, req) {
    if (u.id === req.session.admin.id) throw new Error('No puedes eliminar tu propia cuenta.');
  },
};

const eventos = {
  ruta: 'eventos', titulo: 'Eventos', singular: 'evento', tabla: 'eventos',
  sql: `SELECT e.id, e.titulo, e.categoria, e.tipo, e.fecha_hora, e.cupo, e.cupos_disponibles,
               e.precio, e.estado, u.nombre AS organizador
        FROM eventos e JOIN usuarios u ON u.id = e.id_usuario`,
  buscar: ['titulo', 'organizador', 'categoria'],
  avisoEliminar: 'Se eliminarán también las entradas y reportes de este evento. ¿Continuar?',
  columnas: {
    id: { titulo: 'ID' }, titulo: { titulo: 'Título' }, organizador: { titulo: 'Organizador' },
    categoria: { titulo: 'Categoría' }, tipo: { titulo: 'Tipo' },
    fecha_hora: { titulo: 'Fecha', tipo: 'fecha' }, cupos_disponibles: { titulo: 'Cupos libres' },
    precio: { titulo: 'Precio', tipo: 'dinero' }, estado: { titulo: 'Estado', tipo: 'estado' },
  },
  campos: [
    { nombre: 'id_usuario', etiqueta: 'Organizador', tipo: 'fk', fk: ['usuarios', 'nombre'], requerido: true },
    { nombre: 'titulo', etiqueta: 'Título', tipo: 'text', requerido: true },
    { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', requerido: true },
    { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'select', requerido: true,
      opciones: { Taller: 'Taller', Webinar: 'Webinar', Charla: 'Charla' } },
    { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', requerido: true,
      opciones: { Presencial: 'Presencial', Virtual: 'Virtual' } },
    { nombre: 'fecha_hora', etiqueta: 'Fecha y hora', tipo: 'datetime', requerido: true },
    { nombre: 'lugar', etiqueta: 'Dirección o enlace', tipo: 'text', requerido: true },
    { nombre: 'cupo', etiqueta: 'Cupo máximo', tipo: 'number', requerido: true, min: 1 },
    { nombre: 'precio', etiqueta: 'Precio (S/)', tipo: 'decimal', requerido: true, defecto: '0', ayuda: '0 si el evento es gratuito.' },
    { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: true, defecto: 'Activo',
      opciones: { Activo: 'Activo', Oculto: 'Oculto' } },
    { nombre: 'ruta_imagen', etiqueta: 'Imagen de portada (URL)', tipo: 'text' },
  ],
  async antes(datos, actual) {
    let ocupados = 0;
    if (actual) ocupados = (await db.uno('SELECT COUNT(*) AS n FROM entradas WHERE id_evento = ?', [actual.id])).n;
    if (Number(datos.cupo) < ocupados) throw new Error(`El cupo no puede ser menor a las ${ocupados} entradas ya emitidas.`);
    datos.cupos_disponibles = Number(datos.cupo) - ocupados;
    return datos;
  },
  acciones: {
    alternar: {
      clase: 'ambar',
      etiqueta: (f) => (f.estado === 'Activo' ? 'Ocultar' : 'Mostrar'),
      async hacer(e) {
        const nuevo = e.estado === 'Activo' ? 'Oculto' : 'Activo';
        await db.ejecutar('UPDATE eventos SET estado = ? WHERE id = ?', [nuevo, e.id]);
        return nuevo === 'Oculto' ? 'El evento quedó oculto en la app.' : 'El evento volvió a mostrarse.';
      },
    },
  },
};

const entradas = {
  ruta: 'entradas', titulo: 'Entradas', singular: 'entrada', tabla: 'entradas',
  sql: `SELECT n.id, n.codigo, e.titulo AS evento, u.nombre AS asistente, n.precio, n.fecha_emision, n.usada
        FROM entradas n JOIN eventos e ON e.id = n.id_evento JOIN usuarios u ON u.id = n.id_usuario`,
  buscar: ['codigo', 'evento', 'asistente'],
  avisoEliminar: 'Se anulará la entrada y se devolverá el cupo al evento. ¿Continuar?',
  columnas: {
    id: { titulo: 'ID' }, codigo: { titulo: 'Código' }, evento: { titulo: 'Evento' }, asistente: { titulo: 'Asistente' },
    precio: { titulo: 'Precio', tipo: 'dinero' }, fecha_emision: { titulo: 'Emitida', tipo: 'fecha' },
    usada: { titulo: 'Asistió', tipo: 'si_no' },
  },
  campos: [
    { nombre: 'id_evento', etiqueta: 'Evento', tipo: 'fk', fk: ['eventos', 'titulo'], requerido: true, solo_crear: true },
    { nombre: 'id_usuario', etiqueta: 'Asistente', tipo: 'fk', fk: ['usuarios', 'nombre'], requerido: true, solo_crear: true },
    { nombre: 'codigo', etiqueta: 'Código', tipo: 'text', ayuda: 'Si lo dejas vacío se genera uno automáticamente.' },
    { nombre: 'precio', etiqueta: 'Precio pagado (S/)', tipo: 'decimal', requerido: true, defecto: '0' },
    { nombre: 'fecha_emision', etiqueta: 'Fecha de emisión', tipo: 'datetime', requerido: true },
    { nombre: 'usada', etiqueta: 'El asistente ya ingresó (QR validado)', tipo: 'check' },
  ],
  async antes(datos, actual) {
    if (!datos.codigo) datos.codigo = actual ? actual.codigo : require('crypto').randomBytes(6).toString('hex').toUpperCase();
    if (!actual) {
      const r = await db.ejecutar('UPDATE eventos SET cupos_disponibles = cupos_disponibles - 1 WHERE id = ? AND cupos_disponibles > 0', [datos.id_evento]);
      if (r.affectedRows === 0) throw new Error('El evento no existe o ya no tiene cupos disponibles.');
    }
    return datos;
  },
  async antesEliminar(e) {
    await db.ejecutar('UPDATE eventos SET cupos_disponibles = LEAST(cupo, cupos_disponibles + 1) WHERE id = ?', [e.id_evento]);
  },
  acciones: {
    usar: {
      clase: 'verde', etiqueta: 'Validar', si: (f) => !f.usada,
      async hacer(e) {
        await db.ejecutar('UPDATE entradas SET usada = 1 WHERE id = ?', [e.id]);
        return 'Entrada marcada como usada.';
      },
    },
  },
};

const reportes = {
  ruta: 'reportes', titulo: 'Reportes', singular: 'reporte', tabla: 'reportes',
  sql: `SELECT r.id, r.id_evento, e.titulo AS evento, e.estado AS estado_evento, u.nombre AS reporta,
               r.motivo, r.comentario, r.fecha, r.estado
        FROM reportes r JOIN eventos e ON e.id = r.id_evento JOIN usuarios u ON u.id = r.id_usuario`,
  buscar: ['evento', 'reporta', 'motivo', 'estado'],
  columnas: {
    id: { titulo: 'ID' }, evento: { titulo: 'Evento' }, estado_evento: { titulo: 'Estado del evento', tipo: 'estado' },
    reporta: { titulo: 'Reportado por' }, motivo: { titulo: 'Motivo' }, comentario: { titulo: 'Comentario' },
    fecha: { titulo: 'Fecha', tipo: 'fecha' }, estado: { titulo: 'Estado', tipo: 'estado' },
  },
  campos: [
    { nombre: 'id_evento', etiqueta: 'Evento', tipo: 'fk', fk: ['eventos', 'titulo'], requerido: true, solo_crear: true },
    { nombre: 'id_usuario', etiqueta: 'Usuario que reporta', tipo: 'fk', fk: ['usuarios', 'nombre'], requerido: true, solo_crear: true },
    { nombre: 'motivo', etiqueta: 'Motivo', tipo: 'select', requerido: true, opciones: {
      'Evento falso o engañoso': 'Evento falso o engañoso', 'Spam o publicidad': 'Spam o publicidad',
      'Contenido inapropiado': 'Contenido inapropiado', Otro: 'Otro' } },
    { nombre: 'comentario', etiqueta: 'Comentario', tipo: 'text' },
    { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'datetime', requerido: true },
    { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: true, defecto: 'Pendiente',
      opciones: { Pendiente: 'Pendiente', Revisado: 'Revisado' } },
  ],
  acciones: {
    ocultar: {
      clase: 'ambar', etiqueta: 'Ocultar evento', si: (f) => f.estado_evento === 'Activo',
      confirmar: 'El evento dejará de verse en la app. ¿Continuar?',
      async hacer(r) {
        await db.ejecutar("UPDATE eventos SET estado = 'Oculto' WHERE id = ?", [r.id_evento]);
        await db.ejecutar("UPDATE reportes SET estado = 'Revisado' WHERE id_evento = ?", [r.id_evento]);
        return 'Evento oculto y reportes del evento marcados como revisados.';
      },
    },
    revisado: {
      clase: 'verde', etiqueta: 'Marcar revisado', si: (f) => f.estado === 'Pendiente',
      async hacer(r) {
        await db.ejecutar("UPDATE reportes SET estado = 'Revisado' WHERE id = ?", [r.id]);
        return 'Reporte marcado como revisado.';
      },
    },
    borrar_evento: {
      clase: 'rojo', etiqueta: 'Eliminar evento',
      confirmar: 'Se eliminará el evento con sus entradas y reportes. ¿Continuar?',
      async hacer(r) {
        await db.ejecutar('DELETE FROM eventos WHERE id = ?', [r.id_evento]);
        return 'Evento eliminado.';
      },
    },
  },
};

module.exports = [usuarios, eventos, entradas, reportes];
