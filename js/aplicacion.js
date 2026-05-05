'use strict';
/**
 * aplicacion.js — Módulo coordinador de la aplicación.
 *
 * Responsabilidades:
 *  - Cookies : registrar primera visita y última visita del usuario.
 *  - sessionStorage : guardar el filtro de categoría activo en la sesión actual.
 *  - Coordinar la inicialización de ModuloRepositorio, CarritoIDB y ModuloVista.
 *
 * Mecanismos de almacenamiento que gestiona este módulo:
 *   Cookies        → sc_primer_visita, sc_ultima_visita
 *   sessionStorage → sc_sesion_inicio, sc_filtro_activo
 *   (localStorage e IndexedDB son gestionados por el script principal y CarritoIDB)
 */
window.ModuloApp = (function () {

  /* ════════════════════════════
     COOKIES
  ════════════════════════════ */

  /**
   * Establece una cookie.
   * @param {string} name  — Nombre de la cookie.
   * @param {string} value — Valor de la cookie.
   * @param {number} days  — Días hasta la expiración.
   */
  const setCookie = (name, value, days) => {
    const exp = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)};expires=${exp};path=/;SameSite=Lax`;
  };

  /**
   * Lee una cookie por nombre.
   * @param {string} name — Nombre de la cookie.
   * @returns {string|null} Valor de la cookie o null si no existe.
   */
  const getCookie = name => {
    const enc   = encodeURIComponent(name);
    const match = document.cookie.match(new RegExp(`(?:^|; )${enc}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  };

  /* ════════════════════════════
     REGISTRO DE VISITA
  ════════════════════════════ */

  /**
   * Registra la visita del usuario:
   *  - Cookie 'sc_primer_visita' : solo se escribe la primera vez (365 días).
   *  - Cookie 'sc_ultima_visita' : se actualiza en cada visita (30 días).
   *  - sessionStorage 'sc_sesion_inicio' : marca el inicio de la sesión del navegador.
   */
  const registrarVisita = () => {
    const ahora = new Date().toISOString();

    if (!getCookie('sc_primer_visita')) {
      setCookie('sc_primer_visita', ahora, 365);
    }
    setCookie('sc_ultima_visita', ahora, 30);

    try {
      if (!sessionStorage.getItem('sc_sesion_inicio')) {
        sessionStorage.setItem('sc_sesion_inicio', ahora);
      }
    } catch (_e) { /* sessionStorage no disponible */ }
  };

  /* ════════════════════════════
     FILTRO DE SESIÓN
  ════════════════════════════ */

  /**
   * Guarda en sessionStorage el filtro de categoría activo.
   * @param {string} cat — Nombre de la categoría seleccionada.
   */
  const guardarFiltroSesion = cat => {
    try {
      sessionStorage.setItem('sc_filtro_activo', cat);
    } catch (_e) { /* sessionStorage no disponible */ }
  };

  /**
   * Recupera el filtro de categoría guardado en esta sesión.
   * @returns {string} Categoría guardada o 'Destacados' por defecto.
   */
  const getFiltroSesion = () => {
    try {
      return sessionStorage.getItem('sc_filtro_activo') || 'Destacados';
    } catch (_e) {
      return 'Destacados';
    }
  };

  /* ════════════════════════════
     API PÚBLICA
  ════════════════════════════ */
  return {
    setCookie,
    getCookie,
    registrarVisita,
    guardarFiltroSesion,
    getFiltroSesion
  };
})();
