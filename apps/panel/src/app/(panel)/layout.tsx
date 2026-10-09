import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { NavLateral } from './nav-lateral'

export default async function LayoutPanel({
  children,
}: { children: React.ReactNode }) {
  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS ya limita esta consulta a las membresías de quien pregunta.
  //
  // limit(1) y NO single(): una persona puede tener membresía en más de un
  // gimnasio (un entrenador que trabaja en dos), y single() tira error si
  // vuelve más de una fila. Por ahora se usa la más antigua; el selector de
  // gimnasio llega en una etapa posterior.
  const { data: membresia } = await supabase
    .from('memberships')
    .select('rol, gyms(nombre), profiles(nombre, apellido)')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  if (!membresia) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="tarjeta max-w-md space-y-2 p-6">
          <h1 className="text-xl font-semibold">Tu cuenta no está asociada a ningún gimnasio</h1>
          <p className="text-texto-secundario">Pedile a un administrador que te dé de alta.</p>
        </div>
      </main>
    )
  }

  // En el celular la barra va arriba y la navegación se desliza de costado:
  // Escanear se usa parado en el mostrador, con el teléfono en la mano.
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="shrink-0 border-b border-superficie-borde bg-hundido p-4 md:w-64 md:border-r md:border-b-0 md:p-5">
        <div className="flex items-center gap-3">
          <span className="fondo-degrade size-9 shrink-0 rounded-medio" aria-hidden />
          <div className="min-w-0">
            <p className="truncate font-semibold">{membresia.gyms?.nombre}</p>
            <p className="truncate text-xs text-texto-secundario">
              {membresia.profiles?.nombre} · {membresia.rol}
            </p>
          </div>
        </div>
        <NavLateral />
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  )
}
