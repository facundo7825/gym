'use server'

import { revalidatePath } from 'next/cache'
import { NIVELES_RUTINA, OBJETIVOS_RUTINA } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export type EstadoFormulario = { error?: string }

async function miMembresia() {
  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // limit(1) y no single(): una persona puede pertenecer a varios gimnasios.
  const { data } = await supabase
    .from('memberships').select('id, gym_id').eq('user_id', user.id)
    .order('created_at').limit(1).maybeSingle()
  return data
}

export async function crearPlantilla(
  _estadoPrevio: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const nombre = String(datos.get('nombre') ?? '').trim()
  const descripcion = String(datos.get('descripcion') ?? '').trim()
  const objetivo = String(datos.get('objetivo') ?? '')
  const nivel = String(datos.get('nivel') ?? '')

  if (!nombre) return { error: 'El nombre es obligatorio' }
  if (!OBJETIVOS_RUTINA.includes(objetivo as never)) return { error: 'Elegí un objetivo' }
  if (!NIVELES_RUTINA.includes(nivel as never)) return { error: 'Elegí un nivel' }

  const membresia = await miMembresia()
  if (!membresia) return { error: 'Sesión vencida' }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('rutinas').insert({
    gym_id: membresia.gym_id,
    nombre,
    descripcion: descripcion || null,
    objetivo: objetivo as never,
    nivel: nivel as never,
    tipo: 'plantilla',
    creado_por: membresia.id,
  })

  // rutinas_crear ya rechaza al socio que intente crear una plantilla: acá no
  // se vuelve a chequear el rol para no tener la regla escrita en dos lados.
  if (error) return { error: 'No pudimos guardar la rutina' }

  revalidatePath('/rutinas')
  return {}
}

export async function duplicar(id: string): Promise<EstadoFormulario> {
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('duplicar_plantilla', { p_rutina_id: id })
  if (error) return { error: 'No pudimos duplicar la rutina' }

  revalidatePath('/rutinas')
  return {}
}

export async function archivar(id: string): Promise<EstadoFormulario> {
  const supabase = await crearClienteServidor()
  const { error } = await supabase
    .from('rutinas').update({ estado: 'archivada' }).eq('id', id)
  if (error) return { error: 'No pudimos archivar la rutina' }

  revalidatePath('/rutinas')
  return {}
}
