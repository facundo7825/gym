import type { crearClienteServidor } from '@/lib/supabase/servidor'

export type ClienteServidor = Awaited<ReturnType<typeof crearClienteServidor>>

/**
 * URLs firmadas de una hora para las fotos de los socios. El bucket es
 * privado: la firma la pide la sesión de quien mira, y la política de
 * storage (0019) decide si puede. Las que no se pudieron firmar no están en
 * el mapa, y la pantalla muestra las iniciales.
 */
export async function urlsDeFotos(
  supabase: ClienteServidor,
  rutas: (string | null)[],
): Promise<Map<string, string>> {
  const validas = [...new Set(rutas.filter((r): r is string => !!r))]
  if (!validas.length) return new Map()

  const { data } = await supabase.storage.from('fotos-socios').createSignedUrls(validas, 3600)
  return new Map(
    (data ?? []).flatMap((f): [string, string][] =>
      f.path && f.signedUrl && !f.error ? [[f.path, f.signedUrl]] : [],
    ),
  )
}
