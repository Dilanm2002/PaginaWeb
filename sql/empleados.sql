-- =================================================================
-- EMPLEADOS - Sal y Canela
-- Ejecutar en Supabase → SQL Editor después de estado-usuario.sql
-- =================================================================

-- ── 1. Secuencia y tabla ──────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS seq_empleados START 1;

CREATE TABLE IF NOT EXISTS empleados (
  emp_id            TEXT PRIMARY KEY DEFAULT 'emp' || LPAD(nextval('seq_empleados')::text, 4, '0'),
  usu_id            TEXT NOT NULL UNIQUE REFERENCES usuarios(usu_id) ON DELETE CASCADE,
  emp_cargo         TEXT NOT NULL DEFAULT '',
  emp_fecha_ingreso DATE NOT NULL DEFAULT CURRENT_DATE,
  emp_activo        BOOLEAN NOT NULL DEFAULT true,
  emp_observaciones TEXT NOT NULL DEFAULT '',
  emp_created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empleados_anon_all" ON empleados FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── 2. Crear empleado (crea usuario + rol + empleado en un solo paso) ──
CREATE OR REPLACE FUNCTION crear_empleado(
  p_nombre        TEXT,
  p_apellido      TEXT,
  p_email         TEXT,
  p_telefono      TEXT,
  p_usuario       TEXT,
  p_password      TEXT,
  p_rol_id        TEXT,
  p_cargo         TEXT,
  p_fecha_ingreso DATE,
  p_observaciones TEXT DEFAULT ''
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_usu_id TEXT;
  v_emp_id TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM usuarios WHERE usu_usuario = p_usuario) THEN
    RETURN json_build_object('ok', false, 'msg', 'Ese usuario ya existe.');
  END IF;
  IF p_email <> '' AND EXISTS (SELECT 1 FROM usuarios WHERE usu_email = p_email) THEN
    RETURN json_build_object('ok', false, 'msg', 'Ese correo ya está registrado.');
  END IF;

  INSERT INTO usuarios(usu_usuario, usu_email, usu_nombre, usu_apellido, usu_telefono, usu_password)
  VALUES (
    p_usuario,
    COALESCE(NULLIF(p_email,''), ''),
    p_nombre,
    COALESCE(NULLIF(p_apellido,''), ''),
    COALESCE(NULLIF(p_telefono,''), ''),
    crypt(p_password, gen_salt('bf', 10))
  )
  RETURNING usu_id INTO v_usu_id;

  INSERT INTO usuario_rol(usu_id, rol_id) VALUES (v_usu_id, p_rol_id);

  INSERT INTO empleados(usu_id, emp_cargo, emp_fecha_ingreso, emp_observaciones)
  VALUES (v_usu_id, p_cargo, COALESCE(p_fecha_ingreso, CURRENT_DATE), COALESCE(p_observaciones,''))
  RETURNING emp_id INTO v_emp_id;

  RETURN json_build_object('ok', true, 'usu_id', v_usu_id, 'emp_id', v_emp_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'msg', 'Error: ' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION crear_empleado(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION crear_empleado(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT) TO anon;

-- ── 3. Listar empleados ───────────────────────────────────────────
DROP FUNCTION IF EXISTS listar_empleados();
CREATE OR REPLACE FUNCTION listar_empleados()
RETURNS TABLE(
  emp_id            TEXT,
  usu_id            TEXT,
  emp_cargo         TEXT,
  emp_fecha_ingreso DATE,
  emp_activo        BOOLEAN,
  emp_observaciones TEXT,
  usu_nombre        TEXT,
  usu_apellido      TEXT,
  usu_email         TEXT,
  usu_usuario       TEXT,
  usu_telefono      TEXT,
  usu_activo        BOOLEAN,
  rol               TEXT,
  rol_id            TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT e.emp_id, e.usu_id, e.emp_cargo, e.emp_fecha_ingreso,
         e.emp_activo, e.emp_observaciones,
         u.usu_nombre, u.usu_apellido, u.usu_email,
         u.usu_usuario, u.usu_telefono, u.usu_activo,
         COALESCE(r.rol_nombre, 'usuario') AS rol,
         COALESCE(ur.rol_id, 'rol004') AS rol_id
  FROM   empleados e
  JOIN   usuarios    u  ON u.usu_id  = e.usu_id
  LEFT JOIN usuario_rol ur ON ur.usu_id = e.usu_id
  LEFT JOIN roles       r  ON r.rol_id  = ur.rol_id
  ORDER BY e.emp_activo DESC, u.usu_nombre;
END;
$$;

REVOKE ALL ON FUNCTION listar_empleados() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION listar_empleados() TO anon;

-- ── 4. Actualizar datos del empleado ─────────────────────────────
CREATE OR REPLACE FUNCTION actualizar_empleado(
  p_emp_id        TEXT,
  p_cargo         TEXT,
  p_rol_id        TEXT,
  p_observaciones TEXT DEFAULT ''
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_usu_id TEXT;
BEGIN
  SELECT usu_id INTO v_usu_id FROM empleados WHERE emp_id = p_emp_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'msg', 'Empleado no encontrado.');
  END IF;

  UPDATE empleados
  SET emp_cargo = p_cargo, emp_observaciones = COALESCE(p_observaciones,'')
  WHERE emp_id = p_emp_id;

  DELETE FROM usuario_rol WHERE usu_id = v_usu_id;
  INSERT INTO usuario_rol(usu_id, rol_id) VALUES (v_usu_id, p_rol_id);

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION actualizar_empleado(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION actualizar_empleado(TEXT,TEXT,TEXT,TEXT) TO anon;

-- ── 5. Actualizar cambiar_estado_usuario (también afecta empleados) ──
DROP FUNCTION IF EXISTS cambiar_estado_usuario(TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION cambiar_estado_usuario(p_usu_id TEXT, p_activo BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE usuarios   SET usu_activo = p_activo WHERE usu_id = p_usu_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'msg', 'Usuario no encontrado.');
  END IF;
  UPDATE empleados  SET emp_activo = p_activo WHERE usu_id = p_usu_id;
  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION cambiar_estado_usuario(TEXT, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION cambiar_estado_usuario(TEXT, BOOLEAN) TO anon;

-- ── 6. listar_usuarios ahora excluye empleados (solo clientes) ───
DROP FUNCTION IF EXISTS listar_usuarios();
CREATE OR REPLACE FUNCTION listar_usuarios()
RETURNS TABLE(
  usu_id      TEXT,
  usu_usuario TEXT,
  usu_email   TEXT,
  usu_nombre  TEXT,
  usu_apellido TEXT,
  usu_telefono TEXT,
  rol         TEXT,
  usu_activo  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT u.usu_id, u.usu_usuario, u.usu_email, u.usu_nombre, u.usu_apellido,
         u.usu_telefono, COALESCE(r.rol_nombre, 'usuario') AS rol,
         u.usu_activo
  FROM   usuarios u
  LEFT JOIN usuario_rol ur ON ur.usu_id = u.usu_id
  LEFT JOIN roles       r  ON r.rol_id  = ur.rol_id
  WHERE  u.usu_id NOT IN (SELECT usu_id FROM empleados)
  ORDER BY u.usu_nombre;
END;
$$;

REVOKE ALL ON FUNCTION listar_usuarios() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION listar_usuarios() TO anon;
