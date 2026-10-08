/**
 * La cola de sincronización, sin I/O. La app guarda las filas en SQLite y
 * habla con Supabase; todo lo que DECIDE —qué se manda, en qué orden, qué
 * significa cada respuesta, qué se le muestra al socio— está acá, porque es lo
 * más frágil de la etapa y acá se puede probar sin un teléfono.
 *
 * Por qué alcanza con una cola y no hace falta resolver conflictos: un solo
 * dispositivo escribe una sesión dada, y las series se agregan y nunca se
 * editan. Ver la sección 2 del diseño de la etapa 3.
 */

export type EstadoEnvio = 'pendiente' | 'enviada' | 'rechazada'

/**
 * El cierre de la sesión viaja aparte de la sesión: es el único update de la
 * cola. `abierta` = todavía no se tocó Terminar.
 */
export type EstadoFin = 'abierta' | 'pendiente' | 'enviado' | 'rechazado'

export interface SesionEnCola {
  id_local: string
  membership_id: string
  gym_id: string
  rutina_dia_id: string | null
  inicio: string
  fin: string | null
  notas: string | null
  estado: EstadoEnvio
  /** El id que le dio el servidor. Hace falta para colgarle las series y para escribir el fin. */
  servidor_id: string | null
  estado_fin: EstadoFin
}

export interface SerieEnCola {
  id_local: string
  sesion_id_local: string
  ejercicio_id: string
  numero_serie: number
  peso_kg: number
  repeticiones: number
  estado: EstadoEnvio
}

export type Operacion =
  | { tipo: 'sesion'; sesion: SesionEnCola }
  | { tipo: 'serie'; serie: SerieEnCola; sesion_servidor_id: string }
  | { tipo: 'fin'; sesion: SesionEnCola; servidor_id: string; fin: string }

export type Clasificacion = 'exito' | 'duplicado' | 'transitorio' | 'permanente'

const propias = (sesiones: SesionEnCola[], membresias: string[]) =>
  sesiones.filter((s) => membresias.includes(s.membership_id))

/**
 * Lo que se puede mandar AHORA. Una sesión, sus series y su fin no salen en la
 * misma tanda: las series necesitan el id que el servidor le da a la sesión, y
 * el fin va después de la última serie. La app llama de nuevo después de cada
 * tanda hasta que no quede nada o falle algo transitorio.
 *
 * `membresias` son las de quien tiene la sesión iniciada: lo de otra persona
 * que haya quedado en el teléfono no sale con esta cuenta.
 */
export function siguientesOperaciones(
  sesiones: SesionEnCola[],
  series: SerieEnCola[],
  membresias: string[],
): Operacion[] {
  const mias = propias(sesiones, membresias)
  const porIdLocal = new Map(mias.map((s) => [s.id_local, s]))
  const operaciones: Operacion[] = []

  for (const s of mias) {
    if (s.estado === 'pendiente') operaciones.push({ tipo: 'sesion', sesion: s })
  }

  for (const r of series) {
    if (r.estado !== 'pendiente') continue
    const suya = porIdLocal.get(r.sesion_id_local)
    // Sin sesión enviada no hay a qué colgarla. Si la sesión fue rechazada,
    // la serie queda frenada para siempre: resumenCola la cuenta como
    // rechazada.
    if (suya?.estado === 'enviada' && suya.servidor_id) {
      operaciones.push({ tipo: 'serie', serie: r, sesion_servidor_id: suya.servidor_id })
    }
  }

  for (const s of mias) {
    if (s.estado !== 'enviada' || !s.servidor_id || !s.fin || s.estado_fin !== 'pendiente') continue
    const quedanSeries = series.some((r) => r.sesion_id_local === s.id_local && r.estado === 'pendiente')
    if (!quedanSeries) {
      operaciones.push({ tipo: 'fin', sesion: s, servidor_id: s.servidor_id, fin: s.fin })
    }
  }

  return operaciones
}

/**
 * Qué significa la respuesta del servidor para la fila.
 *
 * - `23505`: chocó contra el índice único de `id_local`. Un envío anterior sí
 *   había llegado y la respuesta se perdió: es éxito.
 * - Clases `22` (dato inválido), `23` (integridad: clave foránea, check) y `42`
 *   (permisos, RLS): permanentes. Reintentar no los arregla; el ejemplo típico
 *   es una membresía dada de baja mientras el socio entrenaba sin señal.
 * - Todo lo demás —sin red (supabase-js devuelve `code` vacío), timeout, 5xx,
 *   JWT vencido—: transitorio.
 */
export function clasificarRespuesta(error: { code?: string | null } | null): Clasificacion {
  if (!error) return 'exito'
  const codigo = error.code ?? ''
  if (codigo === '23505') return 'duplicado'
  if (/^(22|23|42)/.test(codigo)) return 'permanente'
  return 'transitorio'
}

/** `null` = la fila no cambia y el intento siguiente la vuelve a llevar. */
export function estadoTras(c: Clasificacion): EstadoEnvio | null {
  if (c === 'exito' || c === 'duplicado') return 'enviada'
  if (c === 'permanente') return 'rechazada'
  return null
}

export function estadoFinTras(c: Clasificacion): EstadoFin | null {
  if (c === 'exito' || c === 'duplicado') return 'enviado'
  if (c === 'permanente') return 'rechazado'
  return null
}

export interface ResumenCola {
  seriesPendientes: number
  /** Sesiones o cierres pendientes. Solo se mencionan si no hay series pendientes. */
  otrasPendientes: number
  /** Series rechazadas, más las frenadas por una sesión rechazada. */
  rechazadas: number
}

export function resumenCola(
  sesiones: SesionEnCola[],
  series: SerieEnCola[],
  membresias: string[],
): ResumenCola {
  const mias = propias(sesiones, membresias)
  const porIdLocal = new Map(mias.map((s) => [s.id_local, s]))
  const resumen: ResumenCola = { seriesPendientes: 0, otrasPendientes: 0, rechazadas: 0 }

  for (const r of series) {
    const suya = porIdLocal.get(r.sesion_id_local)
    if (!suya) continue
    if (r.estado === 'rechazada' || suya.estado === 'rechazada') resumen.rechazadas++
    else if (r.estado === 'pendiente') resumen.seriesPendientes++
  }

  // Un cierre rechazado no se cuenta: solo pasa si la membresía se dio de baja,
  // y en ese caso lo que el socio necesita saber ya lo dicen sus series.
  resumen.otrasPendientes = mias.filter((s) =>
    s.estado === 'pendiente' || (s.estado === 'enviada' && s.estado_fin === 'pendiente'),
  ).length

  return resumen
}

/** El aviso siempre visible. `null` cuando todo está al día. */
export function textoEstadoCola(r: ResumenCola): string | null {
  const partes: string[] = []

  if (r.rechazadas === 1) partes.push('1 serie no se pudo guardar')
  else if (r.rechazadas > 1) partes.push(`${r.rechazadas} series no se pudieron guardar`)

  if (r.seriesPendientes === 1) partes.push('1 serie sin sincronizar')
  else if (r.seriesPendientes > 1) partes.push(`${r.seriesPendientes} series sin sincronizar`)
  else if (r.otrasPendientes > 0) partes.push('Falta sincronizar el entrenamiento')

  return partes.length ? partes.join(' · ') : null
}

/**
 * Las sesiones que ya están enteras en el servidor y se pueden sacar del
 * teléfono. Lo rechazado se queda: nunca se borra solo.
 */
export function sesionesLimpiables(sesiones: SesionEnCola[], series: SerieEnCola[]): string[] {
  return sesiones
    .filter((s) => s.estado === 'enviada' && s.estado_fin === 'enviado')
    .filter((s) => series
      .filter((r) => r.sesion_id_local === s.id_local)
      .every((r) => r.estado === 'enviada'))
    .map((s) => s.id_local)
}

/** La sesión que quedó sin terminar —la app se cerró, o el socio salió sin tocar Terminar—. */
export function sesionAbierta(sesiones: SesionEnCola[], membresias: string[]): SesionEnCola | null {
  const abiertas = propias(sesiones, membresias)
    .filter((s) => s.fin === null)
    .sort((a, b) => b.inicio.localeCompare(a.inicio))
  return abiertas[0] ?? null
}
