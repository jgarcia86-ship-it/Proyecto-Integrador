-- ============================================================
-- EOD (Entidad Organizadora de Desechos) - Esquema MySQL 8.0
-- Requiere MySQL 8.0.16 o superior (para que funcionen los CHECK)
-- Ejecutar completo en MySQL Workbench (rayo amarillo).
-- ATENCIÓN: borra y recrea la base "eod". Úselo solo mientras no
-- haya datos reales.
--
-- NOMENCLATURA HÚNGARA
--   t = tabla      d = fecha     e = lista (ENUM)   c = texto
--   l = lógico     n = número    o = objeto
--   Llave primaria: nXID      Llave foránea: nXFK
-- ============================================================

DROP DATABASE IF EXISTS eod;
CREATE DATABASE eod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE eod;

-- ------------------------------------------------------------
-- 1. Tablas (las llaves foráneas se agregan al final con ALTER TABLE)
-- ------------------------------------------------------------

-- Estructura institucional
CREATE TABLE IF NOT EXISTS tInstitucion (
 nInstitucionID int auto_increment,
 cNombre varchar(150) not null,
 cDireccion varchar(200),
 cTelefono varchar(20),
 lActiva boolean not null default true,
 primary key(nInstitucionID),
 unique(cNombre)
)ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tSede (
 nSedeID int auto_increment,
 nInstitucionFK int not null,
 cNombre varchar(150) not null,
 cDireccion varchar(200),
 lActiva boolean not null default true,
 primary key(nSedeID),
 unique(nInstitucionFK, cNombre)
)ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tGrupo (
 nGrupoID int auto_increment,
 nSedeFK int not null,
 cNombre varchar(100) not null,          -- ej. "10-A"
 nAnio smallint not null,
 primary key(nGrupoID),
 unique(nSedeFK, cNombre, nAnio)
)ENGINE=InnoDB;

-- Usuarios (correo + contraseña; la contraseña se guarda como
-- hash bcrypt generado en el backend, nunca en texto plano)
CREATE TABLE IF NOT EXISTS tUsuario (
 nUsuarioID int auto_increment,
 nInstitucionFK int not null,
 cNombre varchar(100) not null,
 cApellido varchar(100) not null,
 cCorreo varchar(150) not null,
 cContrasenaHash varchar(255) not null,
 eRol enum('administrador','docente','estudiante') not null,
 lActivo boolean not null default true,
 dFechaCreacion datetime not null default current_timestamp,
 primary key(nUsuarioID),
 unique(cCorreo)
)ENGINE=InnoDB;

-- Extensión 1:1 del usuario con rol estudiante (unique en nUsuarioFK)
CREATE TABLE IF NOT EXISTS tEstudiante (
 nEstudianteID int auto_increment,
 nUsuarioFK int not null,
 nGrupoFK int not null,
 cDocumento varchar(20) not null,
 -- Ley 1581 / menores: autorización del acudiente (puede revocarse)
 eEstadoAutorizacion enum('pendiente','autorizada','revocada') not null default 'pendiente',
 dFechaAutorizacion date null,
 primary key(nEstudianteID),
 unique(nUsuarioFK),
 unique(cDocumento)
)ENGINE=InnoDB;

-- Qué docente (usuario con rol docente) acompaña qué grupo (N:M)
CREATE TABLE IF NOT EXISTS tDocenteGrupo (
 nUsuarioFK int not null,
 nGrupoFK int not null,
 primary key(nUsuarioFK, nGrupoFK)
)ENGINE=InnoDB;

-- Campañas
CREATE TABLE IF NOT EXISTS tCampana (
 nCampanaID int auto_increment,
 nInstitucionFK int not null,
 cNombre varchar(150) not null,
 cDescripcion text,
 dFechaInicio date not null,
 dFechaFin date not null,
 nMetaKg decimal(10,2) not null,
 eEstado enum('programada','en_curso','finalizada') not null default 'programada',
 primary key(nCampanaID),
 check (dFechaFin >= dFechaInicio),
 check (nMetaKg > 0)
)ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tCampanaGrupo (
 nCampanaFK int not null,
 nGrupoFK int not null,
 nMetaKg decimal(10,2) null,             -- sub-meta opcional del grupo
 primary key(nCampanaFK, nGrupoFK),
 check (nMetaKg is null or nMetaKg > 0)
)ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tInscripcionCampana (
 nInscripcionCampanaID int auto_increment,
 nCampanaFK int not null,
 nEstudianteFK int not null,
 dFecha datetime not null default current_timestamp,
 primary key(nInscripcionCampanaID),
 unique(nCampanaFK, nEstudianteFK)
)ENGINE=InnoDB;

-- Residuos y recolecciones
CREATE TABLE IF NOT EXISTS tTipoResiduo (
 nTipoResiduoID int auto_increment,
 cNombre varchar(100) not null,
 nFactorConversionCo2 decimal(8,3) not null,  -- kg CO2 evitados por kg de residuo
 nPuntosPorKg int not null default 10,
 primary key(nTipoResiduoID),
 unique(cNombre),
 check (nFactorConversionCo2 >= 0),
 check (nPuntosPorKg >= 0)
)ENGINE=InnoDB;

-- nCo2EvitadoKg lo calcula un trigger (nPesoKg x factor) al insertar y queda
-- guardado: los históricos no cambian si después se corrige el factor.
-- nUsuarioFK = usuario que registró la recolección (trazabilidad, RNF-10).
CREATE TABLE IF NOT EXISTS tRecoleccion (
 nRecoleccionID int auto_increment,
 nCampanaFK int not null,
 nEstudianteFK int not null,
 nTipoResiduoFK int not null,
 nUsuarioFK int not null,
 nCantidad int not null,
 nPesoKg decimal(10,2) not null,
 nCo2EvitadoKg decimal(12,3) not null default 0,
 dFecha datetime not null default current_timestamp,
 primary key(nRecoleccionID),
 check (nCantidad > 0),
 check (nPesoKg > 0)
)ENGINE=InnoDB;

-- Logros e incentivos
CREATE TABLE IF NOT EXISTS tLogro (
 nLogroID int auto_increment,
 cNombre varchar(100) not null,
 cDescripcion varchar(255),
 nPuntosRequeridos int not null default 0,  -- se compara con nTotalGanado (v_saldo_puntos)
 primary key(nLogroID),
 unique(cNombre)
)ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tLogroEstudiante (
 nLogroFK int not null,
 nEstudianteFK int not null,
 dFecha datetime not null default current_timestamp,
 primary key(nLogroFK, nEstudianteFK)
)ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tIncentivo (
 nIncentivoID int auto_increment,
 nInstitucionFK int not null,
 cNombre varchar(150) not null,
 eCategoria enum('tecnologia','utiles_escolares','experiencias','sostenibles') not null,
 nCostoPuntos int not null,
 nCantidadDisponible int not null,
 primary key(nIncentivoID),
 unique(nInstitucionFK, cNombre),
 check (nCostoPuntos > 0),
 check (nCantidadDisponible >= 0)
)ENGINE=InnoDB;

-- nPuntosUsados guarda el costo al momento del canje (histórico)
CREATE TABLE IF NOT EXISTS tCanje (
 nCanjeID int auto_increment,
 nEstudianteFK int not null,
 nIncentivoFK int not null,
 nUsuarioFK int null,                    -- usuario que registró el canje
 nPuntosUsados int not null,
 eEstado enum('pendiente','entregado','cancelado') not null default 'pendiente',
 dFecha datetime not null default current_timestamp,
 primary key(nCanjeID),
 check (nPuntosUsados > 0)
)ENGINE=InnoDB;

-- Libro de puntos: positivos al recolectar, negativos al canjear.
-- Cada movimiento tiene un tipo y un origen coherente (lo exige el CHECK),
-- y una recolección o un canje solo puede generar un movimiento (unique).
CREATE TABLE IF NOT EXISTS tPunto (
 nPuntoID int auto_increment,
 nEstudianteFK int not null,
 nCampanaFK int null,                    -- NULL en canjes y bonos generales
 nRecoleccionFK int null,
 nCanjeFK int null,
 nUsuarioFK int null,                    -- usuario que registró el movimiento
 eTipoMovimiento enum('recoleccion','canje','bono') not null,
 nPuntos int not null,
 cDescripcion varchar(100) null,
 dFecha datetime not null default current_timestamp,
 primary key(nPuntoID),
 unique(nRecoleccionFK),
 unique(nCanjeFK),
 check (nPuntos <> 0),
 check (
      (eTipoMovimiento = 'recoleccion' and nRecoleccionFK is not null and nCanjeFK is null and nPuntos > 0)
   or (eTipoMovimiento = 'canje'       and nCanjeFK is not null and nRecoleccionFK is null and nPuntos < 0)
   or (eTipoMovimiento = 'bono'        and nRecoleccionFK is null and nCanjeFK is null)
 )
)ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2. Llaves foráneas
-- ------------------------------------------------------------
ALTER TABLE tSede
ADD CONSTRAINT fk1
FOREIGN KEY (nInstitucionFK)
REFERENCES tInstitucion (nInstitucionID);

ALTER TABLE tGrupo
ADD CONSTRAINT fk2
FOREIGN KEY (nSedeFK)
REFERENCES tSede (nSedeID);

ALTER TABLE tUsuario
ADD CONSTRAINT fk3
FOREIGN KEY (nInstitucionFK)
REFERENCES tInstitucion (nInstitucionID);

ALTER TABLE tEstudiante
ADD CONSTRAINT fk4
FOREIGN KEY (nUsuarioFK)
REFERENCES tUsuario (nUsuarioID);

ALTER TABLE tEstudiante
ADD CONSTRAINT fk5
FOREIGN KEY (nGrupoFK)
REFERENCES tGrupo (nGrupoID);

ALTER TABLE tDocenteGrupo
ADD CONSTRAINT fk6
FOREIGN KEY (nUsuarioFK)
REFERENCES tUsuario (nUsuarioID);

ALTER TABLE tDocenteGrupo
ADD CONSTRAINT fk7
FOREIGN KEY (nGrupoFK)
REFERENCES tGrupo (nGrupoID);

ALTER TABLE tCampana
ADD CONSTRAINT fk8
FOREIGN KEY (nInstitucionFK)
REFERENCES tInstitucion (nInstitucionID);

ALTER TABLE tCampanaGrupo
ADD CONSTRAINT fk9
FOREIGN KEY (nCampanaFK)
REFERENCES tCampana (nCampanaID);

ALTER TABLE tCampanaGrupo
ADD CONSTRAINT fk10
FOREIGN KEY (nGrupoFK)
REFERENCES tGrupo (nGrupoID);

ALTER TABLE tInscripcionCampana
ADD CONSTRAINT fk11
FOREIGN KEY (nCampanaFK)
REFERENCES tCampana (nCampanaID);

ALTER TABLE tInscripcionCampana
ADD CONSTRAINT fk12
FOREIGN KEY (nEstudianteFK)
REFERENCES tEstudiante (nEstudianteID);

-- El estudiante debe estar inscrito en la campaña de la recolección
ALTER TABLE tRecoleccion
ADD CONSTRAINT fk13
FOREIGN KEY (nCampanaFK, nEstudianteFK)
REFERENCES tInscripcionCampana (nCampanaFK, nEstudianteFK);

ALTER TABLE tRecoleccion
ADD CONSTRAINT fk14
FOREIGN KEY (nTipoResiduoFK)
REFERENCES tTipoResiduo (nTipoResiduoID);

ALTER TABLE tRecoleccion
ADD CONSTRAINT fk15
FOREIGN KEY (nUsuarioFK)
REFERENCES tUsuario (nUsuarioID);

ALTER TABLE tLogroEstudiante
ADD CONSTRAINT fk16
FOREIGN KEY (nLogroFK)
REFERENCES tLogro (nLogroID);

ALTER TABLE tLogroEstudiante
ADD CONSTRAINT fk17
FOREIGN KEY (nEstudianteFK)
REFERENCES tEstudiante (nEstudianteID);

ALTER TABLE tIncentivo
ADD CONSTRAINT fk18
FOREIGN KEY (nInstitucionFK)
REFERENCES tInstitucion (nInstitucionID);

ALTER TABLE tCanje
ADD CONSTRAINT fk19
FOREIGN KEY (nEstudianteFK)
REFERENCES tEstudiante (nEstudianteID);

ALTER TABLE tCanje
ADD CONSTRAINT fk20
FOREIGN KEY (nIncentivoFK)
REFERENCES tIncentivo (nIncentivoID);

ALTER TABLE tCanje
ADD CONSTRAINT fk21
FOREIGN KEY (nUsuarioFK)
REFERENCES tUsuario (nUsuarioID);

ALTER TABLE tPunto
ADD CONSTRAINT fk22
FOREIGN KEY (nEstudianteFK)
REFERENCES tEstudiante (nEstudianteID);

ALTER TABLE tPunto
ADD CONSTRAINT fk23
FOREIGN KEY (nCampanaFK)
REFERENCES tCampana (nCampanaID);

ALTER TABLE tPunto
ADD CONSTRAINT fk24
FOREIGN KEY (nRecoleccionFK)
REFERENCES tRecoleccion (nRecoleccionID);

ALTER TABLE tPunto
ADD CONSTRAINT fk25
FOREIGN KEY (nCanjeFK)
REFERENCES tCanje (nCanjeID);

ALTER TABLE tPunto
ADD CONSTRAINT fk26
FOREIGN KEY (nUsuarioFK)
REFERENCES tUsuario (nUsuarioID);

-- ------------------------------------------------------------
-- 3. Índices para consultas frecuentes
-- ------------------------------------------------------------
CREATE INDEX idx_recoleccion_estudiante ON tRecoleccion(nEstudianteFK);
CREATE INDEX idx_punto_estudiante       ON tPunto(nEstudianteFK);
CREATE INDEX idx_usuario_institucion    ON tUsuario(nInstitucionFK);

-- ------------------------------------------------------------
-- 4. Triggers: reglas que un CHECK no puede expresar
--    (se aplican al insertar; el backend debe seguir validando)
-- ------------------------------------------------------------
DELIMITER $$

-- Estudiante: su usuario debe tener rol 'estudiante' y ser de la misma
-- institución que el grupo.
CREATE TRIGGER trg_estudiante_bi BEFORE INSERT ON tEstudiante
FOR EACH ROW
BEGIN
  DECLARE v_rol VARCHAR(20);
  DECLARE v_inst_usuario INT;
  DECLARE v_inst_grupo INT;
  SELECT eRol, nInstitucionFK INTO v_rol, v_inst_usuario
    FROM tUsuario WHERE nUsuarioID = NEW.nUsuarioFK;
  SELECT s.nInstitucionFK INTO v_inst_grupo
    FROM tGrupo g JOIN tSede s ON s.nSedeID = g.nSedeFK
   WHERE g.nGrupoID = NEW.nGrupoFK;
  IF v_rol <> 'estudiante' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El usuario no tiene rol estudiante';
  END IF;
  IF v_inst_usuario <> v_inst_grupo THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El usuario y el grupo son de instituciones distintas';
  END IF;
END$$

-- Docente asignado a un grupo: rol 'docente' y misma institución.
CREATE TRIGGER trg_docentegrupo_bi BEFORE INSERT ON tDocenteGrupo
FOR EACH ROW
BEGIN
  DECLARE v_rol VARCHAR(20);
  DECLARE v_inst_usuario INT;
  DECLARE v_inst_grupo INT;
  SELECT eRol, nInstitucionFK INTO v_rol, v_inst_usuario
    FROM tUsuario WHERE nUsuarioID = NEW.nUsuarioFK;
  SELECT s.nInstitucionFK INTO v_inst_grupo
    FROM tGrupo g JOIN tSede s ON s.nSedeID = g.nSedeFK
   WHERE g.nGrupoID = NEW.nGrupoFK;
  IF v_rol <> 'docente' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El usuario no tiene rol docente';
  END IF;
  IF v_inst_usuario <> v_inst_grupo THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El docente y el grupo son de instituciones distintas';
  END IF;
END$$

-- Grupo en una campaña: misma institución y suma de sub-metas <= meta de la campaña.
CREATE TRIGGER trg_campanagrupo_bi BEFORE INSERT ON tCampanaGrupo
FOR EACH ROW
BEGIN
  DECLARE v_inst_campana INT;
  DECLARE v_meta_campana DECIMAL(10,2);
  DECLARE v_inst_grupo INT;
  DECLARE v_suma DECIMAL(12,2);
  SELECT nInstitucionFK, nMetaKg INTO v_inst_campana, v_meta_campana
    FROM tCampana WHERE nCampanaID = NEW.nCampanaFK;
  SELECT s.nInstitucionFK INTO v_inst_grupo
    FROM tGrupo g JOIN tSede s ON s.nSedeID = g.nSedeFK
   WHERE g.nGrupoID = NEW.nGrupoFK;
  IF v_inst_campana <> v_inst_grupo THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El grupo y la campaña son de instituciones distintas';
  END IF;
  IF NEW.nMetaKg IS NOT NULL THEN
    SELECT COALESCE(SUM(nMetaKg), 0) INTO v_suma
      FROM tCampanaGrupo WHERE nCampanaFK = NEW.nCampanaFK;
    IF v_suma + NEW.nMetaKg > v_meta_campana THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La suma de sub-metas supera la meta de la campaña';
    END IF;
  END IF;
END$$

-- Inscripción: estudiante y campaña de la misma institución.
CREATE TRIGGER trg_inscripcioncampana_bi BEFORE INSERT ON tInscripcionCampana
FOR EACH ROW
BEGIN
  DECLARE v_inst_campana INT;
  DECLARE v_inst_estudiante INT;
  SELECT nInstitucionFK INTO v_inst_campana
    FROM tCampana WHERE nCampanaID = NEW.nCampanaFK;
  SELECT s.nInstitucionFK INTO v_inst_estudiante
    FROM tEstudiante e
    JOIN tGrupo g ON g.nGrupoID = e.nGrupoFK
    JOIN tSede s ON s.nSedeID = g.nSedeFK
   WHERE e.nEstudianteID = NEW.nEstudianteFK;
  IF v_inst_campana <> v_inst_estudiante THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El estudiante y la campaña son de instituciones distintas';
  END IF;
END$$

-- Recolección (antes): calcula el CO2 evitado = nPesoKg x factor del tipo de residuo.
CREATE TRIGGER trg_recoleccion_bi BEFORE INSERT ON tRecoleccion
FOR EACH ROW
BEGIN
  DECLARE v_factor DECIMAL(8,3);
  SELECT nFactorConversionCo2 INTO v_factor
    FROM tTipoResiduo WHERE nTipoResiduoID = NEW.nTipoResiduoFK;
  SET NEW.nCo2EvitadoKg = NEW.nPesoKg * COALESCE(v_factor, 0);
END$$

-- Recolección (después): genera sus puntos = nPesoKg x nPuntosPorKg (redondeado).
CREATE TRIGGER trg_recoleccion_ai AFTER INSERT ON tRecoleccion
FOR EACH ROW
BEGIN
  DECLARE v_puntos INT;
  SELECT ROUND(NEW.nPesoKg * nPuntosPorKg) INTO v_puntos
    FROM tTipoResiduo WHERE nTipoResiduoID = NEW.nTipoResiduoFK;
  IF v_puntos > 0 THEN
    INSERT INTO tPunto (nEstudianteFK, nCampanaFK, nRecoleccionFK, eTipoMovimiento,
                        nPuntos, cDescripcion, nUsuarioFK)
    VALUES (NEW.nEstudianteFK, NEW.nCampanaFK, NEW.nRecoleccionID, 'recoleccion',
            v_puntos, 'Puntos por recolección', NEW.nUsuarioFK);
  END IF;
END$$

-- ------------------------------------------------------------
-- 5. Procedimiento: canje de un incentivo en una sola transacción
--    Verifica inventario y saldo, registra el canje, descuenta los
--    puntos (movimiento negativo) y reduce la cantidad disponible.
--    Uso: CALL sp_registrar_canje(nEstudianteID, nIncentivoID, nUsuarioID, @nCanjeID);
-- ------------------------------------------------------------
CREATE PROCEDURE sp_registrar_canje (
  IN  p_estudiante INT,
  IN  p_incentivo  INT,
  IN  p_usuario    INT,
  OUT p_canje      INT
)
BEGIN
  DECLARE v_costo INT;
  DECLARE v_stock INT;
  DECLARE v_inst_incentivo INT;
  DECLARE v_inst_estudiante INT;
  DECLARE v_saldo INT;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT nCostoPuntos, nCantidadDisponible, nInstitucionFK
    INTO v_costo, v_stock, v_inst_incentivo
    FROM tIncentivo WHERE nIncentivoID = p_incentivo FOR UPDATE;

  IF v_costo IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El incentivo no existe';
  END IF;

  SELECT s.nInstitucionFK INTO v_inst_estudiante
    FROM tEstudiante e
    JOIN tGrupo g ON g.nGrupoID = e.nGrupoFK
    JOIN tSede s ON s.nSedeID = g.nSedeFK
   WHERE e.nEstudianteID = p_estudiante;

  IF v_inst_estudiante IS NULL OR v_inst_estudiante <> v_inst_incentivo THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Estudiante inexistente o de otra institución';
  END IF;
  IF v_stock < 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No hay inventario disponible';
  END IF;

  SELECT COALESCE(SUM(nPuntos), 0) INTO v_saldo
    FROM tPunto WHERE nEstudianteFK = p_estudiante FOR UPDATE;
  IF v_saldo < v_costo THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Puntos insuficientes';
  END IF;

  INSERT INTO tCanje (nEstudianteFK, nIncentivoFK, nUsuarioFK, nPuntosUsados)
  VALUES (p_estudiante, p_incentivo, p_usuario, v_costo);
  SET p_canje = LAST_INSERT_ID();

  INSERT INTO tPunto (nEstudianteFK, nCanjeFK, nUsuarioFK, eTipoMovimiento, nPuntos, cDescripcion)
  VALUES (p_estudiante, p_canje, p_usuario, 'canje', -v_costo, 'Canje de premio');

  UPDATE tIncentivo SET nCantidadDisponible = nCantidadDisponible - 1
   WHERE nIncentivoID = p_incentivo;

  COMMIT;
END$$

DELIMITER ;

-- ------------------------------------------------------------
-- 6. Vistas para informes y ranking
-- ------------------------------------------------------------
-- nSaldo = puntos disponibles; nTotalGanado = puntos acumulados (para los logros)
CREATE VIEW v_saldo_puntos AS
SELECT nEstudianteFK,
       SUM(nPuntos) AS nSaldo,
       SUM(CASE WHEN nPuntos > 0 THEN nPuntos ELSE 0 END) AS nTotalGanado
FROM tPunto
GROUP BY nEstudianteFK;

-- Ranking de grupos por campaña (posición 1 = más kg recolectados).
-- Parte de tCampanaGrupo, así que los grupos asignados a la campaña
-- aparecen también con 0 kg si aún no han recolectado.
CREATE VIEW v_ranking_grupos AS
SELECT cg.nCampanaFK AS nCampanaID,
       g.nGrupoID,
       g.cNombre AS cGrupo,
       s.cNombre AS cSede,
       s.nInstitucionFK AS nInstitucionID,
       COALESCE(SUM(r.nPesoKg), 0)        AS nTotalKg,
       COALESCE(SUM(r.nCo2EvitadoKg), 0)  AS nTotalCo2,
       RANK() OVER (PARTITION BY cg.nCampanaFK
                    ORDER BY COALESCE(SUM(r.nPesoKg), 0) DESC) AS nPosicion
FROM tCampanaGrupo cg
JOIN tGrupo g             ON g.nGrupoID = cg.nGrupoFK
JOIN tSede s              ON s.nSedeID  = g.nSedeFK
LEFT JOIN tEstudiante e   ON e.nGrupoFK = g.nGrupoID
LEFT JOIN tRecoleccion r  ON r.nEstudianteFK = e.nEstudianteID
                         AND r.nCampanaFK    = cg.nCampanaFK
GROUP BY cg.nCampanaFK, g.nGrupoID, g.cNombre, s.cNombre, s.nInstitucionFK;

CREATE VIEW v_progreso_campanas AS
SELECT c.nCampanaID, c.cNombre, c.nMetaKg,
      COALESCE(SUM(r.nPesoKg), 0)       AS nRecolectadoKg,
      COALESCE(SUM(r.nCo2EvitadoKg), 0) AS nCo2EvitadoKg,
      ROUND(COALESCE(SUM(r.nPesoKg), 0) / c.nMetaKg * 100, 1) AS nPorcentaje
FROM tCampana c
LEFT JOIN tRecoleccion r ON r.nCampanaFK = c.nCampanaID
GROUP BY c.nCampanaID, c.cNombre, c.nMetaKg;

-- ------------------------------------------------------------
-- 7. Datos semilla
-- OJO: los factores de CO2 y los puntos por kg son VALORES DE EJEMPLO.
-- Reemplácelos por factores de una fuente documentada y cítela en el
-- informe (RNF-12).
-- ------------------------------------------------------------
INSERT INTO tTipoResiduo (cNombre, nFactorConversionCo2, nPuntosPorKg) VALUES
 ('Computadores y periféricos', 1.500, 15),
 ('Celulares y baterías',       2.000, 20),
 ('Electrodomésticos',          1.200, 10),
 ('Cables y cargadores',        0.800, 8),
 ('Chatarra metálica',          1.000, 5);

INSERT INTO tLogro (cNombre, cDescripcion, nPuntosRequeridos) VALUES
 ('Eco Explorador', 'Primeros 100 puntos acumulados', 100),
 ('Eco Guardián',   'Alcanza 500 puntos',             500),
 ('Eco Héroe',      'Alcanza 1000 puntos',           1000);

INSERT INTO tInstitucion (cNombre, cDireccion) VALUES
 ('Institución Educativa de Prueba', 'Barrancabermeja, Santander');
 
 -- ============================================================
-- EOD - Datos de prueba (nomenclatura húngara)
-- Ejecutar DESPUÉS de eod_schema.sql (que ya crea la institución con id 1
-- y los 5 tipos de residuo con id 1 a 5).
-- Los hash de contraseña son PLACEHOLDERS: no sirven para iniciar sesión.
-- Los usuarios reales se crearán desde el backend con bcrypt.
--
-- OJO con los ids: tEstudiante.nEstudianteID NO es igual a nUsuarioID.
--   Usuarios 3, 4, 5  ->  Estudiantes 1, 2, 3
-- ============================================================
USE eod;

-- Sede y grupos
INSERT INTO tSede (nInstitucionFK, cNombre) VALUES (1, 'Sede Principal');
INSERT INTO tGrupo (nSedeFK, cNombre, nAnio) VALUES
 (1, '10-A', 2026),
 (1, '10-B', 2026);

-- Usuarios: 1 administrador, 1 docente, 3 estudiantes
INSERT INTO tUsuario (nInstitucionFK, cNombre, cApellido, cCorreo, cContrasenaHash, eRol) VALUES
 (1, 'Ana',   'Admin',   'admin@eod.test',   'HASH_PLACEHOLDER', 'administrador'),  -- usuario 1
 (1, 'Carlos','Docente', 'docente@eod.test', 'HASH_PLACEHOLDER', 'docente'),        -- usuario 2
 (1, 'Laura', 'Pérez',   'laura@eod.test',   'HASH_PLACEHOLDER', 'estudiante'),     -- usuario 3
 (1, 'Mateo', 'Gómez',   'mateo@eod.test',   'HASH_PLACEHOLDER', 'estudiante'),     -- usuario 4
 (1, 'Sofía', 'Ruiz',    'sofia@eod.test',   'HASH_PLACEHOLDER', 'estudiante');     -- usuario 5

INSERT INTO tDocenteGrupo (nUsuarioFK, nGrupoFK) VALUES (2, 1), (2, 2);

INSERT INTO tEstudiante (nUsuarioFK, nGrupoFK, cDocumento, eEstadoAutorizacion, dFechaAutorizacion) VALUES
 (3, 1, '1001', 'autorizada', '2026-11-01'),   -- estudiante 1 = Laura
 (4, 1, '1002', 'autorizada', '2026-11-01'),   -- estudiante 2 = Mateo
 (5, 2, '1003', 'autorizada', '2026-11-01');   -- estudiante 3 = Sofía

-- Campaña (meta 100 kg) con sub-metas 50 + 40 = 90 <= 100
INSERT INTO tCampana (nInstitucionFK, cNombre, cDescripcion, dFechaInicio, dFechaFin, nMetaKg, eEstado) VALUES
 (1, 'Reciclatón Tecnológico', 'Recolección de RAEE', '2026-11-01', '2026-12-15', 100, 'en_curso');

INSERT INTO tCampanaGrupo (nCampanaFK, nGrupoFK, nMetaKg) VALUES (1, 1, 50), (1, 2, 40);

INSERT INTO tInscripcionCampana (nCampanaFK, nEstudianteFK) VALUES (1, 1), (1, 2), (1, 3);

-- Recolecciones registradas por el docente (usuario 2).
-- El trigger calcula solo el CO2 y los puntos.
INSERT INTO tRecoleccion (nCampanaFK, nEstudianteFK, nTipoResiduoFK, nUsuarioFK, nCantidad, nPesoKg) VALUES
 (1, 1, 1, 2, 2, 5.00),   -- Laura: computadores 5 kg  -> 75 pts, 7.5 kg CO2
 (1, 2, 2, 2, 3, 1.50),   -- Mateo: celulares 1.5 kg   -> 30 pts, 3.0 kg CO2
 (1, 3, 5, 2, 1, 12.00);  -- Sofía: chatarra 12 kg     -> 60 pts, 12 kg CO2

-- Incentivo y canje
INSERT INTO tIncentivo (nInstitucionFK, cNombre, eCategoria, nCostoPuntos, nCantidadDisponible) VALUES
 (1, 'Cuaderno ecológico', 'utiles_escolares', 50, 10);

CALL sp_registrar_canje(1, 1, 2, @nCanjeID);   -- Laura (estudiante 1) canjea: 75 - 50 = 25 pts

-- ------------------------------------------------------------
-- Verificaciones: ejecute cada SELECT y compare con lo esperado
-- ------------------------------------------------------------
SELECT * FROM tRecoleccion;         -- nCo2EvitadoKg: 7.500 / 3.000 / 12.000
SELECT * FROM v_saldo_puntos;       -- estudiante 1: nSaldo 25 (ganado 75); 2: 30; 3: 60
SELECT * FROM v_ranking_grupos;     -- 10-A: 6.5 kg (posición 2); 10-B: 12 kg (posición 1)
SELECT * FROM v_progreso_campanas;  -- 18.5 kg de 100 = 18.5 %
SELECT nCantidadDisponible FROM tIncentivo WHERE nIncentivoID = 1;  -- 9

-- Pruebas de errores esperados (descomente de a una; deben FALLAR):
CALL sp_registrar_canje(2, 1, 2, @x);   -- Mateo (estudiante 2): 'Puntos insuficientes' (tiene 30, cuesta 50)
INSERT INTO tRecoleccion (nCampanaFK, nEstudianteFK, nTipoResiduoFK, nUsuarioFK, nCantidad, nPesoKg)
VALUES (1, 1, 1, 2, 1, -2);          -- peso negativo: falla el CHECK topenak568@bonuscable.com

USE eod;
SELECT * FROM tUsuario; 
SELECT * FROM tEstudiante;
USE eod;
UPDATE tUsuario SET eRol = 'administrador' WHERE cCorreo = 'mobem19985@fulldiets.com';


-- ============================================================
-- EOD - Migración del módulo Incentivos y canje
-- Ejecutar UNA SOLA VEZ en MySQL Workbench, sobre la base "eod" ya creada.
-- No borra datos. Si una columna ya existe, MySQL avisa con un error:
-- en ese caso ya se había aplicado y se puede ignorar.
-- ============================================================
USE eod;

-- 1. Incentivos: descripción, imagen opcional (URL) y bandera para retirar un premio sin borrar su historial
ALTER TABLE tIncentivo
  ADD COLUMN cDescripcion varchar(150) NULL AFTER cNombre,
  ADD COLUMN cImagen varchar(255) NULL AFTER cDescripcion,
  ADD COLUMN lActivo boolean NOT NULL DEFAULT TRUE;

-- 2. Canjes: código de entrega, quién y cuándo entregó, y datos de cancelación
ALTER TABLE tCanje
  ADD COLUMN cCodigoEntrega char(6) NULL,
  ADD COLUMN nUsuarioEntregaFK int NULL,
  ADD COLUMN dFechaEntrega datetime NULL,
  ADD COLUMN dFechaCancelacion datetime NULL,
  ADD COLUMN cMotivoCancelacion varchar(150) NULL;

ALTER TABLE tCanje
ADD CONSTRAINT fk_canje_entrega
FOREIGN KEY (nUsuarioEntregaFK)
REFERENCES tUsuario (nUsuarioID);

-- 3. Código de entrega para los canjes que ya existían
UPDATE tCanje
   SET cCodigoEntrega = LPAD(FLOOR(100000 + RAND() * 900000), 6, '0')
 WHERE nCanjeID > 0 AND cCodigoEntrega IS NULL;

-- 4. Cada canje nuevo recibe su código de entrega al crearse (6 dígitos).
--    El procedimiento sp_registrar_canje no cambia: el trigger se encarga.
DROP TRIGGER IF EXISTS trg_canje_bi;
DELIMITER $$
CREATE TRIGGER trg_canje_bi BEFORE INSERT ON tCanje
FOR EACH ROW
BEGIN
  IF NEW.cCodigoEntrega IS NULL THEN
    SET NEW.cCodigoEntrega = LPAD(FLOOR(100000 + RAND() * 900000), 6, '0');
  END IF;
END$$
DELIMITER ;

-- 5. Comprobación: debe mostrar las columnas nuevas
SHOW COLUMNS FROM tIncentivo;
SHOW COLUMNS FROM tCanje;
SELECT nCanjeID, eEstado, cCodigoEntrega FROM tCanje;

-- ------------------------------------------------------------
-- OPCIONAL: premios de ejemplo para la institución 1
-- (el administrador también puede crearlos desde la pantalla Incentivos).
-- Quita los "-- " del inicio de las líneas para usarlos.
-- ------------------------------------------------------------
-- INSERT IGNORE INTO tIncentivo (nInstitucionFK, cNombre, cDescripcion, eCategoria, nCostoPuntos, nCantidadDisponible) VALUES
--  (1, 'Botella ecológica',  'Mantén tu hidratación y cuida el planeta.', 'sostenibles',      100, 20),
--  (1, 'Set de cuaderno y esfero', 'Toma nota de un mejor futuro.',       'utiles_escolares', 150, 30),
--  (1, 'Bolsa reutilizable', 'Reduce, reutiliza, recicla.',               'sostenibles',      200, 25),
--  (1, 'Morral ecológico',   'Ideal para el colegio.',                    'utiles_escolares', 250, 10),
--  (1, 'Entrada al cine',    'Disfruta una gran película.',               'experiencias',     400, 8),
--  (1, 'Audífonos inalámbricos', 'Disfruta tu música y cuida el planeta.', 'tecnologia',      500, 3);


-- ============================================================
-- EOD - Migración de la Calculadora ambiental
-- Ejecutar UNA SOLA VEZ en MySQL Workbench, sobre la base "eod" ya creada.
-- No borra datos. Si una columna ya existe, MySQL avisa con un error:
-- en ese caso ya se había aplicado y se puede ignorar.
--
-- OJO: los valores de energía, agua y peso unitario de abajo son
-- ESTIMACIONES DE EJEMPLO para que la calculadora funcione. Igual que los
-- factores de CO2 del esquema, reemplácelos por valores de una fuente
-- documentada y cítela en el informe (RNF-12).
-- ============================================================
USE eod;

-- Factores por tipo de residuo (por cada kg recolectado) y equivalencia en unidades
ALTER TABLE tTipoResiduo
  ADD COLUMN nFactorEnergiaKwh decimal(8,3) NOT NULL DEFAULT 0 AFTER nFactorConversionCo2,  -- kWh ahorrados por kg
  ADD COLUMN nFactorAguaL      decimal(8,2) NOT NULL DEFAULT 0 AFTER nFactorEnergiaKwh,     -- litros de agua ahorrados por kg
  ADD COLUMN nPesoUnitarioKg   decimal(8,3) NULL,                                           -- peso promedio de una unidad (para "equivale a ~N unidades")
  ADD COLUMN cUnidad           varchar(40)  NULL;                                           -- nombre de la unidad (plural)

ALTER TABLE tTipoResiduo
  ADD CONSTRAINT chk_tiporesiduo_calc CHECK (
    nFactorEnergiaKwh >= 0 AND nFactorAguaL >= 0 AND (nPesoUnitarioKg IS NULL OR nPesoUnitarioKg > 0));

-- Valores de ejemplo para los 5 tipos de la semilla
UPDATE tTipoResiduo SET nFactorEnergiaKwh = 6.0, nFactorAguaL = 70,  nPesoUnitarioKg = 1.500, cUnidad = 'equipos y periféricos'    WHERE cNombre = 'Computadores y periféricos';
UPDATE tTipoResiduo SET nFactorEnergiaKwh = 8.0, nFactorAguaL = 100, nPesoUnitarioKg = 0.150, cUnidad = 'celulares y baterías'     WHERE cNombre = 'Celulares y baterías';
UPDATE tTipoResiduo SET nFactorEnergiaKwh = 5.0, nFactorAguaL = 60,  nPesoUnitarioKg = 2.000, cUnidad = 'electrodomésticos'       WHERE cNombre = 'Electrodomésticos';
UPDATE tTipoResiduo SET nFactorEnergiaKwh = 4.0, nFactorAguaL = 50,  nPesoUnitarioKg = 0.120, cUnidad = 'cables y cargadores'     WHERE cNombre = 'Cables y cargadores';
UPDATE tTipoResiduo SET nFactorEnergiaKwh = 3.0, nFactorAguaL = 40                                                                 WHERE cNombre = 'Chatarra metálica';

-- Verificación
SELECT nTipoResiduoID, cNombre, nFactorConversionCo2, nFactorEnergiaKwh, nFactorAguaL, nPesoUnitarioKg, cUnidad FROM tTipoResiduo;
