import { crearClienteServidor } from '@/lib/supabase/servidor'
import { FormularioMaquina } from './formulario'

export default async function Maquinas() {
  const supabase = await crearClienteServidor()
  const { data: maquinas } = await supabase
    .from('maquinas')
    .select('id, nombre, marca, cantidad')
    .order('nombre')

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Máquinas</h1>

      <FormularioMaquina />

      {maquinas?.length ? (
        <ul className="divide-y rounded border">
          {maquinas.map((m) => (
            <li key={m.id} className="flex justify-between px-4 py-3">
              <span>{m.nombre}{m.marca && <span className="text-gray-500"> · {m.marca}</span>}</span>
              <span className="text-gray-500">{m.cantidad}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-600">
          Todavía no cargaste ninguna máquina. Agregá las que tenga tu gimnasio
          para poder filtrar ejercicios por lo que hay disponible.
        </p>
      )}
    </div>
  )
}
