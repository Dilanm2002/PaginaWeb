-- =================================================================
-- MIGRACIÓN: columna plat_permite_excluir
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- =================================================================
ALTER TABLE platos
  ADD COLUMN IF NOT EXISTS plat_permite_excluir BOOLEAN NOT NULL DEFAULT false;
