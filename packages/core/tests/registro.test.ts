import { describe, expect, it } from 'vitest'
import {
  aNumero, detalleSeries, detectarRecord, filasPrecargadas, formatearKg,
  fusionarMarcas, marcaDeSesion, repsSugeridas, textoVezPasada, validarSerie, volumen,
} from '../src/registro'

describe('aNumero', () => {
  it('acepta la coma decimal, que es la que escribe la gente acá', () => {
    expect(aNumero('57,5')).toBe(57.5)
    expect(aNumero(' 60 ')).toBe(60)
  })

  it('un campo vacío no es cero', () => {
    expect(aNumero('')).toBeNaN()
    expect(aNumero('   ')).toBeNaN()
    expect(aNumero('abc')).toBeNaN()
  })
})

describe('validarSerie', () => {
  it('una serie normal está bien', () => {
    expect(validarSerie({ peso_kg: 60, repeticiones: 10 })).toBeNull()
  })

  it('peso cero está bien: dominadas, fondos', () => {
    expect(validarSerie({ peso_kg: 0, repeticiones: 8 })).toBeNull()
  })

  it('exige el peso', () => {
    expect(validarSerie({ peso_kg: NaN, repeticiones: 10 })).toBe('Poné el peso')
  })

  it('no acepta peso negativo', () => {
    expect(validarSerie({ peso_kg: -5, repeticiones: 10 })).toBe('El peso no puede ser negativo')
  })

  it('no acepta un peso que no entra en la base', () => {
    expect(validarSerie({ peso_kg: 10000, repeticiones: 1 })).toBe('Ese peso no parece real')
  })

  it('exige al menos una repetición entera', () => {
    expect(validarSerie({ peso_kg: 60, repeticiones: 0 }))
      .toBe('Las repeticiones tienen que ser al menos 1')
    expect(validarSerie({ peso_kg: 60, repeticiones: 2.5 }))
      .toBe('Las repeticiones tienen que ser al menos 1')
    expect(validarSerie({ peso_kg: 60, repeticiones: NaN }))
      .toBe('Las repeticiones tienen que ser al menos 1')
  })
})

describe('repsSugeridas', () => {
  it('de un rango toma el primer número', () => {
    expect(repsSugeridas('8-12')).toBe(8)
    expect(repsSugeridas('10')).toBe(10)
  })

  it('sin número no sugiere nada', () => {
    expect(repsSugeridas('al fallo')).toBeNull()
    expect(repsSugeridas('0')).toBeNull()
  })
})

describe('volumen', () => {
  it('es la suma de peso por repeticiones', () => {
    expect(volumen([
      { peso_kg: 60, repeticiones: 10 },
      { peso_kg: 57.5, repeticiones: 8 },
    ])).toBe(1060)
  })

  it('sin series es cero', () => {
    expect(volumen([])).toBe(0)
  })

  it('redondea a centavos: no arrastra errores de coma flotante', () => {
    expect(volumen([{ peso_kg: 0.1, repeticiones: 3 }])).toBe(0.3)
  })
})

describe('detectarRecord', () => {
  const previa = { mejor_peso_kg: 100, mejor_volumen_kg: 1000 }

  it('la primera vez que se hace un ejercicio no es récord', () => {
    expect(detectarRecord(undefined, [], { peso_kg: 200, repeticiones: 10 })).toBeNull()
  })

  it('superar el peso es récord', () => {
    expect(detectarRecord(previa, [], { peso_kg: 102.5, repeticiones: 1 })).toBe('peso')
  })

  it('igualarlo no', () => {
    expect(detectarRecord(previa, [], { peso_kg: 100, repeticiones: 1 })).toBeNull()
  })

  // Si no, la tercera serie de una sesión en la que ya se batió el récord en
  // la primera volvería a avisar contra la marca vieja.
  it('compara también contra lo que ya se hizo en la sesión', () => {
    const anteriores = [{ peso_kg: 105, repeticiones: 1 }]
    expect(detectarRecord(previa, anteriores, { peso_kg: 102.5, repeticiones: 1 })).toBeNull()
    expect(detectarRecord(previa, anteriores, { peso_kg: 107.5, repeticiones: 1 })).toBe('peso')
  })

  it('el volumen es récord en la serie que cruza la marca', () => {
    const anteriores = [{ peso_kg: 50, repeticiones: 10 }, { peso_kg: 50, repeticiones: 9 }] // 950
    expect(detectarRecord(previa, anteriores, { peso_kg: 50, repeticiones: 2 })).toBe('volumen') // 1050
  })

  it('el volumen se avisa una sola vez: la serie siguiente ya parte de arriba', () => {
    const anteriores = [{ peso_kg: 50, repeticiones: 10 }, { peso_kg: 50, repeticiones: 11 }] // 1050
    expect(detectarRecord(previa, anteriores, { peso_kg: 50, repeticiones: 5 })).toBeNull()
  })

  it('si una serie bate los dos, gana el de peso', () => {
    const anteriores = [{ peso_kg: 90, repeticiones: 10 }] // 900
    expect(detectarRecord(previa, anteriores, { peso_kg: 110, repeticiones: 1 })).toBe('peso')
  })
})

describe('marcaDeSesion', () => {
  it('el mejor peso y el volumen de la sesión', () => {
    expect(marcaDeSesion([
      { peso_kg: 60, repeticiones: 10 },
      { peso_kg: 65, repeticiones: 5 },
    ])).toEqual({ mejor_peso_kg: 65, mejor_volumen_kg: 925 })
  })

  it('sin series no hay marca', () => {
    expect(marcaDeSesion([])).toBeNull()
  })
})

describe('fusionarMarcas', () => {
  // El servidor todavía no conoce lo que está en la cola: si reemplazara, un
  // récord hecho sin señal desaparecería al sincronizar a medias.
  it('gana el máximo de cada campo, venga de donde venga', () => {
    const locales = { x: { mejor_peso_kg: 105, mejor_volumen_kg: 900 } }
    const servidor = { x: { mejor_peso_kg: 100, mejor_volumen_kg: 1000 } }
    expect(fusionarMarcas(locales, servidor))
      .toEqual({ x: { mejor_peso_kg: 105, mejor_volumen_kg: 1000 } })
  })

  it('conserva los ejercicios que están en un solo lado', () => {
    const a = { x: { mejor_peso_kg: 1, mejor_volumen_kg: 1 } }
    const b = { y: { mejor_peso_kg: 2, mejor_volumen_kg: 2 } }
    expect(fusionarMarcas(a, b)).toEqual({ ...a, ...b })
  })
})

describe('formatearKg', () => {
  it('sin decimales cuando no hacen falta, con coma cuando sí', () => {
    expect(formatearKg(60)).toBe('60')
    expect(formatearKg(57.5)).toBe('57,5')
    expect(formatearKg(1062.25)).toBe('1062,25')
  })
})

describe('textoVezPasada', () => {
  it('con el mismo peso, el peso una vez y las repeticiones en fila', () => {
    expect(textoVezPasada([
      { peso_kg: 60, repeticiones: 10 }, { peso_kg: 60, repeticiones: 10 },
      { peso_kg: 60, repeticiones: 9 }, { peso_kg: 60, repeticiones: 8 },
    ])).toBe('La vez pasada: 60kg × 10, 10, 9, 8')
  })

  it('con pesos distintos, cada serie con el suyo', () => {
    expect(textoVezPasada([
      { peso_kg: 60, repeticiones: 10 }, { peso_kg: 57.5, repeticiones: 9 },
    ])).toBe('La vez pasada: 60kg × 10, 57,5kg × 9')
  })

  it('sin series no hay texto', () => {
    expect(textoVezPasada([])).toBeNull()
  })
})

describe('detalleSeries', () => {
  it('es el mismo detalle sin el prefijo: lo usa el historial', () => {
    expect(detalleSeries([
      { peso_kg: 60, repeticiones: 10 }, { peso_kg: 60, repeticiones: 8 },
    ])).toBe('60kg × 10, 8')
  })
})

// Es lo que hace que registrar un ejercicio repetido cueste cuatro toques.
describe('filasPrecargadas', () => {
  const rutina = { series: 3, repeticiones: '8-12', peso_sugerido_kg: 40 }
  const pasada = [
    { peso_kg: 60, repeticiones: 10 }, { peso_kg: 60, repeticiones: 9 }, { peso_kg: 57.5, repeticiones: 8 },
  ]

  it('con señal, precarga lo de la vez pasada antes que lo de la rutina', () => {
    expect(filasPrecargadas({ prescripcion: rutina, vezPasada: pasada, hechas: [] })).toEqual([
      { peso_kg: 60, repeticiones: 10, registrada: false },
      { peso_kg: 60, repeticiones: 9, registrada: false },
      { peso_kg: 57.5, repeticiones: 8, registrada: false },
    ])
  })

  it('sin señal, lo de la rutina: las series, el primer número del rango y el peso sugerido', () => {
    const filas = filasPrecargadas({ prescripcion: rutina, vezPasada: null, hechas: [] })
    expect(filas).toHaveLength(3)
    expect(filas[0]).toEqual({ peso_kg: 40, repeticiones: 8, registrada: false })
  })

  it('si la rutina pide más series que la vez pasada, repite la última', () => {
    const filas = filasPrecargadas({
      prescripcion: { ...rutina, series: 4 }, vezPasada: pasada, hechas: [],
    })
    expect(filas).toHaveLength(4)
    expect(filas[3]).toEqual({ peso_kg: 57.5, repeticiones: 8, registrada: false })
  })

  it('si la vez pasada hizo más series que la rutina, precarga todas', () => {
    const filas = filasPrecargadas({
      prescripcion: { ...rutina, series: 2 }, vezPasada: pasada, hechas: [],
    })
    expect(filas).toHaveLength(3)
  })

  // Al retomar una sesión que quedó abierta.
  it('las series ya registradas ocupan las primeras filas', () => {
    const filas = filasPrecargadas({
      prescripcion: rutina, vezPasada: pasada, hechas: [{ peso_kg: 62.5, repeticiones: 10 }],
    })
    expect(filas).toEqual([
      { peso_kg: 62.5, repeticiones: 10, registrada: true },
      { peso_kg: 60, repeticiones: 9, registrada: false },
      { peso_kg: 57.5, repeticiones: 8, registrada: false },
    ])
  })

  it('con más series hechas que previstas, quedan todas las hechas', () => {
    const hechas = [1, 2, 3, 4].map(() => ({ peso_kg: 50, repeticiones: 10 }))
    const filas = filasPrecargadas({ prescripcion: rutina, vezPasada: null, hechas })
    expect(filas).toHaveLength(4)
    expect(filas.every((f) => f.registrada)).toBe(true)
  })

  it('entrenando libre y sin historial, una fila vacía para empezar', () => {
    expect(filasPrecargadas({ prescripcion: null, vezPasada: null, hechas: [] }))
      .toEqual([{ peso_kg: null, repeticiones: null, registrada: false }])
  })

  it('con "al fallo" no inventa repeticiones', () => {
    const filas = filasPrecargadas({
      prescripcion: { series: 1, repeticiones: 'al fallo', peso_sugerido_kg: null },
      vezPasada: null, hechas: [],
    })
    expect(filas).toEqual([{ peso_kg: null, repeticiones: null, registrada: false }])
  })
})
