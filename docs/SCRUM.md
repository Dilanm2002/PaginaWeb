# Metodología Scrum — Sal y Canela

Proyecto desarrollado con metodología ágil Scrum para la materia **Desarrollo de Plataformas** — PUCE Ecuador.

---

## Equipo Scrum

| Rol | Responsabilidad |
|---|---|
| **Product Owner** | Define el backlog, prioriza historias de usuario, acepta entregables |
| **Scrum Master** | Facilita ceremonias, elimina impedimentos, vela por el proceso ágil |
| **Development Team** | Diseña, implementa y prueba las funcionalidades del sistema |

---

## Definición de "Terminado" (Definition of Done)

Una historia de usuario se considera **terminada** cuando:

- [ ] El código funciona en Chrome, Firefox y Edge
- [ ] La funcionalidad es accesible por teclado
- [ ] Los datos persisten correctamente tras recargar la página
- [ ] No hay errores en la consola del navegador
- [ ] El pipeline de CI pasa sin errores
- [ ] El Product Owner aprueba la demo

---

## Product Backlog

### Épicas e Historias de Usuario

#### Épica 1 — Catálogo de productos
| ID | Historia de usuario | Prioridad | Puntos |
|---|---|---|---|
| US-01 | Como cliente, quiero ver el menú completo con fotos y precios para decidir qué pedir | Alta | 3 |
| US-02 | Como cliente, quiero filtrar por categoría para encontrar rápido lo que busco | Alta | 2 |
| US-03 | Como cliente, quiero buscar un producto por nombre para no recorrer todo el menú | Media | 2 |

#### Épica 2 — Carrito de compras
| ID | Historia de usuario | Prioridad | Puntos |
|---|---|---|---|
| US-04 | Como cliente, quiero agregar productos al carrito para armar mi pedido | Alta | 3 |
| US-05 | Como cliente, quiero ver el subtotal e IVA desglosados antes de confirmar | Alta | 2 |
| US-06 | Como cliente, quiero que el carrito persista si recargo la página | Media | 2 |
| US-07 | Como cliente, quiero que el carrito se sincronice entre pestañas en tiempo real | Baja | 3 |

#### Épica 3 — Autenticación y roles
| ID | Historia de usuario | Prioridad | Puntos |
|---|---|---|---|
| US-08 | Como administrador, quiero que existan roles diferenciados (cajero / mesero / usuario) para controlar el acceso | Alta | 5 |
| US-09 | Como usuario, quiero registrarme con correo y contraseña para acceder a funciones adicionales | Alta | 3 |
| US-10 | Como sistema, quiero que la sesión expire al cerrar la pestaña por seguridad | Media | 2 |

#### Épica 4 — Gestión de pedidos (cajero)
| ID | Historia de usuario | Prioridad | Puntos |
|---|---|---|---|
| US-11 | Como cajero, quiero ver todos los pedidos pendientes en tiempo real para atenderlos | Alta | 5 |
| US-12 | Como cajero, quiero marcar un pedido como "cobrado" para retirarlo de la cola | Alta | 3 |
| US-13 | Como cajero, quiero ver el resumen de ventas del día con totales | Alta | 3 |
| US-14 | Como cajero, quiero registrar gastos del día para llevar control de caja | Media | 2 |

#### Épica 5 — Persistencia y datos
| ID | Historia de usuario | Prioridad | Puntos |
|---|---|---|---|
| US-15 | Como sistema, quiero archivar pedidos cobrados en IndexedDB para consulta histórica | Media | 3 |
| US-16 | Como sistema, quiero registrar la primera y última visita del usuario con cookies | Baja | 1 |
| US-17 | Como sistema, quiero cargar el catálogo desde JSON externo con fallback local | Media | 2 |

#### Épica 6 — Contacto y accesibilidad
| ID | Historia de usuario | Prioridad | Puntos |
|---|---|---|---|
| US-18 | Como cliente, quiero enviar un mensaje de contacto con validación en tiempo real | Media | 3 |
| US-19 | Como usuario con discapacidad, quiero navegar toda la app solo con teclado | Alta | 4 |
| US-20 | Como usuario con lector de pantalla, quiero que los errores de formulario se anuncien automáticamente | Alta | 3 |

---

## Sprint 1 — Estructura base y catálogo

**Duración:** 2 semanas  
**Objetivo:** Tener el sitio funcional con menú visible y estructura de carpetas definida.

### Historias incluidas
- US-01 — Catálogo con fotos y precios
- US-02 — Filtro por categoría
- US-03 — Búsqueda por nombre
- US-17 — Carga desde JSON con fallback

### Tareas técnicas
- Crear estructura de carpetas `js/`, `data/`, `imagenes comida/`
- Diseñar la paleta de colores y tokens CSS (variables)
- Implementar `ModuloRepositorio` con `fetch()` y fallback inline
- Crear grid de productos con cards (foto, nombre, precio, ingredientes)
- Implementar barra de filtros horizontal con scroll en móvil
- Implementar búsqueda en tiempo real

### Criterios de aceptación
- El catálogo muestra los 30 productos con sus imágenes
- El filtro por categoría funciona sin recargar la página
- La búsqueda responde a medida que el usuario escribe
- El sitio es responsive en móvil y desktop

### Resultado
✅ Sprint completado. Catálogo funcional con 30 productos en 7 categorías.

---

## Sprint 2 — Carrito de compras

**Duración:** 2 semanas  
**Objetivo:** Permitir al cliente armar y enviar pedidos a caja.

### Historias incluidas
- US-04 — Agregar al carrito
- US-05 — Subtotal e IVA desglosados
- US-06 — Persistencia del carrito
- US-07 — Sincronización entre pestañas

### Tareas técnicas
- Implementar `ModuloCarrito` (CRUD en `localStorage`)
- Calcular IVA incluido al 15% (Ecuador)
- Sidebar/panel del carrito con lista de items y totales
- Evento `storage` para sincronización entre pestañas
- Botón "Enviar a caja" que persiste el pedido en `salycanela_caja`

### Criterios de aceptación
- El carrito persiste al recargar la página
- Los totales se recalculan automáticamente
- Un cambio en una pestaña se refleja en otra abierta

### Resultado
✅ Sprint completado. Carrito funcional con sincronización en tiempo real.

---

## Sprint 3 — Autenticación y roles

**Duración:** 2 semanas  
**Objetivo:** Control de acceso con tres roles diferenciados.

### Historias incluidas
- US-08 — Roles cajero / mesero / usuario
- US-09 — Registro de nuevos usuarios
- US-10 — Sesión en sessionStorage

### Tareas técnicas
- Implementar `ModuloAutenticacion` con login/logout
- Persistir usuarios en `salycanela_users` (localStorage)
- Guardar sesión activa en `sessionStorage`
- Lógica de visibilidad: ocultar/mostrar secciones según rol
- Modal de login con validación de campos
- Vista rápida del mesero (sin fotos, solo nombre y precio)

### Criterios de aceptación
- Cada rol ve únicamente las funciones que le corresponden
- La sesión expira al cerrar la pestaña del navegador
- Un usuario nuevo registrado obtiene el rol "usuario"

### Resultado
✅ Sprint completado. Sistema de roles operativo con 3 niveles de acceso.

---

## Sprint 4 — Vista del cajero e historial

**Duración:** 2 semanas  
**Objetivo:** Panel completo del cajero con gestión de pedidos y archivo histórico.

### Historias incluidas
- US-11 — Pedidos pendientes en tiempo real
- US-12 — Marcar pedido como cobrado
- US-13 — Resumen de ventas del día
- US-14 — Registro de gastos
- US-15 — Archivo en IndexedDB
- US-16 — Cookies de primera y última visita

### Tareas técnicas
- Implementar `CarritoIDB` (módulo IndexedDB con store `historial_idb`)
- Crear índice `por_fecha` para consultas por día
- Panel del cajero (`#cajero-view`) con grid de pedidos pendientes
- Auto-refresh cada 15 segundos para el cajero
- Sección "Ventas del Día" con KPIs y tabla
- Módulo de gastos del cajero
- Cookies `sc_primer_visita` y `sc_ultima_visita` via `aplicacion.js`

### Criterios de aceptación
- El cajero ve los pedidos en tiempo real sin recargar
- Al cobrar, el pedido desaparece de "pendientes" y aparece en "Ventas del Día"
- Los pedidos cobrados quedan archivados en IndexedDB

### Resultado
✅ Sprint completado. Panel del cajero totalmente funcional con doble persistencia.

---

## Sprint 5 — Formularios, accesibilidad y calidad

**Duración:** 2 semanas  
**Objetivo:** Alcanzar cumplimiento WCAG AA y pipeline de CI/CD funcional.

### Historias incluidas
- US-18 — Formulario de contacto con validación regex
- US-19 — Navegación por teclado
- US-20 — Anuncios ARIA en errores de formulario

### Tareas técnicas
- Implementar `ModuloVista` con validación regex para nombre, correo, teléfono y mensaje
- Agregar `aria-required`, `aria-invalid`, `aria-describedby`, `role="alert"`, `aria-live`
- Skip link al inicio del documento
- `:focus-visible` en todos los controles interactivos
- `prefers-reduced-motion` en animaciones CSS
- Textos `alt` en todas las imágenes
- Configurar GitHub Actions (`.github/workflows/ci.yml`)

### Criterios de aceptación
- El formulario valida en tiempo real con mensajes de error accesibles
- El sitio es navegable completamente con Tab y Escape
- El pipeline de CI pasa sin errores en cada push a `main` y `develop`
- El sitio se despliega automáticamente en GitHub Pages desde `main`

### Resultado
✅ Sprint completado. Cumplimiento WCAG AA y CI/CD operativo.

---

## Velocidad del equipo

| Sprint | Puntos planificados | Puntos completados | Velocidad |
|---|---|---|---|
| Sprint 1 | 8 | 8 | 100% |
| Sprint 2 | 10 | 10 | 100% |
| Sprint 3 | 10 | 10 | 100% |
| Sprint 4 | 14 | 14 | 100% |
| Sprint 5 | 12 | 12 | 100% |
| **Total** | **54** | **54** | **100%** |

---

## Ceremonias Scrum realizadas

| Ceremonia | Frecuencia | Duración |
|---|---|---|
| Sprint Planning | Inicio de cada sprint | 1 hora |
| Daily Standup | Diario (lunes a viernes) | 15 minutos |
| Sprint Review | Final de cada sprint | 30 minutos |
| Sprint Retrospectiva | Final de cada sprint | 30 minutos |
| Backlog Refinement | Mitad de cada sprint | 30 minutos |

---

## Retrospectivas — Lecciones aprendidas

### Sprint 1
- **Bien:** La estructura de módulos IIFE facilitó el trabajo en paralelo.
- **Mejorar:** Definir los tokens CSS desde el inicio evitaría inconsistencias de color.

### Sprint 2
- **Bien:** El patrón event-listener en `storage` fue elegante para la sincronización.
- **Mejorar:** Documentar mejor el cálculo del IVA incluido para nuevos miembros.

### Sprint 3
- **Bien:** Usar `sessionStorage` para la sesión fue la decisión correcta de seguridad.
- **Mejorar:** Las vistas por rol deberían tener sus propios archivos CSS en proyectos más grandes.

### Sprint 4
- **Bien:** IndexedDB como respaldo secundario da robustez al historial.
- **Mejorar:** El auto-refresh podría usar WebSockets en una versión con backend real.

### Sprint 5
- **Bien:** El pipeline de CI detecta regresiones antes de que lleguen a producción.
- **Mejorar:** Agregar tests automatizados (Playwright) en futuros sprints.
