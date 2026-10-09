import { puede } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { miMembresia } from '@/lib/membresia'
import { nombreCompleto } from '@/components/avatar-socio'
import { Escaner } from './escaner'

export default async function Escanear() {
  const yo = await miMembresia()
  if (!yo || !puede(yo.rol, 'escanear_checkin')) {
    return <p className="tarjeta text-texto-secundario">El check-in lo hace el personal del gimnasio.</p>
  }

  // Para el buscador manual. Se filtra en el navegador: la lista de socios
  // activos de un gimnasio entra cómoda en una página.
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from('memberships')
    .select('id, profiles ( nombre, apellido )')
    .eq('rol', 'socio')
    .eq('estado', 'activo')
  const socios = (data ?? [])
    .map((s) => ({ id: s.id, nombre: nombreCompleto(s.profiles) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="titulo-pagina">Escanear</h1>
      <Escaner socios={socios} esAdmin={puede(yo.rol, 'registrar_cuota')} />
    </div>
  )
}
