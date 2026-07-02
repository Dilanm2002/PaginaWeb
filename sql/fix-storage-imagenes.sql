-- =================================================================
-- FIX storage bucket "menu-imagenes" — Sal y Canela
-- El bucket existe (por eso las imágenes de productos ya guardados sí
-- se ven), pero nunca se configuró una política que permita a `anon`
-- SUBIR/ACTUALIZAR imágenes — por eso "Guardar" se queda trabado con
-- "new row violates row-level security policy" al crear un producto
-- nuevo con imagen.
--
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- =================================================================

-- Lectura pública (el menú se ve sin login) — no debería hacer falta
-- si el bucket ya está marcado "Public", pero no está de más tenerla.
DROP POLICY IF EXISTS "menu_imagenes_public_read" ON storage.objects;
CREATE POLICY "menu_imagenes_public_read"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'menu-imagenes');

-- Subir imágenes nuevas (mismo modelo de acceso que el resto del panel
-- admin: cualquiera con la llave anon puede hacerlo, no hay forma de
-- distinguir "es el admin logueado" a nivel de Storage sin migrar a
-- sesiones reales de Supabase Auth).
DROP POLICY IF EXISTS "menu_imagenes_anon_insert" ON storage.objects;
CREATE POLICY "menu_imagenes_anon_insert"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'menu-imagenes');

-- Reemplazar una imagen existente (el upload usa upsert:true, que en
-- Supabase Storage hace UPDATE si el archivo ya existe en esa ruta).
DROP POLICY IF EXISTS "menu_imagenes_anon_update" ON storage.objects;
CREATE POLICY "menu_imagenes_anon_update"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'menu-imagenes')
  WITH CHECK (bucket_id = 'menu-imagenes');
