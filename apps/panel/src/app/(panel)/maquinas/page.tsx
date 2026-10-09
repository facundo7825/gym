import { crearClienteServidor } from '@/lib/supabase/servidor'
import { FormularioMaquina } from './formulario'

export default async function Maquinas() {
  const supabase = await crearClienteServidor()
  const { data: maquinas } = await supabase
    .from('maquinas')
    .select('id, nombre, marca, cantidad')
    .order('nombre')

  return (
    <div className="space-y-6">
      <h1 className="titulo-pagina">Máquinas</h1>

      <FormularioMaquina />

      {maquinas?.length ? (
        <ul className="space-y-2">
          {maquinas.map((m) => (
            <li key={m.id} className="tarjeta flex items-center justify-between gap-3">
              <span>{m.nombre}{m.marca && <span className="text-texto-secundario"> · {m.marca}</span>}</span>
              <span className="text-texto-secundario">{m.cantidad}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-texto-secundario">
          Todavía no cargaste ninguna máquina. Agregá las que tenga tu gimnasio
          para poder filtrar ejercicios por lo que hay disponible.
        </p>
      )}
    </div>
  )
}
