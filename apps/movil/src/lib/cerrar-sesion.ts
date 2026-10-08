import { Alert } from 'react-native'
import { textoEstadoCola } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { vaciarTodo } from '@/lib/local/cola'
import { resumenActual, sincronizar } from '@/lib/sincronizar'

/**
 * Cerrar sesión borra todo lo local —la cola, las marcas, la caché—: nada de
 * una cuenta queda en el teléfono para la siguiente. Por eso primero se
 * intenta sincronizar, y si igual queda algo pendiente o rechazado se
 * pregunta: lo rechazado también se pierde, y nunca se borra en silencio.
 *
 * El signOut va antes del borrado: si falla, el usuario sigue con la sesión
 * iniciada y no puede quedar con la cola vaciada.
 */
const avisarFallo = () => Alert.alert('No pudimos cerrar la sesión', 'Probá de nuevo.')

export async function cerrarSesion(): Promise<void> {
  try {
    await sincronizar()
    const resumen = await resumenActual()

    const salir = async () => {
      try {
        const { error } = await supabase.auth.signOut()
        if (error) {
          avisarFallo()
          return
        }
        await vaciarTodo()
      } catch {
        avisarFallo()
      }
    }

    if (resumen.seriesPendientes + resumen.otrasPendientes + resumen.rechazadas === 0) {
      await salir()
      return
    }

    Alert.alert(
      'Tenés cosas sin sincronizar',
      `${textoEstadoCola(resumen)}. Si cerrás sesión ahora, se pierden.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión igual', style: 'destructive', onPress: () => { void salir() } },
      ],
    )
  } catch {
    avisarFallo()
  }
}
