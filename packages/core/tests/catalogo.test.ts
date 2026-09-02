import { describe, expect, it } from 'vitest'
import { EQUIPAMIENTOS, GRUPOS_MUSCULARES, etiqueta } from '../src/catalogo'
import { Constants } from '../src/tipos-db'

describe('etiqueta', () => {
  it('traduce los valores de la base a texto con acentos', () => {
    expect(etiqueta('biceps')).toBe('Bíceps')
    expect(etiqueta('cuerpo_completo')).toBe('Cuerpo completo')
    expect(etiqueta('peso_corporal')).toBe('Peso corporal')
  })

  it('tiene etiqueta para TODOS los valores posibles', () => {
    for (const valor of [...GRUPOS_MUSCULARES, ...EQUIPAMIENTOS]) {
      expect(etiqueta(valor)).toBeTruthy()
    }
  })
})

// Las listas se derivan de los tipos que genera Supabase, no se copian a mano.
// Si alguien las vuelve a escribir a mano, este test avisa en cuanto la base
// cambie: el enum de PostgreSQL es la única fuente de verdad.
describe('las listas salen del enum de la base', () => {
  it('GRUPOS_MUSCULARES es el enum grupo_muscular', () => {
    expect(GRUPOS_MUSCULARES).toEqual(Constants.public.Enums.grupo_muscular)
  })

  it('EQUIPAMIENTOS es el enum tipo_equipamiento', () => {
    expect(EQUIPAMIENTOS).toEqual(Constants.public.Enums.tipo_equipamiento)
  })
})
