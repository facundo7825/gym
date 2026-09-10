'use server'

import { revalidatePath } from 'next/cache'
import { NIVELES_RUTINA, OBJETIVOS_RUTINA, validarBorrador } from '@gym/core'
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

export async function asignar(
  plantillaId: string,
  propietarioId: string,
): Promise<EstadoFormulario> {
  const supabase = await crearClienteServidor()

  // Es el único lugar donde validarBorrador tiene algo que decir: el editor
  // de la tarea 8 persiste cada día y cada ejercicio en el momento, así que
  // nunca hay un borrador en memoria que validar. Acá sí: asignarle a un
  // socio una plantilla vacía o con un día sin ejercicios le deja en el
  // teléfono una rutina que no se puede entrenar.
  const { data: plantilla } = await supabase
    .from('rutinas')
    .select(`
      nombre,
      rutina_dias (
        nombre,
        rutina_ejercicios ( ejercicio_id, series, repeticiones )
      )
    `)
    .eq('id', plantillaId)
    .maybeSingle()

  if (!plantilla) return { error: 'No encontramos esa rutina' }

  const errores = validarBorrador({
    nombre: plantilla.nombre,
    dias: plantilla.rutina_dias.map((d) => ({
      nombre: d.nombre,
      ejercicios: d.rutina_ejercicios.map((e) => ({
        ejercicio_id: e.ejercicio_id,
        series: e.series,
        repeticiones: e.repeticiones,
      })),
    })),
  })
  // Todos, no solo el primero: validarBorrador los junta a propósito, y
  // arreglar de a uno obliga a reintentar la asignación tantas veces como
  // problemas tenga la plantilla.
  if (errores.length > 0) return { error: errores.join(' · ') }

  const { error } = await supabase.rpc('tomar_rutina', {
    p_plantilla_id: plantillaId,
    p_propietario_id: propietarioId,
  })

  // 23505 = unique_violation: el socio ya tiene una copia activa de esta
  // plantilla. No es un error del sistema, así que se dice qué pasó.
  if (error?.code === '23505') {
    return { error: 'Ese socio ya tiene esta rutina' }
  }
  if (error) return { error: 'No pudimos asignar la rutina' }

  revalidatePath('/socios')
  return {}
}
