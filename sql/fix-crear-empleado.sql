-- =================================================================
-- FIX: crear_empleado — email vacío → NULL (evita fallo UNIQUE)
-- Ejecutar en Supabase → SQL Editor
-- =================================================================

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
  v_email  TEXT;
BEGIN
  -- Normalizar email: vacío → NULL para no romper constraint UNIQUE
  v_email := NULLIF(TRIM(p_email), '');

  IF EXISTS (SELECT 1 FROM usuarios WHERE usu_usuario = TRIM(p_usuario)) THEN
    RETURN json_build_object('ok', false, 'msg', 'Ese usuario ya existe.');
  END IF;
  IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM usuarios WHERE usu_email = v_email) THEN
    RETURN json_build_object('ok', false, 'msg', 'Ese correo ya está registrado.');
  END IF;

  INSERT INTO usuarios(usu_usuario, usu_email, usu_nombre, usu_apellido, usu_telefono, usu_password)
  VALUES (
    TRIM(p_usuario),
    v_email,
    TRIM(p_nombre),
    NULLIF(TRIM(p_apellido), ''),
    NULLIF(TRIM(p_telefono), ''),
    crypt(p_password, gen_salt('bf', 10))
  )
  RETURNING usu_id INTO v_usu_id;

  INSERT INTO usuario_rol(usu_id, rol_id) VALUES (v_usu_id, p_rol_id);

  INSERT INTO empleados(usu_id, emp_cargo, emp_fecha_ingreso, emp_observaciones)
  VALUES (
    v_usu_id,
    TRIM(p_cargo),
    COALESCE(p_fecha_ingreso, CURRENT_DATE),
    COALESCE(TRIM(p_observaciones), '')
  )
  RETURNING emp_id INTO v_emp_id;

  RETURN json_build_object('ok', true, 'usu_id', v_usu_id, 'emp_id', v_emp_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION crear_empleado(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION crear_empleado(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT) TO anon;
