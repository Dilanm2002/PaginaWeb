-- ====================================================================
-- login_con_google — Sal y Canela
-- Busca un usuario por email (cuenta Google) o lo crea automáticamente
-- con rol 'usuario'. La contraseña queda como hash de UUID aleatorio
-- (imposible de adivinar) para que solo puedan entrar vía Google.
-- Ejecutar en Supabase → SQL Editor (una sola vez).
-- ====================================================================

CREATE OR REPLACE FUNCTION login_con_google(p_email TEXT, p_nombre TEXT)
RETURNS TABLE(
  usu_id       TEXT,
  usu_usuario  TEXT,
  usu_email    TEXT,
  usu_nombre   TEXT,
  usu_apellido TEXT,
  rol_nombre   TEXT,
  usu_activo   BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id  TEXT;
  v_usuario  TEXT;
  v_base     TEXT;
  v_nombre   TEXT;
  v_apellido TEXT;
  v_sufijo   INT := 2;
BEGIN
  -- Buscar usuario existente por email
  SELECT u.usu_id INTO v_user_id
  FROM   usuarios u
  WHERE  u.usu_email = p_email
  LIMIT  1;

  IF v_user_id IS NULL THEN
    -- Generar username desde el prefijo del email (solo letras/números/guion bajo)
    v_base := lower(regexp_replace(split_part(p_email, '@', 1), '[^a-z0-9_]', '', 'g'));
    IF length(v_base) < 3 THEN v_base := v_base || 'usr'; END IF;

    -- Asegurar unicidad del username
    v_usuario := v_base;
    WHILE EXISTS(SELECT 1 FROM usuarios ux WHERE ux.usu_usuario = v_usuario) LOOP
      v_usuario := v_base || v_sufijo::text;
      v_sufijo  := v_sufijo + 1;
    END LOOP;

    -- Separar nombre y apellido del nombre completo de Google
    v_nombre   := trim(split_part(p_nombre, ' ', 1));
    v_apellido := trim(substring(p_nombre FROM position(' ' in p_nombre) + 1));
    IF v_apellido = '' OR v_apellido = v_nombre THEN v_apellido := ''; END IF;

    v_user_id := gen_random_uuid()::text;

    INSERT INTO usuarios (
      usu_id, usu_usuario, usu_email, usu_nombre, usu_apellido,
      usu_password, usu_telefono, usu_direccion, usu_activo
    ) VALUES (
      v_user_id, v_usuario, p_email, v_nombre, v_apellido,
      crypt(gen_random_uuid()::text, gen_salt('bf')),
      '', '', true
    );

    -- Rol por defecto: usuario (rol004)
    INSERT INTO usuario_rol (usu_id, rol_id) VALUES (v_user_id, 'rol004');
  END IF;

  RETURN QUERY
  SELECT
    u.usu_id, u.usu_usuario, u.usu_email, u.usu_nombre, u.usu_apellido,
    COALESCE(r.rol_nombre, 'usuario') AS rol_nombre,
    u.usu_activo
  FROM   usuarios u
  LEFT JOIN usuario_rol ur ON ur.usu_id = u.usu_id
  LEFT JOIN roles       r  ON r.rol_id  = ur.rol_id
  WHERE  u.usu_id = v_user_id
  LIMIT  1;
END;
$$;

REVOKE ALL ON FUNCTION login_con_google(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION login_con_google(TEXT, TEXT) TO anon;
