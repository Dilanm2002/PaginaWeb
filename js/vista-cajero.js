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
              <td><strong>Mesa ${h.mesa}</strong></td>
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
              <span class="resumen-card__mesa">Mesa ${h.mesa}</span>
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
                    <span>${i.nombre}${i.exclusiones?.length ? `<span class="cajero-excl">sin: ${i.exclusiones.join(', ')}</span>` : ''}</span>
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
            <th style="text-align:right">Monto</th><th></th>
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
              <td class="td-del"><button class="gasto-del-btn" data-del-id="${g.id}" aria-label="Eliminar gasto">✕</button></td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    listaEl.querySelectorAll('.gasto-del-btn').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.delId;
        btn.disabled = true;
        await SC.eliminarGasto(id);
        renderGastos();
      };
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
    const SC  = window.SC;
    const IVA = SC.IVA;
    items.forEach((it, idx) => {
      const qEl = document.getElementById(`qty-${pid}-${idx}`);
      const pEl = document.getElementById(`item-price-${pid}-${idx}`);
      if (qEl) qEl.textContent = it.cantidad;
      if (pEl) pEl.textContent = `$${((it.precio || 0) * (it.cantidad || 0)).toFixed(2)}`;
    });
    const total    = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const iva      = total * (IVA / (1 + IVA));
    const subtotal = total - iva;
    const subEl   = document.getElementById(`card-sub-${pid}`);
    const ivaEl   = document.getElementById(`card-iva-${pid}`);
    const totalEl = document.getElementById(`card-total-${pid}`);
    if (subEl)   subEl.textContent   = `$${subtotal.toFixed(2)}`;
    if (ivaEl)   ivaEl.textContent   = `$${iva.toFixed(2)}`;
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
      const items    = Array.isArray(p.items) ? p.items : [];
      const total    = p.total    || 0;
      const iva      = p.iva      || 0;
      const subtotal = p.subtotal || 0;
      return `
      <div class="cajero-order-card" role="listitem" data-pid="${p.id}">
        <div class="cajero-order-card__head">
          <div class="cajero-order-meta">
            <div class="cajero-order-mesa">🪑 Mesa ${p.mesa}</div>
            <div class="cajero-order-quien">
              <span class="rol-pill ${p.rol}">${ROL_LABEL[p.rol] ?? p.rol}</span>
              <span>${SC.escapeHtml(p.nombreUsuario)}${p.idUsuario ? ` <small style="opacity:.6;font-size:.72rem">@${SC.escapeHtml(p.idUsuario)}</small>` : ''}</span>
            </div>
          </div>
          <div class="cajero-order-time">🕐 ${p.hora}</div>
        </div>
        <div class="cajero-order-items">
          ${items.map((it, idx) => `
            <div class="cajero-order-item">
              <span class="cajero-order-item__name">${it.nombre}${it.exclusiones?.length ? `<span class="cajero-excl"> sin: ${it.exclusiones.join(', ')}</span>` : ''}</span>
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
          <div><span>Subtotal</span><span id="card-sub-${p.id}">$${subtotal.toFixed(2)}</span></div>
          <div class="iva-line"><span>IVA 15 %</span><span id="card-iva-${p.id}">$${iva.toFixed(2)}</span></div>
          <div class="total-line"><span>Total</span><span id="card-total-${p.id}">$${total.toFixed(2)}</span></div>
        </div>
        <div class="cajero-order-card__foot">
          <button class="btn-cobrar" data-pedido-id="${p.id}">Cobrado ✓</button>
        </div>
      </div>`;
    }).join('');

    cajeroGrid.onclick = async e => {
      const btnCobrar = e.target.closest('.btn-cobrar');
      if (btnCobrar) {
        abrirModalPago(btnCobrar.dataset.pedidoId);
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
    const ivaStr = `${(SC.IVA * 100).toFixed(0)}%`;
    const items  = pedido.items || [];
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
<td>${i.nombre}${i.exclusiones?.length?`<br><span class="excl">sin: ${i.exclusiones.join(', ')}</span>`:''}
</td><td class="tr">${i.cantidad}</td><td class="tr">${i.precio.toFixed(2)}</td>
<td class="tr">${(i.precio*i.cantidad).toFixed(2)}</td></tr>`).join('')}</tbody>
<tbody class="tot">
<tr><td colspan="3">Subtotal:</td><td class="tr">${pedido.subtotal.toFixed(2)}</td></tr>
<tr><td colspan="3">IVA ${ivaStr}:</td><td class="tr">${pedido.iva.toFixed(2)}</td></tr>
</tbody>
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
     IMPRESIÓN: FACTURA SRI
  ───────────────────────────────────────────────────── */
  function imprimirFacturaSRI(pedido, factNumero, metodoPagoNombre) {
    const SC = window.SC;
    const items  = pedido.items || [];
    const ahora  = new Date();
    const sriNum = '001-001-' + factNumero.replace('FACT-', '').padStart(9, '0');
    const precioSinIva = precio => precio / (1 + SC.IVA);
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { SC.toast('Bloquea ventanas emergentes — autorízalas para imprimir', 'error'); return; }
    win.document.write(`<!doctype html><html lang="es"><head>
<meta charset="utf-8"><title>Factura ${sriNum}</title>
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
  <div style="font-size:10px;margin-top:3px">Av. Principal 123, Quito</div>
</div>
<div class="ruc-sec">
  <p><strong>RUC:</strong> 1790000000001</p>
  <p><strong>Razón Social:</strong> Sal y Canela S.A.</p>
  <p><strong>Dirección:</strong> Av. Principal 123, Quito</p>
  <p><strong>Teléfono:</strong> 02-000-0000</p>
  <div class="info-box">
    <p><strong>Ambiente:</strong> PRODUCCIÓN</p>
    <p><strong>Emisión:</strong> NORMAL</p>
  </div>
</div>
<div class="num-sec">
  <p><strong>FACTURA</strong></p>
  <p class="num-big">${sriNum}</p>
  <p style="margin-top:5px"><strong>Fecha:</strong> ${ahora.toLocaleDateString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric'})}</p>
  <p><strong>Hora:</strong> ${ahora.toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</p>
</div>
</div>
<div class="cli">
  <div><label>Razón Social/Nombre: </label>${pedido.nombreUsuario||'Consumidor Final'}</div>
  <div><label>Identificación: </label>9999999999999</div>
  <div><label>Dirección: </label>—</div>
  <div><label>Mesa: </label>Mesa ${pedido.mesa}</div>
</div>
<div class="items">
<table><thead><tr>
  <th class="tc">#</th><th>Descripción</th><th class="tc">Cant.</th>
  <th class="tr">P. Unit s/IVA</th><th class="tr">Descuento</th><th class="tr">Total s/IVA</th>
</tr></thead>
<tbody>${items.map((i,idx)=>`<tr>
  <td class="tc">${idx+1}</td>
  <td>${i.nombre}${i.exclusiones?.length?` <em>(sin: ${i.exclusiones.join(', ')})</em>`:''}</td>
  <td class="tc">${i.cantidad}</td>
  <td class="tr">$${precioSinIva(i.precio).toFixed(2)}</td>
  <td class="tr">$0.00</td>
  <td class="tr">$${(precioSinIva(i.precio)*i.cantidad).toFixed(2)}</td>
</tr>`).join('')}</tbody>
</table>
</div>
<div class="tots"><table>
  <tr><td>Subtotal sin IVA:</td><td class="tr">$${pedido.subtotal.toFixed(2)}</td></tr>
  <tr><td>Descuento total:</td><td class="tr">$0.00</td></tr>
  <tr><td>IVA 15%:</td><td class="tr">$${pedido.iva.toFixed(2)}</td></tr>
  <tr class="bold"><td>VALOR TOTAL:</td><td class="tr">$${pedido.total.toFixed(2)}</td></tr>
</table></div>
<div class="pago-row"><strong>Forma de pago:</strong> ${metodoPagoNombre} · <strong>Total pagado:</strong> $${pedido.total.toFixed(2)}</div>
<div class="foot">Documento generado por sistema POS · Sal y Canela · ${ahora.toLocaleDateString('es-EC')}</div>
</div></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  function init() {
    document.getElementById('btn-dia-ant')?.addEventListener('click', () => {
      _diaOffset--;
      renderResumenDia();
      renderGastos();
    });
    document.getElementById('btn-dia-sig')?.addEventListener('click', () => {
      if (_diaOffset < 0) { _diaOffset++; renderResumenDia(); renderGastos(); }
    });

    const addGastoBtn = document.getElementById('btn-add-gasto');
    if (addGastoBtn) {
      addGastoBtn.addEventListener('click', async () => {
        const SC    = window.SC;
        const descEl  = document.getElementById('gasto-desc');
        const montoEl = document.getElementById('gasto-monto');
        const desc  = descEl.value.trim();
        const monto = parseFloat(montoEl.value);
        const soloLetras = /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s]+$/;
        if (!desc) { descEl.style.borderColor = '#dc2626'; descEl.focus(); setTimeout(() => descEl.style.borderColor = '', 1500); return; }
        if (!soloLetras.test(desc)) { SC.toast('La descripción solo puede contener letras.', 'error'); descEl.style.borderColor = '#dc2626'; descEl.focus(); setTimeout(() => descEl.style.borderColor = '', 1500); return; }
        if (!monto || monto <= 0) { montoEl.style.borderColor = '#dc2626'; montoEl.focus(); setTimeout(() => montoEl.style.borderColor = '', 1500); return; }
        if (monto > 5000) { SC.toast('El monto no puede superar $5,000 por gasto.', 'error'); montoEl.style.borderColor = '#dc2626'; montoEl.focus(); setTimeout(() => montoEl.style.borderColor = '', 1500); return; }
        addGastoBtn.disabled = true;
        const resultado = await SC.insertarGasto({ descripcion: desc, monto });
        if (resultado) {
          descEl.value  = '';
          montoEl.value = '';
          descEl.focus();
          renderGastos();
          SC.toast(`Gasto "${desc}" registrado`, 'success');
        }
        addGastoBtn.disabled = false;
      });
    }
    const montoEl = document.getElementById('gasto-monto');
    if (montoEl) {
      montoEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('btn-add-gasto')?.click();
      });
    }

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
    if (pagoBackdrop)   pagoBackdrop.addEventListener('click', e => { if (e.target === pagoBackdrop) cerrarModalPago(); });

    document.querySelectorAll('input[name="metodo-pago"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (efectivoSec) efectivoSec.style.display = radio.value === 'met001' ? '' : 'none';
        if (cambioDisp)  cambioDisp.textContent = '';
      });
    });

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

        btnConfirmarPago.disabled    = true;
        btnConfirmarPago.textContent = 'Procesando…';

        const resultado = await SC.cobrarPedido(String(_pedidoParaCobrar), metodoPagoId, montoPagado, cambio);

        btnConfirmarPago.disabled    = false;
        btnConfirmarPago.textContent = '✓ Cobrar';
        cerrarModalPago();

        if (resultado) {
          _ultimoCobro = { pedido: resultado.pedido, factNumero: resultado.factNumero, metodoPagoNombre, montoPagado, cambio };
          renderCajeroView();
          abrirPostCobro(resultado.pedido, resultado.factNumero, metodoPagoNombre, montoPagado, cambio);
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
    if (postBackdrop)   postBackdrop.addEventListener('click', e => { if (e.target === postBackdrop) cerrarPostCobro(); });

    document.getElementById('btn-imprimir-recibo')?.addEventListener('click', () => {
      if (_ultimoCobro) {
        imprimirRecibo(_ultimoCobro.pedido, _ultimoCobro.factNumero, _ultimoCobro.metodoPagoNombre, _ultimoCobro.montoPagado, _ultimoCobro.cambio);
      }
    });

    document.getElementById('btn-imprimir-sri')?.addEventListener('click', () => {
      if (_ultimoCobro) {
        imprimirFacturaSRI(_ultimoCobro.pedido, _ultimoCobro.factNumero, _ultimoCobro.metodoPagoNombre);
      }
    });
  }

  return { renderCajeroView, renderResumenDia, renderGastos, renderStock, init };
})();
