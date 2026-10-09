import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COLORES, VARIABLES_CSS, contraste } from '../src/tema'

describe('contraste', () => {
  it('negro sobre blanco es 21', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })

  it('un color contra sí mismo es 1', () => {
    expect(contraste('#7C5CFF', '#7C5CFF')).toBeCloseTo(1, 5)
  })

  it('no depende del orden', () => {
    expect(contraste(COLORES.texto, COLORES.fondo)).toBe(contraste(COLORES.fondo, COLORES.texto))
  })
})

// El mínimo de accesibilidad para texto normal es 4,5:1. El tenue queda para
// datos de apoyo, nunca para algo que haya que leer para avanzar (spec §2).
describe('el texto se lee sobre el fondo', () => {
  it('el principal supera 4,5:1', () => {
    expect(contraste(COLORES.texto, COLORES.fondo)).toBeGreaterThanOrEqual(4.5)
  })

  it('el secundario supera 4,5:1', () => {
    expect(contraste(COLORES.textoSecundario, COLORES.fondo)).toBeGreaterThanOrEqual(4.5)
  })

  it('los avisos de pendiente y rechazo también', () => {
    expect(contraste(COLORES.pendiente, COLORES.fondo)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(COLORES.rechazo, COLORES.fondo)).toBeGreaterThanOrEqual(4.5)
  })
})

// Tailwind 4 define el tema del panel en CSS y no puede importar este archivo:
// los valores se repiten en globals.css. Este test es lo que impide que se
// desincronicen sin que nadie lo note.
describe('el tema del panel coincide con el de core', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../../apps/panel/src/app/globals.css', import.meta.url)),
    'utf8',
  ).toLowerCase()

  for (const [variable, valor] of Object.entries(VARIABLES_CSS)) {
    it(`${variable} vale ${valor}`, () => {
      expect(css).toContain(`${variable}: ${valor.toLowerCase()};`)
    })
  }
})
