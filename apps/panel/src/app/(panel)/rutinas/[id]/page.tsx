import { notFound } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { Editor } from './editor'

export default async function EditarRutina({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await crearClienteServidor()

  const { data: rutina } = await supabase
    .from('rutinas')
    .select(`
      id, nombre,
      rutina_dias (
        id, orden, nombre,
        rutina_ejercicios (
          id, orden, series, repeticiones, descanso_seg,
          ejercicios ( id, nombre )
        )
      )
    `)
    .eq('id', id)
    .maybeSingle()

  // RLS ya devuelve vacío si la rutina es de otro gimnasio: no hace falta
  // comparar gym_id acá.
  if (!rutina) notFound()

  const { data: ejercicios } = await supabase
    .from('ejercicios').select('id, nombre').order('nombre')

  return <Editor rutina={rutina} ejercicios={ejercicios ?? []} />
}
