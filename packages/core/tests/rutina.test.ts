import { describe, expect, it } from 'vitest'
import {
  diaAMostrar, validarBorrador,
  type RutinaBorrador,
} from '../src/rutina'

const VALIDO: RutinaBorrador = {
  nombre: 'Full body',
  dias: [
    {
      nombre: 'Día 1',
      ejercicios: [{ ejercicio_id: 'e1', series: 4, repeticiones: '8-12' }],
    },
  ],
}

describe('validarBorrador', () => {
  it('un borrador completo no tiene errores', () => {
    expect(validarBorrador(VALIDO)).toEqual([])
  })

  it('exige nombre', () => {
    expect(validarBorrador({ ...VALIDO, nombre: '   ' }))
      .toContain('Poné un nombre a la rutina')
  })

  it('exige al menos un día', () => {
    expect(validarBorrador({ ...VALIDO, dias: [] }))
      .toContain('Agregá al menos un día')
  })

  it('exige que cada día tenga al menos un ejercicio, y dice cuál', () => {
    const errores = validarBorrador({
      ...VALIDO,
      dias: [...VALIDO.dias, { nombre: 'Día 2', ejercicios: [] }],
    })
    expect(errores).toContain('"Día 2" no tiene ejercicios')
  })

  it('exige series mayores a cero', () => {
    const errores = validarBorrador({
      nombre: 'X',
      dias: [{
        nombre: 'Día 1',
        ejercicios: [{ ejercicio_id: 'e1', series: 0, repeticiones: '10' }],
      }],
    })
    expect(errores).toContain('"Día 1": las series tienen que ser al menos 1')
  })

  it('exige repeticiones', () => {
    const errores = validarBorrador({
      nombre: 'X',
      dias: [{
        nombre: 'Día 1',
        ejercicios: [{ ejercicio_id: 'e1', series: 3, repeticiones: '  ' }],
      }],
    })
    expect(errores).toContain('"Día 1": poné las repeticiones')
  })

  it('junta todos los errores, no corta en el primero', () => {
    expect(validarBorrador({ nombre: '', dias: [] })).toHaveLength(2)
  })
})

describe('diaAMostrar', () => {
  const dias = [
    { id: 'b', orden: 2 },
    { id: 'a', orden: 1 },
    { id: 'c', orden: 3 },
  ]

  it('sin día recordado abre el primero por orden', () => {
    expect(diaAMostrar(dias, null)!.id).toBe('a')
  })

  it('abre el día recordado', () => {
    expect(diaAMostrar(dias, 'c')!.id).toBe('c')
  })

  it('si el día recordado ya no existe, vuelve al primero', () => {
    expect(diaAMostrar(dias, 'borrado')!.id).toBe('a')
  })

  it('sin días devuelve null', () => {
    expect(diaAMostrar([], 'c')).toBeNull()
  })
})
