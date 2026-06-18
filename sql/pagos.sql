-- =================================================================
-- PAGOS - Sal y Canela
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- Si ya existían tablas parciales las elimina y las recrea limpio.
-- =================================================================

-- ── 1. Limpiar tablas anteriores (en orden por FK) ────────────
DROP TABLE IF EXISTS pagos        CASCADE;
DROP TABLE IF EXISTS metodos_pago CASCADE;
DROP SEQUENCE IF EXISTS seq_pagos;
DROP SEQUENCE IF EXISTS seq_met_pago;

-- ── 2. Secuencias ─────────────────────────────────────────────
CREATE SEQUENCE seq_met_pago START 1;
CREATE SEQUENCE seq_pagos    START 1;

-- ── 3. Tabla de métodos de pago ───────────────────────────────
CREATE TABLE metodos_pago (
  metodo_id     TEXT PRIMARY KEY DEFAULT 'met' || LPAD(nextval('seq_met_pago')::text, 3, '0'),
  metodo_nombre TEXT NOT NULL UNIQUE
);

-- Insertar los 4 métodos base
INSERT INTO metodos_pago (metodo_id, metodo_nombre) VALUES
  ('met001', 'Efectivo'),
  ('met002', 'Tarjeta de crédito'),
  ('met003', 'Tarjeta de débito'),
  ('met004', 'Transferencia');

-- ── 4. Tabla de pagos ─────────────────────────────────────────
CREATE TABLE pagos (
  pago_id      TEXT PRIMARY KEY DEFAULT 'pago' || LPAD(nextval('seq_pagos')::text, 6, '0'),
  fact_id      TEXT REFERENCES facturas(fact_id) ON DELETE SET NULL,
  metodo_id    TEXT REFERENCES metodos_pago(metodo_id),
  pago_monto   NUMERIC(10, 2) NOT NULL,
  pago_cambio  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  pago_fecha   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. Row Level Security ─────────────────────────────────────
ALTER TABLE metodos_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos        ENABLE ROW LEVEL SECURITY;

-- Métodos de pago: solo lectura pública (datos estáticos)
CREATE POLICY "metodos_pago_anon_read"
  ON metodos_pago FOR SELECT TO anon USING (true);

-- Pagos: el cajero puede insertar y leer (anon key)
CREATE POLICY "pagos_anon_all"
  ON pagos FOR ALL TO anon USING (true) WITH CHECK (true);
