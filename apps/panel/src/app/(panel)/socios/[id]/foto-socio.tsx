'use client'

import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { AvatarSocio } from '@/components/avatar-socio'
import { guardarFoto } from '../acciones'

const LADO_MAXIMO = 800
// La foto que sale de la cámara de un celular pasa fácil los 5 MB; lo que
// sube es la reducida, que queda muy por debajo del límite del bucket.
const TAMANO_MAXIMO_ORIGINAL = 20 * 1024 * 1024

/**
 * Reduce a 800 px de lado mayor y pasa a JPEG. Para reconocer una cara
 * alcanza de sobra, y el bucket solo acepta JPEG (0019).
 */
async function reducir(archivo: File): Promise<Blob> {
  const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(imagen.width * escala)
  lienzo.height = Math.round(imagen.height * escala)
  lienzo.getContext('2d')!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
  imagen.close()
  return new Promise((resolver, rechazar) =>
    lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No se pudo convertir'))), 'image/jpeg', 0.85),
  )
}

export function FotoSocio({ membershipId, gymId, nombre, url, puedeCambiar }: {
  membershipId: string
  gymId: string
  nombre: string
  url: string | null
  puedeCambiar: boolean
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function alElegir(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    // Se vacía para que elegir la misma foto otra vez vuelva a disparar el evento.
    evento.target.value = ''
    if (!archivo) return
    if (!archivo.type.startsWith('image/') || archivo.size > TAMANO_MAXIMO_ORIGINAL) {
      setError('Elegí una imagen de hasta 20 MB')
      return
    }

    setSubiendo(true)
    setError(null)
    try {
      const jpeg = await reducir(archivo)
      const ruta = `${gymId}/${membershipId}.jpg`
      const { error: errorSubida } = await crearClienteNavegador()
        .storage.from('fotos-socios')
        .upload(ruta, jpeg, { contentType: 'image/jpeg', upsert: true })
      if (errorSubida) throw errorSubida
      // La ruta que queda en la fila la arma el servidor; esta es la misma
      // fórmula, solo para subir el archivo.
      const r = await guardarFoto(membershipId)
      if (r.error) throw new Error(r.error)
    } catch {
      setError('No pudimos guardar la foto, probá de nuevo')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <AvatarSocio nombre={nombre} url={url} grande />
      {puedeCambiar && (
        <>
          {/* capture="environment": la saca el empleado, con la cámara de
              atrás. En la computadora abre el selector de archivos. */}
          <input ref={entrada} type="file" accept="image/*" capture="environment" hidden onChange={alElegir} />
          <button type="button" disabled={subiendo} className="boton boton-secundario"
            onClick={() => entrada.current?.click()}>
            <Camera size={16} /> {subiendo ? 'Subiendo…' : url ? 'Cambiar foto' : 'Sacar foto'}
          </button>
        </>
      )}
      {error && <p role="alert" className="text-center text-sm text-rechazo">{error}</p>}
    </div>
  )
}
