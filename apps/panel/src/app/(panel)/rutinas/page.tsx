import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { FormularioPlantilla } from './formulario'
import { AccionesPlantilla } from './formulario-acciones'

export default async function Rutinas() {
  const supabase = await crearClienteServidor()

  // RLS ya deja fuera las rutinas activas de los socios de otros gimnasios y
  // las de este que no sean plantillas: el filtro por tipo es para la vista.
  const { data: plantillas } = await supabase
    .from('rutinas')
    .select('id, nombre, descripcion, objetivo, nivel, estado, rutina_dias(id)')
    .eq('tipo', 'plantilla')
    .eq('estado', 'activa')
    .order('nombre')

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Rutinas</h1>

      <FormularioPlantilla />

      <section>
        <h2 className="mb-2 font-semibold">
          Plantillas del gimnasio ({plantillas?.length ?? 0})
        </h2>
        {plantillas?.length ? (
          <ul className="divide-y rounded border">
            {plantillas.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/rutinas/${r.id}`} className="flex-1 hover:underline">
                  {r.nombre}
                  <span className="text-gray-500">
                    {' · '}{r.rutina_dias.length} días
                  </span>
                </Link>
                <AccionesPlantilla id={r.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600">Todavía no creaste ninguna plantilla.</p>
        )}
      </section>
    </div>
  )
}
