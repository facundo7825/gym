'use client'

import { useState, useTransition } from 'react'

/**
 * Un botón que pregunta antes de hacer algo que no se deshace solo: borrar un
 * pago, dar de baja, regenerar el QR. En la misma línea y no con confirm():
 * un diálogo del navegador bloquea la página y en el celular se ve mal.
 */
export function BotonConfirmar({ texto, pregunta, confirmar = 'Sí', peligro = false, accion }: {
  texto: string
  pregunta: string
  confirmar?: string
  peligro?: boolean
  accion: () => Promise<{ error?: string }>
}) {
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const clase = `boton ${peligro ? 'boton-peligro' : 'boton-secundario'}`

  if (!abierto) {
    return (
      <div className="space-y-1">
        <button type="button" className={clase} onClick={() => { setError(null); setAbierto(true) }}>
          {texto}
        </button>
        {error && <p role="alert" className="text-sm text-rechazo">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>{pregunta}</span>
      <button
        type="button" disabled={pendiente} className={clase}
        onClick={() => iniciar(async () => {
          const r = await accion()
          setAbierto(false)
          setError(r.error ?? null)
        })}
      >
        {pendiente ? 'Un momento…' : confirmar}
      </button>
      <button type="button" disabled={pendiente} className="boton boton-secundario" onClick={() => setAbierto(false)}>
        Cancelar
      </button>
    </div>
  )
}
