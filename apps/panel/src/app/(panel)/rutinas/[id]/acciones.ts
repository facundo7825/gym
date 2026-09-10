'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export type Resultado = { error?: string }

export async function agregarDia(rutinaId: string, nombre: string): Promise<Resultado> {
  if (!nombre.trim()) return { error: 'Poné un nombre al día' }

  const supabase = await crearClienteServidor()

  // El orden del nuevo va al final. Se lee el máximo actual en vez de contar
  // filas: si alguien borró un día del medio, contar daría un orden repetido.
  const { data: ultimo } = await supabase
    .from('rutina_dias').select('orden').eq('rutina_id', rutinaId)
    .order('orden', { ascending: false }).limit(1).maybeSingle()

  const { error } = await supabase.from('rutina_dias').insert({
    rutina_id: rutinaId,
    orden: (ultimo?.orden ?? 0) + 1,
    nombre: nombre.trim(),
  })
  if (error) return { error: 'No pudimos agregar el día' }

  revalidatePath(`/rutinas/${rutinaId}`)
  return {}
}

export async function borrarDia(diaId: string, rutinaId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('rutina_dias').delete().eq('id', diaId)
  if (error) return { error: 'No pudimos borrar el día' }

  revalidatePath(`/rutinas/${rutinaId}`)
  return {}
}

export async function agregarEjercicio(datos: {
  rutinaId: string
  diaId: string
  ejercicioId: string
  series: number
  repeticiones: string
  descansoSeg: number | null
}): Promise<Resultado> {
  if (datos.series < 1) return { error: 'Las series tienen que ser al menos 1' }
  if (!datos.repeticiones.trim()) return { error: 'Poné las repeticiones' }

  const supabase = await crearClienteServidor()

  const { data: ultimo } = await supabase
    .from('rutina_ejercicios').select('orden').eq('rutina_dia_id', datos.diaId)
    .order('orden', { ascending: false }).limit(1).maybeSingle()

  const { error } = await supabase.from('rutina_ejercicios').insert({
    rutina_dia_id: datos.diaId,
    ejercicio_id: datos.ejercicioId,
    orden: (ultimo?.orden ?? 0) + 1,
    series: datos.series,
    repeticiones: datos.repeticiones.trim(),
    descanso_seg: datos.descansoSeg,
  })
  if (error) return { error: 'No pudimos agregar el ejercicio' }

  revalidatePath(`/rutinas/${datos.rutinaId}`)
  return {}
}

export async function borrarEjercicio(id: string, rutinaId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('rutina_ejercicios').delete().eq('id', id)
  if (error) return { error: 'No pudimos borrar el ejercicio' }

  revalidatePath(`/rutinas/${rutinaId}`)
  return {}
}

export async function reordenarDias(rutinaId: string, ids: string[]): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('reordenar_dias', {
    p_rutina_id: rutinaId, p_ids: ids,
  })
  if (error) return { error: 'No pudimos guardar el orden' }

  revalidatePath(`/rutinas/${rutinaId}`)
  return {}
}

export async function reordenarEjercicios(
  diaId: string, rutinaId: string, ids: string[],
): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('reordenar_ejercicios', {
    p_dia_id: diaId, p_ids: ids,
  })
  if (error) return { error: 'No pudimos guardar el orden' }

  revalidatePath(`/rutinas/${rutinaId}`)
  return {}
}
