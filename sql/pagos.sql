-- =================================================================
-- PAGOS - Sal y Canela
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- =================================================================

-- ── 1. Secuencias ─────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS seq_met_pago  START 1;
CREATE SEQUENCE IF NOT EXISTS seq_pagos     START 1;

-- ── 2. Tabla de métodos de pago ────────────────────────────────
CREATE TABLE IF NOT EXISTS metodos_pago (
  metodo_id     TEXT PRIMARY KEY DEFAULT 'met' || LPAD(nextval('seq_met_pago')::text, 3, '0'),
  metodo_nombre TEXT NOT NULL UNIQUE
);

-- Insertar los 4 métodos base (idempotente)
INSERT INTO metodos_pago (metodo_id, metodo_nombre) VALUES
  ('met001', 'Efectivo'),
  ('met002', 'Tarjeta de crédito'),
  ('met003', 'Tarjeta de débito'),
  ('met004', 'Transferencia')
ON CONFLICT DO NOTHING;

-- ── 3. Tabla de pagos ──────────────────────────────────────────
-- Un registro por cobro: liga la factura al método y montos.
CREATE TABLE IF NOT EXISTS pagos (
  pago_id      TEXT PRIMARY KEY DEFAULT 'pago' || LPAD(nextval('seq_pagos')::text, 6, '0'),
  fact_id      TEXT REFERENCES facturas(fact_id) ON DELETE SET NULL,
  metodo_id    TEXT REFERENCES metodos_pago(metodo_id),
  pago_monto   NUMERIC(10, 2) NOT NULL,
  pago_cambio  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  pago_fecha   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Row Level Security ──────────────────────────────────────
ALTER TABLE metodos_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metodos_pago_anon_read" ON metodos_pago;
DROP POLICY IF EXISTS "pagos_anon_all"          ON pagos;

-- Métodos de pago: solo lectura pública (datos estáticos)
CREATE POLICY "metodos_pago_anon_read"
  ON metodos_pago FOR SELECT TO anon USING (true);

-- Pagos: el cajero puede insertar y leer (anon key)
CREATE POLICY "pagos_anon_all"
  ON pagos FOR ALL TO anon USING (true) WITH CHECK (true);
