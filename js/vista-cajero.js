'use strict';
/**
 * vista-cajero.js — Vista del panel de caja.
 * Depende de window.SC (API compartida) y DOM de cajero-view.
 */
window.VistaCajero = (function () {

  function renderResumenDia() {
    const SC = window.SC;
    const hoy = new Date().toLocaleDateString('es-EC', { year:'numeric', month:'2-digit', day:'2-digit' });
    const historial = SC.leerHistorial().filter(h => h.fecha === hoy);
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
        <div class="resumen-kpi__lbl">Total vendido hoy</div>
      </div>`;

    if (!historial.length) {
      tablaEl.innerHTML = `<p class="resumen-empty">Aún no se han cobrado pedidos hoy.</p>`;
      return;
    }

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
          ${filas.map(h => `
            <tr>
              <td><strong>Mesa ${h.mesa}</strong></td>
              <td>${h.nombreUsuario}</td>
              <td>${h.items.map(i => `${i.cantidad}× ${i.nombre}`).join(', ')}</td>
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
              <span class="resumen-card__mesa">Mesa ${h.mesa}</span>
              <span class="resumen-card__total">$${h.total.toFixed(2)}</span>
            </div>
            <div class="resumen-card__body">
              <div class="resumen-card__cliente">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--cinnamon);color:#fff;font-size:.65rem;font-weight:800;flex-shrink:0">${h.nombreUsuario.charAt(0).toUpperCase()}</span>
                ${h.nombreUsuario}
              </div>
              <div class="resumen-card__items">
                ${h.items.map(i => `
                  <div class="resumen-card__item-row">
                    <span class="resumen-card__item-qty">${i.cantidad}×</span>
                    <span>${i.nombre}</span>
                  </div>`).join('')}
              </div>
              <div class="resumen-card__hora">${new Date(h.cobradoEn).toLocaleTimeString('es-EC', {hour:'2-digit', minute:'2-digit'})}</div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  function renderGastos() {
    const SC = window.SC;
    const hoy = new Date().toLocaleDateString('es-EC', { year:'numeric', month:'2-digit', day:'2-digit' });
    const gastos    = SC.leerGastos().filter(g => g.fecha === hoy);
    const historial = SC.leerHistorial().filter(h => h.fecha === hoy);

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

    if (!gastos.length) {
      listaEl.innerHTML = `<p class="gastos-empty">No hay gastos registrados hoy.</p>`;
      return;
    }
    listaEl.innerHTML = `
      <table class="gastos-tabla">
        <thead>
          <tr>
            <th>Descripción</th><th>Fecha</th><th>Hora</th>
            <th style="text-align:right">Monto</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${[...gastos].reverse().map(g => `
            <tr>
              <td class="td-desc">${g.descripcion}</td>
              <td class="td-hora">${g.fecha}</td>
              <td class="td-hora">${g.hora}</td>
              <td class="td-monto">−$${g.monto.toFixed(2)}</td>
              <td class="td-del"><button class="gasto-del-btn" data-del-id="${g.id}" aria-label="Eliminar gasto">✕</button></td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    listaEl.querySelectorAll('.gasto-del-btn').forEach(btn => {
      btn.onclick = () => {
        const id = Number(btn.dataset.delId);
        SC.guardarGastos(SC.leerGastos().filter(g => g.id !== id));
        renderGastos();
      };
    });
  }

  function renderStock() {
    const SC = window.SC;
    const listaEl = document.getElementById('stock-lista');
    if (!listaEl) return;
    const productos = SC.getProductosMergeados();
    const MAX_STOCK = 20;

    listaEl.innerHTML = productos.map(p => {
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
                <input class="stock-input" type="number" min="0" value="${qty}" data-id="${p.id}" data-original="${qty}" aria-label="Nuevo stock de ${p.nombre}">
                <button class="stock-btn stock-btn--set" data-action="set" data-id="${p.id}">Guardar</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    listaEl.querySelectorAll('.stock-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const original = parseInt(inp.dataset.original) || 0;
        const nuevo    = parseInt(inp.value) || 0;
        inp.style.borderColor = nuevo > original ? '#16a34a' : nuevo < original ? '#dc2626' : '';
        inp.style.color       = nuevo > original ? '#16a34a' : nuevo < original ? '#dc2626' : '';
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') inp.closest('.stock-row')?.querySelector('.stock-btn--set')?.click();
      });
    });

    listaEl.onclick = async e => {
      const btn = e.target.closest('.stock-btn');
      if (!btn) return;
      const id  = Number(btn.dataset.id);
      const act = btn.dataset.action;
      const row = listaEl.querySelector(`.stock-row[data-id="${id}"]`);
      const inp = row?.querySelector('.stock-input');

      if (act === 'set') {
        const nuevo  = Math.max(0, parseInt(inp?.value) || 0);
        const actual = SC.getStock(id).stock;
        const diff   = nuevo - actual;
        if (diff > 0)      await SC.reponerStock(id, diff);
        else if (diff < 0) await SC.actualizarStock(id, Math.abs(diff));
      }
      renderStock();
      const cat = SC.getFiltroSesion();
      window.VistaMenu?.renderProductos(window.VistaMenu?.getListaByCat(cat));
    };
  }

  function renderCajeroView() {
    const SC = window.SC;
    const pedidos        = SC.leerCaja();
    const totalPorCobrar = pedidos.reduce((s,p) => s + p.total, 0);

    const statPedidos = document.getElementById('stat-pedidos');
    const statTotal   = document.getElementById('stat-total');
    const cajeroGrid  = document.getElementById('cajero-grid');
    const cajaBadge   = document.getElementById('caja-count-btn');

    if (statPedidos) statPedidos.textContent = pedidos.length;
    if (statTotal)   statTotal.textContent   = `$${totalPorCobrar.toFixed(2)}`;
    renderResumenDia();
    renderGastos();
    renderStock();

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
      return;
    }

    const IVA       = SC.IVA;
    const ROL_LABEL = SC.ROL_LABEL;

    cajeroGrid.innerHTML = pedidos.map(p => {
      const subtotal = p.items.reduce((s,i) => s + i.precio * i.cantidad, 0);
      const iva      = subtotal * IVA;
      const total    = subtotal + iva;
      return `
      <div class="cajero-order-card" role="listitem" data-pid="${p.id}">
        <div class="cajero-order-card__head">
          <div class="cajero-order-meta">
            <div class="cajero-order-mesa">🪑 Mesa ${p.mesa}</div>
            <div class="cajero-order-quien">
              <span class="rol-pill ${p.rol}">${ROL_LABEL[p.rol] ?? p.rol}</span>
              ${p.nombreUsuario}
            </div>
          </div>
          <div class="cajero-order-time">🕐 ${p.hora}</div>
        </div>
        <div class="cajero-order-items">
          ${p.items.map((it, idx) => `
            <div class="cajero-order-item">
              <span class="cajero-order-item__name">${it.nombre}</span>
              <div class="caj-qty">
                <button class="caj-qty__btn" data-pid="${p.id}" data-idx="${idx}" data-action="dec">−</button>
                <span class="caj-qty__val">${it.cantidad}</span>
                <button class="caj-qty__btn" data-pid="${p.id}" data-idx="${idx}" data-action="inc">+</button>
              </div>
              <span class="cajero-order-item__price">$${(it.precio * it.cantidad).toFixed(2)}</span>
              <button class="caj-del" data-pid="${p.id}" data-idx="${idx}" title="Eliminar ítem">✕</button>
            </div>
          `).join('')}
        </div>
        <div class="cajero-order-subtotals">
          <div><span>Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>
          <div class="iva-line"><span>IVA 15 %</span><span>$${iva.toFixed(2)}</span></div>
          <div class="total-line"><span>Total</span><span>$${total.toFixed(2)}</span></div>
        </div>
        <div class="cajero-order-card__foot">
          <button class="btn-cobrar" data-pedido-id="${p.id}">Cobrado ✓</button>
        </div>
      </div>`;
    }).join('');

    cajeroGrid.onclick = e => {
      const btnCobrar = e.target.closest('.btn-cobrar');
      if (btnCobrar) {
        SC.cobrarPedido(Number(btnCobrar.dataset.pedidoId));
        renderCajeroView();
        SC.toast('Pedido cobrado ✓', 'success');
        return;
      }
      const btnDel = e.target.closest('.caj-del');
      if (btnDel) {
        const pid = Number(btnDel.dataset.pid);
        const idx = Number(btnDel.dataset.idx);
        const peds = SC.leerCaja();
        const ped = peds.find(p => String(p.id) === String(pid));
        if (!ped) return;
        ped.items.splice(idx, 1);
        SC.actualizarPedido(pid, ped.items);
        renderCajeroView();
        return;
      }
      const btnQty = e.target.closest('.caj-qty__btn');
      if (btnQty) {
        const pid    = Number(btnQty.dataset.pid);
        const idx    = Number(btnQty.dataset.idx);
        const action = btnQty.dataset.action;
        const peds   = SC.leerCaja();
        const ped    = peds.find(p => String(p.id) === String(pid));
        if (!ped) return;
        ped.items[idx].cantidad += action === 'inc' ? 1 : -1;
        if (ped.items[idx].cantidad <= 0) ped.items.splice(idx, 1);
        SC.actualizarPedido(pid, ped.items);
        renderCajeroView();
      }
    };
  }

  function init() {
    const addGastoBtn = document.getElementById('btn-add-gasto');
    if (addGastoBtn) {
      addGastoBtn.addEventListener('click', () => {
        const SC    = window.SC;
        const descEl  = document.getElementById('gasto-desc');
        const montoEl = document.getElementById('gasto-monto');
        const desc  = descEl.value.trim();
        const monto = parseFloat(montoEl.value);
        if (!desc)  { descEl.style.borderColor  = '#dc2626'; descEl.focus();  setTimeout(() => descEl.style.borderColor  = '', 1500); return; }
        if (!monto || monto <= 0) { montoEl.style.borderColor = '#dc2626'; montoEl.focus(); setTimeout(() => montoEl.style.borderColor = '', 1500); return; }
        if (monto > 5000) { SC.toast('El monto no puede superar $5,000 por gasto.', 'error'); montoEl.style.borderColor = '#dc2626'; montoEl.focus(); setTimeout(() => montoEl.style.borderColor = '', 1500); return; }
        const hoy  = new Date().toLocaleDateString('es-EC', { year:'numeric', month:'2-digit', day:'2-digit' });
        const hora = new Date().toLocaleTimeString('es-EC', { hour:'2-digit', minute:'2-digit' });
        const gastos = SC.leerGastos();
        gastos.push({ id: Date.now(), descripcion: desc, monto, fecha: hoy, hora });
        SC.guardarGastos(gastos);
        descEl.value  = '';
        montoEl.value = '';
        descEl.focus();
        renderGastos();
        SC.toast(`Gasto "${desc}" registrado`, 'success');
      });
    }
    const montoEl = document.getElementById('gasto-monto');
    if (montoEl) {
      montoEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('btn-add-gasto')?.click();
      });
    }
  }

  return { renderCajeroView, renderResumenDia, renderGastos, renderStock, init };
})();
