import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { estadoCuota, estaAlDia, hoyEnZona, puede, type PeriodoCuota } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { miMembresia } from '@/lib/membresia'
import { urlsDeFotos } from '@/lib/fotos'
import { todasLasPaginas } from '@/lib/paginar'
import { AvatarSocio, nombreCompleto } from '@/components/avatar-socio'
import { EtiquetaCuota } from '@/components/etiqueta-cuota'
import { Asignar } from './asignar'

const FILTROS = [
  { valor: 'todos', texto: 'Todos' },
  // Incluye a los que nunca pagaron: para quien cobra es la misma lista.
  { valor: 'sin-cuota', texto: 'Sin cuota al día' },
  { valor: 'inactivos', texto: 'Inactivos' },
] as const

export default async function Socios({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filtro?: string }>
}) {
  const { q = '', filtro = 'todos' } = await searchParams
  const yo = await miMembresia()
  // El layout ya mostró el aviso de cuenta sin gimnasio.
  if (!yo) return null

  const supabase = await crearClienteServidor()
  const hoy = hoyEnZona(yo.zona)
  const inactivos = filtro === 'inactivos'

  // memberships_leer (etapa 0) ya limita esto al propio gimnasio.
  const { data: socios } = await supabase
    .from('memberships')
    .select('id, foto, profiles ( nombre, apellido )')
    .eq('rol', 'socio')
    .eq('estado', inactivos ? 'inactivo' : 'activo')

  const { data: rutinas } = await supabase
    .from('rutinas')
    .select('id, nombre, tipo, propietario_id, asignada_por, estado')
    .eq('estado', 'activa')

  // Hasta tres por socio: lo resuelve la vista (0015). El segundo order
  // desempata para que las páginas no se pisen.
  const sesiones = await todasLasPaginas((desde, hasta) => supabase
    .from('ultimas_sesiones')
    .select('id, membership_id, inicio, fin, dia_nombre, series')
    .order('inicio', { ascending: false })
    .order('id')
    .range(desde, hasta))

  const cuotas = await todasLasPaginas((desde, hasta) => supabase
    .from('cuotas')
    .select('id, membership_id, periodo_desde, periodo_hasta')
    .order('id')
    .range(desde, hasta))

  const cuotasDe = new Map<string, PeriodoCuota[]>()
  for (const c of cuotas) cuotasDe.set(c.membership_id, [...(cuotasDe.get(c.membership_id) ?? []), c])

  const fotos = await urlsDeFotos(supabase, (socios ?? []).map((s) => s.foto))

  const busqueda = q.trim().toLowerCase()
  const lista = (socios ?? [])
    .map((s) => ({ ...s, nombre: nombreCompleto(s.profiles), estado: estadoCuota(cuotasDe.get(s.id) ?? [], hoy) }))
    .filter((s) => !busqueda || s.nombre.toLowerCase().includes(busqueda))
    .filter((s) => filtro !== 'sin-cuota' || !estaAlDia(s.estado))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const plantillas = rutinas?.filter((r) => r.tipo === 'plantilla') ?? []
  const activas = rutinas?.filter((r) => r.tipo === 'activa') ?? []

  const fecha = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short', day: 'numeric', month: 'numeric', timeZone: yo.zona,
  })

  const hrefFiltro = (valor: string) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (valor !== 'todos') p.set('filtro', valor)
    const s = p.toString()
    return s ? `/socios?${s}` : '/socios'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="titulo-pagina">Socios</h1>
        {puede(yo.rol, 'gestionar_socios') && (
          <Link href="/socios/nuevo" className="boton boton-principal">
            <UserPlus size={18} /> Nuevo socio
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {/* GET: la búsqueda queda en la URL y se puede volver atrás. */}
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar por nombre" className="campo" />
          {filtro !== 'todos' && <input type="hidden" name="filtro" value={filtro} />}
          <button type="submit" className="boton boton-secundario">Buscar</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <Link key={f.valor} href={hrefFiltro(f.valor)}
              className={`chip ${filtro === f.valor ? 'chip-activo' : ''}`}>
              {f.texto}
            </Link>
          ))}
        </div>
      </div>

      {lista.length === 0 && (
        <p className="tarjeta text-texto-secundario">
          {(socios ?? []).length === 0
            ? inactivos ? 'No hay socios dados de baja.' : 'Todavía no hay socios en el gimnasio.'
            : 'Ningún socio coincide con la búsqueda.'}
        </p>
      )}

      <ul className="grid gap-4 lg:grid-cols-2">
        {lista.map((s) => {
          const suyas = activas.filter((r) => r.propietario_id === s.id)
          const ultimas = sesiones.filter((x) => x.membership_id === s.id)

          return (
            <li key={s.id} className="tarjeta space-y-4">
              <Link href={`/socios/${s.id}`} className="flex items-center gap-3">
                <AvatarSocio nombre={s.nombre} url={s.foto ? fotos.get(s.foto) : null} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.nombre}</p>
                  <p className="text-xs text-texto-secundario">
                    {suyas.length ? `${suyas.length} ${suyas.length === 1 ? 'rutina activa' : 'rutinas activas'}` : 'Sin rutinas activas.'}
                  </p>
                </div>
                <EtiquetaCuota estado={s.estado} />
              </Link>

              {suyas.length > 0 && (
                <ul className="space-y-2">
                  {suyas.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-medio bg-hundido px-3 py-2 text-sm">
                      <span>{r.nombre}</span>
                      {/* La que se armó solo el socio no se edita: la RLS ya lo
                          decide, acá solo se refleja para no ofrecer un botón
                          que va a fallar. */}
                      {r.asignada_por ? (
                        <Link href={`/rutinas/${r.id}`} className="enlace">editar</Link>
                      ) : (
                        <span className="text-texto-tenue">(se la armó el socio)</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-1 text-sm">
                <p className="etiqueta">Últimas sesiones</p>
                {ultimas.length ? (
                  <ul className="space-y-0.5 tabular-nums text-texto">
                    {ultimas.map((x) => (
                      <li key={x.id!}>
                        {fecha.format(new Date(x.inicio!))}
                        {' · '}{x.dia_nombre ?? 'Entrenamiento libre'}
                        {' · '}{x.series} series
                        {!x.fin && <span className="text-pendiente"> · sin terminar</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-texto-tenue">Todavía no registró entrenamientos.</p>
                )}
              </div>

              {!inactivos && <Asignar socioId={s.id} plantillas={plantillas} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
