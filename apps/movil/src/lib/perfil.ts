import { primerDiaDelMes, type MetodoPago, type PeriodoCuota } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'
import { hoyLocal } from '@/lib/fechas'
import { guardarCache, leerCache } from '@/lib/local/cola'

export interface PagoPerfil extends PeriodoCuota {
  monto: number
  metodo: MetodoPago
  fecha_pago: string
}

export interface DatosPerfil {
  /**
   * false = sin membresía activa. memberships_leer no deja ver una membresía
   * propia dada de baja, así que "dado de baja" y "nunca tuvo" se ven igual.
   */
  activa: boolean
  gym: string
  codigoQr: string | null
  /** Los últimos 24 por vencimiento: alcanzan para el estado, que encadena, y para la lista. */
  pagos: PagoPerfil[]
  vecesEsteMes: number
  /** El mes de `vecesEsteMes` ('AAAA-MM-01'): sin señal en el mes siguiente, ese número ya no aplica. */
  mes: string
  entradas: { id: string; created_at: string }[]
  /** Cuándo se trajo del servidor, para el "Actualizado el …" sin señal. */
  actualizado: string
}

// Por usuario: si en el teléfono entra otra persona, no ve el QR de la anterior.
const clave = (userId: string) => `perfil:${userId}`

/**
 * Con señal, trae todo y lo guarda; sin señal, lo último guardado. Lo que
 * importa sin señal es el QR: la puerta del gimnasio puede ser un subsuelo.
 */
export async function cargarPerfil(): Promise<{ datos: DatosPerfil | null; conSenal: boolean }> {
  // getSession y no getUser: lee el teléfono, no la red.
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return { datos: null, conSenal: false }

  const delServidor = await traer(userId)
  if (delServidor) {
    await guardarCache(clave(userId), delServidor)
    return { datos: delServidor, conSenal: true }
  }
  return { datos: await leerCache<DatosPerfil>(clave(userId)), conSenal: false }
}

/** null = sin señal o no llegó a tiempo. */
async function traer(userId: string): Promise<DatosPerfil | null> {
  const actualizado = new Date().toISOString()
  const mes = primerDiaDelMes(hoyLocal())

  // Filtra por user_id: memberships_leer deja ver todas las del gimnasio.
  const membresias = await conLimite(
    supabase
      .from('memberships')
      .select('id, gym_id, gyms ( nombre )')
      .eq('user_id', userId)
      .eq('estado', 'activo')
      .order('created_at')
      .limit(1),
  )
  if (!membresias || membresias.error) return null

  const m = membresias.data[0]
  if (!m) {
    return { activa: false, gym: '', codigoQr: null, pagos: [], vecesEsteMes: 0, mes, entradas: [], actualizado }
  }

  // Todo por membership_id propio: un entrenador que usa la app lee las
  // cuotas y entradas de todo su gimnasio.
  const [codigo, pagos, cuenta, entradas] = await Promise.all([
    conLimite(supabase.rpc('mi_codigo_qr', { p_gym_id: m.gym_id })),
    conLimite(
      supabase
        .from('cuotas')
        .select('periodo_desde, periodo_hasta, monto, metodo, fecha_pago')
        .eq('membership_id', m.id)
        .order('periodo_hasta', { ascending: false })
        .limit(24),
    ),
    conLimite(
      supabase
        .from('checkins')
        .select('id', { count: 'exact', head: true })
        .eq('membership_id', m.id)
        .gte('dia', mes),
    ),
    conLimite(
      supabase
        .from('checkins')
        .select('id, created_at')
        .eq('membership_id', m.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ),
  ])
  if (!codigo || codigo.error || !pagos || pagos.error || !cuenta || cuenta.error || !entradas || entradas.error) {
    return null
  }

  return {
    activa: true,
    gym: m.gyms?.nombre ?? '',
    codigoQr: codigo.data,
    pagos: pagos.data,
    vecesEsteMes: cuenta.count ?? 0,
    mes,
    entradas: entradas.data,
    actualizado,
  }
}
