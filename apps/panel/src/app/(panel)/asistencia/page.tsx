import Link from 'next/link'
import { formatearFecha, hoyEnZona, puede, sumarDias } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { miMembresia } from '@/lib/membresia'
import { nombreCompleto } from '@/components/avatar-socio'
import { BotonConfirmar } from '@/components/boton-confirmar'
import { borrarEntrada } from '../socios/acciones'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export default async function Asistencia({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>
}) {
  const yo = await miMembresia()
  if (!yo || !puede(yo.rol, 'escanear_checkin')) {
    return <p className="tarjeta text-texto-secundario">La asistencia la ve el personal del gimnasio.</p>
  }

  const hoy = hoyEnZona(yo.zona)
  const { dia: pedido } = await searchParams
  const dia = pedido && FECHA.test(pedido) ? pedido : hoy

  const supabase = await crearClienteServidor()
  // checkins tiene dos claves a memberships —el socio y quien registró—: el
  // nombre de la restricción le dice a PostgREST cuál es cuál.
  const { data: entradas } = await supabase
    .from('checkins')
    .select(`
      id, created_at, metodo, membership_id,
      socio:memberships!checkins_membresia_fk ( profiles ( nombre, apellido ) ),
      registrador:memberships!checkins_registrador_fk ( profiles ( nombre, apellido ) )
    `)
    .eq('dia', dia)
    .order('created_at', { ascending: false })

  const hora = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: yo.zona })
  const esAdmin = puede(yo.rol, 'gestionar_socios')
  const lista = entradas ?? []

  return (
    <div className="space-y-6">
      <h1 className="titulo-pagina">Asistencia</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/asistencia?dia=${sumarDias(dia, -1)}`} className="boton boton-secundario">← Anterior</Link>
        <p className="min-w-32 text-center font-semibold tabular-nums">
          {dia === hoy ? 'Hoy' : formatearFecha(dia, true)}
        </p>
        {dia < hoy && (
          <Link href={`/asistencia?dia=${sumarDias(dia, 1)}`} className="boton boton-secundario">Siguiente →</Link>
        )}
        {dia !== hoy && <Link href="/asistencia" className="enlace text-sm">Volver a hoy</Link>}
      </div>

      <p className="text-sm text-texto-secundario">
        {lista.length} {lista.length === 1 ? 'entrada' : 'entradas'}
      </p>

      {lista.length === 0 ? (
        <p className="tarjeta text-texto-secundario">No hubo entradas este día.</p>
      ) : (
        <ul className="tarjeta divide-y divide-superficie-borde p-0">
          {lista.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="w-14 font-semibold tabular-nums">{hora.format(new Date(x.created_at))}</span>
              <Link href={`/socios/${x.membership_id}`} className="min-w-0 flex-1 truncate font-semibold">
                {nombreCompleto(x.socio?.profiles ?? null)}
              </Link>
              <span className="text-xs text-texto-secundario">
                {x.metodo === 'qr' ? 'QR' : 'A mano'}
                {x.registrador?.profiles && ` · ${x.registrador.profiles.nombre}`}
              </span>
              {esAdmin && (
                <BotonConfirmar
                  texto="Borrar" pregunta="¿Borrar esta entrada?" confirmar="Borrar" peligro
                  accion={borrarEntrada.bind(null, x.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
