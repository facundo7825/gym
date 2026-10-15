'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { FunctionsHttpError } from '@supabase/supabase-js'
import {
  METODOS_PAGO, aNumero, esCodigoQr, estadoCuota, hoyEnZona, normalizarEmail, validarAlta, validarPago,
  type EstadoCuota, type MetodoPago, type PeriodoCuota,
} from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { miMembresia } from '@/lib/membresia'
import { urlsDeFotos } from '@/lib/fotos'

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

// ---------------------------------------------------------------------------
// Ficha: pagos, foto, datos, baja, QR
// ---------------------------------------------------------------------------

const revalidarSocio = (membershipId: string) => {
  revalidatePath(`/socios/${membershipId}`)
  revalidatePath('/socios')
}

/** La ficha y sus acciones son de socios: el personal no cobra ni entra por acá. */
async function esSocio(supabase: Awaited<ReturnType<typeof crearClienteServidor>>, membershipId: string) {
  const { data } = await supabase
    .from('memberships').select('id').eq('id', membershipId).eq('rol', 'socio').maybeSingle()
  return !!data
}

export type EstadoPago = { error?: string; ok?: boolean; valores?: Record<string, string> }

export async function registrarPago(_previo: EstadoPago, datos: FormData): Promise<EstadoPago> {
  const valores = Object.fromEntries(
    ['periodo_desde', 'periodo_hasta', 'monto', 'metodo', 'fecha_pago', 'notas'].map((c) => [c, texto(datos, c)]),
  )
  const membershipId = texto(datos, 'membership_id')
  const pago = {
    periodo_desde: valores.periodo_desde ?? '',
    periodo_hasta: valores.periodo_hasta ?? '',
    monto: aNumero(valores.monto ?? ''),
  }
  const invalido = validarPago(pago)
  if (invalido) return { error: invalido, valores }
  if (!METODOS_PAGO.includes(valores.metodo as MetodoPago)) return { error: 'Elegí cómo pagó', valores }

  const yo = await miMembresia()
  if (!yo) return { error: SESION_VENCIDA, valores }

  const supabase = await crearClienteServidor()
  if (!(await esSocio(supabase, membershipId))) return { error: 'No pudimos registrar el pago', valores }
  const { error } = await supabase.from('cuotas').insert({
    gym_id: yo.gym_id,
    membership_id: membershipId,
    ...pago,
    metodo: valores.metodo as MetodoPago,
    fecha_pago: valores.fecha_pago || hoyEnZona(yo.zona),
    notas: valores.notas || null,
    registrado_por: yo.id,
  })
  if (error) return { error: 'No pudimos registrar el pago', valores }

  revalidarSocio(membershipId)
  return { ok: true }
}

export async function borrarPago(id: string, membershipId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  // El .select() no es decorativo: un delete que la RLS niega no da error,
  // borra cero filas.
  const { data, error } = await supabase.from('cuotas').delete().eq('id', id).select('id')
  if (error || !data?.length) return { error: 'No pudimos borrar el pago' }
  revalidarSocio(membershipId)
  return {}
}

export async function guardarFoto(membershipId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { data: socio } = await supabase
    .from('memberships').select('gym_id').eq('id', membershipId).eq('rol', 'socio').maybeSingle()
  if (!socio) return { error: 'No pudimos guardar la foto' }

  // La ruta la arma el servidor: el cliente no decide qué queda en la fila.
  const { data, error } = await supabase
    .from('memberships')
    .update({ foto: `${socio.gym_id}/${membershipId}.jpg` })
    .eq('id', membershipId).eq('rol', 'socio').select('id')
  if (error || !data?.length) return { error: 'No pudimos guardar la foto' }
  revalidarSocio(membershipId)
  return {}
}

export type EstadoDatos = { error?: string; ok?: boolean }

export async function editarDatos(_previo: EstadoDatos, datos: FormData): Promise<EstadoDatos> {
  const membershipId = texto(datos, 'membership_id')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('editar_datos_socio', {
    p_membership_id: membershipId,
    p_nombre: texto(datos, 'nombre'),
    p_apellido: texto(datos, 'apellido'),
    p_telefono: texto(datos, 'telefono'),
  })
  if (error?.code === '22023') return { error: 'Poné el nombre' }
  if (error) return { error: 'No pudimos guardar los datos' }
  revalidarSocio(membershipId)
  return { ok: true }
}

export async function cambiarEstado(membershipId: string, estado: 'activo' | 'inactivo'): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('memberships').update({ estado }).eq('id', membershipId).eq('rol', 'socio').select('id')
  if (error || !data?.length) return { error: 'No pudimos cambiar el estado' }
  revalidarSocio(membershipId)
  return {}
}

/**
 * Para cuando el socio sospecha que alguien usa su código. El viejo deja de
 * servir en el acto; el teléfono del socio muestra el nuevo la próxima vez
 * que abra Perfil con señal.
 */
export async function regenerarQr(membershipId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('memberships')
    .update({ codigo_qr: randomBytes(16).toString('hex') })
    .eq('id', membershipId)
    .eq('rol', 'socio')
    .select('id')
  if (error || !data?.length) return { error: 'No pudimos regenerar el código' }
  return {}
}

// ---------------------------------------------------------------------------
// Check-in: lo usan la ficha y la pantalla de escaneo
// ---------------------------------------------------------------------------

export type ResultadoEntrada =
  | { tipo: 'valido'; membershipId: string; nombre: string; fotoUrl: string | null; nuevo: boolean; hora: string; estado: EstadoCuota }
  | { tipo: 'invalido' }
  | { tipo: 'error' }

/** Lo que devuelven checkin_por_qr y checkin_manual (0018). */
type RespuestaCheckin =
  | { valido: false }
  | {
      valido: true
      membership_id: string
      nombre: string
      apellido: string
      foto: string | null
      nuevo: boolean
      hora_entrada: string
      hoy: string
      cuotas: PeriodoCuota[]
    }

async function aResultado(respuesta: { data: unknown; error: unknown }): Promise<ResultadoEntrada> {
  if (respuesta.error || !respuesta.data) return { tipo: 'error' }
  const r = respuesta.data as RespuestaCheckin
  if (!r.valido) return { tipo: 'invalido' }

  const yo = await miMembresia()
  const supabase = await crearClienteServidor()
  const fotos = await urlsDeFotos(supabase, [r.foto])
  const hora = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit', minute: '2-digit', timeZone: yo?.zona ?? 'America/Argentina/Buenos_Aires',
  }).format(new Date(r.hora_entrada))

  revalidatePath('/asistencia')
  revalidatePath(`/socios/${r.membership_id}`)

  return {
    tipo: 'valido',
    membershipId: r.membership_id,
    nombre: `${r.nombre} ${r.apellido}`.trim() || 'Sin nombre',
    fotoUrl: r.foto ? fotos.get(r.foto) ?? null : null,
    nuevo: r.nuevo,
    hora,
    // `hoy` lo calcula la base en la zona del gimnasio: el mismo "hoy" con el
    // que decidió el día de la entrada.
    estado: estadoCuota(r.cuotas, r.hoy),
  }
}

export async function escanear(codigo: string): Promise<ResultadoEntrada> {
  // El navegador ya filtra con debeProcesarLectura; esto cubre a quien llame
  // la acción directamente.
  if (!esCodigoQr(codigo)) return { tipo: 'invalido' }
  const supabase = await crearClienteServidor()
  return aResultado(await supabase.rpc('checkin_por_qr', { p_codigo: codigo }))
}

export async function entradaManual(membershipId: string): Promise<ResultadoEntrada> {
  const supabase = await crearClienteServidor()
  if (!(await esSocio(supabase, membershipId))) return { tipo: 'invalido' }
  return aResultado(await supabase.rpc('checkin_manual', { p_membership_id: membershipId }))
}

export async function borrarEntrada(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('checkins').delete().eq('id', id).select('id, membership_id')
  if (error || !data?.length) return { error: 'No pudimos borrar la entrada' }
  revalidatePath('/asistencia')
  revalidatePath(`/socios/${data[0]!.membership_id}`)
  return {}
}
