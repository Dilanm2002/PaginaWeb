import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { beforeAll, beforeEach, describe, it, expect } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

beforeAll(() => {
  const src = readFileSync(resolve(__dirname, '../js/logica-carrito.js'), 'utf-8')
  ;(0, eval)(src)
})

beforeEach(() => {
  localStorage.clear()
})

// ── leerCarrito ────────────────────────────────────────────────
describe('leerCarrito', () => {
  it('devuelve array vacío si localStorage está limpio', () => {
    expect(window.LogicaCarrito.leerCarrito()).toEqual([])
  })

  it('devuelve los ítems guardados', () => {
    localStorage.setItem('test_carrito', JSON.stringify([{ id: 'p1', cantidad: 2 }]))
    expect(window.LogicaCarrito.leerCarrito()).toHaveLength(1)
  })

  it('devuelve array vacío si localStorage tiene JSON inválido', () => {
    localStorage.setItem('test_carrito', 'corrupted{{')
    expect(window.LogicaCarrito.leerCarrito()).toEqual([])
  })
})

// ── agregarItem ────────────────────────────────────────────────
describe('agregarItem', () => {
  const producto = { id: 'p1', nombre: 'Ponche Suizo', precio: 2.50, imagen: '' }

  it('agrega un nuevo ítem con cantidad 1', () => {
    const items = window.LogicaCarrito.agregarItem(producto)
    expect(items).toHaveLength(1)
    expect(items[0].cantidad).toBe(1)
    expect(items[0].nombre).toBe('Ponche Suizo')
  })

  it('incrementa cantidad si el ítem ya existe', () => {
    window.LogicaCarrito.agregarItem(producto)
    const items = window.LogicaCarrito.agregarItem(producto)
    expect(items).toHaveLength(1)
    expect(items[0].cantidad).toBe(2)
  })

  it('guarda exclusiones cuando se pasan', () => {
    const items = window.LogicaCarrito.agregarItem(producto, ['azúcar'])
    expect(items[0].exclusiones).toEqual(['azúcar'])
  })

  it('agrega múltiples productos distintos', () => {
    const p2 = { id: 'p2', nombre: 'Café', precio: 1.50, imagen: '' }
    window.LogicaCarrito.agregarItem(producto)
    const items = window.LogicaCarrito.agregarItem(p2)
    expect(items).toHaveLength(2)
  })

  it('persiste en localStorage', () => {
    window.LogicaCarrito.agregarItem(producto)
    const guardado = JSON.parse(localStorage.getItem('test_carrito'))
    expect(guardado).toHaveLength(1)
  })

  it('mismo producto con distintas exclusiones crea líneas separadas (no se mezclan)', () => {
    window.LogicaCarrito.agregarItem(producto) // sin exclusiones
    const items = window.LogicaCarrito.agregarItem(producto, [{ id: 'ing1', nombre: 'Arroz' }])
    expect(items).toHaveLength(2)
    expect(items[0].cantidad).toBe(1)
    expect(items[0].exclusiones).toEqual([])
    expect(items[1].cantidad).toBe(1)
    expect(items[1].exclusiones).toEqual([{ id: 'ing1', nombre: 'Arroz' }])
  })

  it('mismo producto con las mismas exclusiones sí incrementa cantidad', () => {
    window.LogicaCarrito.agregarItem(producto, [{ id: 'ing1', nombre: 'Arroz' }])
    const items = window.LogicaCarrito.agregarItem(producto, [{ id: 'ing1', nombre: 'Arroz' }])
    expect(items).toHaveLength(1)
    expect(items[0].cantidad).toBe(2)
  })

  it('mismas exclusiones en distinto orden se consideran la misma línea', () => {
    window.LogicaCarrito.agregarItem(producto, [{ id: 'ing1', nombre: 'Arroz' }, { id: 'ing2', nombre: 'Ensalada' }])
    const items = window.LogicaCarrito.agregarItem(producto, [{ id: 'ing2', nombre: 'Ensalada' }, { id: 'ing1', nombre: 'Arroz' }])
    expect(items).toHaveLength(1)
    expect(items[0].cantidad).toBe(2)
  })
})

// ── calcularPrecioConExclusiones ──────────────────────────────
// Caso real del cliente: un almuerzo de $3.50 con sopa incluida — si
// piden solo el segundo (sin sopa), la sopa vale $0.50 y el precio
// final debe bajar a $3.00.
describe('calcularPrecioConExclusiones', () => {
  const almuerzo = {
    precio: 3.50,
    ingredientes: [
      { id: 'ing1', nombre: 'Sopa', descuento: 0.50 },
      { id: 'ing2', nombre: 'Segundo', descuento: 0 },
      { id: 'ing3', nombre: 'Jugo', descuento: 0 },
    ],
  }

  it('sin exclusiones, cobra el precio completo', () => {
    expect(window.LogicaCarrito.calcularPrecioConExclusiones(almuerzo, [])).toBe(3.50)
  })

  it('excluir un ingrediente sin descuento no cambia el precio', () => {
    const precio = window.LogicaCarrito.calcularPrecioConExclusiones(almuerzo, [{ id: 'ing3', nombre: 'Jugo' }])
    expect(precio).toBe(3.50)
  })

  it('excluir la sopa (componente con precio) resta su descuento', () => {
    const precio = window.LogicaCarrito.calcularPrecioConExclusiones(almuerzo, [{ id: 'ing1', nombre: 'Sopa' }])
    expect(precio).toBe(3.00)
  })

  it('excluir varios componentes con precio resta todos los descuentos', () => {
    const conDosComponentes = {
      precio: 4.00,
      ingredientes: [
        { id: 'ing1', nombre: 'Sopa', descuento: 0.50 },
        { id: 'ing4', nombre: 'Postre', descuento: 0.75 },
      ],
    }
    const precio = window.LogicaCarrito.calcularPrecioConExclusiones(conDosComponentes, [
      { id: 'ing1', nombre: 'Sopa' },
      { id: 'ing4', nombre: 'Postre' },
    ])
    expect(precio).toBe(2.75)
  })

  it('nunca da un precio negativo aunque los descuentos superen el precio base', () => {
    const barato = { precio: 0.30, ingredientes: [{ id: 'ing1', nombre: 'Sopa', descuento: 0.50 }] }
    const precio = window.LogicaCarrito.calcularPrecioConExclusiones(barato, [{ id: 'ing1', nombre: 'Sopa' }])
    expect(precio).toBe(0)
  })

  it('funciona también si la exclusión llega como string (sin id)', () => {
    const precio = window.LogicaCarrito.calcularPrecioConExclusiones(almuerzo, ['Sopa'])
    expect(precio).toBe(3.00)
  })

  it('agregarItem guarda el precio ya ajustado en la línea del carrito', () => {
    const producto = { ...almuerzo, id: 'alm1', nombre: 'Almuerzo', imagen: '' }
    const items = window.LogicaCarrito.agregarItem(producto, [{ id: 'ing1', nombre: 'Sopa' }])
    expect(items[0].precio).toBe(3.00)
  })
})

// ── Mezclar mesa + para llevar en el mismo pedido ─────────────
// Caso real del cliente: "deme 1 almuerzo para llevar y 1 para servirse"
// en la misma visita — deben quedar como líneas separadas del mismo pedido.
describe('paraLlevar por línea', () => {
  const almuerzo = { id: 'alm1', nombre: 'Almuerzo', precio: 3.50, imagen: '' }

  it('agregarItem acepta paraLlevar y lo guarda en la línea', () => {
    const items = window.LogicaCarrito.agregarItem(almuerzo, [], true)
    expect(items[0].paraLlevar).toBe(true)
  })

  it('mismo producto, uno para la mesa y otro para llevar, crea líneas separadas', () => {
    window.LogicaCarrito.agregarItem(almuerzo, [], false)
    const items = window.LogicaCarrito.agregarItem(almuerzo, [], true)
    expect(items).toHaveLength(2)
    expect(items[0].paraLlevar).toBe(false)
    expect(items[0].cantidad).toBe(1)
    expect(items[1].paraLlevar).toBe(true)
    expect(items[1].cantidad).toBe(1)
  })

  it('mismo producto y mismo paraLlevar sí incrementa cantidad', () => {
    window.LogicaCarrito.agregarItem(almuerzo, [], true)
    const items = window.LogicaCarrito.agregarItem(almuerzo, [], true)
    expect(items).toHaveLength(1)
    expect(items[0].cantidad).toBe(2)
  })

  it('cambiarParaLlevar marca una línea existente sin tocar las demás', () => {
    window.LogicaCarrito.agregarItem(almuerzo, [])
    const previos = window.LogicaCarrito.agregarItem({ id: 'p2', nombre: 'Café', precio: 1, imagen: '' }, [])
    const linea = previos.find(i => i.id === 'p2')
    const items = window.LogicaCarrito.cambiarParaLlevar(linea.lineId, true)
    const item2 = items.find(i => i.id === 'p2')
    const item1 = items.find(i => i.id === 'alm1')
    expect(item2.paraLlevar).toBe(true)
    expect(item1.paraLlevar).toBeFalsy()
  })

  it('cambiarParaLlevar no mezcla la línea alternada con otra ya existente igual', () => {
    // Ya hay una línea "para llevar"; si alterno la línea "para la mesa"
    // a para-llevar, NO debe fusionarse silenciosamente con la primera —
    // cambiarParaLlevar solo cambia esa línea puntual.
    window.LogicaCarrito.agregarItem(almuerzo, [], true)  // línea A: para llevar
    const items0 = window.LogicaCarrito.agregarItem(almuerzo, [], false) // línea B: para la mesa
    const lineaMesa = items0.find(i => !i.paraLlevar)
    const items = window.LogicaCarrito.cambiarParaLlevar(lineaMesa.lineId, true)
    // Ambas líneas ahora son "para llevar" pero siguen siendo dos líneas
    // independientes (cambiarParaLlevar no re-fusiona con agregarItem).
    expect(items).toHaveLength(2)
    expect(items.every(i => i.paraLlevar)).toBe(true)
  })
})

// ── eliminarItem ───────────────────────────────────────────────
describe('eliminarItem', () => {
  it('elimina el ítem con el id indicado', () => {
    window.LogicaCarrito.agregarItem({ id: 'p1', nombre: 'A', precio: 1, imagen: '' })
    window.LogicaCarrito.agregarItem({ id: 'p2', nombre: 'B', precio: 2, imagen: '' })
    const items = window.LogicaCarrito.eliminarItem('p1')
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('p2')
  })

  it('elimina solo la línea correcta cuando el mismo producto tiene dos líneas (distintas exclusiones)', () => {
    const producto = { id: 'p1', nombre: 'Almuerzo', precio: 3, imagen: '' }
    window.LogicaCarrito.agregarItem(producto)
    const [, conExcl] = window.LogicaCarrito.agregarItem(producto, [{ id: 'ing1', nombre: 'Arroz' }])
    const items = window.LogicaCarrito.eliminarItem(conExcl.lineId)
    expect(items).toHaveLength(1)
    expect(items[0].exclusiones).toEqual([])
  })

  it('no falla si el id no existe', () => {
    window.LogicaCarrito.agregarItem({ id: 'p1', nombre: 'A', precio: 1, imagen: '' })
    const items = window.LogicaCarrito.eliminarItem('inexistente')
    expect(items).toHaveLength(1)
  })
})

// ── cambiarCantidad ────────────────────────────────────────────
describe('cambiarCantidad', () => {
  const p = { id: 'p1', nombre: 'A', precio: 5, imagen: '' }

  it('actualiza la cantidad correctamente', () => {
    window.LogicaCarrito.agregarItem(p)
    const items = window.LogicaCarrito.cambiarCantidad('p1', 3)
    expect(items[0].cantidad).toBe(3)
  })

  it('elimina el ítem si cantidad es 0', () => {
    window.LogicaCarrito.agregarItem(p)
    const items = window.LogicaCarrito.cambiarCantidad('p1', 0)
    expect(items).toHaveLength(0)
  })

  it('elimina el ítem si cantidad es negativa', () => {
    window.LogicaCarrito.agregarItem(p)
    const items = window.LogicaCarrito.cambiarCantidad('p1', -1)
    expect(items).toHaveLength(0)
  })
})

// ── vaciarCarrito ──────────────────────────────────────────────
describe('vaciarCarrito', () => {
  it('vacía todos los ítems', () => {
    window.LogicaCarrito.agregarItem({ id: 'p1', nombre: 'A', precio: 1, imagen: '' })
    window.LogicaCarrito.agregarItem({ id: 'p2', nombre: 'B', precio: 2, imagen: '' })
    const items = window.LogicaCarrito.vaciarCarrito()
    expect(items).toEqual([])
  })

  it('borra el localStorage', () => {
    window.LogicaCarrito.agregarItem({ id: 'p1', nombre: 'A', precio: 1, imagen: '' })
    window.LogicaCarrito.vaciarCarrito()
    expect(JSON.parse(localStorage.getItem('test_carrito'))).toEqual([])
  })
})

// ── calcularTotales ────────────────────────────────────────────
describe('calcularTotales', () => {
  it('devuelve ceros para carrito vacío', () => {
    const r = window.LogicaCarrito.calcularTotales([])
    expect(r.total).toBe(0)
    expect(r.iva).toBe(0)
    expect(r.subtotal).toBe(0)
    expect(r.nItems).toBe(0)
  })

  it('calcula el total correcto para un ítem', () => {
    const r = window.LogicaCarrito.calcularTotales([{ precio: 10, cantidad: 1 }])
    expect(r.total).toBe(10)
    expect(r.nItems).toBe(1)
  })

  it('extrae IVA de precio que ya lo incluye (IVA 15%)', () => {
    // precio incluye IVA: iva = total * (0.15 / 1.15)
    const r = window.LogicaCarrito.calcularTotales([{ precio: 11.50, cantidad: 1 }])
    expect(r.iva).toBeCloseTo(11.50 * (0.15 / 1.15), 5)
    expect(r.subtotal).toBeCloseTo(11.50 - r.iva, 5)
    expect(r.subtotal + r.iva).toBeCloseTo(r.total, 5)
  })

  it('suma correctamente múltiples ítems y cantidades', () => {
    const items = [
      { precio: 5, cantidad: 2 },  // 10
      { precio: 3, cantidad: 3 }   // 9
    ]
    const r = window.LogicaCarrito.calcularTotales(items)
    expect(r.total).toBeCloseTo(19, 5)
    expect(r.nItems).toBe(5)
  })

  it('subtotal + iva == total siempre', () => {
    const items = [
      { precio: 2.50, cantidad: 3 },
      { precio: 7.99, cantidad: 1 }
    ]
    const r = window.LogicaCarrito.calcularTotales(items)
    expect(r.subtotal + r.iva).toBeCloseTo(r.total, 10)
  })

  it('nItems refleja la suma de cantidades (no número de líneas)', () => {
    const items = [
      { precio: 1, cantidad: 4 },
      { precio: 2, cantidad: 6 }
    ]
    const r = window.LogicaCarrito.calcularTotales(items)
    expect(r.nItems).toBe(10)
  })

  // Configuración real del negocio (RIMPE — Negocio Popular, tarifa 0%)
  it('con IVA 0% (RIMPE), subtotal == total y iva == 0', () => {
    const ivaOriginal = window.SC_CONFIG.IVA
    window.SC_CONFIG.IVA = 0
    try {
      const r = window.LogicaCarrito.calcularTotales([{ precio: 12.34, cantidad: 3 }])
      expect(r.total).toBeCloseTo(37.02, 5)
      expect(r.iva).toBe(0)
      expect(r.subtotal).toBeCloseTo(r.total, 10)
    } finally {
      window.SC_CONFIG.IVA = ivaOriginal
    }
  })
})
