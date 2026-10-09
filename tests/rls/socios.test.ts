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


describe('quién puede hacer qué con las cuotas', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
    await cuotaDe(e.gymA, e.socioAMembresiaId)
    await cuotaDe(e.gymA, e.socioA2MembresiaId)
    await cuotaDe(e.gymB, e.socioBMembresiaId)
  })

  it('el admin registra un pago a su nombre', async () => {
    const { error } = await e.comoAdminA.from('cuotas').insert(
      cuotaPara(e.gymA, e.socioAMembresiaId, { registrado_por: e.adminAMembresiaId }),
    )
    expect(error).toBeNull()
  })

  it('el admin no puede registrar un pago a nombre de otro empleado', async () => {
    const { error } = await e.comoAdminA.from('cuotas').insert(
      cuotaPara(e.gymA, e.socioAMembresiaId, { registrado_por: e.entrenadorAMembresiaId }),
    )
    expect(error).not.toBeNull()
  })

  it('el admin de A no puede registrar un pago en el gimnasio B', async () => {
    const { error } = await e.comoAdminA.from('cuotas').insert(
      cuotaPara(e.gymB, e.socioBMembresiaId, { registrado_por: e.adminAMembresiaId }),
    )
    expect(error).not.toBeNull()
  })

  it('el entrenador no puede registrar pagos', async () => {
    const { error } = await e.comoEntrenadorA.from('cuotas').insert(
      cuotaPara(e.gymA, e.socioAMembresiaId, { registrado_por: e.entrenadorAMembresiaId }),
    )
    expect(error).not.toBeNull()
  })

  it('el entrenador ve las cuotas de todo su gimnasio, para el escaneo', async () => {
    const { data } = await e.comoEntrenadorA.from('cuotas').select('membership_id')
    const socios = new Set(data!.map((c) => c.membership_id))
    expect(socios.has(e.socioAMembresiaId)).toBe(true)
    expect(socios.has(e.socioA2MembresiaId)).toBe(true)
    expect(socios.has(e.socioBMembresiaId)).toBe(false)
  })

  it('el socio ve solo las suyas', async () => {
    const { data } = await e.comoSocioA.from('cuotas').select('membership_id')
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((c) => c.membership_id === e.socioAMembresiaId)).toBe(true)
  })

  it('el socio no puede registrarse un pago', async () => {
    const { error } = await e.comoSocioA.from('cuotas').insert(cuotaPara(e.gymA, e.socioAMembresiaId))
    expect(error).not.toBeNull()
  })

  it('nadie edita un pago: se borra y se carga de nuevo', async () => {
    const { data } = await e.comoAdminA
      .from('cuotas').update({ monto: 1 }).eq('membership_id', e.socioAMembresiaId).select('id')
    expect(data).toEqual([])
  })

  it('el entrenador no puede borrar un pago', async () => {
    const id = await cuotaDe(e.gymA, e.socioA2MembresiaId)
    await e.comoEntrenadorA.from('cuotas').delete().eq('id', id)
    const { data } = await admin.from('cuotas').select('id').eq('id', id)
    expect(data).toHaveLength(1)
  })

  it('el admin sí puede borrar un pago mal cargado', async () => {
    const id = await cuotaDe(e.gymA, e.socioA2MembresiaId)
    const { data } = await e.comoAdminA.from('cuotas').delete().eq('id', id).select('id')
    expect(data).toHaveLength(1)
  })
})

describe('quién puede hacer qué con la asistencia', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
    await checkinDe(e.gymA, e.socioAMembresiaId)
    await checkinDe(e.gymA, e.socioA2MembresiaId)
    await checkinDe(e.gymB, e.socioBMembresiaId)
  })

  // Las entradas se crean solo con checkin_por_qr y checkin_manual (0018):
  // son las que calculan el día en la zona del gimnasio.
  it('nadie inserta un check-in directo, ni el admin', async () => {
    for (const cliente of [e.comoAdminA, e.comoEntrenadorA, e.comoSocioA]) {
      const { error } = await cliente
        .from('checkins')
        .insert({ gym_id: e.gymA, membership_id: e.socioAMembresiaId, metodo: 'manual', dia: '2026-10-20' })
      expect(error).not.toBeNull()
    }
  })

  it('el entrenador ve las entradas de todo su gimnasio y de ningún otro', async () => {
    const { data } = await e.comoEntrenadorA.from('checkins').select('membership_id')
    const socios = new Set(data!.map((c) => c.membership_id))
    expect(socios.has(e.socioAMembresiaId)).toBe(true)
    expect(socios.has(e.socioA2MembresiaId)).toBe(true)
    expect(socios.has(e.socioBMembresiaId)).toBe(false)
  })

  it('el socio ve solo las suyas', async () => {
    const { data } = await e.comoSocioA.from('checkins').select('membership_id')
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((c) => c.membership_id === e.socioAMembresiaId)).toBe(true)
  })

  it('nadie edita una entrada', async () => {
    const { data } = await e.comoAdminA
      .from('checkins').update({ metodo: 'qr' }).eq('membership_id', e.socioAMembresiaId).select('id')
    expect(data).toEqual([])
  })

  it('el entrenador no puede borrar una entrada', async () => {
    const id = await checkinDe(e.gymA, e.socioAMembresiaId, '2026-10-03')
    await e.comoEntrenadorA.from('checkins').delete().eq('id', id)
    const { data } = await admin.from('checkins').select('id').eq('id', id)
    expect(data).toHaveLength(1)
  })

  it('el admin sí puede borrar una entrada cargada por error', async () => {
    const id = await checkinDe(e.gymA, e.socioAMembresiaId, '2026-10-04')
    const { data } = await e.comoAdminA.from('checkins').delete().eq('id', id).select('id')
    expect(data).toHaveLength(1)
  })
})

describe('el código QR es solo de su dueño', () => {
  let e: Escenario
  let codigoA: string

  beforeAll(async () => {
    e = await crearEscenario()
    const { data } = await admin
      .from('memberships').select('codigo_qr').eq('id', e.socioAMembresiaId).single()
    codigoA = data!.codigo_qr
  })

  // Sin esto, memberships_leer le deja a cualquier socio leer las membresías
  // de todo su gimnasio con el código incluido, y generar el QR de otro.
  it('un socio no lee el código de otro socio de su gimnasio', async () => {
    const { data, error } = await e.comoSocioA2
      .from('memberships').select('codigo_qr').eq('id', e.socioAMembresiaId)
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('el admin tampoco lo lee: el panel no lo necesita', async () => {
    const { error } = await e.comoAdminA.from('memberships').select('codigo_qr').eq('gym_id', e.gymA)
    expect(error).not.toBeNull()
  })

  it('las demás columnas se siguen leyendo', async () => {
    const { data, error } = await e.comoSocioA
      .from('memberships').select('id, gym_id, rol, estado, foto').eq('id', e.socioAMembresiaId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('el socio obtiene el suyo con mi_codigo_qr', async () => {
    const { data, error } = await e.comoSocioA.rpc('mi_codigo_qr', { p_gym_id: e.gymA })
    expect(error).toBeNull()
    expect(data).toBe(codigoA)
  })

  it('mi_codigo_qr de un gimnasio ajeno devuelve null', async () => {
    const { data } = await e.comoSocioA.rpc('mi_codigo_qr', { p_gym_id: e.gymB })
    expect(data).toBeNull()
  })
})

describe('editar los datos de un socio', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
  })

  const editar = (cliente: Escenario['comoAdminA'], membershipId: string, nombre = 'Juana') =>
    cliente.rpc('editar_datos_socio', {
      p_membership_id: membershipId, p_nombre: nombre, p_apellido: 'Pérez', p_telefono: '1155550000',
    })

  it('el admin edita a un socio de su gimnasio', async () => {
    const { error } = await editar(e.comoAdminA, e.socioAMembresiaId)
    expect(error).toBeNull()
    const { data } = await admin
      .from('profiles').select('nombre, apellido, telefono').eq('id', e.socioAId).single()
    expect(data).toEqual({ nombre: 'Juana', apellido: 'Pérez', telefono: '1155550000' })
  })

  it('el entrenador no puede', async () => {
    const { error } = await editar(e.comoEntrenadorA, e.socioA2MembresiaId)
    expect(error?.code).toBe('42501')
  })

  it('el admin de A no alcanza a un socio de B', async () => {
    const { error } = await editar(e.comoAdminA, e.socioBMembresiaId)
    expect(error?.code).toBe('42501')
  })

  it('no deja un nombre vacío', async () => {
    const { error } = await editar(e.comoAdminA, e.socioAMembresiaId, '   ')
    expect(error?.code).toBe('22023')
  })
})

describe('el socio no toca su membresía', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
  })

  // memberships_editar (0002) ya es solo para el admin; esto lo fija para la
  // foto, que es lo que el check-in compara contra la cara.
  it('un socio no puede cambiar su foto', async () => {
    const { data } = await e.comoSocioA
      .from('memberships').update({ foto: 'otra.jpg' }).eq('id', e.socioAMembresiaId).select('id')
    expect(data).toEqual([])
  })

  it('el entrenador tampoco puede dar de baja', async () => {
    const { data } = await e.comoEntrenadorA
      .from('memberships').update({ estado: 'inactivo' }).eq('id', e.socioAMembresiaId).select('id')
    expect(data).toEqual([])
  })
})

// Se exportan para los describe de las tareas siguientes, que viven en este
// mismo archivo.
export { cuotaPara, cuotaDe, checkinDe }
