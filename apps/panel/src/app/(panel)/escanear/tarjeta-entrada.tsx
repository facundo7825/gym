'use client'

import Link from 'next/link'
import { estaAlDia } from '@gym/core'
import { AvatarSocio } from '@/components/avatar-socio'
import { EtiquetaCuota } from '@/components/etiqueta-cuota'
import type { ResultadoEntrada } from '../socios/acciones'

/**
 * Lo que el empleado mira en el mostrador: la foto contra la cara, y la
 * cuota en verde o rojo. Control de acceso y control de cobranza en el mismo
 * gesto (sección 9 del diseño general).
 */
export function TarjetaEntrada({ resultado, esAdmin, alCerrar }: {
  resultado: ResultadoEntrada
  esAdmin: boolean
  alCerrar: () => void
}) {
  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-velo p-4 sm:items-center" role="dialog" aria-live="assertive">
      <div className="tarjeta w-full max-w-md space-y-4 bg-fondo p-6 text-center">
        {resultado.tipo === 'valido' && (
          <>
            <div className="flex justify-center">
              <AvatarSocio nombre={resultado.nombre} url={resultado.fotoUrl} grande />
            </div>
            <p className="text-2xl font-bold">{resultado.nombre}</p>
            <EtiquetaCuota estado={resultado.estado} grande />
            <p className={resultado.nuevo ? 'text-vigente' : 'text-texto-secundario'}>
              {resultado.nuevo
                ? `Entrada registrada ${resultado.hora}`
                : `Ya registró entrada hoy a las ${resultado.hora}`}
            </p>
            {esAdmin && !estaAlDia(resultado.estado) && (
              <Link href={`/socios/${resultado.membershipId}#pago`} className="boton boton-principal w-full">
                Registrar pago
              </Link>
            )}
          </>
        )}
        {resultado.tipo === 'invalido' && (
          <p className="text-2xl font-bold text-rechazo">QR no válido</p>
        )}
        {resultado.tipo === 'error' && (
          <p className="text-lg font-semibold text-rechazo">No pudimos registrar la entrada, probá de nuevo.</p>
        )}
        <button type="button" className="boton boton-secundario w-full" onClick={alCerrar}>
          Seguir escaneando
        </button>
      </div>
    </div>
  )
}
