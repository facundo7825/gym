import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'
import { guardarCache, leerCache } from '@/lib/local/cola'

export interface Membresia {
  id: string
  gym_id: string
}

// Por usuario: si en el teléfono entra otra persona, no hereda las membresías
// de la anterior.
const clave = (userId: string) => `membresias:${userId}`

async function usuarioActual(): Promise<string | null> {
  // getSession y no getUser: lee el teléfono, no la red. Sin señal tiene que
  // andar igual.
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/**
 * Las membresías activas de quien tiene la sesión iniciada. Con señal se
 * consultan y se guardan; sin señal, lo último guardado.
 *
 * Filtra por user_id por la misma lección que tomar-rutina.ts: memberships_leer
 * deja ver todas las del propio gimnasio, no solo las propias.
 */
export async function misMembresias(): Promise<Membresia[]> {
  const userId = await usuarioActual()
  if (!userId) return []

  const respuesta = await conLimite(
    supabase
      .from('memberships')
      .select('id, gym_id')
      .eq('user_id', userId)
      .eq('estado', 'activo')
      .order('created_at'),
  )
  if (respuesta && !respuesta.error && respuesta.data) {
    await guardarCache(clave(userId), respuesta.data)
    return respuesta.data
  }
  return (await leerCache<Membresia[]>(clave(userId))) ?? []
}

/** Solo lo guardado, sin ir a la red. Para el aviso de estado, que se recalcula seguido. */
export async function membresiasGuardadas(): Promise<Membresia[]> {
  const userId = await usuarioActual()
  if (!userId) return []
  return (await leerCache<Membresia[]>(clave(userId))) ?? []
}

const claveTodas = (userId: string) => `membresias-todas:${userId}`

/**
 * Todas las membresías de quien tiene la sesión iniciada, activas o no. Es para
 * la cola: lo de una membresía dada de baja tiene que enviarse, que el servidor
 * lo rechace y que el aviso lo diga, en vez de quedar fuera de la lista y
 * desaparecer en silencio. Misma estrategia que misMembresias.
 */
export async function todasMisMembresias(): Promise<Membresia[]> {
  const userId = await usuarioActual()
  if (!userId) return []

  const respuesta = await conLimite(
    supabase
      .from('memberships')
      .select('id, gym_id')
      .eq('user_id', userId)
      .order('created_at'),
  )
  if (respuesta && !respuesta.error && respuesta.data) {
    await guardarCache(claveTodas(userId), respuesta.data)
    return respuesta.data
  }
  return (await leerCache<Membresia[]>(claveTodas(userId))) ?? []
}

/** Lo guardado de todasMisMembresias, sin ir a la red. */
export async function todasGuardadas(): Promise<Membresia[]> {
  const userId = await usuarioActual()
  if (!userId) return []
  return (await leerCache<Membresia[]>(claveTodas(userId))) ?? []
}

/**
 * Con qué membresía se registra una sesión. Con un gimnasio dado, la de ese
 * gimnasio o ninguna: con la de otro, el servidor la rechazaría, porque el día
 * de la rutina tiene que ser del mismo gimnasio que la sesión. Sin gimnasio
 * —entrenar libre sin tener rutina—, la primera.
 */
export async function membresiaPara(gymId: string | null): Promise<Membresia | null> {
  const todas = await misMembresias()
  return (gymId ? todas.find((m) => m.gym_id === gymId) : todas[0]) ?? null
}
