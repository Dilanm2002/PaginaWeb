-- =================================================================
-- ENVÍO DE NOTA DE VENTA POR CORREO — Sal y Canela
-- Agrega el correo del cliente a facturas (útil para reenviar después
-- desde el historial del admin) y actualiza cobrar_pedido() para
-- recibirlo y guardarlo.
--
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- =================================================================

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS fact_email TEXT;

DROP FUNCTION IF EXISTS cobrar_pedido(TEXT, TEXT, TEXT, NUMERIC, NUMERIC);
CREATE OR REPLACE FUNCTION cobrar_pedido(
  p_token     TEXT,
  p_ped_id    TEXT,
  p_metodo_id TEXT,
  p_monto     NUMERIC,
  p_cambio    NUMERIC,
  p_email     TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rol         TEXT;
  v_ped         RECORD;
  v_fact_id     TEXT;
  v_fact_numero TEXT;
BEGIN
  SELECT rol INTO v_rol FROM sesiones_staff WHERE token = p_token AND expira_en > NOW();
  IF v_rol IS NULL OR v_rol NOT IN ('cajero', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_ped FROM pedidos WHERE ped_id = p_ped_id AND ped_estado = 'pendiente';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado o ya no está pendiente';
  END IF;

  UPDATE pedidos
  SET ped_estado     = 'cobrado',
      ped_fecha      = (NOW() AT TIME ZONE 'America/Guayaquil')::date,
      ped_cobrado_en = NOW()
  WHERE ped_id = p_ped_id;

  v_fact_numero := 'FACT-' || LPAD(nextval('seq_fact_numero')::text, 6, '0');

  INSERT INTO facturas (ped_id, usu_id, fact_numero, fact_subtotal, fact_iva, fact_total, fact_estado, fact_email)
  VALUES (p_ped_id, v_ped.usu_id, v_fact_numero, v_ped.ped_subtotal, v_ped.ped_iva, v_ped.ped_total, 'emitida', NULLIF(p_email, ''))
  RETURNING fact_id INTO v_fact_id;

  INSERT INTO detalle_facturas (fact_id, plat_id, detfact_descripcion, detfact_cantidad, detfact_precio_unit, detfact_subtotal)
  SELECT v_fact_id, dp.plat_id, p.plat_nombre, dp.detped_cantidad, dp.detped_precio_unit, dp.detped_subtotal
  FROM   detalle_pedidos dp
  JOIN   platos p ON p.plat_id = dp.plat_id
  WHERE  dp.ped_id = p_ped_id;

  INSERT INTO pagos (fact_id, metodo_id, pago_monto, pago_cambio)
  VALUES (v_fact_id, p_metodo_id, COALESCE(p_monto, v_ped.ped_total), COALESCE(p_cambio, 0));

  RETURN json_build_object('fact_id', v_fact_id, 'fact_numero', v_fact_numero);
END;
$$;

REVOKE ALL ON FUNCTION cobrar_pedido(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION cobrar_pedido(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) TO anon;
