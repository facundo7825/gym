import { CORS, responder } from '../_compartido/cors.ts'
import { BUCKET, clienteAlmacen, clienteUsuario, rechazoPrevio } from '../_compartido/peticion.ts'

Deno.serve(async (peticion) => {
  const rechazo = rechazoPrevio(peticion)
  if (rechazo) return rechazo
  const autorizacion = peticion.headers.get('Authorization')!
  const supabase = clienteUsuario(autorizacion)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return responder('Sesión inválida', 401)

  // limit(1) y no single(): una persona puede pertenecer a varios gimnasios.
  const { data: membresia } = await supabase
    .from('memberships').select('id, gym_id, rol').eq('user_id', user.id)
    .order('created_at').limit(1).maybeSingle()

  // Este chequeo de rol duplica lo que ya hace RLS en el insert de más abajo,
  // y acá la duplicación es a propósito: sin él firmaríamos una URL de subida
  // para alguien que después no va a poder registrar el video. La autoridad
  // sigue siendo RLS; esto es solo para no gastar al pedo.
  if (!membresia || !['entrenador', 'admin'].includes(membresia.rol)) {
    return responder('No tenés permiso para subir videos', 403)
  }

  // La duración llega del cliente y se guarda sin verificar. Es metadato de
  // presentación, no un control: un panel modificado puede declarar 10
  // segundos y subir media hora. Lo que impide eso de verdad es el
  // file_size_limit del bucket, que lo aplica Storage y no el navegador.
  let duracionSeg: number | null = null
  try {
    const cuerpo = await peticion.json()
    duracionSeg = typeof cuerpo?.duracionSeg === 'number' && Number.isFinite(cuerpo.duracionSeg)
      ? Math.round(cuerpo.duracionSeg)
      : null
  } catch {
    duracionSeg = null
  }

  // El uuid se genera acá y no lo pone la base porque la ruta tiene que
  // existir antes del insert.
  const videoId = crypto.randomUUID()
  const ruta = `${membresia.gym_id}/${videoId}.mp4`

  const almacen = clienteAlmacen()

  const { data: firma, error: errorFirma } = await almacen.storage
    .from(BUCKET).createSignedUploadUrl(ruta)

  if (errorFirma || !firma) {
    console.error('No se pudo firmar la subida', errorFirma)
    return responder('No pudimos preparar la subida', 502)
  }

  const { error } = await supabase.from('videos').insert({
    id: videoId,
    gym_id: membresia.gym_id,
    ruta,
    estado: 'procesando',
    duracion_seg: duracionSeg,
    subido_por: membresia.id,
  })

  if (error) {
    // Se firma primero y se inserta después, a propósito. Si el insert falla,
    // lo que queda huérfano es un token de subida que caduca solo y al que
    // ninguna fila apunta: invisible e inofensivo. Al revés, el huérfano
    // sería una fila en `procesando` que el panel muestra como video roto.
    console.error('No se pudo registrar el video', error)
    return responder('No pudimos registrar el video', 500)
  }

  return Response.json(
    { videoId, ruta, uploadUrl: firma.signedUrl, token: firma.token },
    { headers: CORS },
  )
})
