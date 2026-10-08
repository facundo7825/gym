import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { Asignar } from './asignar'

export default async function Socios() {
  const supabase = await crearClienteServidor()

  // memberships_leer (etapa 0) ya limita esto al propio gimnasio.
  const { data: socios } = await supabase
    .from('memberships')
    .select('id, profiles ( nombre, apellido )')
    .eq('rol', 'socio')
    .eq('estado', 'activo')

  const { data: rutinas } = await supabase
    .from('rutinas')
    .select('id, nombre, tipo, propietario_id, asignada_por, estado')
    .eq('estado', 'activa')

  // Hasta tres por socio: lo resuelve la vista (0015). La RLS ya limita esto al
  // propio gimnasio.
  const { data: sesiones } = await supabase
    .from('ultimas_sesiones')
    .select('id, membership_id, inicio, fin, dia_nombre, series')
    .order('inicio', { ascending: false })

  const plantillas = rutinas?.filter((r) => r.tipo === 'plantilla') ?? []
  const activas = rutinas?.filter((r) => r.tipo === 'activa') ?? []

  // La zona fija de Argentina: el servidor del panel puede correr en UTC, y una
  // sesión de las 22 hs no puede aparecer como del día siguiente.
  const fecha = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short', day: 'numeric', month: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Socios</h1>

      <ul className="divide-y rounded border">
        {(socios ?? []).map((s) => {
          const suyas = activas.filter((r) => r.propietario_id === s.id)
          const nombre = `${s.profiles?.nombre ?? ''} ${s.profiles?.apellido ?? ''}`.trim()
          const ultimas = (sesiones ?? []).filter((x) => x.membership_id === s.id)

          return (
            <li key={s.id} className="space-y-2 px-4 py-3">
              <p className="font-semibold">{nombre || 'Sin nombre'}</p>

              {suyas.length ? (
                <ul className="text-sm text-gray-700">
                  {suyas.map((r) => (
                    <li key={r.id}>
                      {r.nombre}
                      {/* La que se armó solo el socio no se edita: la RLS ya lo
                          decide, acá solo se refleja para no ofrecer un botón
                          que va a fallar. */}
                      {r.asignada_por ? (
                        <Link href={`/rutinas/${r.id}`} className="ml-2 underline">
                          editar
                        </Link>
                      ) : (
                        <span className="ml-2 text-gray-500">(se la armó el socio)</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Sin rutinas activas.</p>
              )}

              <div className="text-sm">
                <p className="text-gray-500">Últimas sesiones</p>
                {ultimas.length ? (
                  <ul className="text-gray-700">
                    {ultimas.map((x) => (
                      <li key={x.id!}>
                        {fecha.format(new Date(x.inicio!))}
                        {' · '}{x.dia_nombre ?? 'Entrenamiento libre'}
                        {' · '}{x.series} series
                        {!x.fin && <span className="text-gray-500"> · sin terminar</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">Todavía no registró entrenamientos.</p>
                )}
              </div>

              <Asignar socioId={s.id} plantillas={plantillas} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
