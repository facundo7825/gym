import { etiqueta } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { FormularioEjercicio } from './formulario'
import { SubirVideo } from './subir-video'

export default async function Ejercicios() {
  const supabase = await crearClienteServidor()

  const { data: ejercicios } = await supabase
    .from('ejercicios')
    .select('id, nombre, grupo_muscular, equipamiento, gym_id, video_id')
    .order('nombre')

  const { data: maquinas } = await supabase
    .from('maquinas').select('id, nombre').order('nombre')

  const propios = ejercicios?.filter((x) => x.gym_id !== null) ?? []
  const globales = ejercicios?.filter((x) => x.gym_id === null) ?? []

  return (
    <div className="space-y-6">
      <h1 className="titulo-pagina">Ejercicios</h1>

      <FormularioEjercicio maquinas={maquinas ?? []} />

      <section>
        <h2 className="etiqueta mb-2">De mi gimnasio ({propios.length})</h2>
        {propios.length ? (
          <ul className="space-y-2">
            {propios.map((x) => (
              <li key={x.id} className="tarjeta">
                {x.nombre}
                <span className="text-texto-secundario">
                  {' · '}{etiqueta(x.grupo_muscular)}{' · '}{etiqueta(x.equipamiento)}
                </span>
                <SubirVideo ejercicioId={x.id} tieneVideo={x.video_id !== null} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-texto-secundario">Todavía no cargaste ejercicios propios.</p>
        )}
      </section>

      <section>
        <h2 className="etiqueta mb-2">Catálogo general ({globales.length})</h2>
        <p className="mb-2 text-sm text-texto-secundario">
          Vienen incluidos con la plataforma. Los ven todos los gimnasios y no se editan.
        </p>
        <ul className="space-y-2">
          {globales.map((x) => (
            <li key={x.id} className="tarjeta">
              {x.nombre}
              <span className="text-texto-secundario">{' · '}{etiqueta(x.grupo_muscular)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
