import type { Metadata } from 'next'
import { Sora } from 'next/font/google'
import './globals.css'

// La misma fuente que la app. --font-sora lo toma el @theme de globals.css.
const sora = Sora({
  variable: '--font-sora',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Panel del gimnasio',
  description: 'Gestión de ejercicios, máquinas y socios',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${sora.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
