import { createClient } from 'jsr:@supabase/supabase-js@2'

const CUENTA = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!
const TOKEN = Deno.env.get('CLOUDFLARE_STREAM_TOKEN')!

// El panel llama a esta función con supabase.functions.invoke() desde un
// componente cliente, o sea desde el navegador. Eso manda antes un preflight
// OPTIONS: si no se contesta, la subida falla y el error que ve el usuario no
// menciona CORS por ningún lado.
//
// Origin '*' no abre nada acá: la función exige un Bearer del usuario, y ese
// token vive en el origen del panel, al que una página ajena no llega.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const responder = (cuerpo: string, status: number) =>
  new Response(cuerpo, { status, headers: CORS })

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (peticion.method !== 'POST') return responder('Método no permitido', 405)

  const autorizacion = peticion.headers.get('Authorization')
  if (!autorizacion) return responder('Falta autenticación', 401)

  // Cliente con el token de quien llama: hereda sus permisos y su RLS.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: autorizacion } } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return responder('Sesión inválida', 401)

  // limit(1) y no single(): una persona puede pertenecer a varios gimnasios.
  const { data: membresia } = await supabase
    .from('memberships').select('id, gym_id, rol').eq('user_id', user.id)
    .order('created_at').limit(1).maybeSingle()

  // Este chequeo de rol duplica lo que ya hace RLS en el insert de más abajo,
  // y acá la duplicación es a propósito: sin él le pediríamos a Cloudflare una
  // URL de subida para alguien que después no va a poder registrar el video,
  // y esa URL quedaría colgada. La autoridad sigue siendo RLS; esto es solo
  // para no gastar al pedo.
  if (!membresia || !['entrenador', 'admin'].includes(membresia.rol)) {
    return responder('No tenés permiso para subir videos', 403)
  }

  // Pedirle a Cloudflare una URL de subida de un solo uso.
  let cuerpo: { success?: boolean; errors?: unknown; result?: { uid: string; uploadURL: string } }
  try {
    const respuesta = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CUENTA}/stream/direct_upload`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDurationSeconds: 300,
          // Sin esto, el video queda accesible con su URL pública para
          // cualquiera que la tenga. Es lo que impide que el contenido del
          // gimnasio circule por WhatsApp.
          requireSignedURLs: true,
        }),
      },
    )
    cuerpo = await respuesta.json()
  } catch (e) {
    // Cloudflare caído, sin red, o el JSON no se pudo leer. Sin este catch la
    // función revienta con un 500 sin cuerpo y el panel no sabe qué mostrar.
    console.error('No se pudo hablar con Cloudflare', e)
    return responder('No pudimos preparar la subida', 502)
  }

  if (!cuerpo.success || !cuerpo.result) {
    console.error('Cloudflare rechazó la subida', cuerpo.errors)
    return responder('No pudimos preparar la subida', 502)
  }

  const { uid, uploadURL } = cuerpo.result

  const { data: video, error } = await supabase
    .from('videos')
    .insert({
      gym_id: membresia.gym_id,
      stream_uid: uid,
      estado: 'procesando',
      subido_por: membresia.id,
    })
    .select('id')
    .single()

  if (error) {
    // Acá ya se pidió la URL a Cloudflare, así que queda un direct_upload
    // huérfano que nadie va a usar. Caducan solos, y el chequeo de rol de
    // arriba hace que este camino sea raro. Si algún día molesta, se limpia
    // con DELETE /stream/{uid}.
    console.error('No se pudo registrar el video', error)
    return responder('No pudimos registrar el video', 500)
  }

  return Response.json({ videoId: video.id, uploadUrl: uploadURL }, { headers: CORS })
})
