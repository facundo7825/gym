'use client'

import { useActionState } from 'react'
import { crearMaquina, type EstadoFormulario } from './acciones'

const INICIAL: EstadoFormulario = {}

export function FormularioMaquina() {
  const [estado, accion, pendiente] = useActionState(crearMaquina, INICIAL)

  return (
    <div className="space-y-2">
      <form action={accion} className="flex flex-wrap gap-2">
        <input name="nombre" placeholder="Nombre" required
          className="rounded border px-3 py-2" />
        <input name="marca" placeholder="Marca (opcional)"
          className="rounded border px-3 py-2" />
        <input name="cantidad" type="number" min={1} defaultValue={1}
          className="w-24 rounded border px-3 py-2" />
        <button type="submit" disabled={pendiente}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
          {pendiente ? 'Guardando…' : 'Agregar'}
        </button>
      </form>

      {estado.error && (
        <p role="alert" className="text-sm text-red-600">{estado.error}</p>
      )}
    </div>
  )
}
