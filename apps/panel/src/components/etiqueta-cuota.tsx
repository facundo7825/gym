import { estaAlDia, textoEstadoCuota, type EstadoCuota } from '@gym/core'

/** Verde al día, ámbar si la cuota todavía no empezó, rojo en cualquier otro caso. */
export function EtiquetaCuota({ estado, grande = false }: { estado: EstadoCuota; grande?: boolean }) {
  const color = estaAlDia(estado)
    ? 'bg-vigente-suave text-vigente'
    : estado.tipo === 'empieza'
      ? 'bg-pendiente-suave text-pendiente'
      : 'bg-rechazo-suave text-rechazo'
  const medida = grande ? 'min-h-11 px-4 text-base' : 'min-h-7 px-3 text-xs'

  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${medida} ${color}`}>
      {estado.tipo === 'vencida' && '⚠️ '}
      {textoEstadoCuota(estado)}
    </span>
  )
}
