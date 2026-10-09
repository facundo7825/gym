import { AppState } from 'react-native'
import * as Network from 'expo-network'
import {
  clasificarRespuesta, estadoFinTras, estadoTras, fusionarMarcas, reenviarComoLibre,
  resumenCola, sesionesLimpiables, siguientesOperaciones, textoEstadoCola,
  type Clasificacion, type Marcas, type Operacion, type ResumenCola, type SesionEnCola,
} from '@gym/core'
import { supabase } from '@/lib/supabase'
import { todasGuardadas, todasMisMembresias } from '@/lib/membresia'
import * as local from '@/lib/local/cola'

/**
 * La sincronización: una función y un orden. Empuja sesiones, después series,
 * después cierres, y refresca las mejores marcas. Qué mandar y qué significa
 * cada respuesta lo decide @gym/core; acá solo se habla con SQLite y Supabase.
 *
 * Corre al volver la app a primer plano, al volver la red, y como intento
 * oportunista después de cada serie. Si falla no pasa nada: lo que no salió
 * sigue en la cola y lo lleva el intento siguiente.
 */

export interface EstadoVisible {
  texto: string | null
  hayRechazadas: boolean
}

type Oyente = (estado: EstadoVisible) => void

const oyentes = new Set<Oyente>()
let ultimo: EstadoVisible = { texto: null, hayRechazadas: false }
let otraVez = false
let enCurso: Promise<void> | null = null

export function sincronizar(): Promise<void> {
  // Si ya está corriendo se anota otra vuelta en vez de perder el pedido: la
  // serie que se acaba de registrar puede no estar en la cola que la vuelta
  // actual ya leyó. Y se devuelve la misma promesa, para que quien espera
  // (cerrar sesión) siga esperando hasta que termine también esa vuelta extra.
  if (enCurso) {
    otraVez = true
    return enCurso
  }
  enCurso = (async () => {
    try {
      do {
        otraVez = false
        await correr()
      } while (otraVez)
    } catch {
      // Lo que no salió queda en la cola para el próximo intento.
    } finally {
      enCurso = null
      await actualizarEstado()
    }
  })()
  return enCurso
}

async function correr(): Promise<void> {
  const membresias = (await todasMisMembresias()).map((m) => m.id)
  if (membresias.length === 0) return

  // Tres tandas alcanzan: sesiones, sus series, sus cierres.
  for (let tanda = 0; tanda < 3; tanda++) {
    const { sesiones, series } = await local.leerCola()
    const operaciones = siguientesOperaciones(sesiones, series, membresias)
    if (operaciones.length === 0) break

    for (const op of operaciones) {
      if ((await ejecutar(op)) === 'transitorio') {
        // Sin señal, seguir mandando solo acumula esperas: se corta en el primero.
        await actualizarEstado()
        return
      }
    }
    await actualizarEstado()
  }

  const { sesiones, series } = await local.leerCola()
  await local.borrarSesionesLocales(sesionesLimpiables(sesiones, series))
  await refrescarMarcas(membresias)
}

async function ejecutar(op: Operacion): Promise<Clasificacion> {
  try {
    switch (op.tipo) {
      case 'sesion': return await enviarSesion(op.sesion)
      case 'serie': return await enviarSerie(op)
      case 'fin': return await enviarFin(op)
    }
  } catch {
    return 'transitorio'
  }
}

async function enviarSesion(s: SesionEnCola): Promise<Clasificacion> {
  const insertar = (rutinaDiaId: string | null) => supabase
    .from('sesiones')
    .insert({
      id_local: s.id_local,
      gym_id: s.gym_id,
      membership_id: s.membership_id,
      rutina_dia_id: rutinaDiaId,
      inicio: s.inicio,
      notas: s.notas,
    })
    .select('id')
    .single()

  let respuesta = await insertar(s.rutina_dia_id)
  let c = clasificarRespuesta(respuesta.error)

  // Si el día de la rutina se borró mientras la sesión esperaba, el servidor la
  // rechaza. Borrar un día no se lleva el historial, así que se manda una vez
  // más sin día, y la respuesta de ese segundo intento es la que vale.
  if (reenviarComoLibre(s, c)) {
    respuesta = await insertar(null)
    c = clasificarRespuesta(respuesta.error)
  }

  let servidorId = respuesta.data?.id ?? null

  // Ya estaba —un envío anterior llegó y la respuesta se perdió—. Hace falta
  // su id para colgarle las series.
  if (c === 'duplicado') {
    const { data: existente, error: errorBusqueda } = await supabase
      .from('sesiones').select('id').eq('id_local', s.id_local).maybeSingle()
    if (errorBusqueda || !existente) return 'transitorio'
    servidorId = existente.id
  }

  const estado = estadoTras(c)
  if (estado) await local.marcarSesion(s.id_local, estado, servidorId)
  return c
}

async function enviarSerie(op: Extract<Operacion, { tipo: 'serie' }>): Promise<Clasificacion> {
  const { serie } = op
  // Sin .select(): no hace falta el id de vuelta.
  const { error } = await supabase.from('series_registradas').insert({
    id_local: serie.id_local,
    sesion_id: op.sesion_servidor_id,
    ejercicio_id: serie.ejercicio_id,
    numero_serie: serie.numero_serie,
    peso_kg: serie.peso_kg,
    repeticiones: serie.repeticiones,
  })

  const c = clasificarRespuesta(error)
  const estado = estadoTras(c)
  if (estado) await local.marcarSerie(serie.id_local, estado)
  return c
}

async function enviarFin(op: Extract<Operacion, { tipo: 'fin' }>): Promise<Clasificacion> {
  const { data, error } = await supabase
    .from('sesiones')
    .update({ fin: op.fin, notas: op.sesion.notas })
    .eq('id', op.servidor_id)
    .select('id')

  // Sin error y sin filas: la RLS no dejó tocarla —la membresía ya no está
  // activa—. Postgres no da error en ese caso, así que se mira la respuesta.
  const c: Clasificacion = !error && (data ?? []).length === 0
    ? 'permanente'
    : clasificarRespuesta(error)

  const estado = estadoFinTras(c)
  if (estado) await local.marcarFin(op.sesion.id_local, estado)
  return c
}

async function refrescarMarcas(membresias: string[]): Promise<void> {
  const { data, error } = await supabase
    .from('mejores_marcas')
    .select('membership_id, ejercicio_id, mejor_peso_kg, mejor_volumen_kg')
    .in('membership_id', membresias)
  if (error || !data) return

  for (const membershipId of membresias) {
    const delServidor: Marcas = {}
    for (const f of data) {
      if (f.membership_id !== membershipId || !f.ejercicio_id) continue
      delServidor[f.ejercicio_id] = {
        mejor_peso_kg: Number(f.mejor_peso_kg ?? 0),
        mejor_volumen_kg: Number(f.mejor_volumen_kg ?? 0),
      }
    }
    // Fusionar y no reemplazar: lo que sigue en la cola el servidor no lo conoce.
    const locales = await local.leerMarcas(membershipId)
    await local.guardarMarcas(membershipId, fusionarMarcas(locales, delServidor))
  }
}

export async function resumenActual(): Promise<ResumenCola> {
  const membresias = (await todasGuardadas()).map((m) => m.id)
  const { sesiones, series } = await local.leerCola()
  return resumenCola(sesiones, series, membresias)
}

/**
 * Recalcula el aviso y se lo pasa a quien esté escuchando. La pantalla de
 * sesión la llama después de guardar una serie, para que el contador suba en
 * el momento y no recién cuando termine la sincronización.
 */
export async function actualizarEstado(): Promise<void> {
  try {
    const r = await resumenActual()
    ultimo = { texto: textoEstadoCola(r), hayRechazadas: r.rechazadas > 0 }
    oyentes.forEach((o) => o(ultimo))
  } catch {
    // Si no se puede leer la base, el aviso queda como estaba.
  }
}

export function escucharEstado(oyente: Oyente): () => void {
  oyentes.add(oyente)
  oyente(ultimo)
  return () => {
    oyentes.delete(oyente)
  }
}

/** Se llama una vez, cuando hay alguien con la sesión iniciada. Devuelve cómo apagarlo. */
export function iniciarSincronizacion(): () => void {
  void sincronizar()

  const app = AppState.addEventListener('change', (estado) => {
    if (estado === 'active') void sincronizar()
  })
  const red = Network.addNetworkStateListener((estado) => {
    if (estado.isConnected && estado.isInternetReachable !== false) void sincronizar()
  })

  return () => {
    app.remove()
    red.remove()
  }
}
