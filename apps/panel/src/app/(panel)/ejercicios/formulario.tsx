'use client'

import { useActionState } from 'react'
import { EQUIPAMIENTOS, GRUPOS_MUSCULARES, etiqueta } from '@gym/core'
import { crearEjercicio, type EstadoFormulario } from './acciones'

const INICIAL: EstadoFormulario = {}

export function FormularioEjercicio({
  maquinas,
}: {
  maquinas: { id: string; nombre: string }[]
}) {
  const [estado, accion, pendiente] = useActionState(crearEjercicio, INICIAL)

  return (
    <div className="max-w-2xl space-y-2">
      <form action={accion} className="grid gap-2 sm:grid-cols-2">
        <input name="nombre" placeholder="Nombre" required
          className="campo sm:col-span-2" />

        <select name="grupo_muscular" required className="campo">
          <option value="">Grupo muscular…</option>
          {GRUPOS_MUSCULARES.map((g) => (
            <option key={g} value={g}>{etiqueta(g)}</option>
          ))}
        </select>

        <select name="equipamiento" required className="campo">
          <option value="">Equipamiento…</option>
          {EQUIPAMIENTOS.map((eq) => (
            <option key={eq} value={eq}>{etiqueta(eq)}</option>
          ))}
        </select>

        <select name="maquina_id" className="campo sm:col-span-2">
          <option value="">Sin máquina asociada</option>
          {maquinas.map((m) => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>

        <textarea name="descripcion" placeholder="Descripción (opcional)"
          className="campo sm:col-span-2" rows={2} />

        <button type="submit" disabled={pendiente}
          className="boton boton-principal sm:col-span-2">
          {pendiente ? 'Creando…' : 'Crear ejercicio'}
        </button>
      </form>

      {estado.error && (
        <p role="alert" className="text-sm text-rechazo">{estado.error}</p>
      )}
    </div>
  )
}
