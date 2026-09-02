'use server'

import { revalidatePath } from 'next/cache'
import { EQUIPAMIENTOS, GRUPOS_MUSCULARES } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export type EstadoFormulario = { error?: string }

// Estado previo adelante: es la firma que pide useActionState. Ver la nota en
// maquinas/acciones.ts sobre por qué no puede ir directo en <form action>.
export async function crearEjercicio(
  _estadoPrevio: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const nombre = String(datos.get('nombre') ?? '').trim()
  const grupo = String(datos.get('grupo_muscular') ?? '')
  const equipamiento = String(datos.get('equipamiento') ?? '')
  const descripcion = String(datos.get('descripcion') ?? '').trim()
  const maquinaId = String(datos.get('maquina_id') ?? '')

  if (!nombre) return { error: 'El nombre es obligatorio' }
  if (!GRUPOS_MUSCULARES.includes(grupo as never)) {
    return { error: 'Elegí un grupo muscular' }
  }
  if (!EQUIPAMIENTOS.includes(equipamiento as never)) {
    return { error: 'Elegí un tipo de equipamiento' }
  }

  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión vencida' }

  // limit(1) y no single(): una persona puede pertenecer a varios gimnasios.
  const { data: membresia } = await supabase
    .from('memberships').select('id, gym_id').eq('user_id', user.id)
    .order('created_at').limit(1).maybeSingle()
  if (!membresia) return { error: 'No estás asociado a ningún gimnasio' }

  // maquina_id no se valida acá contra el gimnasio: la clave foránea compuesta
  // (maquina_id, gym_id) de 0003_ejercicios.sql rechaza una máquina ajena
  // aunque alguien manipule el formulario.
  const { error } = await supabase.from('ejercicios').insert({
    gym_id: membresia.gym_id,
    nombre,
    descripcion: descripcion || null,
    grupo_muscular: grupo as never,
    equipamiento: equipamiento as never,
    maquina_id: maquinaId || null,
    creado_por: membresia.id,
  })

  if (error) return { error: 'No pudimos guardar el ejercicio' }

  revalidatePath('/ejercicios')
  return {}
}
