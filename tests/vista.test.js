import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { beforeAll, describe, it, expect } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

beforeAll(() => {
  const src = readFileSync(resolve(__dirname, '../js/vista.js'), 'utf-8')
  ;(0, eval)(src)
})

const MV = () => window.ModuloVista

describe('_esTextoRepetitivo', () => {
  it('detecta patrones de relleno tipo teclado', () => {
    expect(MV()._esTextoRepetitivo('asdasdasdasd')).toBe(true)
    expect(MV()._esTextoRepetitivo('aaaaaa')).toBe(true)
    expect(MV()._esTextoRepetitivo('jajajaja')).toBe(true)
    expect(MV()._esTextoRepetitivo('xyzxyzxyz')).toBe(true)
  })

  it('no marca nombres cortos legítimos como repetitivos', () => {
    expect(MV()._esTextoRepetitivo('Ana')).toBe(false)
    expect(MV()._esTextoRepetitivo('Coco')).toBe(false)
    expect(MV()._esTextoRepetitivo('María López')).toBe(false)
  })

  it('no marca palabras reales repetidas a propósito', () => {
    expect(MV()._esTextoRepetitivo('gracias gracias gracias')).toBe(false)
  })

  it('no marca un mensaje real y largo', () => {
    expect(MV()._esTextoRepetitivo(
      'Hola, quisiera hacer una reserva para el sábado a las 8pm, somos 4 personas.'
    )).toBe(false)
  })

  it('no marca números de teléfono ni texto sin patrón repetido', () => {
    expect(MV()._esTextoRepetitivo('0991234567')).toBe(false)
  })
})
