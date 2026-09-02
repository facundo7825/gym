'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export type EstadoFormulario = { error?: string }

// La firma con estado previo es la que pide useActionState. Una Server Action
// pasada directo a <form action> tiene que devolver void, y entonces el
// { error } no llegaría nunca a la pantalla.
export async function crearMaquina(
  _estadoPrevio: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const nombre = String(datos.get('nombre') ?? '').trim()
  const marca = String(datos.get('marca') ?? '').trim()
  const cantidad = Number(datos.get('cantidad') ?? 1)

  if (!nombre) return { error: 'El nombre es obligatorio' }
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return { error: 'La cantidad tiene que ser un número entero mayor a cero' }
  }

  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión vencida' }

  // limit(1) y no single(): una persona puede pertenecer a varios gimnasios.
  const { data: membresia } = await supabase
    .from('memberships').select('gym_id').eq('user_id', user.id)
    .order('created_at').limit(1).maybeSingle()
  if (!membresia) return { error: 'No estás asociado a ningún gimnasio' }

  // Si el rol no alcanza, RLS rechaza el insert. No hace falta chequearlo
  // acá además: la base es la autoridad.
  const { error } = await supabase.from('maquinas').insert({
    gym_id: membresia.gym_id,
    nombre,
    marca: marca || null,
    cantidad,
  })

  if (error) return { error: 'No pudimos guardar la máquina' }

  revalidatePath('/maquinas')
  return {}
}
