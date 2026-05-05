'use strict';
/**
 * logica-carrito.js — Módulo de lógica del carrito de compras.
 * Persiste el carrito en localStorage y expone operaciones CRUD.
 * Requiere window.SC_CONFIG con las claves LS_CARRITO, LS_UPDATED e IVA.
 */
window.LogicaCarrito = (function () {
  const cfg = window.SC_CONFIG;

  /**
   * Lee el carrito actual desde localStorage.
   * @returns {Array}
   */
  const leerCarrito = () => {
    try { return JSON.parse(localStorage.getItem(cfg.LS_CARRITO)) ?? []; }
    catch (_e) { return []; }
  };

  /**
   * Guarda el carrito en localStorage y registra el timestamp de cambio.
   * @param {Array} items
   */
  const guardarCarrito = items => {
    localStorage.setItem(cfg.LS_CARRITO, JSON.stringify(items));
    localStorage.setItem(cfg.LS_UPDATED, new Date().toISOString());
  };

  /**
   * Agrega un producto al carrito. Si ya existe, incrementa su cantidad.
   * @param {Object} producto — Debe tener id, nombre, precio, imagen.
   * @returns {Array} Carrito actualizado.
   */
  const agregarItem = producto => {
    const items = leerCarrito();
    const idx   = items.findIndex(i => i.id === producto.id);
    if (idx >= 0) {
      items[idx].cantidad += 1;
    } else {
      const { id, nombre, precio, imagen } = producto;
      items.push({ id, nombre, precio, imagen, cantidad: 1 });
    }
    guardarCarrito(items);
    return items;
  };

  /**
   * Elimina un ítem del carrito por id.
   * @param {number} id
   * @returns {Array} Carrito actualizado.
   */
  const eliminarItem = id => {
    const items = leerCarrito().filter(i => i.id !== id);
    guardarCarrito(items);
    return items;
  };

  /**
   * Cambia la cantidad de un ítem. Si cantidad <= 0, lo elimina.
   * @param {number} id
   * @param {number} cantidad
   * @returns {Array} Carrito actualizado.
   */
  const cambiarCantidad = (id, cantidad) => {
    if (cantidad <= 0) return eliminarItem(id);
    const items = leerCarrito();
    const idx   = items.findIndex(i => i.id === id);
    if (idx >= 0) items[idx].cantidad = cantidad;
    guardarCarrito(items);
    return items;
  };

  /**
   * Vacía el carrito.
   * @returns {Array} Array vacío.
   */
  const vaciarCarrito = () => {
    guardarCarrito([]);
    return [];
  };

  /**
   * Calcula subtotal, IVA desglosado y total de una lista de ítems.
   * Los precios ya incluyen IVA — se extrae de forma inversa.
   * @param {Array} items
   * @returns {{ subtotal: number, iva: number, total: number, nItems: number }}
   */
  const calcularTotales = items => {
    const total    = items.reduce((s, { precio, cantidad }) => s + precio * cantidad, 0);
    const iva      = total * (cfg.IVA / (1 + cfg.IVA));
    const subtotal = total - iva;
    const nItems   = items.reduce((s, { cantidad }) => s + cantidad, 0);
    return { subtotal, iva, total, nItems };
  };

  return {
    leerCarrito,
    guardarCarrito,
    agregarItem,
    eliminarItem,
    cambiarCantidad,
    vaciarCarrito,
    calcularTotales
  };
})();
