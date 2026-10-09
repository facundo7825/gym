import { describe, expect, it } from 'vitest'
import { formatearCronometro } from '../src/tiempo'

describe('formatearCronometro', () => {
  it('arranca en 0:00', () => {
    expect(formatearCronometro(0)).toBe('0:00')
  })

  it('minutos y segundos con dos cifras', () => {
    expect(formatearCronometro(65)).toBe('1:05')
    expect(formatearCronometro(24 * 60 + 10)).toBe('24:10')
  })

  it('pasada la hora, suma las horas', () => {
    expect(formatearCronometro(3725)).toBe('1:02:05')
  })

  // El reloj del teléfono se puede atrasar en el medio de una sesión.
  it('un valor negativo o roto se muestra como 0:00', () => {
    expect(formatearCronometro(-30)).toBe('0:00')
    expect(formatearCronometro(NaN)).toBe('0:00')
  })

  it('redondea hacia abajo los segundos fraccionarios', () => {
    expect(formatearCronometro(59.9)).toBe('0:59')
  })
})
