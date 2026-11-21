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
