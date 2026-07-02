-- =================================================================
-- FIX fechas históricas — Sal y Canela
-- Antes del fix de código de hoy, ped_fecha/gast_fecha se calculaban
-- con toISOString() (UTC) en vez de hora local de Ecuador (UTC-5).
-- Cualquier pedido cobrado o gasto registrado entre las 19:00 y
-- medianoche hora Ecuador quedó guardado con la fecha del día
-- SIGUIENTE, porque en UTC ya había cruzado la medianoche.
--
-- Este script recalcula esas fechas a partir del timestamp real
-- (que sí está correcto, es timestamptz) convertido a hora Ecuador.
-- Es seguro correrlo varias veces: solo toca filas donde la fecha
-- guardada no coincide con la fecha real en hora local.
--
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- =================================================================

-- Pedidos cobrados: recalcular ped_fecha desde ped_cobrado_en
UPDATE pedidos
SET ped_fecha = (ped_cobrado_en AT TIME ZONE 'America/Guayaquil')::date
WHERE ped_cobrado_en IS NOT NULL
  AND ped_fecha IS DISTINCT FROM (ped_cobrado_en AT TIME ZONE 'America/Guayaquil')::date;

-- Pedidos sin cobrar (pendientes, cancelados): recalcular desde ped_created_at
UPDATE pedidos
SET ped_fecha = (ped_created_at AT TIME ZONE 'America/Guayaquil')::date
WHERE ped_cobrado_en IS NULL
  AND ped_created_at IS NOT NULL
  AND ped_fecha IS DISTINCT FROM (ped_created_at AT TIME ZONE 'America/Guayaquil')::date;

-- Gastos: recalcular gast_fecha desde gast_created_at
UPDATE gastos
SET gast_fecha = (gast_created_at AT TIME ZONE 'America/Guayaquil')::date
WHERE gast_created_at IS NOT NULL
  AND gast_fecha IS DISTINCT FROM (gast_created_at AT TIME ZONE 'America/Guayaquil')::date;
