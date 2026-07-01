'use strict';
window.ModuloAutenticacion = (function () {
  const cfg = window.SC_CONFIG;
  let _users = [];

  /* ── Rate limiter ────────────────────────────────────────────
     Bloquea el login tras 5 intentos fallidos durante 5 minutos.
     Se persiste en sessionStorage para sobrevivir recargas en la
     misma pestaña, pero se resetea al abrir una nueva.
  ──────────────────────────────────────────────────────────── */
  const MAX_ATTEMPTS    = 5;
  const LOCK_MS         = 5 * 60 * 1000; // 5 minutos
  const RL_KEY          = 'sc_rl';

  function _rlLoad()  { try { return JSON.parse(sessionStorage.getItem(RL_KEY)) ?? { count: 0, lockedUntil: 0 }; } catch { return { count: 0, lockedUntil: 0 }; } }
  function _rlSave(s) { try { sessionStorage.setItem(RL_KEY, JSON.stringify(s)); } catch {} }

  function _rlCheck() {
    const s = _rlLoad();
    const now = Date.now();
    if (s.lockedUntil > now) {
      const secs = Math.ceil((s.lockedUntil - now) / 1000);
      return { locked: true, msg: `Demasiados intentos fallidos. Espera ${secs} segundos.` };
    }
    return { locked: false };
  }

  function _rlFail() {
    const s   = _rlLoad();
    s.count  += 1;
    if (s.count >= MAX_ATTEMPTS) {
      s.lockedUntil = Date.now() + LOCK_MS;
      s.count = 0;
      _rlSave(s);
      return `Demasiados intentos fallidos. Cuenta bloqueada por 5 minutos.`;
    }
    _rlSave(s);
    const left = MAX_ATTEMPTS - s.count;
    return left > 0 ? `Credenciales incorrectas. ${left} intento${left !== 1 ? 's' : ''} restante${left !== 1 ? 's' : ''}.` : 'Credenciales incorrectas.';
  }

  function _rlReset() { _rlSave({ count: 0, lockedUntil: 0 }); }

  /* ── Cargar usuarios (sin contraseñas) ───────────────────────
     Usa la función listar_usuarios() de Supabase (SECURITY DEFINER)
     que devuelve usuarios sin el campo usu_password.
  ──────────────────────────────────────────────────────────── */
  const cargarUsuarios = async () => {
    try {
      const { data, error } = await window.db.rpc('listar_usuarios');
      if (error) throw error;

      _users = (data || []).map(r => ({
        id:       r.usu_id,
        nombre:   r.usu_nombre,
        apellido: r.usu_apellido ?? '',
        email:    r.usu_email,
        telefono: r.usu_telefono ?? '',
        usuario:  r.usu_usuario,
        rol:      r.rol ?? 'usuario'
        // 'password' deliberadamente omitido — nunca en el cliente
      }));

      // Guardar en localStorage sin contraseña
      localStorage.setItem(cfg.LS_USERS, JSON.stringify(_users));
    } catch (_e) {
      console.warn('Supabase no disponible, cargando usuarios desde localStorage:', _e);
      try {
        const cached = JSON.parse(localStorage.getItem(cfg.LS_USERS)) ?? [];
        // Sanitizar: eliminar password si quedó de versiones anteriores
        _users = cached.map(u => {
          const { password: _omit, ...rest } = u;
          return rest;
        });
      } catch { _users = []; }
    }
  };

  const leerUsuarios = () => _users;

  /* ── Sesión ──────────────────────────────────────────────── */
  const getSession  = () => { try { return JSON.parse(sessionStorage.getItem(cfg.LS_SESSION)) ?? null; } catch { return null; } };
  const setSession  = data => sessionStorage.setItem(cfg.LS_SESSION, JSON.stringify(data));
  const clearSession = () => sessionStorage.removeItem(cfg.LS_SESSION);

  /* ── Login (async) ───────────────────────────────────────────
     Llama al RPC verificar_login() que:
       1. Corre con SECURITY DEFINER (puede leer usu_password).
       2. Compara usando crypt() de pgcrypto (bcrypt).
       3. Solo devuelve datos si la contraseña es correcta.
     Así la contraseña (ni el hash) nunca sale de la base de datos.
  ──────────────────────────────────────────────────────────── */
  const login = async (usuario, password) => {
    const check = _rlCheck();
    if (check.locked) return { ok: false, msg: check.msg };

    try {
      // Verificar estado antes de intentar login (evita consumir intentos si está inactivo)
      const { data: estado } = await window.db.rpc('verificar_estado_usuario', { p_usuario: usuario });
      if (estado && estado.activo === false) {
        return { ok: false, msg: 'Tu cuenta está desactivada. Contacta al administrador.' };
      }

      const { data, error } = await window.db.rpc('verificar_login', {
        p_usuario:  usuario,
        p_password: password
      });

      if (error || !data || data.length === 0) {
        const msg = _rlFail();
        return { ok: false, msg };
      }

      _rlReset();
      const u = data[0];
      return {
        ok: true,
        user: {
          id:       u.usu_id,
          nombre:   u.usu_nombre,
          apellido: u.usu_apellido ?? '',
          email:    u.usu_email,
          telefono: u.usu_telefono ?? '',
          usuario:  u.usu_usuario,
          rol:      u.rol_nombre ?? 'usuario'
        }
      };
    } catch (e) {
      console.error('login error:', e);
      return { ok: false, msg: 'Error de conexión. Intenta de nuevo.' };
    }
  };

  /* ── Registro (async) ────────────────────────────────────────
     Llama al RPC registrar_usuario() que hashea la contraseña
     server-side con bcrypt antes de guardarla.
  ──────────────────────────────────────────────────────────── */
  const registrar = async (nombre, apellido, email, telefono, direccion, usuario, password, rol) => {
    if (password.length < 4)
      return { ok: false, msg: 'La contraseña debe tener al menos 4 caracteres.' };

    const ROL_IDS = { administrador: 'rol001', cajero: 'rol002', mesero: 'rol003', usuario: 'rol004' };

    try {
      const { data, error } = await window.db.rpc('registrar_usuario', {
        p_usuario:   usuario,
        p_email:     email,
        p_nombre:    nombre,
        p_apellido:  apellido  ?? '',
        p_telefono:  telefono  ?? '',
        p_password:  password,
        p_rol_id:    ROL_IDS[rol] ?? 'rol004',
        p_direccion: direccion ?? ''
      });

      if (error) {
        console.error('registrar RPC error:', error);
        return { ok: false, msg: 'Error al registrar. Intenta de nuevo.' };
      }
      if (!data?.ok) return { ok: false, msg: data?.msg || 'Error al registrar.' };

      const nuevo = { id: data.usu_id, nombre, apellido, email, telefono, direccion, usuario, rol };
      _users.push(nuevo);
      localStorage.setItem(cfg.LS_USERS, JSON.stringify(_users));
      return { ok: true, user: nuevo };
    } catch (e) {
      console.error('registrar exception:', e);
      return { ok: false, msg: 'Sin conexión. Intenta de nuevo.' };
    }
  };

  /* ── Login con Google (OAuth) ────────────────────────────────
     Inicia el flujo OAuth de Google vía Supabase Auth.
     El navegador redirige a Google y vuelve a esta misma página.
     Tras el redirect, handleGoogleCallback() procesa la sesión.
  ──────────────────────────────────────────────────────────── */
  const loginConGoogle = async () => {
    const { error } = await window.db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        scopes: 'email profile'
      }
    });
    if (error) return { ok: false, msg: 'No se pudo conectar con Google. Intenta de nuevo.' };
    return { ok: true }; // el navegador redirige; no llega hasta aquí en flujo normal
  };

  /* ── Procesar callback de Google ─────────────────────────────
     Llamar al inicio de la app. Si Supabase detectó un token de
     Google en la URL, extrae el email, busca/crea el usuario en
     la tabla 'usuarios' y devuelve sus datos.
     Retorna null si no hay sesión OAuth activa.
  ──────────────────────────────────────────────────────────── */
  const handleGoogleCallback = async () => {
    try {
      const { data: { session }, error } = await window.db.auth.getSession();
      if (error || !session) return null;

      const email  = session.user.email;
      const nombre = session.user.user_metadata?.full_name
                  || session.user.user_metadata?.name
                  || session.user.email;

      // Limpiar sesión de Supabase Auth — solo la necesitamos para verificar identidad
      await window.db.auth.signOut();

      const { data, error: rpcErr } = await window.db.rpc('login_con_google', {
        p_email: email,
        p_nombre: nombre
      });

      if (rpcErr || !data || data.length === 0) {
        return { ok: false, msg: 'Error al verificar la cuenta de Google.' };
      }

      const u = data[0];
      if (!u.usu_activo) {
        return { ok: false, msg: 'Tu cuenta está desactivada. Contacta al administrador.' };
      }

      _rlReset();
      return {
        ok: true,
        user: {
          id:       u.usu_id,
          nombre:   u.usu_nombre,
          apellido: u.usu_apellido ?? '',
          email:    u.usu_email,
          usuario:  u.usu_usuario,
          rol:      u.rol_nombre ?? 'usuario'
        }
      };
    } catch (e) {
      console.error('handleGoogleCallback:', e);
      return null;
    }
  };

  return { cargarUsuarios, leerUsuarios, getSession, setSession, clearSession, login, registrar, loginConGoogle, handleGoogleCallback };
})();
