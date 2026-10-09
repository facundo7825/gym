'use client'

import { useActionState } from 'react'
import { ETIQUETA_METODO_PAGO, METODOS_PAGO, type MetodoPago, type PeriodoCuota } from '@gym/core'
import { registrarPago, type EstadoPago } from '../acciones'

const INICIAL: EstadoPago = {}

/**
 * Todo viene propuesto: período (un mes desde el vencimiento anterior), monto
 * (el del último pago) y método (el último usado). El admin confirma o
 * corrige. "Vence el" es el primer día sin cobertura, igual que en la base.
 */
export function FormularioPago({ membershipId, propuesto, monto, metodo, hoy }: {
  membershipId: string
  propuesto: PeriodoCuota
  monto: number | null
  metodo: MetodoPago
  hoy: string
}) {
  const [estado, accion, pendiente] = useActionState(registrarPago, INICIAL)
  const v = estado.valores

  return (
    <form action={accion} className="space-y-3 rounded-medio bg-hundido p-3">
      <input type="hidden" name="membership_id" value={membershipId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="etiqueta">Desde</span>
          <input name="periodo_desde" type="date" required defaultValue={v?.periodo_desde ?? propuesto.periodo_desde} className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Vence el</span>
          <input name="periodo_hasta" type="date" required defaultValue={v?.periodo_hasta ?? propuesto.periodo_hasta} className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Monto</span>
          <input name="monto" inputMode="decimal" required defaultValue={v?.monto ?? (monto ?? '')} className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Cómo pagó</span>
          <select name="metodo" defaultValue={v?.metodo ?? metodo} className="campo">
            {METODOS_PAGO.map((m) => <option key={m} value={m}>{ETIQUETA_METODO_PAGO[m]}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Fecha de pago</span>
          <input name="fecha_pago" type="date" required defaultValue={v?.fecha_pago ?? hoy} className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Notas (opcional)</span>
          <input name="notas" defaultValue={v?.notas} className="campo" />
        </label>
      </div>
      {estado.error && <p role="alert" className="text-sm text-rechazo">{estado.error}</p>}
      {estado.ok && <p role="status" className="text-sm text-vigente">Pago registrado.</p>}
      <button type="submit" disabled={pendiente} className="boton boton-principal">
        {pendiente ? 'Guardando…' : 'Registrar pago'}
      </button>
    </form>
  )
}
