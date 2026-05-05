'use strict';
/**
 * carrito.js — Módulo IndexedDB para archivar el historial de pedidos cobrados.
 * Complementa el localStorage (usado en el script principal) con una segunda
 * capa de persistencia estructurada en IndexedDB.
 *
 * Base de datos : SalyCanelaPOS  (versión 1)
 * Object store  : historial_idb  (keyPath autoincrement)
 *   Índice       : por_fecha      (campo "fecha", multi-entry false)
 */
window.CarritoIDB = (function () {
  const DB_NAME = 'SalyCanelaPOS';
  const DB_VER  = 1;
  const STORE   = 'historial_idb';
  let   db      = null;

  /**
   * Abre (o crea) la base de datos IndexedDB.
   * @returns {Promise<IDBDatabase>}
   */
  const abrir = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = ({ target }) => {
      const d = target.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const store = d.createObjectStore(STORE, { keyPath: 'idbId', autoIncrement: true });
        store.createIndex('por_fecha', 'fecha', { unique: false });
      }
    };

    req.onsuccess  = ({ target }) => { db = target.result; resolve(db); };
    req.onerror    = () => {
      console.warn('[CarritoIDB] No se pudo abrir IndexedDB:', req.error);
      reject(req.error);
    };
  });

  /**
   * Guarda un pedido cobrado en IndexedDB.
   * @param {Object} pedido — Objeto con los datos del pedido.
   * @returns {Promise<void>}
   */
  const guardar = pedido => {
    if (!db) return Promise.resolve();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).add({ ...pedido, archivedAt: new Date().toISOString() });
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  };

  /**
   * Lee todos los pedidos archivados en IndexedDB.
   * @returns {Promise<Array>}
   */
  const leerTodos = () => {
    if (!db) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  };

  /**
   * Lee los pedidos de una fecha concreta (formato dd/mm/yyyy).
   * @param {string} fecha
   * @returns {Promise<Array>}
   */
  const leerPorFecha = fecha => {
    if (!db) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE, 'readonly');
      const index = tx.objectStore(STORE).index('por_fecha');
      const req   = index.getAll(fecha);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  };

  return { abrir, guardar, leerTodos, leerPorFecha };
})();
