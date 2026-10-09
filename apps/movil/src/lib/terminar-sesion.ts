import { fusionarMarcas, marcaDeSesion, type Marcas, type SesionEnCola } from '@gym/core'
import * as local from '@/lib/local/cola'
import { actualizarEstado, sincronizar } from '@/lib/sincronizar'

/**
 * Terminar: pone el fin en la cola y suma lo de la sesión a las mejores marcas
 * del teléfono.
 *
 * Las marcas se actualizan acá y no serie por serie: la pantalla de sesión
 * compara contra las de ANTES de la sesión. Esas se guardan al crearla
 * (`marcas-previas:<id_local>`) y es contra ese snapshot que se compara al
 * retomar, porque las marcas del teléfono pueden recibir lo del servidor, y el
 * servidor ya cuenta las series sincronizadas de la sesión abierta. Si se
 * actualizaran serie por serie, la primera vez de un ejercicio dejaría de ser
 * la primera.
 *
 * La usan la pantalla de sesión y el aviso de "entrenamiento sin terminar" de Hoy.
 */
export async function terminarSesion(sesion: SesionEnCola): Promise<void> {
  const series = await local.seriesDeSesionLocal(sesion.id_local)

  const porEjercicio = new Map<string, typeof series>()
  for (const s of series) {
    porEjercicio.set(s.ejercicio_id, [...(porEjercicio.get(s.ejercicio_id) ?? []), s])
  }

  const deLaSesion: Marcas = {}
  for (const [ejercicioId, suyas] of porEjercicio) {
    const marca = marcaDeSesion(suyas)
    if (marca) deLaSesion[ejercicioId] = marca
  }

  await local.terminarSesionLocal(sesion.id_local)
  const previas = await local.leerMarcas(sesion.membership_id)
  await local.guardarMarcas(sesion.membership_id, fusionarMarcas(previas, deLaSesion))
  await actualizarEstado()
  void sincronizar()
}
