'use strict';
/**
 * vista-admin.js — Vista del panel de administrador.
 * Depende de window.SC (API compartida) y DOM de admin-view.
 */
window.VistaAdmin = (function () {

  // Fecha local (YYYY-MM-DD) — toISOString() usa UTC y desfasa la fecha en
  // zonas horarias detrás de UTC (p.ej. Ecuador, UTC-5) durante la noche.
  function _fechaLocalISO(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  let _prodFormImgBase64 = null;
  let _prodFormEditId    = null;

  const _CATS_ORDER = ['Desayunos','Entradas','Almuerzos','Postres','Bocaditos','Bebidas Calientes','Bebidas Frías','Platos Fuertes'];
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
          ${esNuevo && !oculto ? '<span class="admin-badge-nuevo">Nuevo</span>' : ''}
          ${oculto ? '<span class="admin-badge-oculto">Oculto</span>' : ''}
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

  async function renderAdminPedidos() {
    const el = document.getElementById('admin-pedidos-lista');
    if (!el) return;

    el.innerHTML = `<div class="cajero-grid">${Array(3).fill(0).map(() =>
      `<div class="cajero-order-card" style="min-height:180px;opacity:.35;animation:pulse 1.2s infinite"></div>`
    ).join('')}</div>`;

    const PED_SEL = `
      ped_id, ped_estado, ped_nombre_invitado, ped_fecha, ped_hora,
      ped_subtotal, ped_iva, ped_total, ped_created_at, usu_id, mes_id,
      mesas(mes_numero),
      detalle_pedidos(detped_id, detped_cantidad, detped_precio_unit, detped_subtotal,
        platos(plat_nombre), det_exclusiones(ingredientes(ing_nombre)))
    `;

    const hoy = _fechaLocalISO();
    const { data, error } = await window.db
      .from('pedidos')
      .select(PED_SEL)
      .gte('ped_fecha', hoy)
      .not('ped_estado', 'in', '("cancelado","cobrado")')
      .order('ped_created_at', { ascending: true });

    if (error) { el.innerHTML = '<p style="color:#dc2626;font-size:.9rem;padding:1rem 0">Error al cargar pedidos.</p>'; return; }

    const pedidos = data ?? [];
    const badge = document.getElementById('adm-ped-badge');
    if (badge) { badge.textContent = pedidos.length; badge.style.display = pedidos.length > 0 ? '' : 'none'; }

    const SC    = window.SC;
    const users = window.ModuloAutenticacion.leerUsuarios();

    const ROL_LABEL = { cajero: 'Caja', mesero: 'Mesero', usuario: 'Cliente', invitado: 'Invitado' };

    const _mesa  = p => p.mesas?.mes_numero ? `Mesa ${p.mesas.mes_numero}` : 'Para llevar';
    const _hora  = p => p.ped_hora?.slice(0,5)
      ?? (p.ped_created_at ? new Date(p.ped_created_at).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'}) : '—');
    const _rolNombre = p => {
      if (!p.usu_id) return 'invitado';
      const u = users.find(u => u.id === p.usu_id);
      return u?.rol ?? 'usuario';
    };
    const _nombre = p => {
      if (!p.usu_id) return p.ped_nombre_invitado ?? 'Invitado';
      const u = users.find(u => u.id === p.usu_id);
      return u?.nombre ?? 'Usuario';
    };

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
      const rol  = _rolNombre(p);
      const nombre = _nombre(p);
      return `
        <div class="cajero-order-card" data-pid="${p.ped_id}">
          <div class="cajero-order-card__head">
            <div class="cajero-order-meta">
              <div class="cajero-order-mesa">🪑 ${_mesa(p)}</div>
              <div class="cajero-order-quien">
                <span class="rol-pill ${rol}">${ROL_LABEL[rol] ?? rol}</span>
                <span>${SC.escapeHtml(nombre)}</span>
              </div>
            </div>
            <div class="cajero-order-time">🕐 ${_hora(p)}</div>
          </div>
          <div class="cajero-order-items">
            ${det.map(d => {
              const excl = (d.det_exclusiones ?? []).map(e => e.ingredientes?.ing_nombre).filter(Boolean);
              return `
                <div class="cajero-order-item">
                  <span class="cajero-order-item__name">
                    ${SC.escapeHtml(d.platos?.plat_nombre ?? '?')}
                    ${excl.length ? `<span class="cajero-excl"> sin: ${excl.join(', ')}</span>` : ''}
                  </span>
                  <span class="caj-qty__val">${d.detped_cantidad}</span>
                  <span class="cajero-order-item__price">$${(parseFloat(d.detped_subtotal)||0).toFixed(2)}</span>
                </div>`;
            }).join('')}
          </div>
          <div class="cajero-order-subtotals">
            <div><span>Subtotal</span><span>$${(parseFloat(p.ped_subtotal)||0).toFixed(2)}</span></div>
            <div class="iva-line"><span>IVA 15 %</span><span>$${(parseFloat(p.ped_iva)||0).toFixed(2)}</span></div>
            <div class="total-line"><span>Total</span><span>$${(parseFloat(p.ped_total)||0).toFixed(2)}</span></div>
          </div>
          <div class="cajero-order-card__foot" style="justify-content:center">
            <span style="font-size:.8rem;font-weight:600;color:var(--cinnamon);letter-spacing:.04em;text-transform:uppercase;opacity:.75">
              ⏳ Pendiente de cobro
            </span>
          </div>
        </div>`;
    }).join('')}</div>`;
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
    // Contar mensajes sin leer
    try {
      const { data: msgs } = await window.db.from('mensajes').select('mens_leido').eq('mens_leido', false);
      const noLeidos = msgs?.length ?? 0;
      const statMsg = document.getElementById('admin-stat-mensajes');
      if (statMsg) statMsg.textContent = noLeidos;
      const badgeMsg = document.getElementById('admin-mensajes-badge');
      if (badgeMsg) { badgeMsg.textContent = noLeidos; badgeMsg.style.display = noLeidos > 0 ? '' : 'none'; }
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
  }

  function _renderProductosGrid() {
    const SC   = window.SC;
    const grid = document.getElementById('admin-productos-grid');
    if (!grid) return;

    const todos = SC.getAllProductosMergeados ? SC.getAllProductosMergeados() : SC.getProductosMergeados();
    const porCat = {};
    todos.forEach(p => { if (!porCat[p.categoria]) porCat[p.categoria] = []; porCat[p.categoria].push(p); });
    const cats = _CATS_ORDER.filter(c => porCat[c]).concat(Object.keys(porCat).filter(c => !_CATS_ORDER.includes(c) && porCat[c]));

    grid.innerHTML = cats.map(cat => `
      <div class="admin-cat-section">
        <h3 class="admin-cat-title" data-cat="${cat}">${cat} <span class="admin-cat-count">${porCat[cat].length}</span></h3>
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
        const ok = await SC.eliminarMenuItemDB(id);
        _renderProductosGrid();
        _renderDashboardStats();
        const cat = SC.getFiltroSesion();
        window.VistaMenu?.renderProductos(window.VistaMenu?.getListaByCat(cat));
        if (ok) SC.toast('Producto eliminado ✓', 'success');
        else    SC.toast('Eliminado localmente (error en la nube)', 'error');
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
      btn.addEventListener('click', () => renderReportes(btn.dataset.period));
    });
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

    const { data, error } = await window.db
      .from('mensajes')
      .select('*')
      .order('mens_enviado_en', { ascending: false });

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
        const id = Number(btn.dataset.id);
        const { error } = await window.db.from('mensajes').update({ mens_leido: true }).eq('mens_id', id);
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
    document.getElementById('pf-categoria').value    = p?.categoria   ?? 'Desayunos';
    document.getElementById('pf-precio').value       = p?.precio != null ? (+p.precio).toFixed(2) : '';
    document.getElementById('pf-descripcion').value  = p?.descripcion ?? '';
    document.getElementById('pf-tag').value               = p?.tag            ?? '';
    document.getElementById('pf-visible').checked         = p ? (p.activo !== false) : true;
    document.getElementById('pf-destacado').checked       = p?.destacado      ?? false;
    document.getElementById('pf-permite-excluir').checked = p?.permiteExcluir ?? false;
    document.getElementById('pf-stock').value        = p ? SC.getStock(p.id).stock : '';
    const ings = Array.isArray(p?.ingredientes) ? p.ingredientes.map(i => typeof i === 'string' ? i : i.nombre).join(', ') : '';
    document.getElementById('pf-ingredientes').value = ings;
    document.getElementById('pf-imagen').value       = '';

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

  function _modalConfirmar(nombre) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:2rem 1.75rem 1.5rem;max-width:360px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.3);text-align:center;animation:fadeUp .18s ease;">
          <div style="font-size:2.5rem;line-height:1;margin-bottom:.75rem;">🗑️</div>
          <h3 style="font-size:1.1rem;font-weight:700;color:#3B1A08;margin-bottom:.4rem;">¿Eliminar producto?</h3>
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
    _mostrarErrorPrecio('');
    _mostrarErrorDescripcion('');
    _mostrarErrorIngredientes('');
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

  function _validarEmail(valor) {
    const v = valor.trim().toLowerCase();
    if (!_EF_EMAIL_RE.test(v)) return 'Formato de correo inválido.';
    const dominio = v.split('@')[1];
    if (!_EF_DOMINIOS.has(dominio)) return 'Usa un correo conocido (Gmail, Outlook, Yahoo, etc.).';
    return '';
  }

  function _validarIngredientes(valor) {
    const v = valor.trim();
    if (!v) return 'Los ingredientes son obligatorios.';
    const partes = v.split(',').map(s => s.trim()).filter(Boolean);
    if (!partes.length) return 'Ingresa al menos un ingrediente.';
    return '';
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
  const _mostrarErrorPrecio      = msg => _mostrarError('pf-precio',      'pf-precio-error',      msg);
  const _mostrarErrorDescripcion = msg => _mostrarError('pf-descripcion', 'pf-descripcion-error', msg);
  const _mostrarErrorIngredientes= msg => _mostrarError('pf-ingredientes','pf-ingredientes-error', msg);

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

  function init() {
    _setupDragDrop();

    const pfNombre = document.getElementById('pf-nombre');
    pfNombre.addEventListener('input', () => _mostrarErrorNombre(_validarNombre(pfNombre.value)));
    pfNombre.addEventListener('blur',  () => _mostrarErrorNombre(_validarNombre(pfNombre.value)));

    const pfPrecio = document.getElementById('pf-precio');
    pfPrecio.addEventListener('input', () => { if (pfPrecio.value) _mostrarErrorPrecio(_validarPrecio(pfPrecio.value)); });
    pfPrecio.addEventListener('blur',  () => _mostrarErrorPrecio(_validarPrecio(pfPrecio.value)));

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
      const nombre        = document.getElementById('pf-nombre').value.trim();
      const precioRaw     = document.getElementById('pf-precio').value;
      const precio        = Math.round(parseFloat(precioRaw) * 100) / 100;
      const descripcion   = document.getElementById('pf-descripcion').value.trim();
      const ingredientesRaw = document.getElementById('pf-ingredientes').value.trim();

      const errNombre = _validarNombre(nombre);
      const errPrecio = _validarPrecio(precioRaw);
      const errIng    = _validarIngredientes(ingredientesRaw);

      _mostrarErrorNombre(errNombre);
      _mostrarErrorPrecio(errPrecio);
      _mostrarErrorDescripcion(!descripcion ? 'La descripción es obligatoria.' : '');
      _mostrarErrorIngredientes(errIng);

      if (errNombre)   { document.getElementById('pf-nombre').focus(); return; }
      if (errPrecio)   { document.getElementById('pf-precio').focus(); return; }
      if (!descripcion){ document.getElementById('pf-descripcion').focus(); return; }
      if (errIng)      { document.getElementById('pf-ingredientes').focus(); return; }
      if (!_prodFormImgBase64) { _mostrarErrorImagen('La imagen del plato es obligatoria.'); return; }

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
      const ingredientes  = ingredientesRaw.split(',').map(s => s.trim()).filter(Boolean);

      const item = {
        id,
        nombre,
        categoria:   document.getElementById('pf-categoria').value,
        descripcion,
        precio,
        ingredientes,
        tag:            document.getElementById('pf-tag').value.trim(),
        imagen:         _prodFormImgBase64,
        activo:         document.getElementById('pf-visible').checked,
        destacado:      document.getElementById('pf-destacado').checked,
        permiteExcluir: document.getElementById('pf-permite-excluir').checked,
        stock_inicial: stockInicial
      };

      await SC.guardarMenuItemDB(item);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
      cerrarFormProducto();
      _renderProductosGrid();
      _renderDashboardStats();
      const cat = SC.getFiltroSesion();
      window.VistaMenu?.renderProductos(window.VistaMenu?.getListaByCat(cat));
      SC.toast(`Producto "${nombre}" guardado ✓`, 'success');
    });

    _initFormEmpleado();
    _initAdminNav();
  }

  async function renderReportes(periodo) {
    if (!periodo) {
      const activeTab = document.querySelector('.rep-tab.active');
      periodo = activeTab?.dataset.period ?? 'hoy';
    }

    // Carga Plotly dinámicamente la primera vez que se abre Reportes
    if (!window.Plotly) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/plotly.js-dist@2.35.2/plotly.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    document.querySelectorAll('.rep-tab').forEach(t => {
      const active = t.dataset.period === periodo;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    const kpisEl = document.getElementById('reportes-kpis');
    if (!kpisEl) return;
    kpisEl.innerHTML = '<p class="usu-cargando" style="grid-column:1/-1">Cargando reportes…</p>';

    const hoy    = new Date();
    const hoyISO = _fechaLocalISO(hoy);

    let desdeStr, periodoLabel, chartTitleVentas, tablaTitulo;
    if (periodo === 'hoy') {
      desdeStr         = hoyISO;
      periodoLabel     = 'hoy';
      chartTitleVentas = 'Ventas por hora (hoy)';
      tablaTitulo      = 'Pedidos cobrados hoy';
    } else if (periodo === 'semana') {
      const d = new Date(hoy); d.setDate(d.getDate() - 6);
      desdeStr         = _fechaLocalISO(d);
      periodoLabel     = '7 días';
      chartTitleVentas = 'Ventas últimos 7 días';
      tablaTitulo      = 'Pedidos — últimos 7 días';
    } else {
      const d = new Date(hoy); d.setDate(d.getDate() - 29);
      desdeStr         = _fechaLocalISO(d);
      periodoLabel     = '30 días';
      chartTitleVentas = 'Ventas últimos 30 días';
      tablaTitulo      = 'Pedidos — últimos 30 días';
    }

    const chartTitleEl = document.getElementById('rep-chart-ventas-title');
    if (chartTitleEl) chartTitleEl.textContent = chartTitleVentas;
    const tablaTituloEl = document.getElementById('rep-tabla-titulo');
    if (tablaTituloEl) tablaTituloEl.textContent = tablaTitulo;

    const { data: pedidos, error: errPed } = await window.db
      .from('pedidos')
      .select('ped_id, ped_total, ped_subtotal, ped_iva, ped_fecha, ped_cobrado_en, ped_nombre_invitado, usu_id, mesas(mes_numero), detalle_pedidos(detped_cantidad, detped_subtotal, platos(plat_nombre))')
      .eq('ped_estado', 'cobrado')
      .gte('ped_fecha', desdeStr)
      .order('ped_cobrado_en', { ascending: false });

    if (errPed) {
      kpisEl.innerHTML = '<p style="color:#dc2626;font-size:.9rem;grid-column:1/-1">Error al cargar reportes.</p>';
      return;
    }

    const data = pedidos ?? [];

    // ── KPIs ──────────────────────────────────────────────────────
    const totalVentas = data.reduce((s, p) => s + (parseFloat(p.ped_total) || 0), 0);
    const numPedidos  = data.length;
    const promedio    = numPedidos ? totalVentas / numPedidos : 0;
    const totalIva    = data.reduce((s, p) => s + (parseFloat(p.ped_iva) || 0), 0);

    kpisEl.innerHTML = `
      <div class="reportes-kpi rep-kpi--ventas">
        <div class="rep-kpi__icon-wrap rep-kpi__icon-wrap--ventas">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        </div>
        <div class="reportes-kpi__val">$${totalVentas.toFixed(2)}</div>
        <div class="reportes-kpi__lbl">Total vendido (${periodoLabel})</div>
      </div>
      <div class="reportes-kpi rep-kpi--pedidos">
        <div class="rep-kpi__icon-wrap rep-kpi__icon-wrap--pedidos">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </div>
        <div class="reportes-kpi__val">${numPedidos}</div>
        <div class="reportes-kpi__lbl">Pedidos cobrados</div>
      </div>
      <div class="reportes-kpi rep-kpi--promedio">
        <div class="rep-kpi__icon-wrap rep-kpi__icon-wrap--promedio">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        </div>
        <div class="reportes-kpi__val">$${promedio.toFixed(2)}</div>
        <div class="reportes-kpi__lbl">Promedio / pedido</div>
      </div>
      <div class="reportes-kpi rep-kpi--iva">
        <div class="rep-kpi__icon-wrap rep-kpi__icon-wrap--iva">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        </div>
        <div class="reportes-kpi__val">$${totalIva.toFixed(2)}</div>
        <div class="reportes-kpi__lbl">IVA recaudado (15 %)</div>
      </div>`;

    if (!window.Plotly) return;
    const divVentas = document.getElementById('chart-ventas-dia');
    const divTop    = document.getElementById('chart-top-productos');
    if (!divVentas || !divTop) return;

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
    } else {
      const nDias = periodo === 'semana' ? 7 : 30;
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
      xaxis: { showgrid: false }
    }, _config);

    // ── Gráfica 2: top 5 productos ────────────────────────────────
    const conteo = {};
    data.forEach(p => {
      (p.detalle_pedidos ?? []).forEach(d => {
        const nombre = d.platos?.plat_nombre;
        if (nombre) conteo[nombre] = (conteo[nombre] || 0) + (d.detped_cantidad || 0);
      });
    });
    const top5       = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topNombres = top5.map(([n]) => n.length > 20 ? n.slice(0, 18) + '…' : n);
    const topCants   = top5.map(([, c]) => c);
    const maxTop     = topCants.length ? Math.max(...topCants) : 1;

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
      xaxis: { tickformat: 'd', dtick: 1, gridcolor: 'rgba(0,0,0,.07)', zeroline: false, range: [0, maxTop + Math.ceil(maxTop * 0.35) + 1] },
      yaxis: { showgrid: false, automargin: true }
    }, _config);

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
        </div>
        <div class="resumen-kpi-card">
          <div class="resumen-kpi-card__val" style="color:#5b7fa6">$${totalIva.toFixed(2)}</div>
          <div class="resumen-kpi-card__lbl">IVA recaudado</div>
        </div>`;
    }

    const SC       = window.SC;
    const users    = window.ModuloAutenticacion?.leerUsuarios() ?? [];
    const _mesa    = p => p.mesas?.mes_numero ? `Mesa ${p.mesas.mes_numero}` : 'Para llevar';
    const _cliente = p => {
      if (!p.usu_id) return p.ped_nombre_invitado ?? 'Invitado';
      return users.find(u => u.id === p.usu_id)?.nombre ?? 'Usuario';
    };

    const tablaEl = document.getElementById('resumen-tabla-wrap');
    if (!tablaEl) return;

    if (!data.length) {
      tablaEl.innerHTML = '<p style="text-align:center;color:#888;font-size:.85rem;padding:2rem 0;font-style:italic">No hay pedidos cobrados en este período.</p>';
      // Igual renderizar cuadre de caja aunque no haya cobrados
      await _renderCuadreCaja(periodo, hoyISO, SC);
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
              <td>${fechaHora}</td>
              <td>${SC?.escapeHtml(_mesa(p)) ?? _mesa(p)}</td>
              <td>${SC?.escapeHtml(_cliente(p)) ?? _cliente(p)}</td>
              <td style="text-align:center">${items}</td>
              <td style="text-align:right;font-weight:700;color:var(--cinnamon)">$${(parseFloat(p.ped_total)||0).toFixed(2)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    await _renderCuadreCaja(periodo, hoyISO, SC);
  }

  async function _renderCuadreCaja(periodo, hoyISO, SC) {
    const cuadreEl = document.getElementById('rep-cuadre-wrap');
    if (!cuadreEl) return;
    if (periodo !== 'hoy') { cuadreEl.innerHTML = ''; return; }

    const { data: todosHoy } = await window.db
      .from('pedidos')
      .select('ped_id, ped_estado, usu_id')
      .eq('ped_fecha', hoyISO);

    const todos         = todosHoy ?? [];
    const cobrados      = todos.filter(p => p.ped_estado === 'cobrado');
    const pendientes    = todos.filter(p => p.ped_estado === 'pendiente');
    const totalCreados  = todos.length;
    const totalCobrados = cobrados.length;
    const diferencia    = totalCreados - totalCobrados;

    // usuarios(usu_nombre) vía join anidado de PostgREST queda bloqueado por
    // RLS para usuarios que no son el propio — usamos la lista ya cargada
    // vía la RPC listar_usuarios() (SECURITY DEFINER), igual que en el resto del panel.
    const usuariosCache = window.ModuloAutenticacion.leerUsuarios();
    const porMesero = {};
    todos.forEach(p => {
      const key    = p.usu_id ?? '__invitado__';
      const nombre = p.usu_id ? (usuariosCache.find(u => u.id === p.usu_id)?.nombre ?? p.usu_id) : 'Invitado / Cliente';
      if (!porMesero[key]) porMesero[key] = { nombre, creados: 0, cobrados: 0 };
      porMesero[key].creados++;
      if (p.ped_estado === 'cobrado') porMesero[key].cobrados++;
    });

    const filasMesero = Object.values(porMesero).map(m => {
      const diff = m.creados - m.cobrados;
      return `<tr>
        <td>${SC?.escapeHtml(m.nombre) ?? m.nombre}</td>
        <td style="text-align:center">${m.creados}</td>
        <td style="text-align:center;color:${diff === 0 ? '#16a34a' : 'var(--cinnamon)'}">${m.cobrados}</td>
        <td style="text-align:center;font-weight:700;color:${diff > 0 ? '#dc2626' : '#16a34a'}">
          ${diff > 0 ? `+${diff} pendiente${diff !== 1 ? 's' : ''}` : '✓ Cuadrado'}
        </td>
      </tr>`;
    }).join('');

    cuadreEl.innerHTML = `
      <div class="cuadre-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        Control de Caja — Hoy
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
          <div class="cuadre-kpi__val" style="color:${diferencia > 0 ? '#dc2626' : '#16a34a'}">${diferencia > 0 ? '⚠ ' + diferencia : '✓ 0'}</div>
          <div class="cuadre-kpi__lbl">Diferencia</div>
        </div>
      </div>
      ${todos.length ? `
      <table class="adm-tabla" style="margin-top:1rem">
        <thead><tr>
          <th>Usuario / Mesero</th>
          <th style="text-align:center">Pedidos creados</th>
          <th style="text-align:center">Cobrados</th>
          <th style="text-align:center">Estado</th>
        </tr></thead>
        <tbody>${filasMesero}</tbody>
      </table>` : '<p style="text-align:center;color:#888;font-size:.85rem;padding:1.5rem 0;font-style:italic">No hay pedidos registrados hoy.</p>'}`;
  }

  async function _renderGastos() {
    await window.SC?.recargarCaja?.();
    window.VistaCajero?.renderGastos?.();
    _initBtnGasto();
  }

  function _initBtnGasto() {
    const btn = document.getElementById('btn-add-gasto');
    if (!btn || btn._gastoBound) return;
    btn._gastoBound = true;
    btn.addEventListener('click', async () => {
      const desc  = document.getElementById('gasto-desc')?.value.trim();
      const monto = parseFloat(document.getElementById('gasto-monto')?.value);
      if (!desc)       { window.SC?.toast('Escribe una descripción.', 'error'); return; }
      if (!monto || monto <= 0) { window.SC?.toast('Ingresa un monto válido.', 'error'); return; }
      btn.disabled = true;
      const SC = window.SC;
      const ahora = new Date();
      const fecha = _fechaLocalISO(ahora);
      const hora  = ahora.toTimeString().slice(0, 8);
      const session = window.ModuloAutenticacion?.getSession?.();
      const { error } = await window.db.from('gastos').insert({
        gast_id:          crypto.randomUUID(),
        usu_id:           session?.id ?? null,
        gast_descripcion: desc,
        gast_monto:       monto,
        gast_fecha:       fecha,
        gast_hora:        hora
      });
      btn.disabled = false;
      if (error) { SC?.toast('Error al registrar gasto.', 'error'); return; }
      document.getElementById('gasto-desc').value  = '';
      document.getElementById('gasto-monto').value = '';
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
    ['nombre','apellido','fecha','telefono','email','usuario','password'].forEach(k => {
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
    document.getElementById('ef-rol').value            = emp?.rol_id            ?? 'rol002';
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
    const rolEl    = document.getElementById('ef-rol');
    const rolId    = rolEl.value;
    const cargo    = rolEl.options[rolEl.selectedIndex].text.trim();
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
        p_rol_id:        rolId,
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
        p_rol_id:        rolId,
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
                ${e.emp_cargo} · <strong>${e.rol}</strong> · desde ${_fmt(e.emp_fecha_ingreso)}
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

    const ROLES_EMPLEADO = new Set(['administrador', 'cajero', 'mesero']);
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

  return { renderAdminView, abrirFormProducto, cerrarFormProducto, init, cambiarModulo: _cambiarModulo };
})();
