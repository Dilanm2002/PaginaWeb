'use strict';
/**
 * view.js — Módulo de renderizado de la sección de contacto.
 * Genera el formulario HTML, aplica validación con expresiones regulares (regex)
 * y cumple los atributos de accesibilidad ARIA (aria-required, aria-invalid,
 * aria-describedby, role="alert").
 *
 * Al enviarse correctamente, el mensaje se guarda en sessionStorage
 * bajo la clave 'sc_ultimo_contacto'.
 */
window.ViewModule = (function () {

  /* ── Expresiones regulares de validación ── */
  var REGEX = {
    nombre : /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'\-]{2,60}$/,
    email  : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    tel    : /^(09\d{8}|0[2-7]\d{7})$/,
    mensaje: /^[\s\S]{10,500}$/
  };

  /* ── Definición de campos del formulario ── */
  var CAMPOS = [
    { id: 'cf-nombre', regex: REGEX.nombre,  required: true,  msg: 'Ingresa un nombre válido (solo letras, mín. 2 caracteres).' },
    { id: 'cf-email',  regex: REGEX.email,   required: true,  msg: 'Ingresa un correo electrónico válido (ej: usuario@gmail.com).' },
    { id: 'cf-tel',    regex: REGEX.tel,     required: false, msg: 'Teléfono inválido. Usa formato ecuatoriano (ej: 0991234567).' },
    { id: 'cf-msg',    regex: REGEX.mensaje,  required: true,  msg: 'El mensaje debe tener entre 10 y 500 caracteres.' }
  ];

  /**
   * Inyecta el formulario de contacto en el contenedor indicado y activa la validación.
   * @param {string} containerId — id del elemento DOM donde se renderiza la sección.
   */
  function renderContacto(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = [
      '<section class="contacto-section" aria-labelledby="contacto-title" id="contacto">',
      '  <div class="wrap">',
      '    <h2 class="section-title" id="contacto-title">Contáctanos</h2>',
      '    <p class="contacto-desc">¿Tienes sugerencias, reservas o algún comentario? Escríbenos y te responderemos a la brevedad.</p>',
      '    <div class="contacto-grid">',

      '      <!-- Panel informativo -->',
      '      <div class="contacto-info" aria-hidden="true">',
      '        <div class="ci-logo">Sal <span>y</span> Canela</div>',
      '        <div class="ci-tagline">Restaurante · Quito, Ecuador</div>',
      '        <div class="ci-items">',
      '          <div class="ci-item">',
      '            <div class="ci-item__icon">📍</div>',
      '            <div class="ci-item__text">',
      '              <span class="ci-item__label">Dirección</span>',
      '              <span class="ci-item__val">Villalengua y Jorge Drom, Quito</span>',
      '            </div>',
      '          </div>',
      '          <div class="ci-item">',
      '            <div class="ci-item__icon">📞</div>',
      '            <div class="ci-item__text">',
      '              <span class="ci-item__label">Teléfono</span>',
      '              <span class="ci-item__val">0960 227 340</span>',
      '            </div>',
      '          </div>',
      '          <div class="ci-item">',
      '            <div class="ci-item__icon">✉️</div>',
      '            <div class="ci-item__text">',
      '              <span class="ci-item__label">Correo</span>',
      '              <span class="ci-item__val">info@salycanela.ec</span>',
      '            </div>',
      '          </div>',
      '          <div class="ci-item">',
      '            <div class="ci-item__icon">🕐</div>',
      '            <div class="ci-item__text">',
      '              <span class="ci-item__label">Horario</span>',
      '              <span class="ci-item__val">Lun – Sáb · 7 am – 6 pm</span>',
      '            </div>',
      '          </div>',
      '        </div>',
      '        <div class="ci-sep"></div>',
      '        <p class="ci-quote">"Cocina de la abuela con ingredientes frescos, recetas con historia y sazón de verdad."</p>',
      '      </div>',

      '      <!-- Formulario -->',
      '      <div class="contacto-card">',
      '        <form id="form-contacto" class="contacto-form" novalidate aria-label="Formulario de contacto">',
      '          <div class="cf-row">',
      '            <div class="cf-field">',
      '              <label for="cf-nombre">Nombre <span class="cf-req" aria-hidden="true">*</span></label>',
      '              <input type="text" id="cf-nombre" name="nombre" autocomplete="given-name"',
      '                     aria-required="true" aria-describedby="cf-nombre-err"',
      '                     placeholder="Ej: María López" />',
      '              <span class="cf-err" id="cf-nombre-err" role="alert"></span>',
      '            </div>',
      '            <div class="cf-field">',
      '              <label for="cf-email">Correo electrónico <span class="cf-req" aria-hidden="true">*</span></label>',
      '              <input type="email" id="cf-email" name="email" autocomplete="email"',
      '                     aria-required="true" aria-describedby="cf-email-err"',
      '                     placeholder="Ej: maria@gmail.com" />',
      '              <span class="cf-err" id="cf-email-err" role="alert"></span>',
      '            </div>',
      '          </div>',
      '          <div class="cf-field">',
      '            <label for="cf-tel">Teléfono <small>(opcional)</small></label>',
      '            <input type="tel" id="cf-tel" name="telefono" autocomplete="tel" maxlength="15"',
      '                   aria-describedby="cf-tel-err" placeholder="Ej: 0991234567" />',
      '            <span class="cf-err" id="cf-tel-err" role="alert"></span>',
      '          </div>',
      '          <div class="cf-field">',
      '            <label for="cf-msg">Mensaje <span class="cf-req" aria-hidden="true">*</span></label>',
      '            <textarea id="cf-msg" name="mensaje" rows="5" maxlength="500"',
      '                      aria-required="true" aria-describedby="cf-msg-err"',
      '                      placeholder="Escribe tu mensaje aquí… (mín. 10 caracteres)"></textarea>',
      '            <span class="cf-err" id="cf-msg-err" role="alert"></span>',
      '          </div>',
      '          <div class="cf-actions">',
      '            <button type="submit" class="cf-submit">',
      '              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">',
      '                <line x1="22" y1="2" x2="11" y2="13"/>',
      '                <polygon points="22 2 15 22 11 13 2 9 22 2"/>',
      '              </svg>',
      '              Enviar mensaje',
      '            </button>',
      '          </div>',
      '          <div id="cf-success" class="cf-success" role="status" aria-live="polite" style="display:none">',
      '            ✓ ¡Mensaje enviado! Gracias por contactarnos, te responderemos pronto.',
      '          </div>',
      '        </form>',
      '      </div>',

      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n');

    _initValidacion(el.querySelector('#form-contacto'));
  }

  /* ── Helpers de estado ARIA ── */
  function _setError(inp, errEl, msg) {
    inp.setAttribute('aria-invalid', 'true');
    inp.classList.add('cf-invalid');
    errEl.textContent    = msg;
    errEl.style.display  = 'block';
  }

  function _clearError(inp, errEl) {
    inp.removeAttribute('aria-invalid');
    inp.classList.remove('cf-invalid');
    errEl.textContent   = '';
    errEl.style.display = 'none';
  }

  /* ── Inicialización de la validación ── */
  function _initValidacion(form) {
    if (!form) return;

    /* Validación al perder el foco (blur) */
    CAMPOS.forEach(function (campo) {
      var inp = form.querySelector('#' + campo.id);
      var err = form.querySelector('#' + campo.id + '-err');
      if (!inp || !err) return;

      inp.addEventListener('blur', function () {
        var val = (campo.id === 'cf-msg') ? inp.value : inp.value.trim();
        if (!campo.required && !val) { _clearError(inp, err); return; }
        if (campo.required && !val) { _setError(inp, err, 'Este campo es obligatorio.'); return; }
        if (!campo.regex.test(val)) { _setError(inp, err, campo.msg); return; }
        _clearError(inp, err);
      });

      /* Limpia el error en tiempo real cuando el valor ya es correcto */
      inp.addEventListener('input', function () {
        if (inp.getAttribute('aria-invalid') !== 'true') return;
        var val = (campo.id === 'cf-msg') ? inp.value : inp.value.trim();
        if (!campo.required && !val) { _clearError(inp, err); return; }
        if (val && campo.regex.test(val)) _clearError(inp, err);
      });
    });

    /* Validación al enviar */
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var valido = true;

      CAMPOS.forEach(function (campo) {
        var inp = form.querySelector('#' + campo.id);
        var err = form.querySelector('#' + campo.id + '-err');
        if (!inp || !err) return;
        var val = (campo.id === 'cf-msg') ? inp.value : inp.value.trim();

        if (!campo.required && !val) { _clearError(inp, err); return; }
        if (campo.required && !val) { _setError(inp, err, 'Este campo es obligatorio.'); valido = false; return; }
        if (!campo.regex.test(val)) { _setError(inp, err, campo.msg); valido = false; return; }
        _clearError(inp, err);
      });

      if (!valido) {
        var primero = form.querySelector('[aria-invalid="true"]');
        if (primero) primero.focus();
        return;
      }

      /* Guardar en sessionStorage */
      var datos = {
        nombre  : form.querySelector('#cf-nombre').value.trim(),
        email   : form.querySelector('#cf-email').value.trim(),
        tel     : form.querySelector('#cf-tel').value.trim(),
        mensaje : form.querySelector('#cf-msg').value.trim(),
        enviado : new Date().toISOString()
      };
      try {
        sessionStorage.setItem('sc_ultimo_contacto', JSON.stringify(datos));
      } catch (_e) { /* sessionStorage no disponible */ }

      /* Limpiar formulario y mostrar confirmación */
      form.reset();
      CAMPOS.forEach(function (campo) {
        var inp = form.querySelector('#' + campo.id);
        var err = form.querySelector('#' + campo.id + '-err');
        if (inp && err) _clearError(inp, err);
      });

      var success = form.querySelector('#cf-success');
      if (success) {
        success.style.display = 'block';
        setTimeout(function () { success.style.display = 'none'; }, 5000);
      }
    });
  }

  return { renderContacto: renderContacto };
})();
