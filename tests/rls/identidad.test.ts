import { beforeAll, describe, expect, it } from 'vitest'
import { admin, crearEscenario, type Escenario } from './ayudas'

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

  it('un socio NO puede ascenderse a superadmin', async () => {
    await e.comoSocioA.from('profiles').update({ es_superadmin: true }).eq('id', e.socioAId)
    // Se verifica con el cliente admin, no con el del socio: un `[]` en la
    // respuesta del update podría venir de RLS o de que la fila simplemente
    // no se haya devuelto, y el test pasaría por el motivo equivocado.
    const { data } = await admin
      .from('profiles')
      .select('es_superadmin')
      .eq('id', e.socioAId)
      .single()
    expect(data?.es_superadmin).toBe(false)
  })

  it('un socio de A NO puede renombrar el gimnasio A', async () => {
    const { data } = await e.comoSocioA
      .from('gyms')
      .update({ nombre: 'Hackeado' })
      .eq('id', e.gymA)
      .select()
    expect(data).toEqual([])
  })

  it('el admin de A NO puede renombrar el gimnasio B', async () => {
    const { data } = await e.comoAdminA
      .from('gyms')
      .update({ nombre: 'Hackeado' })
      .eq('id', e.gymB)
      .select()
    expect(data).toEqual([])
  })

  it('un socio NO puede editar el perfil de otro socio de otro gimnasio', async () => {
    const { data } = await e.comoSocioB
      .from('profiles')
      .update({ nombre: 'Hackeado' })
      .eq('id', e.socioAId)
      .select()
    expect(data).toEqual([])
  })

  it('el superadmin ve los gimnasios de A y de B', async () => {
    const { data } = await e.comoSuperadmin.from('gyms').select('id')
    // Contención, no igualdad exacta: otros archivos de test comparten esta
    // misma base (fileParallelism: false, sin limpieza entre archivos) y
    // dejan sus propios gimnasios. soy_superadmin() los trae a todos, así
    // que una igualdad exacta se rompería por ruido ajeno a esta política.
    expect(data?.map((g) => g.id)).toEqual(
      expect.arrayContaining([e.gymA, e.gymB]),
    )
  })
})
