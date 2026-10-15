/**
 * Cuotas: fechas sin hora, el estado de la cuota y lo que el panel propone al
 * registrar un pago. Ver la sección 2 del diseño de la etapa 4.
 *
 * Las fechas son texto 'AAAA-MM-DD', como devuelve Postgres una columna
 * `date`. Se comparan como texto —en ese formato el orden alfabético es el
 * cronológico— y las cuentas se hacen en UTC, donde todos los días duran 24
 * horas.
 *
 * `periodo_hasta` es el primer día SIN cobertura: una cuota del 15/10 al
 * 15/11 cubre hasta el 14/11. Todo lo que se le muestra a una persona dice el
 * último día cubierto.
 */

export type Fecha = string

export interface PeriodoCuota {
  periodo_desde: Fecha
  periodo_hasta: Fecha
}

export type EstadoCuota =
  | { tipo: 'vigente'; hasta: Fecha }
  | { tipo: 'vencida'; desde: Fecha; dias: number }
  | { tipo: 'empieza'; desde: Fecha }
  | { tipo: 'sin_pagos' }

export const METODOS_PAGO = ['efectivo', 'transferencia', 'otro'] as const
export type MetodoPago = (typeof METODOS_PAGO)[number]

export const ETIQUETA_METODO_PAGO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  otro: 'Otro',
}

const MS_DIA = 86_400_000

// Los valores por defecto están por noUncheckedIndexedAccess: una fecha bien
// formada siempre tiene las tres partes.
function aUtc(fecha: Fecha): number {
  const [anio = 0, mes = 1, dia = 1] = fecha.split('-').map(Number)
  return Date.UTC(anio, mes - 1, dia)
}

const deUtc = (ms: number): Fecha => new Date(ms).toISOString().slice(0, 10)

export function sumarDias(fecha: Fecha, dias: number): Fecha {
  return deUtc(aUtc(fecha) + dias * MS_DIA)
}

export function diasEntre(desde: Fecha, hasta: Fecha): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_DIA)
}

/** El mismo día del mes siguiente; si no existe (31/01), el último del mes. */
export function sumarMes(fecha: Fecha): Fecha {
  const [anio = 0, mes = 1, dia = 1] = fecha.split('-').map(Number)
  // `mes` es 1-12 y Date.UTC cuenta 0-11: (anio, mes + 1, 0) es el día 0 del
  // mes que sigue al siguiente, o sea el último día del siguiente.
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
  return deUtc(Date.UTC(anio, mes, Math.min(dia, ultimo)))
}

export function primerDiaDelMes(fecha: Fecha): Fecha {
  return `${fecha.slice(0, 8)}01`
}

/**
 * La fecha de hoy en la zona del gimnasio. El panel puede correr en un
 * servidor en UTC, y una entrada a las 23:30 en Buenos Aires es de ese día.
 */
export function hoyEnZona(zona: string, ahora: Date = new Date()): Fecha {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(ahora)
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return `${parte('year')}-${parte('month')}-${parte('day')}`
}

/** '04/11', o '04/11/2026' con el año. */
export function formatearFecha(fecha: Fecha, conAnio = false): string {
  const [anio = '', mes = '', dia = ''] = fecha.split('-')
  return conAnio ? `${dia}/${mes}/${anio}` : `${dia}/${mes}`
}

const masTardia = (fechas: Fecha[]): Fecha => fechas.reduce((a, b) => (b > a ? b : a))

export function estadoCuota(cuotas: readonly PeriodoCuota[], hoy: Fecha): EstadoCuota {
  const cubren = cuotas.filter((c) => c.periodo_desde <= hoy && hoy < c.periodo_hasta)

  if (cubren.length) {
    // Encadena: una cuota que empieza antes o justo cuando termina la
    // cobertura la estira. Es el que pagó dos meses juntos.
    let fin = masTardia(cubren.map((c) => c.periodo_hasta))
    for (let estiro = true; estiro; ) {
      estiro = false
      for (const c of cuotas) {
        if (c.periodo_desde <= fin && c.periodo_hasta > fin) {
          fin = c.periodo_hasta
          estiro = true
        }
      }
    }
    return { tipo: 'vigente', hasta: sumarDias(fin, -1) }
  }

  const pasadas = cuotas.filter((c) => c.periodo_hasta <= hoy)
  if (pasadas.length) {
    const desde = masTardia(pasadas.map((c) => c.periodo_hasta))
    return { tipo: 'vencida', desde, dias: diasEntre(desde, hoy) }
  }

  if (cuotas.length) {
    const desde = cuotas.map((c) => c.periodo_desde).reduce((a, b) => (b < a ? b : a))
    return { tipo: 'empieza', desde }
  }

  return { tipo: 'sin_pagos' }
}

export function estaAlDia(estado: EstadoCuota): boolean {
  return estado.tipo === 'vigente'
}

export function textoEstadoCuota(estado: EstadoCuota): string {
  switch (estado.tipo) {
    case 'vigente':
      return `Vigente hasta el ${formatearFecha(estado.hasta)}`
    case 'vencida':
      if (estado.dias === 0) return 'Venció hoy'
      return `Vencida hace ${estado.dias} ${estado.dias === 1 ? 'día' : 'días'}`
    case 'empieza':
      return `Empieza el ${formatearFecha(estado.desde)}`
    case 'sin_pagos':
      return 'Sin pagos registrados'
  }
}

/**
 * El período que el panel propone al registrar un pago. Con pagos previos,
 * desde el vencimiento más tardío aunque ya haya pasado: el que paga tarde no
 * corre su fecha. Sin pagos, desde hoy. Siempre un mes.
 */
export function periodoPropuesto(cuotas: readonly PeriodoCuota[], hoy: Fecha): PeriodoCuota {
  const desde = cuotas.length ? masTardia(cuotas.map((c) => c.periodo_hasta)) : hoy
  return { periodo_desde: desde, periodo_hasta: sumarMes(desde) }
}

/** El monto del pago más reciente: sin planes, el precio es el último que se cobró. */
export function montoPropuesto(
  cuotas: readonly { monto: number; fecha_pago: Fecha; created_at: string }[],
): number | null {
  const masNueva = (a: (typeof cuotas)[number], b: (typeof cuotas)[number]) =>
    b.fecha_pago > a.fecha_pago || (b.fecha_pago === a.fecha_pago && b.created_at > a.created_at) ? b : a
  return cuotas.length ? cuotas.reduce(masNueva).monto : null
}

export function validarPago(pago: { periodo_desde: Fecha; periodo_hasta: Fecha; monto: number }): string | null {
  if (Number.isNaN(pago.monto)) return 'Poné el monto'
  if (pago.monto < 0) return 'El monto no puede ser negativo'
  if (!pago.periodo_desde || !pago.periodo_hasta) return 'Completá las fechas'
  if (pago.periodo_hasta <= pago.periodo_desde) return 'El vencimiento tiene que ser después del inicio'
  return null
}

/** '15/10 al 14/11': el último día que se muestra es el último cubierto. */
export function textoPeriodo(cuota: PeriodoCuota): string {
  return `${formatearFecha(cuota.periodo_desde)} al ${formatearFecha(sumarDias(cuota.periodo_hasta, -1))}`
}
