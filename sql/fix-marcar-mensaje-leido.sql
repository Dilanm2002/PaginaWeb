-- =================================================================
-- FIX: admin_marcar_mensaje_leido daba 404 — Sal y Canela
-- La función original asumía p_mens_id BIGINT, pero mens_id (como el
-- resto del esquema: usu_id, ped_id, plat_id...) es TEXT. Con ese
-- desajuste de tipos, CREATE FUNCTION probablemente falló en silencio
-- al correr hardening-rls.sql, así que la función nunca llegó a
-- existir — de ahí el 404 al hacer clic en "Marcar como leído".
--
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- =================================================================

DROP FUNCTION IF EXISTS admin_marcar_mensaje_leido(TEXT, BIGINT);
CREATE OR REPLACE FUNCTION admin_marcar_mensaje_leido(p_token TEXT, p_mens_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rol TEXT;
BEGIN
  SELECT rol INTO v_rol FROM sesiones_staff WHERE token = p_token AND expira_en > NOW();
  IF v_rol IS NULL OR v_rol <> 'administrador' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE mensajes SET mens_leido = true WHERE mens_id = p_mens_id;
END;
$$;

REVOKE ALL ON FUNCTION admin_marcar_mensaje_leido(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_marcar_mensaje_leido(TEXT, TEXT) TO anon;
