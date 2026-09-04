import { describe, expect, it } from 'vitest'
import {
  DURACION_MAXIMA_SEG,
  TAMANO_MAXIMO_BYTES,
  validarArchivoVideo,
} from '../src/video'

const VALIDO = { tamanoBytes: 8_000_000, duracionSeg: 42, tipo: 'video/mp4' }

describe('validarArchivoVideo', () => {
  it('acepta un mp4 dentro de los dos límites', () => {
    expect(validarArchivoVideo(VALIDO)).toBeNull()
  })

  it('rechaza cualquier cosa que no sea mp4', () => {
    const motivo = validarArchivoVideo({ ...VALIDO, tipo: 'video/quicktime' })
    expect(motivo).toContain('MP4')
  })

  it('rechaza por tamaño y dice cuánto pesa', () => {
    const motivo = validarArchivoVideo({ ...VALIDO, tamanoBytes: 240 * 1024 * 1024 })
    expect(motivo).toContain('240 MB')
    expect(motivo).toContain('50 MB')
  })

  it('rechaza por duración y la muestra en minutos y segundos', () => {
    const motivo = validarArchivoVideo({ ...VALIDO, duracionSeg: 134 })
    expect(motivo).toContain('2:14')
    expect(motivo).toContain('1:00')
  })

  // El navegador devuelve NaN cuando no puede leer los metadatos: un archivo
  // corrupto, o un contenedor que no sabe abrir. Dejarlo pasar significaría
  // subir 50 MB para descubrir después que no se reproduce.
  it('rechaza una duración que no se pudo leer', () => {
    expect(validarArchivoVideo({ ...VALIDO, duracionSeg: NaN })).not.toBeNull()
    expect(validarArchivoVideo({ ...VALIDO, duracionSeg: 0 })).not.toBeNull()
  })

  // Cuando se pasa de las dos cosas gana el tamaño, porque es el límite duro:
  // recortar la duración no garantiza entrar en 50 MB, pero bajar la calidad
  // sí resuelve los dos problemas de una.
  it('prioriza el tamaño cuando se pasa de ambos límites', () => {
    const motivo = validarArchivoVideo({
      tamanoBytes: 240 * 1024 * 1024, duracionSeg: 300, tipo: 'video/mp4',
    })
    expect(motivo).toContain('240 MB')
    expect(motivo).not.toContain('5:00')
  })

  it('acepta exactamente el límite, no un byte menos', () => {
    expect(validarArchivoVideo({ ...VALIDO, tamanoBytes: TAMANO_MAXIMO_BYTES })).toBeNull()
    expect(validarArchivoVideo({ ...VALIDO, duracionSeg: DURACION_MAXIMA_SEG })).toBeNull()
  })
})
