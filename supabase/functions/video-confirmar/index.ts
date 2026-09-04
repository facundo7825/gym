import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS, responder } from '../_compartido/cors.ts'

const BUCKET = 'videos'

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (peticion.method !== 'POST') return responder('Método no permitido', 405)

  const autorizacion = peticion.headers.get('Authorization')
  if (!autorizacion) return responder('Falta autenticación', 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: autorizacion } } },
  )

  let videoId: string | undefined
  try {
    videoId = (await peticion.json())?.videoId
  } catch {
    videoId = undefined
  }
  if (!videoId) return responder('Falta videoId', 400)

  // Acá está toda la autorización, y es una sola línea: RLS solo devuelve el
  // video si quien pregunta pertenece a ese gimnasio.
  const { data: video, error: errorSelect } = await supabase
    .from('videos').select('id, ruta, estado').eq('id', videoId).maybeSingle()

  // Sin este chequeo, un error de verdad (videoId con formato inválido, la
  // base caída) se ve igual que "RLS no devolvió la fila": las dos veces
  // `video` da `null`. Separarlos importa porque si no, el 404 del test de
  // aislamiento no prueba nada — podría ser RLS funcionando o podría ser un
  // error de query disfrazado.
  if (errorSelect) {
    console.error('No se pudo buscar el video', errorSelect)
    return responder('No pudimos buscar el video', 500)
  }

  if (!video) return responder('Video no encontrado', 404)

  // Idempotente: si ya se confirmó, repetir la llamada no rompe nada. El
  // panel puede reintentar sin lógica extra.
  if (video.estado !== 'procesando') {
    return Response.json({ estado: video.estado }, { headers: CORS })
  }

  // service_role solo para Storage, y con la ruta que salió de la fila que
  // RLS devolvió — nunca con una que venga del request. Eso es lo que evita
  // el path traversal.
  const almacen = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const corte = video.ruta.lastIndexOf('/')
  const carpeta = video.ruta.slice(0, corte)
  const archivo = video.ruta.slice(corte + 1)

  const { data: encontrados, error: errorLista } = await almacen.storage
    .from(BUCKET).list(carpeta, { search: archivo })

  if (errorLista) {
    console.error('Storage no respondió', errorLista)
    return responder('No pudimos verificar la subida', 502)
  }

  // `search` de Storage hace coincidencia por prefijo, así que la igualdad
  // exacta va acá: sin ella, un objeto con nombre parecido daría por buena
  // una subida que no ocurrió. Y por eso mismo la llamada de arriba no lleva
  // `limit`: acotarla a un resultado podría devolver el objeto de nombre
  // parecido y dejar afuera el que sí buscamos.
  const existe = (encontrados ?? []).some((objeto) => objeto.name === archivo)

  if (!existe) {
    const { error: errorUpdate } = await supabase.from('videos').update({
      estado: 'error',
      error_detalle: 'La subida no llegó a completarse',
    }).eq('id', video.id)
    // El 409 se devuelve igual: es lo único que el cliente puede hacer con
    // esta respuesta. Pero si el update falla, la fila queda trabada en
    // `procesando` sin que nadie se entere — eso sí tiene que quedar en los
    // logs, la misma falla callada que esta función existe para evitar.
    if (errorUpdate) console.error('No se pudo marcar el video como error', errorUpdate)
    return responder('La subida no llegó a completarse', 409)
  }

  const { error } = await supabase
    .from('videos').update({ estado: 'listo' }).eq('id', video.id)

  if (error) {
    console.error('No se pudo confirmar el video', error)
    return responder('No pudimos confirmar el video', 500)
  }

  return Response.json({ estado: 'listo' }, { headers: CORS })
})
