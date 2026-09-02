import type { Constants } from './tipos-db'

// Derivado del enum de PostgreSQL, igual que en catalogo.ts: este valor se
// escribe en videos.estado, así que si los dos se separan el insert falla en
// producción y no acá.
export type EstadoVideo = (typeof Constants)['public']['Enums']['estado_video'][number]

/**
 * Cloudflare Stream reporta el estado con su propio vocabulario.
 * Lo traducimos al nuestro en un solo lugar, así el resto del código
 * no depende de cómo lo llame el proveedor.
 */
export function mapearEstadoCloudflare(estado: string): EstadoVideo {
  switch (estado) {
    case 'ready':
      return 'listo'
    case 'queued':
    case 'inprogress':
    case 'downloading':
      return 'procesando'
    default:
      // Cualquier estado que no conocemos se marca en error a propósito. Un
      // video colgado en "procesando" para siempre no se lo queja nadie; uno
      // en error, sí.
      return 'error'
  }
}

export function urlHls(customerCode: string, token: string): string {
  return `https://customer-${customerCode}.cloudflarestream.com/${token}/manifest/video.m3u8`
}
