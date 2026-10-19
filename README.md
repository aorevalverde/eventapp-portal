# EventApp – Portal web y servicios REST

Node.js + Express + MySQL. Al iniciar crea las tablas solas y un administrador.

## Probar en tu PC
1. Crea la base: `CREATE DATABASE eventapp CHARACTER SET utf8mb4;`
2. `npm install`
3. Define las variables de `.env.example` (DB_HOST, DB_USER, DB_PASS...) y ejecuta `npm start`
4. Entra a http://localhost:3000 con `admin@eventapp.com` / `admin123`

## Publicar (gratis)
1. **MySQL:** crea una base en Aiven o TiDB Cloud. Copia host, puerto, usuario y contraseña.
2. Sube esta carpeta a un repositorio de GitHub.
3. En **Render**: New → Web Service → tu repo. Runtime Node, Build `npm install`, Start `npm start`, plan Free.
4. En Environment agrega: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_SSL=true`, `ADMIN_CLAVE`, `SESSION_SECRET`.
5. Tu portal queda en `https://TU-APP.onrender.com` y los REST en `https://TU-APP.onrender.com/api`.

Render gratis duerme tras ~15 min sin uso: abre la URL unos minutos antes de exponer.

## REST (`/api`)
Autenticación: cabecera `Authorization: Bearer <token>` (el token lo devuelven `/registro` y `/login`).
La contraseña se envía tal como la guarda la app (SHA-256).
Fechas en milisegundos (como `Long` en Kotlin).

| Método | Ruta | Descripción |
|---|---|---|
| POST | /registro | Crea usuario `{nombre, correo, contrasena}` |
| POST | /login | `{correo, contrasena}` |
| PUT | /usuarios/{id} | Actualiza nombre y correo (token) |
| GET | /eventos?q=&categoria= | Eventos activos |
| GET | /eventos/mios | Eventos del usuario (token) |
| GET | /eventos/{id} | Detalle |
| POST | /eventos | Crea evento (token) |
| PUT | /eventos/{id} | Edita (dueño o admin) |
| DELETE | /eventos/{id} | Elimina (dueño o admin) |
| GET | /entradas | Entradas del usuario (token) |
| GET | /entradas/codigo/{codigo} | Busca por código QR (token) |
| POST | /entradas | Compra/inscripción `{id_evento, codigo, fecha_emision}`; valida cupo y duplicados |
| PUT | /entradas/{id}/usar | Valida asistencia (organizador) |
| POST | /reportes | `{id_evento, motivo, comentario, fecha}` |

Los errores devuelven `{"error": "mensaje"}` con su código HTTP (400, 401, 403, 404, 409).
