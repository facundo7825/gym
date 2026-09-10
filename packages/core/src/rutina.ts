/**
 * Vive acá y no dentro de las pantallas por el mismo motivo que
 * filtrarEjercicios: en un componente de React Native esta lógica solo se
 * verifica a mano, tocando la app. Y la comparten el panel y la app.
 */

export interface EjercicioBorrador {
  ejercicio_id: string
  series: number
  repeticiones: string
}

export interface DiaBorrador {
  nombre: string
  ejercicios: EjercicioBorrador[]
}

export interface RutinaBorrador {
  nombre: string
  dias: DiaBorrador[]
}

/**
 * Devuelve todos los motivos por los que la rutina no se puede guardar, listos
 * para mostrar. Vacío si está bien.
 *
 * Junta todos y no corta en el primero: que el socio arregle una cosa, toque
 * guardar y le aparezca la siguiente es peor que ver las tres juntas.
 */
export function validarBorrador(borrador: RutinaBorrador): string[] {
  const errores: string[] = []

  if (!borrador.nombre.trim()) errores.push('Poné un nombre a la rutina')
  if (borrador.dias.length === 0) errores.push('Agregá al menos un día')

  for (const dia of borrador.dias) {
    const nombre = dia.nombre.trim() || 'Un día sin nombre'

    if (dia.ejercicios.length === 0) {
      errores.push(`"${nombre}" no tiene ejercicios`)
      continue
    }

    if (dia.ejercicios.some((e) => e.series < 1)) {
      errores.push(`"${nombre}": las series tienen que ser al menos 1`)
    }
    if (dia.ejercicios.some((e) => !e.repeticiones.trim())) {
      errores.push(`"${nombre}": poné las repeticiones`)
    }
  }

  return errores
}

export interface DiaOrdenable {
  id: string
  orden: number
}

/**
 * Cuál de los días abre la pestaña Hoy.
 *
 * En la etapa 2 no hay historial de entrenamiento del cual deducir qué toca
 * —`sesiones` llega con la etapa 3—, así que el día lo elige el socio y el
 * teléfono recuerda el último que abrió. Esta función es la que la etapa 3 va a
 * reemplazar por dentro: está aislada para que ese cambio sea de una función y
 * no de una pantalla.
 */
export function diaAMostrar<T extends DiaOrdenable>(
  dias: T[],
  ultimoDiaAbiertoId: string | null,
): T | null {
  if (dias.length === 0) return null

  const recordado = ultimoDiaAbiertoId
    ? dias.find((d) => d.id === ultimoDiaAbiertoId)
    : undefined

  // El recordado puede haber sido borrado desde el panel o desde otro
  // teléfono, así que no alcanza con que el id esté guardado.
  return recordado ?? [...dias].sort((a, b) => a.orden - b.orden)[0]
}
