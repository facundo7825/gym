'use client'

import { useActionState } from 'react'
import { editarDatos, type EstadoDatos } from '../acciones'

const INICIAL: EstadoDatos = {}

export function FormularioDatos({ membershipId, nombre, apellido, telefono }: {
  membershipId: string
  nombre: string
  apellido: string
  telefono: string | null
}) {
  const [estado, accion, pendiente] = useActionState(editarDatos, INICIAL)

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="membership_id" value={membershipId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="etiqueta">Nombre</span>
          <input name="nombre" required defaultValue={nombre} className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Apellido</span>
          <input name="apellido" defaultValue={apellido} className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Teléfono</span>
          <input name="telefono" type="tel" defaultValue={telefono ?? ''} className="campo" />
        </label>
      </div>
      <p className="text-xs text-texto-tenue">
        El nombre y el teléfono son de la persona: si también es socio de otro gimnasio de la plataforma, allá se ve el cambio.
      </p>
      {estado.error && <p role="alert" className="text-sm text-rechazo">{estado.error}</p>}
      {estado.ok && <p role="status" className="text-sm text-vigente">Datos guardados.</p>}
      <button type="submit" disabled={pendiente} className="boton boton-secundario">
        {pendiente ? 'Guardando…' : 'Guardar datos'}
      </button>
    </form>
  )
}
