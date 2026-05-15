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
        const prod = SC.getProductosMergeados().find(p => p.id === id);
        const confirmado = await _modalConfirmar(prod?.nombre ?? 'este producto');
        if (!confirmado) return;
        btn.disabled = true;
        const ok = await SC.eliminarMenuItemDB(id);
        renderAdminView();
        const cat = SC.getFiltroSesion();
        window.VistaMenu?.renderProductos(window.VistaMenu?.getListaByCat(cat));
        if (ok) SC.toast('Producto eliminado ✓', 'success');
        else    SC.toast('Eliminado localmente (error en la nube)', 'error');
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
      .order('mens_enviado_en', { ascending: false });

    if (error || !data) {
      el.innerHTML = '<p style="color:#dc2626;font-size:.9rem">Error al cargar mensajes.</p>';
      return;
    }

    const noLeidos = data.filter(m => !m.mens_leido).length;
    const badge = document.getElementById('admin-mensajes-badge');
    if (badge) { badge.textContent = noLeidos; badge.style.display = noLeidos > 0 ? '' : 'none'; }
    const statMensajes = document.getElementById('admin-stat-mensajes');
    if (statMensajes) statMensajes.textContent = noLeidos;

    if (!data.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;padding:1rem 0">No hay mensajes todavía.</p>';
      return;
    }

    el.innerHTML = data.map(m => {
      const fecha = new Date(m.mens_enviado_en).toLocaleString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      return `
        <div class="admin-msg-card${m.mens_leido ? ' leido' : ''}" data-msg-id="${m.mens_id}">
          <div class="admin-msg-head">
            <div class="admin-msg-quien">
              <span class="admin-msg-nombre">${m.mens_nombre}</span>
              ${!m.mens_leido ? '<span class="admin-msg-new">Nuevo</span>' : ''}
            </div>
            <span class="admin-msg-fecha">${fecha}</span>
          </div>
          <div class="admin-msg-contacto">
            <span>✉ ${m.mens_email}</span>
            ${m.mens_telefono ? `<span>📞 ${m.mens_telefono}</span>` : ''}
          </div>
          <p class="admin-msg-texto">${m.mens_mensaje}</p>
          ${!m.mens_leido ? `<button class="admin-msg-btn-leido" data-id="${m.mens_id}">Marcar como leído</button>` : ''}
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
    document.getElementById('pf-precio').value       = p?.precio      ?? '';
    document.getElementById('pf-descripcion').value  = p?.descripcion ?? '';
    document.getElementById('pf-tag').value          = p?.tag         ?? '';
    document.getElementById('pf-destacado').checked  = p?.destacado   ?? false;
    document.getElementById('pf-stock').value        = p ? SC.getStock(p.id).stock : 20;
    const ings = Array.isArray(p?.ingredientes) ? p.ingredientes.join(', ') : (p?.ingredientes || '');
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
      imgActual.style.display      = 'none';
      imgPlaceholder.style.display = '';
    }

    document.getElementById('prod-form-backdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
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

  function cerrarFormProducto() {
    document.getElementById('prod-form-backdrop').classList.remove('open');
    document.body.style.overflow = '';
    _prodFormImgBase64 = null;
    _prodFormEditId    = null;
    _mostrarErrorNombre('');
    _mostrarErrorImagen('');
  }

  function _setupDragDrop() {
    const pfImagen = document.getElementById('pf-imagen');
    if (pfImagen) pfImagen.style.display = 'none';

    const processFile = async file => {
      if (!file || !file.type.startsWith('image/')) {
        window.SC?.toast('Solo se aceptan imágenes', 'error');
        return;
      }
      _prodFormImgBase64 = await window.SC.comprimirImagen(file);
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
    if (!v)                      return 'El nombre es obligatorio.';
    if (v.length < 2)            return 'El nombre debe tener al menos 2 caracteres.';
    if (!NOMBRE_LETRA_RE.test(v)) return 'El nombre debe contener al menos una letra.';
    return '';
  }

  function _mostrarErrorNombre(msg) {
    const inp = document.getElementById('pf-nombre');
    const err = document.getElementById('pf-nombre-error');
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
      const errNombre = _validarNombre(nombre);
      if (errNombre)             { _mostrarErrorNombre(errNombre); document.getElementById('pf-nombre').focus(); return; }
      if (!precio || precio <= 0){ SC.toast('Precio inválido', 'error'); return; }
      if (!_prodFormImgBase64)   { _mostrarErrorImagen('La imagen del plato es obligatoria.'); return; }

      /* Verificar nombre duplicado (excluyendo el producto que se está editando) */
      const normStr = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      const duplicado = SC.getProductosMergeados().find(p =>
        p.id !== (_prodFormEditId ?? -1) && normStr(p.nombre) === normStr(nombre)
      );
      if (duplicado) {
        _mostrarErrorNombre(`Ya existe un plato con el nombre "${duplicado.nombre}".`);
        document.getElementById('pf-nombre').focus();
        return;
      }

      const saveBtn = document.getElementById('btn-prod-save');
      saveBtn.disabled = true;

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
        imagen:      _prodFormImgBase64,
        destacado:   document.getElementById('pf-destacado').checked,
        activo:      true,
        stock_inicial: stockInicial
      };

      await SC.guardarMenuItemDB(item);
      saveBtn.disabled = false;
      cerrarFormProducto();
      renderAdminView();
      const cat = SC.getFiltroSesion();
      window.VistaMenu?.renderProductos(window.VistaMenu?.getListaByCat(cat));
      SC.toast(`Producto "${nombre}" guardado ✓`, 'success');
    });
  }

  return { renderAdminView, abrirFormProducto, cerrarFormProducto, init };
})();
