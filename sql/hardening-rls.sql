-- =================================================================
-- HARDENING RLS — Sal y Canela
-- Hasta ahora, pedidos/facturas/pagos/gastos/mensajes tenían
-- "FOR ALL TO anon USING(true)" — cualquiera con la llave anon
-- (pública, visible en el código fuente) podía leer o escribir lo
-- que quisiera en esas tablas directamente contra la API de
-- Supabase, sin pasar por la UI de la app.
--
-- Este script:
--  1. Crea sesiones_staff: un token de sesión por login, para poder
--     distinguir "esto lo pidió alguien logueado como cajero/admin"
--     de "esto lo pidió cualquiera con la llave anon".
--  2. Reemplaza verificar_login() para que emita ese token.
--  3. Agrega RPCs SECURITY DEFINER para las acciones sensibles
--     (cobrar pedido, registrar/eliminar gasto, leer/marcar mensajes),
--     que exigen un token válido con el rol correcto.
--  4. Endurece las políticas RLS: pedidos/detalle solo escribibles
--     por anon mientras estén en estado 'pendiente' (la transición a
--     'cobrado' queda reservada a cobrar_pedido()); facturas/pagos/
--     gastos pasan a solo-lectura para anon; mensajes pasa a
--     solo-inserción para anon (cierra la fuga de PII de clientes).
--
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- =================================================================

-- ── 1. Tabla de sesiones (token por login, cualquier rol) ────────
CREATE TABLE IF NOT EXISTS sesiones_staff (
  token     TEXT PRIMARY KEY,
  usu_id    TEXT NOT NULL REFERENCES usuarios(usu_id) ON DELETE CASCADE,
  rol       TEXT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_en TIMESTAMPTZ NOT NULL
);

ALTER TABLE sesiones_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sesiones_staff_deny_anon" ON sesiones_staff;
CREATE POLICY "sesiones_staff_deny_anon" ON sesiones_staff FOR ALL TO anon USING (false) WITH CHECK (false);

-- ── 2. verificar_login() ahora también emite un token de sesión ──
DROP FUNCTION IF EXISTS verificar_login(TEXT, TEXT);
CREATE OR REPLACE FUNCTION verificar_login(p_usuario TEXT, p_password TEXT)
RETURNS TABLE(
  usu_id       TEXT,
  usu_usuario  TEXT,
  usu_nombre   TEXT,
  usu_apellido TEXT,
  usu_email    TEXT,
  usu_telefono TEXT,
  rol_nombre   TEXT,
  sesion_token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_usu_id TEXT;
  v_rol    TEXT;
  v_token  TEXT;
BEGIN
  SELECT u.usu_id, r.rol_nombre INTO v_usu_id, v_rol
  FROM   usuarios u
  JOIN   usuario_rol ur ON ur.usu_id = u.usu_id
  JOIN   roles       r  ON r.rol_id  = ur.rol_id
  WHERE  u.usu_usuario = p_usuario
    AND  u.usu_password = crypt(p_password, u.usu_password);

  IF v_usu_id IS NULL THEN
    RETURN; -- sin filas = credenciales inválidas, igual que antes
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO sesiones_staff (token, usu_id, rol, expira_en)
  VALUES (v_token, v_usu_id, v_rol, NOW() + INTERVAL '12 hours');

  RETURN QUERY
  SELECT u.usu_id, u.usu_usuario, u.usu_nombre, u.usu_apellido,
         u.usu_email, u.usu_telefono, v_rol, v_token
  FROM   usuarios u WHERE u.usu_id = v_usu_id;
END;
$$;

REVOKE ALL ON FUNCTION verificar_login(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION verificar_login(TEXT, TEXT) TO anon;

-- ── 3. Cerrar sesión (best-effort al hacer logout) ────────────────
CREATE OR REPLACE FUNCTION cerrar_sesion_staff(p_token TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM sesiones_staff WHERE token = p_token;
$$;

REVOKE ALL ON FUNCTION cerrar_sesion_staff(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION cerrar_sesion_staff(TEXT) TO anon;

-- ── 4. Secuencia de numeración de facturas (evita duplicados por
--       carrera entre dos cobros simultáneos con el conteo anterior) ─
CREATE SEQUENCE IF NOT EXISTS seq_fact_numero;
SELECT setval('seq_fact_numero', COALESCE((SELECT COUNT(*) FROM facturas), 0) + 1, false);

-- ── 5. cobrar_pedido(): reemplaza las 3 escrituras sueltas
--       (pedidos.update + facturas.insert + detalle_facturas.insert +
--       pagos.insert) que hacía el cliente directo, en una sola
--       transacción server-side. Solo cajero/administrador con
--       token vigente pueden ejecutarla.
CREATE OR REPLACE FUNCTION cobrar_pedido(
  p_token     TEXT,
  p_ped_id    TEXT,
  p_metodo_id TEXT,
  p_monto     NUMERIC,
  p_cambio    NUMERIC
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

  INSERT INTO facturas (ped_id, usu_id, fact_numero, fact_subtotal, fact_iva, fact_total, fact_estado)
  VALUES (p_ped_id, v_ped.usu_id, v_fact_numero, v_ped.ped_subtotal, v_ped.ped_iva, v_ped.ped_total, 'emitida')
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

REVOKE ALL ON FUNCTION cobrar_pedido(TEXT, TEXT, TEXT, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION cobrar_pedido(TEXT, TEXT, TEXT, NUMERIC, NUMERIC) TO anon;

-- ── 6. Gastos: registrar / eliminar (solo cajero/administrador) ──
CREATE OR REPLACE FUNCTION registrar_gasto(
  p_token       TEXT,
  p_descripcion TEXT,
  p_monto       NUMERIC,
  p_fecha       DATE,
  p_hora        TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_usu_id TEXT;
  v_rol    TEXT;
  v_gasto  RECORD;
BEGIN
  SELECT usu_id, rol INTO v_usu_id, v_rol FROM sesiones_staff WHERE token = p_token AND expira_en > NOW();
  IF v_usu_id IS NULL OR v_rol NOT IN ('cajero', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO gastos (usu_id, gast_descripcion, gast_monto, gast_fecha, gast_hora)
  VALUES (v_usu_id, p_descripcion, p_monto, p_fecha, p_hora)
  RETURNING gast_id, gast_descripcion, gast_monto, gast_fecha, gast_hora, usu_id
  INTO v_gasto;

  RETURN row_to_json(v_gasto);
END;
$$;

REVOKE ALL ON FUNCTION registrar_gasto(TEXT, TEXT, NUMERIC, DATE, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION registrar_gasto(TEXT, TEXT, NUMERIC, DATE, TEXT) TO anon;

CREATE OR REPLACE FUNCTION eliminar_gasto_staff(p_token TEXT, p_gasto_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rol TEXT;
BEGIN
  SELECT rol INTO v_rol FROM sesiones_staff WHERE token = p_token AND expira_en > NOW();
  IF v_rol IS NULL OR v_rol NOT IN ('cajero', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  DELETE FROM gastos WHERE gast_id = p_gasto_id;
END;
$$;

REVOKE ALL ON FUNCTION eliminar_gasto_staff(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION eliminar_gasto_staff(TEXT, TEXT) TO anon;

-- ── 7. Mensajes de contacto: leer / marcar leído (solo administrador) ─
CREATE OR REPLACE FUNCTION admin_listar_mensajes(p_token TEXT)
RETURNS SETOF mensajes
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

  RETURN QUERY SELECT * FROM mensajes ORDER BY mens_enviado_en DESC;
END;
$$;

REVOKE ALL ON FUNCTION admin_listar_mensajes(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_listar_mensajes(TEXT) TO anon;

CREATE OR REPLACE FUNCTION admin_marcar_mensaje_leido(p_token TEXT, p_mens_id BIGINT)
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

REVOKE ALL ON FUNCTION admin_marcar_mensaje_leido(TEXT, BIGINT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_marcar_mensaje_leido(TEXT, BIGINT) TO anon;

CREATE OR REPLACE FUNCTION admin_contar_mensajes_no_leidos(p_token TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rol   TEXT;
  v_count INT;
BEGIN
  SELECT rol INTO v_rol FROM sesiones_staff WHERE token = p_token AND expira_en > NOW();
  IF v_rol IS NULL OR v_rol <> 'administrador' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COUNT(*) INTO v_count FROM mensajes WHERE mens_leido = false;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION admin_contar_mensajes_no_leidos(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_contar_mensajes_no_leidos(TEXT) TO anon;

-- ── 8. Endurecer políticas RLS ─────────────────────────────────────

-- pedidos / detalle_pedidos / det_exclusiones: lectura abierta (la
-- necesitan clientes anónimos para ver el menú/mesas y su propio
-- historial), pero solo se pueden INSERTAR/ACTUALIZAR/BORRAR mientras
-- el pedido esté en estado 'pendiente'. La transición a 'cobrado'
-- queda reservada a cobrar_pedido() (SECURITY DEFINER, salta RLS).
DROP POLICY IF EXISTS "pedidos_anon_all" ON pedidos;
CREATE POLICY "pedidos_anon_select" ON pedidos FOR SELECT TO anon USING (true);
CREATE POLICY "pedidos_anon_insert" ON pedidos FOR INSERT TO anon
  WITH CHECK (ped_estado = 'pendiente');
CREATE POLICY "pedidos_anon_update" ON pedidos FOR UPDATE TO anon
  USING (ped_estado = 'pendiente') WITH CHECK (ped_estado = 'pendiente');
CREATE POLICY "pedidos_anon_delete" ON pedidos FOR DELETE TO anon
  USING (ped_estado = 'pendiente');

DROP POLICY IF EXISTS "detped_anon_all" ON detalle_pedidos;
CREATE POLICY "detped_anon_select" ON detalle_pedidos FOR SELECT TO anon USING (true);
CREATE POLICY "detped_anon_insert" ON detalle_pedidos FOR INSERT TO anon
  WITH CHECK (EXISTS (SELECT 1 FROM pedidos p WHERE p.ped_id = detalle_pedidos.ped_id AND p.ped_estado = 'pendiente'));
CREATE POLICY "detped_anon_update" ON detalle_pedidos FOR UPDATE TO anon
  USING       (EXISTS (SELECT 1 FROM pedidos p WHERE p.ped_id = detalle_pedidos.ped_id AND p.ped_estado = 'pendiente'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pedidos p WHERE p.ped_id = detalle_pedidos.ped_id AND p.ped_estado = 'pendiente'));
CREATE POLICY "detped_anon_delete" ON detalle_pedidos FOR DELETE TO anon
  USING (EXISTS (SELECT 1 FROM pedidos p WHERE p.ped_id = detalle_pedidos.ped_id AND p.ped_estado = 'pendiente'));

DROP POLICY IF EXISTS "detexcl_anon_all" ON det_exclusiones;
CREATE POLICY "detexcl_anon_select" ON det_exclusiones FOR SELECT TO anon USING (true);
CREATE POLICY "detexcl_anon_insert" ON det_exclusiones FOR INSERT TO anon
  WITH CHECK (EXISTS (
    SELECT 1 FROM detalle_pedidos dp JOIN pedidos p ON p.ped_id = dp.ped_id
    WHERE dp.detped_id = det_exclusiones.detped_id AND p.ped_estado = 'pendiente'
  ));
CREATE POLICY "detexcl_anon_delete" ON det_exclusiones FOR DELETE TO anon
  USING (EXISTS (
    SELECT 1 FROM detalle_pedidos dp JOIN pedidos p ON p.ped_id = dp.ped_id
    WHERE dp.detped_id = det_exclusiones.detped_id AND p.ped_estado = 'pendiente'
  ));

-- facturas / detalle_facturas / pagos: solo lectura para anon.
-- La única escritura (al cobrar) ahora pasa por cobrar_pedido().
DROP POLICY IF EXISTS "facturas_anon_all" ON facturas;
CREATE POLICY "facturas_anon_select" ON facturas FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "detfact_anon_all" ON detalle_facturas;
CREATE POLICY "detfact_anon_select" ON detalle_facturas FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "pagos_anon_all" ON pagos;
CREATE POLICY "pagos_anon_select" ON pagos FOR SELECT TO anon USING (true);

-- gastos: solo lectura para anon (los dashboards de caja/admin la
-- necesitan en tiempo real). Alta/baja van por registrar_gasto()/
-- eliminar_gasto_staff().
DROP POLICY IF EXISTS "gastos_anon_all" ON gastos;
CREATE POLICY "gastos_anon_select" ON gastos FOR SELECT TO anon USING (true);

-- mensajes: anon solo puede INSERTAR (formulario público de contacto).
-- Lectura y marcar-como-leído quedan solo en las RPCs de admin.
DROP POLICY IF EXISTS "mensajes_anon_all" ON mensajes;
CREATE POLICY "mensajes_anon_insert" ON mensajes FOR INSERT TO anon WITH CHECK (true);
