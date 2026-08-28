import { describe, expect, it } from 'vitest'
import { puede } from '../src/permisos'

describe('puede', () => {
  it('un socio puede ver ejercicios', () => {
    expect(puede('socio', 'ver_ejercicios')).toBe(true)
  })

  it('un socio NO puede subir videos', () => {
    expect(puede('socio', 'subir_video')).toBe(false)
  })

  it('un entrenador puede subir videos y crear ejercicios', () => {
    expect(puede('entrenador', 'subir_video')).toBe(true)
    expect(puede('entrenador', 'crear_ejercicio')).toBe(true)
  })

  it('un entrenador NO puede gestionar socios', () => {
    expect(puede('entrenador', 'gestionar_socios')).toBe(false)
  })

  it('un admin puede todo lo del entrenador, y además gestionar socios', () => {
    expect(puede('admin', 'subir_video')).toBe(true)
    expect(puede('admin', 'gestionar_socios')).toBe(true)
  })
})
