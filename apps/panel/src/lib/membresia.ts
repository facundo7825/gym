import { cache } from 'react'
import type { Rol } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export interface MiMembresia {
  id: string
  gym_id: string
  rol: Rol
  /** gyms.zona_horaria: "hoy" es la fecha del gimnasio, no la del servidor. */
  zona: string
}

/**
 * La membresía activa de quien usa el panel, con su rol y la zona del
 * gimnasio. cache(): la página y sus partes la piden en el mismo render y va
 * una sola consulta.
 *
 * limit(1) y no single(): una persona puede pertenecer a varios gimnasios. Se
 * usa la más antigua, igual que el layout; el selector de gimnasio llega en
 * una etapa posterior.
 */
export const miMembresia = cache(async (): Promise<MiMembresia | null> => {
  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('memberships')
    .select('id, gym_id, rol, gyms ( zona_horaria )')
    .eq('user_id', user.id)
    .eq('estado', 'activo')
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (!data) return null

  return {
    id: data.id,
    gym_id: data.gym_id,
    rol: data.rol,
    zona: data.gyms?.zona_horaria ?? 'America/Argentina/Buenos_Aires',
  }
})
