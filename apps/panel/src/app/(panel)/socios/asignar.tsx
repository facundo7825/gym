'use client'

import { useState, useTransition } from 'react'
import { asignar } from '../rutinas/acciones'

export function Asignar({
  socioId,
  plantillas,
}: {
  socioId: string
  plantillas: { id: string; nombre: string }[]
}) {
  const [plantillaId, setPlantillaId] = useState(plantillas[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  if (plantillas.length === 0) {
    return <p className="text-sm text-gray-500">Creá una plantilla para poder asignar.</p>
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <select value={plantillaId} onChange={(ev) => setPlantillaId(ev.target.value)}
        className="rounded border px-2 py-1">
        {plantillas.map((p) => (
          <option key={p.id} value={p.id}>{p.nombre}</option>
        ))}
      </select>
      <button
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await asignar(plantillaId, socioId)
            setError(r.error ?? null)
          })
        }
        className="rounded border px-3 py-1 disabled:opacity-50"
      >
        Asignar
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  )
}
