import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { CORS, responder } from './cors.ts'

export const BUCKET = 'videos'

/**
 * Contesta el preflight y rechaza lo que no sea un POST autenticado.
 * Devuelve null cuando la petición puede seguir.
 */
export function rechazoPrevio(peticion: Request): Response | null {
  if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (peticion.method !== 'POST') return responder('Método no permitido', 405)
  if (!peticion.headers.get('Authorization')) return responder('Falta autenticación', 401)
  return null
}

/**
 * Cliente con el token de quien llama: hereda sus permisos y su RLS. TODO lo
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
