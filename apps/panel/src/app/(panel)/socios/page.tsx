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

  const plantillas = rutinas?.filter((r) => r.tipo === 'plantilla') ?? []
  const activas = rutinas?.filter((r) => r.tipo === 'activa') ?? []

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Socios</h1>

      <ul className="divide-y rounded border">
        {(socios ?? []).map((s) => {
          const suyas = activas.filter((r) => r.propietario_id === s.id)
          const nombre = `${s.profiles?.nombre ?? ''} ${s.profiles?.apellido ?? ''}`.trim()

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

              <Asignar socioId={s.id} plantillas={plantillas} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
