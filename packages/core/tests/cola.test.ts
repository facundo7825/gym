import { describe, expect, it } from 'vitest'
import {
  clasificarRespuesta, estadoFinTras, estadoTras, resumenCola, sesionAbierta,
  sesionesLimpiables, siguientesOperaciones, textoEstadoCola,
  type SerieEnCola, type SesionEnCola,
} from '../src/cola'

const YO = 'membresia-mia'
const OTRO = 'membresia-de-otro'

function sesion(campos: Partial<SesionEnCola> = {}): SesionEnCola {
  return {
    id_local: 's1', membership_id: YO, gym_id: 'g1', rutina_dia_id: null,
    inicio: '2026-10-08T10:00:00Z', fin: null, notas: null,
    estado: 'pendiente', servidor_id: null, estado_fin: 'abierta',
    ...campos,
  }
}

function serie(campos: Partial<SerieEnCola> = {}): SerieEnCola {
  return {
    id_local: 'r1', sesion_id_local: 's1', ejercicio_id: 'e1',
    numero_serie: 1, peso_kg: 60, repeticiones: 10, estado: 'pendiente',
    ...campos,
  }
}

const enviada = (campos: Partial<SesionEnCola> = {}) =>
  sesion({ estado: 'enviada', servidor_id: 'srv-1', ...campos })

describe('siguientesOperaciones', () => {
  it('primero la sesión: sus series esperan a tener a qué colgarse', () => {
    const ops = siguientesOperaciones([sesion()], [serie()], [YO])
    expect(ops).toEqual([{ tipo: 'sesion', sesion: sesion() }])
  })

  it('con la sesión enviada, las series con el id del servidor', () => {
    const ops = siguientesOperaciones([enviada()], [serie()], [YO])
    expect(ops).toEqual([{ tipo: 'serie', serie: serie(), sesion_servidor_id: 'srv-1' }])
  })

  it('el fin va después de la última serie, no junto con ellas', () => {
    const terminada = enviada({ fin: '2026-10-08T11:00:00Z', estado_fin: 'pendiente' })
    expect(siguientesOperaciones([terminada], [serie()], [YO]).map((o) => o.tipo))
      .toEqual(['serie'])
    expect(siguientesOperaciones([terminada], [serie({ estado: 'enviada' })], [YO]))
      .toEqual([{ tipo: 'fin', sesion: terminada, servidor_id: 'srv-1', fin: '2026-10-08T11:00:00Z' }])
  })

  it('una sesión abierta no manda fin', () => {
    expect(siguientesOperaciones([enviada()], [], [YO])).toEqual([])
  })

  it('las series de una sesión rechazada quedan frenadas', () => {
    expect(siguientesOperaciones([sesion({ estado: 'rechazada' })], [serie()], [YO])).toEqual([])
  })

  it('lo rechazado no se vuelve a mandar', () => {
    expect(siguientesOperaciones([enviada()], [serie({ estado: 'rechazada' })], [YO])).toEqual([])
  })

  // Si en el teléfono inició sesión otra persona, lo que quedó en la cola del
  // anterior no sale con la cuenta del nuevo.
  it('nunca empuja filas de otra membresía', () => {
    const ajena = sesion({ membership_id: OTRO })
    expect(siguientesOperaciones([ajena], [serie()], [YO])).toEqual([])
    expect(siguientesOperaciones([enviada({ membership_id: OTRO })], [serie()], [YO])).toEqual([])
  })

  it('todo enviado: no hay nada que hacer', () => {
    const lista = enviada({ fin: '2026-10-08T11:00:00Z', estado_fin: 'enviado' })
    expect(siguientesOperaciones([lista], [serie({ estado: 'enviada' })], [YO])).toEqual([])
  })
})

describe('clasificarRespuesta', () => {
  it('sin error es éxito', () => {
    expect(clasificarRespuesta(null)).toBe('exito')
  })

  // Un envío anterior sí había llegado y la respuesta se perdió.
  it('el choque contra id_local es un duplicado, no un error', () => {
    expect(clasificarRespuesta({ code: '23505' })).toBe('duplicado')
  })

  it('RLS, clave foránea y check son permanentes: reintentar no los arregla', () => {
    expect(clasificarRespuesta({ code: '42501' })).toBe('permanente')
    expect(clasificarRespuesta({ code: '23503' })).toBe('permanente')
    expect(clasificarRespuesta({ code: '23514' })).toBe('permanente')
    expect(clasificarRespuesta({ code: '22P02' })).toBe('permanente')
  })

  it('sin red, timeout o un error del servidor son transitorios', () => {
    // supabase-js devuelve code vacío cuando falla el fetch.
    expect(clasificarRespuesta({ code: '' })).toBe('transitorio')
    expect(clasificarRespuesta({})).toBe('transitorio')
    // JWT vencido: se arregla solo cuando se refresca la sesión.
    expect(clasificarRespuesta({ code: 'PGRST301' })).toBe('transitorio')
  })
})

describe('estadoTras y estadoFinTras', () => {
  it('éxito y duplicado dejan la fila enviada', () => {
    expect(estadoTras('exito')).toBe('enviada')
    expect(estadoTras('duplicado')).toBe('enviada')
    expect(estadoFinTras('exito')).toBe('enviado')
  })

  it('lo permanente queda rechazado', () => {
    expect(estadoTras('permanente')).toBe('rechazada')
    expect(estadoFinTras('permanente')).toBe('rechazado')
  })

  it('lo transitorio no cambia nada: el intento siguiente la lleva', () => {
    expect(estadoTras('transitorio')).toBeNull()
    expect(estadoFinTras('transitorio')).toBeNull()
  })
})

describe('resumenCola y textoEstadoCola', () => {
  it('cuenta las series pendientes', () => {
    const r = resumenCola(
      [enviada()],
      [serie({ id_local: 'a' }), serie({ id_local: 'b' }), serie({ id_local: 'c', estado: 'enviada' })],
      [YO],
    )
    expect(r).toEqual({ seriesPendientes: 2, otrasPendientes: 0, rechazadas: 0 })
    expect(textoEstadoCola(r)).toBe('2 series sin sincronizar')
  })

  it('en singular cuando es una', () => {
    expect(textoEstadoCola({ seriesPendientes: 1, otrasPendientes: 0, rechazadas: 0 }))
      .toBe('1 serie sin sincronizar')
  })

  it('las series de una sesión rechazada cuentan como rechazadas, no como pendientes', () => {
    const r = resumenCola([sesion({ estado: 'rechazada' })], [serie()], [YO])
    expect(r.rechazadas).toBe(1)
    expect(r.seriesPendientes).toBe(0)
    expect(textoEstadoCola(r)).toBe('1 serie no se pudo guardar')
  })

  it('rechazadas y pendientes juntas se dicen las dos', () => {
    expect(textoEstadoCola({ seriesPendientes: 3, otrasPendientes: 0, rechazadas: 2 }))
      .toBe('2 series no se pudieron guardar · 3 series sin sincronizar')
  })

  it('si solo falta el cierre de la sesión, también se dice', () => {
    const r = resumenCola(
      [enviada({ fin: '2026-10-08T11:00:00Z', estado_fin: 'pendiente' })],
      [serie({ estado: 'enviada' })],
      [YO],
    )
    expect(textoEstadoCola(r)).toBe('Falta sincronizar el entrenamiento')
  })

  it('todo al día no muestra nada', () => {
    expect(textoEstadoCola({ seriesPendientes: 0, otrasPendientes: 0, rechazadas: 0 })).toBeNull()
  })

  it('no cuenta lo de otra membresía', () => {
    expect(resumenCola([sesion({ membership_id: OTRO })], [serie()], [YO]).seriesPendientes).toBe(0)
  })
})

describe('sesionesLimpiables', () => {
  const terminada = enviada({ fin: '2026-10-08T11:00:00Z', estado_fin: 'enviado' })

  it('una sesión con todo enviado ya no hace falta en el teléfono', () => {
    expect(sesionesLimpiables([terminada], [serie({ estado: 'enviada' })])).toEqual(['s1'])
  })

  it('con alguna serie pendiente se queda', () => {
    expect(sesionesLimpiables([terminada], [serie()])).toEqual([])
  })

  // Lo rechazado se guarda: nunca se borra solo.
  it('con algo rechazado se queda', () => {
    expect(sesionesLimpiables([terminada], [serie({ estado: 'rechazada' })])).toEqual([])
    expect(sesionesLimpiables([sesion({ estado: 'rechazada' })], [])).toEqual([])
  })

  it('una sesión abierta se queda, aunque esté enviada', () => {
    expect(sesionesLimpiables([enviada()], [serie({ estado: 'enviada' })])).toEqual([])
  })
})

describe('sesionAbierta', () => {
  it('la más reciente sin terminar, propia', () => {
    const vieja = sesion({ id_local: 'vieja', inicio: '2026-10-07T10:00:00Z' })
    const nueva = sesion({ id_local: 'nueva', inicio: '2026-10-08T10:00:00Z' })
    expect(sesionAbierta([vieja, nueva], [YO])?.id_local).toBe('nueva')
  })

  it('las terminadas y las ajenas no cuentan', () => {
    const terminada = sesion({ fin: '2026-10-08T11:00:00Z', estado_fin: 'pendiente' })
    const ajena = sesion({ id_local: 's2', membership_id: OTRO })
    expect(sesionAbierta([terminada, ajena], [YO])).toBeNull()
  })
})
