import * as Crypto from 'expo-crypto'
import type { EstadoEnvio, EstadoFin, Marcas, SerieEnCola, SesionEnCola } from '@gym/core'
import { base } from './base'

/**
 * La cola de escritura, las marcas y la caché tal como viven en SQLite. Solo
 * SQL: qué mandar, cuándo y qué significa cada respuesta lo decide @gym/core.
 */

export interface SerieLocal extends SerieEnCola {
  nombre_ejercicio: string
}

export async function leerCola(): Promise<{ sesiones: SesionEnCola[]; series: SerieLocal[] }> {
  const db = await base()
  const sesiones = await db.getAllAsync<SesionEnCola>('select * from sesiones_locales')
  const series = await db.getAllAsync<SerieLocal>('select * from series_locales order by rowid')
  return { sesiones, series }
}

/** El `id_local` se genera acá, antes de que exista señal: es la llave de los reintentos. */
export async function crearSesionLocal(datos: {
  membership_id: string
  gym_id: string
  rutina_dia_id: string | null
}): Promise<SesionEnCola> {
  const sesion: SesionEnCola = {
    id_local: Crypto.randomUUID(),
    ...datos,
    inicio: new Date().toISOString(),
    fin: null,
    notas: null,
    estado: 'pendiente',
    servidor_id: null,
    estado_fin: 'abierta',
  }
  const db = await base()
  await db.runAsync(
    `insert into sesiones_locales (id_local, membership_id, gym_id, rutina_dia_id, inicio)
     values (?, ?, ?, ?, ?)`,
    [sesion.id_local, sesion.membership_id, sesion.gym_id, sesion.rutina_dia_id, sesion.inicio],
  )
  return sesion
}

export async function agregarSerieLocal(
  datos: Omit<SerieLocal, 'id_local' | 'estado'>,
): Promise<SerieLocal> {
  const serie: SerieLocal = { id_local: Crypto.randomUUID(), estado: 'pendiente', ...datos }
  const db = await base()
  await db.runAsync(
    `insert into series_locales
       (id_local, sesion_id_local, ejercicio_id, nombre_ejercicio, numero_serie, peso_kg, repeticiones)
     values (?, ?, ?, ?, ?, ?, ?)`,
    [
      serie.id_local, serie.sesion_id_local, serie.ejercicio_id, serie.nombre_ejercicio,
      serie.numero_serie, serie.peso_kg, serie.repeticiones,
    ],
  )
  return serie
}

export async function seriesDeSesionLocal(sesionIdLocal: string): Promise<SerieLocal[]> {
  const db = await base()
  return db.getAllAsync<SerieLocal>(
    'select * from series_locales where sesion_id_local = ? order by rowid',
    [sesionIdLocal],
  )
}

/**
 * Terminar. `fin is null` para que tocar dos veces no corra la hora de cierre.
 * `max(?, inicio)` porque la base exige fin >= inicio, y el reloj del teléfono
 * se puede atrasar en el medio: sin esto el cierre quedaría rechazado para
 * siempre.
 */
export async function terminarSesionLocal(idLocal: string): Promise<void> {
  const db = await base()
  await db.runAsync(
    `update sesiones_locales
     set fin = max(?, inicio), estado_fin = 'pendiente'
     where id_local = ? and fin is null`,
    [new Date().toISOString(), idLocal],
  )
}

/** `servidorId` nulo deja el que haya: un rechazo no borra un id ya conocido. */
export async function marcarSesion(
  idLocal: string, estado: EstadoEnvio, servidorId: string | null,
): Promise<void> {
  const db = await base()
  await db.runAsync(
    'update sesiones_locales set estado = ?, servidor_id = coalesce(?, servidor_id) where id_local = ?',
    [estado, servidorId, idLocal],
  )
}

export async function marcarSerie(idLocal: string, estado: EstadoEnvio): Promise<void> {
  const db = await base()
  await db.runAsync('update series_locales set estado = ? where id_local = ?', [estado, idLocal])
}

export async function marcarFin(idLocal: string, estadoFin: EstadoFin): Promise<void> {
  const db = await base()
  await db.runAsync('update sesiones_locales set estado_fin = ? where id_local = ?', [estadoFin, idLocal])
}

/** Saca del teléfono las sesiones que ya están enteras en el servidor (ver `sesionesLimpiables`). */
export async function borrarSesionesLocales(idsLocales: string[]): Promise<void> {
  if (idsLocales.length === 0) return
  const db = await base()
  await db.withTransactionAsync(async () => {
    for (const id of idsLocales) {
      await db.runAsync('delete from series_locales where sesion_id_local = ?', [id])
      await db.runAsync('delete from sesiones_locales where id_local = ?', [id])
    }
  })
}

/** Al cerrar sesión: nada de una cuenta queda en el teléfono para la siguiente. */
export async function vaciarTodo(): Promise<void> {
  const db = await base()
  await db.execAsync(`
    delete from series_locales;
    delete from sesiones_locales;
    delete from marcas_locales;
    delete from cache;
  `)
}

export async function leerMarcas(membershipId: string): Promise<Marcas> {
  const db = await base()
  const filas = await db.getAllAsync<{
    ejercicio_id: string; mejor_peso_kg: number; mejor_volumen_kg: number
  }>(
    'select ejercicio_id, mejor_peso_kg, mejor_volumen_kg from marcas_locales where membership_id = ?',
    [membershipId],
  )
  return Object.fromEntries(filas.map((f) => [
    f.ejercicio_id, { mejor_peso_kg: f.mejor_peso_kg, mejor_volumen_kg: f.mejor_volumen_kg },
  ]))
}

/** Reemplaza fila por fila. Quien llama ya fusionó con `fusionarMarcas`. */
export async function guardarMarcas(membershipId: string, marcas: Marcas): Promise<void> {
  const db = await base()
  await db.withTransactionAsync(async () => {
    for (const [ejercicioId, m] of Object.entries(marcas)) {
      await db.runAsync(
        `insert or replace into marcas_locales (membership_id, ejercicio_id, mejor_peso_kg, mejor_volumen_kg)
         values (?, ?, ?, ?)`,
        [membershipId, ejercicioId, m.mejor_peso_kg, m.mejor_volumen_kg],
      )
    }
  })
}

export async function leerCache<T>(clave: string): Promise<T | null> {
  const db = await base()
  const fila = await db.getFirstAsync<{ valor: string }>('select valor from cache where clave = ?', [clave])
  return fila ? (JSON.parse(fila.valor) as T) : null
}

export async function guardarCache(clave: string, valor: unknown): Promise<void> {
  const db = await base()
  await db.runAsync(
    'insert or replace into cache (clave, valor) values (?, ?)',
    [clave, JSON.stringify(valor)],
  )
}
