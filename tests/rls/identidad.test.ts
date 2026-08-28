import { beforeAll, describe, expect, it } from 'vitest'
import { crearEscenario, type Escenario } from './ayudas'

describe('aislamiento de identidad entre gimnasios', () => {
  let e: Escenario
  beforeAll(async () => {
    e = await crearEscenario()
  })

  it('un socio ve su gimnasio', async () => {
    const { data } = await e.comoSocioA.from('gyms').select('id')
    expect(data?.map((g) => g.id)).toEqual([e.gymA])
  })

  it('un socio NO ve el gimnasio ajeno, ni pidiéndolo por id', async () => {
    const { data } = await e.comoSocioA.from('gyms').select('id').eq('id', e.gymB)
    expect(data).toEqual([])
  })

  it('un socio NO ve las membresías del gimnasio ajeno', async () => {
    const { data } = await e.comoSocioA
      .from('memberships')
      .select('id')
      .eq('gym_id', e.gymB)
    expect(data).toEqual([])
  })

  it('un socio NO ve el perfil de alguien de otro gimnasio', async () => {
    const { data } = await e.comoSocioB
      .from('profiles')
      .select('id')
      .eq('id', e.socioAId)
    expect(data).toEqual([])
  })

  it('el admin sí ve a los socios de SU gimnasio', async () => {
    const { data } = await e.comoAdminA
      .from('profiles')
      .select('id')
      .eq('id', e.socioAId)
    expect(data).toHaveLength(1)
  })

  it('un socio NO puede darse de alta en otro gimnasio', async () => {
    const { error } = await e.comoSocioA
      .from('memberships')
      .insert({ gym_id: e.gymB, user_id: e.socioAId, rol: 'admin' })
    expect(error).not.toBeNull()
  })

  it('un socio NO puede ascenderse a admin en su propio gimnasio', async () => {
    const { data } = await e.comoSocioA
      .from('memberships')
      .update({ rol: 'admin' })
      .eq('gym_id', e.gymA)
      .select()
    // Sin política de update para el rol socio, no afecta ninguna fila.
    expect(data).toEqual([])
  })

  it('nadie puede borrar membresías', async () => {
    const { data } = await e.comoAdminA
      .from('memberships')
      .delete()
      .eq('gym_id', e.gymA)
      .select()
    expect(data).toEqual([])
  })
})
