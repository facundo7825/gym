import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = process.env.API_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.ANON_KEY!
const SERVICE = process.env.SERVICE_ROLE_KEY!

/** Cliente que saltea RLS. Solo para preparar datos de prueba. */
export const admin: SupabaseClient = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Crea un usuario y devuelve un cliente autenticado COMO ese usuario. */
async function crearUsuario(email: string): Promise<{
  id: string
  cliente: SupabaseClient
}> {
  const password = 'prueba-123456'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error

  const cliente = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: errorLogin } = await cliente.auth.signInWithPassword({
    email,
    password,
  })
  if (errorLogin) throw errorLogin

  return { id: data.user.id, cliente }
}

export interface Escenario {
  gymA: string
  gymB: string
  socioAId: string
  socioA2Id: string
  entrenadorAId: string
  /** memberships.id del socio A. `rutinas.propietario_id` apunta acá, no a auth.users. */
  socioAMembresiaId: string
  socioA2MembresiaId: string
  entrenadorAMembresiaId: string
  /** Hace falta para cargar sesiones del gimnasio B y probar que el A no las ve. */
  socioBMembresiaId: string
  comoAdminA: SupabaseClient
  comoSocioA: SupabaseClient
  comoSocioA2: SupabaseClient
  comoEntrenadorA: SupabaseClient
  comoSocioB: SupabaseClient
  comoSuperadmin: SupabaseClient
}

/**
 * Dos gimnasios sin ninguna relación entre sí, cada uno con sus usuarios.
 * Todos los tests de aislamiento parten de acá: lo que se verifica siempre
 * es que alguien del gimnasio A no alcance nada del gimnasio B.
 */
export async function crearEscenario(): Promise<Escenario> {
  const sufijo = Math.random().toString(36).slice(2, 10)

  const { data: gyms, error } = await admin
    .from('gyms')
    .insert([
      { nombre: 'Gimnasio A', slug: `gym-a-${sufijo}` },
      { nombre: 'Gimnasio B', slug: `gym-b-${sufijo}` },
    ])
    .select('id, slug')
  if (error) throw error

  const gymA = gyms.find((g) => g.slug.startsWith('gym-a'))!.id
  const gymB = gyms.find((g) => g.slug.startsWith('gym-b'))!.id

  const adminA = await crearUsuario(`admin-a-${sufijo}@ejemplo.com`)
  const socioA = await crearUsuario(`socio-a-${sufijo}@ejemplo.com`)
  const socioA2 = await crearUsuario(`socio-a2-${sufijo}@ejemplo.com`)
  const entrenadorA = await crearUsuario(`entrenador-a-${sufijo}@ejemplo.com`)
  const socioB = await crearUsuario(`socio-b-${sufijo}@ejemplo.com`)
  // Sin membresía en ningún gimnasio: lo que le da acceso es únicamente
  // es_superadmin, no pertenecer a A ni a B. Así el test de la rama
  // `or soy_superadmin()` no se confunde con el de pertenencia normal.
  const superadmin = await crearUsuario(`superadmin-${sufijo}@ejemplo.com`)

  const { data: membresias, error: errorMem } = await admin
    .from('memberships')
    .insert([
      { gym_id: gymA, user_id: adminA.id, rol: 'admin' },
      { gym_id: gymA, user_id: socioA.id, rol: 'socio' },
      { gym_id: gymA, user_id: socioA2.id, rol: 'socio' },
      { gym_id: gymA, user_id: entrenadorA.id, rol: 'entrenador' },
      { gym_id: gymB, user_id: socioB.id, rol: 'socio' },
    ])
    .select('id, user_id')
  if (errorMem) throw errorMem

  const membresiaDe = (userId: string) => membresias.find((m) => m.user_id === userId)!.id

  // El cliente admin saltea RLS: es la única forma de otorgar es_superadmin,
  // porque los grants de columna que agrega esta tarea se lo prohíben a
  // cualquier usuario autenticado normal (ver 0002_rls_identidad.sql).
  const { error: errorSuperadmin } = await admin
    .from('profiles')
    .update({ es_superadmin: true })
    .eq('id', superadmin.id)
  if (errorSuperadmin) throw errorSuperadmin

  return {
    gymA,
    gymB,
    socioAId: socioA.id,
    socioA2Id: socioA2.id,
    entrenadorAId: entrenadorA.id,
    socioAMembresiaId: membresiaDe(socioA.id),
    socioA2MembresiaId: membresiaDe(socioA2.id),
    entrenadorAMembresiaId: membresiaDe(entrenadorA.id),
    socioBMembresiaId: membresiaDe(socioB.id),
    comoAdminA: adminA.cliente,
    comoSocioA: socioA.cliente,
    comoSocioA2: socioA2.cliente,
    comoEntrenadorA: entrenadorA.cliente,
    comoSocioB: socioB.cliente,
    comoSuperadmin: superadmin.cliente,
  }
}
