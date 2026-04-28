'use strict';
/**
 * cart.js — Módulo IndexedDB para archivar el historial de pedidos cobrados.
 * Complementa el localStorage (usado en el script principal) con una segunda
 * capa de persistencia estructurada en IndexedDB.
 *
 * Base de datos : SalyCanelaPOS  (versión 1)
 * Object store  : historial_idb  (keyPath autoincrement)
 *   Índice       : por_fecha      (campo "fecha", multi-entry false)
 */
window.CartIDB = (function () {
  var DB_NAME  = 'SalyCanelaPOS';
  var DB_VER   = 1;
  var STORE    = 'historial_idb';
  var db       = null;

  /**
   * Abre (o crea) la base de datos IndexedDB.
   * @returns {Promise<IDBDatabase>}
   */
  function abrir() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);

      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          var store = d.createObjectStore(STORE, { keyPath: 'idbId', autoIncrement: true });
          store.createIndex('por_fecha', 'fecha', { unique: false });
        }
      };

      req.onsuccess = function (e) {
        db = e.target.result;
        resolve(db);
      };

      req.onerror = function () {
        console.warn('[CartIDB] No se pudo abrir IndexedDB:', req.error);
        reject(req.error);
      };
    });
  }

  /**
   * Guarda un pedido cobrado en IndexedDB.
   * @param {Object} pedido — Objeto con los datos del pedido.
   * @returns {Promise<void>}
   */
  function guardar(pedido) {
    if (!db) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).add(Object.assign({}, pedido, {
          archivedAt: new Date().toISOString()
        }));
        tx.oncomplete = resolve;
        tx.onerror    = function () { reject(tx.error); };
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Lee todos los pedidos archivados en IndexedDB.
   * @returns {Promise<Array>}
   */
  function leerTodos() {
    if (!db) return Promise.resolve([]);
    return new Promise(function (resolve, reject) {
      var tx  = db.transaction(STORE, 'readonly');
      var req = tx.objectStore(STORE).getAll();
      req.onsuccess = function () { resolve(req.result); };
      req.onerror   = function () { reject(req.error); };
    });
  }

  /**
   * Lee los pedidos de una fecha concreta (formato dd/mm/yyyy).
   * @param {string} fecha
   * @returns {Promise<Array>}
   */
  function leerPorFecha(fecha) {
    if (!db) return Promise.resolve([]);
    return new Promise(function (resolve, reject) {
      var tx    = db.transaction(STORE, 'readonly');
      var index = tx.objectStore(STORE).index('por_fecha');
      var req   = index.getAll(fecha);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror   = function () { reject(req.error); };
    });
  }

  return {
    abrir       : abrir,
    guardar     : guardar,
    leerTodos   : leerTodos,
    leerPorFecha: leerPorFecha
  };
})();
