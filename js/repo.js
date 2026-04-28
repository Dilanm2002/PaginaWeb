'use strict';
/**
 * repo.js — Módulo de acceso a datos de productos.
 * Intenta cargar desde data/productos.json (HTTP).
 * Si falla (file://, red caída) usa la variable global PRODUCTOS definida en index.html.
 */
window.RepoModule = (function () {
  let _items = [];

  /**
   * Carga los productos desde el archivo JSON.
   * @returns {Promise<Array>} Lista de productos.
   */
  async function cargar() {
    try {
      const res = await fetch('data/productos.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      _items = await res.json();
    } catch (_e) {
      /* Fallback: usa el array inline definido en el script principal */
      _items = (typeof window.PRODUCTOS !== 'undefined') ? window.PRODUCTOS : [];
    }
    return _items;
  }

  /** Devuelve todos los productos cargados. */
  function todos() { return _items; }

  /** Devuelve solo los productos con destacado === true. */
  function destacados() { return _items.filter(function (p) { return p.destacado; }); }

  /** Devuelve productos de una categoría específica. */
  function porCategoria(cat) { return _items.filter(function (p) { return p.categoria === cat; }); }

  /**
   * Busca productos por nombre o categoría (con normalización de acentos).
   * @param {string} q — Término de búsqueda.
   */
  function buscar(q) {
    var norm = function (s) {
      return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    };
    var nq = norm(q);
    return _items.filter(function (p) {
      return norm(p.nombre).includes(nq) || norm(p.categoria).includes(nq);
    });
  }

  return { cargar: cargar, todos: todos, destacados: destacados, porCategoria: porCategoria, buscar: buscar };
})();
