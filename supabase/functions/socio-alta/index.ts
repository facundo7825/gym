import { CORS } from '../_compartido/cors.ts'
import {
  clienteAlmacen,
  clienteUsuario,
  rechazoPrevio,
  usuarioAutenticado,
} from '../_compartido/peticion.ts'

// Crea la cuenta del socio desde el panel. Ver la sección 3 del diseño de la
// etapa 4.
//
// Las validaciones repiten las de validarAlta en @gym/core a propósito: esta
// función corre en Deno y no importa el paquete, y no puede confiar en que el
// panel validó. Los mensajes tienen que ser los mismos.
//
// La contraseña no se registra en ningún log: los console.error de abajo
// reciben el error de Supabase, nunca el cuerpo de la petición.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ERROR_GENERICO = 'No se pudo crear la cuenta, probá de nuevo'

interface Alta {
  gym_id: string
  email: string
  nombre: string
  apellido: string
  telefono: string | null
  password: string
}

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: CORS })

function leerAlta(cuerpo: unknown): Alta | string {
  const c = (cuerpo ?? {}) as Record<string, unknown>
  const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const alta: Alta = {
    gym_id: texto(c.gym_id),
    email: texto(c.email).toLowerCase(),
    nombre: texto(c.nombre),
    apellido: texto(c.apellido),
    telefono: texto(c.telefono) || null,
    password: typeof c.password === 'string' ? c.password : '',
  }
  if (!alta.gym_id) return 'Falta el gimnasio'
  if (!alta.nombre || !alta.apellido) return 'Poné el nombre y el apellido'
  if (!EMAIL.test(alta.email)) return 'Ese email no es válido'
  if (alta.password.length < 8) return 'La contraseña tiene que tener al menos 8 caracteres'
  return alta
}

Deno.serve(async (peticion) => {
  const rechazo = rechazoPrevio(peticion)
  if (rechazo) return rechazo
  const supabase = clienteUsuario(peticion.headers.get('Authorization')!)

  const user = await usuarioAutenticado(supabase)
  if (user instanceof Response) return user

  let cuerpo: unknown
  try {
    cuerpo = await peticion.json()
  } catch {
    return json({ error: 'El pedido llegó mal armado' }, 400)
  }
  const alta = leerAlta(cuerpo)
  if (typeof alta === 'string') return json({ error: alta }, 400)

  // Con el cliente de quien llama: memberships_leer ya limita a sus
  // gimnasios, así que un gym_id ajeno da null y cae en el 403.
  const { data: soyAdmin, error: errorRol } = await supabase
    .from('memberships').select('id')
    .eq('user_id', user.id).eq('gym_id', alta.gym_id)
    .eq('rol', 'admin').eq('estado', 'activo')
    .maybeSingle()
  if (errorRol) {
    console.error('No se pudo verificar el rol', errorRol)
    return json({ error: 'No pudimos verificar tu permiso' }, 500)
  }
  if (!soyAdmin) return json({ error: 'Solo un administrador puede dar de alta socios' }, 403)

  // De acá en adelante, service_role: crear usuarios y leer auth.users lo
  // exige. La autorización ya se decidió arriba.
  const almacen = clienteAlmacen()

  const { data: existente, error: errorBusqueda } = await almacen
    .rpc('usuario_por_email', { p_email: alta.email })
  if (errorBusqueda) {
    console.error('No se pudo buscar el email', errorBusqueda)
    return json({ error: ERROR_GENERICO }, 500)
  }

  if (existente) {
    const { data: yaEs } = await almacen
      .from('memberships').select('id')
      .eq('gym_id', alta.gym_id).eq('user_id', existente)
      .maybeSingle()
    if (yaEs) return json({ resultado: 'ya_es_socio', membership_id: yaEs.id })

    // La persona ya tiene cuenta —viene de otro gimnasio de la plataforma—:
    // se le suma la membresía y no se toca ni su contraseña ni su perfil.
    const { data: nueva, error } = await almacen
      .from('memberships')
      .insert({ gym_id: alta.gym_id, user_id: existente, rol: 'socio' })
      .select('id').single()
    if (error || !nueva) {
      console.error('No se pudo crear la membresía', error)
      return json({ error: ERROR_GENERICO }, 500)
    }
    return json({ resultado: 'cuenta_existente', membership_id: nueva.id })
  }

  // email_confirm: true porque no hay envío de mails: el empleado le pasa los
  // datos al socio en mano. El nombre va en la metadata para el trigger que
  // crea el perfil (0001).
  const { data: creado, error: errorCrear } = await almacen.auth.admin.createUser({
    email: alta.email,
    password: alta.password,
    email_confirm: true,
    user_metadata: { nombre: alta.nombre, apellido: alta.apellido },
  })
  if (errorCrear || !creado.user) {
    console.error('No se pudo crear el usuario', errorCrear)
    return json({ error: ERROR_GENERICO }, 500)
  }
  const nuevoId = creado.user.id

  // Si algo falla después de crear el usuario, se borra: una cuenta sin
  // membresía puede entrar a la app y no ve nada, y el email queda tomado.
  const deshacer = async (motivo: string, error: unknown) => {
    console.error(motivo, error)
    const { error: errorBorrar } = await almacen.auth.admin.deleteUser(nuevoId)
    if (errorBorrar) console.error('Tampoco se pudo borrar el usuario', nuevoId, errorBorrar)
    return json({ error: ERROR_GENERICO }, 500)
  }

  if (alta.telefono) {
    const { error } = await almacen.from('profiles').update({ telefono: alta.telefono }).eq('id', nuevoId)
    if (error) return deshacer('No se pudo guardar el teléfono', error)
  }

  const { data: membresia, error: errorMembresia } = await almacen
    .from('memberships')
    .insert({ gym_id: alta.gym_id, user_id: nuevoId, rol: 'socio' })
    .select('id').single()
  if (errorMembresia || !membresia) return deshacer('No se pudo crear la membresía', errorMembresia)

  return json({ resultado: 'creado', membership_id: membresia.id })
})
