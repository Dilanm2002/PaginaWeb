import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

beforeAll(() => {
  window.SC_CONFIG = window.SC_CONFIG ?? { IVA: 0.15 }
  const src = readFileSync(resolve(__dirname, '../js/vista-admin.js'), 'utf-8')
  ;(0, eval)(src)
})

const VA = () => window.VistaAdmin

// ── _fechaLocalISO — el bug de zona horaria que causó varios problemas
// reales en producción: toISOString() usa UTC y desfasaba la fecha
// entre las 19:00 y medianoche hora Ecuador (UTC-5). ──────────────────
describe('_fechaLocalISO', () => {
  it('formatea con padding de dos dígitos en mes y día', () => {
    expect(VA()._fechaLocalISO(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('meses/días de dos dígitos no llevan padding extra', () => {
    expect(VA()._fechaLocalISO(new Date(2026, 8, 19))).toBe('2026-09-19')
  })

  it('usa la fecha local del objeto Date, no UTC', () => {
    // new Date(y, m, d, h, min) construye en hora LOCAL del proceso —
    // 1 de julio a las 23:30 debe seguir siendo 1 de julio, sin
    // importar la zona horaria del entorno donde corre el test.
    const d = new Date(2026, 6, 1, 23, 30)
    expect(VA()._fechaLocalISO(d)).toBe('2026-07-01')
  })

  it('sin argumento usa la fecha actual (no lanza error)', () => {
    expect(VA()._fechaLocalISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ── _lunesDeSemana — base del período "5 días" de Reportes ───────────
describe('_lunesDeSemana', () => {
  // Semana de referencia: lunes 29 jun 2026 → domingo 5 jul 2026
  const lunesEsperado = '2026-06-29'
  const casos = [
    ['lunes',     new Date(2026, 5, 29)],
    ['martes',    new Date(2026, 5, 30)],
    ['miércoles', new Date(2026, 6, 1)],
    ['jueves',    new Date(2026, 6, 2)],
    ['viernes',   new Date(2026, 6, 3)],
    ['sábado',    new Date(2026, 6, 4)],
    ['domingo',   new Date(2026, 6, 5)],
  ]

  it.each(casos)('si hoy es %s, devuelve el lunes de esa misma semana', (_nombre, d) => {
    expect(VA()._fechaLocalISO(VA()._lunesDeSemana(d))).toBe(lunesEsperado)
  })
})

// ── _rangoSemanaLaboral — "si está en jueves, regresar al lunes";
// sábado/domingo se quedan fijos en la semana lun-vie recién terminada. ─
describe('_rangoSemanaLaboral', () => {
  it('un lunes: el rango es de un solo día (el mismo lunes)', () => {
    expect(VA()._rangoSemanaLaboral(new Date(2026, 5, 29)))
      .toEqual({ desde: '2026-06-29', hasta: '2026-06-29' })
  })

  it('un jueves: va de lunes a jueves (no incluye viernes todavía)', () => {
    expect(VA()._rangoSemanaLaboral(new Date(2026, 6, 2)))
      .toEqual({ desde: '2026-06-29', hasta: '2026-07-02' })
  })

  it('un viernes: va de lunes a viernes (semana completa)', () => {
    expect(VA()._rangoSemanaLaboral(new Date(2026, 6, 3)))
      .toEqual({ desde: '2026-06-29', hasta: '2026-07-03' })
  })

  it('un sábado: se queda fijo en lun-vie, sin agregar el fin de semana', () => {
    expect(VA()._rangoSemanaLaboral(new Date(2026, 6, 4)))
      .toEqual({ desde: '2026-06-29', hasta: '2026-07-03' })
  })

  it('un domingo: también se queda fijo en lun-vie', () => {
    expect(VA()._rangoSemanaLaboral(new Date(2026, 6, 5)))
      .toEqual({ desde: '2026-06-29', hasta: '2026-07-03' })
  })
})

// ── _fechaConOffset / _labelDiaOffset — navegación día a día ─────────
describe('_fechaConOffset / _labelDiaOffset', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 2, 10, 0)) // jueves 2 jul 2026, 10:00
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('offset 0 es "Hoy"', () => {
    expect(VA()._labelDiaOffset(0)).toBe('Hoy')
    expect(VA()._fechaLocalISO(VA()._fechaConOffset(0))).toBe('2026-07-02')
  })

  it('offset -1 es "Ayer"', () => {
    expect(VA()._labelDiaOffset(-1)).toBe('Ayer')
    expect(VA()._fechaLocalISO(VA()._fechaConOffset(-1))).toBe('2026-07-01')
  })

  it('offset -2 muestra fecha formateada, no "Ayer"/"Hoy"', () => {
    const label = VA()._labelDiaOffset(-2)
    expect(label).not.toBe('Hoy')
    expect(label).not.toBe('Ayer')
    expect(VA()._fechaLocalISO(VA()._fechaConOffset(-2))).toBe('2026-06-30')
  })
})
