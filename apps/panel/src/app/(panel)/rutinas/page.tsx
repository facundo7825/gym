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
    <div className="space-y-6">
      <h1 className="titulo-pagina">Rutinas</h1>

      <FormularioPlantilla />

      <section>
        <h2 className="etiqueta mb-2">
          Plantillas del gimnasio ({plantillas?.length ?? 0})
        </h2>
        {plantillas?.length ? (
          <ul className="space-y-2">
            {plantillas.map((r) => (
              <li key={r.id} className="tarjeta flex items-center gap-3">
                <Link href={`/rutinas/${r.id}`} className="flex-1 hover:text-cian">
                  {r.nombre}
                  <span className="text-texto-secundario">
                    {' · '}{r.rutina_dias.length} días
                  </span>
                </Link>
                <AccionesPlantilla id={r.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-texto-secundario">Todavía no creaste ninguna plantilla.</p>
        )}
      </section>
    </div>
  )
}
