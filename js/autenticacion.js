'use strict';
/**
 * autenticacion.js — Módulo de autenticación y sesión de usuario.
 * Gestiona usuarios en localStorage y la sesión activa en sessionStorage.
 * Requiere window.SC_CONFIG con las claves LS_USERS y LS_SESSION.
 */
window.ModuloAutenticacion = (function () {
  const cfg = window.SC_CONFIG;

  /** Crea los usuarios por defecto (cajero/mesero) si no existen aún. */
  const seedUsers = () => {
    const users        = leerUsuarios();
    const tieneDefaults = users.some(u => u.usuario === 'caja' || u.usuario === 'mesero');
    if (!tieneDefaults) {
      users.push(
        { id: 1, nombre: 'Cajero Principal', usuario: 'caja',   password: '1234', rol: 'cajero' },
        { id: 2, nombre: 'Mesero Demo',       usuario: 'mesero', password: '1234', rol: 'mesero' }
      );
      localStorage.setItem(cfg.LS_USERS, JSON.stringify(users));
    }
  };

  /**
   * Lee todos los usuarios registrados desde localStorage.
   * @returns {Array}
   */
  const leerUsuarios = () => {
    try { return JSON.parse(localStorage.getItem(cfg.LS_USERS)) ?? []; }
    catch (_e) { return []; }
  };

  /**
   * Obtiene la sesión activa desde sessionStorage.
   * @returns {Object|null}
   */
  const getSession = () => {
    try { return JSON.parse(sessionStorage.getItem(cfg.LS_SESSION)) ?? null; }
    catch (_e) { return null; }
  };

  /**
   * Guarda datos de sesión en sessionStorage.
   * @param {Object} data — Objeto con id, nombre, usuario, rol.
   */
  const setSession = data => {
    sessionStorage.setItem(cfg.LS_SESSION, JSON.stringify(data));
  };

  /** Elimina la sesión activa de sessionStorage. */
  const clearSession = () => {
    sessionStorage.removeItem(cfg.LS_SESSION);
  };

  /**
   * Verifica credenciales y devuelve el usuario encontrado o null.
   * @param {string} usuario
   * @param {string} password
   * @returns {Object|null}
   */
  const login = (usuario, password) => {
    const users = leerUsuarios();
    return users.find(u => u.usuario === usuario && u.password === password) ?? null;
  };

  /**
   * Registra un nuevo usuario en localStorage.
   * @param {string} nombre
   * @param {string} apellido
   * @param {string} email
   * @param {string} telefono
   * @param {string} usuario
   * @param {string} password
   * @param {string} rol
   * @returns {{ ok: boolean, msg?: string, user?: Object }}
   */
  const registrar = (nombre, apellido, email, telefono, usuario, password, rol) => {
    const users = leerUsuarios();
    if (users.find(u => u.usuario === usuario))
      return { ok: false, msg: 'Ese nombre de usuario ya existe.' };
    if (users.find(u => u.email === email))
      return { ok: false, msg: 'Ya existe una cuenta con ese correo.' };
    if (password.length < 4)
      return { ok: false, msg: 'La contraseña debe tener al menos 4 caracteres.' };

    const nuevo = { id: Date.now(), nombre, apellido, email, telefono, usuario, password, rol };
    users.push(nuevo);
    localStorage.setItem(cfg.LS_USERS, JSON.stringify(users));
    return { ok: true, user: nuevo };
  };

  return {
    seedUsers,
    leerUsuarios,
    getSession,
    setSession,
    clearSession,
    login,
    registrar
  };
})();
