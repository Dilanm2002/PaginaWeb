'use strict';
/**
 * repositorio.js — Módulo de acceso a datos de productos.
 * Intenta cargar desde data/productos.json (HTTP).
 * Si falla (file://, red caída) usa la variable global PRODUCTOS definida en index.html.
 */
window.ModuloRepositorio = (function () {
  let _items = [];

  /**
   * Carga los productos desde el archivo JSON.
   * @returns {Promise<Array>} Lista de productos.
   */
  const cargar = async () => {
    try {
      const res = await fetch('data/productos.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      _items = await res.json();
    } catch (_e) {
      /* Fallback: usa el array inline definido en el script principal */
      _items = window.PRODUCTOS ?? [];
    }
    return _items;
  };

  /** Devuelve todos los productos cargados. */
  const todos = () => _items;

  /** Devuelve solo los productos con destacado === true. */
  const destacados = () => _items.filter(p => p.destacado);

  /** Devuelve productos de una categoría específica. */
  const porCategoria = cat => _items.filter(p => p.categoria === cat);

  /**
   * Busca productos por nombre o categoría (con normalización de acentos).
   * @param {string} q — Término de búsqueda.
   */
  const buscar = q => {
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const nq   = norm(q);
    return _items.filter(p => norm(p.nombre).includes(nq) || norm(p.categoria).includes(nq));
  };

  return { cargar, todos, destacados, porCategoria, buscar };
})();
