-- EventApp: base de datos del portal (MySQL)
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(120) NOT NULL UNIQUE,
    contrasena VARCHAR(255) NOT NULL,
    rol ENUM('USUARIO','ADMIN') NOT NULL DEFAULT 'USUARIO',
    token VARCHAR(64) NULL,
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS eventos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    descripcion TEXT NOT NULL,
    categoria ENUM('Taller','Webinar','Charla') NOT NULL,
    tipo ENUM('Presencial','Virtual') NOT NULL,
    fecha_hora DATETIME NOT NULL,
    lugar VARCHAR(255) NOT NULL,
    cupo INT NOT NULL,
    cupos_disponibles INT NOT NULL,
    precio DECIMAL(8,2) NOT NULL DEFAULT 0,
    estado ENUM('Activo','Oculto') NOT NULL DEFAULT 'Activo',
    ruta_imagen VARCHAR(255) NULL,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS entradas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_evento INT NOT NULL,
    id_usuario INT NOT NULL,
    codigo VARCHAR(40) NOT NULL UNIQUE,
    precio DECIMAL(8,2) NOT NULL DEFAULT 0,
    fecha_emision DATETIME NOT NULL,
    usada TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_entrada (id_evento, id_usuario),
    FOREIGN KEY (id_evento) REFERENCES eventos(id) ON DELETE CASCADE,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reportes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_evento INT NOT NULL,
    id_usuario INT NOT NULL,
    motivo VARCHAR(60) NOT NULL,
    comentario VARCHAR(255) NULL,
    fecha DATETIME NOT NULL,
    estado ENUM('Pendiente','Revisado') NOT NULL DEFAULT 'Pendiente',
    UNIQUE KEY uq_reporte (id_evento, id_usuario),
    FOREIGN KEY (id_evento) REFERENCES eventos(id) ON DELETE CASCADE,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
