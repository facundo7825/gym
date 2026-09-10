'use client'

import { useActionState } from 'react'
import { NIVELES_RUTINA, OBJETIVOS_RUTINA, etiqueta } from '@gym/core'
import { crearPlantilla, type EstadoFormulario } from './acciones'

const INICIAL: EstadoFormulario = {}

export function FormularioPlantilla() {
  const [estado, accion, enviando] = useActionState(crearPlantilla, INICIAL)

  return (
    <form action={accion} className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">Nueva plantilla</h2>

      <input name="nombre" placeholder="Nombre" required
        className="w-full rounded border px-3 py-2" />

      <input name="descripcion" placeholder="Descripción (opcional)"
        className="w-full rounded border px-3 py-2" />

      <div className="flex gap-3">
        <select name="objetivo" defaultValue="general"
          className="rounded border px-3 py-2">
          {OBJETIVOS_RUTINA.map((valor) => (
            <option key={valor} value={valor}>{etiqueta(valor)}</option>
          ))}
        </select>

        <select name="nivel" defaultValue="principiante"
          className="rounded border px-3 py-2">
          {NIVELES_RUTINA.map((valor) => (
            <option key={valor} value={valor}>{etiqueta(valor)}</option>
          ))}
        </select>
      </div>

      {estado.error && (
        <p role="alert" className="text-red-600">{estado.error}</p>
      )}

      <button type="submit" disabled={enviando}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
        {enviando ? 'Guardando…' : 'Crear'}
      </button>
    </form>
  )
}
