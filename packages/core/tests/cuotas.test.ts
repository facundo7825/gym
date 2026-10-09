import { describe, expect, it } from 'vitest'
import {
  diasEntre, estadoCuota, estaAlDia, formatearFecha, hoyEnZona, montoPropuesto, periodoPropuesto,
  primerDiaDelMes, sumarDias, sumarMes, textoEstadoCuota, textoPeriodo, validarPago,
} from '../src/cuotas'

const cuota = (periodo_desde: string, periodo_hasta: string) => ({ periodo_desde, periodo_hasta })

describe('fechas sin hora', () => {
  it('suma días cruzando meses y años', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(sumarDias('2026-11-15', -1)).toBe('2026-11-14')
  })

  it('cuenta días entre dos fechas', () => {
    expect(diasEntre('2026-10-01', '2026-10-13')).toBe(12)
    expect(diasEntre('2026-10-13', '2026-10-13')).toBe(0)
  })

  // Contar en UTC evita que un día de cambio de horario dure 23 horas y la
  // cuenta dé 30,96.
  it('no se corre con el horario de verano', () => {
    expect(diasEntre('2026-03-01', '2026-04-01')).toBe(31)
  })

  it('un mes después es el mismo día del mes siguiente', () => {
    expect(sumarMes('2026-10-15')).toBe('2026-11-15')
    expect(sumarMes('2026-12-15')).toBe('2027-01-15')
  })

  it('si ese día no existe, el último del mes', () => {
    expect(sumarMes('2026-01-31')).toBe('2026-02-28')
    expect(sumarMes('2028-01-31')).toBe('2028-02-29')
    expect(sumarMes('2026-03-31')).toBe('2026-04-30')
  })

  it('el primer día del mes', () => {
    expect(primerDiaDelMes('2026-10-27')).toBe('2026-10-01')
  })

  it('formatea como se lee acá', () => {
    expect(formatearFecha('2026-11-04')).toBe('04/11')
    expect(formatearFecha('2026-11-04', true)).toBe('04/11/2026')
  })
})

describe('hoyEnZona', () => {
  // 02:30 UTC del 10/10 son las 23:30 del 9/10 en Buenos Aires: la entrada de
  // esa hora es del 9.
  it('usa la fecha de la zona, no la de UTC', () => {
    const ahora = new Date('2026-10-10T02:30:00Z')
    expect(hoyEnZona('America/Argentina/Buenos_Aires', ahora)).toBe('2026-10-09')
    expect(hoyEnZona('UTC', ahora)).toBe('2026-10-10')
  })
})

describe('estadoCuota', () => {
  it('sin cuotas: sin pagos', () => {
    expect(estadoCuota([], '2026-10-20')).toEqual({ tipo: 'sin_pagos' })
  })

  it('vigente muestra el último día cubierto, no el del vencimiento', () => {
    expect(estadoCuota([cuota('2026-10-15', '2026-11-15')], '2026-10-20'))
      .toEqual({ tipo: 'vigente', hasta: '2026-11-14' })
  })

  it('el primer día del período ya está cubierto', () => {
    expect(estadoCuota([cuota('2026-10-15', '2026-11-15')], '2026-10-15').tipo).toBe('vigente')
  })

  it('el día del vencimiento ya no está cubierto', () => {
    expect(estadoCuota([cuota('2026-10-15', '2026-11-15')], '2026-11-15'))
      .toEqual({ tipo: 'vencida', desde: '2026-11-15', dias: 0 })
  })

  it('vencida cuenta los días desde el vencimiento', () => {
    expect(estadoCuota([cuota('2026-09-15', '2026-10-15')], '2026-10-27'))
      .toEqual({ tipo: 'vencida', desde: '2026-10-15', dias: 12 })
  })

  it('vencida toma el vencimiento más reciente', () => {
    const cuotas = [cuota('2026-08-15', '2026-09-15'), cuota('2026-09-15', '2026-10-15')]
    expect(estadoCuota(cuotas, '2026-10-20')).toMatchObject({ desde: '2026-10-15', dias: 5 })
  })

  // Review Focus 1: el que pagó dos meses tiene que verse al día hasta el
  // final del segundo, no del primero.
  it('encadena las cuotas pagadas por adelantado', () => {
    const cuotas = [cuota('2026-11-15', '2026-12-15'), cuota('2026-10-15', '2026-11-15')]
    expect(estadoCuota(cuotas, '2026-10-20')).toEqual({ tipo: 'vigente', hasta: '2026-12-14' })
  })

  it('no encadena si queda un hueco', () => {
    const cuotas = [cuota('2026-10-15', '2026-11-15'), cuota('2026-11-20', '2026-12-20')]
    expect(estadoCuota(cuotas, '2026-10-20')).toEqual({ tipo: 'vigente', hasta: '2026-11-14' })
  })

  it('una cuota que todavía no empezó, sin nada antes', () => {
    expect(estadoCuota([cuota('2026-11-01', '2026-12-01')], '2026-10-20'))
      .toEqual({ tipo: 'empieza', desde: '2026-11-01' })
  })

  it('una cuota futura no tapa una vencida', () => {
    const cuotas = [cuota('2026-09-01', '2026-10-01'), cuota('2026-11-01', '2026-12-01')]
    expect(estadoCuota(cuotas, '2026-10-20').tipo).toBe('vencida')
  })
})

describe('textoEstadoCuota', () => {
  it('cada caso, como lo lee el socio', () => {
    expect(textoEstadoCuota({ tipo: 'vigente', hasta: '2026-11-14' })).toBe('Vigente hasta el 14/11')
    expect(textoEstadoCuota({ tipo: 'vencida', desde: '2026-11-15', dias: 0 })).toBe('Venció hoy')
    expect(textoEstadoCuota({ tipo: 'vencida', desde: '2026-11-15', dias: 1 })).toBe('Vencida hace 1 día')
    expect(textoEstadoCuota({ tipo: 'vencida', desde: '2026-11-15', dias: 12 })).toBe('Vencida hace 12 días')
    expect(textoEstadoCuota({ tipo: 'empieza', desde: '2026-11-01' })).toBe('Empieza el 01/11')
    expect(textoEstadoCuota({ tipo: 'sin_pagos' })).toBe('Sin pagos registrados')
  })

  it('solo vigente está al día', () => {
    expect(estaAlDia({ tipo: 'vigente', hasta: '2026-11-14' })).toBe(true)
    expect(estaAlDia({ tipo: 'empieza', desde: '2026-11-01' })).toBe(false)
    expect(estaAlDia({ tipo: 'sin_pagos' })).toBe(false)
  })
})

describe('periodoPropuesto', () => {
  it('el primer pago arranca hoy y dura un mes', () => {
    expect(periodoPropuesto([], '2026-10-09')).toEqual(cuota('2026-10-09', '2026-11-09'))
  })

  // La regla acordada: desde el vencimiento anterior aunque pague tarde.
  it('el que paga atrasado sigue desde su vencimiento', () => {
    expect(periodoPropuesto([cuota('2026-09-15', '2026-10-15')], '2026-10-27'))
      .toEqual(cuota('2026-10-15', '2026-11-15'))
  })

  it('el que paga adelantado se encadena al final', () => {
    expect(periodoPropuesto([cuota('2026-10-15', '2026-11-15')], '2026-11-10'))
      .toEqual(cuota('2026-11-15', '2026-12-15'))
  })

  it('toma el vencimiento más tardío, no el último cargado', () => {
    const cuotas = [cuota('2026-11-15', '2026-12-15'), cuota('2026-10-15', '2026-11-15')]
    expect(periodoPropuesto(cuotas, '2026-11-10').periodo_desde).toBe('2026-12-15')
  })

  it('a fin de mes, el último día del mes siguiente', () => {
    expect(periodoPropuesto([cuota('2025-12-31', '2026-01-31')], '2026-01-31'))
      .toEqual(cuota('2026-01-31', '2026-02-28'))
  })
})

describe('montoPropuesto', () => {
  it('sin pagos, nada', () => {
    expect(montoPropuesto([])).toBeNull()
  })

  it('el del pago más reciente', () => {
    expect(montoPropuesto([
      { monto: 20000, fecha_pago: '2026-09-15', created_at: '2026-09-15T10:00:00Z' },
      { monto: 25000, fecha_pago: '2026-10-15', created_at: '2026-10-15T10:00:00Z' },
    ])).toBe(25000)
  })

  it('dos pagos el mismo día: el último cargado', () => {
    expect(montoPropuesto([
      { monto: 25000, fecha_pago: '2026-10-15', created_at: '2026-10-15T12:00:00Z' },
      { monto: 20000, fecha_pago: '2026-10-15', created_at: '2026-10-15T10:00:00Z' },
    ])).toBe(25000)
  })
})

describe('validarPago', () => {
  const bien = { periodo_desde: '2026-10-15', periodo_hasta: '2026-11-15', monto: 25000 }

  it('un pago normal está bien', () => {
    expect(validarPago(bien)).toBeNull()
  })

  it('cero está bien: una beca', () => {
    expect(validarPago({ ...bien, monto: 0 })).toBeNull()
  })

  it('exige el monto', () => {
    expect(validarPago({ ...bien, monto: NaN })).toBe('Poné el monto')
  })

  it('no acepta un monto negativo', () => {
    expect(validarPago({ ...bien, monto: -1 })).toBe('El monto no puede ser negativo')
  })

  it('exige las dos fechas', () => {
    expect(validarPago({ ...bien, periodo_hasta: '' })).toBe('Completá las fechas')
  })

  it('el vencimiento tiene que ser posterior al inicio', () => {
    expect(validarPago({ ...bien, periodo_hasta: '2026-10-15' }))
      .toBe('El vencimiento tiene que ser después del inicio')
  })
})

describe('textoPeriodo', () => {
  it('muestra el último día cubierto', () => {
    expect(textoPeriodo(cuota('2026-10-15', '2026-11-15'))).toBe('15/10 al 14/11')
  })
})
