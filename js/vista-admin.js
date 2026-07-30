'use strict';
/**
 * vista-admin.js — Vista del panel de administrador.
 * Depende de window.SC (API compartida) y DOM de admin-view.
 */
window.VistaAdmin = (function () {

  // Datos legales del negocio (mismos que en la Nota de Venta de vista-cajero.js)
  const RUC_NEGOCIO       = '0601335128001';
  const DIRECCION_NEGOCIO = 'Villalengua y Jorge Drom, Quito';
  const TELEFONO_NEGOCIO  = '0984 870 280';

  // Fecha local (YYYY-MM-DD) — toISOString() usa UTC y desfasa la fecha en
  // zonas horarias detrás de UTC (p.ej. Ecuador, UTC-5) durante la noche.
  function _fechaLocalISO(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // SC.leerGastos() guarda la fecha ya formateada como texto local
  // (DD/MM/YYYY, ver _mapGasto en index.html) — se convierte a ISO para
  // poder compararla contra el rango desdeStr/hastaStr de Reportes.
  function _gastoFechaISO(fechaLocale) {
    const [d, m, y] = (fechaLocale || '').split('/');
    return (d && m && y) ? `${y}-${m}-${d}` : '';
  }
  function _totalGastosRango(desdeStr, hastaStr) {
    const gastos = window.SC?.leerGastos?.() ?? [];
    return gastos.reduce((s, g) => {
      const iso = _gastoFechaISO(g.fecha);
      return (iso && iso >= desdeStr && iso <= hastaStr) ? s + (g.monto || 0) : s;
    }, 0);
  }

  // Lunes de la semana calendario que contiene `d` (negocio opera lun-vie).
  function _lunesDeSemana(d) {
    const dow  = d.getDay(); // 0=Dom .. 6=Sáb
    const diff = dow === 0 ? 6 : dow - 1;
    const lunes = new Date(d);
    lunes.setDate(lunes.getDate() - diff);
    return lunes;
  }

  // Navegación día a día (offset relativo a hoy: 0=hoy, -1=ayer, ...)
  function _fechaConOffset(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d;
  }
  function _labelDiaOffset(offset) {
    if (offset === 0)  return 'Hoy';
    if (offset === -1) return 'Ayer';
    return _fechaConOffset(offset).toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  // Rango de la semana laboral (lun-vie) que contiene `hoy`: desde el
  // lunes hasta hoy, o hasta el viernes si hoy cae en fin de semana
  // (el negocio no opera sáb/dom, así que no se agrega ese rango).
  function _rangoSemanaLaboral(hoy) {
    const dowHoy    = hoy.getDay(); // 0=Dom .. 6=Sáb
    const lunes     = _lunesDeSemana(hoy);
    const viernes   = new Date(lunes); viernes.setDate(viernes.getDate() + 4);
    const hastaDate = (dowHoy === 0 || dowHoy === 6) ? viernes : hoy;
    return { desde: _fechaLocalISO(lunes), hasta: _fechaLocalISO(hastaDate) };
  }

  let _prodFormImgBase64 = null;
  let _prodFormEditId    = null;
  let _repDiaOffset      = 0; // navegación día a día en Reportes → tab "Hoy" (0=hoy, -1=ayer, ...)
  let _ultimoReporte     = null; // datos del último renderReportes(), para exportar a Excel
  let _reportesGen       = 0; // se incrementa en cada renderReportes(); evita que un dibujo de gráfica diferido (esperando Plotly) pise una pestaña que el usuario ya cambió
  // Clic en el encabezado "Método de pago" del Control de Caja alterna
  // entre orden cronológico y agrupado por método — agrupar hace mucho más
  // rápido el cuadre manual (todo el efectivo junto, luego transferencias...).
  let _cuadreOrdenMetodo = false;
  let _pedHistDiaOffset  = 0; // navegación día a día en Pedidos → Historial

  // Catálogo estándar del negocio (coincide con _CAT_PREFIX en index.html) —
  // se ofrece siempre en el selector de categoría del formulario de producto,
  // aunque todavía no haya ningún plato guardado con ellas (ej. recién
  // después de vaciar la base de datos para producción).
  const _CATS_ORDER = ['Desayunos','Entradas','Almuerzos','Platos Fuertes','Sopas','Bocaditos','Bebidas Calientes','Bebidas Frías','Postres'];
  const _IMG_FALLBACK = "this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%23f4e8d6%22 width=%22100%25%22 height=%22100%25%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%237a5640%22 font-size=%2228%22>🍽️</text></svg>'";

  function _renderAdminCard(p) {
    const SC = window.SC;
    const s = SC.getStock(p.id);
    const agotado = !s.disponible || s.stock <= 0;
    const esNuevo = p.createdAt && (Date.now() - new Date(p.createdAt).getTime()) < 5 * 86400000;
    const oculto  = p.activo === false;
    return `
    <div class="admin-card-wrap${agotado ? ' admin-card-inactive' : ''}${oculto ? ' admin-card--oculto' : ''}" data-id="${p.id}">
      <div class="product-card" role="listitem" aria-label="${p.nombre}">
        <div class="product-card__img-wrap">
          <img src="${p.imagen}" alt="Foto de ${p.nombre}" loading="lazy" decoding="async" onerror="${_IMG_FALLBACK}">
          ${p.destacado ? '<span class="admin-badge-dest">★</span>' : ''}
          ${oculto ? '<span class="admin-badge-oculto">Oculto</span>' : (agotado ? '<span class="admin-badge-agotado">Agotado</span>' : '')}
          ${esNuevo && !oculto && !agotado ? '<span class="admin-badge-nuevo">Nuevo</span>' : ''}
        </div>
        <div class="product-card__body">
          <h3 class="product-card__name">${p.nombre}</h3>
          <p class="product-card__price">$${Number(p.precio).toFixed(2)} <small>USD</small></p>
        </div>
      </div>
      <div class="admin-card-overlay">
        <button class="btn-admin-card btn-admin-card--edit" data-action="editar"   data-id="${p.id}">✏️ Editar</button>
        <button class="btn-admin-card btn-admin-card--del"  data-action="eliminar" data-id="${p.id}">🗑 Eliminar</button>
      </div>
    </div>`;
  }

  const _MOD_TITLES = {
    dashboard: 'Dashboard',
    productos: 'Catálogo de Productos',
    pedidos:   'Pedidos activos',
    stock:     'Gestión de Stock',
    menudia:   'Menú del Día',
    empleados: 'Empleados',
    clientes:  'Clientes',
    reportes:  'Reportes de Ventas',
    gastos:    'Control de Gastos',
    mensajes:  'Mensajes de contacto'
  };

  const _ESTADO_CFG = {
    pendiente:  { label: 'Pendiente',   cls: 'adm-ped-estado--pendiente' },
    en_proceso: { label: 'En proceso',  cls: 'adm-ped-estado--proceso'   },
    listo:      { label: 'Listo',       cls: 'adm-ped-estado--listo'     },
    cobrado:    { label: 'Cobrado',     cls: 'adm-ped-estado--cobrado'   },
    cancelado:  { label: 'Cancelado',   cls: 'adm-ped-estado--cancelado' }
  };

  let _pedidosTab = 'activos'; // 'activos' | 'historial'

  const _ROL_LABEL_PED = { cajero: 'Caja', mesero: 'Mesero', usuario: 'Cliente', invitado: 'Invitado' };

  function _pedRolNombre(users, p) {
    if (!p.usu_id) return 'invitado';
    const u = users.find(u => u.id === p.usu_id);
    return u?.rol ?? 'usuario';
  }
  function _pedNombre(users, p) {
    if (!p.usu_id) return p.ped_nombre_invitado ?? 'Invitado';
    const u = users.find(u => u.id === p.usu_id);
    return u?.nombre ?? 'Usuario';
  }
  // Cliente que el mesero/cajero identificó al crear el pedido (de mesa a
  // su nombre, o para llevar a nombre de quién lo retira) — distinto de
  // _pedNombre, que ahí es la cuenta del empleado. Los pedidos "para
  // llevar" guardan `PL:<nombre>` en ped_nombre_invitado (ver _rowAPedido
  // en index.html) — se le quita el prefijo en vez de mostrarlo tal cual.
  function _pedClienteNombre(p) {
    const esParaLlevar = p.ped_nombre_invitado === 'Para llevar' || p.ped_nombre_invitado?.startsWith('PL:');
    if (!p.usu_id) return null;
    if (esParaLlevar) return p.ped_nombre_invitado?.startsWith('PL:') ? p.ped_nombre_invitado.slice(3) : null;
    return p.ped_nombre_invitado || null;
  }
  function _pedMesa(p) { return p.mesas?.mes_numero ? `Mesa ${p.mesas.mes_numero}` : 'Para llevar'; }
  // pedidoEsParaLlevar: si el pedido ENTERO ya es para llevar (sin mesa),
  // no repetimos la etiqueta en cada ítem — solo tiene sentido marcarla
  // cuando es un pedido de mesa con algún plato empacado por separado.
  function _pedItemsHtml(SC, det, pedidoEsParaLlevar) {
    return det.map(d => {
      const excl = (d.det_exclusiones ?? []).map(e => e.ingredientes?.ing_nombre).filter(Boolean);
      const opciones = (d.det_opciones_elegidas ?? []).filter(o => o.opcion_nombre).map(o => o.grupo_nombre ? `${o.grupo_nombre}: ${o.opcion_nombre}` : o.opcion_nombre);
      return `
        <div class="cajero-order-item">
          <span class="cajero-order-item__name">
            ${SC.escapeHtml(d.platos?.plat_nombre ?? '?')}
            ${d.detped_para_llevar && !pedidoEsParaLlevar ? '<span class="cajero-item-llevar">🥡 Para llevar</span>' : ''}
            ${opciones.length ? `<span class="cajero-excl"> ${opciones.join(', ')}</span>` : ''}
            ${excl.length ? `<span class="cajero-excl"> sin: ${excl.join(', ')}</span>` : ''}
          </span>
          <span class="caj-qty__val">${d.detped_cantidad}</span>
          <span class="cajero-order-item__price">$${(parseFloat(d.detped_subtotal)||0).toFixed(2)}</span>
        </div>`;
    }).join('');
  }
  function _pedSubtotalsHtml(p) {
    return `
      <div class="cajero-order-subtotals">
        <div class="total-line"><span>Total</span><span>$${(parseFloat(p.ped_total)||0).toFixed(2)}</span></div>
      </div>`;
  }

  function _initPedidosTabs() {
    const tabsWrap = document.getElementById('ped-tabs');
    if (!tabsWrap || tabsWrap._bound) return;
    tabsWrap._bound = true;
    tabsWrap.addEventListener('click', e => {
      const btn = e.target.closest('.rep-tab');
      if (!btn) return;
      _pedidosTab = btn.dataset.ptab;
      if (_pedidosTab === 'historial') _pedHistDiaOffset = 0; // volver a hoy al re-entrar al tab
      tabsWrap.querySelectorAll('.rep-tab').forEach(t => {
        const active = t === btn;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', String(active));
      });
      const titleEl = document.getElementById('ped-section-title');
      if (titleEl) titleEl.textContent = _pedidosTab === 'historial' ? 'Historial de pedidos' : 'Pedidos activos';
      const diaNavEl = document.getElementById('ped-hist-dia-nav');
      if (diaNavEl) diaNavEl.style.display = _pedidosTab === 'historial' ? '' : 'none';
      renderAdminPedidos();
    });

    const ant = document.getElementById('ped-hist-dia-ant');
    const sig = document.getElementById('ped-hist-dia-sig');
    if (ant && !ant._bound) {
      ant._bound = true;
      ant.addEventListener('click', () => { _pedHistDiaOffset--; renderAdminPedidos(); });
    }
    if (sig && !sig._bound) {
      sig._bound = true;
      sig.addEventListener('click', () => {
        if (_pedHistDiaOffset < 0) { _pedHistDiaOffset++; renderAdminPedidos(); }
      });
    }
  }

  async function renderAdminPedidos() {
    _initPedidosTabs();
    _actualizarBadgePedidosActivos();
    if (_pedidosTab === 'historial') return _renderPedidosHistorial();
    return _renderPedidosActivos();
  }

  // Badge del sidebar siempre cuenta activos, independiente de la pestaña que se esté viendo
  async function _actualizarBadgePedidosActivos() {
    const hoy = _fechaLocalISO();
    const { data } = await window.db.from('pedidos').select('ped_id')
      .gte('ped_fecha', hoy).not('ped_estado', 'in', '("anulado","cobrado")');
    const badge = document.getElementById('adm-ped-badge');
    const n = data?.length ?? 0;
    if (badge) { badge.textContent = n; badge.style.display = n > 0 ? '' : 'none'; }
  }

  async function _renderPedidosActivos() {
    const el = document.getElementById('admin-pedidos-lista');
    if (!el) return;

    el.innerHTML = `<div class="cajero-grid">${Array(3).fill(0).map(() =>
      `<div class="cajero-order-card" style="min-height:180px;opacity:.35;animation:pulse 1.2s infinite"></div>`
    ).join('')}</div>`;

    const PED_SEL = `
      ped_id, ped_estado, ped_nombre_invitado, ped_fecha, ped_hora,
      ped_subtotal, ped_iva, ped_total, ped_created_at, usu_id, mes_id,
      mesas(mes_numero),
      detalle_pedidos(detped_id, detped_cantidad, detped_precio_unit, detped_subtotal, detped_para_llevar,
        platos(plat_nombre), det_exclusiones(ingredientes(ing_nombre)), det_opciones_elegidas(grupo_nombre, opcion_nombre))
    `;

    const hoy = _fechaLocalISO();
    const { data, error } = await window.db
      .from('pedidos')
      .select(PED_SEL)
      .gte('ped_fecha', hoy)
      .not('ped_estado', 'in', '("anulado","cobrado")')
      .order('ped_created_at', { ascending: true });

    if (error) { el.innerHTML = '<p style="color:#dc2626;font-size:.9rem;padding:1rem 0">Error al cargar pedidos.</p>'; return; }

    const pedidos = data ?? [];
    const SC    = window.SC;
    const users = window.ModuloAutenticacion.leerUsuarios();

    const _hora  = p => p.ped_hora?.slice(0,5)
      ?? (p.ped_created_at ? new Date(p.ped_created_at).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'}) : '—');

    if (!pedidos.length) {
      el.innerHTML = `
        <div class="cajero-empty">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
          <p>No hay pedidos activos</p>
          <small>Los pedidos de meseros y clientes aparecerán aquí</small>
        </div>`;
      return;
    }

    el.innerHTML = `<div class="cajero-grid">${pedidos.map(p => {
      const det  = p.detalle_pedidos ?? [];
      const rol  = _pedRolNombre(users, p);
      const nombre = _pedNombre(users, p);
      const clienteNombre = _pedClienteNombre(p);
      return `
        <div class="cajero-order-card" data-pid="${p.ped_id}">
          <div class="cajero-order-card__head">
            <div class="cajero-order-meta">
              <div class="cajero-order-mesa">🪑 ${_pedMesa(p)}</div>
              <div class="cajero-order-quien">
                <span class="rol-pill ${rol}">${_ROL_LABEL_PED[rol] ?? rol}</span>
                <span>${SC.escapeHtml(nombre)}</span>
              </div>
              ${clienteNombre ? `<div class="cajero-order-cliente">👤 Pedido de: <strong>${SC.escapeHtml(clienteNombre)}</strong></div>` : ''}
            </div>
            <div class="cajero-order-time">🕐 ${_hora(p)}</div>
          </div>
          <div class="cajero-order-items">${_pedItemsHtml(SC, det, !p.mesas?.mes_numero)}</div>
          ${_pedSubtotalsHtml(p)}
          <div class="cajero-order-card__foot" style="justify-content:center">
            <span style="font-size:.8rem;font-weight:600;color:var(--cinnamon);letter-spacing:.04em;text-transform:uppercase;opacity:.75">
              ⏳ Pendiente de cobro
            </span>
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  async function _renderPedidosHistorial() {
    const el = document.getElementById('admin-pedidos-lista');
    if (!el) return;

    el.innerHTML = `<div class="cajero-grid">${Array(3).fill(0).map(() =>
      `<div class="cajero-order-card" style="min-height:180px;opacity:.35;animation:pulse 1.2s infinite"></div>`
    ).join('')}</div>`;

    const diaSelISO = _fechaLocalISO(_fechaConOffset(_pedHistDiaOffset));
    const diaLabel  = _labelDiaOffset(_pedHistDiaOffset);
    const diaLabelEl = document.getElementById('ped-hist-dia-label');
    if (diaLabelEl) diaLabelEl.textContent = diaLabel;
    const diaSigBtn = document.getElementById('ped-hist-dia-sig');
    if (diaSigBtn) diaSigBtn.disabled = _pedHistDiaOffset >= 0;

    const PED_SEL = `
      ped_id, ped_estado, ped_nombre_invitado, ped_cobrado_en,
      ped_anulado_en, ped_motivo_anulacion,
      ped_subtotal, ped_iva, ped_total, usu_id, mes_id,
      mesas(mes_numero),
      detalle_pedidos(detped_id, detped_cantidad, detped_precio_unit, detped_subtotal, detped_para_llevar,
        platos(plat_nombre), det_exclusiones(ingredientes(ing_nombre)), det_opciones_elegidas(grupo_nombre, opcion_nombre)),
      facturas(fact_numero, fact_email, pagos(metodo_id, pago_monto, pago_cambio, metodos_pago(metodo_nombre)))
    `;

    const { data, error } = await window.db
      .from('pedidos')
      .select(PED_SEL)
      .in('ped_estado', ['cobrado', 'anulado'])
      .eq('ped_fecha', diaSelISO)
      .order('ped_cobrado_en', { ascending: false });

    if (error) { el.innerHTML = '<p style="color:#dc2626;font-size:.9rem;padding:1rem 0">Error al cargar historial.</p>'; return; }

    const pedidos = (data ?? []).sort((a, b) =>
      new Date(b.ped_cobrado_en ?? b.ped_anulado_en ?? 0) - new Date(a.ped_cobrado_en ?? a.ped_anulado_en ?? 0));
    const SC    = window.SC;
    const users = window.ModuloAutenticacion.leerUsuarios();

    const _fechaHora = p => {
      const t = p.ped_cobrado_en ?? p.ped_anulado_en;
      return t ? new Date(t).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    };
    const _factura = p => Array.isArray(p.facturas) ? p.facturas[0] : p.facturas;
    const _pagosDe = p => {
      const factura = _factura(p);
      const raw = Array.isArray(factura?.pagos) ? factura.pagos : (factura?.pagos ? [factura.pagos] : []);
      return raw;
    };
    // Neto que aportó esa fila de pago a la venta (recibido − cambio) — la
    // pierna en efectivo de un mixto puede traer cambio, la transferencia no.
    const _netoPago = pg => (parseFloat(pg.pago_monto) || 0) - (parseFloat(pg.pago_cambio) || 0);
    // Más de una fila de pago = pago mixto (parte efectivo, parte
    // transferencia) — se muestra con su desglose en vez de un solo método.
    const _metodoNombre = p => {
      const pagos = _pagosDe(p);
      if (!pagos.length) return 'Sin registrar';
      if (pagos.length > 1) {
        return 'Mixto (' + pagos.map(pg => `${pg.metodos_pago?.metodo_nombre ?? '?'} $${_netoPago(pg).toFixed(2)}`).join(' + ') + ')';
      }
      return pagos[0]?.metodos_pago?.metodo_nombre ?? 'Sin registrar';
    };

    if (!pedidos.length) {
      const label = diaLabel === 'Hoy' ? 'hoy' : diaLabel;
      el.innerHTML = `
        <div class="cajero-empty">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
          <p>No hay pedidos cobrados ni anulados ${label}</p>
          <small>Usa las flechas para ver otros días</small>
        </div>`;
      return;
    }

    el.innerHTML = `<div class="cajero-grid">${pedidos.map(p => {
      const det  = p.detalle_pedidos ?? [];
      const rol  = _pedRolNombre(users, p);
      const nombre = _pedNombre(users, p);
      const clienteNombre = _pedClienteNombre(p);
      const esAnulado = p.ped_estado === 'anulado';
      return `
        <div class="cajero-order-card" data-pid="${p.ped_id}" style="${esAnulado ? 'opacity:.75' : ''}">
          <div class="cajero-order-card__head">
            <div class="cajero-order-meta">
              <div class="cajero-order-mesa">🪑 ${_pedMesa(p)}</div>
              <div class="cajero-order-quien">
                <span class="rol-pill ${rol}">${_ROL_LABEL_PED[rol] ?? rol}</span>
                <span>${SC.escapeHtml(nombre)}</span>
              </div>
              ${clienteNombre ? `<div class="cajero-order-cliente">👤 Pedido de: <strong>${SC.escapeHtml(clienteNombre)}</strong></div>` : ''}
            </div>
            <div class="cajero-order-time">🕐 ${_fechaHora(p)}</div>
          </div>
          <div class="cajero-order-items">${_pedItemsHtml(SC, det, !p.mesas?.mes_numero)}</div>
          ${_pedSubtotalsHtml(p)}
          ${esAnulado && p.ped_motivo_anulacion ? `<p style="font-size:.78rem;color:#991b1b;padding:0 1rem;margin:.25rem 0 0">Motivo: ${SC.escapeHtml(p.ped_motivo_anulacion)}</p>` : ''}
          <div class="cajero-order-card__foot" style="justify-content:space-between;flex-wrap:wrap;gap:.5rem">
            ${esAnulado
              ? `<span class="adm-ped-estado" style="background:#fef2f2;color:#b91c1c;border:1px solid #f0b8b8">✕ Anulado</span>`
              : `<span class="adm-ped-estado adm-ped-estado--cobrado">✓ Cobrado</span>
                 <span style="font-size:.8rem;font-weight:600;color:var(--cinnamon)">💳 ${SC.escapeHtml(_metodoNombre(p))}</span>
                 <button class="btn-print-nota" data-pid="${p.ped_id}" style="width:100%;padding:.45rem;border:1.5px solid var(--cinnamon);background:transparent;color:var(--cinnamon);border-radius:8px;font-size:.78rem;font-weight:600;cursor:pointer">🖨️ Nota de Venta</button>
                 <button class="btn-enviar-nota" data-pid="${p.ped_id}" style="width:100%;padding:.45rem;border:1.5px solid var(--cinnamon);background:transparent;color:var(--cinnamon);border-radius:8px;font-size:.78rem;font-weight:600;cursor:pointer">✉️ Enviar por correo</button>`}
          </div>
        </div>`;
    }).join('')}</div>`;

    const _pedidoShaped = p => ({
      // sin prefijo "Mesa " — imprimirNotaVenta ya lo antepone
      mesa: p.mesas?.mes_numero ?? 'Para llevar',
      nombreUsuario: _pedNombre(users, p),
      total: parseFloat(p.ped_total) || 0,
      items: (p.detalle_pedidos ?? []).map(d => ({
        nombre: d.platos?.plat_nombre ?? '?',
        cantidad: d.detped_cantidad,
        precio: parseFloat(d.detped_precio_unit) || 0,
        exclusiones: (d.det_exclusiones ?? []).map(e => e.ingredientes?.ing_nombre).filter(Boolean)
      }))
    });

    el.querySelectorAll('.btn-print-nota').forEach(btn => {
      btn.onclick = () => {
        const p = pedidos.find(x => String(x.ped_id) === String(btn.dataset.pid));
        if (!p) return;
        const factNumero = _factura(p)?.fact_numero ?? 'FACT-000000';
        window.VistaCajero?.imprimirNotaVenta(_pedidoShaped(p), factNumero, _metodoNombre(p), p.ped_cobrado_en);
      };
    });

    el.querySelectorAll('.btn-enviar-nota').forEach(btn => {
      btn.onclick = () => {
        const p = pedidos.find(x => String(x.ped_id) === String(btn.dataset.pid));
        if (!p) return;
        const factura = _factura(p);
        const emailDefault = factura?.fact_email || users.find(u => u.id === p.usu_id)?.email || '';
        const factNumero = factura?.fact_numero ?? 'FACT-000000';
        window.VistaCajero?.abrirModalCorreoNota(_pedidoShaped(p), factNumero, _metodoNombre(p), p.ped_cobrado_en, emailDefault);
      };
    });
  }

  function _cambiarModulo(nombre) {
    document.querySelectorAll('.adm-module').forEach(m => m.classList.remove('active'));
    document.getElementById(`mod-${nombre}`)?.classList.add('active');
    document.querySelectorAll('.adm-nav__item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mod === nombre);
    });
    const titleEl = document.getElementById('adm-topbar-title');
    if (titleEl) titleEl.textContent = _MOD_TITLES[nombre] ?? nombre;
    document.getElementById('adm-sidebar')?.classList.remove('open');
    const overlay = document.getElementById('adm-overlay');
    if (overlay) { overlay.classList.remove('visible'); document.body.style.overflow = ''; }

    localStorage.setItem('sc_admin_mod', nombre);

    if      (nombre === 'productos') _renderProductosGrid();
    else if (nombre === 'pedidos')   renderAdminPedidos();
    else if (nombre === 'stock')     window.VistaCajero?.renderStock();
    else if (nombre === 'empleados') renderEmpleados();
    else if (nombre === 'clientes')  renderClientes();
    else if (nombre === 'mensajes')  renderMensajes();
    else if (nombre === 'reportes')  renderReportes('hoy');
    else if (nombre === 'gastos')    _renderGastos();
    else if (nombre === 'menudia')   _renderMenuDia();
    else if (nombre === 'dashboard') _renderDashboardStats();
  }

  async function _renderDashboardStats() {
    const SC = window.SC;
    const todos    = SC.getProductosMergeados();
    const agotados = todos.filter(p => { const s = SC.getStock(p.id); return !s.disponible || s.stock <= 0; });
    const statTotal = document.getElementById('admin-stat-total');
    const statAgot  = document.getElementById('admin-stat-agotados');
    if (statTotal) statTotal.textContent = todos.length;
    if (statAgot)  statAgot.textContent  = agotados.length;
    // Contar mensajes sin leer — vía RPC (requiere sesión de administrador)
    try {
      const token = window.ModuloAutenticacion?.getSession?.()?.token ?? null;
      const { data: noLeidos } = await window.db.rpc('admin_contar_mensajes_no_leidos', { p_token: token });
      const statMsg = document.getElementById('admin-stat-mensajes');
      if (statMsg) statMsg.textContent = noLeidos ?? 0;
      const badgeMsg = document.getElementById('admin-mensajes-badge');
      if (badgeMsg) { badgeMsg.textContent = noLeidos ?? 0; badgeMsg.style.display = (noLeidos ?? 0) > 0 ? '' : 'none'; }
    } catch (_) {}
    // Contar pedidos pendientes del día
    try {
      const hoy = _fechaLocalISO();
      const { data: peds } = await window.db.from('pedidos').select('ped_id')
        .gte('ped_fecha', hoy).in('ped_estado', ['pendiente', 'en_proceso']);
      const pendientes = peds?.length ?? 0;
      const badgePed = document.getElementById('adm-ped-badge');
      if (badgePed) { badgePed.textContent = pendientes; badgePed.style.display = pendientes > 0 ? '' : 'none'; }
    } catch (_) {}
    _renderDashboardMenuDia();
  }

  // ── Menú del Día ──────────────────────────────────────────────
  // Cada campo admite un plato del catálogo (col _id, FK a platos) O un
  // nombre libre que no existe como producto (col _texto) — el admin
  // puede escribir cualquier cosa en el input; si coincide con un plato
  // ya existente se guarda como referencia, si no, como texto suelto.
  const _MD_CAMPOS = [
    { input: 'md-sopa',         datalist: 'md-sopa-datalist',         idCol: 'mendia_sopa_id',         textoCol: 'mendia_sopa_texto',         icon: '🍲', lbl: 'Sopa' },
    // Filtrado por categoría "Almuerzos" — en el catálogo real los platos
    // fuertes (Almuerzo #1, #4, #5...) están en esa categoría, no en
    // "Platos Fuertes" (esa existe pero no tiene productos asignados).
    // Igual se puede escribir cualquier otra cosa a mano si no está aquí.
    { input: 'md-plato-fuerte', datalist: 'md-plato-fuerte-datalist', idCol: 'mendia_plato_fuerte_id', textoCol: 'mendia_plato_fuerte_texto', icon: '🍽️', lbl: 'Plato fuerte', categoria: 'Almuerzos' },
    { input: 'md-ensalada',     datalist: 'md-ensalada-datalist',     idCol: 'mendia_ensalada_id',     textoCol: 'mendia_ensalada_texto',     icon: '🥗', lbl: 'Ensalada' },
    { input: 'md-jugo',         datalist: 'md-jugo-datalist',         idCol: 'mendia_jugo_id',         textoCol: 'mendia_jugo_texto',         icon: '🥤', lbl: 'Jugo' }
  ];
  const _MD_SELECT = 'mendia_fecha, ' + _MD_CAMPOS.map(c => `${c.idCol}, ${c.textoCol}`).join(', ');
  const _md_nombreProducto = id => window.SC?.getAllProductosMergeados?.()?.find(p => p.id === id)?.nombre ?? null;
  // Nombre a mostrar de un campo ya guardado: el texto libre si lo tiene,
  // si no el nombre actual del producto referenciado (por si lo renombran).
  const _md_nombreCampo = (row, c) => row?.[c.textoCol] || _md_nombreProducto(row?.[c.idCol]) || null;

  async function _renderMenuDia() {
    _md_poblarDatalists();
    _md_toggleCancelar(false);
    const fechaInput = document.getElementById('md-fecha');
    if (fechaInput && !fechaInput.value) fechaInput.value = _fechaLocalISO();
    // El formulario siempre arranca vacío al entrar a la pestaña, aunque ya
    // exista un menú guardado para hoy — cargarlo es una acción explícita,
    // solo con "Editar" en el registro de abajo.
    _MD_CAMPOS.forEach(c => { const inp = document.getElementById(c.input); if (inp) inp.value = ''; });
    await _md_renderProximos();
    _md_initHandlers();
  }

  function _md_poblarDatalists() {
    const SC = window.SC;
    const todos = (SC?.getAllProductosMergeados?.() ?? [])
      .filter(p => p.activo !== false)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    _MD_CAMPOS.forEach(({ datalist, categoria }) => {
      const dl = document.getElementById(datalist);
      if (!dl) return;
      const productos = categoria
        ? todos.filter(p => (p.categoria ?? '').toLowerCase() === categoria.toLowerCase())
        : todos;
      dl.innerHTML = productos.map(p => `<option value="${SC.escapeHtml(p.nombre)}">`).join('');
    });
  }

  async function _md_cargarFecha(fechaISO) {
    if (!fechaISO) return;
    const { data, error } = await window.db.from('menu_dia').select(_MD_SELECT).eq('mendia_fecha', fechaISO).maybeSingle();
    if (error) {
      console.error('Supabase menu_dia select:', error);
      window.SC?.toast('Error al cargar ese día — revisa la consola.', 'error');
      return;
    }
    _MD_CAMPOS.forEach(c => {
      const inp = document.getElementById(c.input);
      if (inp) inp.value = _md_nombreCampo(data, c) ?? '';
    });
  }

  function _md_initHandlers() {
    const SC = window.SC;
    // Nota: la fecha NO recarga los campos automáticamente al cambiarla —
    // solo decide a qué día se va a guardar. Si recargara sola, cambiar la
    // fecha mientras se está escribiendo un plato nuevo borraba todo sin
    // avisar. Cargar lo ya guardado de un día sigue siendo solo con "Editar".
    const btn = document.getElementById('btn-guardar-menudia');
    if (btn && !btn._mdBound) {
      btn._mdBound = true;
      btn.addEventListener('click', async () => {
        const fecha = document.getElementById('md-fecha')?.value;
        if (!fecha) { SC?.toast('Elige una fecha.', 'error'); return; }
        const valores = _MD_CAMPOS.map(c => document.getElementById(c.input)?.value.trim() ?? '');
        if (!valores.some(Boolean)) { SC?.toast('Completa al menos un plato antes de guardar.', 'error'); return; }
        const productos = SC?.getAllProductosMergeados?.() ?? [];
        const payload = { mendia_fecha: fecha };
        _MD_CAMPOS.forEach((c, i) => {
          const valor = valores[i];
          const producto = valor ? productos.find(p => p.nombre.toLowerCase() === valor.toLowerCase()) : null;
          payload[c.idCol]    = producto ? producto.id : null;
          // Mismo estándar de nombres que productos/categorías/ingredientes:
          // primera letra de cada palabra en mayúscula.
          payload[c.textoCol] = (valor && !producto) ? _normalizarTitleCase(valor) : null;
        });
        btn.disabled = true;
        const { error } = await window.db.from('menu_dia').upsert(payload, { onConflict: 'mendia_fecha' });
        btn.disabled = false;
        if (error) { console.error('Supabase menu_dia upsert:', error); SC?.toast('Error al guardar el menú.', 'error'); return; }
        SC?.toast('Menú del día guardado ✓', 'success');
        // Deja el formulario listo para el siguiente día en vez de dejar lo
        // recién guardado ahí escrito — si se quiere volver a ver/editar,
        // está el botón "Editar" en el registro de abajo.
        _MD_CAMPOS.forEach(c => { const inp = document.getElementById(c.input); if (inp) inp.value = ''; });
        _md_toggleCancelar(false);
        await _md_renderProximos();
        if (fecha === _fechaLocalISO()) _renderDashboardMenuDia();
      });
    }
    const btnCancelar = document.getElementById('btn-cancelar-menudia');
    if (btnCancelar && !btnCancelar._mdBound) {
      btnCancelar._mdBound = true;
      btnCancelar.addEventListener('click', () => {
        // Vacía los 4 campos para empezar de cero — si lo que se quería era
        // volver a lo ya guardado, basta con tocar "Editar" de nuevo en el
        // registro de abajo.
        _MD_CAMPOS.forEach(c => { const inp = document.getElementById(c.input); if (inp) inp.value = ''; });
        _md_toggleCancelar(false);
        SC?.toast('Campos vacíos', 'success');
      });
    }
  }

  // "Cancelar" solo tiene sentido mientras se está editando algo que se
  // cargó con el botón "Editar" — el resto del tiempo queda oculto.
  function _md_toggleCancelar(mostrar) {
    const btn = document.getElementById('btn-cancelar-menudia');
    if (btn) btn.style.display = mostrar ? '' : 'none';
  }

  // Lista de los próximos 14 días que ya tienen algo planificado — clic en
  // cualquiera carga esa fecha en el editor de arriba para modificarla.
  // Funciona como un registro: incluye los últimos 14 días (lo que ya se
  // sirvió) y los próximos 14 (lo planificado), con hoy marcado aparte.
  async function _md_renderProximos() {
    const el = document.getElementById('md-semana-lista');
    if (!el) return;
    const SC = window.SC;
    const hoyISO = _fechaLocalISO();
    const hoy = new Date();
    const desdeDate = new Date(hoy); desdeDate.setDate(desdeDate.getDate() - 13);
    const hastaDate  = new Date(hoy); hastaDate.setDate(hastaDate.getDate() + 13);
    const { data, error } = await window.db.from('menu_dia').select(_MD_SELECT)
      .gte('mendia_fecha', _fechaLocalISO(desdeDate)).lte('mendia_fecha', _fechaLocalISO(hastaDate))
      .order('mendia_fecha', { ascending: false });
    if (error || !data?.length) {
      el.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted);font-size:.85rem;padding:1.25rem;text-align:center">Todavía no hay ningún menú registrado.</td></tr>';
      return;
    }
    el.innerHTML = data.map(d => {
      const esHoy = d.mendia_fecha === hoyISO;
      const diaSemana = new Date(d.mendia_fecha + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'long' });
      const diaMes    = new Date(d.mendia_fecha + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
      const celdaPlato = c => {
        const nombre = _md_nombreCampo(d, c);
        return nombre ? `<td data-label="${c.lbl}">${SC.escapeHtml(nombre)}</td>` : `<td class="md-td-vacio" data-label="${c.lbl}">Sin definir</td>`;
      };
      return `<tr class="md-fila${esHoy ? ' md-fila--hoy' : ''}" data-fecha="${d.mendia_fecha}">
        <td class="md-td-dia" data-label="Día">${SC.escapeHtml(diaSemana)}${esHoy ? ' <span class="md-semana-item__badge">HOY</span>' : ''}</td>
        <td class="md-td-fecha" data-label="Fecha">${SC.escapeHtml(diaMes)}</td>
        ${_MD_CAMPOS.map(celdaPlato).join('')}
        <td class="md-td-acciones" data-label="Acciones">
          <button class="md-semana-item__edit" data-fecha="${d.mendia_fecha}" type="button" title="Editar este menú" aria-label="Editar este menú">✏️</button>
          <button class="md-semana-item__del" data-fecha="${d.mendia_fecha}" type="button" title="Eliminar este menú" aria-label="Eliminar este menú">🗑️</button>
        </td>
      </tr>`;
    }).join('');
    el.querySelectorAll('.md-semana-item__edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return; // evita clics repetidos apilando el mismo toast
        btn.disabled = true;
        const fechaInput = document.getElementById('md-fecha');
        if (fechaInput) {
          fechaInput.value = btn.dataset.fecha;
          await _md_cargarFecha(btn.dataset.fecha);
        }
        btn.disabled = false;
        // El cambio de valores en los campos de arriba es fácil de pasar
        // por alto si la lista está lejos del editor — se resalta la caja
        // y se enfoca el primer campo para que sea evidente que ya cargó.
        const editorBox = document.querySelector('.md-editor');
        editorBox?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        editorBox?.classList.remove('md-editor--flash');
        void editorBox?.offsetWidth; // reinicia la animación si se clickea varias veces seguidas
        editorBox?.classList.add('md-editor--flash');
        document.getElementById('md-sopa')?.focus();
        _md_toggleCancelar(true);
        SC?.toast('Menú cargado — edítalo y presiona Guardar', 'success');
      });
    });
    el.querySelectorAll('.md-semana-item__del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fecha = btn.dataset.fecha;
        const fechaLbl = new Date(fecha + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'short' });
        const confirmado = await _modalConfirmar(fechaLbl, '¿Eliminar este menú del día?');
        if (!confirmado) return;
        const { error } = await window.db.from('menu_dia').delete().eq('mendia_fecha', fecha);
        if (error) { console.error('Supabase menu_dia delete:', error); SC?.toast('Error al eliminar el menú.', 'error'); return; }
        SC?.toast('Menú eliminado ✓', 'success');
        // Si la fecha borrada es la que está cargada en el editor, lo limpia.
        const fechaInput = document.getElementById('md-fecha');
        if (fechaInput?.value === fecha) _md_cargarFecha(fecha);
        await _md_renderProximos();
        if (fecha === _fechaLocalISO()) _renderDashboardMenuDia();
      });
    });
  }

  async function _renderDashboardMenuDia() {
    const el = document.getElementById('dash-menudia-hoy');
    if (!el) return;
    const SC = window.SC;
    const hoy = _fechaLocalISO();
    const { data } = await window.db.from('menu_dia').select(_MD_SELECT).eq('mendia_fecha', hoy).maybeSingle();
    const hayAlgo = data && _MD_CAMPOS.some(c => _md_nombreCampo(data, c));
    if (!hayAlgo) {
      el.innerHTML = `
        <div class="dash-menudia-empty">
          <div class="dash-menudia-empty__icon">🍽️</div>
          <p class="dash-menudia-empty__titulo">Próximamente</p>
          <p class="dash-menudia-empty__msg">Todavía no se ha registrado el menú de hoy.</p>
          <button type="button" id="btn-ir-menudia" class="adm-btn-primary">Registrarlo</button>
        </div>`;
      document.getElementById('btn-ir-menudia')?.addEventListener('click', () => _cambiarModulo('menudia'));
      return;
    }
    el.innerHTML = `<div class="dash-menudia-grid">${_MD_CAMPOS.map(c => {
      const nombre = _md_nombreCampo(data, c);
      return `<div class="dash-menudia-card">
        <div class="dash-menudia-card__icon">${c.icon}</div>
        <div class="dash-menudia-card__lbl">${c.lbl}</div>
        <div class="dash-menudia-card__nombre">${nombre ? SC.escapeHtml(nombre) : '<span style="color:var(--text-muted);font-style:italic">Sin definir</span>'}</div>
      </div>`;
    }).join('')}</div>`;
  }

  function _renderProductosGrid() {
    const SC   = window.SC;
    const grid = document.getElementById('admin-productos-grid');
    if (!grid) return;

    const todos = SC.getAllProductosMergeados ? SC.getAllProductosMergeados() : SC.getProductosMergeados();
    const porCat = {};
    todos.forEach(p => { if (!porCat[p.categoria]) porCat[p.categoria] = []; porCat[p.categoria].push(p); });
    const cats = _CATS_ORDER.filter(c => porCat[c]).concat(Object.keys(porCat).filter(c => !_CATS_ORDER.includes(c) && porCat[c]));

    const colores = SC.getCategoriasColores ? SC.getCategoriasColores() : {};
    grid.innerHTML = cats.map(cat => `
      <div class="admin-cat-section">
        <h3 class="admin-cat-title" data-cat="${cat}"${colores[cat] ? ` style="--cat-c:${colores[cat]}"` : ''}>${cat} <span class="admin-cat-count">${porCat[cat].length}</span></h3>
        <div class="admin-cat-grid">${porCat[cat].map(_renderAdminCard).join('')}</div>
      </div>`).join('');

    if (window.matchMedia('(hover: none)').matches) {
      grid.querySelectorAll('.admin-card-wrap').forEach(wrap => {
        wrap.addEventListener('click', e => {
          if (e.target.closest('[data-action]')) return;
          grid.querySelectorAll('.admin-card-wrap.tapped').forEach(w => { if (w !== wrap) w.classList.remove('tapped'); });
          wrap.classList.toggle('tapped');
        });
      });
    }

    grid.onclick = async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id  = btn.dataset.id;
      const all = SC.getAllProductosMergeados ? SC.getAllProductosMergeados() : SC.getProductosMergeados();
      const prod = all.find(p => String(p.id) === String(id));

      if (btn.dataset.action === 'editar') {
        if (prod) abrirFormProducto(prod);
      } else if (btn.dataset.action === 'eliminar') {
        const confirmado = await _modalConfirmar(prod?.nombre ?? 'este producto');
        if (!confirmado) return;
        btn.disabled = true;
        const resultado = await SC.eliminarMenuItemDB(id);
        if (resultado === 'en_uso') {
          btn.disabled = false;
          SC.toast('No se puede eliminar: ya tiene pedidos en su historial. Desactívalo en su lugar (edítalo y desmarca "Visible en el menú").', 'error');
          return;
        }
        _renderProductosGrid();
        _renderDashboardStats();
        const cat = SC.getFiltroSesion();
        window.VistaMenu?.renderProductos(window.VistaMenu?.getListaByCat(cat));
        if (resultado === true) SC.toast('Producto eliminado ✓', 'success');
        else                    SC.toast('Error al eliminar el producto. Intenta de nuevo.', 'error');
      }
    };
  }

  function _initAdminNav() {
    // Nav items
    document.querySelectorAll('.adm-nav__item[data-mod]').forEach(btn => {
      btn.addEventListener('click', () => _cambiarModulo(btn.dataset.mod));
    });
    // Quick cards en dashboard
    document.querySelectorAll('.adm-quick-card[data-mod]').forEach(btn => {
      btn.addEventListener('click', () => _cambiarModulo(btn.dataset.mod));
    });
    // Hamburger toggle
    document.getElementById('adm-menu-toggle')?.addEventListener('click', () => {
      const sidebar  = document.getElementById('adm-sidebar');
      const overlay  = document.getElementById('adm-overlay');
      const isOpen   = sidebar?.classList.toggle('open');
      overlay?.classList.toggle('visible', isOpen);
      document.getElementById('adm-menu-toggle')?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    // Cerrar sidebar al hacer clic en overlay
    document.getElementById('adm-overlay')?.addEventListener('click', () => {
      document.getElementById('adm-sidebar')?.classList.remove('open');
      document.getElementById('adm-overlay')?.classList.remove('visible');
    });
    // Tabs de período en reportes
    document.querySelectorAll('.rep-tab[data-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.period === 'hoy') _repDiaOffset = 0; // volver al día actual al re-entrar al tab
        renderReportes(btn.dataset.period);
      });
    });
    // Navegación día a día dentro del tab "Hoy"
    document.getElementById('rep-dia-ant')?.addEventListener('click', () => { _repDiaOffset--; renderReportes('hoy'); });
    document.getElementById('rep-dia-sig')?.addEventListener('click', () => {
      if (_repDiaOffset < 0) { _repDiaOffset++; renderReportes('hoy'); }
    });
    // Exportar reporte actual a Excel (auditoría)
    document.getElementById('btn-exportar-reporte')?.addEventListener('click', _exportarReporteExcel);
    // Refrescar pedidos
    document.getElementById('btn-refrescar-pedidos')?.addEventListener('click', renderAdminPedidos);
    // Cerrar sesión
    document.getElementById('btn-admin-cerrar-sesion')?.addEventListener('click', () => {
      window.ModuloAutenticacion.clearSession();
      location.reload();
    });
  }

  function _initAdminUserInfo() {
    const session = window.ModuloAutenticacion.getSession();
    if (!session) return;
    const nombre = session.nombre ?? 'Administrador';
    const inicial = nombre.charAt(0).toUpperCase();
    const avatarEl = document.getElementById('adm-user-avatar');
    const nameEl   = document.getElementById('adm-user-name');
    const topbarUser = document.getElementById('adm-topbar-user');
    if (avatarEl)   avatarEl.textContent  = inicial;
    if (nameEl)     nameEl.textContent    = nombre;
    if (topbarUser) topbarUser.textContent = nombre;
    const welcomeEl = document.getElementById('adm-welcome-title');
    if (welcomeEl) {
      const h = new Date().getHours();
      const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
      welcomeEl.textContent = `${saludo}, ${nombre}`;
    }
  }

  function renderAdminView() {
    const adminView = document.getElementById('admin-view');
    if (!adminView || !adminView.classList.contains('visible')) return;

    _initAdminUserInfo();
    _cambiarModulo(localStorage.getItem('sc_admin_mod') || 'dashboard');

    // KPI cards clickeables
    adminView.querySelectorAll('.adm-kpi--link[data-goto]').forEach(card => {
      card.addEventListener('click', () => _cambiarModulo(card.dataset.goto));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _cambiarModulo(card.dataset.goto); } });
    });
  }

  async function renderMensajes() {
    const el = document.getElementById('admin-mensajes-lista');
    if (!el) return;

    el.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;padding:.5rem 0">Cargando mensajes…</p>';

    // Requiere sesión de administrador vigente — ver sql/hardening-rls.sql.
    const token = window.ModuloAutenticacion?.getSession?.()?.token ?? null;
    const { data, error } = await window.db.rpc('admin_listar_mensajes', { p_token: token });

    if (error || !data) {
      el.innerHTML = '<p style="color:#dc2626;font-size:.9rem">Error al cargar mensajes.</p>';
      return;
    }

    const noLeidos = data.filter(m => !m.mens_leido).length;
    // Badge en sidebar nav
    const badge = document.getElementById('admin-mensajes-badge');
    if (badge) { badge.textContent = noLeidos; badge.style.display = noLeidos > 0 ? '' : 'none'; }
    // KPI en dashboard
    const statMensajes = document.getElementById('admin-stat-mensajes');
    if (statMensajes) statMensajes.textContent = noLeidos;

    if (!data.length) {
      el.innerHTML = `<div class="admin-msg-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        No hay mensajes todavía.
      </div>`;
      return;
    }

    const svgEmail = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
    const svgPhone = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.45 2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.83a16 16 0 0 0 6.26 6.26l.88-.87a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.9 16.92z"/></svg>`;
    el.innerHTML = data.map(m => {
      const fecha = new Date(m.mens_enviado_en).toLocaleString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      const iniciales = m.mens_nombre.trim().split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
      return `
        <div class="admin-msg-card${m.mens_leido ? ' leido' : ''}" data-msg-id="${m.mens_id}">
          <div class="admin-msg-avatar">${iniciales}</div>
          <div class="admin-msg-body">
            <div class="admin-msg-head">
              <div class="admin-msg-quien">
                <span class="admin-msg-nombre">${m.mens_nombre}</span>
                ${!m.mens_leido ? '<span class="admin-msg-new">Nuevo</span>' : ''}
              </div>
              <span class="admin-msg-fecha">${fecha}</span>
            </div>
            <div class="admin-msg-contacto">
              <span>${svgEmail} ${m.mens_email}</span>
              ${m.mens_telefono ? `<span>${svgPhone} ${m.mens_telefono}</span>` : ''}
            </div>
            <p class="admin-msg-texto">${m.mens_mensaje}</p>
            ${!m.mens_leido ? `<button class="admin-msg-btn-leido" data-id="${m.mens_id}">Marcar como leído</button>` : ''}
          </div>
        </div>`;
    }).join('');

    el.querySelectorAll('.admin-msg-btn-leido').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const { error } = await window.db.rpc('admin_marcar_mensaje_leido', { p_token: token, p_mens_id: id });
        if (error) { window.SC?.toast('Error al marcar el mensaje', 'error'); return; }
        renderMensajes();
      };
    });
  }

  function abrirFormProducto(p) {
    const SC = window.SC;
    _prodFormEditId    = p ? p.id : null;
    _prodFormImgBase64 = null;

    document.getElementById('prod-form-title').textContent = p ? 'Editar Producto' : 'Agregar Producto';
    document.getElementById('pf-nombre').value       = p?.nombre      ?? '';
    // Categorías en un <select> — siempre se ofrece el catálogo estándar
    // del negocio (_CATS_ORDER) aunque todavía no haya platos guardados con
    // ellas, más cualquier categoría personalizada que ya se haya creado;
    // el admin también puede abrir "+ Agregar categoría nueva…" para
    // escribir un nombre distinto (guardarMenuItemDB la crea en Supabase).
    const catSelect = document.getElementById('pf-categoria');
    const catsPersonalizadas = [...new Set([
      ...SC.getAllProductosMergeados().map(x => x.categoria).filter(Boolean),
      ...Object.keys(SC.getCategoriasColores ? SC.getCategoriasColores() : {}),
    ])]
      .filter(c => !_CATS_ORDER.includes(c))
      .sort();
    const categoriasExistentes = [..._CATS_ORDER, ...catsPersonalizadas];
    if (catSelect) {
      catSelect.innerHTML = '<option value="">Elige una categoría…</option>'
        + categoriasExistentes.map(c => `<option value="${SC.escapeHtml(c)}">${SC.escapeHtml(c)}</option>`).join('')
        + '<option value="__nueva__">+ Agregar categoría nueva…</option>';
      catSelect.value = (p?.categoria && categoriasExistentes.includes(p.categoria)) ? p.categoria : '';
    }
    document.getElementById('pf-precio').value       = p?.precio != null ? (+p.precio).toFixed(2) : '';
    document.getElementById('pf-descripcion').value  = p?.descripcion ?? '';
    document.getElementById('pf-tag').value               = p?.tag            ?? '';
    document.getElementById('pf-visible').checked         = p ? (p.activo !== false) : true;
    document.getElementById('pf-destacado').checked       = p?.destacado      ?? false;
    document.getElementById('pf-permite-excluir').checked = p?.permiteExcluir ?? false;
    document.getElementById('pf-stock').value        = p ? SC.getStock(p.id).stock : '';
    const ingsArr = Array.isArray(p?.ingredientes) ? p.ingredientes : [];
    const ings = ingsArr.map(i => typeof i === 'string' ? i : i.nombre).join(', ');
    document.getElementById('pf-ingredientes').value = ings;
    document.getElementById('pf-imagen').value       = '';

    const gruposLista = document.getElementById('pf-grupos-lista');
    if (gruposLista) gruposLista.innerHTML = '';
    const gruposExistentes = Array.isArray(p?.gruposOpciones) ? p.gruposOpciones : [];
    gruposExistentes.forEach(g => _agregarFilaGrupoOpcion(g.nombre, (g.opciones ?? []).map(o => o.nombre).join(', ')));
    const gruposErr = document.getElementById('pf-grupos-error');
    if (gruposErr) gruposErr.style.display = 'none';

    const imgActual      = document.getElementById('pf-img-actual');
    const imgPlaceholder = document.getElementById('pf-img-placeholder');
    if (p?.imagen) {
      imgActual.src = p.imagen;
      imgActual.style.display      = '';
      imgPlaceholder.style.display = 'none';
      _prodFormImgBase64 = p.imagen;
    } else {
      imgActual.src                = '';
      imgActual.style.display      = 'none';
      imgPlaceholder.style.display = '';
    }

    const backdrop = document.getElementById('prod-form-backdrop');
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    window._trapProdForm?.activar();
  }

  function _modalConfirmar(nombre, titulo = '¿Eliminar producto?') {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:2rem 1.75rem 1.5rem;max-width:360px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.3);text-align:center;animation:fadeUp .18s ease;">
          <div style="font-size:2.5rem;line-height:1;margin-bottom:.75rem;">🗑️</div>
          <h3 style="font-size:1.1rem;font-weight:700;color:#3B1A08;margin-bottom:.4rem;">${titulo}</h3>
          <p style="color:#7A5640;font-size:.88rem;margin-bottom:1.5rem;line-height:1.5;">
            Se eliminará permanentemente<br><strong style="color:#C8561A;">"${nombre}"</strong>.<br>Esta acción no se puede deshacer.
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

  function _modalEstado(nombre, esActivo) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
      const icono  = esActivo ? '🔒' : '🔓';
      const accion = esActivo ? 'Inhabilitar' : 'Habilitar';
      const desc   = esActivo
        ? `<strong style="color:#C8561A;">"${nombre}"</strong> no podrá iniciar sesión hasta que sea reactivado.`
        : `<strong style="color:#C8561A;">"${nombre}"</strong> podrá volver a iniciar sesión con su contraseña.`;
      const colorBtn = esActivo ? '#dc2626' : '#16a34a';
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:2rem 1.75rem 1.5rem;max-width:360px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.3);text-align:center;animation:fadeUp .18s ease;">
          <div style="font-size:2.5rem;line-height:1;margin-bottom:.75rem;">${icono}</div>
          <h3 style="font-size:1.1rem;font-weight:700;color:#3B1A08;margin-bottom:.4rem;">¿${accion} empleado?</h3>
          <p style="color:#7A5640;font-size:.88rem;margin-bottom:1.5rem;line-height:1.5;">${desc}</p>
          <div style="display:flex;gap:.75rem;justify-content:center;">
            <button id="_est-cancel" style="flex:1;padding:.65rem 1rem;border:1.5px solid #E0C9B0;border-radius:10px;background:#fff;color:#7A5640;cursor:pointer;font-size:.88rem;font-weight:600;">Cancelar</button>
            <button id="_est-ok" style="flex:1;padding:.65rem 1rem;border:none;border-radius:10px;background:${colorBtn};color:#fff;cursor:pointer;font-size:.88rem;font-weight:700;">Sí, ${accion.toLowerCase()}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const cleanup = val => { document.body.removeChild(overlay); resolve(val); };
      overlay.querySelector('#_est-ok').addEventListener('click', () => cleanup(true));
      overlay.querySelector('#_est-cancel').addEventListener('click', () => cleanup(false));
      overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', esc); cleanup(false); }
      });
    });
  }

  function cerrarFormProducto() {
    const backdrop = document.getElementById('prod-form-backdrop');
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    _prodFormImgBase64 = null;
    _prodFormEditId    = null;
    _mostrarErrorNombre('');
    _mostrarErrorCategoria('');
    _mostrarErrorPrecio('');
    _mostrarErrorDescripcion('');
    _mostrarErrorIngredientes('');
    _mostrarErrorStock('');
    _mostrarErrorImagen('');
    window._trapProdForm?.desactivar();
  }

  function _setupDragDrop() {
    const pfImagen = document.getElementById('pf-imagen');
    if (pfImagen) pfImagen.style.display = 'none';

    const processFile = async file => {
      if (!file || !file.type.startsWith('image/')) {
        window.SC?.toast('Solo se aceptan imágenes', 'error');
        return;
      }
      const base64 = await window.SC.comprimirImagen(file);
      /* Si el formulario se cerró/reinició mientras procesaba, descartar */
      if (!document.getElementById('prod-form-backdrop').classList.contains('open')) return;
      _prodFormImgBase64 = base64;
      const imgActual = document.getElementById('pf-img-actual');
      imgActual.src = _prodFormImgBase64;
      imgActual.style.display = '';
      document.getElementById('pf-img-placeholder').style.display = 'none';
      _mostrarErrorImagen('');
    };

    document.getElementById('btn-elegir-imagen')?.addEventListener('click', e => {
      e.stopPropagation();
      pfImagen?.click();
    });

    pfImagen?.addEventListener('change', async () => {
      await processFile(pfImagen.files?.[0]);
      pfImagen.value = '';
    });

    const preview = document.getElementById('pf-img-preview');
    if (preview) {
      preview.addEventListener('dragover', e => { e.preventDefault(); preview.style.outline = '2.5px dashed var(--cinnamon)'; preview.style.opacity = '.85'; });
      preview.addEventListener('dragleave', e => { if (!preview.contains(e.relatedTarget)) { preview.style.outline = ''; preview.style.opacity = ''; } });
      preview.addEventListener('drop', async e => {
        e.preventDefault();
        preview.style.outline = '';
        preview.style.opacity = '';
        await processFile(e.dataTransfer?.files?.[0]);
      });
    }
  }

  const NOMBRE_LETRA_RE = /[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/;

  function _validarNombre(valor) {
    const v = valor.trim();
    if (!v)                       return 'El nombre es obligatorio.';
    if (v.length < 2)             return 'El nombre debe tener al menos 2 caracteres.';
    if (!NOMBRE_LETRA_RE.test(v)) return 'El nombre debe contener al menos una letra.';
    return '';
  }

  function _validarPrecio(valor) {
    const v = parseFloat(valor);
    if (valor === '' || valor === null || isNaN(v) || v <= 0) return 'El precio debe ser mayor a $0.00';
    if (v > 99.99) return 'El precio no puede superar $99.99';
    return '';
  }

  function _validarStock(valor) {
    if (valor === '' || valor === null) return ''; // vacío = usa el default (20), no es error
    const v = Number(valor);
    if (!Number.isInteger(v) || v < 0) return 'El stock debe ser un número entero mayor o igual a 0.';
    if (v > 999) return 'El stock no puede superar 999 unidades.';
    return '';
  }

  function _validarEmail(valor) {
    const v = valor.trim().toLowerCase();
    if (!_EF_EMAIL_RE.test(v)) return 'Formato de correo inválido.';
    const dominio = v.split('@')[1];
    if (!_EF_DOMINIOS.has(dominio)) return 'Usa un correo conocido (Gmail, Outlook, Yahoo, etc.).';
    return '';
  }

  // Estándar de nombres (categorías y platos): primera letra de cada
  // palabra en mayúscula, el resto en minúscula (ej. "SOPAS" o "bebidas
  // calientes" quedan como "Sopas" / "Bebidas Calientes") — sin importar
  // cómo lo escriba el administrador.
  function _normalizarTitleCase(nombre) {
    // Antes se dividía por espacios y solo se tocaba el primer carácter de
    // cada trozo — con algo como "(milanesa" ese primer carácter es "(",
    // así que la "m" nunca se capitalizaba y quedaba pegada en minúscula
    // sin importar cuántas veces se guardara. Capitalizar cada RACHA de
    // letras (en vez de usar \b, cuyo límite de palabra en JS no reconoce
    // letras acentuadas como "é" y las cortaba a la mitad) arregla ambos
    // casos: funciona pegado a paréntesis y no rompe acentos.
    return nombre.trim().replace(/\p{L}+/gu, palabra => {
      // Si el admin escribió una palabra CORTA toda en mayúsculas (ej.
      // "BBQ"), se asume que es una sigla a propósito y se deja tal cual
      // — solo para palabras cortas, para que categorías escritas todo en
      // mayúscula sin querer (ej. "SOPAS") se sigan normalizando a "Sopas".
      if (palabra.length >= 2 && palabra.length <= 4 && palabra === palabra.toUpperCase()) return palabra;
      const min = palabra.toLowerCase();
      return min.charAt(0).toUpperCase() + min.slice(1);
    });
  }

  function _parsearNombresIngredientes(valor) {
    return valor.split(',').map(s => s.trim()).filter(Boolean).map(_normalizarTitleCase);
  }

  function _validarIngredientes(valor) {
    const v = valor.trim();
    if (!v) return 'Los ingredientes son obligatorios.';
    if (!_parsearNombresIngredientes(v).length) return 'Ingresa al menos un ingrediente.';
    return '';
  }

  // ── Grupos de opciones ("elige 1 de N") en el form de producto ──
  function _filaGrupoOpcionHtml(nombre, opcionesStr) {
    return `
      <div class="grupo-op-row">
        <input type="text" class="grupo-op-titulo" placeholder='Ej: Elige tu bebida' value="${window.SC.escapeHtml(nombre)}">
        <input type="text" class="grupo-op-opciones" placeholder="Ej: Café, Leche, Agua Aromática" value="${window.SC.escapeHtml(opcionesStr)}">
        <button type="button" class="grupo-op-quitar" title="Quitar grupo" aria-label="Quitar grupo">✕</button>
      </div>`;
  }
  function _agregarFilaGrupoOpcion(nombre = '', opcionesStr = '') {
    const lista = document.getElementById('pf-grupos-lista');
    if (!lista) return;
    lista.insertAdjacentHTML('beforeend', _filaGrupoOpcionHtml(nombre, opcionesStr));
  }
  function _initGruposOpcionesForm() {
    document.getElementById('btn-agregar-grupo')?.addEventListener('click', () => _agregarFilaGrupoOpcion());
    document.getElementById('pf-grupos-lista')?.addEventListener('click', e => {
      const btn = e.target.closest('.grupo-op-quitar');
      if (btn) btn.closest('.grupo-op-row')?.remove();
    });
  }
  // Lee las filas del DOM y arma [{nombre, opciones:[...]}], ignorando
  // filas vacías. Devuelve también un mensaje de error si algún grupo
  // tiene título pero menos de 2 opciones (no tendría sentido "elegir 1").
  function _leerGruposOpcionesForm() {
    const filas = [...document.querySelectorAll('#pf-grupos-lista .grupo-op-row')];
    const grupos = [];
    for (const fila of filas) {
      const nombre  = fila.querySelector('.grupo-op-titulo')?.value.trim() ?? '';
      const opciones = (fila.querySelector('.grupo-op-opciones')?.value ?? '')
        .split(',').map(s => s.trim()).filter(Boolean);
      if (!nombre && !opciones.length) continue; // fila vacía, se ignora
      if (!nombre)            return { error: 'Falta el título de un grupo de opciones.' };
      if (opciones.length < 2) return { error: `El grupo "${nombre}" necesita al menos 2 opciones.` };
      grupos.push({ nombre, opciones });
    }
    return { grupos };
  }

  function _mostrarError(inputId, errorId, msg) {
    const inp = document.getElementById(inputId);
    const err = document.getElementById(errorId);
    if (!inp || !err) return;
    if (msg) {
      inp.style.borderColor = '#dc2626';
      err.textContent = msg;
      err.style.display = 'block';
    } else {
      inp.style.borderColor = '';
      err.textContent = '';
      err.style.display = 'none';
    }
  }

  const _mostrarErrorNombre      = msg => _mostrarError('pf-nombre',      'pf-nombre-error',      msg);
  // La categoría nueva ahora se crea en su propio modal (con color), así
  // que el select siempre termina con un nombre real seleccionado — nunca
  // se queda parado en "__nueva__" salvo mientras el modal está abierto.
  const _mostrarErrorCategoria   = msg => _mostrarError('pf-categoria',   'pf-categoria-error',   msg);
  const _leerCategoriaForm       = () => document.getElementById('pf-categoria')?.value.trim() ?? '';
  const _mostrarErrorPrecio      = msg => _mostrarError('pf-precio',      'pf-precio-error',      msg);
  const _mostrarErrorDescripcion = msg => _mostrarError('pf-descripcion', 'pf-descripcion-error', msg);
  const _mostrarErrorIngredientes= msg => _mostrarError('pf-ingredientes','pf-ingredientes-error', msg);
  const _mostrarErrorStock       = msg => _mostrarError('pf-stock',       'pf-stock-error',       msg);

  function _mostrarErrorImagen(msg) {
    const preview = document.getElementById('pf-img-preview');
    const err     = document.getElementById('pf-imagen-error');
    if (!preview || !err) return;
    if (msg) {
      preview.style.outline = '2px solid #dc2626';
      err.textContent = msg;
      err.style.display = 'block';
    } else {
      preview.style.outline = '';
      err.textContent = '';
      err.style.display = 'none';
    }
  }

  // Paleta ofrecida al crear una categoría nueva. Los primeros 9 colores ya
  // están asignados de fábrica a las 9 categorías estándar del negocio
  // (Desayunos, Entradas, Almuerzos, Platos Fuertes, Sopas, Bocaditos,
  // Bebidas Calientes, Bebidas Frías, Postres) — por eso siempre van a
  // aparecer "en uso". El resto queda libre para categorías personalizadas;
  // se deja una paleta amplia para que nunca se quede sin colores nuevos.
  const _PALETA_CATEGORIAS = [
    '#C4890A', '#B8720A', '#7A2215', '#8B4F9F', '#1F6F78', '#A0751A', '#6B3A1F', '#2E7A5B', '#9B4520',
    '#5B7A3A', '#B8455C', '#4A5A6B', '#C25B3D', '#D4A017', '#7C9C6B', '#A63A50',
    '#3D5A80', '#E0A96D', '#5C4033', '#8C7853', '#4E6E58', '#9C5A8C',
  ];

  let _catModalColorSel   = null;
  let _catModalValorPrevio = '';

  function _abrirModalCategoria() {
    const SC = window.SC;
    const nombreInp = document.getElementById('cat-modal-nombre');
    const nombreErr = document.getElementById('cat-modal-nombre-error');
    const colorErr  = document.getElementById('cat-modal-color-error');
    const swatches  = document.getElementById('cat-modal-swatches');
    if (nombreInp) nombreInp.value = '';
    if (nombreErr) { nombreErr.textContent = ''; nombreErr.style.display = 'none'; }
    if (colorErr)  { colorErr.textContent  = ''; colorErr.style.display  = 'none'; }
    _catModalColorSel = null;

    // Invierte { categoría: color } a { color: categoría } para poder
    // mostrar "en uso por X" y deshabilitar ese color en la paleta.
    const colorAUsuario = {};
    Object.entries(SC.getCategoriasColores()).forEach(([nombre, color]) => {
      colorAUsuario[color.toLowerCase()] = nombre;
    });

    if (swatches) {
      swatches.innerHTML = _PALETA_CATEGORIAS.map(hex => {
        const usadaPor = colorAUsuario[hex.toLowerCase()];
        return `<button type="button" class="cat-swatch${usadaPor ? ' cat-swatch--used' : ''}"
          style="background:${hex}" data-color="${hex}" ${usadaPor ? 'disabled' : ''}
          title="${usadaPor ? `En uso: ${SC.escapeHtml(usadaPor)}` : hex}"
          aria-label="Color ${hex}${usadaPor ? ` (en uso por ${SC.escapeHtml(usadaPor)})` : ''}"></button>`;
      }).join('');
    }

    const backdrop = document.getElementById('cat-modal-backdrop');
    if (backdrop) {
      backdrop.classList.add('open');
      backdrop.setAttribute('aria-hidden', 'false');
      setTimeout(() => nombreInp?.focus(), 100);
    }
  }

  // revertir=true: el admin canceló, así que el select de categoría vuelve
  // a lo que tenía antes de abrir "+ Agregar categoría nueva…".
  function _cerrarModalCategoria(revertir) {
    const backdrop = document.getElementById('cat-modal-backdrop');
    if (backdrop) { backdrop.classList.remove('open'); backdrop.setAttribute('aria-hidden', 'true'); }
    if (revertir) {
      const sel = document.getElementById('pf-categoria');
      if (sel) sel.value = _catModalValorPrevio;
    }
  }

  async function _confirmarNuevaCategoria() {
    const SC = window.SC;
    const sel       = document.getElementById('pf-categoria');
    const nombreInp = document.getElementById('cat-modal-nombre');
    const nombreErr = document.getElementById('cat-modal-nombre-error');
    const colorErr  = document.getElementById('cat-modal-color-error');
    const nombre    = _normalizarTitleCase(nombreInp?.value ?? '');

    const yaExiste = [...sel.options].some(o => o.value !== '__nueva__' && o.value.toLowerCase() === nombre.toLowerCase());
    let err = '';
    if (!nombre)             err = 'Escribe el nombre de la categoría.';
    else if (nombre.length < 2) err = 'El nombre debe tener al menos 2 caracteres.';
    else if (yaExiste)       err = 'Ya existe una categoría con ese nombre.';
    if (nombreErr) { nombreErr.textContent = err; nombreErr.style.display = err ? 'block' : 'none'; }
    if (err) { nombreInp?.focus(); return; }

    if (!_catModalColorSel) {
      if (colorErr) { colorErr.textContent = 'Elige un color.'; colorErr.style.display = 'block'; }
      return;
    }
    if (colorErr) { colorErr.textContent = ''; colorErr.style.display = 'none'; }

    const btn = document.getElementById('btn-confirmar-cat-modal');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando…'; }
    const ok = await SC.crearCategoriaConColor(nombre, _catModalColorSel);
    if (btn) { btn.disabled = false; btn.textContent = 'Crear categoría'; }
    if (!ok) { SC.toast('Error al crear la categoría. Intenta de nuevo.', 'error'); return; }

    const opt = document.createElement('option');
    opt.value = nombre;
    opt.textContent = nombre;
    sel.insertBefore(opt, sel.querySelector('option[value="__nueva__"]'));
    sel.value = nombre;
    _catModalValorPrevio = nombre;
    _mostrarErrorCategoria('');
    _cerrarModalCategoria(false);
    SC.toast(`Categoría "${nombre}" creada ✓`, 'success');
  }

  function _initModalCategoria() {
    document.getElementById('cat-modal-swatches')?.addEventListener('click', e => {
      const btn = e.target.closest('.cat-swatch');
      if (!btn || btn.disabled) return;
      _catModalColorSel = btn.dataset.color;
      document.querySelectorAll('#cat-modal-swatches .cat-swatch').forEach(s => s.classList.remove('cat-swatch--selected'));
      btn.classList.add('cat-swatch--selected');
      const colorErr = document.getElementById('cat-modal-color-error');
      if (colorErr) { colorErr.textContent = ''; colorErr.style.display = 'none'; }
    });
    document.getElementById('btn-confirmar-cat-modal')?.addEventListener('click', _confirmarNuevaCategoria);
    document.getElementById('btn-cancelar-cat-modal')?.addEventListener('click', () => _cerrarModalCategoria(true));
    document.getElementById('btn-cerrar-cat-modal')?.addEventListener('click', () => _cerrarModalCategoria(true));
    document.getElementById('cat-modal-backdrop')?.addEventListener('click', e => {
      if (e.target.id === 'cat-modal-backdrop') _cerrarModalCategoria(true);
    });
    document.getElementById('cat-modal-nombre')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _confirmarNuevaCategoria(); }
    });
  }

  function init() {
    _setupDragDrop();
    _initGruposOpcionesForm();

    // Cocinero es un rol exclusivo — no se combina con Cajero/Mesero
    // (ver ef-rol-hint en el formulario). Se hace cumplir acá mismo,
    // desmarcando lo que corresponda cuando se elige uno del otro grupo.
    document.getElementById('ef-rol-group')?.addEventListener('change', e => {
      const cb = e.target;
      if (!cb.matches('input[type="checkbox"]')) return;
      const cocinero = document.getElementById('ef-rol-rol005');
      const cajero   = document.getElementById('ef-rol-rol002');
      const mesero   = document.getElementById('ef-rol-rol003');
      if (cb === cocinero && cocinero.checked) {
        cajero.checked = false;
        mesero.checked = false;
      } else if ((cb === cajero || cb === mesero) && cb.checked) {
        cocinero.checked = false;
      }
    });

    const pfNombre = document.getElementById('pf-nombre');
    pfNombre.addEventListener('input', () => _mostrarErrorNombre(_validarNombre(pfNombre.value)));
    pfNombre.addEventListener('blur',  () => _mostrarErrorNombre(_validarNombre(pfNombre.value)));

    const pfPrecio = document.getElementById('pf-precio');
    pfPrecio.addEventListener('input', () => { if (pfPrecio.value) _mostrarErrorPrecio(_validarPrecio(pfPrecio.value)); });
    pfPrecio.addEventListener('blur',  () => _mostrarErrorPrecio(_validarPrecio(pfPrecio.value)));

    const pfStock = document.getElementById('pf-stock');
    pfStock.addEventListener('input', () => _mostrarErrorStock(_validarStock(pfStock.value)));
    pfStock.addEventListener('blur',  () => _mostrarErrorStock(_validarStock(pfStock.value)));

    const pfCategoria = document.getElementById('pf-categoria');
    // Guarda el valor "real" (no "__nueva__") antes de que el usuario abra
    // el desplegable, para poder restaurarlo si cancela el modal de categoría.
    pfCategoria.addEventListener('mousedown', () => {
      if (pfCategoria.value !== '__nueva__') _catModalValorPrevio = pfCategoria.value;
    });
    pfCategoria.addEventListener('focus', () => {
      if (pfCategoria.value !== '__nueva__') _catModalValorPrevio = pfCategoria.value;
    });
    pfCategoria.addEventListener('change', () => {
      if (pfCategoria.value === '__nueva__') { _abrirModalCategoria(); return; }
      _catModalValorPrevio = pfCategoria.value;
      _mostrarErrorCategoria('');
    });
    pfCategoria.addEventListener('blur', () => {
      if (pfCategoria.value === '__nueva__') return; // el modal está manejando la selección
      _mostrarErrorCategoria(_leerCategoriaForm() ? '' : 'Elige o escribe una categoría.');
    });
    _initModalCategoria();

    const pfDesc = document.getElementById('pf-descripcion');
    pfDesc.addEventListener('blur', () => _mostrarErrorDescripcion(pfDesc.value.trim() ? '' : 'La descripción es obligatoria.'));

    const pfIng = document.getElementById('pf-ingredientes');
    pfIng.addEventListener('blur',  () => _mostrarErrorIngredientes(_validarIngredientes(pfIng.value)));
    pfIng.addEventListener('input', () => { if (pfIng.value) _mostrarErrorIngredientes(_validarIngredientes(pfIng.value)); });

    document.getElementById('btn-cerrar-prod-form').addEventListener('click', cerrarFormProducto);
    document.getElementById('btn-prod-cancel').addEventListener('click', cerrarFormProducto);
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && document.getElementById('prod-form-backdrop').classList.contains('open')) {
        cerrarFormProducto();
      }
    });
    document.getElementById('btn-agregar-producto').addEventListener('click', () => abrirFormProducto(null));

    document.getElementById('btn-prod-save').addEventListener('click', async () => {
      const SC     = window.SC;
      const nombre        = _normalizarTitleCase(document.getElementById('pf-nombre').value);
      const categoria     = _leerCategoriaForm();
      // El input es type="number" (el navegador ya normaliza a punto), pero
      // por si acaso llega una coma (pegado, teclado numérico, etc.) se
      // normaliza aquí — siempre se procesa con punto internamente.
      const precioRaw     = document.getElementById('pf-precio').value.replace(',', '.');
      const precio        = Math.round(parseFloat(precioRaw) * 100) / 100;
      const descripcion   = document.getElementById('pf-descripcion').value.trim();
      const ingredientesRaw = document.getElementById('pf-ingredientes').value.trim();
      const stockRaw      = document.getElementById('pf-stock').value;

      const errNombre = _validarNombre(nombre);
      const errPrecio = _validarPrecio(precioRaw);
      const errIng    = _validarIngredientes(ingredientesRaw);
      const errStock  = _validarStock(stockRaw);
      const errCategoria = categoria ? '' : 'Elige o escribe una categoría.';
      const { grupos: gruposOpciones, error: errGrupos } = _leerGruposOpcionesForm();

      _mostrarErrorNombre(errNombre);
      _mostrarErrorCategoria(errCategoria);
      _mostrarErrorPrecio(errPrecio);
      _mostrarErrorDescripcion(!descripcion ? 'La descripción es obligatoria.' : '');
      _mostrarErrorIngredientes(errIng);
      _mostrarErrorStock(errStock);
      const gruposErrEl = document.getElementById('pf-grupos-error');
      if (gruposErrEl) { gruposErrEl.textContent = errGrupos ?? ''; gruposErrEl.style.display = errGrupos ? 'block' : 'none'; }

      if (errNombre)    { document.getElementById('pf-nombre').focus(); return; }
      if (errCategoria) { document.getElementById('pf-categoria').focus(); return; }
      if (errPrecio)    { document.getElementById('pf-precio').focus(); return; }
      if (!descripcion) { document.getElementById('pf-descripcion').focus(); return; }
      if (errIng)       { document.getElementById('pf-ingredientes').focus(); return; }
      if (errStock)     { document.getElementById('pf-stock').focus(); return; }
      if (errGrupos)    return;

      /* Verificar nombre duplicado — primero local, luego en Supabase */
      const normStr = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      const duplicadoLocal = SC.getProductosMergeados().find(p =>
        p.id !== (_prodFormEditId ?? -1) && normStr(p.nombre) === normStr(nombre)
      );
      if (duplicadoLocal) {
        _mostrarErrorNombre(`Ya existe un plato con el nombre "${duplicadoLocal.nombre}".`);
        document.getElementById('pf-nombre').focus();
        return;
      }
      /* Consulta directa a Supabase para detectar duplicados de otras sesiones */
      const { data: dbRows } = await window.db.from('platos')
        .select('plat_id, plat_nombre')
        .ilike('plat_nombre', nombre);
      const duplicadoDB = (dbRows || []).find(r =>
        r.plat_id !== _prodFormEditId &&
        normStr(r.plat_nombre) === normStr(nombre)
      );
      if (duplicadoDB) {
        _mostrarErrorNombre(`Ya existe un plato con el nombre "${duplicadoDB.plat_nombre}".`);
        document.getElementById('pf-nombre').focus();
        return;
      }

      const saveBtn = document.getElementById('btn-prod-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando…';

      const id            = _prodFormEditId ?? null;
      const stockInicial  = parseInt(document.getElementById('pf-stock').value) || 20;
      const ingredientes  = _parsearNombresIngredientes(ingredientesRaw);

      const item = {
        id,
        nombre,
        categoria,
        descripcion,
        precio,
        ingredientes,
        tag:            document.getElementById('pf-tag').value.trim(),
        imagen:         _prodFormImgBase64,
        activo:         document.getElementById('pf-visible').checked,
        destacado:      document.getElementById('pf-destacado').checked,
        permiteExcluir: document.getElementById('pf-permite-excluir').checked,
        stock_inicial: stockInicial,
        gruposOpciones
      };

      const ok = await SC.guardarMenuItemDB(item);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
      if (!ok) {
        SC.toast('Error al guardar el producto. Intenta de nuevo.', 'error');
        return;
      }
      cerrarFormProducto();
      _renderProductosGrid();
      _renderDashboardStats();
      // Reconstruye las pestañas del menú de cliente — si esta categoría
      // no tenía ningún plato antes, su pestaña no existía todavía.
      SC.actualizarFiltrosMenu?.();
      SC.toast(`Producto "${nombre}" guardado ✓`, 'success');
    });

    _initFormEmpleado();
    _initAdminNav();
  }

  async function renderReportes(periodo) {
    if (!periodo) {
      const activeTab = document.querySelector('#rep-periodo-tabs .rep-tab.active');
      periodo = activeTab?.dataset.period ?? 'hoy';
    }

    // Mientras se recarga el reporte (p.ej. al cambiar de pestaña Hoy/5
    // días/30 días), _ultimoReporte todavía apunta al período anterior —
    // se deshabilita "Exportar" para que no se pueda exportar ese período
    // viejo por error mientras carga el nuevo.
    const btnExportar = document.getElementById('btn-exportar-reporte');
    if (btnExportar) btnExportar.disabled = true;

    const _miGen = ++_reportesGen;

    // Carga Plotly dinámicamente la primera vez que se abre Reportes. Se
    // dispara en paralelo con la consulta a la BD (no se espera aquí) para
    // que los KPIs y la tabla —que no dependen de Plotly— no se queden
    // esperando la descarga de la librería de gráficas (~1.2MB).
    const _plotlyListo = window.Plotly ? Promise.resolve() : new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/plotly.js-dist@2.35.2/plotly.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

    document.querySelectorAll('#rep-periodo-tabs .rep-tab').forEach(t => {
      const active = t.dataset.period === periodo;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    const diaNavEl = document.getElementById('rep-dia-nav');
    if (diaNavEl) diaNavEl.style.display = periodo === 'hoy' ? '' : 'none';

    const kpisEl = document.getElementById('reportes-kpis');
    if (!kpisEl) return;
    kpisEl.innerHTML = '<p class="usu-cargando" style="grid-column:1/-1">Cargando reportes…</p>';

    const hoy    = new Date();
    const hoyISO = _fechaLocalISO(hoy);

    let desdeStr, hastaStr, periodoLabel, chartTitleVentas, tablaTitulo;
    if (periodo === 'hoy') {
      const diaSel    = _fechaConOffset(_repDiaOffset);
      const diaSelISO = _fechaLocalISO(diaSel);
      const label     = _labelDiaOffset(_repDiaOffset);
      desdeStr = diaSelISO; hastaStr = diaSelISO;
      periodoLabel     = label.toLowerCase();
      chartTitleVentas = `Ventas por hora (${label.toLowerCase()})`;
      tablaTitulo      = label === 'Hoy' ? 'Pedidos cobrados hoy' : `Pedidos cobrados — ${label}`;

      const diaLabelEl = document.getElementById('rep-dia-label');
      if (diaLabelEl) diaLabelEl.textContent = label;
      const diaSigBtn = document.getElementById('rep-dia-sig');
      if (diaSigBtn) diaSigBtn.disabled = _repDiaOffset >= 0;
    } else if (periodo === 'semana') {
      const rango = _rangoSemanaLaboral(hoy);
      desdeStr         = rango.desde;
      hastaStr         = rango.hasta;
      periodoLabel     = 'semana laboral';
      chartTitleVentas = 'Ventas semana laboral (lun-vie)';
      tablaTitulo      = 'Pedidos — semana laboral';
    } else {
      const d = new Date(hoy); d.setDate(d.getDate() - 29);
      desdeStr         = _fechaLocalISO(d);
      hastaStr         = hoyISO;
      periodoLabel     = '30 días';
      chartTitleVentas = 'Ventas últimos 30 días';
      tablaTitulo      = 'Pedidos — últimos 30 días';
    }

    const chartTitleEl = document.getElementById('rep-chart-ventas-title');
    if (chartTitleEl) chartTitleEl.textContent = chartTitleVentas;
    const tablaTituloEl = document.getElementById('rep-tabla-titulo');
    if (tablaTituloEl) tablaTituloEl.textContent = tablaTitulo;

    const [{ data: pedidos, error: errPed }, { data: anulados, error: errAnul }] = await Promise.all([
      window.db
        .from('pedidos')
        .select('ped_id, ped_total, ped_subtotal, ped_iva, ped_fecha, ped_cobrado_en, ped_nombre_invitado, usu_id, mesas(mes_numero), detalle_pedidos(detped_cantidad, detped_subtotal, platos(plat_nombre)), facturas(fact_numero, pagos(metodo_id, pago_monto, pago_cambio, metodos_pago(metodo_nombre)))')
        .eq('ped_estado', 'cobrado')
        .gte('ped_fecha', desdeStr)
        .lte('ped_fecha', hastaStr)
        .order('ped_cobrado_en', { ascending: false }),
      window.db
        .from('pedidos')
        .select('ped_id, ped_total, ped_fecha, ped_anulado_en, ped_motivo_anulacion, ped_nombre_invitado, usu_id, ped_anulado_por, mesas(mes_numero)')
        .eq('ped_estado', 'anulado')
        .gte('ped_fecha', desdeStr)
        .lte('ped_fecha', hastaStr)
        .order('ped_anulado_en', { ascending: false })
    ]);

    if (errPed) {
      kpisEl.innerHTML = '<p style="color:#dc2626;font-size:.9rem;grid-column:1/-1">Error al cargar reportes.</p>';
      return;
    }

    const data = pedidos ?? [];
    const dataAnulados = errAnul ? [] : (anulados ?? []);

    // ── KPIs ──────────────────────────────────────────────────────
    const totalVentas  = data.reduce((s, p) => s + (parseFloat(p.ped_total) || 0), 0);
    const numPedidos   = data.length;
    const promedio     = numPedidos ? totalVentas / numPedidos : 0;
    const totalGastos  = _totalGastosRango(desdeStr, hastaStr);
    const gananciaNeta = totalVentas - totalGastos;

    kpisEl.innerHTML = `
      <div class="reportes-kpi rep-kpi--ventas">
        <div class="rep-kpi__icon-wrap rep-kpi__icon-wrap--ventas">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        </div>
        <div class="reportes-kpi__val">$${totalVentas.toFixed(2)}</div>
        <div class="reportes-kpi__lbl">Ingresos (${periodoLabel})</div>
      </div>
      <div class="reportes-kpi rep-kpi--gastos">
        <div class="rep-kpi__icon-wrap rep-kpi__icon-wrap--gastos">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </div>
        <div class="reportes-kpi__val">$${totalGastos.toFixed(2)}</div>
        <div class="reportes-kpi__lbl">Gastos (${periodoLabel})</div>
      </div>
      <div class="reportes-kpi rep-kpi--promedio">
        <div class="rep-kpi__icon-wrap rep-kpi__icon-wrap--promedio">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        </div>
        <div class="reportes-kpi__val" style="color:${gananciaNeta >= 0 ? '#16a34a' : '#dc2626'}">$${gananciaNeta.toFixed(2)}</div>
        <div class="reportes-kpi__lbl">Ganancia neta (${periodoLabel})</div>
      </div>`;

    // El dibujo de las gráficas necesita Plotly, pero los datos que
    // calculan (y que también usa la tabla/Excel de abajo) no — así que
    // esos cálculos siguen sin esperar la descarga de la librería. Si
    // Plotly ya está listo se dibuja de una; si no, se dibuja apenas
    // termine de cargar, sin bloquear el resto de esta función.
    const divVentas = document.getElementById('chart-ventas-dia');
    const divTop    = document.getElementById('chart-top-productos');

    const _layout = {
      paper_bgcolor: 'transparent',
      plot_bgcolor:  'transparent',
      font: { family: "'Inter', sans-serif", size: 12, color: '#5a3e2b' },
      margin: { t: 10, r: 16, b: 40, l: 50 },
      showlegend: false,
    };
    const _config = { responsive: true, displayModeBar: false, locale: 'es' };

    // ── Gráfica 1: por hora (hoy) o por día (semana/mes) ──────────
    let xLabels, yValues;
    if (periodo === 'hoy') {
      xLabels = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);
      yValues = Array(18).fill(0);
      data.forEach(p => {
        if (p.ped_cobrado_en) {
          const h = new Date(p.ped_cobrado_en).getHours();
          const idx = h - 6;
          if (idx >= 0 && idx < 18) yValues[idx] += parseFloat(p.ped_total) || 0;
        }
      });
    } else if (periodo === 'semana') {
      // Un punto por cada día lun-vie entre desdeStr y hastaStr (rango ya calculado arriba)
      xLabels = [];
      yValues = [];
      const cursor = new Date(desdeStr + 'T00:00:00');
      const hastaDate = new Date(hastaStr + 'T00:00:00');
      while (cursor <= hastaDate) {
        const isoFecha = _fechaLocalISO(cursor);
        xLabels.push(cursor.toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit' }));
        yValues.push(data.filter(p => p.ped_fecha === isoFecha).reduce((s, p) => s + (parseFloat(p.ped_total) || 0), 0));
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      const nDias = 30;
      xLabels = [];
      yValues = [];
      for (let i = nDias - 1; i >= 0; i--) {
        const d = new Date(hoy);
        d.setDate(d.getDate() - i);
        const isoFecha = _fechaLocalISO(d);
        xLabels.push(d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit' }));
        yValues.push(data.filter(p => p.ped_fecha === isoFecha).reduce((s, p) => s + (parseFloat(p.ped_total) || 0), 0));
      }
    }

    // Con muchas categorías (30 días) mostrar todas las etiquetas del eje X
    // las amontona y se solapan — se muestra solo un subconjunto legible.
    const _tickStep = xLabels.length > 10 ? Math.ceil(xLabels.length / 8) : 1;
    const _tickvals = xLabels.filter((_, i) => i % _tickStep === 0);
    const _ticktext = _tickvals;

    // Plotly mide el ancho del contenedor al dibujar — si el módulo de
    // Reportes todavía no había terminado su transición de layout (o el
    // contenedor medía 0 por estar recién visible), se queda con un
    // ancho más chico que el real y "responsive" no lo vuelve a corregir
    // hasta el próximo resize de ventana. Forzar un resize un frame
    // después de dibujar corrige ese ancho sin esperar a que el usuario
    // redimensione la ventana.
    function _forzarResizeChart(div) {
      requestAnimationFrame(() => { if (div) window.Plotly?.Plots?.resize(div); });
    }

    function _dibujarChartVentas() {
      if (!window.Plotly || !divVentas) return;
      window.Plotly.react(divVentas, [{
        type: 'bar',
        x:    xLabels,
        y:    yValues,
        marker: {
          color:        yValues.map(v => v > 0 ? 'rgba(200,86,26,.85)' : 'rgba(200,86,26,.2)'),
          line:         { color: '#a84515', width: 1 },
          cornerradius: 6
        },
        hovertemplate: '<b>%{x}</b><br>Ventas: <b>$%{y:.2f}</b><extra></extra>'
      }], {
        ..._layout,
        yaxis: { tickprefix: '$', tickformat: '.2f', gridcolor: 'rgba(0,0,0,.07)', zeroline: false },
        xaxis: _tickStep > 1
          ? { showgrid: false, tickmode: 'array', tickvals: _tickvals, ticktext: _ticktext, tickangle: -40 }
          : { showgrid: false }
      }, _config).then(() => _forzarResizeChart(divVentas));
    }
    _dibujarChartVentas();

    // ── Gráfica 2: todos los productos vendidos ─────────────────────
    // conteo: solo unidades (para la gráfica). ventasPorProducto: unidades
    // + ingresos por producto, para el detalle completo del Excel.
    const conteo = {};
    const ventasPorProducto = {};
    data.forEach(p => {
      (p.detalle_pedidos ?? []).forEach(d => {
        const nombre = d.platos?.plat_nombre;
        if (!nombre) return;
        conteo[nombre] = (conteo[nombre] || 0) + (d.detped_cantidad || 0);
        if (!ventasPorProducto[nombre]) ventasPorProducto[nombre] = { unidades: 0, ingresos: 0 };
        ventasPorProducto[nombre].unidades += d.detped_cantidad || 0;
        ventasPorProducto[nombre].ingresos += parseFloat(d.detped_subtotal) || 0;
      });
    });
    // Todos los productos vendidos en el período, de mayor a menor —
    // ya no se recorta a los primeros 5.
    const top5       = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
    // Nombre completo (sin recortar) — el margen izquierdo es automático
    // (automargin) así que se ajusta solo al nombre más largo.
    const topNombres = top5.map(([n]) => n);
    const topCants   = top5.map(([, c]) => c);
    const maxTop     = topCants.length ? Math.max(...topCants) : 1;
    // dtick fijo en 1 generaba una marca por unidad (ilegible con 30+ ventas);
    // se calcula para dejar como máximo ~6 marcas en el eje.
    const _dtickTop  = Math.max(1, Math.ceil(maxTop / 6));
    // Alto dinámico — con un solo producto se ve tan aplastado como con 5,
    // pero con muchos necesita crecer para que cada barra siga siendo legible.
    if (divTop) divTop.style.height = Math.max(260, topNombres.length * 34 + 40) + 'px';

    function _dibujarChartTop() {
      if (!window.Plotly || !divTop) return;
      window.Plotly.react(divTop, [{
        type:          'bar',
        orientation:   'h',
        x:             topCants.length  ? topCants   : [0],
        y:             topNombres.length? topNombres : ['Sin datos'],
        marker: {
          color:        'rgba(59,26,8,.75)',
          line:         { color: '#3B1A08', width: 1 },
          cornerradius: 4
        },
        hovertemplate: '<b>%{y}</b><br>Unidades: <b>%{x}</b><extra></extra>'
      }], {
        ..._layout,
        margin: { t: 10, r: 20, b: 30, l: 130 },
        xaxis: { tickformat: 'd', dtick: _dtickTop, gridcolor: 'rgba(0,0,0,.07)', zeroline: false, range: [0, maxTop + Math.ceil(maxTop * 0.35) + 1] },
        yaxis: { showgrid: false, automargin: true }
      }, _config).then(() => _forzarResizeChart(divTop));
    }
    _dibujarChartTop();

    // Si Plotly todavía no había terminado de descargarse, dibujar las
    // gráficas apenas esté listo (no bloquea KPIs/tabla, que ya se ven).
    _plotlyListo.then(() => {
      if (_miGen !== _reportesGen) return; // el usuario ya cambió de pestaña/día
      _dibujarChartVentas();
      _dibujarChartTop();
    }).catch(() => {});

    // ── Mini KPIs y tabla ─────────────────────────────────────────
    const kpisHoyEl = document.getElementById('resumen-kpis');
    if (kpisHoyEl) {
      kpisHoyEl.innerHTML = `
        <div class="resumen-kpi-card">
          <div class="resumen-kpi-card__val">${numPedidos}</div>
          <div class="resumen-kpi-card__lbl">Pedidos cobrados</div>
        </div>
        <div class="resumen-kpi-card">
          <div class="resumen-kpi-card__val" style="color:var(--cinnamon)">$${totalVentas.toFixed(2)}</div>
          <div class="resumen-kpi-card__lbl">Total vendido</div>
        </div>`;
    }

    const SC       = window.SC;
    const users    = window.ModuloAutenticacion?.leerUsuarios() ?? [];
    const _mesa    = p => p.mesas?.mes_numero ? `Mesa ${p.mesas.mes_numero}` : 'Para llevar';
    const _cliente = p => {
      // El "Cliente" es a quién pertenece el pedido (mesa/para llevar), no
      // la cuenta que lo creó — un mesero puede tomar el pedido a nombre de
      // otra persona. Mismo criterio que _rowAPedido en index.html.
      const esParaLlevar = p.ped_nombre_invitado === 'Para llevar' || p.ped_nombre_invitado?.startsWith('PL:');
      const llevarNombre = p.ped_nombre_invitado?.startsWith('PL:') ? p.ped_nombre_invitado.slice(3) : null;
      if (!p.usu_id) return llevarNombre ?? (esParaLlevar ? 'Para llevar' : (p.ped_nombre_invitado ?? 'Invitado'));
      const clienteNombre = esParaLlevar ? llevarNombre : (p.ped_nombre_invitado || null);
      return clienteNombre || users.find(u => u.id === p.usu_id)?.nombre || 'Usuario';
    };
    const _facturaDe = p => Array.isArray(p.facturas) ? p.facturas[0] : p.facturas;
    const _pagosDe   = p => { const f = _facturaDe(p); const raw = f ? f.pagos : null; return Array.isArray(raw) ? raw : (raw ? [raw] : []); };
    // Neto que aportó esa fila de pago a la venta (recibido − cambio) — la
    // pierna en efectivo de un mixto puede traer cambio, la transferencia no.
    const _netoPago  = pg => (parseFloat(pg.pago_monto) || 0) - (parseFloat(pg.pago_cambio) || 0);
    // Más de una fila de pago = pago mixto (parte efectivo, parte
    // transferencia) — se muestra con su desglose en vez de un solo método.
    const _metodoDe  = p => {
      const pagos = _pagosDe(p);
      if (!pagos.length) return 'Sin registrar';
      if (pagos.length > 1) return 'Mixto (' + pagos.map(pg => `${pg.metodos_pago?.metodo_nombre ?? '?'} $${_netoPago(pg).toFixed(2)}`).join(' + ') + ')';
      return pagos[0]?.metodos_pago?.metodo_nombre ?? 'Sin registrar';
    };

    // Desglose por método de pago — clave para cuadrar caja/tarjeta/
    // transferencia en una auditoría. Un pedido mixto reparte su dinero
    // real entre Efectivo/Transferencia (no el total completo en ambos) y
    // además suma aparte en un bucket "Mixto" informativo (cuántos pedidos
    // y por cuánto se cobraron así) sin duplicar esos montos.
    const porMetodo = {};
    let totalMixtos = 0, cantidadMixtos = 0;
    data.forEach(p => {
      const pagos = _pagosDe(p);
      if (pagos.length > 1) {
        cantidadMixtos++;
        totalMixtos += parseFloat(p.ped_total) || 0;
        pagos.forEach(pg => {
          const m = pg.metodos_pago?.metodo_nombre ?? 'Sin registrar';
          if (!porMetodo[m]) porMetodo[m] = { total: 0, cantidad: 0 };
          // Neto (recibido − cambio) — la pierna en efectivo de un mixto
          // puede traer cambio (ver cobrar_pedido), la transferencia no.
          porMetodo[m].total += (parseFloat(pg.pago_monto) || 0) - (parseFloat(pg.pago_cambio) || 0);
        });
      } else {
        const m = pagos[0]?.metodos_pago?.metodo_nombre ?? 'Sin registrar';
        if (!porMetodo[m]) porMetodo[m] = { total: 0, cantidad: 0 };
        porMetodo[m].total    += parseFloat(p.ped_total) || 0;
        porMetodo[m].cantidad += 1;
      }
    });
    if (cantidadMixtos > 0) porMetodo['Mixto'] = { total: totalMixtos, cantidad: cantidadMixtos };
    // ped_id → método de pago, para mostrarlo también en la tabla del
    // Control de Caja (mismo `data` que ya trae el join a facturas/pagos).
    const metodoPorPedido = new Map(data.map(p => [p.ped_id, _metodoDe(p)]));

    // Cache del reporte actual — lo usa _exportarReporteExcel() para no
    // tener que re-consultar Supabase al exportar.
    _ultimoReporte = {
      periodo, periodoLabel, desdeStr, hastaStr,
      data, totalVentas, numPedidos, promedio, top5, ventasPorProducto,
      dataAnulados, porMetodo,
      _mesa, _cliente, _metodoDe
    };
    if (btnExportar) btnExportar.disabled = false;

    const tablaEl = document.getElementById('resumen-tabla-wrap');
    if (!tablaEl) return;

    if (!data.length) {
      tablaEl.innerHTML = '<p style="text-align:center;color:#888;font-size:.85rem;padding:2rem 0;font-style:italic">No hay pedidos cobrados en este período.</p>';
      // Igual renderizar cuadre de caja aunque no haya cobrados
      await _renderCuadreCaja(periodo, desdeStr, periodoLabel, SC, porMetodo, metodoPorPedido);
      return;
    }

    tablaEl.innerHTML = `
      <table class="adm-tabla">
        <thead><tr><th>Fecha / Hora</th><th>Mesa</th><th>Cliente</th><th style="text-align:center">Ítems</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          ${data.map(p => {
            const items     = (p.detalle_pedidos ?? []).reduce((s, d) => s + (d.detped_cantidad || 0), 0);
            const fechaHora = p.ped_cobrado_en
              ? new Date(p.ped_cobrado_en).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
              : (p.ped_fecha ?? '—');
            return `<tr>
              <td data-label="Fecha / Hora">${fechaHora}</td>
              <td data-label="Mesa">${SC?.escapeHtml(_mesa(p)) ?? _mesa(p)}</td>
              <td data-label="Cliente">${SC?.escapeHtml(_cliente(p)) ?? _cliente(p)}</td>
              <td data-label="Ítems" style="text-align:center">${items}</td>
              <td data-label="Total" style="text-align:right;font-weight:700;color:var(--cinnamon)">$${(parseFloat(p.ped_total)||0).toFixed(2)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    await _renderCuadreCaja(periodo, desdeStr, periodoLabel, SC, porMetodo, metodoPorPedido);
  }

  // Exporta el reporte actualmente visible (KPIs + detalle de pedidos +
  // top productos) a un archivo .xlsx para auditoría contable.
  async function _exportarReporteExcel() {
    const SC = window.SC;
    if (!_ultimoReporte) { SC?.toast('Espera a que cargue el reporte', 'error'); return; }

    const btn = document.getElementById('btn-exportar-reporte');
    if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }

    try {
      // xlsx-js-style: mismo API que la librería "xlsx" pero soporta
      // estilos de celda (colores/bordes) al escribir — la versión gratuita
      // de SheetJS no permite escribir estilos en .xlsx. Se marca con
      // window.__XLSX_STYLED__ para no confundirla con una carga previa
      // de la librería "xlsx" normal (ambas exponen el mismo global).
      if (!window.__XLSX_STYLED__) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
          s.onload = () => { window.__XLSX_STYLED__ = true; resolve(); };
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const XLSX = window.XLSX;

      const {
        periodo, periodoLabel, desdeStr, hastaStr, data, totalVentas, numPedidos, promedio,
        top5, ventasPorProducto, dataAnulados, porMetodo, _mesa, _cliente, _metodoDe
      } = _ultimoReporte;
      const users = window.ModuloAutenticacion?.leerUsuarios() ?? [];
      const _quienAnulo = p => {
        if (!p.ped_anulado_por) return '—';
        return users.find(u => u.id === p.ped_anulado_por)?.nombre ?? p.ped_anulado_por;
      };

      // ── Paleta de marca (misma que :root en assets/styles.css) ──
      const CINNAMON     = 'C8561A';
      const BROWN_DARK    = '3B1A08';
      const CREAM         = 'FDF6EE';
      const WHITE         = 'FFFFFF';
      const BORDER_COLOR  = 'E0C9B0';
      const ROJO_ANULADO  = 'FDECEC';
      const ROJO_TEXTO    = '991B1B';

      const _thin = { style: 'thin', color: { rgb: BORDER_COLOR } };
      const _borderAll = { top: _thin, bottom: _thin, left: _thin, right: _thin };

      const _sTitle = {
        font: { bold: true, sz: 16, color: { rgb: WHITE } },
        fill: { fgColor: { rgb: BROWN_DARK } },
        alignment: { horizontal: 'left', vertical: 'center' }
      };
      const _sSubtitle = {
        font: { sz: 10, color: { rgb: WHITE } },
        fill: { fgColor: { rgb: BROWN_DARK } },
        alignment: { horizontal: 'left', vertical: 'center' }
      };
      // Un solo color de fondo fuerte (café oscuro, el mismo del sidebar del
      // panel admin) para todos los encabezados — la canela queda solo como
      // acento de texto en cifras clave, igual que en el resto del sitio.
      const _sSeccion = {
        font: { bold: true, sz: 11, color: { rgb: WHITE } },
        fill: { fgColor: { rgb: BROWN_DARK } },
        alignment: { horizontal: 'left', vertical: 'center' }
      };
      const _sLabel  = { font: { bold: true, color: { rgb: BROWN_DARK } }, fill: { fgColor: { rgb: CREAM } }, border: _borderAll };
      const _sValue  = { font: { color: { rgb: BROWN_DARK } }, border: _borderAll };
      const _sValueBold = { font: { bold: true, color: { rgb: CINNAMON } }, border: _borderAll };
      const _sHeader = {
        font: { bold: true, color: { rgb: WHITE } },
        fill: { fgColor: { rgb: BROWN_DARK } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: _borderAll
      };
      const _sCell = (bg) => ({ font: { color: { rgb: BROWN_DARK } }, fill: { fgColor: { rgb: bg } }, border: _borderAll, alignment: { vertical: 'center' } });
      const _sCellRight = (bg) => ({ ..._sCell(bg), alignment: { horizontal: 'right', vertical: 'center' } });
      const _sCellCenter = (bg) => ({ ..._sCell(bg), alignment: { horizontal: 'center', vertical: 'center' } });
      const MONEY_FMT = '"$"#,##0.00';

      // z siempre explícito (nunca queda "sin formato") — un cell sin z
      // puede heredar visualmente el formato de moneda de una celda vecina
      // en algunos lectores de .xlsx si no se declara "General" a propósito.
      const INT_FMT = '0';
      const _cell = (v, s, z) => { const c = { v, s }; c.z = z || (typeof v === 'number' ? INT_FMT : 'General'); if (typeof v === 'number') c.t = 'n'; return c; };
      const _merge = (ws, r1, c1, r2, c2) => { ws['!merges'] = ws['!merges'] || []; ws['!merges'].push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } }); };

      // ── Hoja Resumen ──
      const totalAnulado = (dataAnulados ?? []).reduce((s, p) => s + (parseFloat(p.ped_total) || 0), 0);
      const metodosFilas = Object.entries(porMetodo ?? {}).sort((a, b) => b[1].total - a[1].total)
        .map(([nombre, m]) => [_cell(nombre, _sValue), _cell(m.cantidad, { ..._sValue, alignment: { horizontal: 'center' } }, INT_FMT), _cell(m.total, _sValue, MONEY_FMT)]);

      const resumenFilas = [
        [_cell('Sal y Canela — Reporte de Ventas', _sTitle), _cell('', _sTitle), _cell('', _sTitle)],
        [_cell(`RUC ${RUC_NEGOCIO} · RIMPE Negocio Popular (exento de IVA)`, _sSubtitle), _cell('', _sSubtitle), _cell('', _sSubtitle)],
        [_cell(`${DIRECCION_NEGOCIO} · ${TELEFONO_NEGOCIO}`, _sSubtitle), _cell('', _sSubtitle), _cell('', _sSubtitle)],
        [],
        [_cell('Período', _sLabel), _cell(periodoLabel, _sValue), _cell('', _sValue)],
        [_cell('Desde', _sLabel), _cell(desdeStr, _sValue), _cell('', _sValue)],
        [_cell('Hasta', _sLabel), _cell(hastaStr, _sValue), _cell('', _sValue)],
        [_cell('Generado', _sLabel), _cell(new Date().toLocaleString('es-EC'), _sValue), _cell('', _sValue)],
        [],
        [_cell('Indicadores', _sSeccion), _cell('', _sSeccion), _cell('', _sSeccion)],
        [_cell('Total vendido', _sLabel), _cell(totalVentas, _sValueBold, MONEY_FMT), _cell('', _sValue)],
        [_cell('Pedidos cobrados', _sLabel), _cell(numPedidos, _sValue, INT_FMT), _cell('', _sValue)],
        [_cell('Promedio por pedido', _sLabel), _cell(promedio, _sValue, MONEY_FMT), _cell('', _sValue)],
        [_cell('Pedidos anulados', _sLabel), _cell((dataAnulados ?? []).length, _sValue, INT_FMT), _cell('', _sValue)],
        [_cell('Valor anulado (no vendido)', _sLabel), _cell(totalAnulado, _sValue, MONEY_FMT), _cell('', _sValue)],
        [],
        [_cell('Desglose por método de pago', _sSeccion), _cell('', _sSeccion), _cell('', _sSeccion)],
        [_cell('Método', _sHeader), _cell('Pedidos', _sHeader), _cell('Total', _sHeader)],
        ...metodosFilas
      ];
      const wsResumen = XLSX.utils.aoa_to_sheet(resumenFilas);
      _merge(wsResumen, 0, 0, 0, 2);
      _merge(wsResumen, 1, 0, 1, 2);
      _merge(wsResumen, 2, 0, 2, 2);
      _merge(wsResumen, 9, 0, 9, 2);
      _merge(wsResumen, 16, 0, 16, 2);
      wsResumen['!cols'] = [{ wch: 26 }, { wch: 20 }, { wch: 16 }];
      wsResumen['!rows'] = [{ hpt: 26 }, { hpt: 16 }, { hpt: 16 }];

      // ── Hoja Pedidos (detalle de ventas cobradas) ──
      const headerPedidos = ['Fecha / Hora', 'Mesa', 'Cliente', 'Ítems', 'Método de pago', 'Total'].map(h => _cell(h, _sHeader));
      const filasPedidos = data.map((p, i) => {
        const bg = i % 2 === 0 ? WHITE : CREAM;
        const items = (p.detalle_pedidos ?? []).reduce((s, d) => s + (d.detped_cantidad || 0), 0);
        const fechaHora = p.ped_cobrado_en ? new Date(p.ped_cobrado_en) : (p.ped_fecha ? new Date(p.ped_fecha + 'T00:00:00') : null);
        return [
          _cell(fechaHora ? fechaHora.toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—', _sCell(bg)),
          _cell(_mesa(p), _sCell(bg)),
          _cell(_cliente(p), _sCell(bg)),
          _cell(items, _sCellCenter(bg)),
          _cell(_metodoDe(p), _sCell(bg)),
          _cell(parseFloat(p.ped_total) || 0, _sCellRight(bg), MONEY_FMT)
        ];
      });
      const wsPedidos = XLSX.utils.aoa_to_sheet([headerPedidos, ...filasPedidos]);
      wsPedidos['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 8 }, { wch: 16 }, { wch: 14 }];
      wsPedidos['!rows'] = [{ hpt: 20 }];

      // ── Hoja Anulados (rastro de auditoría de pedidos no cobrados) ──
      const headerAnulados = ['Fecha / Hora', 'Mesa', 'Cliente', 'Total', 'Motivo', 'Anulado por'].map(h => _cell(h, _sHeader));
      const filasAnulados = (dataAnulados ?? []).map(p => {
        const fechaHora = p.ped_anulado_en ? new Date(p.ped_anulado_en) : (p.ped_fecha ? new Date(p.ped_fecha + 'T00:00:00') : null);
        return [
          _cell(fechaHora ? fechaHora.toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—', _sCell(ROJO_ANULADO)),
          _cell(_mesa(p), _sCell(ROJO_ANULADO)),
          _cell(_cliente(p), _sCell(ROJO_ANULADO)),
          _cell(parseFloat(p.ped_total) || 0, { ..._sCellRight(ROJO_ANULADO), font: { color: { rgb: ROJO_TEXTO }, bold: true } }, MONEY_FMT),
          _cell(p.ped_motivo_anulacion || '—', _sCell(ROJO_ANULADO)),
          _cell(_quienAnulo(p), _sCell(ROJO_ANULADO))
        ];
      });
      const wsAnulados = XLSX.utils.aoa_to_sheet(
        filasAnulados.length ? [headerAnulados, ...filasAnulados] : [headerAnulados, [_cell('Sin pedidos anulados en este período', { font: { italic: true, color: { rgb: BROWN_DARK } } })]]
      );
      wsAnulados['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 30 }, { wch: 18 }];
      wsAnulados['!rows'] = [{ hpt: 20 }];

      // ── Hoja Top productos (detalle completo, no solo el top 5) ──
      const headerTop = ['Producto', 'Unidades vendidas', 'Ingresos'].map(h => _cell(h, _sHeader));
      const filasTop = Object.entries(ventasPorProducto ?? {}).sort((a, b) => b[1].ingresos - a[1].ingresos)
        .map(([nombre, v], i) => {
          const bg = i % 2 === 0 ? WHITE : CREAM;
          return [
            _cell(nombre, _sCell(bg)),
            _cell(v.unidades, _sCellCenter(bg)),
            _cell(v.ingresos, _sCellRight(bg), MONEY_FMT)
          ];
        });
      const wsTop = XLSX.utils.aoa_to_sheet([headerTop, ...filasTop]);
      wsTop['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 14 }];
      wsTop['!rows'] = [{ hpt: 20 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
      XLSX.utils.book_append_sheet(wb, wsPedidos, 'Pedidos');
      XLSX.utils.book_append_sheet(wb, wsAnulados, 'Anulados');
      XLSX.utils.book_append_sheet(wb, wsTop, 'Top productos');

      const nombreArchivo = `sal-y-canela-reporte-${periodo}-${desdeStr}${periodo !== 'hoy' ? '_a_' + hastaStr : ''}.xlsx`;
      XLSX.writeFile(wb, nombreArchivo);
    } catch (e) {
      console.error('Exportar reporte a Excel:', e);
      SC?.toast('No se pudo generar el archivo Excel', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/></svg> Exportar a Excel'; }
    }
  }

  // Orden fijo en que se muestran los métodos de pago en el cuadre de
  // caja — efectivo primero (es lo único que hay que contar físicamente),
  // luego transferencia, luego tarjetas.
  const _ORDEN_METODOS_CUADRE = ['Efectivo', 'Transferencia', 'Tarjeta de crédito', 'Tarjeta de débito'];

  async function _renderCuadreCaja(periodo, fechaSel, labelDia, SC, porMetodo, metodoPorPedido) {
    const cuadreEl = document.getElementById('rep-cuadre-wrap');
    if (!cuadreEl) return;
    if (periodo !== 'hoy') { cuadreEl.innerHTML = ''; return; }

    const [{ data: todosHoy }, { data: gastosHoy }] = await Promise.all([
      window.db
        .from('pedidos')
        .select('ped_id, ped_estado, ped_total, usu_id, ped_cobrado_por, ped_anulado_por, ped_hora, mes_id, mesas(mes_numero), facturas(pagos(metodo_id, pago_monto, pago_cambio, metodos_pago(metodo_nombre)))')
        .eq('ped_fecha', fechaSel)
        .order('ped_hora', { ascending: true }),
      window.db.from('gastos').select('gast_monto, gast_metodo_pago').eq('gast_fecha', fechaSel)
    ]);

    const todos         = todosHoy ?? [];
    // Cuánto de lo gastado hoy salió de la caja física o de la cuenta por
    // transferencia — informativo, para cuadrar a mano contra lo cobrado.
    const gastosPorMetodo = { efectivo: { total: 0, cantidad: 0 }, transferencia: { total: 0, cantidad: 0 } };
    (gastosHoy ?? []).forEach(g => {
      if (gastosPorMetodo[g.gast_metodo_pago]) {
        gastosPorMetodo[g.gast_metodo_pago].total    += parseFloat(g.gast_monto) || 0;
        gastosPorMetodo[g.gast_metodo_pago].cantidad += 1;
      }
    });
    const cobrados      = todos.filter(p => p.ped_estado === 'cobrado');
    const pendientes    = todos.filter(p => p.ped_estado === 'pendiente');
    const anulados      = todos.filter(p => p.ped_estado === 'anulado');
    const totalCreados  = todos.length;
    const totalCobrados = cobrados.length;
    // Un pedido anulado es un desenlace explicado, no una diferencia sin
    // explicar — se resta para que la "Diferencia" solo marque lo que de
    // verdad quedó sin resolver (ni cobrado ni anulado).
    const diferencia    = totalCreados - totalCobrados - anulados.length;

    // usuarios(usu_nombre) vía join anidado de PostgREST queda bloqueado por
    // RLS para usuarios que no son el propio — usamos la lista ya cargada
    // vía la RPC listar_usuarios() (SECURITY DEFINER), igual que en el resto del panel.
    const usuariosCache = window.ModuloAutenticacion.leerUsuarios();
    const ROL_LABEL_CUADRE = { cajero: 'Caja', mesero: 'Mesero', usuario: 'Cliente', administrador: 'Admin', invitado: 'Invitado' };
    const _nombreDe = usuId => {
      if (!usuId) return null;
      const u = usuariosCache.find(u => u.id === usuId);
      return u ? { nombre: u.nombre, rol: u.rol } : { nombre: usuId, rol: 'usuario' };
    };
    const _pill = (usuId, fallbackRol) => {
      const info = _nombreDe(usuId);
      if (!info) return '—';
      const rol = info.rol ?? fallbackRol;
      return `<span class="rol-pill ${rol}">${ROL_LABEL_CUADRE[rol] ?? rol}</span> ${SC?.escapeHtml(info.nombre) ?? info.nombre}`;
    };

    // Una fila por pedido — todo su recorrido a la vista, sin tener que
    // cruzar dos tablas distintas: quién lo creó, en qué quedó, y quién de
    // caja lo cobró o anuló (nunca el mismo que lo creó, salvo que sea
    // cajero/admin tomando su propio pedido).
    const _METODO_COLOR_CUADRE = { 'Efectivo': '#16a34a', 'Transferencia': '#5b7fa6', 'Tarjeta de crédito': 'var(--brown-dark)', 'Tarjeta de débito': 'var(--brown-dark)' };
    const _pagosDeCuadre = p => {
      const f = Array.isArray(p.facturas) ? p.facturas[0] : p.facturas;
      const raw = f ? f.pagos : null;
      return Array.isArray(raw) ? raw : (raw ? [raw] : []);
    };
    // Agrupar por método (opcional, ver _cuadreOrdenMetodo) — junta todo el
    // efectivo, luego transferencias, etc., para poder cuadrar a mano más
    // rápido en vez de ir saltando entre métodos en orden cronológico.
    // Los pagos mixtos ("Mixto (...)") van al final — son los que más
    // tiempo toman cuadrar a mano, mejor dejarlos para el final.
    const _ORDEN_METODO_PRIORIDAD = { 'Efectivo': 0, 'Transferencia': 1, 'Tarjeta de crédito': 2, 'Tarjeta de débito': 3 };
    const _prioridadMetodo = m => m?.startsWith('Mixto') ? 4 : (_ORDEN_METODO_PRIORIDAD[m] ?? 99);
    const todosParaTabla = _cuadreOrdenMetodo
      ? [...todos].sort((a, b) => {
          const pa = _prioridadMetodo(metodoPorPedido?.get(a.ped_id));
          const pb = _prioridadMetodo(metodoPorPedido?.get(b.ped_id));
          return pa - pb || (a.ped_hora ?? '').localeCompare(b.ped_hora ?? '');
        })
      : todos;
    const filasPedidos = todosParaTabla.map(p => {
      const creador = p.usu_id ? _pill(p.usu_id, 'usuario') : `<span class="rol-pill invitado">Invitado</span>`;
      const mesaTxt = p.mes_id && p.mesas?.mes_numero ? `Mesa ${p.mesas.mes_numero}` : 'Para llevar';
      const estadoTxt = p.ped_estado === 'cobrado'
        ? '<span style="color:#16a34a;font-weight:700">✓ Cobrado</span>'
        : p.ped_estado === 'anulado'
          ? '<span style="color:#dc2626;font-weight:700">✕ Anulado</span>'
          : '<span style="color:var(--cinnamon);font-weight:700">⏳ Pendiente</span>';
      const metodo = metodoPorPedido?.get(p.ped_id);
      const esMixto = metodo?.startsWith('Mixto');
      const metodoTxt = p.ped_estado === 'cobrado' && metodo
        ? `<strong style="color:${esMixto ? '#a8441a' : (_METODO_COLOR_CUADRE[metodo] ?? 'var(--text-muted)')}" title="${SC?.escapeHtml(metodo) ?? metodo}">${esMixto ? 'Mixto' : (SC?.escapeHtml(metodo) ?? metodo)}</strong>`
        : '—';
      // pago_monto es lo que el cliente entregó en mano (ej. $20 por una
      // cuenta de $3.50) — solo tiene sentido mostrarlo para efectivo, ya
      // que ahí sí puede diferir del total (da pie al vuelto); en los demás
      // métodos siempre es igual al total y no aporta nada nuevo. En un
      // pago mixto se suma solo la pierna en Efectivo.
      const montoEfectivo = p.ped_estado === 'cobrado'
        ? _pagosDeCuadre(p).filter(pg => pg.metodos_pago?.metodo_nombre === 'Efectivo').reduce((s, pg) => s + (parseFloat(pg.pago_monto) || 0), 0)
        : 0;
      const recibidoTxt = montoEfectivo > 0 ? `$${montoEfectivo.toFixed(2)}` : '—';
      return `<tr>
        <td data-label="Pedido">${SC?.escapeHtml(mesaTxt) ?? mesaTxt}${p.ped_hora ? ` <small style="color:var(--text-muted)">${p.ped_hora.slice(0,5)}</small>` : ''}</td>
        <td data-label="Monto" style="text-align:right">$${(parseFloat(p.ped_total) || 0).toFixed(2)}</td>
        <td data-label="Creado por">${creador}</td>
        <td data-label="Estado" style="text-align:center">${estadoTxt}</td>
        <td data-label="Cobrado por">${p.ped_estado === 'cobrado' ? _pill(p.ped_cobrado_por, 'cajero') : '—'}</td>
        <td data-label="Método de pago">${metodoTxt}</td>
        <td data-label="Recibido en efectivo" style="text-align:center">${recibidoTxt}</td>
        <td data-label="Anulado por">${p.ped_estado === 'anulado' ? _pill(p.ped_anulado_por, 'cajero') : '—'}</td>
      </tr>`;
    }).join('');

    cuadreEl.innerHTML = `
      <div class="cuadre-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        Control de Caja — ${SC?.escapeHtml(labelDia) ?? labelDia}
      </div>
      <div class="cuadre-kpis">
        <div class="cuadre-kpi">
          <div class="cuadre-kpi__val">${totalCreados}</div>
          <div class="cuadre-kpi__lbl">Pedidos creados</div>
        </div>
        <div class="cuadre-kpi">
          <div class="cuadre-kpi__val" style="color:#16a34a">${totalCobrados}</div>
          <div class="cuadre-kpi__lbl">Cobrados por caja</div>
        </div>
        <div class="cuadre-kpi">
          <div class="cuadre-kpi__val" style="color:${pendientes.length > 0 ? '#dc2626' : '#16a34a'}">${pendientes.length}</div>
          <div class="cuadre-kpi__lbl">Pendientes de cobro</div>
        </div>
        <div class="cuadre-kpi">
          <div class="cuadre-kpi__val" style="color:var(--text-muted)">${anulados.length}</div>
          <div class="cuadre-kpi__lbl">Anulados</div>
        </div>
        <div class="cuadre-kpi">
          <div class="cuadre-kpi__val" style="color:${diferencia > 0 ? '#dc2626' : '#16a34a'}">${diferencia > 0 ? '⚠ ' + diferencia : '✓ 0'}</div>
          <div class="cuadre-kpi__lbl">Diferencia</div>
        </div>
      </div>
      ${(() => {
        const pm = porMetodo ?? {};
        // Tarjeta crédito/débito se combinan en un solo "Tarjetas" — el
        // admin solo necesita distinguir efectivo (que cuenta a mano) de
        // transferencia; el detalle completo sigue en el Excel exportado.
        const tarjetas = { total: (pm['Tarjeta de crédito']?.total || 0) + (pm['Tarjeta de débito']?.total || 0),
                           cantidad: (pm['Tarjeta de crédito']?.cantidad || 0) + (pm['Tarjeta de débito']?.cantidad || 0) };
        const otros = Object.entries(pm).filter(([m]) => !_ORDEN_METODOS_CUADRE.includes(m) && m !== 'Mixto');
        const pills = [
          { lbl: 'Efectivo en caja', color: '#16a34a', ...pm['Efectivo'] },
          { lbl: 'Transferencia',    color: '#5b7fa6', ...pm['Transferencia'] },
          { lbl: 'Tarjetas',         color: 'var(--brown-dark)', ...tarjetas },
          // Informativo — su dinero ya está repartido dentro de Efectivo/
          // Transferencia arriba, no se suma aparte (evitaría contar doble).
          ...(pm['Mixto'] ? [{ lbl: 'Mixto (informativo)', color: '#a8441a', ...pm['Mixto'] }] : []),
          ...otros.map(([m, info]) => ({ lbl: SC?.escapeHtml(m) ?? m, color: 'var(--text-muted)', ...info })),
          // Cuánto de lo cobrado ya salió en gastos — no se resta de las
          // píldoras de arriba (esas son lo COBRADO), solo informa.
          ...(gastosPorMetodo.efectivo.cantidad ? [{ lbl: 'Gastos de caja', color: '#dc2626', total: -gastosPorMetodo.efectivo.total, cantidad: gastosPorMetodo.efectivo.cantidad }] : []),
          ...(gastosPorMetodo.transferencia.cantidad ? [{ lbl: 'Gastos por transferencia', color: '#dc2626', total: -gastosPorMetodo.transferencia.total, cantidad: gastosPorMetodo.transferencia.cantidad }] : [])
        ];
        return `<div class="cuadre-metodos-strip">
          ${pills.map(p => `<span class="cuadre-metodo-pill" style="--pill-c:${p.color}">${p.lbl}: <strong>${(p.total || 0) < 0 ? '−$' + Math.abs(p.total).toFixed(2) : '$' + (p.total || 0).toFixed(2)}</strong> <small>(${p.cantidad || 0})</small></span>`).join('')}
        </div>`;
      })()}
      ${todos.length ? `
      <table class="adm-tabla" style="margin-top:1rem">
        <thead><tr>
          <th>Pedido</th>
          <th style="text-align:right">Monto</th>
          <th>Creado por</th>
          <th style="text-align:center">Estado</th>
          <th>Cobrado por</th>
          <th id="th-cuadre-metodo" style="cursor:pointer;user-select:none" title="Clic para ${_cuadreOrdenMetodo ? 'volver al orden por hora' : 'agrupar por método de pago'}">
            Método de pago ${_cuadreOrdenMetodo ? '▾ agrupado' : '↕'}
          </th>
          <th style="text-align:center">Recibido en efectivo</th>
          <th>Anulado por</th>
        </tr></thead>
        <tbody>${filasPedidos}</tbody>
      </table>
      ` : '<p style="text-align:center;color:#888;font-size:.85rem;padding:1.5rem 0;font-style:italic">No hay pedidos registrados hoy.</p>'}
      <div id="cierre-caja-estado" style="margin-top:1.25rem"></div>`;

    document.getElementById('th-cuadre-metodo')?.addEventListener('click', () => {
      _cuadreOrdenMetodo = !_cuadreOrdenMetodo;
      _renderCuadreCaja(periodo, fechaSel, labelDia, SC, porMetodo, metodoPorPedido);
    });

    await _renderCierreCajaEstado(fechaSel, labelDia, SC);
  }

  // Solo lectura — el admin puede VER si ya se cerró la caja de ese día y
  // con qué diferencia, pero cerrarla (la acción) es tarea del cajero,
  // desde su propio panel.
  const _CC_SELECT = 'cierre_fondo_inicial, cierre_efectivo_ventas, cierre_gastos_caja, cierre_efectivo_esperado, cierre_efectivo_contado, cierre_diferencia, cierre_notas, cierre_usu_id, cierre_created_at';

  async function _renderCierreCajaEstado(fechaSel, labelDia, SC) {
    const el = document.getElementById('cierre-caja-estado');
    if (!el) return;
    const { data: c, error } = await window.db.from('cierres_caja').select(_CC_SELECT).eq('cierre_fecha', fechaSel).maybeSingle();
    if (error) { console.error('Supabase cierres_caja select:', error); el.innerHTML = ''; return; }

    if (!c) {
      el.innerHTML = `
        <div class="cierre-caja cierre-caja--pendiente">
          <div class="cierre-caja__header">💰 Cierre de caja — ${SC?.escapeHtml(labelDia) ?? labelDia}</div>
          <p class="cierre-caja__meta" style="margin-bottom:0">Todavía no se ha cerrado la caja de este día — lo hace el cajero desde su panel.</p>
        </div>`;
      return;
    }

    const users = window.ModuloAutenticacion?.leerUsuarios() ?? [];
    const nombreQuien = users.find(u => u.id === c.cierre_usu_id)?.nombre ?? 'Alguien';
    const dif = parseFloat(c.cierre_diferencia) || 0;
    const difFmt = dif > 0 ? `+$${dif.toFixed(2)}` : dif < 0 ? `-$${Math.abs(dif).toFixed(2)}` : '$0.00';
    const hora = new Date(c.cierre_created_at).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = `
      <div class="cierre-caja cierre-caja--cerrado">
        <div class="cierre-caja__header">💰 Cierre de caja — ${SC?.escapeHtml(labelDia) ?? labelDia} <span class="cierre-caja__badge">CERRADO</span></div>
        <div class="cierre-caja__resumen">
          <div><span>Fondo inicial</span><strong>$${parseFloat(c.cierre_fondo_inicial).toFixed(2)}</strong></div>
          <div><span>Ventas en efectivo</span><strong>$${parseFloat(c.cierre_efectivo_ventas).toFixed(2)}</strong></div>
          ${parseFloat(c.cierre_gastos_caja) > 0 ? `<div><span>Gastos pagados en efectivo hoy (informativo)</span><strong style="color:var(--text-muted)">$${parseFloat(c.cierre_gastos_caja).toFixed(2)}</strong></div>` : ''}
          <div><span>Esperado</span><strong>$${parseFloat(c.cierre_efectivo_esperado).toFixed(2)}</strong></div>
          <div><span>Contado</span><strong>$${parseFloat(c.cierre_efectivo_contado).toFixed(2)}</strong></div>
          <div><span>Diferencia</span><strong style="color:${dif === 0 ? '#16a34a' : '#dc2626'}">${difFmt}</strong></div>
        </div>
        <div class="cierre-caja__meta">Cerrado por ${SC?.escapeHtml(nombreQuien) ?? nombreQuien} a las ${hora}${c.cierre_notas ? ` — "${SC?.escapeHtml(c.cierre_notas) ?? c.cierre_notas}"` : ''}</div>
      </div>`;
  }

  async function _renderGastos() {
    await window.SC?.recargarGastos?.();
    window.VistaCajero?.renderGastos?.();
    _poblarSelectCategoriaGasto();
    _initBtnGasto();
  }

  // preferirId: categoría a dejar seleccionada tras repoblar (ej. la que
  // se acaba de crear) — si no se pasa, intenta conservar la actual.
  function _poblarSelectCategoriaGasto(preferirId) {
    const sel = document.getElementById('gasto-categoria');
    if (!sel) return;
    const SC   = window.SC;
    const cats = SC?.leerCategoriasGasto?.() ?? [];
    const valorPrevio = preferirId ?? sel.value;
    sel.innerHTML = '<option value="">Sin categoría</option>'
      + cats.map(c => `<option value="${c.id}">${SC?.escapeHtml(c.nombre) ?? c.nombre}</option>`).join('')
      + '<option value="__nueva__">+ Nueva categoría…</option>';
    sel.value = (valorPrevio && [...sel.options].some(o => o.value === valorPrevio)) ? valorPrevio : '';
  }

  // Tope de 3 dígitos enteros ($999.99) — un gasto diario no debería
  // pasar de ahí; evita que alguien escriba un número absurdo por error.
  const _GASTO_MONTO_MAX = 999.99;

  function _initBtnGasto() {
    const SC  = window.SC;
    const btn = document.getElementById('btn-add-gasto');
    const sel = document.getElementById('gasto-categoria');
    const montoInput = document.getElementById('gasto-monto');
    const catFila   = document.getElementById('gastos-nueva-cat-fila');
    const catInput  = document.getElementById('gasto-cat-nueva-nombre');
    const btnCatOk  = document.getElementById('btn-confirmar-cat-gasto');
    const btnCatCanc = document.getElementById('btn-cancelar-cat-gasto');

    if (montoInput && !montoInput._gastoMontoBound) {
      montoInput._gastoMontoBound = true;
      montoInput.addEventListener('input', () => {
        const valor = parseFloat(montoInput.value);
        if (!isNaN(valor) && valor > _GASTO_MONTO_MAX) montoInput.value = _GASTO_MONTO_MAX;
      });
    }

    if (sel && !sel._gastoCatBound) {
      sel._gastoCatBound = true;
      sel.addEventListener('change', () => {
        if (!catFila) return;
        if (sel.value === '__nueva__') {
          catFila.style.display = '';
          if (catInput) { catInput.value = ''; catInput.focus(); }
        } else {
          catFila.style.display = 'none';
        }
      });
    }
    if (btnCatOk && !btnCatOk._bound) {
      btnCatOk._bound = true;
      btnCatOk.addEventListener('click', async () => {
        const nombre = catInput?.value.trim();
        if (!nombre) { SC?.toast('Escribe el nombre de la categoría.', 'error'); return; }
        btnCatOk.disabled = true;
        const nueva = await SC?.crearCategoriaGasto?.(nombre);
        btnCatOk.disabled = false;
        if (!nueva) { SC?.toast('Error al crear la categoría.', 'error'); return; }
        _poblarSelectCategoriaGasto(nueva.id);
        if (catFila) catFila.style.display = 'none';
        SC?.toast(`Categoría "${nueva.nombre}" creada ✓`, 'success');
      });
    }
    if (btnCatCanc && !btnCatCanc._bound) {
      btnCatCanc._bound = true;
      btnCatCanc.addEventListener('click', () => {
        if (catFila) catFila.style.display = 'none';
        if (sel) sel.value = '';
      });
    }

    if (!btn || btn._gastoBound) return;
    btn._gastoBound = true;
    btn.addEventListener('click', async () => {
      const desc  = document.getElementById('gasto-desc')?.value.trim();
      const monto = parseFloat(document.getElementById('gasto-monto')?.value);
      const categoriaId = document.getElementById('gasto-categoria')?.value;
      const metodoPago  = document.getElementById('gasto-metodo')?.value || 'efectivo';
      if (!desc)       { SC?.toast('Escribe una descripción.', 'error'); return; }
      if (!monto || monto <= 0) { SC?.toast('Ingresa un monto válido.', 'error'); return; }
      if (monto > _GASTO_MONTO_MAX) { SC?.toast(`Monto demasiado grande — máximo $${_GASTO_MONTO_MAX}.`, 'error'); return; }
      if (categoriaId === '__nueva__') { SC?.toast('Confirma la categoría nueva primero.', 'error'); return; }
      btn.disabled = true;
      // Reutiliza SC.insertarGasto (ya pasa por la RPC registrar_gasto, exige sesión de staff)
      const nuevoGasto = await SC?.insertarGasto?.({ descripcion: desc, monto, categoriaId: categoriaId || null, metodoPago });
      btn.disabled = false;
      if (!nuevoGasto) return; // el error ya se mostró dentro de insertarGasto
      document.getElementById('gasto-desc').value  = '';
      document.getElementById('gasto-monto').value = '';
      const selMetodo = document.getElementById('gasto-metodo');
      if (selMetodo) selMetodo.value = 'efectivo';
      SC?.toast('Gasto registrado ✓', 'success');
      _renderGastos();
    });
  }

  const _ROLES_EMP = [
    { id: 'rol001', nombre: 'Administrador' },
    { id: 'rol002', nombre: 'Cajero' },
    { id: 'rol003', nombre: 'Mesero' }
  ];

  let _empEditId    = null; // emp_id en edición, null = nuevo
  let _empEditUsuId = null; // usu_id del empleado en edición

  const _EF_SOLO_LETRAS = /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'.,-]+$/;
  const _EF_SOLO_NUMS   = /^\d+$/;
  const _EF_TEL_EC      = /^(09\d{8}|0[2-7]\d{7})$/;
  const _EF_EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const _EF_DOMINIOS    = new Set([
    'gmail.com','googlemail.com',
    'outlook.com','outlook.es','outlook.com.ec',
    'hotmail.com','hotmail.es','hotmail.com.ec',
    'live.com','live.com.ec','live.es',
    'yahoo.com','yahoo.es','yahoo.com.ec',
    'icloud.com','me.com','mac.com',
    'protonmail.com','proton.me',
    'microsoft.com','msn.com',
    'mail.com','zoho.com','aol.com',
    'universidad.edu.ec','espol.edu.ec','ucuenca.edu.ec','puce.edu.ec'
  ]);

  function _efClearErrors() {
    ['nombre','apellido','rol','fecha','telefono','email','usuario','password'].forEach(k => {
      const el = document.getElementById(`ef-err-${k}`);
      if (el) { el.textContent = ''; el.style.display = 'none'; }
    });
    const inp = ['ef-nombre','ef-apellido','ef-telefono','ef-email','ef-usuario','ef-password'];
    inp.forEach(id => { const el = document.getElementById(id); if (el) el.style.borderColor = ''; });
    _mostrarEfError('');
  }

  function _efSetError(campo, msg) {
    const err = document.getElementById(`ef-err-${campo}`);
    const inp = document.getElementById(`ef-${campo}`);
    if (err) { err.textContent = msg; err.style.display = msg ? 'block' : 'none'; }
    if (inp) inp.style.borderColor = msg ? '#dc2626' : '';
  }

  function _abrirFormEmpleado(emp = null) {
    _empEditId    = emp?.emp_id  ?? null;
    _empEditUsuId = emp?.usu_id  ?? null;
    const esEdicion = !!emp;
    document.getElementById('emp-form-title').textContent = esEdicion ? 'Editar Empleado' : 'Nuevo Empleado';
    document.getElementById('ef-nombre').value         = emp?.usu_nombre        ?? '';
    document.getElementById('ef-apellido').value       = emp?.usu_apellido      ?? '';
    const rolIdsPrevios = emp?.rol_ids ?? ['rol002'];
    document.getElementById('ef-rol-rol002').checked = rolIdsPrevios.includes('rol002');
    document.getElementById('ef-rol-rol003').checked = rolIdsPrevios.includes('rol003');
    document.getElementById('ef-rol-rol005').checked = rolIdsPrevios.includes('rol005');
    document.getElementById('ef-fecha-ingreso').value  = emp?.emp_fecha_ingreso ?? _fechaLocalISO();
    document.getElementById('ef-telefono').value       = emp?.usu_telefono      ?? '';
    document.getElementById('ef-email').value          = emp?.usu_email         ?? '';
    document.getElementById('ef-usuario').value        = emp?.usu_usuario       ?? '';
    document.getElementById('ef-usuario').disabled     = esEdicion;
    document.getElementById('ef-password').value       = '';
    document.getElementById('ef-observaciones').value  = emp?.emp_observaciones ?? '';
    document.getElementById('ef-password-group').style.display = esEdicion ? 'none' : '';
    _efClearErrors();
    const bd = document.getElementById('emp-form-backdrop');
    bd.classList.add('open');
    bd.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.getElementById('ef-nombre').focus();
  }

  function _cerrarFormEmpleado() {
    const bd = document.getElementById('emp-form-backdrop');
    bd.classList.remove('open');
    bd.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    _empEditId    = null;
    _empEditUsuId = null;
  }

  function _mostrarEfError(msg) {
    const el = document.getElementById('ef-error');
    el.textContent = msg;
    el.style.display = msg ? '' : 'none';
  }

  async function _guardarEmpleado() {
    _efClearErrors();

    const nombre   = document.getElementById('ef-nombre').value.trim();
    const apellido = document.getElementById('ef-apellido').value.trim();
    const ROL_LABEL = { rol002: 'Cajero', rol003: 'Mesero', rol005: 'Cocinero' };
    const rolIds = Object.keys(ROL_LABEL).filter(id => document.getElementById(`ef-rol-${id}`)?.checked);
    const cargo    = rolIds.map(id => ROL_LABEL[id]).join(' + ');
    const fecha    = document.getElementById('ef-fecha-ingreso').value;
    const telefono = document.getElementById('ef-telefono').value.trim();
    const email    = document.getElementById('ef-email').value.trim();
    const usuario  = document.getElementById('ef-usuario').value.trim();
    const password = document.getElementById('ef-password').value;
    const obs      = document.getElementById('ef-observaciones').value.trim();

    // Validación de campos
    let valido = true;

    if (!nombre) {
      _efSetError('nombre', 'El nombre es obligatorio.');
      valido = false;
    } else if (nombre.length < 2) {
      _efSetError('nombre', 'Mínimo 2 caracteres.');
      valido = false;
    } else if (!_EF_SOLO_LETRAS.test(nombre)) {
      _efSetError('nombre', 'Solo letras y espacios, sin números.');
      valido = false;
    }

    if (apellido && !_EF_SOLO_LETRAS.test(apellido)) {
      _efSetError('apellido', 'Solo letras y espacios, sin números.');
      valido = false;
    }

    if (!rolIds.length) {
      _efSetError('rol', 'Elige al menos un rol.');
      valido = false;
    }

    if (!fecha) {
      _efSetError('fecha', 'La fecha de ingreso es obligatoria.');
      valido = false;
    }

    if (telefono && !_EF_TEL_EC.test(telefono)) {
      _efSetError('telefono', 'Número ecuatoriano inválido. Ej: 0987654321');
      valido = false;
    }

    if (email) {
      const errEmail = _validarEmail(email);
      if (errEmail) { _efSetError('email', errEmail); valido = false; }
    }

    if (!_empEditId) {
      if (!usuario) {
        _efSetError('usuario', 'El usuario de login es obligatorio.');
        valido = false;
      } else if (!/^[a-zA-Z0-9._-]{3,20}$/.test(usuario)) {
        _efSetError('usuario', 'Solo letras, números, puntos, guiones. 3-20 caracteres.');
        valido = false;
      }
      if (password.length < 4) {
        _efSetError('password', 'Mínimo 4 caracteres.');
        valido = false;
      }
    }
    if (!valido) return;

    // Verificar teléfono duplicado
    if (telefono) {
      const { data: telEx } = await window.db
        .from('usuarios')
        .select('usu_id')
        .eq('usu_telefono', telefono)
        .maybeSingle();
      if (telEx && telEx.usu_id !== _empEditUsuId) {
        _efSetError('telefono', 'Este número ya está registrado.');
        return;
      }
    }

    const btn = document.getElementById('btn-emp-save');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    let res, err;

    if (_empEditId) {
      ({ data: res, error: err } = await window.db.rpc('actualizar_empleado', {
        p_emp_id:        _empEditId,
        p_cargo:         cargo,
        p_rol_ids:       rolIds,
        p_observaciones: obs
      }));
    } else {
      ({ data: res, error: err } = await window.db.rpc('crear_empleado', {
        p_nombre:        nombre,
        p_apellido:      apellido,
        p_email:         email,
        p_telefono:      telefono,
        p_usuario:       usuario,
        p_password:      password,
        p_rol_ids:       rolIds,
        p_cargo:         cargo,
        p_fecha_ingreso: fecha,
        p_observaciones: obs
      }));
    }

    btn.disabled = false;
    btn.textContent = 'Guardar empleado';

    if (err || !res?.ok) {
      _mostrarEfError(res?.msg ?? 'Error al guardar. Intenta de nuevo.');
      return;
    }

    const fueEdicion = !!_empEditId;
    _cerrarFormEmpleado();
    window.SC?.toast(fueEdicion ? 'Empleado actualizado ✓' : 'Empleado creado ✓', 'success');
    renderEmpleados();
  }

  async function renderEmpleados() {
    const el = document.getElementById('admin-empleados-lista');
    if (!el) return;
    el.innerHTML = '<p class="usu-cargando">Cargando empleados…</p>';

    const { data, error } = await window.db.rpc('listar_empleados');
    if (error || !data) { el.innerHTML = '<p style="color:#dc2626;font-size:.9rem">Error al cargar empleados.</p>'; return; }

    const session = window.ModuloAutenticacion.getSession();

    if (!data.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;padding:1rem 0">No hay empleados registrados aún.</p>';
      return;
    }

    const _fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';

    el.innerHTML = data.map(e => {
      const esSelf  = e.usu_id === session?.id;
      const activo  = e.emp_activo !== false;
      return `
        <div class="emp-row${activo ? '' : ' emp-row--inactivo'}" data-emp-id="${e.emp_id}" data-usu-id="${e.usu_id}">
          <div class="usu-info">
            <span class="usu-avatar${activo ? '' : ' usu-avatar--inactivo'}">${e.usu_nombre.charAt(0).toUpperCase()}</span>
            <div class="usu-datos">
              <span class="usu-nombre">
                ${e.usu_nombre}${e.usu_apellido ? ' ' + e.usu_apellido : ''}
                ${esSelf ? '<span class="usu-badge-self">Tú</span>' : ''}
                ${!activo ? '<span class="usu-badge-inactivo">Inactivo</span>' : ''}
              </span>
              <span class="usu-sub">
                <strong>${e.emp_cargo}</strong> · desde ${_fmt(e.emp_fecha_ingreso)}
              </span>
              ${e.emp_observaciones ? `<span class="emp-obs">${e.emp_observaciones}</span>` : ''}
            </div>
          </div>
          <div class="usu-rol-wrap">
            <button class="usu-btn-cambiar emp-btn-editar" data-emp-id="${e.emp_id}">✏️ Editar</button>
            ${!esSelf ? `
            <button class="usu-btn-estado" data-usu-id="${e.usu_id}" data-activo="${activo}"
              data-nombre="${e.usu_nombre}${e.usu_apellido ? ' ' + e.usu_apellido : ''}"
              title="${activo ? 'Inhabilitar empleado' : 'Habilitar empleado'}">
              ${activo ? '🔒 Inhabilitar' : '🔓 Habilitar'}
            </button>
            <button class="usu-btn-eliminar emp-btn-eliminar"
              data-emp-id="${e.emp_id}" data-usu-id="${e.usu_id}"
              data-nombre="${e.usu_nombre}${e.usu_apellido ? ' ' + e.usu_apellido : ''}">
              🗑 Eliminar
            </button>` : ''}
          </div>
        </div>`;
    }).join('');

    // Editar
    el.querySelectorAll('.emp-btn-editar').forEach(btn => {
      btn.addEventListener('click', () => {
        const empId = btn.dataset.empId;
        const emp = data.find(e => e.emp_id === empId);
        if (emp) _abrirFormEmpleado(emp);
      });
    });

    // Activar / Dar de baja
    el.querySelectorAll('.usu-btn-estado').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id     = btn.dataset.usuId;
        const nombre = btn.dataset.nombre;
        const activo = btn.dataset.activo === 'true';
        const confirmado = await _modalEstado(nombre, activo);
        if (!confirmado) return;
        btn.disabled = true;
        const { data: res, error: err } = await window.db.rpc('cambiar_estado_usuario', { p_usu_id: id, p_activo: !activo });
        btn.disabled = false;
        if (err || !res?.ok) { window.SC?.toast('Error al cambiar estado', 'error'); return; }
        window.SC?.toast(activo ? 'Empleado inhabilitado ✓' : 'Empleado habilitado ✓', activo ? 'error' : 'success');
        // Notificar a otras pestañas del mismo navegador
        if (activo) window._scBroadcast?.postMessage({ tipo: 'inhabilitar', usu_id: id });
        renderEmpleados();
      });
    });

    // Eliminar empleado
    el.querySelectorAll('.emp-btn-eliminar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const empId  = btn.dataset.empId;
        const usuId  = btn.dataset.usuId;
        const nombre = btn.dataset.nombre;
        const confirmado = await _modalConfirmar(nombre);
        if (!confirmado) return;
        btn.disabled = true;
        btn.textContent = 'Eliminando…';
        const { data: res, error: err } = await window.db.rpc('eliminar_empleado', {
          p_emp_id: empId,
          p_usu_id: usuId
        });
        if (err || !res?.ok) {
          console.error('eliminar empleado:', err, res);
          window.SC?.toast(res?.msg ?? 'Error al eliminar el empleado', 'error');
          btn.disabled = false;
          btn.textContent = '🗑 Eliminar';
          return;
        }
        window.SC?.toast(`"${nombre}" eliminado ✓`, 'success');
        renderEmpleados();
      });
    });
  }

  async function renderClientes() {
    const el = document.getElementById('admin-clientes-lista');
    if (!el) return;
    el.innerHTML = '<p class="usu-cargando">Cargando clientes…</p>';

    // Usar RPC (SECURITY DEFINER) porque RLS bloquea query directa a usuarios con rol anon
    const { data: rpcData, error: qError } = await window.db.rpc('listar_usuarios');

    if (qError || !rpcData) {
      el.innerHTML = '<p style="color:#dc2626;font-size:.9rem">Error al cargar clientes.</p>';
      return;
    }

    const ROLES_EMPLEADO = new Set(['administrador', 'cajero', 'mesero', 'cocinero']);
    const data = rpcData
      .filter(u => !ROLES_EMPLEADO.has((u.rol ?? 'usuario').toLowerCase()))
      .map(u => ({
        usu_id:       u.usu_id,
        usu_usuario:  u.usu_usuario,
        usu_email:    u.usu_email,
        usu_nombre:   u.usu_nombre,
        usu_apellido: u.usu_apellido ?? '',
        usu_telefono: u.usu_telefono ?? '',
        usu_direccion: u.usu_direccion ?? '',
        usu_activo:   u.usu_activo ?? true
      }));

    if (!data.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;padding:1rem 0">No hay clientes registrados.</p>';
      return;
    }

    el.innerHTML = data.map(u => `
      <div class="usu-row${u.usu_activo === false ? ' usu-row--inactivo' : ''}">
        <div class="usu-info">
          <span class="usu-avatar${u.usu_activo === false ? ' usu-avatar--inactivo' : ''}">${u.usu_nombre.charAt(0).toUpperCase()}</span>
          <div class="usu-datos">
            <span class="usu-nombre">
              ${u.usu_nombre}${u.usu_apellido ? ' ' + u.usu_apellido : ''}
              ${u.usu_activo === false ? '<span class="usu-badge-inactivo">Inactivo</span>' : ''}
            </span>
            <span class="usu-sub">@${u.usu_usuario} · ${u.usu_email || 'sin correo'}</span>
            ${u.usu_telefono ? `<span class="usu-sub">📞 ${u.usu_telefono}</span>` : ''}
            ${u.usu_direccion ? `<span class="usu-sub usu-direccion">📍 ${u.usu_direccion}</span>` : ''}
          </div>
        </div>
      </div>`).join('');
  }

  function _initFormEmpleado() {
    document.getElementById('btn-nuevo-empleado')?.addEventListener('click', () => _abrirFormEmpleado(null));
    document.getElementById('btn-cerrar-emp-form')?.addEventListener('click', _cerrarFormEmpleado);
    document.getElementById('btn-emp-cancel')?.addEventListener('click', _cerrarFormEmpleado);
    document.getElementById('btn-emp-save')?.addEventListener('click', _guardarEmpleado);

    // Validación en tiempo real
    const efNombre = document.getElementById('ef-nombre');
    efNombre?.addEventListener('blur', () => {
      const v = efNombre.value.trim();
      if (!v) _efSetError('nombre', 'El nombre es obligatorio.');
      else if (v.length < 2) _efSetError('nombre', 'Mínimo 2 caracteres.');
      else if (!_EF_SOLO_LETRAS.test(v)) _efSetError('nombre', 'Solo letras y espacios, sin números.');
      else _efSetError('nombre', '');
    });
    efNombre?.addEventListener('input', () => {
      if (efNombre.value && !_EF_SOLO_LETRAS.test(efNombre.value))
        _efSetError('nombre', 'Solo letras y espacios, sin números.');
      else _efSetError('nombre', '');
    });

    const efApellido = document.getElementById('ef-apellido');
    efApellido?.addEventListener('blur', () => {
      const v = efApellido.value.trim();
      if (v && !_EF_SOLO_LETRAS.test(v)) _efSetError('apellido', 'Solo letras y espacios, sin números.');
      else _efSetError('apellido', '');
    });

    const efTel = document.getElementById('ef-telefono');
    efTel?.addEventListener('input', () => {
      // Bloquear todo lo que no sea número
      efTel.value = efTel.value.replace(/\D/g, '').slice(0, 10);
      _efSetError('telefono', '');
    });
    efTel?.addEventListener('blur', () => {
      const v = efTel.value.trim();
      if (!v) { _efSetError('telefono', ''); return; }
      if (!_EF_TEL_EC.test(v))
        _efSetError('telefono', 'Número ecuatoriano inválido. Ej: 0987654321');
      else _efSetError('telefono', '');
    });

    const efEmail = document.getElementById('ef-email');
    efEmail?.addEventListener('blur', () => {
      const v = efEmail.value.trim();
      if (!v) { _efSetError('email', ''); return; }
      _efSetError('email', _validarEmail(v));
    });

    const efUsuario = document.getElementById('ef-usuario');
    efUsuario?.addEventListener('blur', () => {
      const v = efUsuario.value.trim();
      if (!v) _efSetError('usuario', 'El usuario de login es obligatorio.');
      else if (!/^[a-zA-Z0-9._-]{3,20}$/.test(v)) _efSetError('usuario', 'Solo letras, números, puntos, guiones. 3-20 caracteres.');
      else _efSetError('usuario', '');
    });
    document.getElementById('emp-form-backdrop')?.addEventListener('click', e => {
      if (false) _cerrarFormEmpleado(); // solo cerrar con X o Cancelar
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('emp-form-backdrop')?.classList.contains('open')) {
        _cerrarFormEmpleado();
      }
    });
  }

  // renderUsuarios() eliminado — reemplazado por renderEmpleados() y renderClientes()

  async function _renderUsuariosLegacy() {
    const el = document.getElementById('admin-usuarios-lista');
    if (!el) return;

    el.innerHTML = '<p class="usu-cargando">Cargando usuarios…</p>';

    const { data, error } = await window.db.rpc('listar_usuarios');
    if (error || !data) {
      el.innerHTML = '<p style="color:#dc2626;font-size:.9rem">Error al cargar usuarios.</p>';
      return;
    }

    const session = window.ModuloAutenticacion.getSession();

    if (!data.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;padding:1rem 0">No hay usuarios registrados.</p>';
      return;
    }

    el.innerHTML = data.map(u => {
      const esSelf   = u.usu_id === session?.id;
      const activo   = u.usu_activo !== false;
      const rolActual = (u.rol ?? 'usuario').toLowerCase();
      return `
        <div class="usu-row${activo ? '' : ' usu-row--inactivo'}" data-usu-id="${u.usu_id}">
          <div class="usu-info">
            <span class="usu-avatar${activo ? '' : ' usu-avatar--inactivo'}">${u.usu_nombre.charAt(0).toUpperCase()}</span>
            <div class="usu-datos">
              <span class="usu-nombre">
                ${u.usu_nombre}${u.usu_apellido ? ' ' + u.usu_apellido : ''}
                ${!activo ? '<span class="usu-badge-inactivo">Inactivo</span>' : ''}
              </span>
              <span class="usu-sub">@${u.usu_usuario} · ${u.usu_email}</span>
            </div>
          </div>
          <div class="usu-rol-wrap">
            <select class="usu-rol-select" data-usu-id="${u.usu_id}"
              ${esSelf || !activo ? 'disabled' : ''}
              ${esSelf ? 'title="No puedes cambiar tu propio rol"' : ''}>
              ${_ROLES.map(r => `<option value="${r.id}" ${rolActual === r.nombre.toLowerCase() ? 'selected' : ''}>${r.nombre}</option>`).join('')}
            </select>
            <button class="usu-btn-cambiar" data-usu-id="${u.usu_id}" ${esSelf || !activo ? 'disabled' : ''}>
              Guardar
            </button>
            ${!esSelf ? `
            <button class="usu-btn-estado" data-usu-id="${u.usu_id}" data-activo="${activo}"
              title="${activo ? 'Desactivar usuario' : 'Reactivar usuario'}">
              ${activo ? '🔒 Desactivar' : '🔓 Reactivar'}
            </button>` : ''}
          </div>
        </div>`;
    }).join('');

    el.querySelectorAll('.usu-btn-cambiar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id     = btn.dataset.usuId;
        const select = el.querySelector(`.usu-rol-select[data-usu-id="${id}"]`);
        const rolId  = select.value;
        btn.disabled    = true;
        btn.textContent = '…';

        const { data: res, error: err } = await window.db.rpc('cambiar_rol_usuario', {
          p_usu_id: id,
          p_rol_id: rolId
        });

        btn.disabled    = false;
        btn.textContent = 'Guardar';

        if (err || !res?.ok) {
          window.SC?.toast(res?.msg ?? 'Error al cambiar rol', 'error');
        } else {
          window.SC?.toast('Rol actualizado ✓', 'success');
          await window.ModuloAutenticacion.cargarUsuarios();
        }
      });
    });

    el.querySelectorAll('.usu-btn-estado').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id     = btn.dataset.usuId;
        const activo = btn.dataset.activo === 'true';
        const accion = activo ? 'desactivar' : 'reactivar';
        if (!confirm(`¿Seguro que deseas ${accion} este usuario?`)) return;

        btn.disabled = true;
        const { data: res, error: err } = await window.db.rpc('cambiar_estado_usuario', {
          p_usu_id: id,
          p_activo: !activo
        });
        btn.disabled = false;

        if (err || !res?.ok) {
          window.SC?.toast('Error al cambiar estado', 'error');
        } else {
          window.SC?.toast(`Usuario ${activo ? 'desactivado' : 'reactivado'} ✓`, activo ? 'error' : 'success');
          _renderUsuariosLegacy();
        }
      });
    });
  }

  return {
    renderAdminView, renderAdminPedidos, abrirFormProducto, cerrarFormProducto, init, cambiarModulo: _cambiarModulo,
    // Expuestas para pruebas unitarias (tests/vista-admin.test.js) — funciones puras, sin efectos.
    _fechaLocalISO, _lunesDeSemana, _fechaConOffset, _labelDiaOffset, _rangoSemanaLaboral
  };
})();
