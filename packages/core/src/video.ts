import type { Constants } from './tipos-db'

// Derivado del enum de PostgreSQL, igual que en catalogo.ts: este valor se
// escribe en videos.estado, así que si los dos se separan el insert falla en
// producción y no acá.
export type EstadoVideo = (typeof Constants)['public']['Enums']['estado_video'][number]

// El tope del plan Free de Supabase Storage. El bucket lo aplica también del
// lado del servidor (0005_storage_videos.sql); esto es para no hacerle subir
// 240 MB a alguien que va a recibir un rechazo igual.
export const TAMANO_MAXIMO_BYTES = 50 * 1024 * 1024
export const DURACION_MAXIMA_SEG = 60
export const TIPO_ACEPTADO = 'video/mp4'

function enMb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

function enMinutos(segundos: number): string {
  const minutos = Math.floor(segundos / 60)
  const resto = Math.round(segundos % 60)
  return `${minutos}:${String(resto).padStart(2, '0')}`
}

/**
 * Devuelve el motivo del rechazo listo para mostrar, o null si el archivo
 * sirve. El orden de los chequeos importa y está fijado por los tests: tipo,
 * duración ilegible, tamaño, duración.
 */
export function validarArchivoVideo(archivo: {
  tamanoBytes: number
  duracionSeg: number
  tipo: string
}): string | null {
  if (archivo.tipo !== TIPO_ACEPTADO) {
    return 'El archivo tiene que ser un MP4.'
  }

  if (!Number.isFinite(archivo.duracionSeg) || archivo.duracionSeg <= 0) {
    return 'No pudimos leer la duración del video. Probá exportarlo de nuevo como MP4.'
  }

  if (archivo.tamanoBytes > TAMANO_MAXIMO_BYTES) {
    return `El video pesa ${enMb(archivo.tamanoBytes)} y el máximo es ` +
      `${enMb(TAMANO_MAXIMO_BYTES)}. Grabá o exportá en 720p.`
  }

  if (archivo.duracionSeg > DURACION_MAXIMA_SEG) {
    return `El video dura ${enMinutos(archivo.duracionSeg)} y el máximo es ` +
      `${enMinutos(DURACION_MAXIMA_SEG)}.`
  }

  return null
}
