/**
 * Lógica del registro serie por serie. Vive acá y no en la pantalla de sesión
 * por el mismo motivo que validarBorrador: en un componente de React Native
 * solo se verificaría a mano. Y es la que decide si una serie es récord sin
 * señal, que es lo único de Progreso que funciona en un subsuelo.
 */

export interface SerieHecha {
  peso_kg: number
  repeticiones: number
}

/** Por ejercicio. Es lo que el teléfono cachea y lo que devuelve la vista `mejores_marcas`. */
export interface MejorMarca {
  mejor_peso_kg: number
  /** De UNA sesión, no el total histórico. */
  mejor_volumen_kg: number
}

/** La clave es el `ejercicio_id`. */
export type Marcas = Record<string, MejorMarca>

export type TipoRecord = 'peso' | 'volumen'

/** El máximo que entra en `numeric(6,2)`. Lo que pase de acá la base lo rechaza. */
export const PESO_MAXIMO_KG = 9999.99

/** Lee lo que escribió el socio. Acepta la coma decimal; un campo vacío da `NaN`, no cero. */
export function aNumero(texto: string): number {
  const limpio = texto.trim().replace(',', '.')
  return limpio === '' ? NaN : Number(limpio)
}

/**
 * El motivo por el que la serie no se puede registrar, listo para mostrar, o
 * `null` si está bien. Frena antes lo que el `check` de la base frenaría
 * después: un rechazo de la base es permanente y la serie quedaría marcada
 * como "no se pudo guardar".
 */
export function validarSerie(serie: SerieHecha): string | null {
  if (Number.isNaN(serie.peso_kg)) return 'Poné el peso'
  if (serie.peso_kg < 0) return 'El peso no puede ser negativo'
  if (!Number.isFinite(serie.peso_kg) || serie.peso_kg > PESO_MAXIMO_KG) {
    return 'Ese peso no parece real'
  }
  if (!Number.isInteger(serie.repeticiones) || serie.repeticiones < 1) {
    return 'Las repeticiones tienen que ser al menos 1'
  }
  return null
}

/**
 * Las repeticiones a precargar a partir de lo que dice la rutina, que es texto
 * libre: de "8-12" toma 8, de "al fallo" nada.
 */
export function repsSugeridas(prescripcion: string): number | null {
  const encontrado = prescripcion.match(/\d+/)
  if (!encontrado) return null
  const n = Number(encontrado[0])
  return n > 0 ? n : null
}

/** Peso por repeticiones, sumado. Redondeado a centavos para no arrastrar errores de coma flotante. */
export function volumen(series: SerieHecha[]): number {
  const total = series.reduce((suma, s) => suma + s.peso_kg * s.repeticiones, 0)
  return Math.round(total * 100) / 100
}

/**
 * Si la serie nueva es récord, y de qué.
 *
 * `previa` es la marca de ANTES de esta sesión —la pantalla la lee al empezar
 * y no la toca hasta terminar—. `anteriores` son las series de este ejercicio
 * ya registradas en esta sesión.
 *
 * - Sin marca previa no hay récord: la primera vez que se hace un ejercicio no
 *   hay contra qué comparar, y avisarlo en cada ejercicio nuevo sería ruido.
 * - El de peso compara contra la marca y contra lo ya hecho hoy, para no
 *   volver a avisar un récord que se batió dos series antes.
 * - El de volumen mira lo acumulado del ejercicio en la sesión y se avisa en la
 *   serie que cruza la marca: una sola vez, porque la siguiente ya parte de
 *   arriba.
 * - Si una serie bate los dos, gana el de peso, que se entiende sin explicación.
 */
export function detectarRecord(
  previa: MejorMarca | undefined,
  anteriores: SerieHecha[],
  nueva: SerieHecha,
): TipoRecord | null {
  if (!previa) return null

  const pesoDeReferencia = Math.max(previa.mejor_peso_kg, ...anteriores.map((s) => s.peso_kg))
  if (nueva.peso_kg > pesoDeReferencia) return 'peso'

  const antes = volumen(anteriores)
  const despues = volumen([...anteriores, nueva])
  if (antes <= previa.mejor_volumen_kg && despues > previa.mejor_volumen_kg) return 'volumen'

  return null
}

/** Lo que una sesión aporta a las marcas de un ejercicio. */
export function marcaDeSesion(series: SerieHecha[]): MejorMarca | null {
  if (series.length === 0) return null
  return {
    mejor_peso_kg: Math.max(...series.map((s) => s.peso_kg)),
    mejor_volumen_kg: volumen(series),
  }
}

/**
 * Junta dos fuentes de marcas quedándose con el máximo de cada campo. Se usa
 * al refrescar desde el servidor: reemplazar borraría un récord hecho sin señal
 * que todavía está en la cola.
 */
export function fusionarMarcas(a: Marcas, b: Marcas): Marcas {
  const resultado: Marcas = { ...a }
  for (const [ejercicioId, marca] of Object.entries(b)) {
    const actual = resultado[ejercicioId]
    resultado[ejercicioId] = actual
      ? {
          mejor_peso_kg: Math.max(actual.mejor_peso_kg, marca.mejor_peso_kg),
          mejor_volumen_kg: Math.max(actual.mejor_volumen_kg, marca.mejor_volumen_kg),
        }
      : marca
  }
  return resultado
}

/**
 * "57,5" y no "57.5". A mano y no con toLocaleString: el soporte de Intl en
 * Hermes depende de cómo se compiló la app.
 */
export function formatearKg(kg: number): string {
  return String(Math.round(kg * 100) / 100).replace('.', ',')
}

/**
 * "60kg × 10, 10, 9, 8" si todas tienen el mismo peso; "60kg × 10, 57,5kg × 9"
 * si no. Lo usan "la vez pasada" y el detalle de una sesión del historial.
 */
export function detalleSeries(series: SerieHecha[]): string {
  const primera = series[0]
  if (!primera) return ''

  const mismoPeso = series.every((s) => s.peso_kg === primera.peso_kg)
  return mismoPeso
    ? `${formatearKg(primera.peso_kg)}kg × ${series.map((s) => s.repeticiones).join(', ')}`
    : series.map((s) => `${formatearKg(s.peso_kg)}kg × ${s.repeticiones}`).join(', ')
}

/** "La vez pasada: 60kg × 10, 10, 9, 8". */
export function textoVezPasada(series: SerieHecha[]): string | null {
  return series.length ? `La vez pasada: ${detalleSeries(series)}` : null
}

/** Lo que la rutina dice de un ejercicio, tal como viene de `rutina_ejercicios`. */
export interface Prescripcion {
  series: number
  /** Texto libre: "8-12", "10", "al fallo". */
  repeticiones: string
  peso_sugerido_kg: number | null
}

/** Una fila de la pantalla de sesión. `null` = el campo arranca vacío. */
export interface FilaPrecargada {
  peso_kg: number | null
  repeticiones: number | null
  registrada: boolean
}

/**
 * Las filas con las que arranca un ejercicio en la pantalla de sesión. Es lo
 * que hace que repetir lo de la vez pasada cueste cuatro toques: abrir el
 * ejercicio y tildar tres series.
 *
 * - Con señal manda la vez pasada: es lo que el socio hizo, no lo que alguien
 *   le prescribió. Si la rutina pide más series, se repite la última.
 * - Sin señal (`vezPasada` nulo), lo que dice la rutina: la cantidad de series,
 *   el primer número del rango y el peso sugerido.
 * - Las ya registradas —al retomar una sesión abierta— ocupan las primeras
 *   filas.
 * - Entrenando libre y sin historial, una fila vacía para empezar.
 */
export function filasPrecargadas(datos: {
  prescripcion: Prescripcion | null
  vezPasada: SerieHecha[] | null
  hechas: SerieHecha[]
}): FilaPrecargada[] {
  const pasada = datos.vezPasada ?? []
  const p = datos.prescripcion
  const cantidad = Math.max(p?.series ?? 0, pasada.length, 1)

  const sugeridas: FilaPrecargada[] = []
  for (let i = 0; i < cantidad; i++) {
    const dePasada = pasada[i] ?? pasada[pasada.length - 1]
    sugeridas.push(dePasada
      ? { peso_kg: dePasada.peso_kg, repeticiones: dePasada.repeticiones, registrada: false }
      : {
          peso_kg: p?.peso_sugerido_kg ?? null,
          repeticiones: p ? repsSugeridas(p.repeticiones) : null,
          registrada: false,
        })
  }

  const hechas = datos.hechas.map((h) => ({
    peso_kg: h.peso_kg, repeticiones: h.repeticiones, registrada: true,
  }))
  return [...hechas, ...sugeridas.slice(hechas.length)]
}
