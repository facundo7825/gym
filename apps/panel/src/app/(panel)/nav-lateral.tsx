'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarCheck, ClipboardList, Dumbbell, House, ScanLine, Users, Wrench, type LucideIcon } from 'lucide-react'

// primeroEnCelular: en la barra de arriba del celular va antes que el resto,
// sin cambiar el orden de la barra lateral de la computadora.
const SECCIONES: { href: string; texto: string; icono: LucideIcon; primeroEnCelular?: boolean }[] = [
  { href: '/', texto: 'Inicio', icono: House },
  { href: '/socios', texto: 'Socios', icono: Users },
  { href: '/escanear', texto: 'Escanear', icono: ScanLine, primeroEnCelular: true },
  { href: '/asistencia', texto: 'Asistencia', icono: CalendarCheck },
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
    <nav className="-mx-1 mt-4 flex gap-1 overflow-x-auto px-1 text-sm md:mx-0 md:mt-8 md:flex-col md:overflow-visible md:px-0">
      {SECCIONES.map(({ href, texto, icono: Icono, primeroEnCelular }) => {
        const activa = href === '/' ? ruta === '/' : ruta.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={activa ? 'page' : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-3 rounded-medio px-3 transition ${
              primeroEnCelular ? 'order-first md:order-none' : ''
            } ${
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
