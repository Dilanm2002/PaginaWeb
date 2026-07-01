-- Función para que un admin (o cualquier usuario) cambie su propia contraseña.
-- Verifica la contraseña actual antes de actualizar, usando bcrypt (pgcrypto).
-- Ejecutar este script en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION cambiar_password(
  p_id          TEXT,
  p_pass_actual TEXT,
  p_pass_nueva  TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  -- Validar que la nueva contraseña tenga al menos 6 caracteres
  IF length(p_pass_nueva) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'La nueva contraseña debe tener al menos 6 caracteres.');
  END IF;

  -- Verificar que la contraseña actual sea correcta
  SELECT (usu_password = crypt(p_pass_actual, usu_password))
    INTO v_ok
    FROM usuarios
   WHERE usu_id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Usuario no encontrado.');
  END IF;

  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'La contraseña actual es incorrecta.');
  END IF;

  -- Actualizar con nuevo hash bcrypt
  UPDATE usuarios
     SET usu_password = crypt(p_pass_nueva, gen_salt('bf', 10))
   WHERE usu_id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Revocar acceso público (solo lo llama el backend con service role o el propio usuario autenticado)
REVOKE EXECUTE ON FUNCTION cambiar_password(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION cambiar_password(TEXT, TEXT, TEXT) TO anon, authenticated;
