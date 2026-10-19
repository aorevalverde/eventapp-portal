const zona = 'America/Lima';

function partes(fecha) {
  const f = new Intl.DateTimeFormat('es-PE', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(fecha));
  const o = {};
  f.forEach((p) => (o[p.type] = p.value));
  return o;
}

const fechaLima = (fecha) => {
  const p = partes(fecha);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
};

const inputLima = (fecha) => {
  const p = partes(fecha);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

// "2026-10-20T18:00" (hora de Lima) -> Date
const desdeInput = (texto) => new Date(`${texto}:00-05:00`);

const esc = (t) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function formatear(valor, col = {}) {
  if (valor === null || valor === undefined || valor === '') return '<span style="color:#aab">—</span>';
  switch (col.tipo) {
    case 'fecha': return esc(fechaLima(valor));
    case 'dinero': return Number(valor) > 0 ? 'S/ ' + Number(valor).toFixed(2) : 'Gratis';
    case 'si_no': return valor ? '<span class="etiqueta ok">Sí</span>' : '<span class="etiqueta">No</span>';
    case 'estado': {
      const clase = { Activo: 'ok', Revisado: 'ok', Pendiente: 'alerta', Oculto: 'peligro', ADMIN: 'alerta' }[valor] || '';
      return `<span class="etiqueta ${clase}">${esc(valor)}</span>`;
    }
    default: {
      let t = String(valor);
      if (t.length > 60) t = t.slice(0, 57) + '...';
      return esc(t);
    }
  }
}

module.exports = { fechaLima, inputLima, desdeInput, esc, formatear };
