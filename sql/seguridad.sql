-- =================================================================
-- SEGURIDAD - Sal y Canela
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- =================================================================

-- ── 1. Extensión pgcrypto para bcrypt ──────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 2. Migrar contraseñas existentes a bcrypt ──────────────────
-- Detecta hashes bcrypt por el prefijo $2 y salta los ya migrados
UPDATE usuarios
SET usu_password = crypt(usu_password, gen_salt('bf', 10))
WHERE usu_password NOT LIKE '$2$%'
  AND usu_password NOT LIKE '$2a$%'
  AND usu_password NOT LIKE '$2b$%';

-- ── 3. Función de verificación de login ───────────────────────
-- SECURITY DEFINER: corre con privilegios del owner (postgres),
-- no del rol anon. Así puede leer usu_password aunque RLS lo bloquee.
CREATE OR REPLACE FUNCTION verificar_login(p_usuario TEXT, p_password TEXT)
RETURNS TABLE(
  usu_id     TEXT,
  usu_usuario TEXT,
  usu_nombre  TEXT,
  usu_apellido TEXT,
  usu_email   TEXT,
  usu_telefono TEXT,
  rol_nombre  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.usu_id, u.usu_usuario, u.usu_nombre, u.usu_apellido,
         u.usu_email, u.usu_telefono, r.rol_nombre
  FROM   usuarios u
  JOIN   usuario_rol ur ON ur.usu_id = u.usu_id
  JOIN   roles       r  ON r.rol_id  = ur.rol_id
  WHERE  u.usu_usuario = p_usuario
    AND  u.usu_password = crypt(p_password, u.usu_password);
END;
$$;

REVOKE ALL ON FUNCTION verificar_login(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION verificar_login(TEXT, TEXT) TO anon;

-- ── 4. Función de registro ─────────────────────────────────────
-- Hashea la contraseña en el servidor; el texto plano nunca se almacena.
CREATE OR REPLACE FUNCTION registrar_usuario(
  p_usuario  TEXT,
  p_email    TEXT,
  p_nombre   TEXT,
  p_apellido TEXT,
  p_telefono TEXT,
  p_password TEXT,
  p_rol_id   TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id TEXT;
BEGIN
  -- Validaciones de unicidad
  IF EXISTS (SELECT 1 FROM usuarios WHERE usu_usuario = p_usuario) THEN
    RETURN json_build_object('ok', false, 'msg', 'Ese nombre de usuario ya existe.');
  END IF;
  IF EXISTS (SELECT 1 FROM usuarios WHERE usu_email = p_email) THEN
    RETURN json_build_object('ok', false, 'msg', 'Ya existe una cuenta con ese correo.');
  END IF;
  IF p_telefono <> '' AND EXISTS (
    SELECT 1 FROM usuarios WHERE usu_telefono = p_telefono AND usu_telefono <> ''
  ) THEN
    RETURN json_build_object('ok', false, 'msg', 'Ya existe una cuenta con ese número de teléfono.');
  END IF;

  INSERT INTO usuarios(usu_usuario, usu_email, usu_nombre, usu_apellido, usu_telefono, usu_password)
  VALUES (
    p_usuario, p_email, p_nombre,
    COALESCE(NULLIF(p_apellido, ''), ''),
    COALESCE(NULLIF(p_telefono, ''), ''),
    crypt(p_password, gen_salt('bf', 10))   -- hash bcrypt, costo 10
  )
  RETURNING usu_id INTO v_id;

  INSERT INTO usuario_rol(usu_id, rol_id) VALUES (v_id, p_rol_id);

  RETURN json_build_object('ok', true, 'usu_id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'msg', 'Error al registrar. Intenta de nuevo.');
END;
$$;

REVOKE ALL ON FUNCTION registrar_usuario(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION registrar_usuario(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO anon;

-- ── 5. Función para listar usuarios (sin contraseña) ──────────
CREATE OR REPLACE FUNCTION listar_usuarios()
RETURNS TABLE(
  usu_id     TEXT,
  usu_usuario TEXT,
  usu_email   TEXT,
  usu_nombre  TEXT,
  usu_apellido TEXT,
  usu_telefono TEXT,
  rol         TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.usu_id, u.usu_usuario, u.usu_email, u.usu_nombre, u.usu_apellido,
         u.usu_telefono, COALESCE(r.rol_nombre, 'usuario') AS rol
  FROM   usuarios u
  LEFT JOIN usuario_rol ur ON ur.usu_id = u.usu_id
  LEFT JOIN roles       r  ON r.rol_id  = ur.rol_id
  ORDER BY u.usu_nombre;
END;
$$;

REVOKE ALL ON FUNCTION listar_usuarios() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION listar_usuarios() TO anon;

-- ── 6. Row Level Security ──────────────────────────────────────
-- Tabla usuarios: anon NO puede leer ni escribir directamente.
-- Solo accesible mediante las funciones SECURITY DEFINER anteriores.
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuarios_deny_anon"    ON usuarios;
DROP POLICY IF EXISTS "usuarios_allow_service" ON usuarios;
CREATE POLICY "usuarios_deny_anon"     ON usuarios FOR ALL TO anon         USING (false) WITH CHECK (false);
CREATE POLICY "usuarios_allow_service" ON usuarios FOR ALL TO service_role USING (true)  WITH CHECK (true);

-- Tabla usuario_rol: ídem
ALTER TABLE usuario_rol ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuario_rol_deny_anon"    ON usuario_rol;
DROP POLICY IF EXISTS "usuario_rol_allow_service" ON usuario_rol;
CREATE POLICY "usuario_rol_deny_anon"     ON usuario_rol FOR ALL TO anon         USING (false) WITH CHECK (false);
CREATE POLICY "usuario_rol_allow_service" ON usuario_rol FOR ALL TO service_role USING (true)  WITH CHECK (true);

-- Tabla roles: solo lectura pública
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "roles_public_read" ON roles;
CREATE POLICY "roles_public_read" ON roles FOR SELECT TO anon USING (true);

-- Menú y stock: acceso total para anon
-- (Sin Supabase Auth no se puede distinguir admin de público en RLS;
--  el control de acceso al formulario es frontend. Proteger con Supabase Auth en v2.)
ALTER TABLE platos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredientes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE plato_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesas           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platos_anon_all"        ON platos;
DROP POLICY IF EXISTS "categorias_anon_all"    ON categorias;
DROP POLICY IF EXISTS "ingredientes_anon_all"  ON ingredientes;
DROP POLICY IF EXISTS "plato_ing_anon_all"     ON plato_ingredientes;
DROP POLICY IF EXISTS "productos_anon_all"     ON productos;
DROP POLICY IF EXISTS "mesas_anon_all"         ON mesas;

CREATE POLICY "platos_anon_all"       ON platos          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "categorias_anon_all"   ON categorias      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ingredientes_anon_all" ON ingredientes     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "plato_ing_anon_all"    ON plato_ingredientes FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "productos_anon_all"    ON productos        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "mesas_anon_all"        ON mesas            FOR ALL TO anon USING (true) WITH CHECK (true);

-- Operaciones: pedidos, facturas, gastos, mensajes
ALTER TABLE pedidos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_pedidos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE det_exclusiones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_facturas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedidos_anon_all"      ON pedidos;
DROP POLICY IF EXISTS "detped_anon_all"       ON detalle_pedidos;
DROP POLICY IF EXISTS "detexcl_anon_all"      ON det_exclusiones;
DROP POLICY IF EXISTS "facturas_anon_all"     ON facturas;
DROP POLICY IF EXISTS "detfact_anon_all"      ON detalle_facturas;
DROP POLICY IF EXISTS "gastos_anon_all"       ON gastos;
DROP POLICY IF EXISTS "mensajes_anon_all"     ON mensajes;

CREATE POLICY "pedidos_anon_all"    ON pedidos          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "detped_anon_all"     ON detalle_pedidos  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "detexcl_anon_all"    ON det_exclusiones  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "facturas_anon_all"   ON facturas         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "detfact_anon_all"    ON detalle_facturas FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "gastos_anon_all"     ON gastos           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "mensajes_anon_all"   ON mensajes         FOR ALL TO anon USING (true) WITH CHECK (true);
