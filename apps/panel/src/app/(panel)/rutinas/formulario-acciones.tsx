'use client'

import { useState, useTransition } from 'react'
import { archivar, duplicar } from './acciones'

export function AccionesPlantilla({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const correr = (fn: (id: string) => Promise<{ error?: string }>) => () =>
    iniciar(async () => {
      const r = await fn(id)
      setError(r.error ?? null)
    })

  // Archivar saca la plantilla del catálogo del gimnasio y de esta lista, y
  // el panel no tiene una vista de archivadas: un clic de más la esconde sin
  // una forma cómoda de traerla de vuelta. Por eso se pregunta antes, y
  // duplicar —que no rompe nada— sigue siendo un solo clic.
  const alArchivar = () => {
    const seguro = window.confirm(
      '¿Archivar esta rutina? Deja de aparecer en el catálogo del gimnasio.',
    )
    if (seguro) correr(archivar)()
  }

  return (
    <span className="flex items-center gap-2 text-sm">
      {error && <span className="text-red-600">{error}</span>}
      <button onClick={correr(duplicar)} disabled={pendiente}
        className="rounded border px-2 py-1 disabled:opacity-50">
        Duplicar
      </button>
      <button onClick={alArchivar} disabled={pendiente}
        className="rounded border px-2 py-1 disabled:opacity-50">
        Archivar
      </button>
    </span>
  )
}
