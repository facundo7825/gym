import { beforeAll, describe, expect, it } from 'vitest'
import { admin, crearEscenario, type Escenario } from './ayudas'

describe('aislamiento de ejercicios, máquinas y videos', () => {
  let e: Escenario
  let ejercicioDeB: string
  let maquinaDeB: string
  let maquinaDeA: string

  beforeAll(async () => {
    e = await crearEscenario()

    const { data: maquinaB } = await admin
      .from('maquinas')
      .insert({ gym_id: e.gymB, nombre: 'Prensa Hammer' })
      .select('id').single()
    maquinaDeB = maquinaB!.id

    const { data: maquinaA } = await admin
      .from('maquinas')
      .insert({ gym_id: e.gymA, nombre: 'Prensa del gym A' })
      .select('id').single()
    maquinaDeA = maquinaA!.id

    const { data: ejercicio } = await admin
      .from('ejercicios')
      .insert({
        gym_id: e.gymB, nombre: 'Prensa 45° del gym B',
        grupo_muscular: 'cuadriceps', equipamiento: 'maquina',
      })
      .select('id').single()
    ejercicioDeB = ejercicio!.id

    // Ejercicio del catálogo global: lo tienen que ver los dos gimnasios.
    await admin.from('ejercicios').insert({
      gym_id: null, nombre: 'Sentadilla con barra',
      grupo_muscular: 'cuadriceps', equipamiento: 'barra',
    })
  })

  it('un socio ve los ejercicios del catálogo global', async () => {
    const { data } = await e.comoSocioA
      .from('ejercicios').select('nombre').is('gym_id', null)
    expect(data?.some((x) => x.nombre === 'Sentadilla con barra')).toBe(true)
  })

  it('un socio NO ve los ejercicios propios de otro gimnasio', async () => {
    const { data } = await e.comoSocioA
      .from('ejercicios').select('id').eq('id', ejercicioDeB)
    expect(data).toEqual([])
  })

  it('un socio NO ve las máquinas de otro gimnasio', async () => {
    const { data } = await e.comoSocioA
      .from('maquinas').select('id').eq('id', maquinaDeB)
    expect(data).toEqual([])
  })

  it('un socio SÍ ve las máquinas de su propio gimnasio', async () => {
    const { data } = await e.comoSocioA
      .from('maquinas').select('id').eq('id', maquinaDeA)
    expect(data?.map((m) => m.id)).toEqual([maquinaDeA])
  })

  it('un socio NO puede crear ejercicios ni en su propio gimnasio', async () => {
    const { error } = await e.comoSocioA.from('ejercicios').insert({
      gym_id: e.gymA, nombre: 'Inventado',
      grupo_muscular: 'pecho', equipamiento: 'barra',
    })
    expect(error).not.toBeNull()
  })

  it('un socio NO puede crear máquinas', async () => {
    const { error } = await e.comoSocioA.from('maquinas').insert({
      gym_id: e.gymA, nombre: 'Máquina inventada',
    })
    expect(error).not.toBeNull()
  })

  it('un admin SÍ puede crear ejercicios en su gimnasio', async () => {
    const { error } = await e.comoAdminA.from('ejercicios').insert({
      gym_id: e.gymA, nombre: 'Press plano del gym A',
      grupo_muscular: 'pecho', equipamiento: 'barra',
    })
    expect(error).toBeNull()
  })

  it('un admin NO puede meter ejercicios en el catálogo global', async () => {
    const { error } = await e.comoAdminA.from('ejercicios').insert({
      gym_id: null, nombre: 'Intento de colarse',
      grupo_muscular: 'pecho', equipamiento: 'barra',
    })
    expect(error).not.toBeNull()
  })

  it('un admin NO puede crear ejercicios en un gimnasio ajeno', async () => {
    const { error } = await e.comoAdminA.from('ejercicios').insert({
      gym_id: e.gymB, nombre: 'Intento cruzado',
      grupo_muscular: 'pecho', equipamiento: 'barra',
    })
    expect(error).not.toBeNull()
  })

  // Alcance de este test, para no leerle de más: comprueba el comportamiento
  // observable a través de PostgREST, que es como entran las apps. NO aísla
  // el `with check` de la política: se comprobó que PostgREST rechaza el
  // update igual —la fila deja de ser visible después— aunque la política
  // tenga `with check (true)`. La garantía a nivel SQL la da el `with check`
  // explícito de 0004_rls_ejercicios.sql, verificado aparte con psql.
  it('un admin NO puede mudar un ejercicio suyo a otro gimnasio', async () => {
    const { data: mio } = await e.comoAdminA
      .from('ejercicios')
      .insert({
        gym_id: e.gymA, nombre: 'Para intentar mudarlo',
        grupo_muscular: 'espalda', equipamiento: 'barra',
      })
      .select('id').single()

    const { error } = await e.comoAdminA
      .from('ejercicios')
      .update({ gym_id: e.gymB })
      .eq('id', mio!.id)
    expect(error).not.toBeNull()

    // Y la fila quedó donde estaba.
    const { data: despues } = await admin
      .from('ejercicios').select('gym_id').eq('id', mio!.id).single()
    expect(despues!.gym_id).toBe(e.gymA)
  })

  // Esto no lo cubre RLS: es la clave foránea compuesta (maquina_id, gym_id).
  it('un ejercicio NO puede apuntar a una máquina de otro gimnasio', async () => {
    const { error } = await e.comoAdminA.from('ejercicios').insert({
      gym_id: e.gymA, nombre: 'Con máquina ajena',
      grupo_muscular: 'cuadriceps', equipamiento: 'maquina',
      maquina_id: maquinaDeB,
    })
    expect(error).not.toBeNull()
  })

  it('un ejercicio SÍ puede apuntar a una máquina de su gimnasio', async () => {
    const { error } = await e.comoAdminA.from('ejercicios').insert({
      gym_id: e.gymA, nombre: 'Con máquina propia',
      grupo_muscular: 'cuadriceps', equipamiento: 'maquina',
      maquina_id: maquinaDeA,
    })
    expect(error).toBeNull()
  })

  // Ninguna de las tres tablas define política de DELETE, y con RLS activa
  // eso significa denegado para todos. Sin test, nadie se entera si alguien
  // agrega una política de borrado sin pensarla.
  it('ni siquiera un admin puede borrar ejercicios', async () => {
    const { data: mio } = await e.comoAdminA
      .from('ejercicios')
      .insert({
        gym_id: e.gymA, nombre: 'Para intentar borrarlo',
        grupo_muscular: 'gemelos', equipamiento: 'peso_corporal',
      })
      .select('id').single()

    await e.comoAdminA.from('ejercicios').delete().eq('id', mio!.id)

    const { data: sigue } = await admin
      .from('ejercicios').select('id').eq('id', mio!.id)
    expect(sigue?.map((x) => x.id)).toEqual([mio!.id])
  })
})
