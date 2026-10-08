import type { SerieHecha } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'

/**
 * "La vez pasada" de cada ejercicio, en una sola llamada. `null` = sin señal: la
 * pantalla precarga entonces con lo que dice la rutina. Es la limitación
 * aceptada de la sección 2 del diseño de la etapa 3.
 */
export async function vezPasada(ejercicioIds: string[]): Promise<Map<string, SerieHecha[]> | null> {
  if (ejercicioIds.length === 0) return new Map()

  const respuesta = await conLimite(supabase.rpc('ultima_vez', { p_ejercicio_ids: ejercicioIds }))
  if (!respuesta || respuesta.error || !respuesta.data) return null

  const porEjercicio = new Map<string, SerieHecha[]>()
  for (const f of respuesta.data) {
    const lista = porEjercicio.get(f.ejercicio_id) ?? []
    lista.push({ peso_kg: Number(f.peso_kg), repeticiones: f.repeticiones })
    porEjercicio.set(f.ejercicio_id, lista)
  }
  return porEjercicio
}
