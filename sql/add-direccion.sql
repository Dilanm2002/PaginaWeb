-- =================================================================
-- ADD DIRECCIÓN — Sal y Canela
-- Agrega campo dirección a usuarios y actualiza el RPC de registro.
-- Ejecutar en Supabase → SQL Editor
-- =================================================================

-- ── 1. Columna usu_direccion ──────────────────────────────────────
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS usu_direccion TEXT NOT NULL DEFAULT '';

-- ── 2. registrar_usuario actualizado (con dirección) ─────────────
DROP FUNCTION IF EXISTS registrar_usuario(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);

CREATE OR REPLACE FUNCTION registrar_usuario(
  p_usuario   TEXT,
  p_email     TEXT,
  p_nombre    TEXT,
  p_apellido  TEXT,
  p_telefono  TEXT,
  p_password  TEXT,
  p_rol_id    TEXT,
  p_direccion TEXT DEFAULT ''
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id TEXT;
BEGIN
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

  INSERT INTO usuarios(usu_usuario, usu_email, usu_nombre, usu_apellido, usu_telefono, usu_password, usu_direccion)
  VALUES (
    p_usuario, p_email, p_nombre,
    COALESCE(NULLIF(p_apellido, ''), ''),
    COALESCE(NULLIF(p_telefono, ''), ''),
    crypt(p_password, gen_salt('bf', 10)),
    COALESCE(NULLIF(TRIM(p_direccion), ''), '')
  )
  RETURNING usu_id INTO v_id;

  INSERT INTO usuario_rol(usu_id, rol_id) VALUES (v_id, p_rol_id);

  RETURN json_build_object('ok', true, 'usu_id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'msg', 'Error al registrar. Intenta de nuevo.');
END;
$$;

REVOKE ALL ON FUNCTION registrar_usuario(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION registrar_usuario(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO anon;

-- ── 3. listar_usuarios actualizado (incluye dirección) ───────────
DROP FUNCTION IF EXISTS listar_usuarios();
CREATE OR REPLACE FUNCTION listar_usuarios()
RETURNS TABLE(
  usu_id       TEXT,
  usu_usuario  TEXT,
  usu_email    TEXT,
  usu_nombre   TEXT,
  usu_apellido TEXT,
  usu_telefono TEXT,
  usu_direccion TEXT,
  rol          TEXT,
  usu_activo   BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT u.usu_id, u.usu_usuario, u.usu_email, u.usu_nombre, u.usu_apellido,
         u.usu_telefono, u.usu_direccion,
         COALESCE(r.rol_nombre, 'usuario') AS rol,
         u.usu_activo
  FROM   usuarios u
  LEFT JOIN usuario_rol ur ON ur.usu_id = u.usu_id
  LEFT JOIN roles       r  ON r.rol_id  = ur.rol_id
  WHERE  u.usu_id NOT IN (SELECT usu_id FROM empleados)
  ORDER BY u.usu_nombre;
END;
$$;

REVOKE ALL ON FUNCTION listar_usuarios() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION listar_usuarios() TO anon;
