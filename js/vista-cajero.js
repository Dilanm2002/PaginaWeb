'use strict';
/**
 * vista-cajero.js — Vista del panel de caja.
 * Depende de window.SC (API compartida) y DOM de cajero-view.
 */
window.VistaCajero = (function () {

  const MAX_STOCK = 20;
  let _diaOffset = 0;
  let _pedidoParaCobrar = null;
  let _pedidoParaDividir = null;
  // Cuando el modal de pago se abre justo después de "Dividir cuenta"
  // (para cobrar la porción dividida de una), estos dos rastrean ese
  // contexto para poder deshacer la división si el cajero cancela el
  // cobro en vez de completarlo — ver cerrarModalPago().
  let _divisionPendiente = null;  // { nuevoPedId, padreId }
  let _cobroFueIntentado = false; // true apenas se llama a SC.cobrarPedido
  let _ultimoCobro = null; // { pedido, factNumero, metodoPagoNombre, montoPagado, cambio }
  let _correoNotaCtx = null; // { pedido, factNumero, metodoPagoNombre, fechaCobro }

  // Mismo helper que usa vista-menu.js — el color de categoría se aplica
  // como variable CSS inline (--cat-c), no por nombre fijo en el CSS.
  const _colorEstilo = cat => {
    const color = window.SC?.getCategoriasColores?.()[cat];
    return color ? ` style="--cat-c:${color}"` : '';
  };

  // "Agua Aromática" a secas no dice a qué grupo pertenece cuando el plato
  // tiene varios (bebida, huevos, ...) — se antepone el nombre del grupo
  // para que quede claro qué se eligió en cada uno.
  const _fmtOpcionesElegidas = (opcionesElegidas = []) =>
    opcionesElegidas.map(o => o.grupoNombre ? `${o.grupoNombre}: ${o.opcionNombre}` : o.opcionNombre).join(', ');

  const METODO_NOMBRE = {
    met001: 'Efectivo',
    met002: 'Tarjeta de crédito',
    met003: 'Tarjeta de débito',
    met004: 'Transferencia'
  };

  // Descripción completa del método, con desglose si fue pago mixto —
  // única fuente de verdad para recibos/notas/tablas, en vez de confiar en
  // que el string ya venga formateado desde donde se llamó.
  function _fmtMetodoPago(pedido, fallback) {
    if (pedido?.pagos?.length > 1) {
      // Neto (recibido − cambio) — la pierna en efectivo puede traer
      // cambio, la transferencia no.
      return 'Mixto (' + pedido.pagos.map(p => `${p.metodoNombre} $${(p.monto - (p.cambio || 0)).toFixed(2)}`).join(' + ') + ')';
    }
    return fallback || 'Efectivo';
  }

  function _getFecha(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('es-EC', { year:'numeric', month:'2-digit', day:'2-digit' });
  }

  // Formato ISO (YYYY-MM-DD) — el que necesita la columna DATE en Supabase,
  // distinto del formato local (_getFecha) que se usa para comparar contra
  // el historial en memoria.
  function _fechaISOHoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Fondo inicial guardado a mano para hoy — el cajero lo fija una vez al
  // abrir y no debería tener que volver a escribirlo cada vez que la
  // página se recarga durante el día (el cierre real, con lo contado, se
  // guarda solo hasta "Cerrar caja" al final del día).
  const LS_FONDO_INICIAL = 'sc_fondo_inicial_hoy';
  function _leerFondoGuardado() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_FONDO_INICIAL));
      return raw && raw.fecha === _fechaISOHoy() && Number.isFinite(raw.monto) ? raw.monto : null;
    } catch { return null; }
  }
  function _guardarFondoGuardado(monto) {
    try { localStorage.setItem(LS_FONDO_INICIAL, JSON.stringify({ fecha: _fechaISOHoy(), monto })); } catch (_) {}
  }

  function _getLabelFecha(offset) {
    if (offset === 0)  return 'Hoy';
    if (offset === -1) return 'Ayer';
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('es-EC', { weekday:'short', day:'2-digit', month:'short' });
  }

  function renderResumenDia() {
    const SC = window.SC;
    const fecha = _getFecha(_diaOffset);
    const historial = SC.leerHistorial().filter(h => h.fecha === fecha);

    const labelEl = document.getElementById('resumen-fecha-label');
    const btnSig  = document.getElementById('btn-dia-sig');
    if (labelEl) labelEl.textContent = _getLabelFecha(_diaOffset);
    if (btnSig)  btnSig.disabled = _diaOffset >= 0;
    const kpisEl  = document.getElementById('resumen-kpis');
    const tablaEl = document.getElementById('resumen-tabla-wrap');
    if (!kpisEl || !tablaEl) return;

    const totalVentas    = historial.reduce((s,h) => s + h.total, 0);
    const numPedidos     = historial.length;

    kpisEl.innerHTML = `
      <div class="resumen-kpi">
        <div class="resumen-kpi__val">${numPedidos}</div>
        <div class="resumen-kpi__lbl">Pedidos cobrados</div>
      </div>
      <div class="resumen-kpi">
        <div class="resumen-kpi__val">$${totalVentas.toFixed(2)}</div>
        <div class="resumen-kpi__lbl">Total vendido</div>
      </div>`;

    const filas = [...historial].reverse();
    tablaEl.innerHTML = `
      <table class="resumen-tabla">
        <thead>
          <tr>
            <th>Mesa</th><th>Cliente</th><th>Ítems</th><th>Fecha</th><th>Hora</th>
            <th style="text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${!filas.length ? `<tr><td colspan="6" class="resumen-empty" style="text-align:center;padding:.9rem 0">No hay pedidos cobrados este día.</td></tr>` : filas.map(h => `
            <tr>
              <td><strong>${h.paraLlevar || h.mesa === 'Para llevar' ? '🛍 Para llevar' : `Mesa ${h.mesa}`}</strong></td>
              <td>${SC.escapeHtml(h.clienteNombre || h.nombreUsuario)}</td>
              <td>${Array.isArray(h.items) ? h.items.map(i => `${i.cantidad}× ${SC.escapeHtml(i.nombre)}`).join('<br>') : '—'}</td>
              <td class="td-hora">${h.fecha}</td>
              <td class="td-hora">${new Date(h.cobradoEn).toLocaleTimeString('es-EC', {hour:'2-digit', minute:'2-digit'})}</td>
              <td class="td-total">$${h.total.toFixed(2)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="resumen-cards">
        ${filas.map(h => `
          <div class="resumen-card">
            <div class="resumen-card__head">
              <span class="resumen-card__mesa">${h.paraLlevar || h.mesa === 'Para llevar' ? '🛍 Para llevar' : `Mesa ${h.mesa}`}</span>
              <span class="resumen-card__total">$${h.total.toFixed(2)}</span>
            </div>
            <div class="resumen-card__body">
              <div class="resumen-card__cliente">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--cinnamon);color:#fff;font-size:.65rem;font-weight:800;flex-shrink:0">${(h.clienteNombre || h.nombreUsuario || '?').charAt(0).toUpperCase()}</span>
                ${SC.escapeHtml(h.clienteNombre || h.nombreUsuario)}
              </div>
              <div class="resumen-card__items">
                ${Array.isArray(h.items) ? h.items.map(i => {
                  const { individual, resto } = LogicaCarrito.formatoExclusiones(i.exclusiones);
                  return `
                  <div class="resumen-card__item-row">
                    <span class="resumen-card__item-qty">${i.cantidad}×</span>
                    <span>${i.nombre}${individual ? '<span class="tag-individual">Individual</span>' : ''}${resto.length ? `<span class="cajero-excl">sin: ${resto.join(', ')}</span>` : ''}</span>
                  </div>`;
                }).join('') : ''}
              </div>
              <div class="resumen-card__hora">${new Date(h.cobradoEn).toLocaleTimeString('es-EC', {hour:'2-digit', minute:'2-digit'})}</div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  function _initGastosDiaNav() {
    const ant = document.getElementById('gastos-dia-ant');
    const sig = document.getElementById('gastos-dia-sig');
    if (ant && !ant._bound) {
      ant._bound = true;
      ant.addEventListener('click', () => { _diaOffset--; renderGastos(); });
    }
    if (sig && !sig._bound) {
      sig._bound = true;
      sig.addEventListener('click', () => {
        if (_diaOffset < 0) { _diaOffset++; renderGastos(); }
      });
    }
  }

  function renderGastos() {
    const SC = window.SC;
    // El cuadro de Cierre de caja calcula "Efectivo esperado" a partir de
    // los gastos en efectivo del día — si no se refresca aquí también, se
    // queda mostrando el monto viejo cada vez que se agrega/edita/borra
    // un gasto (local o por tiempo real desde otro dispositivo), aunque
    // los gastos en sí ya se hayan actualizado. No hace nada si el cuadro
    // no está en esta pantalla (_renderCierreCajaBox ya se protege sola).
    _renderCierreCajaBox();
    _initGastosDiaNav();
    const fecha  = _getFecha(_diaOffset);
    const gastos = SC.leerGastos().filter(g => g.fecha === fecha);

    const diaLabelEl = document.getElementById('gastos-dia-label');
    const diaSigBtn  = document.getElementById('gastos-dia-sig');
    if (diaLabelEl) diaLabelEl.textContent = _getLabelFecha(_diaOffset);
    if (diaSigBtn)  diaSigBtn.disabled = _diaOffset >= 0;

    const formEl    = document.querySelector('.gastos-nueva-fila');
    const catFormEl = document.getElementById('gastos-nueva-cat-fila');
    if (formEl) formEl.style.display = _diaOffset !== 0 ? 'none' : '';
    if (_diaOffset !== 0 && catFormEl) catFormEl.style.display = 'none';

    const listaEl = document.getElementById('gastos-lista');
    if (!listaEl) return;

    const gastosRev = [...gastos].reverse();
    listaEl.innerHTML = !gastosRev.length
      ? `<div class="gastos-empty">
          <div class="gastos-empty__icon">🧾</div>
          <div class="gastos-empty__titulo">Sin gastos registrados</div>
          <div class="gastos-empty__msg">Todavía no se ha registrado ningún gasto este día.</div>
        </div>`
      : `
      <table class="gastos-tabla">
        <thead>
          <tr>
            <th>Descripción</th><th>Categoría</th><th>Fecha</th><th>Hora</th>
            <th style="text-align:right">Monto</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${gastosRev.map(g => `
            <tr>
              <td class="td-desc">${SC.escapeHtml(g.descripcion)}${g.metodoPago === 'transferencia' ? '<span class="gasto-tag-externo" title="Este gasto se pagó por transferencia">🔄 Transferencia</span>' : g.metodoPago === 'externo' ? '<span class="gasto-tag-externo" title="Este gasto NO salió del dinero del negocio">💳 Externo</span>' : ''}</td>
              <td class="td-hora">${g.categoria ? SC.escapeHtml(g.categoria) : '<span style="color:var(--text-muted)">—</span>'}</td>
              <td class="td-hora">${g.fecha}</td>
              <td class="td-hora">${g.hora}</td>
              <td class="td-monto">−$${g.monto.toFixed(2)}</td>
              <td class="td-del">${_diaOffset === 0
                ? `<button class="gasto-del-btn" data-del-id="${g.id}">🗑️ Eliminar</button>`
                : '<span class="gasto-registrado" title="Los gastos de días anteriores ya quedaron en el registro y no se pueden borrar">🔒 Registrado</span>'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    listaEl.querySelectorAll('.gasto-del-btn').forEach(btn => {
      btn.onclick = async () => {
        const g = gastos.find(x => String(x.id) === String(btn.dataset.delId));
        if (!g) return;
        const ok = await _confirmarEliminarGasto(g);
        if (!ok) return;
        await SC.eliminarGasto(g.id);
        renderGastos();
      };
    });
  }

  // Mismo look & feel que "¿Eliminar producto?" en vista-admin.js — overlay
  // efímero creado/destruido al vuelo, sin depender de z-index estáticos.
  function _confirmarEliminarGasto(gasto) {
    return new Promise(resolve => {
      const SC = window.SC;
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:2rem 1.75rem 1.5rem;max-width:360px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.3);text-align:center;animation:fadeUp .18s ease;">
          <div style="font-size:2.5rem;line-height:1;margin-bottom:.75rem;">🗑️</div>
          <h3 style="font-size:1.1rem;font-weight:700;color:#3B1A08;margin-bottom:.4rem;">¿Eliminar gasto?</h3>
          <p style="color:#7A5640;font-size:.88rem;margin-bottom:1.5rem;line-height:1.5;">
            Se eliminará permanentemente<br><strong style="color:#C8561A;">"${SC.escapeHtml(gasto.descripcion)}"</strong> de <strong style="color:#C8561A;">$${gasto.monto.toFixed(2)}</strong>.<br>Esta acción no se puede deshacer.
          </p>
          <div style="display:flex;gap:.75rem;justify-content:center;">
            <button id="_conf-cancel" style="flex:1;padding:.65rem 1rem;border:1.5px solid #E0C9B0;border-radius:10px;background:#fff;color:#7A5640;cursor:pointer;font-size:.88rem;font-weight:600;transition:all .15s;">Cancelar</button>
            <button id="_conf-ok" style="flex:1;padding:.65rem 1rem;border:none;border-radius:10px;background:#dc2626;color:#fff;cursor:pointer;font-size:.88rem;font-weight:700;transition:all .15s;">Sí, eliminar</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const cleanup = val => { document.body.removeChild(overlay); resolve(val); };
      overlay.querySelector('#_conf-ok').addEventListener('click', () => cleanup(true));
      overlay.querySelector('#_conf-cancel').addEventListener('click', () => cleanup(false));
      overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', esc); cleanup(false); }
      });
    });
  }

  // Confirmar anulación de un pedido pendiente, con motivo opcional.
  // Resuelve con el string del motivo (puede ser '') si confirma, o con
  // `false` si cancela.
  function _confirmarAnularPedido(pedido) {
    return new Promise(resolve => {
      const SC = window.SC;
      const mesaTxt = pedido.paraLlevar || pedido.mesa === 'Para llevar' ? 'Para llevar' : `Mesa ${pedido.mesa}`;
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:2rem 1.75rem 1.5rem;max-width:380px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.3);text-align:center;animation:fadeUp .18s ease;">
          <div style="font-size:2.5rem;line-height:1;margin-bottom:.75rem;">🚫</div>
          <h3 style="font-size:1.1rem;font-weight:700;color:#3B1A08;margin-bottom:.4rem;">¿Anular pedido?</h3>
          <p style="color:#7A5640;font-size:.88rem;margin-bottom:1rem;line-height:1.5;">
            Se anulará el pedido de <strong style="color:#C8561A;">${SC.escapeHtml(mesaTxt)}</strong> (${SC.escapeHtml(pedido.nombreUsuario)}) por <strong style="color:#C8561A;">$${(pedido.total||0).toFixed(2)}</strong> y se repondrá el stock. Esta acción no se puede deshacer.
          </p>
          <textarea id="_anular-motivo" placeholder="Motivo (opcional)" style="width:100%;min-height:60px;border:1.5px solid #E0C9B0;border-radius:10px;padding:.6rem .75rem;font-size:.85rem;font-family:inherit;resize:vertical;margin-bottom:1.25rem;box-sizing:border-box;"></textarea>
          <div style="display:flex;gap:.75rem;justify-content:center;">
            <button id="_conf-cancel" style="flex:1;padding:.65rem 1rem;border:1.5px solid #E0C9B0;border-radius:10px;background:#fff;color:#7A5640;cursor:pointer;font-size:.88rem;font-weight:600;transition:all .15s;">Cancelar</button>
            <button id="_conf-ok" style="flex:1;padding:.65rem 1rem;border:none;border-radius:10px;background:#dc2626;color:#fff;cursor:pointer;font-size:.88rem;font-weight:700;transition:all .15s;">Sí, anular</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const cleanup = val => { document.body.removeChild(overlay); resolve(val); };
      overlay.querySelector('#_conf-ok').addEventListener('click', () => cleanup(overlay.querySelector('#_anular-motivo').value.trim()));
      overlay.querySelector('#_conf-cancel').addEventListener('click', () => cleanup(false));
      overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', esc); cleanup(false); }
      });
    });
  }

  function renderStock() {
    const SC = window.SC;
    const listaEl = document.getElementById('stock-lista');
    if (!listaEl) return;
    const productos = SC.getProductosMergeados();

    const cats = [...new Set(productos.map(p => p.categoria))];

    listaEl.innerHTML = cats.map(cat => {
      const prods = productos.filter(p => p.categoria === cat);
      const rows = prods.map(p => {
        const s      = SC.getStock(p.id);
        const qty    = s.stock;
        const esCero = qty <= 0;
        const esBajo = !esCero && qty <= 5;
        const pct    = Math.min(100, Math.round((qty / MAX_STOCK) * 100));
        const rowMod    = esCero ? 'stock-row--cero' : esBajo ? 'stock-row--bajo' : '';
        const statusMod = esCero ? 'stock-row__status--cero' : esBajo ? 'stock-row__status--bajo' : '';
        const barMod    = esCero ? 'stock-row__bar--cero' : esBajo ? 'stock-row__bar--bajo' : '';
        const statusTxt = esCero ? '🔴 Agotado' : esBajo ? '⚠️ Stock bajo' : '✅ Disponible';
        return `
          <div class="stock-row ${rowMod}" data-id="${p.id}">
            <div class="stock-row__header">
              <span class="stock-row__nombre">${p.nombre}</span>
              <span class="stock-row__status ${statusMod}">${statusTxt}</span>
            </div>
            <div class="stock-row__bar-wrap">
              <div class="stock-row__bar ${barMod}" style="width:${pct}%"></div>
            </div>
            <div class="stock-row__controls">
              <div class="stock-input-wrap">
                <div class="stock-input-left">
                  <span class="stock-current">${qty}</span>
                  <span class="stock-input-label">uds. actuales</span>
                </div>
                <div class="stock-input-left">
                  <span class="stock-arrow">→</span>
                  <input class="stock-input" type="number" min="0" max="999" value="${qty}" data-id="${p.id}" data-original="${qty}" aria-label="Nuevo stock de ${p.nombre}">
                  <button class="stock-btn stock-btn--set" data-action="set" data-id="${p.id}">Guardar</button>
                </div>
              </div>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="mesero-cat-section">
          <div class="mesero-cat-title collapsed" data-cat="${cat}"${_colorEstilo(cat)} role="button" tabindex="0" aria-expanded="false">
            ${cat}
            <span class="mesero-cat-chevron">▾</span>
          </div>
          <div class="mesero-list stock-cat-list hidden">
            ${rows}
          </div>
        </div>`;
    }).join('');

    listaEl.querySelectorAll('.mesero-cat-title').forEach(title => {
      const toggle = () => {
        const list = title.nextElementSibling;
        const isCollapsed = title.classList.toggle('collapsed');
        title.setAttribute('aria-expanded', String(!isCollapsed));
        list.classList.toggle('hidden', isCollapsed);
      };
      title.addEventListener('click', toggle);
      title.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });

    listaEl.querySelectorAll('.stock-input').forEach(inp => {
      inp.addEventListener('focus', () => { inp.dataset.prev = inp.value; inp.dataset.clearNext = 'true'; inp.select(); });
      inp.addEventListener('blur',  () => { inp.dataset.clearNext = ''; if (inp.value === '') inp.value = inp.dataset.prev || inp.dataset.original || '0'; });
      inp.addEventListener('input', () => {
        inp.dataset.clearNext = '';
        if (inp.value.length > 3) inp.value = inp.value.slice(0, 3);
        const original = parseInt(inp.dataset.original) || 0;
        const nuevo    = parseInt(inp.value) || 0;
        inp.style.borderColor = nuevo > original ? '#16a34a' : nuevo < original ? '#dc2626' : '';
        inp.style.color       = nuevo > original ? '#16a34a' : nuevo < original ? '#dc2626' : '';
      });
      inp.addEventListener('keydown', e => {
        if (e.key === '-' || e.key === 'e') e.preventDefault();
        if (inp.dataset.clearNext === 'true' && /^[0-9]$/.test(e.key)) {
          inp.value = '';
          inp.dataset.clearNext = '';
        }
        if (e.key === 'Enter') inp.closest('.stock-row')?.querySelector('.stock-btn--set')?.click();
      });
    });

    listaEl.onclick = async e => {
      if (e.target.closest('.mesero-cat-title')) return;
      const btn = e.target.closest('.stock-btn');
      if (!btn) return;
      const id  = btn.dataset.id;
      const act = btn.dataset.action;
      const row = listaEl.querySelector(`.stock-row[data-id="${id}"]`);
      const inp = row?.querySelector('.stock-input');

      if (act === 'set') {
        btn.disabled = true;
        btn.textContent = '…';
        const nuevo  = Math.max(0, parseInt(inp?.value) || 0);
        const actual = SC.getStock(id).stock;
        const diff   = nuevo - actual;
        if (diff > 0)      await SC.reponerStock(id, diff);
        else if (diff < 0) await SC.actualizarStock(id, Math.abs(diff));

        // Actualizar solo la fila en el DOM sin re-renderizar la lista completa
        const esCero = nuevo <= 0;
        const esBajo = !esCero && nuevo <= 5;
        const pct    = Math.min(100, Math.round((nuevo / MAX_STOCK) * 100));

        row.className = `stock-row${esCero ? ' stock-row--cero' : esBajo ? ' stock-row--bajo' : ''}`;
        row.querySelector('.stock-current').textContent = nuevo;

        const bar = row.querySelector('.stock-row__bar');
        bar.style.width = `${pct}%`;
        bar.className = `stock-row__bar${esCero ? ' stock-row__bar--cero' : esBajo ? ' stock-row__bar--bajo' : ''}`;

        const statusEl = row.querySelector('.stock-row__status');
        statusEl.textContent = esCero ? '🔴 Agotado' : esBajo ? '⚠️ Stock bajo' : '✅ Disponible';
        statusEl.className = `stock-row__status${esCero ? ' stock-row__status--cero' : esBajo ? ' stock-row__status--bajo' : ''}`;

        inp.value            = nuevo;
        inp.dataset.original = String(nuevo);
        inp.dataset.prev     = String(nuevo);
        inp.style.borderColor = '';
        inp.style.color       = '';

        btn.disabled    = false;
        btn.textContent = 'Guardar';

        SC.toast('Stock actualizado ✓', 'success');
        const cat = SC.getFiltroSesion();
        window.VistaMenu?.renderProductos(window.VistaMenu?.getListaByCat(cat));
      }
    };
  }

  function renderCajeroView() {
    const SC = window.SC;
    const pedidos        = SC.leerCaja().sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const totalPorCobrar = pedidos.reduce((s,p) => s + p.total, 0);

    const statPedidos = document.getElementById('stat-pedidos');
    const statTotal   = document.getElementById('stat-total');
    const cajeroGrid  = document.getElementById('cajero-grid');
    const cajaBadge   = document.getElementById('caja-count-btn');

    if (statPedidos) statPedidos.textContent = pedidos.length;
    if (statTotal)   statTotal.textContent   = `$${totalPorCobrar.toFixed(2)}`;

    if (cajaBadge) {
      cajaBadge.textContent = pedidos.length;
      cajaBadge.style.display = pedidos.length > 0 ? '' : 'none';
    }

    if (!cajeroGrid) return;

    if (!pedidos.length) {
      cajeroGrid.innerHTML = `
        <div class="cajero-empty">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
            <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
          </svg>
          <p>No hay pedidos pendientes</p>
          <small>Los pedidos enviados por los meseros y clientes aparecerán aquí</small>
        </div>`;
      _renderCobradosHoy();
      return;
    }

    const ROL_LABEL = SC.ROL_LABEL;

    cajeroGrid.innerHTML = pedidos.map(p => {
      const items = Array.isArray(p.items) ? p.items : [];
      const total = p.total || 0;
      return `
      <div class="cajero-order-card" role="listitem" data-pid="${p.id}">
        <div class="cajero-order-card__head">
          <div class="cajero-order-meta">
            <div class="cajero-order-mesa">${p.paraLlevar || p.mesa === 'Para llevar' ? '🛍 Para llevar' : `🪑 Mesa ${p.mesa}`}</div>
            <div class="cajero-order-quien">
              <span class="rol-pill ${p.rol}">${ROL_LABEL[p.rol] ?? p.rol}</span>
              <span>${SC.escapeHtml(p.nombreUsuario)}</span>
            </div>
            ${p.clienteNombre ? `<div class="cajero-order-cliente">👤 Pedido de: <strong>${SC.escapeHtml(p.clienteNombre)}</strong></div>` : ''}
          </div>
          <div class="cajero-order-time">🕐 ${p.hora}</div>
        </div>
        <div class="cajero-order-items">
          ${items.map((it) => {
            const { individual, resto } = LogicaCarrito.formatoExclusiones(it.exclusiones);
            return `
            <div class="cajero-order-item">
              <span class="cajero-order-item__name">${it.nombre}${it.paraLlevar && !p.paraLlevar ? ' <span class="cajero-item-llevar">🥡 Para llevar</span>' : ''}${individual ? '<span class="tag-individual">Individual</span>' : ''}${it.opcionesElegidas?.length ? `<span class="cajero-excl"> ${_fmtOpcionesElegidas(it.opcionesElegidas)}</span>` : ''}${resto.length ? `<span class="cajero-excl"> sin: ${resto.join(', ')}</span>` : ''}</span>
              <span class="cajero-order-item__qty">${it.cantidad}×</span>
              <span class="cajero-order-item__price">$${((it.precio || 0) * (it.cantidad || 0)).toFixed(2)}</span>
            </div>
          `;
          }).join('')}
          ${!items.length ? '<p style="color:var(--text-muted);font-size:.85rem;padding:.25rem 0">Sin detalle de ítems</p>' : ''}
        </div>
        <div class="cajero-order-subtotals">
          <div class="total-line"><span>Total</span><span id="card-total-${p.id}">$${total.toFixed(2)}</span></div>
        </div>
        <div class="cajero-order-card__foot" style="gap:.5rem">
          <button class="btn-cobrar" data-pedido-id="${p.id}" style="flex:2">Cobrado ✓</button>
          ${items.length > 1 || (items[0]?.cantidad ?? 0) > 1
            ? `<button class="btn-dividir" data-pedido-id="${p.id}" style="flex:1">✂️ Dividir</button>`
            : ''}
          <button class="btn-anular" data-pedido-id="${p.id}" style="flex:1">Anular</button>
        </div>
      </div>`;
    }).join('');

    cajeroGrid.onclick = async e => {
      const btnCobrar = e.target.closest('.btn-cobrar');
      if (btnCobrar) {
        _divisionPendiente = null; // cobro directo, no viene de "Dividir cuenta"
        abrirModalPago(btnCobrar.dataset.pedidoId);
        return;
      }
      const btnDividir = e.target.closest('.btn-dividir');
      if (btnDividir) {
        const pedido = SC.leerCaja().find(p => String(p.id) === String(btnDividir.dataset.pedidoId));
        if (pedido) abrirModalDividirCuenta(pedido);
        return;
      }
      const btnAnular = e.target.closest('.btn-anular');
      if (btnAnular) {
        const pedido = SC.leerCaja().find(p => String(p.id) === String(btnAnular.dataset.pedidoId));
        if (!pedido) return;
        const motivo = await _confirmarAnularPedido(pedido);
        if (motivo === false) return; // canceló
        btnAnular.disabled = true;
        const ok = await SC.anularPedido(pedido.id, motivo);
        if (ok) { renderCajeroView(); window.VistaAdmin?.renderAdminPedidos?.(); }
        else btnAnular.disabled = false;
        return;
      }
    };

    _renderCobradosHoy();
  }

  // "Cobrados hoy" — permite al cajero reimprimir o reenviar por correo la
  // Nota de Venta de un pedido que ya cobró, sin necesitar el panel de admin
  // (el rol cajero no tiene acceso a esa vista).
  function _renderCobradosHoy() {
    const SC = window.SC;
    const wrap = document.getElementById('cajero-cobrados-wrap');
    if (!wrap) return;

    const hoy = _getFecha(0);
    const cobrados = SC.leerHistorial().filter(h => h.fecha === hoy)
      .sort((a, b) => new Date(b.cobradoEn || 0) - new Date(a.cobradoEn || 0));

    if (!cobrados.length) {
      wrap.innerHTML = `<p style="color:var(--text-muted);font-size:.88rem;padding:.5rem 0">Aún no hay pedidos cobrados hoy.</p>`;
      _renderCierreCajaBox();
      return;
    }

    const _hora = h => h.cobradoEn ? new Date(h.cobradoEn).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) : '—';
    const _acciones = h => `
      <div style="display:flex;gap:.6rem">
        <button class="btn-cobrado-nota" data-hid="${h.id}">🖨️ Imprimir</button>
        <button class="btn-cobrado-correo" data-hid="${h.id}">✉️ Enviar</button>
      </div>`;

    const _metodoBadge = h => h.pagos?.length > 1
      ? `<span class="rol-pill" style="background:#5b7fa6" title="${SC.escapeHtml(_fmtMetodoPago(h))}">Mixto</span>`
      : (h.metodoPagoNombre || 'Efectivo');

    wrap.innerHTML = `
      <table class="resumen-tabla">
        <thead>
          <tr><th>Mesa</th><th>Cliente</th><th>Hora</th><th>Método</th><th style="text-align:right">Total</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          ${cobrados.map(h => `
            <tr>
              <td><strong>${h.paraLlevar || h.mesa === 'Para llevar' ? '🛍 Para llevar' : `Mesa ${h.mesa}`}</strong></td>
              <td>${SC.escapeHtml(h.clienteNombre || h.nombreUsuario)}</td>
              <td class="td-hora">${_hora(h)}</td>
              <td class="td-hora">${_metodoBadge(h)}</td>
              <td class="td-total">$${h.total.toFixed(2)}</td>
              <td style="white-space:nowrap">${_acciones(h)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="resumen-cards">
        ${cobrados.map(h => `
          <div class="resumen-card">
            <div class="resumen-card__head">
              <span class="resumen-card__mesa">${h.paraLlevar || h.mesa === 'Para llevar' ? '🛍 Para llevar' : `Mesa ${h.mesa}`}</span>
              <span class="resumen-card__total">$${h.total.toFixed(2)}</span>
            </div>
            <div class="resumen-card__body">
              <div class="resumen-card__cliente">${SC.escapeHtml(h.clienteNombre || h.nombreUsuario)}</div>
              <div class="resumen-card__hora">${_hora(h)} · ${_metodoBadge(h)}</div>
              <div style="display:flex;gap:.5rem;margin-top:.5rem">${_acciones(h)}</div>
            </div>
          </div>`).join('')}
      </div>`;

    wrap.querySelectorAll('.btn-cobrado-nota').forEach(btn => {
      btn.onclick = () => {
        const h = cobrados.find(x => String(x.id) === String(btn.dataset.hid));
        if (!h) return;
        imprimirNotaVenta(h, h.factNumero || 'FACT-000000', _fmtMetodoPago(h, h.metodoPagoNombre), h.cobradoEn);
      };
    });

    wrap.querySelectorAll('.btn-cobrado-correo').forEach(btn => {
      btn.onclick = () => {
        const h = cobrados.find(x => String(x.id) === String(btn.dataset.hid));
        if (!h) return;
        abrirModalCorreoNota(h, h.factNumero || 'FACT-000000', _fmtMetodoPago(h, h.metodoPagoNombre), h.cobradoEn, h.factEmail || '');
      };
    });

    _renderCierreCajaBox();
  }

  /* ─────────────────────────────────────────────────────
     CIERRE DE CAJA — conteo físico de efectivo al final del día.
     Solo trabaja sobre "hoy" (este panel no navega a días anteriores,
     eso lo hace el admin desde Reportes).
  ───────────────────────────────────────────────────── */
  const _CC_SELECT = 'cierre_id, cierre_fecha, cierre_fondo_inicial, cierre_efectivo_ventas, cierre_gastos_caja, cierre_efectivo_esperado, cierre_efectivo_contado, cierre_diferencia, cierre_notas, cierre_usu_id, cierre_created_at';
  const _CC_MAX = 5000; // tope razonable para un negocio de este tamaño — evita números absurdos ("2.13e+25")

  async function _renderCierreCajaBox() {
    const box = document.getElementById('cierre-caja-box');
    if (!box) return;
    const SC = window.SC;
    const fechaISO = _fechaISOHoy();
    const hoy = _getFecha(0);
    // montoEfectivo ya viene neto (recibido − cambio) por pedido, e incluye
    // solo la porción efectivo de un pago mixto — no filtrar por método,
    // porque un pedido "Mixto" no es 'Efectivo' pero sí aporta esa porción.
    const efectivoVentas = SC.leerHistorial()
      .filter(h => h.fecha === hoy)
      .reduce((s, h) => s + (h.montoEfectivo ?? (h.metodoPagoNombre === 'Efectivo' ? (h.total || 0) : 0)), 0);

    // Gastos pagados con el efectivo de la caja física (no transferencia
    // ni externos) — esos sí salen del cajón y deben restarse del esperado.
    const gastosCaja = SC.leerGastos()
      .filter(g => g.fecha === hoy && g.metodoPago === 'efectivo')
      .reduce((s, g) => s + (g.monto || 0), 0);

    const [{ data: actual }, { data: ultimo }] = await Promise.all([
      window.db.from('cierres_caja').select(_CC_SELECT).eq('cierre_fecha', fechaISO).maybeSingle(),
      window.db.from('cierres_caja').select('cierre_fondo_inicial').order('cierre_fecha', { ascending: false }).limit(1).maybeSingle()
    ]);

    if (actual) {
      _cc_renderCerrado(box, actual);
    } else {
      const fondoGuardado = _leerFondoGuardado();
      _cc_renderForm(box, fechaISO, efectivoVentas, gastosCaja, fondoGuardado ?? (ultimo?.cierre_fondo_inicial ?? ''), null);
    }
  }

  function _cc_renderCerrado(box, c) {
    const SC = window.SC;
    const users = window.ModuloAutenticacion?.leerUsuarios() ?? [];
    const nombreQuien = users.find(u => u.id === c.cierre_usu_id)?.nombre ?? 'Alguien';
    const dif = parseFloat(c.cierre_diferencia) || 0;
    const difFmt = dif > 0 ? `+$${dif.toFixed(2)}` : dif < 0 ? `-$${Math.abs(dif).toFixed(2)}` : '$0.00';
    const hora = new Date(c.cierre_created_at).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    box.innerHTML = `
      <div class="cierre-caja cierre-caja--cerrado">
        <div class="cierre-caja__header">💰 Cierre de caja — Hoy <span class="cierre-caja__badge">CERRADO</span></div>
        <div class="cierre-caja__resumen">
          <div><span>Fondo inicial</span><strong>$${parseFloat(c.cierre_fondo_inicial).toFixed(2)}</strong></div>
          <div><span>Ventas en efectivo</span><strong>$${parseFloat(c.cierre_efectivo_ventas).toFixed(2)}</strong></div>
          ${parseFloat(c.cierre_gastos_caja) > 0 ? `<div><span>Gastos pagados en efectivo hoy (informativo)</span><strong style="color:var(--text-muted)">$${parseFloat(c.cierre_gastos_caja).toFixed(2)}</strong></div>` : ''}
          <div><span>Esperado</span><strong>$${parseFloat(c.cierre_efectivo_esperado).toFixed(2)}</strong></div>
          <div><span>Contado</span><strong>$${parseFloat(c.cierre_efectivo_contado).toFixed(2)}</strong></div>
          <div><span>Diferencia</span><strong style="color:${dif === 0 ? '#16a34a' : '#dc2626'}">${difFmt}</strong></div>
        </div>
        <div class="cierre-caja__meta">Cerrado por ${SC.escapeHtml(nombreQuien)} a las ${hora}${c.cierre_notas ? ` — "${SC.escapeHtml(c.cierre_notas)}"` : ''}</div>
        <button class="cierre-caja__editar" id="btn-editar-cierre" type="button">Editar cierre</button>
      </div>`;
    document.getElementById('btn-editar-cierre')?.addEventListener('click', () => {
      _cc_renderForm(box, c.cierre_fecha, parseFloat(c.cierre_efectivo_ventas) || 0, parseFloat(c.cierre_gastos_caja) || 0, c.cierre_fondo_inicial, c);
    });
  }

  function _cc_renderForm(box, fechaISO, efectivoVentas, gastosCaja, fondoDefault, cierrePrevio) {
    const SC = window.SC;
    const fondoInicial  = cierrePrevio ? cierrePrevio.cierre_fondo_inicial : fondoDefault;
    const contadoPrevio = cierrePrevio ? cierrePrevio.cierre_efectivo_contado : '';
    const notasPrevias  = cierrePrevio ? (cierrePrevio.cierre_notas ?? '') : '';
    // Esperado = fondo inicial + lo cobrado en efectivo (incluida la pierna
    // en efectivo de pagos mixtos) − los gastos pagados con ese mismo
    // efectivo de caja (transferencia y externos no tocan el cajón físico).
    const esperadoInicial = (parseFloat(fondoInicial) || 0) + efectivoVentas - gastosCaja;
    box.innerHTML = `
      <div class="cierre-caja">
        <div class="cierre-caja__header">💰 Cierre de caja — Hoy</div>
        <div class="cierre-caja__form">
          <div class="cierre-caja__campo">
            <label for="cc-fondo">Fondo inicial</label>
            <div style="display:flex;gap:.4rem;align-items:center">
              <input type="number" id="cc-fondo" step="0.01" min="0" max="${_CC_MAX}" value="${fondoInicial}">
              <button class="cierre-caja__editar" id="btn-guardar-fondo" type="button" title="Guarda el fondo inicial para no tener que escribirlo de nuevo si recargas la página">💾 Guardar</button>
            </div>
          </div>
          <div class="cierre-caja__campo">
            <label>Efectivo esperado</label>
            <div class="cierre-caja__esperado" id="cc-esperado">$${esperadoInicial.toFixed(2)}</div>
            ${gastosCaja > 0 ? `<small style="color:var(--text-muted)">Ya descuenta $${gastosCaja.toFixed(2)} en gastos pagados desde la caja hoy</small>` : ''}
          </div>
          <div class="cierre-caja__campo">
            <label for="cc-contado">Efectivo contado</label>
            <input type="number" id="cc-contado" step="0.01" min="0" max="${_CC_MAX}" placeholder="0.00" value="${contadoPrevio}">
          </div>
          <button class="adm-btn-primary" id="btn-cerrar-caja" type="button">Cerrar caja</button>
        </div>
        <input type="text" id="cc-notas" class="cierre-caja__notas" placeholder="Notas (opcional) — ej. explicación de una diferencia" maxlength="200" value="${SC.escapeHtml(notasPrevias)}">
      </div>`;

    const fondoInput   = document.getElementById('cc-fondo');
    const contadoInput = document.getElementById('cc-contado');
    const esperadoEl   = document.getElementById('cc-esperado');
    fondoInput?.addEventListener('input', () => {
      // Recorta el valor tecleado (no solo el cálculo interno) — si no,
      // el campo se queda mostrando el número absurdo aunque "Esperado"
      // ya esté bien.
      const crudo = parseFloat(fondoInput.value);
      if (!isNaN(crudo) && crudo > _CC_MAX) fondoInput.value = _CC_MAX;
      const valor = Math.min(parseFloat(fondoInput.value) || 0, _CC_MAX);
      const esperado = valor + efectivoVentas - gastosCaja;
      if (esperadoEl) esperadoEl.textContent = `$${esperado.toFixed(2)}`;
    });
    contadoInput?.addEventListener('input', () => {
      const crudo = parseFloat(contadoInput.value);
      if (!isNaN(crudo) && crudo > _CC_MAX) contadoInput.value = _CC_MAX;
    });

    document.getElementById('btn-guardar-fondo')?.addEventListener('click', () => {
      const valor = parseFloat(fondoInput?.value);
      if (isNaN(valor) || valor < 0) { SC?.toast('Ingresa un fondo inicial válido.', 'error'); return; }
      _guardarFondoGuardado(Math.min(valor, _CC_MAX));
      SC?.toast('Fondo inicial guardado ✓', 'success');
    });

    const btn = document.getElementById('btn-cerrar-caja');
    btn?.addEventListener('click', async () => {
      const fondo   = parseFloat(document.getElementById('cc-fondo')?.value);
      const contado = parseFloat(document.getElementById('cc-contado')?.value);
      const notas   = document.getElementById('cc-notas')?.value.trim() || null;
      if (isNaN(fondo) || fondo < 0)          { SC?.toast('Ingresa el fondo inicial.', 'error'); return; }
      if (isNaN(contado) || contado < 0)      { SC?.toast('Ingresa cuánto contaste en efectivo.', 'error'); return; }
      if (fondo > _CC_MAX || contado > _CC_MAX) { SC?.toast(`Ese monto es demasiado grande — máximo $${_CC_MAX}.`, 'error'); return; }
      btn.disabled = true;
      const token = window.ModuloAutenticacion?.getSession?.()?.token ?? null;
      const { data, error } = await window.db.rpc('cerrar_caja', {
        p_token: token, p_fecha: fechaISO, p_fondo_inicial: fondo, p_efectivo_contado: contado, p_notas: notas
      });
      btn.disabled = false;
      if (error || !data) { console.error('Supabase cerrar_caja:', error); SC?.toast('Error al cerrar la caja.', 'error'); return; }
      SC?.toast('Caja cerrada ✓', 'success');
      _cc_renderCerrado(box, data);
    });
  }

  /* ─────────────────────────────────────────────────────
     MODAL: ENVIAR NOTA DE VENTA POR CORREO
  ───────────────────────────────────────────────────── */
  function abrirModalCorreoNota(pedido, factNumero, metodoPagoNombre, fechaCobro, emailDefault) {
    const SC = window.SC;
    _correoNotaCtx = { pedido, factNumero, metodoPagoNombre, fechaCobro };

    const input = document.getElementById('correo-nota-input');
    const errEl = document.getElementById('correo-nota-error');
    if (input) input.value = emailDefault || '';
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

    const backdrop = document.getElementById('correo-nota-modal-backdrop');
    if (backdrop) {
      backdrop.classList.add('open');
      backdrop.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = document.documentElement.style.overflow = 'hidden';
      setTimeout(() => input?.focus(), 100);
    }
  }

  function _cerrarModalCorreoNota() {
    const backdrop = document.getElementById('correo-nota-modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = document.documentElement.style.overflow = '';
    }
    _correoNotaCtx = null;
  }

  /* ─────────────────────────────────────────────────────
     MODAL DE PAGO
  ───────────────────────────────────────────────────── */
  function abrirModalPago(pedidoId) {
    const SC = window.SC;
    const pedido = SC.leerCaja().find(p => String(p.id) === String(pedidoId));
    if (!pedido) return;
    _pedidoParaCobrar = pedidoId;
    _cobroFueIntentado = false;

    const totalDisp = document.getElementById('pago-total-display');
    const montoInp  = document.getElementById('pago-monto-recibido');
    const cambioEl  = document.getElementById('pago-cambio-display');
    const efectivoSec = document.getElementById('pago-efectivo-section');
    const mixtoSec     = document.getElementById('pago-mixto-section');
    const mixtoEfInp   = document.getElementById('pago-mixto-efectivo');
    const mixtoTrMonto = document.getElementById('pago-mixto-transferencia-monto');
    const mixtoRestEl  = document.getElementById('pago-mixto-restante');

    if (totalDisp) totalDisp.innerHTML = `Total a cobrar: <strong>$${pedido.total.toFixed(2)}</strong>`;
    if (montoInp)  { montoInp.value = ''; montoInp.min = pedido.total.toFixed(2); }
    if (cambioEl)  cambioEl.textContent = '';
    if (mixtoEfInp) mixtoEfInp.value = '';
    if (mixtoTrMonto) mixtoTrMonto.textContent = '$0.00';
    if (mixtoRestEl) mixtoRestEl.textContent = '';

    const radioEfectivo = document.querySelector('input[name="metodo-pago"][value="met001"]');
    if (radioEfectivo) radioEfectivo.checked = true;
    if (efectivoSec) efectivoSec.style.display = '';
    if (mixtoSec) mixtoSec.style.display = 'none';

    // Correo para la Nota de Venta: siempre es opcional (checkbox), nunca
    // se manda sin que alguien lo decida. Si el cliente está registrado,
    // el checkbox viene precargado con su correo y marcado por comodidad,
    // pero se puede desmarcar si no la quiere; si es invitado, arranca
    // desmarcado y pide escribir el correo.
    const correoCheckbox   = document.getElementById('pago-enviar-correo');
    const correoLabel      = document.getElementById('pago-enviar-correo-label');
    const correoInput      = document.getElementById('pago-correo-input');
    // Ojo: pedido.idUsuario también queda seteado cuando quien CREÓ el
    // pedido fue un mesero/cajero/admin (pidió a nombre de un cliente que
    // llegó a la mesa) — en ese caso ese id es la cuenta del empleado, no
    // la del cliente, y no hay que precargar SU correo aquí. Solo cuenta
    // como "cliente registrado" si el rol de esa cuenta es 'usuario'.
    const usuarioReg = pedido.idUsuario
      ? window.ModuloAutenticacion?.leerUsuarios().find(u => u.id === pedido.idUsuario && u.rol === 'usuario')
      : null;

    if (usuarioReg?.email) {
      if (correoCheckbox) { correoCheckbox.checked = true; correoCheckbox.dataset.registrado = 'true'; }
      if (correoLabel) correoLabel.textContent = `Enviar Nota de Venta a ${usuarioReg.email}`;
      if (correoInput) { correoInput.value = ''; correoInput.style.display = 'none'; }
    } else {
      if (correoCheckbox) { correoCheckbox.checked = false; correoCheckbox.dataset.registrado = 'false'; }
      if (correoLabel) correoLabel.textContent = 'Enviar Nota de Venta por correo';
      if (correoInput) { correoInput.value = ''; correoInput.style.display = 'none'; }
    }

    const backdrop = document.getElementById('pago-modal-backdrop');
    if (backdrop) {
      backdrop.classList.add('open');
      backdrop.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = document.documentElement.style.overflow = 'hidden';
      setTimeout(() => montoInp?.focus(), 100);
    }
  }

  function cerrarModalPago() {
    const backdrop = document.getElementById('pago-modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = document.documentElement.style.overflow = '';
    }
    // Si este modal se abrió justo después de "Dividir cuenta" y se cierra
    // sin haber llegado a intentar el cobro (canceló), la porción dividida
    // no debe quedar como una tarjeta suelta sin pagar — se regresa al
    // pedido original.
    if (!_cobroFueIntentado && _divisionPendiente && String(_divisionPendiente.nuevoPedId) === String(_pedidoParaCobrar)) {
      _deshacerDivisionPendiente(_divisionPendiente);
    }
    _divisionPendiente  = null;
    _cobroFueIntentado  = false;
    _pedidoParaCobrar   = null;
  }

  async function _deshacerDivisionPendiente({ nuevoPedId, padreId }) {
    const SC = window.SC;
    const ok = await SC.deshacerDivisionPedido(nuevoPedId, padreId);
    if (!ok) { SC.toast('No se pudo deshacer la división — revisa el pedido manualmente', 'error'); return; }
    await SC.recargarCaja();
    renderCajeroView();
    window.VistaAdmin?.renderAdminPedidos?.();
  }

  /* ─────────────────────────────────────────────────────
     MODAL DIVIDIR CUENTA — mueve las líneas elegidas a un pedido nuevo
     (dividirPedido) y de una vez abre el modal de pago normal sobre ese
     pedido nuevo, para cobrar esa porción con el flujo de siempre.
  ───────────────────────────────────────────────────── */
  function abrirModalDividirCuenta(pedido) {
    const SC = window.SC;
    _pedidoParaDividir = pedido.id;
    const listaEl = document.getElementById('dividir-cuenta-lista');
    if (!listaEl) return;

    listaEl.innerHTML = (pedido.items || []).map(it => {
      const { individual, resto } = LogicaCarrito.formatoExclusiones(it.exclusiones);
      const detalles = [
        it.paraLlevar && !pedido.paraLlevar ? '🥡 Para llevar' : '',
        individual ? 'Individual' : '',
        it.opcionesElegidas?.length ? _fmtOpcionesElegidas(it.opcionesElegidas) : '',
        resto.length ? `sin: ${resto.join(', ')}` : ''
      ].filter(Boolean).join(' · ');
      return `
      <div class="dividir-item" data-precio="${it.precio}" data-max="${it.cantidad}" data-detped-id="${it.detpedId}">
        <div class="dividir-item__info">
          <span class="dividir-item__nombre">${SC.escapeHtml(it.nombre)}</span>
          <span class="dividir-item__precio">$${it.precio.toFixed(2)} c/u${detalles ? ' · ' + SC.escapeHtml(detalles) : ''} · ${it.cantidad} en total</span>
        </div>
        <div class="dividir-item__stepper">
          <button type="button" class="dividir-stepper-btn" data-dir="-1" aria-label="Restar">−</button>
          <input type="number" class="dividir-item__input" min="0" max="${it.cantidad}" value="0" inputmode="numeric" aria-label="Cantidad de ${SC.escapeHtml(it.nombre)} para este cobro">
          <button type="button" class="dividir-stepper-btn" data-dir="1" aria-label="Sumar">+</button>
        </div>
      </div>`;
    }).join('');

    _actualizarResumenDividir(pedido);

    const errEl = document.getElementById('dividir-cuenta-error');
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

    const backdrop = document.getElementById('dividir-cuenta-backdrop');
    if (backdrop) {
      backdrop.classList.add('open');
      backdrop.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = document.documentElement.style.overflow = 'hidden';
    }
  }

  function cerrarModalDividirCuenta() {
    const backdrop = document.getElementById('dividir-cuenta-backdrop');
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = document.documentElement.style.overflow = '';
    }
    _pedidoParaDividir = null;
  }

  // Recalcula el subtotal seleccionado a partir de los inputs del modal —
  // se llama en cada cambio de cantidad. Devuelve también la selección ya
  // armada en el formato que espera SC.dividirPedido.
  function _actualizarResumenDividir(pedido) {
    const listaEl     = document.getElementById('dividir-cuenta-lista');
    const subtotalEl   = document.getElementById('dividir-cuenta-subtotal');
    const restoEl       = document.getElementById('dividir-cuenta-resto');
    const confirmBtn    = document.getElementById('btn-confirmar-dividir-cuenta');
    if (!listaEl) return { subtotal: 0, seleccion: [] };

    let subtotal = 0;
    const seleccion = [];
    listaEl.querySelectorAll('.dividir-item').forEach(row => {
      const precio = parseFloat(row.dataset.precio) || 0;
      const cant   = parseInt(row.querySelector('.dividir-item__input')?.value, 10) || 0;
      if (cant > 0) {
        subtotal += precio * cant;
        seleccion.push({ detpedId: row.dataset.detpedId, cantidad: cant });
      }
    });

    const total = pedido.total || 0;
    if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
    if (restoEl) restoEl.textContent = `$${Math.max(0, total - subtotal).toFixed(2)}`;
    // No se puede dividir el 100% — para eso ya está "Cobrar" directo.
    if (confirmBtn) confirmBtn.disabled = subtotal <= 0 || subtotal >= total - 0.001;

    return { subtotal, seleccion };
  }

  /* ─────────────────────────────────────────────────────
     IMPRESIÓN: RECIBO POS
  ───────────────────────────────────────────────────── */
  function imprimirRecibo(pedido, factNumero, metodoPagoNombre, montoPagado, cambio) {
    const SC = window.SC;
    const items = pedido.items || [];
    const win = window.open('', '_blank', 'width=380,height=650');
    if (!win) { SC.toast('Bloqueo de ventanas emergentes — autorízalas para imprimir', 'error'); return; }
    win.document.write(`<!doctype html><html lang="es"><head>
<meta charset="utf-8"><title>Recibo ${factNumero}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;padding:12px;width:320px}
.logo{text-align:center;font-size:18px;font-weight:bold;margin-bottom:2px}
.sub{text-align:center;font-size:10px;color:#555}
.sep{border:none;border-top:1px dashed #000;margin:7px 0}
.fn{text-align:center;font-size:10px;margin:3px 0}
table{width:100%;border-collapse:collapse}
th{font-size:10px;text-align:left;border-bottom:1px solid #000;padding:2px 0}
.tr{text-align:right}
td{padding:2px 0;font-size:11px;vertical-align:top}
.excl{font-size:9px;color:#777;font-style:italic}
.tot td{border-top:1px solid #000;padding-top:3px}
.big td{font-weight:bold;font-size:13px}
.mt{text-align:center;font-size:11px;margin-top:5px}
.cambio{text-align:center;font-size:13px;font-weight:bold;margin:3px 0;color:#15803d}
.footer{text-align:center;font-size:10px;color:#666;margin-top:10px}
@media print{body{padding:0}}
</style></head><body>
<div class="logo">Sal y Canela</div>
<div class="sub">Restaurante Artesanal</div>
<div class="sub">Mesa ${pedido.mesa}</div>
<hr class="sep">
<div class="fn">${factNumero} · ${new Date().toLocaleString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
<hr class="sep">
<table><thead><tr><th>Descripción</th><th class="tr">Cant</th><th class="tr">$U</th><th class="tr">$Total</th></tr></thead>
<tbody>${items.map(i=>{
const { individual, resto } = LogicaCarrito.formatoExclusiones(i.exclusiones);
return `<tr>
<td>${i.nombre}${i.opcionesElegidas?.length?`<br><span class="excl">${_fmtOpcionesElegidas(i.opcionesElegidas)}</span>`:''}${individual?`<br><span class="excl"><b>Individual</b></span>`:''}${resto.length?`<br><span class="excl">sin: ${resto.join(', ')}</span>`:''}
</td><td class="tr">${i.cantidad}</td><td class="tr">${i.precio.toFixed(2)}</td>
<td class="tr">${(i.precio*i.cantidad).toFixed(2)}</td></tr>`;
}).join('')}</tbody>
<tbody class="big"><tr><td colspan="3">TOTAL:</td><td class="tr">$${pedido.total.toFixed(2)}</td></tr></tbody>
</table>
<div class="mt">Método: ${metodoPagoNombre}</div>
${metodoPagoNombre==='Efectivo'?`<div class="mt">Recibido: $${montoPagado.toFixed(2)}</div>
<div class="cambio">Cambio: $${cambio.toFixed(2)}</div>`:''}
<hr class="sep">
<div class="footer">¡Gracias por su visita!<br>Vuelva pronto 🙂</div>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  /* ─────────────────────────────────────────────────────
     IMPRESIÓN: NOTA DE VENTA (RIMPE — Negocio Popular)
     Régimen RIMPE Negocio Popular: tarifa 0% de IVA (ver SC_CONFIG.IVA
     en index.html) y nota de venta simple, no factura electrónica
     autorizada por el SRI (esa requiere otro trámite de autorización).
  ───────────────────────────────────────────────────── */
  const RUC_NEGOCIO        = '0601335128001';
  const DIRECCION_NEGOCIO  = 'Villalengua y Jorge Drom, Quito';
  const TELEFONO_NEGOCIO   = '0984 870 280';

  // Arma el HTML de la Nota de Venta — lo usan tanto imprimirNotaVenta()
  // (ventana de impresión) como enviarNotaVentaPorCorreo() (cuerpo del correo).
  function _construirNotaVentaHtml(pedido, factNumero, metodoPagoNombre, fechaCobro) {
    const items = pedido.items || [];
    // fechaCobro: al reimprimir/reenviar desde el historial del admin, usar
    // la fecha real del cobro, no la fecha en que se reimprime/reenvía.
    const ahora = fechaCobro ? new Date(fechaCobro) : new Date();
    const numNota = 'NV-' + factNumero.replace('FACT-', '').padStart(6, '0');
    return {
      numNota,
      html: `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><title>Nota de Venta ${numNota}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11px;padding:20px}
.box{border:2px solid #000;max-width:780px;margin:auto}
.head{display:flex}
.logo-sec{width:33%;padding:10px;border-right:1px solid #000;text-align:center}
.logo-name{font-size:18px;font-weight:bold}
.ruc-sec{width:34%;padding:10px;border-right:1px solid #000}
.ruc-sec p{margin:2px 0}
.num-sec{width:33%;padding:10px}
.num-sec p{margin:2px 0}
.num-big{font-size:13px;font-weight:bold;color:#c00}
.info-box{border:1px solid #aaa;padding:3px 6px;margin-top:5px;font-size:10px}
.cli{padding:8px 10px;border-top:1px solid #000;display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:10px}
.cli label{font-weight:bold}
.items{padding:0 0 0 0}
.items table{width:100%;border-collapse:collapse}
.items th,.items td{border:1px solid #ccc;padding:4px 6px;font-size:10px}
.items th{background:#f0f0f0}
.tr{text-align:right}.tc{text-align:center}
.tots{padding:0 10px 10px;display:flex;justify-content:flex-end}
.tots table{border-collapse:collapse}
.tots td{padding:3px 8px;border:1px solid #ccc}
.tots .bold{font-weight:bold;font-size:13px}
.pago-row{padding:8px 10px;border-top:1px solid #000;font-size:11px}
.foot{padding:6px 10px;border-top:1px solid #000;text-align:center;font-size:10px;color:#555}
@media print{body{padding:0}}
</style></head><body>
<div class="box">
<div class="head">
<div class="logo-sec">
  <div class="logo-name">Sal y Canela</div>
  <div style="font-size:10px;color:#555">Restaurante Artesanal</div>
  <div style="font-size:10px;margin-top:3px">${DIRECCION_NEGOCIO}</div>
</div>
<div class="ruc-sec">
  <p><strong>RUC:</strong> ${RUC_NEGOCIO ?? 'Pendiente de registro'}</p>
  <p><strong>Régimen:</strong> RIMPE — Negocio Popular</p>
  <p><strong>Dirección:</strong> ${DIRECCION_NEGOCIO}</p>
  <p><strong>Teléfono:</strong> ${TELEFONO_NEGOCIO}</p>
</div>
<div class="num-sec">
  <p><strong>NOTA DE VENTA</strong></p>
  <p class="num-big">${numNota}</p>
  <p style="margin-top:5px"><strong>Fecha:</strong> ${ahora.toLocaleDateString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric'})}</p>
  <p><strong>Hora:</strong> ${ahora.toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</p>
</div>
</div>
<div class="cli">
  <div><label>Cliente: </label>${pedido.nombreUsuario||'Consumidor Final'}</div>
  <div><label>Identificación: </label>9999999999999</div>
  <div><label>Dirección: </label>—</div>
  <div><label>Mesa: </label>Mesa ${pedido.mesa}</div>
</div>
<div class="items">
<table><thead><tr>
  <th class="tc">#</th><th>Descripción</th><th class="tc">Cant.</th>
  <th class="tr">P. Unitario</th><th class="tr">Total</th>
</tr></thead>
<tbody>${items.map((i,idx)=>{
  const { individual, resto } = LogicaCarrito.formatoExclusiones(i.exclusiones);
  return `<tr>
  <td class="tc">${idx+1}</td>
  <td>${i.nombre}${i.paraLlevar && !pedido.paraLlevar?' <em>(para llevar)</em>':''}${i.opcionesElegidas?.length?` <em>(${_fmtOpcionesElegidas(i.opcionesElegidas)})</em>`:''}${individual?' <em><b>(Individual)</b></em>':''}${resto.length?` <em>(sin: ${resto.join(', ')})</em>`:''}</td>
  <td class="tc">${i.cantidad}</td>
  <td class="tr">$${i.precio.toFixed(2)}</td>
  <td class="tr">$${(i.precio*i.cantidad).toFixed(2)}</td>
</tr>`;
}).join('')}</tbody>
</table>
</div>
<div class="tots"><table>
  <tr class="bold"><td>VALOR TOTAL:</td><td class="tr">$${pedido.total.toFixed(2)}</td></tr>
</table></div>
<div class="pago-row"><strong>Forma de pago:</strong> ${metodoPagoNombre} · <strong>Total pagado:</strong> $${pedido.total.toFixed(2)}</div>
<div class="foot">Nota de venta interna · Sal y Canela · ${ahora.toLocaleDateString('es-EC')}</div>
</div></body></html>`
    };
  }

  function imprimirNotaVenta(pedido, factNumero, metodoPagoNombre, fechaCobro) {
    const SC = window.SC;
    const { html, numNota } = _construirNotaVentaHtml(pedido, factNumero, metodoPagoNombre, fechaCobro);
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { SC.toast('Bloquea ventanas emergentes — autorízalas para imprimir', 'error'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  // Envía la Nota de Venta por correo vía la Edge Function enviar-nota-venta
  // (valida la sesión de staff server-side y llama a Resend con la API key,
  // que nunca llega al navegador). Devuelve true/false.
  async function enviarNotaVentaPorCorreo(pedido, factNumero, metodoPagoNombre, fechaCobro, email) {
    const SC = window.SC;
    if (!email) return false;
    const { html, numNota } = _construirNotaVentaHtml(pedido, factNumero, metodoPagoNombre, fechaCobro);
    const session = window.ModuloAutenticacion?.getSession?.();
    try {
      const { data, error } = await window.db.functions.invoke('enviar-nota-venta', {
        body: { token: session?.token ?? null, email, html, numNota }
      });
      if (error || !data?.ok) {
        console.error('enviar-nota-venta:', error || data);
        SC.toast('No se pudo enviar la nota por correo', 'error');
        return false;
      }
      SC.toast(`Nota de venta enviada a ${email} ✓`, 'success');
      return true;
    } catch (e) {
      console.error('enviarNotaVentaPorCorreo exception:', e);
      SC.toast('No se pudo enviar la nota por correo', 'error');
      return false;
    }
  }

  function init() {
    /* ── Modal de pago ── */
    const pagoBackdrop   = document.getElementById('pago-modal-backdrop');
    const btnCerrarPago  = document.getElementById('btn-cerrar-pago-modal');
    const btnCancelarPago = document.getElementById('btn-cancelar-pago');
    const btnConfirmarPago = document.getElementById('btn-confirmar-pago');
    const montoRecibidoInp = document.getElementById('pago-monto-recibido');
    const cambioDisp       = document.getElementById('pago-cambio-display');
    const efectivoSec      = document.getElementById('pago-efectivo-section');
    const mixtoSec         = document.getElementById('pago-mixto-section');
    const mixtoEfInp       = document.getElementById('pago-mixto-efectivo');
    const mixtoTrMonto     = document.getElementById('pago-mixto-transferencia-monto');
    const mixtoRestEl      = document.getElementById('pago-mixto-restante');

    if (btnCerrarPago)  btnCerrarPago.addEventListener('click',  cerrarModalPago);
    if (btnCancelarPago) btnCancelarPago.addEventListener('click', cerrarModalPago);
    // pagoBackdrop: solo cerrar con botón X o Cancelar

    document.querySelectorAll('input[name="metodo-pago"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (efectivoSec) efectivoSec.style.display = radio.value === 'met001' ? '' : 'none';
        if (mixtoSec)    mixtoSec.style.display    = radio.value === 'mixto'  ? '' : 'none';
        if (cambioDisp)  cambioDisp.textContent = '';
        if (mixtoRestEl) mixtoRestEl.textContent = '';
        // Al elegir un método que necesita escribir un monto, el foco va
        // directo al campo — no debería hacer falta tocarlo con el mouse.
        if (radio.value === 'mixto')  mixtoEfInp?.focus();
        else if (radio.value === 'met001') montoRecibidoInp?.focus();
      });
    });

    // Solo se escribe el efectivo — la transferencia es siempre el resto
    // exacto del total, calculada sola (pensado para cajeros de la
    // tercera edad: un solo campo, sin tener que sacar la cuenta a mano).
    const _restanteMixto = pedido => {
      const efectivoRecibido = parseFloat(mixtoEfInp?.value) || 0;
      const transferencia = Math.max(0, Math.round((pedido.total - efectivoRecibido) * 100) / 100);
      return { efectivoRecibido, transferencia };
    };
    const _actualizarRestanteMixto = () => {
      // Mismo tope que el cierre de caja — evita registrar un pago con un
      // monto absurdo si se teclea de más por error.
      const valorTecleado = parseFloat(mixtoEfInp?.value);
      if (mixtoEfInp && !isNaN(valorTecleado) && valorTecleado > _CC_MAX) mixtoEfInp.value = _CC_MAX;
      const SC     = window.SC;
      const pedido = SC.leerCaja().find(p => String(p.id) === String(_pedidoParaCobrar));
      if (!pedido || !mixtoRestEl) return;
      const { efectivoRecibido, transferencia } = _restanteMixto(pedido);
      if (mixtoTrMonto) mixtoTrMonto.textContent = `$${transferencia.toFixed(2)}`;
      if (efectivoRecibido <= 0) { mixtoRestEl.textContent = ''; return; }
      if (efectivoRecibido >= pedido.total) {
        mixtoRestEl.textContent = 'Ya cubre todo — usa el método "Efectivo" en vez de mixto';
        mixtoRestEl.style.color = '#dc2626';
      } else {
        mixtoRestEl.textContent = '✓ Listo para cobrar';
        mixtoRestEl.style.color = '#15803d';
      }
    };
    mixtoEfInp?.addEventListener('input', _actualizarRestanteMixto);
    mixtoEfInp?.addEventListener('keydown', e => { if (e.key === 'Enter') btnConfirmarPago?.click(); });

    const correoCheckbox = document.getElementById('pago-enviar-correo');
    const correoInput    = document.getElementById('pago-correo-input');
    if (correoCheckbox) {
      correoCheckbox.addEventListener('change', () => {
        // Si el correo ya viene de una cuenta registrada no hay nada que
        // escribir — el campo de texto solo aplica al flujo de invitado.
        if (correoCheckbox.dataset.registrado === 'true') return;
        if (correoInput) {
          correoInput.style.display = correoCheckbox.checked ? '' : 'none';
          if (correoCheckbox.checked) correoInput.focus();
        }
      });
    }

    if (montoRecibidoInp) {
      montoRecibidoInp.addEventListener('input', () => {
        // Mismo tope que el cierre de caja — evita números absurdos
        // ("Cambio: $1.23e+30") si se teclea de más por error.
        const valor = parseFloat(montoRecibidoInp.value);
        if (!isNaN(valor) && valor > _CC_MAX) montoRecibidoInp.value = _CC_MAX;
        const SC     = window.SC;
        const pedido = SC.leerCaja().find(p => String(p.id) === String(_pedidoParaCobrar));
        if (!pedido || !cambioDisp) return;
        const monto  = parseFloat(montoRecibidoInp.value) || 0;
        const cambio = monto - pedido.total;
        cambioDisp.textContent = monto > 0 ? `Cambio: $${Math.max(0, cambio).toFixed(2)}` : '';
        cambioDisp.style.color = cambio >= 0 ? '#15803d' : '#dc2626';
      });
      montoRecibidoInp.addEventListener('keydown', e => {
        if (e.key === 'Enter') btnConfirmarPago?.click();
      });
    }

    if (btnConfirmarPago) {
      btnConfirmarPago.addEventListener('click', async () => {
        const SC = window.SC;
        const pedido = SC.leerCaja().find(p => String(p.id) === String(_pedidoParaCobrar));
        if (!pedido) return;

        const metodoPagoId     = document.querySelector('input[name="metodo-pago"]:checked')?.value || 'met001';
        const esMixto          = metodoPagoId === 'mixto';
        let metodoPagoNombre   = METODO_NOMBRE[metodoPagoId] || 'Efectivo';

        let montoPagado = pedido.total;
        let cambio      = 0;
        let pagosMixtos = null;
        if (metodoPagoId === 'met001') {
          montoPagado = parseFloat(montoRecibidoInp?.value) || 0;
          if (montoPagado < pedido.total) {
            SC.toast('El monto recibido es menor al total', 'error');
            montoRecibidoInp?.focus();
            return;
          }
          if (montoPagado > _CC_MAX) {
            SC.toast(`Ese monto es demasiado grande — máximo $${_CC_MAX}.`, 'error');
            montoRecibidoInp?.focus();
            return;
          }
          cambio = Math.max(0, montoPagado - pedido.total);
        } else if (esMixto) {
          const { efectivoRecibido, transferencia } = _restanteMixto(pedido);
          if (efectivoRecibido <= 0) {
            SC.toast('Ingresa cuánto pagó en efectivo.', 'error');
            mixtoEfInp?.focus();
            return;
          }
          if (efectivoRecibido > _CC_MAX) {
            SC.toast(`Ese monto es demasiado grande — máximo $${_CC_MAX}.`, 'error');
            mixtoEfInp?.focus();
            return;
          }
          if (efectivoRecibido >= pedido.total) {
            SC.toast('El efectivo ya cubre todo el total — usa el método "Efectivo" en vez de mixto.', 'error');
            mixtoEfInp?.focus();
            return;
          }
          pagosMixtos = [
            { metodoId: 'met001', monto: efectivoRecibido, cambio: 0 },
            { metodoId: 'met004', monto: transferencia, cambio: 0 }
          ];
          montoPagado = pedido.total;
          cambio = 0;
          metodoPagoNombre = `Mixto (Efectivo $${efectivoRecibido.toFixed(2)} + Transferencia $${transferencia.toFixed(2)})`;
        }

        // Correo para la nota: siempre depende del checkbox — si está
        // desmarcado no se manda, sin importar si el cliente es registrado
        // o invitado.
        const usuarioReg = pedido.idUsuario
          ? window.ModuloAutenticacion?.leerUsuarios().find(u => u.id === pedido.idUsuario)
          : null;
        const correoCheckbox = document.getElementById('pago-enviar-correo');
        const correoInput    = document.getElementById('pago-correo-input');
        let email = null;
        if (correoCheckbox?.checked) {
          if (usuarioReg?.email) {
            email = usuarioReg.email;
          } else {
            const val = correoInput?.value.trim();
            if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) {
              SC.toast('Ingresa un correo electrónico válido', 'error');
              correoInput?.focus();
              return;
            }
            email = val;
          }
        }

        btnConfirmarPago.disabled    = true;
        btnConfirmarPago.textContent = 'Procesando…';
        // A partir de acá ya no se debe deshacer una división pendiente
        // aunque el cobro falle — el cajero puede reintentar desde la
        // misma tarjeta, que sigue existiendo tal cual.
        _cobroFueIntentado = true;

        const resultado = await SC.cobrarPedido(String(_pedidoParaCobrar), metodoPagoId, montoPagado, cambio, email, pagosMixtos);

        btnConfirmarPago.disabled    = false;
        btnConfirmarPago.textContent = '✓ Cobrar';
        cerrarModalPago();

        if (resultado) {
          _ultimoCobro = { pedido: resultado.pedido, factNumero: resultado.factNumero, metodoPagoNombre, montoPagado, cambio };
          renderCajeroView();
          window.VistaAdmin?.renderAdminPedidos?.();
          abrirPostCobro(resultado.pedido, resultado.factNumero, metodoPagoNombre, montoPagado, cambio);
          if (email) enviarNotaVentaPorCorreo(resultado.pedido, resultado.factNumero, metodoPagoNombre, null, email);
        } else {
          SC.toast('Error al cobrar el pedido', 'error');
        }
      });
    }

    /* ── Modal post-cobro ── */
    function abrirPostCobro(pedido, factNumero, metodoPagoNombre, montoPagado, cambio) {
      const backdrop = document.getElementById('postcobro-backdrop');
      const infoEl   = document.getElementById('postcobro-info');
      if (infoEl) {
        infoEl.innerHTML = `<strong>${factNumero}</strong> · Mesa ${pedido.mesa}<br>
          Método: ${metodoPagoNombre}${metodoPagoNombre==='Efectivo'?` · Cambio: <strong>$${cambio.toFixed(2)}</strong>`:''}`;
      }
      if (backdrop) {
        backdrop.classList.add('open');
        backdrop.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = document.documentElement.style.overflow = 'hidden';
      }
      window.SC.toast(`Pedido cobrado ✓ — ${metodoPagoNombre}`, 'success');
    }

    function cerrarPostCobro() {
      const backdrop = document.getElementById('postcobro-backdrop');
      if (backdrop) {
        backdrop.classList.remove('open');
        backdrop.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = document.documentElement.style.overflow = '';
      }
    }

    const btnCerrarPost  = document.getElementById('btn-cerrar-postcobro');
    const btnCerrarPost2 = document.getElementById('btn-cerrar-postcobro2');
    const postBackdrop   = document.getElementById('postcobro-backdrop');
    if (btnCerrarPost)  btnCerrarPost.addEventListener('click',  cerrarPostCobro);
    if (btnCerrarPost2) btnCerrarPost2.addEventListener('click', cerrarPostCobro);
    // postBackdrop: solo cerrar con botón X

    document.getElementById('btn-imprimir-recibo')?.addEventListener('click', () => {
      if (_ultimoCobro) {
        imprimirRecibo(_ultimoCobro.pedido, _ultimoCobro.factNumero, _ultimoCobro.metodoPagoNombre, _ultimoCobro.montoPagado, _ultimoCobro.cambio);
      }
    });

    document.getElementById('btn-imprimir-sri')?.addEventListener('click', () => {
      if (_ultimoCobro) {
        imprimirNotaVenta(_ultimoCobro.pedido, _ultimoCobro.factNumero, _ultimoCobro.metodoPagoNombre);
      }
    });

    /* ── Modal enviar nota por correo ── */
    const correoNotaBackdrop  = document.getElementById('correo-nota-modal-backdrop');
    const btnCerrarCorreoNota = document.getElementById('btn-cerrar-correo-nota-modal');
    const btnCancelarCorreoNota = document.getElementById('btn-cancelar-correo-nota');
    const btnConfirmarCorreoNota = document.getElementById('btn-confirmar-correo-nota');
    const correoNotaInput = document.getElementById('correo-nota-input');
    const correoNotaError = document.getElementById('correo-nota-error');

    if (btnCerrarCorreoNota)   btnCerrarCorreoNota.addEventListener('click', _cerrarModalCorreoNota);
    if (btnCancelarCorreoNota) btnCancelarCorreoNota.addEventListener('click', _cerrarModalCorreoNota);
    if (correoNotaInput) {
      correoNotaInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') btnConfirmarCorreoNota?.click();
      });
    }
    if (btnConfirmarCorreoNota) {
      btnConfirmarCorreoNota.addEventListener('click', async () => {
        const SC = window.SC;
        if (!_correoNotaCtx) return;
        const email = correoNotaInput?.value.trim() ?? '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          if (correoNotaError) { correoNotaError.textContent = 'Ingresa un correo electrónico válido.'; correoNotaError.style.display = 'block'; }
          correoNotaInput?.focus();
          return;
        }
        const { pedido, factNumero, metodoPagoNombre, fechaCobro } = _correoNotaCtx;
        btnConfirmarCorreoNota.disabled    = true;
        btnConfirmarCorreoNota.textContent = 'Enviando…';
        const ok = await enviarNotaVentaPorCorreo(pedido, factNumero, metodoPagoNombre, fechaCobro, email);
        btnConfirmarCorreoNota.disabled    = false;
        btnConfirmarCorreoNota.textContent = '✉️ Enviar';
        if (ok) _cerrarModalCorreoNota();
      });
    }

    /* ── Modal Dividir cuenta ── */
    const dividirLista        = document.getElementById('dividir-cuenta-lista');
    const btnCerrarDividir    = document.getElementById('btn-close-dividir-cuenta');
    const btnConfirmarDividir = document.getElementById('btn-confirmar-dividir-cuenta');
    const dividirErrEl        = document.getElementById('dividir-cuenta-error');

    if (btnCerrarDividir) btnCerrarDividir.addEventListener('click', cerrarModalDividirCuenta);
    // backdrop: solo se cierra con el botón X, mismo criterio que el modal de pago.

    const _pedidoEnDivision = () => window.SC.leerCaja().find(p => String(p.id) === String(_pedidoParaDividir));

    if (dividirLista) {
      dividirLista.addEventListener('click', e => {
        const btn = e.target.closest('.dividir-stepper-btn');
        if (!btn) return;
        const row   = btn.closest('.dividir-item');
        const input = row?.querySelector('.dividir-item__input');
        if (!input) return;
        const max = parseInt(row.dataset.max, 10) || 0;
        let val = (parseInt(input.value, 10) || 0) + (btn.dataset.dir === '1' ? 1 : -1);
        input.value = Math.max(0, Math.min(max, val));
        const pedido = _pedidoEnDivision();
        if (pedido) _actualizarResumenDividir(pedido);
      });
      dividirLista.addEventListener('input', e => {
        if (!e.target.classList.contains('dividir-item__input')) return;
        const row = e.target.closest('.dividir-item');
        const max = parseInt(row?.dataset.max, 10) || 0;
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 0) val = 0;
        if (val > max) val = max;
        e.target.value = val;
        const pedido = _pedidoEnDivision();
        if (pedido) _actualizarResumenDividir(pedido);
      });
    }

    if (btnConfirmarDividir) {
      btnConfirmarDividir.addEventListener('click', async () => {
        const SC = window.SC;
        const pedido = _pedidoEnDivision();
        if (!pedido) return;
        const { seleccion } = _actualizarResumenDividir(pedido);
        if (!seleccion.length) return;

        if (dividirErrEl) { dividirErrEl.textContent = ''; dividirErrEl.style.display = 'none'; }
        btnConfirmarDividir.disabled = true;
        btnConfirmarDividir.textContent = 'Dividiendo…';

        const nuevoPedId = await SC.dividirPedido(pedido.id, seleccion);

        btnConfirmarDividir.disabled = false;
        btnConfirmarDividir.textContent = '✓ Cobrar esta parte';
        if (!nuevoPedId) return; // el error ya se mostró vía toast dentro de dividirPedido

        cerrarModalDividirCuenta();
        await SC.recargarCaja();
        renderCajeroView();
        window.VistaAdmin?.renderAdminPedidos?.();
        // Si cancela el cobro de esta parte (en vez de completarlo), hay
        // que regresarla al pedido original — ver cerrarModalPago().
        _divisionPendiente = { nuevoPedId, padreId: pedido.id };
        abrirModalPago(nuevoPedId);
      });
    }
  }

  return {
    renderCajeroView, renderResumenDia, renderGastos, renderStock, init,
    imprimirNotaVenta, enviarNotaVentaPorCorreo, abrirModalCorreoNota
  };
})();
