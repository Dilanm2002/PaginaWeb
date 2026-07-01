-- =================================================================
-- GESTIÓN DE USUARIOS - Sal y Canela
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- Requiere que seguridad.sql ya esté corrido.
-- =================================================================

-- Función para que el admin cambie el rol de cualquier usuario.
-- SECURITY DEFINER: puede escribir en usuario_rol aunque anon no pueda.
CREATE OR REPLACE FUNCTION cambiar_rol_usuario(p_usu_id TEXT, p_rol_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE usu_id = p_usu_id) THEN
    RETURN json_build_object('ok', false, 'msg', 'Usuario no encontrado.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM roles WHERE rol_id = p_rol_id) THEN
    RETURN json_build_object('ok', false, 'msg', 'Rol no válido.');
  END IF;

  -- Reemplaza el rol existente (elimina cualquier entrada previa y crea la nueva)
  DELETE FROM usuario_rol WHERE usu_id = p_usu_id;
  INSERT INTO usuario_rol (usu_id, rol_id) VALUES (p_usu_id, p_rol_id);

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION cambiar_rol_usuario(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION cambiar_rol_usuario(TEXT, TEXT) TO anon;
