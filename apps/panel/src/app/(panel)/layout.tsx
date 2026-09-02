import Link from 'next/link'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/servidor'

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
      <main className="p-8">
        <h1 className="text-xl font-semibold">Tu cuenta no está asociada a ningún gimnasio</h1>
        <p className="mt-2 text-gray-600">Pedile a un administrador que te dé de alta.</p>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r p-4">
        <p className="font-semibold">{membresia.gyms?.nombre}</p>
        <p className="text-sm text-gray-600">
          {membresia.profiles?.nombre} · {membresia.rol}
        </p>

        <nav className="mt-6 flex flex-col gap-1 text-sm">
          <Link href="/" className="rounded px-2 py-1 hover:bg-gray-100">Inicio</Link>
          <Link href="/maquinas" className="rounded px-2 py-1 hover:bg-gray-100">Máquinas</Link>
          <Link href="/ejercicios" className="rounded px-2 py-1 hover:bg-gray-100">Ejercicios</Link>
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
