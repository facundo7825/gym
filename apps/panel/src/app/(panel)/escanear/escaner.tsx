'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { debeProcesarLectura } from '@gym/core'
import { entradaManual, escanear, type ResultadoEntrada } from '../socios/acciones'
import { TarjetaEntrada } from './tarjeta-entrada'

const CIERRE_AUTOMATICO_MS = 5000

const FALLO: ResultadoEntrada = { tipo: 'error' }

export function Escaner({ socios, esAdmin }: {
  socios: { id: string; nombre: string }[]
  esAdmin: boolean
}) {
  const video = useRef<HTMLVideoElement>(null)
  const ultima = useRef<{ codigo: string; en: number } | null>(null)
  // En un ref y no solo en el estado: el callback del escáner se arma una
  // vez y tiene que ver el valor de ahora, no el de cuando se creó.
  const ocupado = useRef(false)
  const [resultado, setResultado] = useState<ResultadoEntrada | null>(null)
  const [camara, setCamara] = useState<'iniciando' | 'activa' | 'sin-camara'>('iniciando')
  const [busqueda, setBusqueda] = useState('')

  const mostrar = useCallback((r: ResultadoEntrada) => {
    ocupado.current = true
    setResultado(r)
  }, [])

  const cerrar = useCallback(() => {
    ocupado.current = false
    setResultado(null)
  }, [])

  useEffect(() => {
    let escaner: { destroy: () => void } | null = null
    let vivo = true

    // Import dinámico: la librería toca `window` y el worker, y esta página
    // también se renderiza en el servidor.
    void import('qr-scanner').then(async ({ default: QrScanner }) => {
      if (!vivo || !video.current) return
      const instancia = new QrScanner(
        video.current,
        async ({ data }) => {
          const ahora = Date.now()
          // Review Focus 2: la cámara lee el mismo QR muchas veces por segundo.
          if (ocupado.current || !debeProcesarLectura(data, ultima.current, ahora)) return
          ultima.current = { codigo: data, en: ahora }
          ocupado.current = true
          // Sin red la acción rechaza: se muestra el error en vez de dejar
          // el escáner trabado en "ocupado".
          mostrar(await escanear(data).catch(() => FALLO))
        },
        { preferredCamera: 'environment', highlightScanRegion: true, maxScansPerSecond: 5, returnDetailedScanResult: true },
      )
      escaner = instancia
      try {
        await instancia.start()
        if (vivo) setCamara('activa')
      } catch {
        // Permiso negado, sin cámara o página sin HTTPS: los tres se arreglan
        // fuera de la app, y el buscador manual sigue andando.
        if (vivo) setCamara('sin-camara')
      }
    })

    return () => {
      vivo = false
      escaner?.destroy()
    }
  }, [mostrar])

  useEffect(() => {
    if (!resultado) return
    const temporizador = setTimeout(cerrar, CIERRE_AUTOMATICO_MS)
    return () => clearTimeout(temporizador)
  }, [resultado, cerrar])

  const coincidencias = useMemo(() => {
    const b = busqueda.trim().toLowerCase()
    if (b.length < 2) return []
    return socios.filter((s) => s.nombre.toLowerCase().includes(b)).slice(0, 8)
  }, [busqueda, socios])

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-grande bg-hundido">
        <video ref={video} className="aspect-square w-full object-cover sm:aspect-video" muted playsInline />
        {camara === 'iniciando' && (
          <p className="absolute inset-0 flex items-center justify-center text-texto-secundario">Abriendo la cámara…</p>
        )}
        {camara === 'sin-camara' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-texto-secundario">
            No pudimos usar la cámara. Revisá que el navegador tenga permiso —el ícono a la izquierda de la
            dirección— y que la página se haya abierto con https. Mientras tanto, buscá al socio por nombre.
          </div>
        )}
      </div>

      <div className="tarjeta space-y-3">
        <label className="block space-y-1">
          <span className="etiqueta">¿No trae el teléfono? Buscalo por nombre</span>
          <input value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)} placeholder="Nombre o apellido" className="campo" />
        </label>
        {coincidencias.length > 0 && (
          <ul className="space-y-1">
            {coincidencias.map((s) => (
              <li key={s.id}>
                <button
                  type="button" className="boton boton-secundario w-full justify-start"
                  onClick={async () => {
                    setBusqueda('')
                    mostrar(await entradaManual(s.id).catch(() => FALLO))
                  }}
                >
                  {s.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {resultado && <TarjetaEntrada resultado={resultado} esAdmin={esAdmin} alCerrar={cerrar} />}
    </div>
  )
}
