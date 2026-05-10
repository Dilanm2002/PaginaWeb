'use strict';
/**
 * autenticacion.js — Módulo de autenticación y sesión de usuario.
 * Gestiona usuarios en Supabase (con fallback a localStorage).
 * Requiere window.SC_CONFIG y window.db (cliente Supabase).
 */
window.ModuloAutenticacion = (function () {
  const cfg = window.SC_CONFIG;

  /* ── Cache local de usuarios (se llena al iniciar) ── */
  let _users = [];

  /** Carga usuarios desde Supabase (o localStorage como fallback). */
  const cargarUsuarios = async () => {
    try {
      const { data, error } = await window.db.from('usuarios').select('data');
      if (error) throw error;
      _users = (data || []).map(r => r.data);

      /* Fusionar usuarios de localStorage que no llegaron a Supabase (insert fallido) */
      try {
        const local = JSON.parse(localStorage.getItem(cfg.LS_USERS)) ?? [];
        for (const lu of local) {
          if (!lu.usuario) continue;
          if (!_users.some(u => u.usuario === lu.usuario)) {
            _users.push(lu);
            /* Re-intentar upsert en Supabase */
            window.db.from('usuarios')
              .upsert({ id: lu.id, data: lu, usuario: lu.usuario, email: lu.email || '' })
              .catch(() => {});
          }
        }
      } catch (_le) { /* localStorage no disponible */ }

      /* Asegurar que existan cajero/mesero/admin en Supabase */
      await seedUsers();
      /* Sincronizar localStorage con el estado final */
      localStorage.setItem(cfg.LS_USERS, JSON.stringify(_users));
    } catch (_e) {
      _users = (() => { try { return JSON.parse(localStorage.getItem(cfg.LS_USERS)) ?? []; } catch { return []; } })();
      seedUsersLocal();
    }
  };

  const seedUsersLocal = () => {
    const defaults = [
      { id: 1, nombre: 'Cajero Principal', usuario: 'caja',   password: '1234', rol: 'cajero' },
      { id: 2, nombre: 'Mesero',           usuario: 'mesero', password: '1234', rol: 'mesero' },
      { id: 3, nombre: 'Administrador',    usuario: 'admin',  password: '1234', rol: 'administrador' }
    ];
    let changed = false;
    defaults.forEach(u => {
      if (!_users.some(x => x.usuario === u.usuario)) { _users.push(u); changed = true; }
    });
    if (changed) localStorage.setItem(cfg.LS_USERS, JSON.stringify(_users));
  };

  const seedUsers = async () => {
    const defaults = [
      { id: 1, nombre: 'Cajero Principal', usuario: 'caja',   password: '1234', rol: 'cajero',        email: 'caja@salycanela.ec',   telefono: '' },
      { id: 2, nombre: 'Mesero',           usuario: 'mesero', password: '1234', rol: 'mesero',        email: 'mesero@salycanela.ec', telefono: '' },
      { id: 3, nombre: 'Administrador',    usuario: 'admin',  password: '1234', rol: 'administrador', email: 'admin@salycanela.ec',  telefono: '' }
    ];
    for (const u of defaults) {
      if (!_users.some(x => x.usuario === u.usuario)) {
        await window.db.from('usuarios').upsert({ id: u.id, data: u, usuario: u.usuario, email: u.email });
        _users.push(u);
      }
    }
  };

  const leerUsuarios = () => _users;

  const getSession = () => {
    try { return JSON.parse(sessionStorage.getItem(cfg.LS_SESSION)) ?? null; }
    catch (_e) { return null; }
  };

  const setSession = data => {
    sessionStorage.setItem(cfg.LS_SESSION, JSON.stringify(data));
  };

  const clearSession = () => {
    sessionStorage.removeItem(cfg.LS_SESSION);
  };

  const login = (usuario, password) => {
    return _users.find(u => u.usuario === usuario && u.password === password) ?? null;
  };

  const registrar = (nombre, apellido, email, telefono, usuario, password, rol) => {
    if (_users.find(u => u.usuario === usuario))
      return { ok: false, msg: 'Ese nombre de usuario ya existe.' };
    if (_users.find(u => u.email === email))
      return { ok: false, msg: 'Ya existe una cuenta con ese correo.' };
    if (password.length < 4)
      return { ok: false, msg: 'La contraseña debe tener al menos 4 caracteres.' };

    const id    = Math.max(0, ..._users.map(u => Number(u.id) || 0)) + 1;
    const nuevo = { id, nombre, apellido, email, telefono, usuario, password, rol };
    _users.push(nuevo);

    /* Guardar en Supabase (fire-and-forget) */
    window.db.from('usuarios')
      .upsert({ id: nuevo.id, data: nuevo, usuario: nuevo.usuario, email: nuevo.email })
      .then(({ error }) => { if (error) console.error('Supabase registrar:', error); });

    /* Fallback localStorage */
    localStorage.setItem(cfg.LS_USERS, JSON.stringify(_users));

    return { ok: true, user: nuevo };
  };

  return {
    cargarUsuarios,
    leerUsuarios,
    getSession,
    setSession,
    clearSession,
    login,
    registrar
  };
})();
