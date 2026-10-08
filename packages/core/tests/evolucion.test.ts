import { describe, expect, it } from 'vitest'
import { evolucionPorSesion, geometriaGrafico, marcarRecords, type FilaSerie } from '../src/evolucion'

const fila = (campos: Partial<FilaSerie>): FilaSerie => ({
  sesion_id: 's1', inicio: '2026-10-08T10:00:00Z', peso_kg: 60, repeticiones: 10, completada: true,
  ...campos,
})

describe('evolucionPorSesion', () => {
  it('un punto por sesión, con su peso máximo y su volumen', () => {
    const puntos = evolucionPorSesion([
      fila({ peso_kg: 60, repeticiones: 10 }),
      fila({ peso_kg: 65, repeticiones: 5 }),
    ])
    expect(puntos).toEqual([
      { sesion_id: 's1', fecha: '2026-10-08T10:00:00Z', pesoMax: 65, volumen: 925 },
    ])
  })

  it('ordenado por fecha, aunque las filas lleguen en otro orden', () => {
    const puntos = evolucionPorSesion([
      fila({ sesion_id: 'hoy', inicio: '2026-10-08T10:00:00Z' }),
      fila({ sesion_id: 'ayer', inicio: '2026-10-07T10:00:00Z' }),
    ])
    expect(puntos.map((p) => p.sesion_id)).toEqual(['ayer', 'hoy'])
  })

  it('las series sin completar no cuentan para nada', () => {
    const puntos = evolucionPorSesion([
      fila({ peso_kg: 60, repeticiones: 10 }),
      fila({ peso_kg: 100, repeticiones: 1, completada: false }),
    ])
    expect(puntos[0]).toMatchObject({ pesoMax: 60, volumen: 600 })
  })

  it('una sesión con todo sin completar no es un punto', () => {
    expect(evolucionPorSesion([fila({ completada: false })])).toEqual([])
  })
})

describe('marcarRecords', () => {
  // El mismo criterio que el aviso de récord, para que gráfico y aviso no se
  // contradigan: la primera vez no cuenta, igualar no cuenta.
  it('marca los puntos que superan a todos los anteriores', () => {
    expect(marcarRecords([50, 52.5, 52.5, 55, 54, 57.5]))
      .toEqual([false, true, false, true, false, true])
  })

  it('sin puntos no hay marcas', () => {
    expect(marcarRecords([])).toEqual([])
  })
})

describe('geometriaGrafico', () => {
  const SIN_MARGEN = { izq: 0, der: 0, arr: 0, abj: 0 }

  it('reparte los puntos a la misma distancia y escala el alto entre mínimo y máximo', () => {
    const g = geometriaGrafico([10, 20, 30], 100, 50, SIN_MARGEN)
    expect(g.puntos).toEqual([{ x: 0, y: 50 }, { x: 50, y: 25 }, { x: 100, y: 0 }])
    expect(g.guias).toEqual([{ y: 50, valor: 10 }, { y: 0, valor: 30 }])
  })

  it('respeta los márgenes', () => {
    const g = geometriaGrafico([10, 30], 120, 70, { izq: 20, der: 0, arr: 10, abj: 10 })
    expect(g.puntos).toEqual([{ x: 20, y: 60 }, { x: 120, y: 10 }])
  })

  // Sin esto la escala divide por cero y los puntos salen en NaN.
  it('con todos los valores iguales, la línea va por el medio y hay una sola guía', () => {
    const g = geometriaGrafico([7, 7, 7], 100, 50, SIN_MARGEN)
    expect(g.puntos.map((p) => p.y)).toEqual([25, 25, 25])
    expect(g.guias).toEqual([{ y: 25, valor: 7 }])
  })

  it('un solo punto va centrado', () => {
    const g = geometriaGrafico([42], 100, 50, SIN_MARGEN)
    expect(g.puntos).toEqual([{ x: 50, y: 25 }])
    expect(g.etiquetasX).toEqual([{ x: 50, indice: 0 }])
  })

  it('sin valores no hay nada que dibujar', () => {
    expect(geometriaGrafico([], 100, 50, SIN_MARGEN))
      .toEqual({ puntos: [], guias: [], etiquetasX: [] })
  })

  it('las fechas de abajo: la primera, la del medio y la última', () => {
    const g = geometriaGrafico([1, 2, 3, 4, 5], 100, 50, SIN_MARGEN)
    expect(g.etiquetasX.map((e) => e.indice)).toEqual([0, 2, 4])
  })

  it('con dos puntos, las dos fechas sin repetir', () => {
    const g = geometriaGrafico([1, 2], 100, 50, SIN_MARGEN)
    expect(g.etiquetasX.map((e) => e.indice)).toEqual([0, 1])
  })
})
