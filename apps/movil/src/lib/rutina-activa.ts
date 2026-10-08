import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'
import { guardarCache, leerCache } from '@/lib/local/cola'
import { misMembresias } from '@/lib/membresia'

export interface EjercicioDelDia {
  id: string
  orden: number
  series: number
  repeticiones: string
  descanso_seg: number | null
  peso_sugerido_kg: number | null
  ejercicios: { id: string; nombre: string; video_id: string | null } | null
}

export interface DiaDeRutina {
  id: string
  orden: number
  nombre: string
  rutina_ejercicios: EjercicioDelDia[]
}

export interface RutinaActiva {
  id: string
  gym_id: string
  nombre: string
  fecha_inicio: string | null
  created_at: string
  rutina_dias: DiaDeRutina[]
}

// Envuelta en un objeto para distinguir "no tiene rutina" (guardado: null) de
// "nunca se guardó nada" (no hay fila).
interface Guardado { rutina: RutinaActiva | null }

const clave = (userId: string) => `rutina-activa:${userId}`

async function usuarioActual(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/**
 * La rutina que muestra Hoy. Con señal se consulta y se guarda en el teléfono
 * como un documento entero —es una caché que se lee entera para mostrar el
 * día, no un espejo de las tres tablas—; sin señal, la última guardada, y
 * `guardada` lo avisa.
 *
 * `null` = no se pudo consultar y no hay nada guardado.
 */
export async function cargarRutinaActiva(): Promise<{ rutina: RutinaActiva | null; guardada: boolean } | null> {
  const userId = await usuarioActual()
  if (!userId) return null

  const membresias = (await misMembresias()).map((m) => m.id)
  // Filtra por propietario y no se apoya solo en la RLS: un entrenador que
  // entrena con la app ve las rutinas activas de todos sus socios.
  const respuesta = membresias.length
    ? await conLimite(
        supabase
          .from('rutinas')
          .select(`
            id, gym_id, nombre, fecha_inicio, created_at,
            rutina_dias (
              id, orden, nombre,
              rutina_ejercicios (
                id, orden, series, repeticiones, descanso_seg, peso_sugerido_kg,
                ejercicios ( id, nombre, video_id )
              )
            )
          `)
          .eq('tipo', 'activa')
          .eq('estado', 'activa')
          .in('propietario_id', membresias),
      )
    : null

  if (respuesta && !respuesta.error) {
    // fecha_inicio es opcional —el armador no obliga a completarla—, así que
    // se cae a created_at cuando falta. Es el criterio de la etapa 2.
    const activas = [...((respuesta.data ?? []) as RutinaActiva[])].sort((a, b) =>
      (b.fecha_inicio ?? b.created_at).localeCompare(a.fecha_inicio ?? a.created_at))
    const rutina = activas[0] ?? null
    await guardarCache(clave(userId), { rutina } satisfies Guardado)
    return { rutina, guardada: false }
  }

  const guardado = await leerCache<Guardado>(clave(userId))
  return guardado ? { rutina: guardado.rutina, guardada: true } : null
}

/** Solo lo guardado, sin ir a la red. Lo usa la pantalla de sesión, que tiene que abrir sin señal. */
export async function rutinaGuardada(): Promise<RutinaActiva | null> {
  const userId = await usuarioActual()
  if (!userId) return null
  return (await leerCache<Guardado>(clave(userId)))?.rutina ?? null
}
