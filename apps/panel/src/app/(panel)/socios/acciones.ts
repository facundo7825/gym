'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { normalizarEmail, validarAlta } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { miMembresia } from '@/lib/membresia'

// Las reglas de quién puede hacer qué viven en la RLS y en las funciones de
// la base: acá no se vuelve a chequear el rol, para no tener la regla escrita
// en dos lados. Ver la sección 1 del diseño de la etapa 4.

export type Resultado = { error?: string }

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? '').trim()
const SESION_VENCIDA = 'Tu sesión venció. Volvé a entrar.'

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

export type EstadoAlta = {
  error?: string
  /** Lo que se escribió, para no perderlo si algo falla: React vacía el formulario al terminar la acción. */
  valores?: { nombre: string; apellido: string; email: string; telefono: string }
  hecho?: { resultado: 'creado' | 'cuenta_existente'; membershipId: string; email: string; password: string }
}

type RespuestaAlta = { resultado: 'creado' | 'cuenta_existente' | 'ya_es_socio'; membership_id: string }

export async function darDeAlta(_previo: EstadoAlta, datos: FormData): Promise<EstadoAlta> {
  const valores = {
    nombre: texto(datos, 'nombre'),
    apellido: texto(datos, 'apellido'),
    email: texto(datos, 'email'),
    telefono: texto(datos, 'telefono'),
  }
  const password = String(datos.get('password') ?? '')
  const invalido = validarAlta({ ...valores, password })
  if (invalido) return { error: invalido, valores }

  const yo = await miMembresia()
  if (!yo) return { error: SESION_VENCIDA, valores }

  const email = normalizarEmail(valores.email)
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.functions.invoke<RespuestaAlta>('socio-alta', {
    body: { gym_id: yo.gym_id, nombre: valores.nombre, apellido: valores.apellido, email, telefono: valores.telefono, password },
  })
  if (error || !data) return { error: await mensajeDeLaFuncion(error), valores }

  revalidatePath('/socios')
  // Fuera de cualquier try: redirect funciona tirando una excepción.
  if (data.resultado === 'ya_es_socio') redirect(`/socios/${data.membership_id}?aviso=ya-es-socio`)

  return {
    hecho: {
      resultado: data.resultado,
      membershipId: data.membership_id,
      email,
      // A alguien que ya tenía cuenta no se le cambió la contraseña: no hay
      // nada que mostrar.
      password: data.resultado === 'creado' ? password : '',
    },
  }
}

/** El mensaje que la función ya armó para mostrar, o uno genérico. */
async function mensajeDeLaFuncion(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const cuerpo = await (error.context as Response).json()
      if (typeof cuerpo?.error === 'string') return cuerpo.error
    } catch {
      // Un cuerpo que no es JSON cae en el genérico.
    }
  }
  return 'No se pudo crear la cuenta, probá de nuevo'
}
