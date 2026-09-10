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

describe('permisos de rutinas', () => {
  let e: Escenario
  let plantillaA: string
  let propiaDelSocio: string
  let asignadaAlSocio: string
  let diaDePlantilla: string

  beforeAll(async () => {
    e = await crearEscenario()

    const { data: p } = await admin
      .from('rutinas')
      .insert({ gym_id: e.gymA, nombre: 'Plantilla del gym', tipo: 'plantilla' })
      .select('id').single()
    plantillaA = p!.id

    const { data: d } = await admin
      .from('rutina_dias')
      .insert({ rutina_id: plantillaA, orden: 1, nombre: 'Día 1' })
      .select('id').single()
    diaDePlantilla = d!.id

    const { data: propia } = await admin
      .from('rutinas')
      .insert({
        gym_id: e.gymA, nombre: 'La mía', tipo: 'activa',
        propietario_id: e.socioAMembresiaId,
      })
      .select('id').single()
    propiaDelSocio = propia!.id

    const { data: asignada } = await admin
      .from('rutinas')
      .insert({
        gym_id: e.gymA, nombre: 'La que me dieron', tipo: 'activa',
        propietario_id: e.socioAMembresiaId,
        asignada_por: e.entrenadorAMembresiaId,
      })
      .select('id').single()
    asignadaAlSocio = asignada!.id
  })

  const nombreDe = async (cliente: typeof e.comoSocioA, id: string) => {
    const { data } = await cliente.from('rutinas').select('id').eq('id', id)
    return data ?? []
  }

  const renombrar = async (cliente: typeof e.comoSocioA, id: string) => {
    const { data } = await cliente
      .from('rutinas').update({ nombre: 'Renombrada' }).eq('id', id).select('id')
    return data ?? []
  }

  // --- Lectura -------------------------------------------------------------

  it('el socio ve las plantillas de su gimnasio: es el catálogo', async () => {
    expect(await nombreDe(e.comoSocioA, plantillaA)).toHaveLength(1)
  })

  it('el socio ve su propia rutina activa', async () => {
    expect(await nombreDe(e.comoSocioA, propiaDelSocio)).toHaveLength(1)
  })

  it('otro socio del mismo gimnasio NO ve la rutina activa ajena', async () => {
    expect(await nombreDe(e.comoSocioA2, propiaDelSocio)).toHaveLength(0)
  })

  it('el entrenador ve la rutina activa del socio, incluso la que se armó solo', async () => {
    expect(await nombreDe(e.comoEntrenadorA, propiaDelSocio)).toHaveLength(1)
  })

  it('el socio del gimnasio B no ve nada del gimnasio A', async () => {
    expect(await nombreDe(e.comoSocioB, plantillaA)).toHaveLength(0)
    expect(await nombreDe(e.comoSocioB, propiaDelSocio)).toHaveLength(0)
  })

  it('el socio del gimnasio B tampoco ve los días de una rutina del A', async () => {
    const { data } = await e.comoSocioB
      .from('rutina_dias').select('id').eq('id', diaDePlantilla)
    expect(data ?? []).toHaveLength(0)
  })

  // --- Escritura: la matriz ------------------------------------------------

  it('plantilla: la edita el entrenador', async () => {
    expect(await renombrar(e.comoEntrenadorA, plantillaA)).toHaveLength(1)
  })

  it('plantilla: NO la edita el socio', async () => {
    expect(await renombrar(e.comoSocioA, plantillaA)).toHaveLength(0)
  })

  it('activa propia: la edita su dueño', async () => {
    expect(await renombrar(e.comoSocioA, propiaDelSocio)).toHaveLength(1)
  })

  it('activa propia: NO la edita el entrenador', async () => {
    expect(await renombrar(e.comoEntrenadorA, propiaDelSocio)).toHaveLength(0)
  })

  it('activa propia: NO la edita otro socio', async () => {
    expect(await renombrar(e.comoSocioA2, propiaDelSocio)).toHaveLength(0)
  })

  it('activa asignada: la edita su dueño', async () => {
    expect(await renombrar(e.comoSocioA, asignadaAlSocio)).toHaveLength(1)
  })

  it('activa asignada: la edita el entrenador que se la dio', async () => {
    expect(await renombrar(e.comoEntrenadorA, asignadaAlSocio)).toHaveLength(1)
  })

  it('activa asignada: NO la edita otro socio', async () => {
    expect(await renombrar(e.comoSocioA2, asignadaAlSocio)).toHaveLength(0)
  })

  // --- Escritura: alta -----------------------------------------------------

  it('el socio NO puede crear una plantilla', async () => {
    const { error } = await e.comoSocioA.from('rutinas').insert({
      gym_id: e.gymA, nombre: 'Trucha', tipo: 'plantilla',
    })
    expect(error).not.toBeNull()
  })

  it('el socio puede crearse una rutina activa propia', async () => {
    const { error } = await e.comoSocioA.from('rutinas').insert({
      gym_id: e.gymA, nombre: 'La que me armo', tipo: 'activa',
      propietario_id: e.socioAMembresiaId,
    })
    expect(error).toBeNull()
  })

  it('el socio NO puede crearse una rutina que diga que se la asignaron', async () => {
    const { error } = await e.comoSocioA.from('rutinas').insert({
      gym_id: e.gymA, nombre: 'Falsa asignada', tipo: 'activa',
      propietario_id: e.socioAMembresiaId,
      asignada_por: e.entrenadorAMembresiaId,
    })
    expect(error).not.toBeNull()
  })

  it('el socio NO puede crearle una rutina a otro socio', async () => {
    const { error } = await e.comoSocioA.from('rutinas').insert({
      gym_id: e.gymA, nombre: 'Para el otro', tipo: 'activa',
      propietario_id: e.socioA2MembresiaId,
    })
    expect(error).not.toBeNull()
  })

  it('no se puede agregar a una rutina un ejercicio de otro gimnasio', async () => {
    const { data: ejercicioB } = await admin
      .from('ejercicios')
      .insert({
        gym_id: e.gymB, nombre: 'Privado del B',
        grupo_muscular: 'pecho', equipamiento: 'barra',
      })
      .select('id').single()

    const { data: miDia } = await admin
      .from('rutina_dias')
      .insert({ rutina_id: propiaDelSocio, orden: 1, nombre: 'Día 1' })
      .select('id').single()

    const { error } = await e.comoSocioA.from('rutina_ejercicios').insert({
      rutina_dia_id: miDia!.id,
      ejercicio_id: ejercicioB!.id,
      orden: 1, series: 3, repeticiones: '10',
    })
    expect(error).not.toBeNull()
  })
})
