import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, crearEscenario, type Escenario } from '../rls/ayudas'

const URL = process.env.API_URL ?? 'http://127.0.0.1:54321'

/** Llama a la función y devuelve el status y el cuerpo, sea éxito o error. */
async function alta(cliente: SupabaseClient, cuerpo: Record<string, unknown>) {
  const { data, error } = await cliente.functions.invoke('socio-alta', { body: cuerpo })
  if (error instanceof FunctionsHttpError) {
    const respuesta = error.context as Response
    return { status: respuesta.status, cuerpo: await respuesta.json() }
  }
  if (error) throw error
  return { status: 200, cuerpo: data }
}

async function puedeEntrar(email: string, password: string): Promise<boolean> {
  const cliente = createClient(URL, process.env.ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await cliente.auth.signInWithPassword({ email, password })
  return !error
}

describe('socio-alta', () => {
  let e: Escenario
  const sufijo = Math.random().toString(36).slice(2, 10)
  const datos = (campos: Record<string, unknown> = {}) => ({
    nombre: 'Juan', apellido: 'Pérez', telefono: '1155550000',
    email: `nuevo-${sufijo}@ejemplo.com`, password: 'tigre-faro-4821',
    ...campos,
  })

  beforeAll(async () => {
    e = await crearEscenario()
  })

  it('el admin crea un socio nuevo que ya puede entrar', async () => {
    const r = await alta(e.comoAdminA, { gym_id: e.gymA, ...datos() })
    expect(r.status).toBe(200)
    expect(r.cuerpo.resultado).toBe('creado')

    const { data: membresia } = await admin
      .from('memberships').select('gym_id, rol, estado, user_id').eq('id', r.cuerpo.membership_id).single()
    expect(membresia).toMatchObject({ gym_id: e.gymA, rol: 'socio', estado: 'activo' })

    const { data: perfil } = await admin
      .from('profiles').select('nombre, apellido, telefono').eq('id', membresia!.user_id).single()
    expect(perfil).toEqual({ nombre: 'Juan', apellido: 'Pérez', telefono: '1155550000' })

    expect(await puedeEntrar(`nuevo-${sufijo}@ejemplo.com`, 'tigre-faro-4821')).toBe(true)
  })

  it('el mismo email otra vez, aunque venga con mayúsculas, ya es socio', async () => {
    const r = await alta(e.comoAdminA, {
      gym_id: e.gymA, ...datos({ email: `  NUEVO-${sufijo}@Ejemplo.com ` }),
    })
    expect(r.status).toBe(200)
    expect(r.cuerpo.resultado).toBe('ya_es_socio')
  })

  // Review Focus 5.
  it('guarda el email en minúsculas', async () => {
    const email = `Mayus-${sufijo}@Ejemplo.COM`
    const r = await alta(e.comoAdminA, { gym_id: e.gymA, ...datos({ email: ` ${email} ` }) })
    expect(r.cuerpo.resultado).toBe('creado')
    expect(await puedeEntrar(email.toLowerCase(), 'tigre-faro-4821')).toBe(true)
  })

  it('alguien con cuenta en otro gimnasio suma la membresía y conserva su contraseña', async () => {
    const { data: m } = await admin.from('memberships').select('user_id').eq('id', e.socioBMembresiaId).single()
    const { data: usuario } = await admin.auth.admin.getUserById(m!.user_id)
    const email = usuario.user!.email!

    const r = await alta(e.comoAdminA, { gym_id: e.gymA, ...datos({ email, password: 'otra-clave-9999' }) })
    expect(r.status).toBe(200)
    expect(r.cuerpo.resultado).toBe('cuenta_existente')

    const { data: nueva } = await admin
      .from('memberships').select('gym_id, user_id').eq('id', r.cuerpo.membership_id).single()
    expect(nueva).toEqual({ gym_id: e.gymA, user_id: m!.user_id })

    // La contraseña de ayudas.ts sigue andando; la que mandó el admin, no.
    expect(await puedeEntrar(email, 'prueba-123456')).toBe(true)
    expect(await puedeEntrar(email, 'otra-clave-9999')).toBe(false)
  })

  it('el entrenador no puede dar de alta', async () => {
    const r = await alta(e.comoEntrenadorA, { gym_id: e.gymA, ...datos({ email: `ent-${sufijo}@ejemplo.com` }) })
    expect(r.status).toBe(403)
    expect(r.cuerpo.error).toBe('Solo un administrador puede dar de alta socios')
  })

  it('el admin de A no puede dar de alta en el gimnasio B', async () => {
    const r = await alta(e.comoAdminA, { gym_id: e.gymB, ...datos({ email: `cruzado-${sufijo}@ejemplo.com` }) })
    expect(r.status).toBe(403)
  })

  it('un email mal escrito vuelve con el mensaje para mostrar', async () => {
    const r = await alta(e.comoAdminA, { gym_id: e.gymA, ...datos({ email: 'juan@mail' }) })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toBe('Ese email no es válido')
  })

  it('una contraseña corta también', async () => {
    const r = await alta(e.comoAdminA, {
      gym_id: e.gymA, ...datos({ email: `corta-${sufijo}@ejemplo.com`, password: '1234' }),
    })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toBe('La contraseña tiene que tener al menos 8 caracteres')
  })
})
