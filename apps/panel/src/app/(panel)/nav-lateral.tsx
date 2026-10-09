'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, Dumbbell, House, Users, Wrench, type LucideIcon } from 'lucide-react'

const SECCIONES: { href: string; texto: string; icono: LucideIcon }[] = [
  { href: '/', texto: 'Inicio', icono: House },
  { href: '/socios', texto: 'Socios', icono: Users },
  { href: '/rutinas', texto: 'Rutinas', icono: ClipboardList },
  { href: '/ejercicios', texto: 'Ejercicios', icono: Dumbbell },
  { href: '/maquinas', texto: 'Máquinas', icono: Wrench },
]

/**
 * Cliente solo para saber en qué sección se está: el layout que la contiene
 * sigue siendo de servidor y hace la consulta de la membresía.
 */
export function NavLateral() {
  const ruta = usePathname()
  return (
    <nav className="mt-8 flex flex-col gap-1 text-sm">
      {SECCIONES.map(({ href, texto, icono: Icono }) => {
        const activa = href === '/' ? ruta === '/' : ruta.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={activa ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-medio px-3 transition ${
              activa
                ? 'bg-superficie-elevada text-texto'
                : 'text-texto-secundario hover:bg-superficie hover:text-texto'
            }`}
          >
            <Icono size={18} className={activa ? 'text-cian' : undefined} />
            {texto}
          </Link>
        )
      })}
    </nav>
  )
}
