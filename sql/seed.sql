-- =================================================================
-- SEED - Sal y Canela
-- Datos iniciales: roles y usuario administrador
-- Ejecutar en Supabase → SQL Editor (seguridad.sql ya debe estar corrido)
-- =================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Roles ──────────────────────────────────────────────────────
INSERT INTO roles (rol_id, rol_nombre) VALUES
  ('rol001', 'administrador'),
  ('rol002', 'cajero'),
  ('rol003', 'mesero'),
  ('rol004', 'usuario')
ON CONFLICT (rol_id) DO NOTHING;

-- ── 2. Usuario administrador ──────────────────────────────────────
-- Credenciales: usuario = admin  /  contraseña = admin123
DO $$
DECLARE v_id TEXT;
BEGIN
  -- Insertar admin; si ya existe resetea su contraseña
  INSERT INTO usuarios (usu_usuario, usu_email, usu_nombre, usu_apellido, usu_telefono, usu_password)
  VALUES (
    'admin',
    'admin@salycanela.com',
    'Administrador',
    '',
    '',
    crypt('admin123', gen_salt('bf', 10))
  )
  ON CONFLICT (usu_usuario) DO UPDATE
    SET usu_password = EXCLUDED.usu_password
  RETURNING usu_id INTO v_id;

  -- Asignar rol administrador (ignora si ya existe)
  INSERT INTO usuario_rol (usu_id, rol_id)
  VALUES (v_id, 'rol001')
  ON CONFLICT DO NOTHING;
END;
$$;
