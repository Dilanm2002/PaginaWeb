'use strict';
/**
 * vista-cocina.js — Vista de cocina: solo lectura, sin acciones.
 * Muestra los pedidos pendientes de hoy para que el cocinero sepa qué
 * preparar. Cuando el mesero marca un pedido como despachado, aparece
 * aquí con una marca de agua "DESPACHADO" — no hay nada que tocar.
 */
window.VistaCocina = (function () {

  const PED_SEL = `
    ped_id, ped_estado, ped_nombre_invitado, ped_fecha, ped_hora,
    ped_created_at, usu_id, ped_creado_rol, mes_id, ped_despachado,
    mesas(mes_numero),
    detalle_pedidos(detped_id, detped_cantidad, detped_para_llevar,
      platos(plat_nombre), det_exclusiones(ingredientes(ing_nombre)), det_opciones_elegidas(grupo_nombre, opcion_nombre))
  `;

  const _ROL_LABEL = { cajero: 'Caja', mesero: 'Mesero', usuario: 'Cliente', invitado: 'Invitado' };

  function _fechaLocalISO(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function _rolNombre(users, p) {
    if (!p.usu_id) return 'invitado';
    // Rol con que se creó ESTE pedido, no el de perfil (ver vista-admin.js).
    return p.ped_creado_rol ?? users.find(u => u.id === p.usu_id)?.rol ?? 'usuario';
  }
  function _nombre(users, p) {
    if (!p.usu_id) return (p.ped_nombre_invitado || '').replace(/^PL:/, '') || 'Invitado';
    return users.find(u => u.id === p.usu_id)?.nombre ?? 'Usuario';
  }
  // Cliente que el mesero identificó al crear el pedido (de mesa a su
  // nombre, o para llevar a nombre de quién lo retira) — distinto de
  // _nombre, que ahí es la cuenta del mesero. Los pedidos "para llevar"
  // guardan `PL:<nombre>` en ped_nombre_invitado — se le quita el
  // prefijo en vez de mostrarlo tal cual.
  function _clienteNombre(p) {
    const esParaLlevar = p.ped_nombre_invitado === 'Para llevar' || p.ped_nombre_invitado?.startsWith('PL:');
    if (!p.usu_id) return null;
    if (esParaLlevar) return p.ped_nombre_invitado?.startsWith('PL:') ? p.ped_nombre_invitado.slice(3) : null;
    return p.ped_nombre_invitado || null;
  }
  function _mesaTxt(p) {
    return p.mes_id && p.mesas?.mes_numero ? `🍽️ Mesa ${p.mesas.mes_numero}` : '🛍 Para llevar';
  }
  function _itemsHtml(SC, det, pedidoEsParaLlevar) {
    return det.map(d => {
      const excl = (d.det_exclusiones ?? []).map(e => e.ingredientes?.ing_nombre).filter(Boolean);
      const opciones = (d.det_opciones_elegidas ?? []).filter(o => o.opcion_nombre).map(o => o.grupo_nombre ? `${o.grupo_nombre}: ${o.opcion_nombre}` : o.opcion_nombre);
      return `
        <div class="cajero-order-item">
          <span class="cajero-order-item__name">
            ${d.detped_cantidad}× ${SC.escapeHtml(d.platos?.plat_nombre ?? '?')}
            ${d.detped_para_llevar && !pedidoEsParaLlevar ? '<span class="cajero-item-llevar">🥡 Para llevar</span>' : ''}
            ${opciones.length ? `<span class="cajero-excl"> ${opciones.join(', ')}</span>` : ''}
            ${excl.length ? `<span class="cajero-excl"> sin: ${excl.join(', ')}</span>` : ''}
          </span>
        </div>`;
    }).join('');
  }

  async function renderCocinaView() {
    const view = document.getElementById('cocina-view');
    if (!view || !view.classList.contains('visible')) return;

    const el = document.getElementById('cocina-grid');
    if (!el) return;
    // #cocina-grid ya tiene la clase .cajero-grid en el HTML — envolver
    // las tarjetas en OTRO .cajero-grid acá adentro anidaba dos grids: el
    // interno quedaba encerrado en una sola columna (~300px) del externo
    // y ahí solo entraba una columna más, así que todo terminaba apilado
    // en vertical en vez de organizarse en varias columnas.
    el.innerHTML = Array(3).fill(0).map(() =>
      `<div class="cajero-order-card" style="min-height:160px;opacity:.35;animation:pulse 1.2s infinite"></div>`
    ).join('');

    const SC  = window.SC;
    const hoy = _fechaLocalISO();
    const { data, error } = await window.db
      .from('pedidos')
      .select(PED_SEL)
      .gte('ped_fecha', hoy)
      .eq('ped_estado', 'pendiente')
      .order('ped_created_at', { ascending: true });

    if (error) {
      el.innerHTML = '<p style="color:#dc2626;font-size:.9rem;padding:1rem 0">Error al cargar pedidos.</p>';
      return;
    }

    const pedidos = data ?? [];
    const users   = window.ModuloAutenticacion.leerUsuarios();

    const statEl = document.getElementById('cocina-stat-pedidos');
    if (statEl) statEl.textContent = pedidos.length;

    if (!pedidos.length) {
      el.innerHTML = `
        <div class="cajero-empty">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
          <p>No hay pedidos pendientes</p>
          <small>Los pedidos nuevos aparecerán aquí</small>
        </div>`;
      return;
    }

    el.innerHTML = pedidos.map(p => {
      const det = p.detalle_pedidos ?? [];
      const rol = _rolNombre(users, p);
      const clienteNombre = _clienteNombre(p);
      return `
        <div class="cajero-order-card${p.ped_despachado ? ' cajero-order-card--despachado' : ''}" data-pid="${p.ped_id}">
          <div class="cajero-order-card__head">
            <div class="cajero-order-meta">
              <div class="cajero-order-mesa">${_mesaTxt(p)}</div>
              <div class="cajero-order-quien">
                <span class="rol-pill ${rol}">${_ROL_LABEL[rol] ?? rol}</span>
                <span>${SC.escapeHtml(_nombre(users, p))}</span>
              </div>
              ${clienteNombre ? `<div class="cajero-order-cliente">👤 Pedido de: <strong>${SC.escapeHtml(clienteNombre)}</strong></div>` : ''}
            </div>
            <div class="cajero-order-time">🕐 ${(p.ped_hora || '').slice(0, 5)}</div>
          </div>
          <div class="cajero-order-items">${_itemsHtml(SC, det, !p.mesas?.mes_numero)}</div>
        </div>`;
    }).join('');
  }

  return { renderCocinaView };
})();
