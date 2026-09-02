import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// En Next 16 esto es `proxy.ts`, no `middleware.ts`: mismo comportamiento,
// cambian el nombre del archivo y el del export. `middleware` sigue andando
// pero está deprecado.
//
// Esto NO es la barrera de autorización: es una redirección temprana para no
// renderizar el panel a un visitante. Un cambio de `matcher` o mover una ruta
// deja de cubrirla en silencio. Quien decide de verdad es RLS en la base, y
// cada layout y Server Action revalida con getUser() por su cuenta.
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (nuevas) => {
          nuevas.forEach(({ name, value }) => request.cookies.set(name, value))
          respuesta = NextResponse.next({ request })
          nuevas.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getUser() valida el token contra el servidor. getSession() solo lee la
  // cookie, que el cliente puede haber manipulado: no sirve para decidir
  // accesos.
  const { data: { user } } = await supabase.auth.getUser()

  const enLogin = request.nextUrl.pathname.startsWith('/login')

  if (!user && !enLogin) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (user && enLogin) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return respuesta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg)$).*)'],
}
