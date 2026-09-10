import { Alert } from 'react-native'
import { supabase } from '@/lib/supabase'

/**
 * Toma una plantilla del catálogo: crea la copia a nombre del socio y
 * devuelve el id de la rutina nueva, o `null` si algo falló —en ese caso ya
 * avisó por pantalla—.
 *
 * Vive acá y no adentro de una pantalla porque la usan las dos que ofrecen
 * "Tomar esta rutina": la lista del catálogo y el detalle de la plantilla.
 */
export async function tomarRutina(
  plantillaId: string,
  gymId: string,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    Alert.alert('Se cerró tu sesión', 'Volvé a entrar y probá de nuevo.')
    return null
  }

  // Filtra por user_id Y por el gimnasio de la plantilla. Sin user_id volvía
  // la membresía de cualquier otra persona: memberships_leer deja ver todas
  // las del propio gimnasio, así que la más antigua es la del admin que lo
  // creó, no la de quien está mirando. Y sin gym_id, un socio que pertenece a
  // dos gimnasios podía tomar la plantilla con la membresía equivocada, que
  // rutinas_crear rechaza porque propietario_id tiene que ser mi membresía en
  // ESE gimnasio.
  const { data: membresia, error: errorMembresia } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('gym_id', gymId)
    .eq('estado', 'activo')
    .maybeSingle()

  // Se distingue "la consulta falló" de "no hay membresía": no se arreglan
  // con lo mismo. Lo primero es la conexión; lo segundo, que alguien lo dé de
  // alta en el gimnasio.
  if (errorMembresia) {
    Alert.alert('No pudimos identificar tu membresía', 'Revisá tu conexión y probá de nuevo.')
    return null
  }
  if (!membresia) {
    Alert.alert('No sos parte de este gimnasio', 'Pedile a un administrador que te dé de alta.')
    return null
  }

  const { data: nuevaId, error } = await supabase.rpc('tomar_rutina', {
    p_plantilla_id: plantillaId,
    p_propietario_id: membresia.id,
  })

  // 23505 = unique_violation: el índice único dice que ya tenés una copia
  // activa de esta plantilla. No es un error rojo — tocar dos veces, o tocar
  // con mala señal y reintentar, es algo razonable que hace la gente.
  if (error?.code === '23505') {
    Alert.alert('Ya tenés esta rutina', 'Está en "Mis rutinas".')
    return null
  }
  if (error) {
    Alert.alert('No pudimos agregar la rutina', 'Probá de nuevo.')
    return null
  }

  return nuevaId as string
}
