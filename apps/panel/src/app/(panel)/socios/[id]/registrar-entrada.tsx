'use client'

import { useState, useTransition } from 'react'
import { entradaManual, type ResultadoEntrada } from '../acciones'

/** El check-in manual desde la ficha: para cuando el socio no trae el teléfono. */
export function RegistrarEntrada({ membershipId }: { membershipId: string }) {
  const [resultado, setResultado] = useState<ResultadoEntrada | null>(null)
  const [pendiente, iniciar] = useTransition()

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        type="button" disabled={pendiente} className="boton boton-secundario"
        onClick={() => iniciar(async () => setResultado(await entradaManual(membershipId)))}
      >
        {pendiente ? 'Registrando…' : 'Registrar entrada'}
      </button>
      {resultado?.tipo === 'valido' && (
        <span className="text-vigente">
          {resultado.nuevo ? `Entrada registrada ${resultado.hora}` : `Ya registró entrada hoy a las ${resultado.hora}`}
        </span>
      )}
      {resultado?.tipo === 'invalido' && <span className="text-rechazo">La membresía no está activa.</span>}
      {resultado?.tipo === 'error' && <span className="text-rechazo">No pudimos registrar la entrada, probá de nuevo.</span>}
    </div>
  )
}
