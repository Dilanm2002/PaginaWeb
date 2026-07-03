-- =================================================================
-- ANULAR PEDIDO — Sal y Canela
-- Permite a cajero/administrador anular un pedido pendiente (antes de
-- cobrarlo) — p.ej. el cliente se fue, se equivocó de pedido, etc.
-- Queda registrado con estado 'anulado' (no se borra) para que se vea
-- en el Historial del panel admin.
--
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- =================================================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS ped_motivo_anulacion TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS ped_anulado_en TIMESTAMPTZ;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS ped_anulado_por TEXT REFERENCES usuarios(usu_id);

CREATE OR REPLACE FUNCTION anular_pedido(
  p_token  TEXT,
  p_ped_id TEXT,
  p_motivo TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_usu_id TEXT;
  v_rol    TEXT;
BEGIN
  SELECT usu_id, rol INTO v_usu_id, v_rol FROM sesiones_staff WHERE token = p_token AND expira_en > NOW();
  IF v_usu_id IS NULL OR v_rol NOT IN ('cajero', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE pedidos
  SET ped_estado           = 'anulado',
      ped_motivo_anulacion = NULLIF(p_motivo, ''),
      ped_anulado_en        = NOW(),
      ped_anulado_por       = v_usu_id
  WHERE ped_id = p_ped_id AND ped_estado = 'pendiente';

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'msg', 'El pedido ya no está pendiente (puede que ya se haya cobrado o anulado).');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION anular_pedido(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION anular_pedido(TEXT, TEXT, TEXT) TO anon;
