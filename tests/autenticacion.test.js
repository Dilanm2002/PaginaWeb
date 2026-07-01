import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

beforeAll(() => {
  const src = readFileSync(resolve(__dirname, '../js/autenticacion.js'), 'utf-8')
  ;(0, eval)(src)
})

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  vi.restoreAllMocks()
})

// ── Sesión ─────────────────────────────────────────────────────
describe('getSession / setSession / clearSession', () => {
  it('getSession devuelve null si no hay sesión', () => {
    expect(window.ModuloAutenticacion.getSession()).toBeNull()
  })

  it('setSession guarda y getSession recupera la sesión', () => {
    const sesion = { id: 'u1', nombre: 'Dilan', usuario: 'dilan', rol: 'admin' }
    window.ModuloAutenticacion.setSession(sesion)
    expect(window.ModuloAutenticacion.getSession()).toEqual(sesion)
  })

  it('clearSession elimina la sesión activa', () => {
    window.ModuloAutenticacion.setSession({ id: 'u1', nombre: 'Test' })
    window.ModuloAutenticacion.clearSession()
    expect(window.ModuloAutenticacion.getSession()).toBeNull()
  })
})

// ── login ──────────────────────────────────────────────────────
describe('login', () => {
  it('retorna error de conexión si el RPC lanza excepción', async () => {
    window.db.rpc = vi.fn().mockRejectedValue(new Error('timeout'))
    const res = await window.ModuloAutenticacion.login('admin', '1234')
    expect(res.ok).toBe(false)
    expect(res.msg).toMatch(/conexión|error/i)
  })

  it('retorna ok:true y el usuario cuando el RPC devuelve datos', async () => {
    window.db.rpc = vi.fn()
      .mockResolvedValueOnce({ data: { activo: true }, error: null }) // verificar_estado_usuario
      .mockResolvedValueOnce({                                         // verificar_login
        data: [{
          usu_id: 'u1', usu_nombre: 'Admin', usu_apellido: '',
          usu_email: 'a@a.com', usu_telefono: '', usu_usuario: 'admin',
          rol_nombre: 'administrador'
        }],
        error: null
      })
    const res = await window.ModuloAutenticacion.login('admin', 'admin123')
    expect(res.ok).toBe(true)
    expect(res.user.rol).toBe('administrador')
  })

  it('retorna error si credenciales son incorrectas (RPC devuelve array vacío)', async () => {
    window.db.rpc = vi.fn()
      .mockResolvedValueOnce({ data: { activo: true }, error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    const res = await window.ModuloAutenticacion.login('admin', 'mal')
    expect(res.ok).toBe(false)
    expect(res.msg).toMatch(/intento|credencial/i)
  })

  it('retorna error si la cuenta está desactivada', async () => {
    window.db.rpc = vi.fn()
      .mockResolvedValueOnce({ data: { activo: false }, error: null })
    const res = await window.ModuloAutenticacion.login('admin', '1234')
    expect(res.ok).toBe(false)
    expect(res.msg).toMatch(/desactivada/i)
  })
})

// ── Rate limiter ───────────────────────────────────────────────
describe('rate limiter', () => {
  it('bloquea después de 5 intentos fallidos consecutivos', async () => {
    window.db.rpc = vi.fn()
      .mockResolvedValue({ data: { activo: true }, error: null })

    // Primera llamada es verificar_estado, segunda es verificar_login (vacío = fallo)
    window.db.rpc = vi.fn((fn) => {
      if (fn === 'verificar_estado_usuario') return Promise.resolve({ data: { activo: true }, error: null })
      return Promise.resolve({ data: [], error: null })
    })

    for (let i = 0; i < 5; i++) {
      await window.ModuloAutenticacion.login('x', 'y')
    }

    const res = await window.ModuloAutenticacion.login('x', 'y')
    expect(res.ok).toBe(false)
    expect(res.msg).toMatch(/bloqueada|espera/i)
  })
})

// ── registrar ──────────────────────────────────────────────────
describe('registrar', () => {
  it('rechaza contraseñas de menos de 4 caracteres', async () => {
    const res = await window.ModuloAutenticacion.registrar(
      'Test', '', 'test@test.com', '', '', 'test', '123', 'usuario'
    )
    expect(res.ok).toBe(false)
    expect(res.msg).toMatch(/4 caracteres/i)
  })

  it('retorna ok:true cuando el RPC registra exitosamente', async () => {
    window.db.rpc = vi.fn().mockResolvedValue({
      data: { ok: true, usu_id: 'nuevo-id' }, error: null
    })
    const res = await window.ModuloAutenticacion.registrar(
      'Juan', 'Pérez', 'juan@test.com', '0999', '', 'juan', 'pass123', 'usuario'
    )
    expect(res.ok).toBe(true)
    expect(res.user.nombre).toBe('Juan')
  })

  it('retorna error si el RPC reporta fallo', async () => {
    window.db.rpc = vi.fn().mockResolvedValue({
      data: { ok: false, msg: 'Usuario ya existe' }, error: null
    })
    const res = await window.ModuloAutenticacion.registrar(
      'Ana', '', 'ana@test.com', '', '', 'ana', 'pass1234', 'usuario'
    )
    expect(res.ok).toBe(false)
  })
})
