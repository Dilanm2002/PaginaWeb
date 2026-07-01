'use strict';
/**
 * vista-menu.js — Vista del menú de productos, modal de ingredientes y vista mesero.
 * Depende de window.SC (API compartida) y DOM de menu-view.
 */
window.VistaMenu = (function () {

  let meseroMesaTarget = null;
  let _meseroOriginalItems = null;

  /* ── Helpers de filtro ── */
  function setFiltroActivo(cat) {
    const filterBar = document.getElementById('filter-bar');
    if (!filterBar) return;
    filterBar.querySelectorAll('.filter-btn').forEach(b => {
      const active = b.dataset.cat === cat;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }

  function getListaByCat(cat) {
    const SC   = window.SC;
    const todos = SC.getProductosMergeados();
    if (cat === 'Destacados') return todos.filter(p => p.destacado);
    if (cat === 'Todos')      return todos;
    return todos.filter(p => p.categoria === cat);
  }

  function actualizarTitulo(texto) {
    const t = document.getElementById('menu-titulo');
    if (t) t.textContent = texto;
  }

  /* ── Filtros ── */
  function renderFiltros(onSelect) {
    const SC        = window.SC;
    const filterBar = document.getElementById('filter-bar');
    if (!filterBar) return;
    const cats = ['Destacados', 'Todos', ...[...new Set(SC.getProductosMergeados().map(p => p.categoria))]];
    filterBar.innerHTML = cats.map((cat,i) => `
      <button class="filter-btn${i===0?' active':''}" data-cat="${cat}" aria-pressed="${i===0}">${cat === 'Destacados' ? '⭐ Destacados' : cat}</button>
    `).join('');
    filterBar.onclick = e => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      setFiltroActivo(btn.dataset.cat);
      SC.guardarFiltroSesion(btn.dataset.cat);
      const searchEl = document.getElementById('menu-search');
      if (searchEl) searchEl.value = '';
      const mobileSearchEl = document.getElementById('menu-search-mobile');
      if (mobileSearchEl) mobileSearchEl.value = '';
      const contactoEl = document.getElementById('seccion-contacto');
      if (contactoEl) contactoEl.style.display = btn.dataset.cat === 'Destacados' ? '' : 'none';
      onSelect(btn.dataset.cat);
    };

    const searchEl = document.getElementById('menu-search');
    if (searchEl) {
      const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
      searchEl.oninput = () => {
        const q = norm(searchEl.value.trim());
        const contactoEl2 = document.getElementById('seccion-contacto');
        if (!q) {
          setFiltroActivo('Destacados');
          actualizarTitulo('Platos Destacados');
          renderProductos(SC.getProductosMergeados().filter(p => p.destacado));
          if (contactoEl2) contactoEl2.style.display = '';
          return;
        }
        if (contactoEl2) contactoEl2.style.display = 'none';
        filterBar.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
        const normQ = norm(searchEl.value.trim());
        const res = SC.getProductosMergeados().filter(p =>
          norm(p.nombre).includes(normQ) || norm(p.categoria).includes(normQ)
        );
        actualizarTitulo(`Resultados para "${searchEl.value.trim()}"`);
        renderProductos(res.length ? res : []);
      };

      const mobileSearchEl = document.getElementById('menu-search-mobile');
      if (mobileSearchEl) {
        mobileSearchEl.oninput = () => {
          searchEl.value = mobileSearchEl.value;
          searchEl.dispatchEvent(new Event('input'));
        };
      }
    }
  }

  /* ── Grid de productos ── */
  function renderProductos(lista) {
    const SC   = window.SC;
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    grid.setAttribute('aria-busy','false');
    if (!lista.length) {
      const todosLosCargados = SC.getProductosMergeados();
      if (!todosLosCargados.length) {
        grid.innerHTML = Array.from({length:8}, () => `
          <div class="skeleton" aria-hidden="true">
            <div class="skeleton-img"></div>
            <div class="skeleton-body">
              <div class="skeleton-line"></div>
              <div class="skeleton-line short"></div>
              <div class="skeleton-line xshort"></div>
            </div>
          </div>`).join('');
        return;
      }
      grid.innerHTML = `<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:3rem">Sin platillos en esta categoría.</p>`;
      return;
    }
    const session = SC.getSession?.() ?? null;
    const verStock = session && ['mesero','cajero','administrador'].includes(session.rol);
    grid.innerHTML = lista.map((p,idx) => {
      const s       = SC.getStock(p.id);
      const agotado = !s.disponible || s.stock <= 0;
      const esNuevo = p.createdAt && (Date.now() - new Date(p.createdAt).getTime()) < 5 * 86400000;
      const stockBadge = agotado
        ? `<span class="stock-badge stock-badge--agotado">Agotado</span>`
        : (verStock && s.stock <= 5)
          ? `<span class="stock-badge stock-badge--bajo">Quedan ${s.stock}</span>`
          : '';
      return `
      <div class="product-card${agotado ? ' product-card--agotado' : ''}" role="listitem" aria-label="${p.nombre}" style="animation-delay:${idx*0.05}s" data-id="${p.id}">
        <div class="product-card__img-wrap">
          <img src="${p.imagen}" alt="Foto de ${p.nombre}" loading="lazy" decoding="async" width="600" height="450">
          <span class="product-card__badge" data-cat="${p.categoria}">${p.categoria}</span>
          ${esNuevo ? '<span class="badge-nuevo">Nuevo</span>' : ''}
          ${stockBadge}
        </div>
        <div class="product-card__body">
          <h3 class="product-card__name">${p.nombre}</h3>
          <p class="product-card__desc">${p.descripcion}</p>
          <p class="product-card__price">$${p.precio.toFixed(2)} <small>USD</small></p>
        </div>
        <div class="product-card__footer">
          <span class="product-card__tag">${p.tag}</span>
          <button class="btn-add" data-id="${p.id}" aria-label="Ordenar ${p.nombre}" ${agotado ? 'disabled' : ''}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            ${agotado ? 'Agotado' : 'Ordenar'}
          </button>
        </div>
      </div>`;
    }).join('');

    grid.onclick = e => {
      const btnAdd = e.target.closest('.btn-add');
      if (btnAdd) {
        e.stopPropagation();
        const prod = SC.getProductosMergeados().find(x => x.id === btnAdd.dataset.id);
        if (!prod) return;
        const s = SC.getStock(prod.id);
        if (!s.disponible || s.stock <= 0) return;
        const enCarrito = LogicaCarrito.leerCarrito().find(x => x.id === prod.id);
        if (enCarrito && enCarrito.cantidad >= s.stock) return;
        LogicaCarrito.agregarItem(prod); SC.renderCarrito();
        SC.toast(`"${prod.nombre}" agregado a tu orden`, 'success');
        return;
      }
      const card = e.target.closest('.product-card');
      if (card) {
        const prod = SC.getProductosMergeados().find(x => x.id === card.dataset.id);
        if (prod) abrirModalProducto(prod);
      }
    };
  }

  /* ── Modal ingredientes ── */
  function abrirModalProducto(p) {
    const SC = window.SC;
    const s       = SC.getStock(p.id);
    const agotado = !s.disponible || s.stock <= 0;

    const modalBackdrop = document.getElementById('product-modal-backdrop');
    const modalBox      = document.getElementById('product-modal-box');

    const ingsConId = Array.isArray(p.ingredientes) ? p.ingredientes.filter(i => i && i.id) : [];
    const tieneIngredientes = ingsConId.length > 0;
    const puedeExcluir = tieneIngredientes && p.permiteExcluir === true;
    const ingChips = puedeExcluir
      ? ingsConId.map(ing =>
          `<label class="ing-chip">
              <input type="checkbox" class="ing-check" data-ing-id="${ing.id}" data-ing-nombre="${ing.nombre}" checked>
              <span class="ing-chip__label">${ing.nombre}</span>
            </label>`
        ).join('')
      : '';

    const ingTexto = !puedeExcluir && tieneIngredientes
      ? ingsConId.map(i => i.nombre).join(' · ')
      : '';

    modalBox.innerHTML = `
      <div class="modal-img-wrap">
        <div class="modal-img-bg" style="background-image:url('${p.imagen}')"></div>
        <img class="modal-img" src="${p.imagen}" alt="Foto de ${p.nombre}" loading="eager" decoding="async" width="600" height="450">
        <button class="btn-modal-x" id="btn-cerrar-modal-x" aria-label="Cerrar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <span class="modal-badge" data-cat="${p.categoria}">${p.categoria}</span>
        <h2 class="modal-title">${p.nombre}</h2>
        <p class="modal-desc">${p.descripcion}</p>
        ${tieneIngredientes ? `
          <p class="modal-ingredients-title">Ingredientes
            <small style="font-weight:400;font-size:.72rem;text-transform:none;letter-spacing:0;color:var(--text-muted)">
              ${puedeExcluir ? '(desmarca para excluir)' : ''}
            </small>
          </p>
          ${puedeExcluir
            ? `<div class="modal-ingredients-chips">${ingChips}</div>`
            : `<p class="modal-ing-texto">${ingTexto}</p>`
          }
        ` : ''}
        <div class="modal-footer">
          <div class="modal-price">$${p.precio.toFixed(2)} <small>USD</small></div>
          <div class="modal-actions">
            <button class="btn-modal-close" id="btn-cerrar-modal">Cerrar</button>
            <button class="btn-modal-add" data-id="${p.id}" ${agotado ? 'disabled style="opacity:.45;cursor:not-allowed;"' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
              ${agotado ? 'Agotado' : 'Ordenar'}
            </button>
          </div>
        </div>
      </div>`;
    modalBackdrop.classList.add('open');
    modalBackdrop.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    document.getElementById('btn-cerrar-modal-x').onclick = cerrarModalProducto;
    document.getElementById('btn-cerrar-modal').onclick = cerrarModalProducto;
    modalBox.querySelector('.btn-modal-add').onclick = () => {
      const s = SC.getStock(p.id);
      if (!s.disponible || s.stock <= 0) { SC.toast(`"${p.nombre}" está agotado`, 'error'); return; }
      const enCarrito = LogicaCarrito.leerCarrito().find(x => x.id === p.id);
      if (enCarrito && enCarrito.cantidad >= s.stock) return;

      const exclusiones = [];
      modalBox.querySelectorAll('.ing-check:not(:checked)').forEach(cb => {
        exclusiones.push({ id: cb.dataset.ingId, nombre: cb.dataset.ingNombre });
      });

      LogicaCarrito.agregarItem(p, exclusiones);
      SC.renderCarrito();
      const msg = exclusiones.length
        ? `"${p.nombre}" sin: ${exclusiones.map(e => e.nombre).join(', ')}`
        : `"${p.nombre}" agregado a tu orden`;
      SC.toast(msg, 'success');
      cerrarModalProducto();
    };
    setTimeout(() => window._trapProducto?.activar(), 0);
  }

  function cerrarModalProducto() {
    window._trapProducto?.desactivar();
    const modalBackdrop = document.getElementById('product-modal-backdrop');
    modalBackdrop.classList.remove('open');
    modalBackdrop.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  /* ── Mesero ── */
  function syncQtys() {
    const SC = window.SC;
    let fuente = [];
    if (meseroMesaTarget) {
      const ped = SC.leerCaja().find(p => String(p.id) === String(meseroMesaTarget.id));
      fuente = ped ? ped.items : [];
    } else {
      fuente = LogicaCarrito.leerCarrito();
    }
    SC.getProductosMergeados().forEach(p => {
      const el = document.getElementById(`mqty-${p.id}`);
      if (!el) return;
      const item = fuente.find(x => x.id === p.id);
      const qty  = item ? item.cantidad : 0;
      el.textContent = qty;
      const row = el.closest('.mesero-row');
      if (row) row.classList.toggle('has-qty', qty > 0);
    });
  }

  function renderMesasActivas() {
    const SC      = window.SC;
    const pedidos = SC.leerCaja();
    const seccion = document.getElementById('mesero-mesas-activas');
    if (!seccion) return;

    if (!pedidos.length) {
      seccion.innerHTML = `<p class="mesero-mesa-empty">No hay mesas activas en este momento.</p>`;
    } else {
      const pedidoSeleccionado = meseroMesaTarget
        ? pedidos.find(p => String(p.id) === String(meseroMesaTarget.id))
        : null;

      const chips = pedidos.map(p => {
        const seleccionada = meseroMesaTarget && String(meseroMesaTarget.id) === String(p.id);
        return `
        <div class="mesero-mesa-card${seleccionada ? ' selected' : ''}"
             data-pedido-id="${p.id}" data-mesa="${p.mesa}"
             role="button" tabindex="0"
             aria-pressed="${seleccionada ? 'true' : 'false'}"
             aria-label="${p.paraLlevar || p.mesa === 'Para llevar' ? 'Para llevar' : `Mesa ${p.mesa}`}, ${p.items.length} ítem${p.items.length !== 1 ? 's' : ''}, $${p.total.toFixed(2)}">
          <span class="mesero-mesa-card__num">${p.paraLlevar || p.mesa === 'Para llevar' ? '🛍 Para llevar' : `🍽️ Mesa ${p.mesa}`}</span>
          <span class="mesero-mesa-card__items">${p.items.length} ítem${p.items.length !== 1 ? 's' : ''}</span>
          <span class="mesero-mesa-card__total">$${p.total.toFixed(2)}</span>
          <span class="mesero-mesa-card__badge">✓ Seleccionada</span>
        </div>`;
      }).join('');

      const _hayNuevos = _meseroOriginalItems !== null &&
        JSON.stringify(pedidoSeleccionado?.items) !== JSON.stringify(_meseroOriginalItems);

      const detalle = pedidoSeleccionado ? `
        <div class="mesero-mesa-detalle">
          <div class="mesero-mesa-detalle__head">
            <div class="mesero-mesa-detalle__head-left">
              <span class="mesero-mesa-detalle__title">${pedidoSeleccionado.paraLlevar || pedidoSeleccionado.mesa === 'Para llevar' ? '🛍 Para llevar' : `Mesa ${pedidoSeleccionado.mesa}`}</span>
              <span class="mesero-mesa-detalle__cliente">👤 ${pedidoSeleccionado.nombreUsuario}</span>
            </div>
            <span class="mesero-mesa-detalle__total">$${pedidoSeleccionado.total.toFixed(2)}</span>
          </div>
          <div class="mesero-mesa-detalle__body" id="mesero-detalle-body">
            ${pedidoSeleccionado.items.map(i => `
              <div class="mesero-mesa-detalle__row">
                <span class="mesero-mesa-detalle__qty">${i.cantidad}×</span>
                <span class="mesero-mesa-detalle__nombre">${i.nombre}</span>
                <span class="mesero-mesa-detalle__precio">$${(i.precio * i.cantidad).toFixed(2)}</span>
                <div class="mesero-det-ctrl">
                  <button class="mesero-det-btn" data-det-action="dec" data-item-id="${i.id}" aria-label="Quitar uno">−</button>
                  <button class="mesero-det-btn" data-det-action="inc" data-item-id="${i.id}" aria-label="Agregar uno">+</button>
                </div>
              </div>`).join('')}
          </div>
          <div class="mesero-mesa-detalle__cta">
            <span>⬇ Selecciona productos abajo para agregar a esta mesa</span>
            <div class="mesero-mesa-detalle__cta-btns">
              <button class="mesero-mesa-detalle__cta-cancel" id="btn-cancel-mesa-target">Cancelar</button>
              <button class="mesero-mesa-detalle__cta-save" id="btn-save-mesa-target" style="${_hayNuevos ? '' : 'display:none'}">Guardar ✓</button>
            </div>
          </div>
        </div>` : '';

      seccion.innerHTML = `<div class="mesero-mesas-chips">${chips}</div>${detalle}`;

      seccion.querySelector('.mesero-mesas-chips').querySelectorAll('.mesero-mesa-card').forEach(card => {
        const activar = () => {
          const pid  = card.dataset.pedidoId;
          const mesa = card.dataset.mesa;
          if (meseroMesaTarget && String(meseroMesaTarget.id) === String(pid)) {
            meseroMesaTarget = null;
            _meseroOriginalItems = null;
          } else {
            meseroMesaTarget = { id: pid, mesa };
            const _snapPed = SC.leerCaja().find(p => String(p.id) === String(pid));
            _meseroOriginalItems = _snapPed ? JSON.parse(JSON.stringify(_snapPed.items)) : [];
          }
          renderMesasActivas();
          syncQtys();
        };
        card.addEventListener('click', activar);
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activar(); } });
      });
    }

    const btnCancel = document.getElementById('btn-cancel-mesa-target');
    if (btnCancel) {
      btnCancel.onclick = () => {
        if (_meseroOriginalItems && meseroMesaTarget) {
          const peds = SC.leerCaja();
          const ped  = peds.find(p => String(p.id) === String(meseroMesaTarget.id));
          if (ped) ped.items = JSON.parse(JSON.stringify(_meseroOriginalItems));
        }
        meseroMesaTarget = null;
        _meseroOriginalItems = null;
        renderMesasActivas();
        syncQtys();
      };
    }

    const btnSave = document.getElementById('btn-save-mesa-target');
    if (btnSave) {
      btnSave.onclick = () => {
        if (!meseroMesaTarget) return;
        const peds = SC.leerCaja();
        const ped  = peds.find(p => String(p.id) === String(meseroMesaTarget.id));
        if (ped) {
          SC.actualizarPedido(ped.id, ped.items);
          window.VistaCajero?.renderCajeroView();
          SC.toast(`Mesa ${meseroMesaTarget.mesa} actualizada`, 'success');
        }
        meseroMesaTarget = null;
        _meseroOriginalItems = null;
        renderMesasActivas();
        syncQtys();
      };
    }

    const detalleBody = document.getElementById('mesero-detalle-body');
    if (detalleBody) {
      detalleBody.onclick = e => {
        const btn = e.target.closest('[data-det-action]');
        if (!btn || !meseroMesaTarget) return;
        const action = btn.dataset.detAction;
        const itemId = btn.dataset.itemId;
        const peds   = SC.leerCaja();
        const ped    = peds.find(p => String(p.id) === String(meseroMesaTarget.id));
        if (!ped) return;
        const idx = ped.items.findIndex(x => String(x.id) === String(itemId));
        if (idx < 0) return;
        if (action === 'inc') {
          ped.items[idx].cantidad += 1;
        } else if (action === 'dec') {
          ped.items[idx].cantidad -= 1;
          if (ped.items[idx].cantidad <= 0) ped.items.splice(idx, 1);
        } else if (action === 'del') {
          ped.items.splice(idx, 1);
        }
        renderMesasActivas();
        syncQtys();
      };
    }
  }

  function renderProductosMesero(opts = {}) {
    const sinMesas = opts.sinMesas ?? false;
    const SC   = window.SC;
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.className = 'mesero-view';
    const sectionTitle = grid.closest('section#menu')?.querySelector('.section-title');
    if (sectionTitle) sectionTitle.style.display = 'none';

    const mesasHTML = sinMesas ? '' : `
      <div class="mesero-mesas-section">
        <div class="mesero-mesas-title">Mesas activas — toca una para agregar ítems</div>
        <div class="mesero-mesas-list" id="mesero-mesas-activas"></div>
      </div>
      <div class="mesero-mesa-target" id="mesero-target-banner">
        Agregando a <strong></strong> — selecciona productos y envía el pedido
        <button class="mesero-mesa-target__cancel" id="btn-cancel-mesa-target">Cancelar</button>
      </div>`;

    const todosProds = SC.getProductosMergeados().filter(p => p.activo !== false);
    const cats = [...new Set(todosProds.map(p => p.categoria))];
    grid.innerHTML = mesasHTML + cats.map(cat => {
      const prods = todosProds.filter(p => p.categoria === cat);
      return `
        <div class="mesero-cat-section">
          <div class="mesero-cat-title" data-cat="${cat}" role="button" aria-expanded="true">
            ${cat}
            <span class="mesero-cat-chevron">▾</span>
          </div>
          <div class="mesero-list">
            ${prods.map(p => {
                const _s = SC.getStock(p.id);
                const _agotado = !_s.disponible || _s.stock <= 0;
                const _stockColor = _s.stock <= 0 ? '#dc2626' : _s.stock <= 5 ? '#d97706' : '#16a34a';
                const _stockTxt = _s.stock <= 0 ? 'Agotado' : `${_s.stock} en stock`;
                return `
              <div class="mesero-row${_agotado ? ' mesero-row--agotado' : ''}" data-id="${p.id}">
                <span class="mesero-row__name">${p.nombre}${p.createdAt && (Date.now() - new Date(p.createdAt).getTime()) < 5 * 86400000 ? ' <span class="mesero-badge-nuevo">Nuevo</span>' : ''}${_agotado ? ' <span style="font-size:.68rem;font-weight:700;color:#dc2626;background:#fee2e2;border-radius:999px;padding:.1rem .45rem;">Agotado</span>' : ''}</span>
                <span class="mesero-row__price">$${p.precio.toFixed(2)}</span>
                <button class="mesero-info-btn" data-id="${p.id}" aria-label="Ver ingredientes de ${p.nombre}" title="Ingredientes">
                  i
                  <div class="mesero-ing-pop" id="mpop-${p.id}">
                    <strong>Ingredientes</strong>
                    ${p.ingredientes.map(i => i.nombre).join(' · ')}
                    <span style="display:block;margin-top:.4rem;font-weight:700;color:${_stockColor};font-size:.75rem;">${_stockTxt}</span>
                  </div>
                </button>
                <div class="mesero-qty">
                  <button class="mesero-qty__btn dec" data-id="${p.id}" aria-label="Quitar uno de ${p.nombre}">−</button>
                  <span class="mesero-qty__val" id="mqty-${p.id}">0</span>
                  <button class="mesero-qty__btn add" data-id="${p.id}" aria-label="Agregar ${p.nombre}"${_agotado ? ' disabled style="opacity:.4;cursor:not-allowed;"' : ''}>+</button>
                </div>
              </div>`;
              }).join('')}
          </div>
        </div>`;
    }).join('');

    if (!sinMesas) renderMesasActivas();

    grid.querySelectorAll('.mesero-cat-title').forEach(title => {
      title.addEventListener('click', e => {
        if (e.target.closest('.mesero-qty__btn') || e.target.closest('.mesero-info-btn')) return;
        const list = title.nextElementSibling;
        const isCollapsed = title.classList.toggle('collapsed');
        title.setAttribute('aria-expanded', String(!isCollapsed));
        list.classList.toggle('hidden', isCollapsed);
      });
    });

    syncQtys();

    grid.onclick = e => {
      const infoBtn = e.target.closest('.mesero-info-btn');
      if (infoBtn) {
        e.stopPropagation();
        const pop = infoBtn.querySelector('.mesero-ing-pop');
        const isOpen = pop.classList.contains('visible');
        grid.querySelectorAll('.mesero-ing-pop.visible').forEach(p => p.classList.remove('visible'));
        if (!isOpen) pop.classList.add('visible');
        return;
      }
      grid.querySelectorAll('.mesero-ing-pop.visible').forEach(p => p.classList.remove('visible'));

      const btn = e.target.closest('.mesero-qty__btn');
      if (!btn) return;
      const prod = SC.getProductosMergeados().find(x => x.id === btn.dataset.id);
      if (!prod) return;

      if (btn.classList.contains('add')) {
        const s = SC.getStock(prod.id);
        if (!s.disponible || s.stock <= 0) return;
      }

      if (meseroMesaTarget) {
        const peds = SC.leerCaja();
        const ped  = peds.find(p => String(p.id) === String(meseroMesaTarget.id));
        if (ped) {
          const existente = ped.items.find(x => x.id === prod.id);
          if (btn.classList.contains('add')) {
            const totalEnPedido = existente ? existente.cantidad : 0;
            const s = SC.getStock(prod.id);
            if (!s.disponible || s.stock <= 0 || totalEnPedido >= s.stock) {
              SC.toast(`"${prod.nombre}" sin stock suficiente`, 'error');
              return;
            }
            if (existente) { existente.cantidad += 1; }
            else { ped.items.push({ id: prod.id, nombre: prod.nombre, precio: prod.precio, cantidad: 1 }); }
            SC.actualizarStock(prod.id, 1);
            SC.toast(`"${prod.nombre}" agregado a Mesa ${meseroMesaTarget.mesa}`, 'success');
          } else {
            if (existente) {
              existente.cantidad -= 1;
              if (existente.cantidad <= 0) ped.items.splice(ped.items.indexOf(existente), 1);
            }
          }
          renderMesasActivas();
          syncQtys();
        }
        return;
      }

      if (btn.classList.contains('add')) {
        const carrito = LogicaCarrito.leerCarrito();
        const enCarrito = carrito.find(x => x.id === prod.id);
        const totalEnCarrito = enCarrito ? enCarrito.cantidad : 0;
        const s = SC.getStock(prod.id);
        if (totalEnCarrito >= s.stock) return;
        LogicaCarrito.agregarItem(prod);
        SC.toast(`"${prod.nombre}" agregado`, 'success');
      } else {
        const carrito = LogicaCarrito.leerCarrito();
        const item    = carrito.find(x => x.id === prod.id);
        if (item) LogicaCarrito.cambiarCantidad(prod.id, item.cantidad - 1);
      }
      syncQtys();
      SC.renderCarrito();
    };

    if (!renderProductosMesero._popoverListenerAdded) {
      document.addEventListener('click', () => {
        grid.querySelectorAll('.mesero-ing-pop.visible').forEach(p => p.classList.remove('visible'));
      }, { capture: true });
      renderProductosMesero._popoverListenerAdded = true;
    }
  }

  function renderMenuCajero() {
    const SC   = window.SC;
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    grid.className = 'mesero-view';
    const sectionTitle = grid.closest('section#menu')?.querySelector('.section-title');
    if (sectionTitle) sectionTitle.style.display = 'none';

    const todos = SC.getProductosMergeados().filter(p => p.activo !== false);
    const cats  = [...new Set(todos.map(p => p.categoria))];

    const volverHTML = `
      <div style="margin-bottom:1.25rem;">
        <button id="btn-cajero-volver-caja" style="display:inline-flex;align-items:center;gap:.5rem;background:var(--cinnamon);color:#fff;border:none;border-radius:10px;padding:.55rem 1.1rem;font-size:.88rem;font-weight:600;cursor:pointer;font-family:inherit;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
          Volver a Caja
        </button>
      </div>`;

    grid.innerHTML = volverHTML + cats.map(cat => {
      const prods = todos.filter(p => p.categoria === cat);
      return `
        <div class="mesero-cat-section">
          <div class="mesero-cat-title" data-cat="${cat}" role="button" aria-expanded="true">
            ${cat}<span class="mesero-cat-chevron">▾</span>
          </div>
          <div class="mesero-list">
            ${prods.map(p => {
              const s = SC.getStock(p.id);
              const agotado = !s.disponible || s.stock <= 0;
              const ings = Array.isArray(p.ingredientes) ? p.ingredientes.map(i => i.nombre).join(' · ') : '—';
              return `
              <div class="mesero-row" style="cursor:default;">
                <span class="mesero-row__name" style="${agotado ? 'opacity:.45;' : ''}">${p.nombre}</span>
                <span class="mesero-row__price">$${p.precio.toFixed(2)}</span>
                <button class="mesero-info-btn" data-id="${p.id}" aria-label="Ver ingredientes de ${p.nombre}" title="Ingredientes">
                  i
                  <div class="mesero-ing-pop" id="cpop-${p.id}">
                    <strong>${p.nombre}</strong>
                    <span style="display:block;margin:.3rem 0;font-size:.78rem;color:#7A5640;">${p.descripcion || ''}</span>
                    <strong style="font-size:.75rem;">Ingredientes</strong>
                    <span style="display:block;margin-top:.25rem;">${ings}</span>
                    <span style="display:block;margin-top:.4rem;font-weight:700;font-size:.75rem;color:${agotado ? '#dc2626' : s.stock <= 5 ? '#d97706' : '#16a34a'};">
                      ${agotado ? 'Agotado' : `Stock: ${s.stock}`}
                    </span>
                  </div>
                </button>
                ${agotado
                  ? `<span style="font-size:.72rem;font-weight:700;color:#dc2626;background:#fee2e2;border-radius:999px;padding:.15rem .55rem;">Agotado</span>`
                  : `<span style="font-size:.72rem;color:#16a34a;background:#dcfce7;border-radius:999px;padding:.15rem .55rem;">Stock: ${s.stock}</span>`}
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.mesero-cat-title').forEach(title => {
      title.addEventListener('click', () => {
        const list = title.nextElementSibling;
        const collapsed = title.classList.toggle('collapsed');
        title.setAttribute('aria-expanded', String(!collapsed));
        list.classList.toggle('hidden', collapsed);
      });
    });

    document.getElementById('btn-cajero-volver-caja')?.addEventListener('click', () => {
      document.getElementById('btn-cajero-ver-menu')?.click();
    });

    grid.onclick = e => {
      const infoBtn = e.target.closest('.mesero-info-btn');
      if (infoBtn) {
        e.stopPropagation();
        const pop = infoBtn.querySelector('.mesero-ing-pop');
        const isOpen = pop.classList.contains('visible');
        grid.querySelectorAll('.mesero-ing-pop.visible').forEach(p => p.classList.remove('visible'));
        if (!isOpen) pop.classList.add('visible');
        return;
      }
      grid.querySelectorAll('.mesero-ing-pop.visible').forEach(p => p.classList.remove('visible'));
    };
  }

  function init() {
    const modalBackdrop = document.getElementById('product-modal-backdrop');
    if (modalBackdrop) {
      // solo cerrar con botón X
    }
  }

  /* Getter/setter para meseroMesaTarget (necesario desde index.html) */
  function getMesaTarget() { return meseroMesaTarget; }
  function setMesaTarget(val) { meseroMesaTarget = val; }

  return {
    renderProductos, renderFiltros, setFiltroActivo, actualizarTitulo, getListaByCat,
    abrirModalProducto, cerrarModalProducto,
    renderMesasActivas, renderProductosMesero, renderMenuCajero, syncQtys,
    getMesaTarget, setMesaTarget, getFiltroActivo: () => window.SC?.getFiltroSesion(),
    init
  };
})();
