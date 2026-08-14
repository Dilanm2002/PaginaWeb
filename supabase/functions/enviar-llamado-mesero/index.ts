// Edge Function: enviar-llamado-mesero
// La caja/cocina llama a esta funcion para avisarle al mesero, via Web
// Push real (funciona con el telefono bloqueado o el navegador en
// segundo plano — a diferencia de solo sonido/vibracion desde la propia
// pestana, que requieren que este visible). Valida la sesion de staff
// igual que enviar-nota-venta, y le manda el push a todas las
// suscripciones guardadas en push_subscripciones.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@salycanela.lat'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405)

  try {
    const { token, mesero_id } = await req.json()
    if (!token || typeof token !== 'string') return jsonResponse({ error: 'Falta token' }, 400)
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return jsonResponse({ error: 'VAPID no configurado en el servidor' }, 500)
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Mismo criterio que enviar-nota-venta: token vigente y rol de staff
    // (caja o cocina son quienes pueden llamar al mesero).
    const { data: sesion } = await supabase
      .from('sesiones_staff')
      .select('rol, expira_en')
      .eq('token', token)
      .maybeSingle()

    const vigente = sesion && new Date(sesion.expira_en) > new Date()
    const rolValido = sesion?.rol === 'cajero' || sesion?.rol === 'cocinero' || sesion?.rol === 'administrador'
    if (!vigente || !rolValido) return jsonResponse({ error: 'No autorizado' }, 401)

    // Si viene mesero_id, el llamado va dirigido solo a ese mesero (elegido
    // en el modal de caja/cocina) — si no viene, se manda a todos (fallback
    // por compatibilidad, no debería usarse desde la UI actual).
    let subsQuery = supabase.from('push_subscripciones').select('id, endpoint, p256dh, auth')
    if (mesero_id && typeof mesero_id === 'string') subsQuery = subsQuery.eq('usu_id', mesero_id)
    const { data: subs, error: subsError } = await subsQuery
    if (subsError) throw subsError
    if (!subs || subs.length === 0) return jsonResponse({ ok: true, enviados: 0 })

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const payload = JSON.stringify({
      title: '🔔 Caja te está llamando',
      body: 'Acércate al despacho',
    })

    let enviados = 0
    const idsVencidos: string[] = []

    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { urgency: 'high' }
        )
        enviados++
      } catch (e) {
        // 404/410 = la suscripción ya no existe (el navegador la revocó) —
        // se limpia para no seguir intentando en cada llamado futuro.
        const status = (e as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) idsVencidos.push(s.id)
        else console.error('enviar-llamado-mesero push error:', e)
      }
    }))

    if (idsVencidos.length) {
      await supabase.from('push_subscripciones').delete().in('id', idsVencidos)
    }

    return jsonResponse({ ok: true, enviados, vencidos: idsVencidos.length })
  } catch (e) {
    console.error('enviar-llamado-mesero error:', e)
    return jsonResponse({ error: String(e) }, 500)
  }
})
