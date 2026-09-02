import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@gym/core'

export async function crearClienteServidor() {
  const almacen = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (nuevas) => {
          try {
            nuevas.forEach(({ name, value, options }) =>
              almacen.set(name, value, options),
            )
          } catch {
            // Llamado desde un Server Component: el proxy ya refrescó
            // la sesión, así que se puede ignorar sin consecuencias.
          }
        },
      },
    },
  )
}
