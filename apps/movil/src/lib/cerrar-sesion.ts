import { Alert } from 'react-native'
import { textoEstadoCola } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { vaciarTodo } from '@/lib/local/cola'
import { resumenActual, sincronizar } from '@/lib/sincronizar'

/**
 * Cerrar sesión borra todo lo local —la cola, las marcas, la caché—: nada de
 * una cuenta queda en el teléfono para la siguiente. Por eso primero se
 * intenta sincronizar, y si igual queda algo pendiente se pregunta.
 */
export async function cerrarSesion(): Promise<void> {
  await sincronizar()
  const resumen = await resumenActual()

  const salir = async () => {
    await vaciarTodo()
    await supabase.auth.signOut()
  }

  if (resumen.seriesPendientes + resumen.otrasPendientes === 0) {
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
}
