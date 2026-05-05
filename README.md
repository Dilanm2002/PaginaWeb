# Sal y Canela — Sistema POS / Pedidos en Línea

Proyecto desarrollado para la materia **Desarrollo de Plataformas** — PUCE Ecuador.  
Reto 1: Carrito de compras con persistencia múltiple y accesibilidad web.

---

## Estructura del proyecto

```
public/
├── index.html              ← Archivo principal (toda la app vive aquí)
├── assets/
│   └── styles.css          ← Estilos complementarios (sección de contacto)
├── data/
│   └── productos.json      ← Catálogo de 30 productos en formato JSON
├── js/
│   ├── repositorio.js      ← Módulo de carga de datos (fetch + fallback)
│   ├── carrito.js          ← Módulo IndexedDB para historial de pedidos
│   ├── logica-carrito.js   ← Módulo CRUD del carrito (localStorage)
│   ├── autenticacion.js    ← Módulo de login y sesión de usuario
│   ├── vista.js            ← Módulo de renderizado (formulario de contacto)
│   └── aplicacion.js       ← Módulo coordinador (cookies + sessionStorage)
└── README.md               ← Este archivo
```

---

## Descripción del proyecto

**Sal y Canela** es una aplicación web de tipo restaurante/cafetería que permite:

- Ver el menú completo con fotos, precios e ingredientes.
- Filtrar por categoría (Desayunos, Entradas, Almuerzos, Postres, Bocaditos, Bebidas Calientes, Bebidas Frías) o buscar por nombre.
- Agregar platillos a un carrito y enviar el pedido a caja.
- Tres roles: **cajero** (gestiona pedidos y ventas del día), **mesero** (vista rápida sin fotos), **usuario / invitado** (menú completo).
- Formulario de contacto con validación regex y atributos ARIA.

---

## Tecnologías empleadas

| Tecnología | Uso |
|---|---|
| HTML5 semántico | `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`, `<form>`, `<article>` |
| CSS3 / Flexbox / Grid | Layout responsive, filter-bar, grid de productos, formulario |
| JavaScript ES6+ | Módulos IIFE, async/await, arrow functions, template literals |
| JSON | Fuente de datos de productos (`data/productos.json`) |
| `fetch()` API | Carga de productos desde archivo JSON local/remoto |
| `localStorage` | Carrito, usuarios, caja, historial, gastos |
| `sessionStorage` | Sesión de login, filtro activo, último mensaje de contacto |
| `IndexedDB` | Archivo histórico de pedidos cobrados |
| Cookies | Primera visita (`sc_primer_visita`), última visita (`sc_ultima_visita`) |
| ARIA | `aria-required`, `aria-invalid`, `aria-describedby`, `role="alert"`, `aria-live` |

---

## Explicación técnica

### Carga de datos (repositorio.js)
`ModuloRepositorio.cargar()` intenta hacer `fetch('data/productos.json')`. Si falla (protocolo `file://` o sin red), usa el array `PRODUCTOS` definido inline en `index.html` como fallback. Esto garantiza que el sitio funcione tanto localmente como en servidor.

### Persistencia — cuatro mecanismos

| Mecanismo | Clave / Nombre | Datos guardados |
|---|---|---|
| `localStorage` | `salycanela_orden` | Carrito actual |
| `localStorage` | `salycanela_caja` | Pedidos en caja |
| `localStorage` | `salycanela_historial` | Historial de ventas del día |
| `localStorage` | `salycanela_gastos` | Gastos del día (cajero) |
| `localStorage` | `salycanela_users` | Usuarios registrados |
| `localStorage` | `salycanela_last_updated` | Marca de tiempo del último cambio |
| `sessionStorage` | `salycanela_session` | Sesión activa (login) |
| `sessionStorage` | `sc_sesion_inicio` | Inicio de la sesión de navegación |
| `sessionStorage` | `sc_filtro_activo` | Última categoría seleccionada |
| `sessionStorage` | `sc_ultimo_contacto` | Último mensaje de contacto enviado |
| `IndexedDB` | DB: `SalyCanelaPOS`, Store: `historial_idb` | Archivo histórico de pedidos cobrados |
| Cookies | `sc_primer_visita` | Fecha de primer acceso (365 días) |
| Cookies | `sc_ultima_visita` | Fecha del último acceso (30 días) |

### Validaciones con Regex (vista.js + index.html)

| Campo | Expresión regular | Criterio |
|---|---|---|
| Nombre | `/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'\-]{2,60}$/` | Solo letras y espacios, 2–60 caracteres |
| Correo | `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` | Formato email estándar |
| Teléfono | `/^(09\d{8}\|0[2-7]\d{7})$/` | Formato Ecuador: celular o fijo |
| Mensaje | `/^[\s\S]{10,500}$/` | Entre 10 y 500 caracteres |

### Accesibilidad

- **Skip link** al inicio para saltar al contenido principal.
- Atributos `aria-label`, `aria-hidden`, `aria-live`, `aria-modal` en todos los componentes interactivos.
- Formularios con `aria-required="true"`, `aria-invalid="true"` en campos con error, y `aria-describedby` apuntando al `<span role="alert">` del mensaje de error.
- Navegación por teclado completa (Tab, Escape para cerrar modales).
- Foco visible en todos los controles (`:focus-visible`).
- `prefers-reduced-motion` respetado en `assets/styles.css`.
- Textos alternativos en todas las imágenes (`alt`).
- Contraste de colores que cumple WCAG AA: texto claro sobre fondo oscuro en header/hero.

---

## Instrucciones de uso

### Modo local (sin servidor)
Abrir `index.html` directamente en el navegador. El catálogo usa el array `PRODUCTOS` como fallback automático.

### Modo servidor / Neocities
Subir la carpeta completa a Neocities. El `fetch('data/productos.json')` cargará los datos desde el archivo externo.

### Credenciales de prueba

| Usuario | Contraseña | Rol |
|---|---|---|
| `caja` | `1234` | Cajero (gestión de pedidos) |
| `mesero` | `1234` | Mesero (vista rápida) |
| Cualquier registro nuevo | La que elijas | Usuario cliente |
| (Sin login) | — | Invitado (solo ver menú y pedir) |

---

## Observaciones

- Los precios **incluyen IVA 15 %** (Ecuador 2024). El sistema extrae el IVA del total, no lo suma.
- Los pedidos se sincronizan en tiempo real entre pestañas gracias a `localStorage`.
- El cajero recibe auto-refresh cada 15 segundos.
- En dispositivos móviles, el filter-bar es horizontal y deslizable (`overflow-x: auto`).
