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
   * Clave que identifica una combinación de exclusiones, sin importar si
   * cada una viene como string ("Arroz") u objeto ({id, nombre}) — ambas
   * formas conviven en el código según de dónde vengan los datos.
   */
  const _exclKey = (exclusiones = []) =>
    [...exclusiones]
      .map(e => (typeof e === 'string' ? e : (e?.id ?? e?.nombre ?? '')))
      .sort()
      .join('|');

  /**
   * Clave de una combinación de opciones elegidas (grupos "elige 1 de N",
   * ej. bebida del desayuno) — mismo patrón que _exclKey, para que el
   * orden en que vengan no afecte la comparación.
   */
  const _opcionesKey = (opcionesElegidas = []) =>
    [...opcionesElegidas]
      .map(o => o?.opcionId ?? o?.opcionNombre ?? '')
      .sort()
      .join('|');

  /**
   * Clave completa de una línea: exclusiones + si es "para llevar" + qué
   * opciones se eligieron — un mismo plato puede pedirse una vez para la
   * mesa y otra para llevar (o con distinta bebida elegida) en el mismo
   * pedido, así que deben quedar en líneas separadas, no mezclarse.
   */
  const _lineKey = (exclusiones = [], paraLlevar = false, opcionesElegidas = []) =>
    _exclKey(exclusiones) + (paraLlevar ? '::llevar' : '') +
    (opcionesElegidas.length ? '::op:' + _opcionesKey(opcionesElegidas) : '');

  // Regla de negocio fija: un almuerzo (sopa + segundo) vale menos si el
  // cliente pide solo el segundo, sin la sopa. No es configurable por
  // producto — aplica automáticamente a cualquier plato de categoría
  // "Almuerzos" cuando se excluye un ingrediente cuyo nombre contenga
  // "sopa" (sin importar mayúsculas/acentos, ej. "Sopa del día").
  const _DESCUENTO_SOPA_ALMUERZO = 0.50;
  const _esSopa = nombre => /sopa/i.test(
    (nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  );

  /**
   * Precio final de un producto según las exclusiones elegidas.
   * @param {Object} producto — debe tener .precio y .categoria.
   * @param {Array} exclusiones — ingredientes excluidos ({id, nombre} o string).
   * @returns {number} Precio ajustado (nunca negativo), redondeado a 2 decimales.
   */
  const calcularPrecioConExclusiones = (producto, exclusiones = []) => {
    const esAlmuerzo = producto?.categoria === 'Almuerzos';
    const descuento = (exclusiones || []).reduce((suma, excl) => {
      const nombre = typeof excl === 'string' ? excl : excl?.nombre;
      return suma + (esAlmuerzo && _esSopa(nombre) ? _DESCUENTO_SOPA_ALMUERZO : 0);
    }, 0);
    return Math.max(0, Math.round((producto.precio - descuento) * 100) / 100);
  };

  /**
   * Agrega un producto al carrito. Si ya existe una línea con el mismo id
   * Y las mismas exclusiones, incrementa su cantidad; si las exclusiones
   * difieren (p.ej. mismo plato, una vez normal y otra "sin arroz"), crea
   * una línea nueva — de lo contrario se perdía o mezclaba esa información.
   * @param {Object} producto — Debe tener id, nombre, precio, imagen.
   * @returns {Array} Carrito actualizado.
   */
  const agregarItem = (producto, exclusiones = [], paraLlevar = false, opcionesElegidas = []) => {
    const items = leerCarrito();
    const key   = _lineKey(exclusiones, paraLlevar, opcionesElegidas);
    const idx   = items.findIndex(i => i.id === producto.id && _lineKey(i.exclusiones, i.paraLlevar, i.opcionesElegidas) === key);
    if (idx >= 0) {
      items[idx].cantidad += 1;
    } else {
      const { id, nombre, imagen } = producto;
      const precio = calcularPrecioConExclusiones(producto, exclusiones);
      const lineId = id + (key ? '::' + key : '');
      items.push({ id, nombre, precio, imagen, cantidad: 1, exclusiones, paraLlevar, opcionesElegidas, lineId });
    }
    guardarCarrito(items);
    return items;
  };

  /**
   * Marca/desmarca una línea del carrito como "para llevar" — así se puede
   * mezclar, en un mismo pedido de mesa, parte para servirse y parte para
   * empacar por separado.
   * @param {string} lineId
   * @param {boolean} paraLlevar
   * @returns {Array} Carrito actualizado.
   */
  const cambiarParaLlevar = (lineId, paraLlevar) => {
    const items = leerCarrito();
    const idx   = items.findIndex(i => (i.lineId || i.id) === lineId);
    if (idx >= 0) {
      items[idx].paraLlevar = paraLlevar;
      const key = _lineKey(items[idx].exclusiones, paraLlevar, items[idx].opcionesElegidas);
      items[idx].lineId = items[idx].id + (key ? '::' + key : '');
    }
    guardarCarrito(items);
    return items;
  };

  /**
   * Elimina un ítem del carrito por su lineId (o id, para carritos previos
   * a que existiera lineId).
   * @param {string} lineId
   * @returns {Array} Carrito actualizado.
   */
  const eliminarItem = lineId => {
    const items = leerCarrito().filter(i => (i.lineId || i.id) !== lineId);
    guardarCarrito(items);
    return items;
  };

  /**
   * Cambia la cantidad de un ítem. Si cantidad <= 0, lo elimina.
   * @param {string} lineId
   * @param {number} cantidad
   * @returns {Array} Carrito actualizado.
   */
  const cambiarCantidad = (lineId, cantidad) => {
    if (cantidad <= 0) return eliminarItem(lineId);
    const items = leerCarrito();
    const idx   = items.findIndex(i => (i.lineId || i.id) === lineId);
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
    cambiarParaLlevar,
    vaciarCarrito,
    calcularTotales,
    calcularPrecioConExclusiones
  };
})();
