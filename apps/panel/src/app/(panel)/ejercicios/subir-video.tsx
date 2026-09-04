'use client'

import { useState } from 'react'
import { TIPO_ACEPTADO, validarArchivoVideo } from '@gym/core'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

type Fase =
  | { nombre: 'inactivo' }
  | { nombre: 'subiendo' }
  | { nombre: 'listo' }
  | { nombre: 'error'; mensaje: string }

/**
 * Lee la duración del archivo SIN subirlo: sale de los metadatos locales. Es
 * lo que hace que un archivo de 300 MB se descarte sin transferir un byte.
 * Devuelve NaN si el navegador no pudo abrirlo, y validarArchivoVideo lo
 * trata como rechazo.
 */
function leerDuracion(archivo: File): Promise<number> {
  return new Promise((resolver) => {
    const elemento = document.createElement('video')
    elemento.preload = 'metadata'
    elemento.onloadedmetadata = () => {
      URL.revokeObjectURL(elemento.src)
      resolver(elemento.duration)
    }
    elemento.onerror = () => {
      URL.revokeObjectURL(elemento.src)
      resolver(NaN)
    }
    elemento.src = URL.createObjectURL(archivo)
  })
}

export function SubirVideo({
  ejercicioId,
  tieneVideo,
}: {
  ejercicioId: string
  tieneVideo: boolean
}) {
  const [fase, setFase] = useState<Fase>({ nombre: 'inactivo' })

  async function alElegir(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    // Se limpia el input para que elegir el mismo archivo dos veces seguidas
    // vuelva a disparar el change.
    evento.target.value = ''
    if (!archivo) return

    const duracionSeg = await leerDuracion(archivo)
    const motivo = validarArchivoVideo({
      tamanoBytes: archivo.size,
      duracionSeg,
      tipo: archivo.type,
    })
    if (motivo) {
      setFase({ nombre: 'error', mensaje: motivo })
      return
    }

    setFase({ nombre: 'subiendo' })
    const supabase = crearClienteNavegador()

    const { data: firma, error: errorFirma } = await supabase.functions
      .invoke('video-subir', { body: { duracionSeg } })
    if (errorFirma || !firma) {
      setFase({ nombre: 'error', mensaje: 'No pudimos preparar la subida.' })
      return
    }

    const { error: errorSubida } = await supabase.storage
      .from('videos')
      .uploadToSignedUrl(firma.ruta, firma.token, archivo, { contentType: 'video/mp4' })
    if (errorSubida) {
      setFase({ nombre: 'error', mensaje: 'La subida falló. Probá de nuevo.' })
      return
    }

    // Si la subida falló, esta llamada no ocurre y la fila queda en
    // `procesando`. Si ocurre y el objeto no está, la función la pasa a
    // `error` y devuelve 409: nunca queda un limbo silencioso.
    const { error: errorConfirmar } = await supabase.functions
      .invoke('video-confirmar', { body: { videoId: firma.videoId } })
    if (errorConfirmar) {
      setFase({ nombre: 'error', mensaje: 'La subida no se completó. Probá de nuevo.' })
      return
    }

    // RLS decide si este ejercicio es del gimnasio de quien sube.
    const { error: errorAsociar } = await supabase
      .from('ejercicios').update({ video_id: firma.videoId }).eq('id', ejercicioId)
    if (errorAsociar) {
      setFase({
        nombre: 'error',
        mensaje: 'El video se subió pero no se pudo asociar al ejercicio.',
      })
      return
    }

    setFase({ nombre: 'listo' })
  }

  return (
    <div className="mt-1 text-sm">
      {fase.nombre === 'subiendo' ? (
        <span className="text-gray-600">Subiendo…</span>
      ) : (
        <label className="cursor-pointer text-blue-700 underline">
          {tieneVideo || fase.nombre === 'listo' ? 'Reemplazar video' : 'Subir video'}
          <input type="file" accept={TIPO_ACEPTADO} className="hidden" onChange={alElegir} />
        </label>
      )}

      {fase.nombre === 'listo' && (
        <span className="ml-2 text-green-700">Video listo.</span>
      )}

      {/* El mensaje que devuelve validarArchivoVideo ya dice qué hacer
          ("Grabá o exportá en 720p"), así que no lleva enlace a la guía:
          docs/grabar-videos.md es un archivo del repositorio, no una página
          que el panel sirva, y un enlace roto justo cuando al usuario le
          rechazaron el archivo es peor que no tener enlace. */}
      {fase.nombre === 'error' && (
        <p role="alert" className="mt-1 text-red-600">{fase.mensaje}</p>
      )}
    </div>
  )
}
