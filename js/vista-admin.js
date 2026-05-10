'use strict';
/**
 * vista-admin.js — Vista del panel de administrador.
 * Depende de window.SC (API compartida) y DOM de admin-view.
 */
window.VistaAdmin = (function () {

  let _prodFormImgBase64 = null;
  let _prodFormEditId    = null;

  function renderAdminView() {
    const SC = window.SC;
    const adminView = document.getElementById('admin-view');
    if (!adminView || !adminView.classList.contains('visible')) return;

    const todos    = SC.getProductosMergeados();
    const agotados = todos.filter(p => { const s = SC.getStock(p.id); return !s.disponible || s.stock <= 0; });
    const statTotal = document.getElementById('admin-stat-total');
    const statAgot  = document.getElementById('admin-stat-agotados');
    if (statTotal) statTotal.textContent = todos.length;
    if (statAgot)  statAgot.textContent  = agotados.length;

    const grid = document.getElementById('admin-productos-grid');
    if (!grid) return;
    grid.innerHTML = todos.map(p => {
      const s      = SC.getStock(p.id);
      const agotado = !s.disponible || s.stock <= 0;
      const esNuevo = p.id >= 100;
      return `
      <div class="admin-card-wrap${agotado ? ' admin-card-inactive' : ''}" data-id="${p.id}">
        <article class="product-card" role="listitem" aria-label="${p.nombre}">
          <div class="product-card__img-wrap">
            <img src="${p.imagen}" alt="Foto de ${p.nombre}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%23f4e8d6%22 width=%22100%25%22 height=%22100%25%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%237a5640%22 font-size=%2228%22>🍽️</text></svg>'">
            <span class="product-card__badge" data-cat="${p.categoria}">${p.categoria}</span>
            ${esNuevo ? '<span class="stock-badge" style="background:#065f46;color:#fff;right:.5rem;top:.5rem;position:absolute;border-radius:999px;padding:.2rem .65rem;font-size:.72rem;font-weight:700;">Nuevo</span>' : ''}
          </div>
          <div class="product-card__body">
            <h3 class="product-card__name">${p.nombre}</h3>
            <p class="product-card__price">$${Number(p.precio).toFixed(2)} <small>USD</small></p>
          </div>
        </article>
        <div class="admin-card-overlay">
          <button class="btn-admin-card btn-admin-card--edit" data-action="editar"   data-id="${p.id}">✏️ Editar</button>
          <button class="btn-admin-card btn-admin-card--del"  data-action="eliminar" data-id="${p.id}">🗑 Eliminar</button>
        </div>
      </div>`;
    }).join('');

    grid.onclick = async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.dataset.action === 'editar') {
        const prod = SC.getProductosMergeados().find(p => p.id === id);
        if (prod) abrirFormProducto(prod);
      } else if (btn.dataset.action === 'eliminar') {
        if (!confirm(`¿Eliminar "${SC.getProductosMergeados().find(p=>p.id===id)?.nombre}"?`)) return;
        await SC.eliminarMenuItemDB(id);
        renderAdminView();
        const cat = SC.getFiltroSesion();
        window.VistaMenu?.renderProductos(window.VistaMenu?.getListaByCat(cat));
        SC.toast('Producto eliminado', 'success');
      }
    };

    window.VistaCajero?.renderStock();
    renderMensajes();
  }

  async function renderMensajes() {
    const el = document.getElementById('admin-mensajes-lista');
    if (!el) return;

    el.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem">Cargando mensajes…</p>';

    const { data, error } = await window.db
      .from('mensajes')
      .select('*')
      .order('enviado_en', { ascending: false });

    if (error || !data) {
      el.innerHTML = '<p style="color:#dc2626;font-size:.9rem">Error al cargar mensajes.</p>';
      return;
    }

    const noLeidos = data.filter(m => !m.leido).length;
    const badge = document.getElementById('admin-mensajes-badge');
    if (badge) { badge.textContent = noLeidos; badge.style.display = noLeidos > 0 ? '' : 'none'; }

    if (!data.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;padding:1rem 0">No hay mensajes todavía.</p>';
      return;
    }

    el.innerHTML = data.map(m => {
      const fecha = new Date(m.enviado_en).toLocaleString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      return `
        <div class="admin-msg-card${m.leido ? ' leido' : ''}" data-msg-id="${m.id}">
          <div class="admin-msg-head">
            <div class="admin-msg-quien">
              <span class="admin-msg-nombre">${m.nombre}</span>
              ${!m.leido ? '<span class="admin-msg-new">Nuevo</span>' : ''}
            </div>
            <span class="admin-msg-fecha">${fecha}</span>
          </div>
          <div class="admin-msg-contacto">
            <span>✉ ${m.email}</span>
            ${m.telefono ? `<span>📞 ${m.telefono}</span>` : ''}
          </div>
          <p class="admin-msg-texto">${m.mensaje}</p>
          ${!m.leido ? `<button class="admin-msg-btn-leido" data-id="${m.id}">Marcar como leído</button>` : ''}
        </div>`;
    }).join('');

    el.querySelectorAll('.admin-msg-btn-leido').forEach(btn => {
      btn.onclick = async () => {
        const id = Number(btn.dataset.id);
        const { error } = await window.db.from('mensajes').update({ leido: true }).eq('id', id);
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
    document.getElementById('pf-precio').value       = p?.precio      ?? '';
    document.getElementById('pf-descripcion').value  = p?.descripcion ?? '';
    document.getElementById('pf-tag').value          = p?.tag         ?? '';
    document.getElementById('pf-destacado').checked  = p?.destacado   ?? false;
    document.getElementById('pf-stock').value        = p ? SC.getStock(p.id).stock : 20;
    const ings = Array.isArray(p?.ingredientes) ? p.ingredientes.join(', ') : (p?.ingredientes || '');
    document.getElementById('pf-ingredientes').value = ings;
    document.getElementById('pf-imagen').value       = '';

    const imgActual     = document.getElementById('pf-img-actual');
    const imgPlaceholder = document.getElementById('pf-img-placeholder');
    if (p?.imagen) {
      imgActual.src = p.imagen;
      imgActual.style.display      = '';
      imgPlaceholder.style.display = 'none';
      _prodFormImgBase64 = p.imagen;
    } else {
      imgActual.style.display      = 'none';
      imgPlaceholder.style.display = '';
    }

    document.getElementById('prod-form-backdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function cerrarFormProducto() {
    document.getElementById('prod-form-backdrop').classList.remove('open');
    document.body.style.overflow = '';
    _prodFormImgBase64 = null;
    _prodFormEditId    = null;
  }

  function init() {
    document.getElementById('pf-imagen').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      _prodFormImgBase64 = await window.SC.comprimirImagen(file);
      const imgActual = document.getElementById('pf-img-actual');
      imgActual.src = _prodFormImgBase64;
      imgActual.style.display = '';
      document.getElementById('pf-img-placeholder').style.display = 'none';
    });

    document.getElementById('btn-cerrar-prod-form').addEventListener('click', cerrarFormProducto);
    document.getElementById('btn-prod-cancel').addEventListener('click', cerrarFormProducto);
    document.getElementById('prod-form-backdrop').addEventListener('click', e => {
      if (e.target === document.getElementById('prod-form-backdrop')) cerrarFormProducto();
    });
    document.getElementById('btn-agregar-producto').addEventListener('click', () => abrirFormProducto(null));

    document.getElementById('btn-prod-save').addEventListener('click', async () => {
      const SC     = window.SC;
      const nombre = document.getElementById('pf-nombre').value.trim();
      const precio = parseFloat(document.getElementById('pf-precio').value);
      if (!nombre)           { SC.toast('El nombre es obligatorio', 'error'); return; }
      if (!precio || precio <= 0) { SC.toast('Precio inválido', 'error'); return; }

      const id            = _prodFormEditId ?? SC.nextMenuId();
      const stockInicial  = parseInt(document.getElementById('pf-stock').value) || 20;
      const ingredientesRaw = document.getElementById('pf-ingredientes').value;
      const ingredientes  = ingredientesRaw.split(',').map(s => s.trim()).filter(Boolean);

      const item = {
        id,
        nombre,
        categoria:   document.getElementById('pf-categoria').value,
        descripcion: document.getElementById('pf-descripcion').value.trim(),
        precio,
        ingredientes,
        tag:         document.getElementById('pf-tag').value.trim(),
        imagen:      _prodFormImgBase64 || '',
        destacado:   document.getElementById('pf-destacado').checked,
        activo:      true,
        stock_inicial: stockInicial
      };

      await SC.guardarMenuItemDB(item);
      cerrarFormProducto();
      renderAdminView();
      const cat = SC.getFiltroSesion();
      window.VistaMenu?.renderProductos(window.VistaMenu?.getListaByCat(cat));
      SC.toast(`Producto "${nombre}" guardado ✓`, 'success');
    });
  }

  return { renderAdminView, abrirFormProducto, cerrarFormProducto, init };
})();
