# Sal y Canela — Sistema POS / Pedidos en Línea

![CI](https://github.com/Dilanm2002/PaginaWeb/actions/workflows/ci.yml/badge.svg)
![GitHub Pages](https://img.shields.io/badge/deploy-GitHub%20Pages-blue)
![Metodología](https://img.shields.io/badge/metodolog%C3%ADa-Scrum-orange)
![Licencia](https://img.shields.io/badge/licencia-MIT-green)

Proyecto desarrollado con **metodología Scrum** y prácticas **DevOps / CI-CD** para la materia _Desarrollo de Plataformas_ — PUCE Ecuador.

> Sistema de pedidos y punto de venta para el café-restaurante "Sal y Canela": menú digital, carrito, gestión de caja y archivo histórico con múltiples capas de persistencia.

---

## Índice

- [Demo](#demo)
- [Características](#características)
- [Tecnologías](#tecnologías)
- [Arquitectura de persistencia](#arquitectura-de-persistencia)
- [Roles de usuario](#roles-de-usuario)
- [Instrucciones de uso](#instrucciones-de-uso)
- [Metodología Scrum](#metodología-scrum)
- [DevOps y CI/CD](#devops-y-cicd)
- [Accesibilidad](#accesibilidad)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Observaciones técnicas](#observaciones-técnicas)

---

## Demo

Desplegado en GitHub Pages: **https://Dilanm2002.github.io/PaginaWeb/**

---

## Características

- Catálogo de 30 productos con fotos, precios e ingredientes
- Filtro por 7 categorías y búsqueda en tiempo real
- Carrito de compras con sincronización entre pestañas
- Cálculo de IVA incluido al 15% (Ecuador)
- Sistema de autenticación con tres roles diferenciados
- Panel del cajero con auto-refresh y resumen de ventas del día
- Archivo histórico de pedidos en IndexedDB con índice por fecha
- Formulario de contacto con validación regex
- Accesibilidad WCAG AA completa

---

## Tecnologías

| Tecnología | Uso |
|---|---|
| HTML5 semántico | Estructura accesible con landmark elements |
| CSS3 / Flexbox / Grid | Layout responsive, animaciones, design tokens |
| JavaScript ES6+ | Módulos IIFE, async/await, Promises |
| `fetch()` API | Carga de catálogo desde JSON con fallback inline |
| `localStorage` | Carrito, caja, historial del día, usuarios, gastos |
| `sessionStorage` | Sesión activa, filtro activo, último contacto |
| `IndexedDB` | Archivo histórico de pedidos cobrados |
| Cookies | Primera y última visita del usuario |
| ARIA | Accesibilidad completa para lectores de pantalla |
| GitHub Actions | Pipeline CI/CD automático |

---

## Arquitectura de persistencia

El sistema usa **cuatro capas de persistencia** para garantizar resiliencia y trazabilidad:

```
┌─────────────────────────────────────────────────────────┐
│                     PERSISTENCIA                        │
├──────────────┬──────────────┬────────────┬─────────────┤
│ localStorage │sessionStorage│ IndexedDB  │   Cookies   │
├──────────────┼──────────────┼────────────┼─────────────┤
│ Carrito      │ Sesión login │ Historial  │ 1ª visita   │
│ Cola de caja │ Filtro activo│ archivado  │ Última vis. │
│ Historial    │ Último contc.│ (por fecha)│             │
│ Usuarios     │              │            │             │
│ Gastos       │              │            │             │
└──────────────┴──────────────┴────────────┴─────────────┘
```

| Clave | Mecanismo | Contenido |
|---|---|---|
| `salycanela_orden` | localStorage | Carrito actual |
| `salycanela_caja` | localStorage | Pedidos pendientes en caja |
| `salycanela_historial` | localStorage | Historial de ventas del día |
| `salycanela_gastos` | localStorage | Gastos registrados por el cajero |
| `salycanela_users` | localStorage | Usuarios registrados |
| `salycanela_session` | sessionStorage | Sesión activa (expira al cerrar pestaña) |
| `sc_filtro_activo` | sessionStorage | Última categoría seleccionada |
| `historial_idb` | IndexedDB | Archivo histórico completo de pedidos |
| `sc_primer_visita` | Cookie | Fecha de primera visita (365 días) |
| `sc_ultima_visita` | Cookie | Fecha de última visita (30 días) |

---

## Roles de usuario

| Usuario | Contraseña | Rol | Acceso |
|---|---|---|---|
| `caja` | `1234` | Cajero | Panel de caja, pedidos, ventas del día, gastos |
| `mesero` | `1234` | Mesero | Vista rápida del menú sin fotos |
| Registro nuevo | libre | Usuario | Menú completo, carrito, pedidos |
| (sin login) | — | Invitado | Menú completo y contacto |

---

## Instrucciones de uso

### Modo local (sin servidor)
```bash
# Clonar el repositorio
git clone https://github.com/Dilanm2002/PaginaWeb.git
cd PaginaWeb

# Abrir en el navegador (el catálogo usa el fallback inline automáticamente)
start index.html        # Windows
open index.html         # macOS
xdg-open index.html     # Linux
```

### Modo servidor / GitHub Pages
El pipeline de CI/CD despliega automáticamente desde la rama `main`.  
Accede en: `https://Dilanm2002.github.io/PaginaWeb/`

### Modo servidor local
```bash
# Con Python
python -m http.server 8080

# Con Node.js (npx)
npx serve .
```

---

## Metodología Scrum

El proyecto siguió la metodología **Scrum** con sprints de 2 semanas.

📄 [Ver documentación completa de Scrum →](docs/SCRUM.md)

### Resumen de sprints

| Sprint | Objetivo | Historias | Estado |
|---|---|---|---|
| Sprint 1 | Catálogo de productos y estructura base | US-01, US-02, US-03, US-17 | ✅ Completado |
| Sprint 2 | Carrito de compras con persistencia | US-04, US-05, US-06, US-07 | ✅ Completado |
| Sprint 3 | Autenticación y roles de usuario | US-08, US-09, US-10 | ✅ Completado |
| Sprint 4 | Vista del cajero e historial | US-11 al US-16 | ✅ Completado |
| Sprint 5 | Formularios, accesibilidad y CI/CD | US-18, US-19, US-20 | ✅ Completado |

### Ceremonias realizadas

| Ceremonia | Frecuencia | Duración |
|---|---|---|
| Sprint Planning | Inicio de sprint | 1 hora |
| Daily Standup | Diario | 15 minutos |
| Sprint Review | Fin de sprint | 30 minutos |
| Retrospectiva | Fin de sprint | 30 minutos |

---

## DevOps y CI/CD

El proyecto integra un pipeline de **Integración Continua y Despliegue Continuo** con **GitHub Actions**.

### Pipeline

```
Push a main/develop
        │
        ▼
┌───────────────────┐
│  JOB: validate    │
│                   │
│  ✓ JSON válido    │
│  ✓ HTML semántico │
│  ✓ ARIA presente  │
│  ✓ Sintaxis JS    │
│  ✓ Imágenes OK    │
└────────┬──────────┘
         │ (solo si rama = main)
         ▼
┌───────────────────┐
│   JOB: deploy     │
│                   │
│  → GitHub Pages   │
└───────────────────┘
```

### Archivo de workflow
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)

**Qué valida el CI en cada push:**
- Integridad del archivo `data/productos.json`
- Presencia de etiquetas HTML obligatorias (`<!DOCTYPE>`, `lang`, `<title>`)
- Atributos de accesibilidad ARIA en el HTML
- Sintaxis correcta de los 6 módulos JavaScript
- Presencia de los 30+ archivos de imágenes

**Qué hace el CD al hacer merge a `main`:**
- Despliega automáticamente el sitio a GitHub Pages
- La URL de producción está disponible en la pestaña _Environments_ de GitHub

### Flujo de ramas (GitFlow simplificado)

```
main       ──────────────────────────────── (producción)
              ↑ merge tras review
develop    ─────────────────────────────── (integración)
              ↑ merge tras completar historia
feature/*  ──────────────────────────────── (desarrollo)
```

---

## Accesibilidad

El proyecto cumple **WCAG 2.1 nivel AA**:

| Criterio | Implementación |
|---|---|
| Skip link | Enlace "Saltar al contenido" al inicio del DOM |
| Navegación por teclado | Tab y Escape en modales y formularios |
| Foco visible | `:focus-visible` en todos los controles |
| Lectores de pantalla | `aria-label`, `aria-live`, `aria-modal`, `role="alert"` |
| Formularios accesibles | `aria-required`, `aria-invalid`, `aria-describedby` |
| Movimiento reducido | `prefers-reduced-motion` en animaciones CSS |
| Texto alternativo | `alt` en todas las imágenes del catálogo |
| Contraste de color | Relación mínima 4.5:1 en texto normal |

---

## Validaciones con Regex

| Campo | Expresión regular | Criterio |
|---|---|---|
| Nombre | `/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'\-]{2,60}$/` | Letras y espacios, 2–60 caracteres |
| Correo | `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` | Formato email estándar |
| Teléfono | `/^(09\d{8}\|0[2-7]\d{7})$/` | Formato Ecuador (celular o fijo) |
| Mensaje | `/^[\s\S]{10,500}$/` | Entre 10 y 500 caracteres |

---

## Estructura del proyecto

```
Sal-y-Canela/
├── .github/
│   └── workflows/
│       └── ci.yml              ← Pipeline CI/CD (GitHub Actions)
├── docs/
│   └── SCRUM.md                ← Documentación Scrum completa
├── assets/
│   └── styles.css              ← Estilos complementarios
├── data/
│   └── productos.json          ← Catálogo de 30 productos
├── imagenes comida/            ← 32 imágenes del menú
├── js/
│   ├── repositorio.js          ← Carga de datos (fetch + fallback)
│   ├── carrito.js              ← Módulo IndexedDB
│   ├── logica-carrito.js       ← CRUD del carrito (localStorage)
│   ├── autenticacion.js        ← Login y gestión de sesión
│   ├── vista.js                ← Formulario de contacto
│   └── aplicacion.js           ← Coordinador (cookies + sessionStorage)
├── index.html                  ← SPA principal
└── README.md                   ← Este archivo
```

---

## Observaciones técnicas

- Los precios **incluyen IVA 15%** (Ecuador 2024). El sistema extrae el IVA del precio final, no lo agrega.
- La sincronización entre pestañas usa el evento `storage` de la Web API.
- El cajero recibe auto-refresh cada 15 segundos via `setInterval`.
- El catálogo usa `fetch()` con fallback inline para funcionar en `file://` y servidor.
- No depende de ningún framework o librería externa (vanilla JS puro).

---

_Desarrollado por el equipo Sal y Canela — PUCE Ecuador, 2025_
