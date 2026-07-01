-- =================================================================
-- ESTADO DE USUARIO - Sal y Canela
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- Requiere seguridad.sql y gestion-usuarios.sql ya corridos.
-- =================================================================

-- ── 1. Columna usu_activo ─────────────────────────────────────────
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS usu_activo BOOLEAN NOT NULL DEFAULT true;

-- ── 2. Actualizar listar_usuarios (ahora incluye usu_activo) ─────
DROP FUNCTION IF EXISTS listar_usuarios();
CREATE OR REPLACE FUNCTION listar_usuarios()
RETURNS TABLE(
  usu_id      TEXT,
  usu_usuario TEXT,
  usu_email   TEXT,
  usu_nombre  TEXT,
  usu_apellido TEXT,
  usu_telefono TEXT,
  rol         TEXT,
  usu_activo  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT u.usu_id, u.usu_usuario, u.usu_email, u.usu_nombre, u.usu_apellido,
         u.usu_telefono, COALESCE(r.rol_nombre, 'usuario') AS rol,
         u.usu_activo
  FROM   usuarios u
  LEFT JOIN usuario_rol ur ON ur.usu_id = u.usu_id
  LEFT JOIN roles       r  ON r.rol_id  = ur.rol_id
  ORDER BY u.usu_nombre;
END;
$$;

REVOKE ALL ON FUNCTION listar_usuarios() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION listar_usuarios() TO anon;

-- ── 3. Actualizar verificar_login (bloquea usuarios inactivos) ────
DROP FUNCTION IF EXISTS verificar_login(TEXT, TEXT);
CREATE OR REPLACE FUNCTION verificar_login(p_usuario TEXT, p_password TEXT)
RETURNS TABLE(
  usu_id      TEXT,
  usu_usuario TEXT,
  usu_nombre  TEXT,
  usu_apellido TEXT,
  usu_email   TEXT,
  usu_telefono TEXT,
  rol_nombre  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT u.usu_id, u.usu_usuario, u.usu_nombre, u.usu_apellido,
         u.usu_email, u.usu_telefono, r.rol_nombre
  FROM   usuarios u
  JOIN   usuario_rol ur ON ur.usu_id = u.usu_id
  JOIN   roles       r  ON r.rol_id  = ur.rol_id
  WHERE  u.usu_usuario  = p_usuario
    AND  u.usu_password  = crypt(p_password, u.usu_password)
    AND  u.usu_activo    = true;
END;
$$;

REVOKE ALL ON FUNCTION verificar_login(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION verificar_login(TEXT, TEXT) TO anon;

-- ── 4. Función para verificar si la cuenta está activa ───────────
-- Permite mostrar un mensaje claro antes de intentar el login.
CREATE OR REPLACE FUNCTION verificar_estado_usuario(p_usuario TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_activo BOOLEAN;
BEGIN
  SELECT usu_activo INTO v_activo
  FROM   usuarios
  WHERE  usu_usuario = p_usuario;

  IF NOT FOUND THEN
    -- No revelar si el usuario existe; tratar como "activo" para que
    -- verificar_login devuelva credenciales incorrectas normal.
    RETURN json_build_object('activo', true);
  END IF;

  RETURN json_build_object('activo', v_activo);
END;
$$;

REVOKE ALL ON FUNCTION verificar_estado_usuario(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION verificar_estado_usuario(TEXT) TO anon;

-- ── 5. Función para activar / desactivar un usuario ──────────────
CREATE OR REPLACE FUNCTION cambiar_estado_usuario(p_usu_id TEXT, p_activo BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE usuarios SET usu_activo = p_activo WHERE usu_id = p_usu_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'msg', 'Usuario no encontrado.');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION cambiar_estado_usuario(TEXT, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION cambiar_estado_usuario(TEXT, BOOLEAN) TO anon;
