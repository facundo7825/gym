import * as SQLite from 'expo-sqlite'

/**
 * La base del teléfono. Guarda tres cosas de naturaleza distinta —ver la
 * sección 2 del diseño de la etapa 3—:
 *
 * - La cola de escritura (sesiones_locales, series_locales). Es lo único que
 *   no se puede perder.
 * - Las mejores marcas por ejercicio, para detectar un récord sin señal.
 * - Una caché de documentos JSON (la rutina activa, las membresías). Se lee
 *   entera; no es un espejo relacional del servidor.
 *
 * `user_version` es la versión del esquema local. Para cambiarlo, agregar un
 * bloque `if (version < 2)` debajo del de la versión 1; nunca editar el de 1,
 * que ya corrió en los teléfonos.
 */
let abierta: Promise<SQLite.SQLiteDatabase> | null = null

export function base(): Promise<SQLite.SQLiteDatabase> {
  abierta ??= abrir().catch((error) => {
    // Si falló, que el próximo intento vuelva a abrir en vez de heredar el error.
    abierta = null
    throw error
  })
  return abierta
}

async function abrir(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('gym.db')
  await db.execAsync('pragma journal_mode = wal;')

  const fila = await db.getFirstAsync<{ user_version: number }>('pragma user_version')
  const version = fila?.user_version ?? 0

  if (version < 1) {
    await db.execAsync(`
      create table if not exists sesiones_locales (
        id_local       text primary key,
        membership_id  text not null,
        gym_id         text not null,
        rutina_dia_id  text,
        inicio         text not null,
        fin            text,
        notas          text,
        estado         text not null default 'pendiente',
        servidor_id    text,
        estado_fin     text not null default 'abierta'
      );

      -- nombre_ejercicio no viaja al servidor: está para poder mostrar una
      -- sesión retomada sin señal.
      create table if not exists series_locales (
        id_local          text primary key,
        sesion_id_local   text not null,
        ejercicio_id      text not null,
        nombre_ejercicio  text not null,
        numero_serie      integer not null,
        peso_kg           real not null,
        repeticiones      integer not null,
        estado            text not null default 'pendiente'
      );

      create table if not exists marcas_locales (
        membership_id     text not null,
        ejercicio_id      text not null,
        mejor_peso_kg     real not null,
        mejor_volumen_kg  real not null,
        primary key (membership_id, ejercicio_id)
      );

      create table if not exists cache (
        clave  text primary key,
        valor  text not null
      );

      pragma user_version = 1;
    `)
  }

  return db
}
