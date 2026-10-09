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
          className="campo w-auto" />
        <input name="marca" placeholder="Marca (opcional)"
          className="campo w-auto" />
        <input name="cantidad" type="number" min={1} defaultValue={1}
          className="campo w-24" />
        <button type="submit" disabled={pendiente}
          className="boton boton-principal">
          {pendiente ? 'Guardando…' : 'Agregar'}
        </button>
      </form>

      {estado.error && (
        <p role="alert" className="text-sm text-rechazo">{estado.error}</p>
      )}
    </div>
  )
}
