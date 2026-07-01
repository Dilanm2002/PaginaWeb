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
})
