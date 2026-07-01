-- =================================================================
-- FIX listar_usuarios — Sal y Canela
-- Eliminar filtro WHERE NOT IN empleados para que _users incluya
-- también meseros y cajeros, permitiendo resolver sus nombres en
-- los pedidos que aparecen en la vista del cajero/admin.
-- La vista Clientes del admin ya filtra por rol en el frontend.
-- Ejecutar en Supabase → SQL Editor
-- =================================================================

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
  ORDER BY u.usu_nombre;
END;
$$;

REVOKE ALL ON FUNCTION listar_usuarios() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION listar_usuarios() TO anon;
