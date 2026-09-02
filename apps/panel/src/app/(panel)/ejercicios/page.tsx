import { etiqueta } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { FormularioEjercicio } from './formulario'

export default async function Ejercicios() {
  const supabase = await crearClienteServidor()

  const { data: ejercicios } = await supabase
    .from('ejercicios')
    .select('id, nombre, grupo_muscular, equipamiento, gym_id')
    .order('nombre')

  const { data: maquinas } = await supabase
    .from('maquinas').select('id, nombre').order('nombre')

  const propios = ejercicios?.filter((x) => x.gym_id !== null) ?? []
  const globales = ejercicios?.filter((x) => x.gym_id === null) ?? []

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Ejercicios</h1>

      <FormularioEjercicio maquinas={maquinas ?? []} />

      <section>
        <h2 className="mb-2 font-semibold">De mi gimnasio ({propios.length})</h2>
        {propios.length ? (
          <ul className="divide-y rounded border">
            {propios.map((x) => (
              <li key={x.id} className="px-4 py-3">
                {x.nombre}
                <span className="text-gray-500">
                  {' · '}{etiqueta(x.grupo_muscular)}{' · '}{etiqueta(x.equipamiento)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600">Todavía no cargaste ejercicios propios.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Catálogo general ({globales.length})</h2>
        <p className="mb-2 text-sm text-gray-600">
          Vienen incluidos con la plataforma. Los ven todos los gimnasios y no se editan.
        </p>
        <ul className="divide-y rounded border">
          {globales.map((x) => (
            <li key={x.id} className="px-4 py-3">
              {x.nombre}
              <span className="text-gray-500">{' · '}{etiqueta(x.grupo_muscular)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
