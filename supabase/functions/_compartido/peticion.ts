import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2'
import { CORS, responder } from './cors.ts'

export const BUCKET = 'videos'

/**
 * Contesta el preflight y rechaza lo que no sea un POST con el header
 * Authorization presente. Devuelve null cuando la petición puede seguir.
 *
 * Ojo: esto NO autentica a nadie, solo verifica que el header exista. La
 * anon key es en sí misma un JWT válido, así que "Authorization: Bearer
 * <anon key>" pasa este chequeo igual que el token de un usuario real y
 * corre como el rol `anon`. Quien necesite saber quién llama tiene que
 * seguir con usuarioAutenticado() de acá abajo.
 */
export function rechazoPrevio(peticion: Request): Response | null {
  if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (peticion.method !== 'POST') return responder('Método no permitido', 405)
  if (!peticion.headers.get('Authorization')) return responder('Falta autenticación', 401)
  return null
}

/**
 * Devuelve el usuario autenticado, o la Response de 401 que hay que
 * devolver si no lo hay. Las tres funciones de video llaman a esto antes de
 * tocar la tabla `videos`, así la regla vive en un solo lugar.
 *
 * Por qué hace falta además de rechazoPrevio: la anon key viaja en el
 * bundle de la app, así que cualquiera puede mandar
 * "Authorization: Bearer <anon key>" y esa petición SÍ tiene el header, con
 * lo cual rechazoPrevio la deja pasar. Sin este chequeo, esa petición
 * seguiría hasta el select sobre `videos` corriendo como el rol `anon` — y
 * la política `videos_leer` de 0004_rls_ejercicios.sql permite
 * `gym_id is null` sin cláusula `TO`, o sea también a `anon`. Resultado:
 * cualquiera con la anon key podría pedir la URL firmada de cualquier video
 * del catálogo global que esté en `listo`. getUser() es lo único que
 * distingue "hay un Bearer" de "hay alguien atrás de ese Bearer".
 */
export async function usuarioAutenticado(supabase: SupabaseClient): Promise<User | Response> {
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? responder('Sesión inválida', 401)
}

/**
 * Cliente con el token de quien llama: hereda sus permisos y su RLS. Todo lo
 * que toque la tabla `videos` va por acá, nunca por el de abajo, para que
 * `videos_leer`, `videos_crear` y `videos_editar` sigan siendo lo que impide
 * alcanzar el gimnasio ajeno.
 */
export function clienteUsuario(autorizacion: string): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: autorizacion } } },
  )
}

/**
 * Cliente que saltea RLS. Existe por una sola razón: el bucket no tiene
 * políticas, así que firmar y listar exige saltearla. Es una capacidad, no
 * una autorización — para cuando se lo usa, el cliente de arriba ya decidió
 * si quien llama tiene derecho.
 */
export function clienteAlmacen(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}
