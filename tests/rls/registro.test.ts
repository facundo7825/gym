import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, crearEscenario, type Escenario } from './ayudas'

// ---------------------------------------------------------------------------
// Ayudas de este archivo. Preparan datos con el cliente admin, que saltea RLS:
// lo que se prueba después es lo que cada usuario puede hacer sobre esos datos.
// ---------------------------------------------------------------------------

/** Un ejercicio del catálogo global, visible para todos los gimnasios. */
async function unEjercicio(): Promise<string> {
  const { data, error } = await admin
    .from('ejercicios').select('id').is('gym_id', null).limit(1).single()
  if (error) throw error
  return data.id
}

async function sesionDe(
  gymId: string, membershipId: string, inicio = new Date().toISOString(),
): Promise<string> {
  const { data, error } = await admin
    .from('sesiones')
    .insert({ gym_id: gymId, membership_id: membershipId, inicio, id_local: randomUUID() })
    .select('id').single()
  if (error) throw error
  return data.id
}

async function serieEn(
  sesionId: string,
  ejercicioId: string,
  datos: { numero_serie?: number; peso_kg?: number; repeticiones?: number; completada?: boolean } = {},
): Promise<string> {
  const { data, error } = await admin
    .from('series_registradas')
    .insert({
      sesion_id: sesionId,
      ejercicio_id: ejercicioId,
      numero_serie: datos.numero_serie ?? 1,
      peso_kg: datos.peso_kg ?? 60,
      repeticiones: datos.repeticiones ?? 10,
      completada: datos.completada ?? true,
      id_local: randomUUID(),
    })
    .select('id').single()
  if (error) throw error
  return data.id
}

describe('esquema del registro', () => {
  let e: Escenario
  let ejercicio: string
  let sesion: string

  beforeAll(async () => {
    e = await crearEscenario()
    ejercicio = await unEjercicio()
    sesion = await sesionDe(e.gymA, e.socioAMembresiaId)
  })

  const serieCon = (campos: Record<string, unknown>) =>
    admin.from('series_registradas').insert({
      sesion_id: sesion, ejercicio_id: ejercicio, numero_serie: 1,
      peso_kg: 60, repeticiones: 10, id_local: randomUUID(),
      ...campos,
    })

  it('acepta una serie bien formada y la da por completada', async () => {
    const id = await serieEn(sesion, ejercicio)
    const { data } = await admin
      .from('series_registradas').select('completada').eq('id', id).single()
    expect(data!.completada).toBe(true)
  })

  it('acepta peso cero: los ejercicios con el propio cuerpo existen', async () => {
    const { error } = await serieCon({ peso_kg: 0 })
    expect(error).toBeNull()
  })

  it('no acepta peso negativo', async () => {
    const { error } = await serieCon({ peso_kg: -5 })
    expect(error?.code).toBe('23514')
  })

  it('no acepta cero repeticiones', async () => {
    const { error } = await serieCon({ repeticiones: 0 })
    expect(error?.code).toBe('23514')
  })

  it('no acepta un número de serie en cero', async () => {
    const { error } = await serieCon({ numero_serie: 0 })
    expect(error?.code).toBe('23514')
  })

  it('no acepta un RPE fuera de 1 a 10', async () => {
    const { error } = await serieCon({ rpe: 11 })
    expect(error?.code).toBe('23514')
  })

  it('no acepta una sesión que termina antes de empezar', async () => {
    const { error } = await admin.from('sesiones').insert({
      gym_id: e.gymA, membership_id: e.socioAMembresiaId,
      inicio: '2026-10-08T10:00:00Z', fin: '2026-10-08T09:00:00Z',
      id_local: randomUUID(),
    })
    expect(error?.code).toBe('23514')
  })

  it('un id_local repetido choca contra el índice único', async () => {
    const idLocal = randomUUID()
    await serieCon({ id_local: idLocal })
    const { error } = await serieCon({ id_local: idLocal })
    expect(error?.code).toBe('23505')
  })

  it('no se puede borrar del catálogo un ejercicio con series registradas', async () => {
    const { data: privado } = await admin
      .from('ejercicios')
      .insert({ gym_id: e.gymA, nombre: 'Press del gym', grupo_muscular: 'pecho', equipamiento: 'barra' })
      .select('id').single()
    await serieEn(sesion, privado!.id)

    const { error } = await admin.from('ejercicios').delete().eq('id', privado!.id)
    expect(error?.code).toBe('23503')
  })

  it('borrar la membresía se lleva su historial', async () => {
    // Una membresía propia para este test: borrar la del escenario rompería
    // los demás.
    const { data: usuario } = await admin.auth.admin.createUser({
      email: `se-va-${randomUUID().slice(0, 8)}@ejemplo.com`,
      password: 'prueba-123456', email_confirm: true,
    })
    const { data: membresia } = await admin
      .from('memberships')
      .insert({ gym_id: e.gymA, user_id: usuario.user!.id, rol: 'socio' })
      .select('id').single()
    const suya = await sesionDe(e.gymA, membresia!.id)
    const serie = await serieEn(suya, ejercicio)

    await admin.from('memberships').delete().eq('id', membresia!.id)

    const { data: sesiones } = await admin.from('sesiones').select('id').eq('id', suya)
    const { data: series } = await admin.from('series_registradas').select('id').eq('id', serie)
    expect(sesiones).toEqual([])
    expect(series).toEqual([])
  })
})
