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

  return (
    <span className="flex items-center gap-2 text-sm">
      {error && <span className="text-red-600">{error}</span>}
      <button onClick={correr(duplicar)} disabled={pendiente}
        className="rounded border px-2 py-1 disabled:opacity-50">
        Duplicar
      </button>
      <button onClick={correr(archivar)} disabled={pendiente}
        className="rounded border px-2 py-1 disabled:opacity-50">
        Archivar
      </button>
    </span>
  )
}
