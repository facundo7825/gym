import { beforeAll, describe, expect, it } from 'vitest'
import { admin, crearEscenario, type Escenario } from './ayudas'

// ---------------------------------------------------------------------------
// Ayudas de este archivo. Preparan datos con el cliente admin, que saltea RLS:
// lo que se prueba después es lo que cada usuario puede hacer sobre esos datos.
// ---------------------------------------------------------------------------

/** Una cuota bien formada; `campos` pisa lo que haga falta para el caso. */
const cuotaPara = (gymId: string, membershipId: string, campos: Record<string, unknown> = {}) => ({
  gym_id: gymId,
  membership_id: membershipId,
  periodo_desde: '2026-10-15',
  periodo_hasta: '2026-11-15',
  monto: 25000,
  metodo: 'efectivo',
  fecha_pago: '2026-10-15',
  ...campos,
})

async function cuotaDe(gymId: string, membershipId: string, campos: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin.from('cuotas').insert(cuotaPara(gymId, membershipId, campos)).select('id').single()
  if (error) throw error
  return data.id
}

async function checkinDe(gymId: string, membershipId: string, dia = '2026-10-09'): Promise<string> {
  const { data, error } = await admin
    .from('checkins')
    .insert({ gym_id: gymId, membership_id: membershipId, metodo: 'manual', dia })
    .select('id').single()
  if (error) throw error
  return data.id
}

describe('esquema de cuotas y asistencia', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
  })

  it('acepta una cuota bien formada', async () => {
    const { error } = await admin.from('cuotas').insert(cuotaPara(e.gymA, e.socioAMembresiaId))
    expect(error).toBeNull()
  })

  it('no acepta un período que termina antes de empezar', async () => {
    const { error } = await admin.from('cuotas').insert(
      cuotaPara(e.gymA, e.socioAMembresiaId, { periodo_desde: '2026-11-15', periodo_hasta: '2026-10-15' }),
    )
    expect(error?.code).toBe('23514')
  })

  it('no acepta un período de cero días', async () => {
    const { error } = await admin.from('cuotas').insert(
      cuotaPara(e.gymA, e.socioAMembresiaId, { periodo_desde: '2026-10-15', periodo_hasta: '2026-10-15' }),
    )
    expect(error?.code).toBe('23514')
  })

  it('no acepta un monto negativo', async () => {
    const { error } = await admin.from('cuotas').insert(cuotaPara(e.gymA, e.socioAMembresiaId, { monto: -1 }))
    expect(error?.code).toBe('23514')
  })

  it('acepta un monto cero: una beca existe', async () => {
    const { error } = await admin.from('cuotas').insert(cuotaPara(e.gymA, e.socioAMembresiaId, { monto: 0 }))
    expect(error).toBeNull()
  })

  it('una cuota del gimnasio A no puede apuntar a una membresía del B', async () => {
    const { error } = await admin.from('cuotas').insert(cuotaPara(e.gymA, e.socioBMembresiaId))
    expect(error?.code).toBe('23503')
  })

  it('una cuota del gimnasio A no puede haber sido registrada por una membresía del B', async () => {
    const { error } = await admin.from('cuotas').insert(
      cuotaPara(e.gymA, e.socioAMembresiaId, { registrado_por: e.socioBMembresiaId }),
    )
    expect(error?.code).toBe('23503')
  })

  it('un check-in del gimnasio A no puede apuntar a una membresía del B', async () => {
    const { error } = await admin
      .from('checkins')
      .insert({ gym_id: e.gymA, membership_id: e.socioBMembresiaId, metodo: 'manual', dia: '2026-10-09' })
    expect(error?.code).toBe('23503')
  })

  it('la base no deja dos entradas del mismo socio el mismo día', async () => {
    await checkinDe(e.gymA, e.socioA2MembresiaId, '2026-10-01')
    const { error } = await admin
      .from('checkins')
      .insert({ gym_id: e.gymA, membership_id: e.socioA2MembresiaId, metodo: 'qr', dia: '2026-10-01' })
    expect(error?.code).toBe('23505')
  })

  it('el mismo socio sí puede entrar al día siguiente', async () => {
    await checkinDe(e.gymA, e.socioA2MembresiaId, '2026-10-02')
    const { count } = await admin
      .from('checkins').select('id', { count: 'exact', head: true })
      .eq('membership_id', e.socioA2MembresiaId)
    expect(count).toBe(2)
  })
})

// Se exportan para los describe de las tareas siguientes, que viven en este
// mismo archivo.
export { cuotaPara, cuotaDe, checkinDe }
