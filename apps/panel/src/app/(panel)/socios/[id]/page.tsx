import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ETIQUETA_METODO_PAGO, estadoCuota, formatearFecha, hoyEnZona, montoPropuesto, periodoPropuesto,
  primerDiaDelMes, puede, textoPeriodo,
} from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { miMembresia } from '@/lib/membresia'
import { urlsDeFotos } from '@/lib/fotos'
import { nombreCompleto } from '@/components/avatar-socio'
import { EtiquetaCuota } from '@/components/etiqueta-cuota'
import { BotonConfirmar } from '@/components/boton-confirmar'
import { borrarEntrada, borrarPago, cambiarEstado, regenerarQr } from '../acciones'
import { FotoSocio } from './foto-socio'
import { FormularioPago } from './formulario-pago'
import { FormularioDatos } from './formulario-datos'
import { RegistrarEntrada } from './registrar-entrada'

export default async function FichaSocio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aviso?: string }>
}) {
  const { id } = await params
  const { aviso } = await searchParams
  const yo = await miMembresia()
  if (!yo) return null

  const supabase = await crearClienteServidor()
  // RLS ya devuelve vacío si la membresía es de otro gimnasio.
  const { data: socio } = await supabase
    .from('memberships')
    .select('id, gym_id, estado, fecha_alta, foto, profiles ( nombre, apellido, telefono )')
    .eq('id', id)
    .maybeSingle()
  if (!socio) notFound()

  const hoy = hoyEnZona(yo.zona)
  const [{ data: cuotas }, { count: vecesEsteMes }, { data: entradas }, fotos] = await Promise.all([
    supabase
      .from('cuotas')
      .select('id, periodo_desde, periodo_hasta, monto, moneda, metodo, fecha_pago, notas, created_at')
      .eq('membership_id', id)
      .order('periodo_desde', { ascending: false }),
    supabase
      .from('checkins').select('id', { count: 'exact', head: true })
      .eq('membership_id', id).gte('dia', primerDiaDelMes(hoy)),
    supabase
      .from('checkins').select('id, created_at, metodo')
      .eq('membership_id', id).order('created_at', { ascending: false }).limit(10),
    urlsDeFotos(supabase, [socio.foto]),
  ])

  const pagos = cuotas ?? []
  const esAdmin = puede(yo.rol, 'gestionar_socios')
  const activo = socio.estado === 'activo'
  const nombre = nombreCompleto(socio.profiles)
  const estado = estadoCuota(pagos, hoy)
  const propuesto = periodoPropuesto(pagos, hoy)
  const ultimo = [...pagos].sort((a, b) =>
    (b.fecha_pago + b.created_at).localeCompare(a.fecha_pago + a.created_at))[0]

  const plata = (monto: number, moneda: string) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(monto)
  const momento = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: yo.zona,
  })

  return (
    <div className="space-y-6">
      <Link href="/socios" className="enlace text-sm">← Socios</Link>

      {aviso === 'ya-es-socio' && (
        <p className="tarjeta text-texto-secundario">Esta persona ya era socio de este gimnasio.</p>
      )}

      <section className="tarjeta flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <FotoSocio
          membershipId={socio.id} gymId={socio.gym_id} nombre={nombre}
          url={socio.foto ? fotos.get(socio.foto) ?? null : null} puedeCambiar={esAdmin}
        />
        <div className="space-y-2 text-center sm:text-left">
          <h1 className="titulo-pagina">{nombre}</h1>
          <p className="text-sm text-texto-secundario">
            {socio.profiles?.telefono ?? 'Sin teléfono'} · Socio desde el {formatearFecha(socio.fecha_alta, true)}
          </p>
          {activo
            ? <EtiquetaCuota estado={estado} grande />
            : <span className="inline-flex min-h-7 items-center rounded-full bg-rechazo-suave px-3 text-xs font-semibold text-rechazo">Dado de baja</span>}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section id="pago" className="tarjeta space-y-4">
          <h2 className="text-lg font-semibold">Pagos</h2>
          {esAdmin && activo && (
            // key: al registrar un pago cambia el período propuesto y el
            // formulario se vuelve a montar con los valores nuevos.
            <FormularioPago
              key={propuesto.periodo_desde}
              membershipId={socio.id} propuesto={propuesto} hoy={hoy}
              monto={montoPropuesto(pagos)} metodo={ultimo?.metodo ?? 'efectivo'}
            />
          )}
          {pagos.length === 0 ? (
            <p className="text-sm text-texto-tenue">Todavía no hay pagos registrados.</p>
          ) : (
            <ul className="space-y-2">
              {pagos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-medio bg-hundido px-3 py-2 text-sm">
                  <div>
                    <p className="font-semibold tabular-nums">{textoPeriodo(c)} · {plata(c.monto, c.moneda)}</p>
                    <p className="text-xs text-texto-secundario">
                      {ETIQUETA_METODO_PAGO[c.metodo]} · pagó el {formatearFecha(c.fecha_pago, true)}
                      {c.notas && ` · ${c.notas}`}
                    </p>
                  </div>
                  {esAdmin && (
                    <BotonConfirmar
                      texto="Borrar" pregunta="¿Borrar este pago?" confirmar="Borrar" peligro
                      accion={borrarPago.bind(null, c.id, socio.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tarjeta space-y-4">
          <h2 className="text-lg font-semibold">Asistencias</h2>
          <p className="text-sm">
            <span className="text-2xl font-bold tabular-nums">{vecesEsteMes ?? 0}</span>{' '}
            {vecesEsteMes === 1 ? 'vez' : 'veces'} este mes
          </p>
          {activo && <RegistrarEntrada membershipId={socio.id} />}
          {(entradas ?? []).length === 0 ? (
            <p className="text-sm text-texto-tenue">Todavía no registró entradas.</p>
          ) : (
            <ul className="space-y-1 text-sm tabular-nums">
              {(entradas ?? []).map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2">
                  <span>{momento.format(new Date(x.created_at))} · {x.metodo === 'qr' ? 'QR' : 'a mano'}</span>
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
        </section>
      </div>

      {esAdmin && (
        <section className="tarjeta space-y-4">
          <h2 className="text-lg font-semibold">Datos y cuenta</h2>
          <FormularioDatos
            membershipId={socio.id}
            nombre={socio.profiles?.nombre ?? ''} apellido={socio.profiles?.apellido ?? ''}
            telefono={socio.profiles?.telefono ?? null}
          />
          <div className="flex flex-wrap gap-3 border-t border-superficie-borde pt-4">
            {activo ? (
              <BotonConfirmar
                texto="Dar de baja" pregunta={`¿Dar de baja a ${nombre}? Deja de poder entrar y de usar la app.`}
                confirmar="Dar de baja" peligro accion={cambiarEstado.bind(null, socio.id, 'inactivo')}
              />
            ) : (
              <BotonConfirmar
                texto="Reactivar" pregunta={`¿Reactivar a ${nombre}?`}
                confirmar="Reactivar" accion={cambiarEstado.bind(null, socio.id, 'activo')}
              />
            )}
            <BotonConfirmar
              texto="Regenerar QR"
              pregunta="El código actual deja de servir. El socio ve el nuevo la próxima vez que abra Perfil con señal."
              confirmar="Regenerar" accion={regenerarQr.bind(null, socio.id)}
            />
          </div>
        </section>
      )}
    </div>
  )
}
