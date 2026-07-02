// Edge Function: enviar-nota-venta
// Recibe { token, email, html, numNota } desde el cliente, valida la
// sesión de staff contra sesiones_staff (mismo modelo de tokens que las
// RPCs de la base de datos) y envía el correo vía Resend.
// La API key de Resend y la service role key viven solo en el entorno
// del servidor — nunca llegan al navegador.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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
    const { token, email, html, numNota } = await req.json()

    if (!token || typeof token !== 'string') return jsonResponse({ error: 'Falta token' }, 400)
    if (!email || typeof email !== 'string') return jsonResponse({ error: 'Falta correo' }, 400)
    if (!html || typeof html !== 'string') return jsonResponse({ error: 'Falta contenido' }, 400)
    if (!RESEND_API_KEY) return jsonResponse({ error: 'RESEND_API_KEY no configurada' }, 500)

    // Validar sesión de staff (cajero/administrador) — mismo criterio que
    // las RPCs cobrar_pedido/registrar_gasto en sql/hardening-rls.sql.
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: sesion } = await supabase
      .from('sesiones_staff')
      .select('rol, expira_en')
      .eq('token', token)
      .maybeSingle()

    const vigente = sesion && new Date(sesion.expira_en) > new Date()
    const rolValido = sesion?.rol === 'cajero' || sesion?.rol === 'administrador'
    if (!vigente || !rolValido) return jsonResponse({ error: 'No autorizado' }, 401)

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Sal y Canela <notas@salycanela.lat>',
        to: email,
        subject: `Tu Nota de Venta${numNota ? ' ' + numNota : ''} — Sal y Canela`,
        html,
      }),
    })

    if (!resendRes.ok) {
      const detalle = await resendRes.text()
      console.error('Resend error:', detalle)
      return jsonResponse({ error: 'No se pudo enviar el correo', detalle }, 502)
    }

    return jsonResponse({ ok: true })
  } catch (e) {
    console.error('enviar-nota-venta error:', e)
    return jsonResponse({ error: String(e) }, 500)
  }
})
