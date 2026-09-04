import { CORS, responder } from '../_compartido/cors.ts'
import { BUCKET, clienteAlmacen, clienteUsuario, rechazoPrevio } from '../_compartido/peticion.ts'

// El diseño general pide una URL que "vence en minutos". Con videos de 60
// segundos como máximo, cinco alcanzan de sobra para reproducir, y es una
// hora menos de ventana útil si alguien copia la URL desde las herramientas
// de desarrollador.
const VIGENCIA_SEGUNDOS = 300

/**
 * Adentro del runtime, SUPABASE_URL es http://kong:8000 —el nombre interno
 * del contenedor—, así que la URL absoluta que arma createSignedUrl no la
 * puede resolver ni el navegador ni el teléfono. Devolvemos solo la ruta y
 * cada cliente la pega a su propia URL de Supabase.
 */
function soloRuta(url: string): string {
  if (!url.startsWith('http')) return url.startsWith('/') ? url : `/${url}`
  const partes = new URL(url)
  return partes.pathname + partes.search
}

Deno.serve(async (peticion) => {
  const rechazo = rechazoPrevio(peticion)
  if (rechazo) return rechazo
  const autorizacion = peticion.headers.get('Authorization')!
  const supabase = clienteUsuario(autorizacion)

  let videoId: string | undefined
  try {
    videoId = (await peticion.json())?.videoId
  } catch {
    videoId = undefined
  }
  if (!videoId) return responder('Falta videoId', 400)

  // Acá está toda la seguridad de esta función, y es una sola línea: RLS solo
  // devuelve el video si quien pregunta pertenece a ese gimnasio, o si el
  // video es del catálogo global.
  const { data: video, error: errorSelect } = await supabase
    .from('videos').select('ruta, estado').eq('id', videoId).maybeSingle()

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
  if (video.estado !== 'listo') {
    return responder('El video todavía no está disponible', 409)
  }

  const almacen = clienteAlmacen()

  const { data: firma, error } = await almacen.storage
    .from(BUCKET).createSignedUrl(video.ruta, VIGENCIA_SEGUNDOS)

  if (error || !firma) {
    console.error('No se pudo firmar la reproducción', error)
    return responder('No pudimos preparar la reproducción', 502)
  }

  return Response.json(
    { rutaFirmada: soloRuta(firma.signedUrl), expiraEn: VIGENCIA_SEGUNDOS },
    { headers: CORS },
  )
})
