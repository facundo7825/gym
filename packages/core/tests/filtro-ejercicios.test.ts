import { describe, expect, it } from 'vitest'
import { filtrarEjercicios, type EjercicioFiltrable } from '../src/filtro-ejercicios'

const catalogo: EjercicioFiltrable[] = [
  { id: '1', nombre: 'Press de banca con barra', grupo_muscular: 'pecho', equipamiento: 'barra', gym_id: null },
  { id: '2', nombre: 'Press inclinado con mancuernas', grupo_muscular: 'pecho', equipamiento: 'mancuerna', gym_id: null },
  { id: '3', nombre: 'Sentadilla con barra', grupo_muscular: 'cuadriceps', equipamiento: 'barra', gym_id: null },
  { id: '4', nombre: 'Prensa 45° Hammer', grupo_muscular: 'cuadriceps', equipamiento: 'maquina', gym_id: 'gym-1' },
  { id: '5', nombre: 'Remo con barra', grupo_muscular: 'espalda', equipamiento: 'barra', gym_id: null },
]
const nombres = (xs: EjercicioFiltrable[]) => xs.map((x) => x.nombre)
const SIN_FILTROS = { busqueda: '', grupo: null, equipo: null, soloMiGym: false }

describe('filtrarEjercicios', () => {
  it('sin filtros devuelve todo', () => {
    expect(filtrarEjercicios(catalogo, SIN_FILTROS)).toHaveLength(5)
  })

  it('busca por nombre sin distinguir mayúsculas ni espacios de más', () => {
    expect(nombres(filtrarEjercicios(catalogo, { ...SIN_FILTROS, busqueda: '  SENT ' })))
      .toEqual(['Sentadilla con barra'])
  })

  it('filtra por grupo muscular', () => {
    expect(nombres(filtrarEjercicios(catalogo, { ...SIN_FILTROS, grupo: 'pecho' })))
      .toEqual(['Press de banca con barra', 'Press inclinado con mancuernas'])
  })

  it('filtra por equipamiento', () => {
    expect(filtrarEjercicios(catalogo, { ...SIN_FILTROS, equipo: 'barra' })).toHaveLength(3)
  })

  it('combina grupo y equipamiento', () => {
    expect(nombres(filtrarEjercicios(catalogo, { ...SIN_FILTROS, grupo: 'pecho', equipo: 'barra' })))
      .toEqual(['Press de banca con barra'])
  })

  it('"solo lo que hay acá" deja fuera el catálogo global', () => {
    expect(nombres(filtrarEjercicios(catalogo, { ...SIN_FILTROS, soloMiGym: true })))
      .toEqual(['Prensa 45° Hammer'])
  })

  it('los tres filtros a la vez sin coincidencias devuelve vacío, no todo', () => {
    expect(filtrarEjercicios(catalogo, {
      busqueda: 'zzz', grupo: 'pecho', equipo: 'barra', soloMiGym: true,
    })).toEqual([])
  })

  // La búsqueda es lo que escribe el usuario: si alguien arma el filtro con
  // una expresión regular en vez de includes(), un paréntesis suelto explota.
  it('no se rompe con caracteres especiales en la búsqueda', () => {
    expect(filtrarEjercicios(catalogo, { ...SIN_FILTROS, busqueda: '45°' }))
      .toHaveLength(1)
    expect(filtrarEjercicios(catalogo, { ...SIN_FILTROS, busqueda: '(' })).toEqual([])
  })
})
