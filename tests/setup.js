// Configuración global para todos los tests
globalThis.window = globalThis

window.SC_CONFIG = {
  LS_CARRITO:  'test_carrito',
  LS_UPDATED:  'test_updated',
  LS_SESSION:  'test_session',
  LS_USERS:    'test_users',
  LS_CAJA:     'test_caja',
  LS_HISTORIAL:'test_historial',
  LS_GASTOS:   'test_gastos',
  IVA: 0.15
}

// Mock mínimo de Supabase para tests que lo necesiten
window.db = {
  rpc: async () => ({ data: null, error: null }),
  from: () => ({
    select: () => ({ eq: () => ({ order: () => ({ data: [], error: null }) }) })
  }),
  auth: {
    signInWithOAuth: async () => ({ error: null }),
    signOut:         async () => ({}),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
  }
}
