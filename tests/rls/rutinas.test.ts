import { beforeAll, describe, expect, it } from 'vitest'
import { admin, crearEscenario, type Escenario } from './ayudas'

describe('esquema de rutinas', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
  })

  it('una plantilla no puede tener propietario', async () => {
    const { error } = await admin.from('rutinas').insert({
      gym_id: e.gymA,
      nombre: 'Full body',
      tipo: 'plantilla',
      propietario_id: e.socioAMembresiaId,
    })
    expect(error).not.toBeNull()
  })

  it('una rutina activa exige propietario', async () => {
    const { error } = await admin.from('rutinas').insert({
      gym_id: e.gymA,
      nombre: 'Full body',
      tipo: 'activa',
      propietario_id: null,
    })
    expect(error).not.toBeNull()
  })

  it('una plantilla no puede estar asignada a nadie', async () => {
    const { error } = await admin.from('rutinas').insert({
      gym_id: e.gymA,
      nombre: 'Full body',
      tipo: 'plantilla',
      asignada_por: e.entrenadorAMembresiaId,
    })
    expect(error).not.toBeNull()
  })

  it('acepta una plantilla bien formada con sus días y ejercicios', async () => {
    const { data: rutina, error } = await admin
      .from('rutinas')
      .insert({ gym_id: e.gymA, nombre: 'Full body', tipo: 'plantilla' })
      .select('id')
      .single()
    expect(error).toBeNull()

    const { data: dia, error: errorDia } = await admin
      .from('rutina_dias')
      .insert({ rutina_id: rutina!.id, orden: 1, nombre: 'Día 1 — Pecho' })
      .select('id')
      .single()
    expect(errorDia).toBeNull()

    const { data: ejercicio } = await admin
      .from('ejercicios')
      .select('id')
      .limit(1)
      .single()

    const { error: errorEj } = await admin.from('rutina_ejercicios').insert({
      rutina_dia_id: dia!.id,
      ejercicio_id: ejercicio!.id,
      orden: 1,
      series: 4,
      repeticiones: '8-12',
    })
    expect(errorEj).toBeNull()
  })

  it('no acepta series en cero', async () => {
    const { data: rutina } = await admin
      .from('rutinas')
      .insert({ gym_id: e.gymA, nombre: 'Otra', tipo: 'plantilla' })
      .select('id')
      .single()
    const { data: dia } = await admin
      .from('rutina_dias')
      .insert({ rutina_id: rutina!.id, orden: 1, nombre: 'Día 1' })
      .select('id')
      .single()
    const { data: ejercicio } = await admin
      .from('ejercicios').select('id').limit(1).single()

    const { error } = await admin.from('rutina_ejercicios').insert({
      rutina_dia_id: dia!.id,
      ejercicio_id: ejercicio!.id,
      orden: 1,
      series: 0,
      repeticiones: '8-12',
    })
    expect(error).not.toBeNull()
  })
})
