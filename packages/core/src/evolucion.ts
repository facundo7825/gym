import { volumen } from './registro'

/**
 * La evolución de un ejercicio: de las filas de la base a los puntos del
 * gráfico, y de los puntos a coordenadas. El componente de la app solo
 * traduce la geometría a react-native-svg; todo lo que puede salir mal —una
 * escala que divide por cero, un récord marcado distinto que el aviso— está
 * acá y tiene test. Ver la sección 4 del diseño de la etapa 3.
 */

export interface FilaSerie {
  sesion_id: string
  /** El inicio de la sesión: es la fecha del punto. */
  inicio: string
  peso_kg: number
  repeticiones: number
  completada: boolean
}

export interface PuntoEvolucion {
  sesion_id: string
  fecha: string
  pesoMax: number
  volumen: number
}

/** Un punto por sesión con al menos una serie completada, ordenados por fecha. */
export function evolucionPorSesion(filas: FilaSerie[]): PuntoEvolucion[] {
  const porSesion = new Map<string, FilaSerie[]>()
  for (const f of filas) {
    if (!f.completada) continue
    const grupo = porSesion.get(f.sesion_id)
    if (grupo) grupo.push(f)
    else porSesion.set(f.sesion_id, [f])
  }

  return [...porSesion.entries()]
    .map(([sesion_id, grupo]) => ({
      sesion_id,
      fecha: grupo[0]!.inicio,
      pesoMax: Math.max(...grupo.map((f) => f.peso_kg)),
      volumen: volumen(grupo),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/**
 * Qué puntos van en dorado: los que superan a todos los anteriores. El primero
 * nunca —no hay contra qué compararlo—, igual que el aviso de récord.
 */
export function marcarRecords(valores: number[]): boolean[] {
  let mejor = -Infinity
  return valores.map((v, i) => {
    const esRecord = i > 0 && v > mejor
    mejor = Math.max(mejor, v)
    return esRecord
  })
}

export interface Margenes {
  izq: number
  der: number
  arr: number
  abj: number
}

/** Lugar a la izquierda para "1062,5" y abajo para las fechas. */
export const MARGENES_GRAFICO: Margenes = { izq: 44, der: 12, arr: 12, abj: 24 }

export interface Geometria {
  puntos: { x: number; y: number }[]
  /** Líneas horizontales en el mínimo y el máximo, con su valor. Una sola si son iguales. */
  guias: { y: number; valor: number }[]
  /** Dónde van las fechas de abajo: la primera, la del medio y la última. */
  etiquetasX: { x: number; indice: number }[]
}

/**
 * Las coordenadas del gráfico de línea. Los puntos van a la misma distancia —uno
 * por sesión, no proporcionales a la fecha—: con pocos puntos se lee mejor, y
 * un hueco de vacaciones no aplasta el resto.
 */
export function geometriaGrafico(
  valores: number[],
  ancho: number,
  alto: number,
  margenes: Margenes = MARGENES_GRAFICO,
): Geometria {
  if (valores.length === 0) return { puntos: [], guias: [], etiquetasX: [] }

  const izq = margenes.izq
  const anchoUtil = ancho - margenes.izq - margenes.der
  const arriba = margenes.arr
  const altoUtil = alto - margenes.arr - margenes.abj
  const n = valores.length

  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min

  const x = (i: number) => (n === 1 ? izq + anchoUtil / 2 : izq + (anchoUtil * i) / (n - 1))
  // Con todos los valores iguales no hay escala posible: la línea va por el
  // medio en vez de dividir por cero.
  const y = (v: number) => (rango === 0 ? arriba + altoUtil / 2 : arriba + altoUtil * (1 - (v - min) / rango))

  const puntos = valores.map((v, i) => ({ x: x(i), y: y(v) }))
  const guias = rango === 0
    ? [{ y: y(min), valor: min }]
    : [{ y: y(min), valor: min }, { y: y(max), valor: max }]
  const indices = [...new Set([0, Math.floor((n - 1) / 2), n - 1])]
  const etiquetasX = indices.map((i) => ({ x: x(i), indice: i }))

  return { puntos, guias, etiquetasX }
}
