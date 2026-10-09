'use client'

import { useActionState } from 'react'
import { NIVELES_RUTINA, OBJETIVOS_RUTINA, etiqueta } from '@gym/core'
import { crearPlantilla, type EstadoFormulario } from './acciones'

const INICIAL: EstadoFormulario = {}

export function FormularioPlantilla() {
  const [estado, accion, enviando] = useActionState(crearPlantilla, INICIAL)

  return (
    <form action={accion} className="tarjeta space-y-3">
      <h2 className="font-semibold">Nueva plantilla</h2>

      <input name="nombre" placeholder="Nombre" required
        className="campo" />

      <input name="descripcion" placeholder="Descripción (opcional)"
        className="campo" />

      <div className="flex gap-3">
        <select name="objetivo" defaultValue="general"
          className="campo w-auto">
          {OBJETIVOS_RUTINA.map((valor) => (
            <option key={valor} value={valor}>{etiqueta(valor)}</option>
          ))}
        </select>

        <select name="nivel" defaultValue="principiante"
          className="campo w-auto">
          {NIVELES_RUTINA.map((valor) => (
            <option key={valor} value={valor}>{etiqueta(valor)}</option>
          ))}
        </select>
      </div>

      {estado.error && (
        <p role="alert" className="text-rechazo">{estado.error}</p>
      )}

      <button type="submit" disabled={enviando}
        className="boton boton-principal">
        {enviando ? 'Guardando…' : 'Crear'}
      </button>
    </form>
  )
}
