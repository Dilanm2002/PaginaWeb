'use strict';
/**
 * vista-cajero.js — Vista del panel de caja.
 * Depende de window.SC (API compartida) y DOM de cajero-view.
 */
window.VistaCajero = (function () {

  const MAX_STOCK = 20;
  let _diaOffset = 0;
  let _pedidoParaCobrar = null;
  let _ultimoCobro = null; // { pedido, factNumero, metodoPagoNombre, montoPagado, cambio }
  let _correoNotaCtx = null; // { pedido, factNumero, metodoPagoNombre, fechaCobro }

  const METODO_NOMBRE = {
    met001: 'Efectivo',
    met002: 'Tarjeta de crédito',
    met003: 'Tarjeta de débito',
    met004: 'Transferencia'
  };

  function _getFecha(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('es-EC', { year:'numeric', month:'2-digit', day:'2-digit' });
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
              <td>${SC.escapeHtml(h.nombreUsuario)}</td>
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
                <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--cinnamon);color:#fff;font-size:.65rem;font-weight:800;flex-shrink:0">${(h.nombreUsuario || '?').charAt(0).toUpperCase()}</span>
                ${SC.escapeHtml(h.nombreUsuario)}
              </div>
              <div class="resumen-card__items">
                ${Array.isArray(h.items) ? h.items.map(i => `
                  <div class="resumen-card__item-row">
                    <span class="resumen-card__item-qty">${i.cantidad}×</span>
                    <span>${i.nombre}${i.exclusiones?.length ? `<span class="cajero-excl">sin: ${i.exclusiones.map(e => typeof e === 'string' ? e : e.nombre).join(', ')}</span>` : ''}</span>
                  </div>`).join('') : ''}
              </div>
              <div class="resumen-card__hora">${new Date(h.cobradoEn).toLocaleTimeString('es-EC', {hour:'2-digit', minute:'2-digit'})}</div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  function renderGastos() {
    const SC = window.SC;
    const fecha = _getFecha(_diaOffset);
    const gastos    = SC.leerGastos().filter(g => g.fecha === fecha);
    const historial = SC.leerHistorial().filter(h => h.fecha === fecha);

    const formEl = document.querySelector('.gastos-form');
    if (formEl) formEl.style.display = _diaOffset !== 0 ? 'none' : '';

    const totalVentas = historial.reduce((s,h) => s + h.total, 0);
    const totalGastos = gastos.reduce((s,g) => s + g.monto, 0);
    const ganancia    = totalVentas - totalGastos;

    const resumenEl = document.getElementById('gastos-resumen');
    const listaEl   = document.getElementById('gastos-lista');
    if (!resumenEl || !listaEl) return;

    resumenEl.innerHTML = `
      <div class="gastos-kpi">
        <div class="gastos-kpi__lbl">Ingresos del día</div>
        <div class="gastos-kpi__val neutral">$${totalVentas.toFixed(2)}</div>
      </div>
      <div class="gastos-kpi">
        <div class="gastos-kpi__lbl">Gastos del día</div>
        <div class="gastos-kpi__val red">$${totalGastos.toFixed(2)}</div>
      </div>
      <div class="gastos-kpi">
        <div class="gastos-kpi__lbl">Ganancia neta</div>
        <div class="gastos-kpi__val ${ganancia >= 0 ? 'green' : 'red'}">$${ganancia.toFixed(2)}</div>
      </div>`;

    const gastosRev = [...gastos].reverse();
    listaEl.innerHTML = `
      <table class="gastos-tabla">
        <thead>
          <tr>
            <th>Descripción</th><th>Fecha</th><th>Hora</th>
            <th style="text-align:right">Monto</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${!gastosRev.length
            ? `<tr><td colspan="5" class="gastos-empty" style="text-align:center;padding:.9rem 0">No hay gastos registrados este día.</td></tr>`
            : gastosRev.map(g => `
            <tr>
              <td class="td-desc">${SC.escapeHtml(g.descripcion)}</td>
              <td class="td-hora">${g.fecha}</td>
              <td class="td-hora">${g.hora}</td>
              <td class="td-monto">−$${g.monto.toFixed(2)}</td>
              <td class="td-del"><button class="gasto-del-btn" data-del-id="${g.id}">🗑️ Eliminar</button></td>
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
          <div class="mesero-cat-title collapsed" data-cat="${cat}" role="button" tabindex="0" aria-expanded="false">
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

  function updatePedidoDisplay(pid, items) {
    const SC = window.SC;
    items.forEach((it, idx) => {
      const qEl = document.getElementById(`qty-${pid}-${idx}`);
      const pEl = document.getElementById(`item-price-${pid}-${idx}`);
      if (qEl) qEl.textContent = it.cantidad;
      if (pEl) pEl.textContent = `$${((it.precio || 0) * (it.cantidad || 0)).toFixed(2)}`;
    });
    const total   = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const totalEl = document.getElementById(`card-total-${pid}`);
    if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
    /* actualizar el total global del header */
    const allPedidos  = SC.leerCaja();
    const totalGlobal = allPedidos.reduce((s, p) => s + p.total, 0);
    const statTotal   = document.getElementById('stat-total');
    if (statTotal) statTotal.textContent = `$${totalGlobal.toFixed(2)}`;
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
          </div>
          <div class="cajero-order-time">🕐 ${p.hora}</div>
        </div>
        <div class="cajero-order-items">
          ${items.map((it, idx) => `
            <div class="cajero-order-item">
              <span class="cajero-order-item__name">${it.nombre}${it.exclusiones?.length ? `<span class="cajero-excl"> sin: ${it.exclusiones.map(e => typeof e === 'string' ? e : e.nombre).join(', ')}</span>` : ''}</span>
              <div class="caj-qty">
                <button class="caj-qty__btn" data-pid="${p.id}" data-idx="${idx}" data-action="dec">−</button>
                <span class="caj-qty__val" id="qty-${p.id}-${idx}">${it.cantidad}</span>
                <button class="caj-qty__btn" data-pid="${p.id}" data-idx="${idx}" data-action="inc">+</button>
              </div>
              <span class="cajero-order-item__price" id="item-price-${p.id}-${idx}">$${((it.precio || 0) * (it.cantidad || 0)).toFixed(2)}</span>
              <button class="caj-del" data-pid="${p.id}" data-idx="${idx}" title="Eliminar ítem">✕</button>
            </div>
          `).join('')}
          ${!items.length ? '<p style="color:var(--text-muted);font-size:.85rem;padding:.25rem 0">Sin detalle de ítems</p>' : ''}
        </div>
        <div class="cajero-order-subtotals">
          <div class="total-line"><span>Total</span><span id="card-total-${p.id}">$${total.toFixed(2)}</span></div>
        </div>
        <div class="cajero-order-card__foot" style="gap:.5rem">
          <button class="btn-cobrar" data-pedido-id="${p.id}" style="flex:2">Cobrado ✓</button>
          <button class="btn-anular" data-pedido-id="${p.id}" style="flex:1">Anular</button>
        </div>
      </div>`;
    }).join('');

    cajeroGrid.onclick = async e => {
      const btnCobrar = e.target.closest('.btn-cobrar');
      if (btnCobrar) {
        abrirModalPago(btnCobrar.dataset.pedidoId);
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
        if (ok) renderCajeroView();
        else btnAnular.disabled = false;
        return;
      }
      const btnDel = e.target.closest('.caj-del');
      if (btnDel) {
        const pid = btnDel.dataset.pid;
        const idx = Number(btnDel.dataset.idx);
        const peds = SC.leerCaja();
        const ped = peds.find(p => String(p.id) === String(pid));
        if (!ped || !Array.isArray(ped.items)) return;
        ped.items.splice(idx, 1);
        SC.actualizarPedido(pid, ped.items);
        renderCajeroView();
        return;
      }
      const btnQty = e.target.closest('.caj-qty__btn');
      if (btnQty) {
        const pid    = btnQty.dataset.pid;
        const idx    = Number(btnQty.dataset.idx);
        const action = btnQty.dataset.action;
        const peds   = SC.leerCaja();
        const ped    = peds.find(p => String(p.id) === String(pid));
        if (!ped || !Array.isArray(ped.items) || !ped.items[idx]) return;
        if (action === 'inc') {
          const s = SC.getStock(ped.items[idx].id);
          if (ped.items[idx].cantidad >= s.stock) {
            SC.toast(`Stock máximo: ${s.stock} unidades`, 'error');
            return;
          }
        }
        ped.items[idx].cantidad += action === 'inc' ? 1 : -1;
        if (ped.items[idx].cantidad <= 0) {
          ped.items.splice(idx, 1);
          SC.actualizarPedido(pid, ped.items);
          renderCajeroView();
          return;
        }
        SC.actualizarPedido(pid, ped.items);
        updatePedidoDisplay(pid, ped.items);
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
      return;
    }

    const _hora = h => h.cobradoEn ? new Date(h.cobradoEn).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) : '—';
    const _acciones = h => `
      <div style="display:flex;gap:.6rem">
        <button class="btn-cobrado-nota" data-hid="${h.id}">🖨️ Imprimir</button>
        <button class="btn-cobrado-correo" data-hid="${h.id}">✉️ Enviar</button>
      </div>`;

    wrap.innerHTML = `
      <table class="resumen-tabla">
        <thead>
          <tr><th>Mesa</th><th>Cliente</th><th>Hora</th><th style="text-align:right">Total</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          ${cobrados.map(h => `
            <tr>
              <td><strong>${h.paraLlevar || h.mesa === 'Para llevar' ? '🛍 Para llevar' : `Mesa ${h.mesa}`}</strong></td>
              <td>${SC.escapeHtml(h.nombreUsuario)}</td>
              <td class="td-hora">${_hora(h)}</td>
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
              <div class="resumen-card__cliente">${SC.escapeHtml(h.nombreUsuario)}</div>
              <div class="resumen-card__hora">${_hora(h)}</div>
              <div style="display:flex;gap:.5rem;margin-top:.5rem">${_acciones(h)}</div>
            </div>
          </div>`).join('')}
      </div>`;

    wrap.querySelectorAll('.btn-cobrado-nota').forEach(btn => {
      btn.onclick = () => {
        const h = cobrados.find(x => String(x.id) === String(btn.dataset.hid));
        if (!h) return;
        imprimirNotaVenta(h, h.factNumero || 'FACT-000000', h.metodoPagoNombre || 'Efectivo', h.cobradoEn);
      };
    });

    wrap.querySelectorAll('.btn-cobrado-correo').forEach(btn => {
      btn.onclick = () => {
        const h = cobrados.find(x => String(x.id) === String(btn.dataset.hid));
        if (!h) return;
        abrirModalCorreoNota(h, h.factNumero || 'FACT-000000', h.metodoPagoNombre || 'Efectivo', h.cobradoEn, h.factEmail || '');
      };
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
      document.body.style.overflow = 'hidden';
      setTimeout(() => input?.focus(), 100);
    }
  }

  function _cerrarModalCorreoNota() {
    const backdrop = document.getElementById('correo-nota-modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
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

    const totalDisp = document.getElementById('pago-total-display');
    const montoInp  = document.getElementById('pago-monto-recibido');
    const cambioEl  = document.getElementById('pago-cambio-display');
    const efectivoSec = document.getElementById('pago-efectivo-section');

    if (totalDisp) totalDisp.innerHTML = `Total a cobrar: <strong>$${pedido.total.toFixed(2)}</strong>`;
    if (montoInp)  { montoInp.value = ''; montoInp.min = pedido.total.toFixed(2); }
    if (cambioEl)  cambioEl.textContent = '';

    const radioEfectivo = document.querySelector('input[name="metodo-pago"][value="met001"]');
    if (radioEfectivo) radioEfectivo.checked = true;
    if (efectivoSec) efectivoSec.style.display = '';

    // Correo para la Nota de Venta: si el pedido es de un usuario registrado,
    // se usa su correo automáticamente (sin preguntar); si es invitado, se
    // ofrece un checkbox opcional para pedirlo.
    const correoCheckbox   = document.getElementById('pago-enviar-correo');
    const correoCheckboxLb = correoCheckbox?.closest('label');
    const correoInput      = document.getElementById('pago-correo-input');
    const correoRegistrado = document.getElementById('pago-correo-registrado');
    const usuarioReg = pedido.idUsuario
      ? window.ModuloAutenticacion?.leerUsuarios().find(u => u.id === pedido.idUsuario)
      : null;

    if (correoCheckbox) correoCheckbox.checked = false;
    if (correoInput)    { correoInput.value = ''; correoInput.style.display = 'none'; }

    if (usuarioReg?.email) {
      if (correoCheckboxLb) correoCheckboxLb.style.display = 'none';
      if (correoRegistrado) {
        correoRegistrado.style.display = '';
        correoRegistrado.textContent = `📧 Se enviará la nota de venta a ${usuarioReg.email}`;
      }
    } else {
      if (correoCheckboxLb) correoCheckboxLb.style.display = '';
      if (correoRegistrado) correoRegistrado.style.display = 'none';
    }

    const backdrop = document.getElementById('pago-modal-backdrop');
    if (backdrop) {
      backdrop.classList.add('open');
      backdrop.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      setTimeout(() => montoInp?.focus(), 100);
    }
  }

  function cerrarModalPago() {
    const backdrop = document.getElementById('pago-modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
    _pedidoParaCobrar = null;
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
<tbody>${items.map(i=>`<tr>
<td>${i.nombre}${i.exclusiones?.length?`<br><span class="excl">sin: ${i.exclusiones.map(e => typeof e === 'string' ? e : e.nombre).join(', ')}</span>`:''}
</td><td class="tr">${i.cantidad}</td><td class="tr">${i.precio.toFixed(2)}</td>
<td class="tr">${(i.precio*i.cantidad).toFixed(2)}</td></tr>`).join('')}</tbody>
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
<tbody>${items.map((i,idx)=>`<tr>
  <td class="tc">${idx+1}</td>
  <td>${i.nombre}${i.exclusiones?.length?` <em>(sin: ${i.exclusiones.map(e => typeof e === 'string' ? e : e.nombre).join(', ')})</em>`:''}</td>
  <td class="tc">${i.cantidad}</td>
  <td class="tr">$${i.precio.toFixed(2)}</td>
  <td class="tr">$${(i.precio*i.cantidad).toFixed(2)}</td>
</tr>`).join('')}</tbody>
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

    if (btnCerrarPago)  btnCerrarPago.addEventListener('click',  cerrarModalPago);
    if (btnCancelarPago) btnCancelarPago.addEventListener('click', cerrarModalPago);
    // pagoBackdrop: solo cerrar con botón X o Cancelar

    document.querySelectorAll('input[name="metodo-pago"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (efectivoSec) efectivoSec.style.display = radio.value === 'met001' ? '' : 'none';
        if (cambioDisp)  cambioDisp.textContent = '';
      });
    });

    const correoCheckbox = document.getElementById('pago-enviar-correo');
    const correoInput    = document.getElementById('pago-correo-input');
    if (correoCheckbox) {
      correoCheckbox.addEventListener('change', () => {
        if (correoInput) {
          correoInput.style.display = correoCheckbox.checked ? '' : 'none';
          if (correoCheckbox.checked) correoInput.focus();
        }
      });
    }

    if (montoRecibidoInp) {
      montoRecibidoInp.addEventListener('input', () => {
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
        const metodoPagoNombre = METODO_NOMBRE[metodoPagoId] || 'Efectivo';

        let montoPagado = pedido.total;
        let cambio      = 0;
        if (metodoPagoId === 'met001') {
          montoPagado = parseFloat(montoRecibidoInp?.value) || 0;
          if (montoPagado < pedido.total) {
            SC.toast('El monto recibido es menor al total', 'error');
            montoRecibidoInp?.focus();
            return;
          }
          cambio = Math.max(0, montoPagado - pedido.total);
        }

        // Correo para la nota: automático si el cliente está registrado,
        // opcional (checkbox + input) si es invitado.
        const usuarioReg = pedido.idUsuario
          ? window.ModuloAutenticacion?.leerUsuarios().find(u => u.id === pedido.idUsuario)
          : null;
        const correoCheckbox = document.getElementById('pago-enviar-correo');
        const correoInput    = document.getElementById('pago-correo-input');
        let email = usuarioReg?.email || null;
        if (!email && correoCheckbox?.checked) {
          const val = correoInput?.value.trim();
          if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) {
            SC.toast('Ingresa un correo electrónico válido', 'error');
            correoInput?.focus();
            return;
          }
          email = val;
        }

        btnConfirmarPago.disabled    = true;
        btnConfirmarPago.textContent = 'Procesando…';

        const resultado = await SC.cobrarPedido(String(_pedidoParaCobrar), metodoPagoId, montoPagado, cambio, email);

        btnConfirmarPago.disabled    = false;
        btnConfirmarPago.textContent = '✓ Cobrar';
        cerrarModalPago();

        if (resultado) {
          _ultimoCobro = { pedido: resultado.pedido, factNumero: resultado.factNumero, metodoPagoNombre, montoPagado, cambio };
          renderCajeroView();
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
        document.body.style.overflow = 'hidden';
      }
      window.SC.toast(`Pedido cobrado ✓ — ${metodoPagoNombre}`, 'success');
    }

    function cerrarPostCobro() {
      const backdrop = document.getElementById('postcobro-backdrop');
      if (backdrop) {
        backdrop.classList.remove('open');
        backdrop.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
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
  }

  return {
    renderCajeroView, renderResumenDia, renderGastos, renderStock, init,
    imprimirNotaVenta, enviarNotaVentaPorCorreo, abrirModalCorreoNota
  };
})();
