import { describe, expect, it } from 'vitest'
import { mapearEstadoCloudflare, urlHls } from '../src/video'
import { Constants } from '../src/tipos-db'

describe('mapearEstadoCloudflare', () => {
  it('traduce los estados de Cloudflare a los nuestros', () => {
    expect(mapearEstadoCloudflare('ready')).toBe('listo')
    expect(mapearEstadoCloudflare('inprogress')).toBe('procesando')
    expect(mapearEstadoCloudflare('queued')).toBe('procesando')
    expect(mapearEstadoCloudflare('downloading')).toBe('procesando')
    expect(mapearEstadoCloudflare('error')).toBe('error')
  })

  it('trata como error cualquier estado desconocido', () => {
    // Si Cloudflare inventa un estado nuevo, preferimos marcarlo en error
    // y que alguien lo vea, antes que dejarlo "procesando" para siempre.
    expect(mapearEstadoCloudflare('vaya-a-saber')).toBe('error')
  })

  // Lo que devuelve esta función se escribe en videos.estado, que es un enum
  // de PostgreSQL. Si alguien agrega un estado allá y no acá, el insert falla
  // en producción; este test lo agarra antes.
  it('solo devuelve valores que existen en el enum estado_video', () => {
    const posibles = ['ready', 'queued', 'inprogress', 'downloading', 'error', 'cualquiera']
    for (const estado of posibles) {
      expect(Constants.public.Enums.estado_video).toContain(mapearEstadoCloudflare(estado))
    }
  })
})

describe('urlHls', () => {
  it('arma la URL de reproducción con el token firmado', () => {
    expect(urlHls('abc123', 'tok')).toBe(
      'https://customer-abc123.cloudflarestream.com/tok/manifest/video.m3u8',
    )
  })
})
