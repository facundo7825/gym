'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap } from 'lucide-react'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setCargando(true)
    setError(null)

    const supabase = crearClienteNavegador()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Mensaje genérico a propósito: distinguir "no existe el usuario" de
      // "la contraseña es incorrecta" le confirma a un atacante qué correos
      // están registrados.
      setError('Correo o contraseña incorrectos')
      setCargando(false)
      return
    }
    router.replace('/')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={enviar} className="tarjeta w-full max-w-sm space-y-5 p-8">
        <span className="fondo-degrade flex size-12 items-center justify-center rounded-grande" aria-hidden>
          <Zap size={24} />
        </span>
        <div className="space-y-1">
          <h1 className="titulo-pagina">Panel del gimnasio</h1>
          <p className="text-sm text-texto-secundario">Entrá con tu cuenta del personal.</p>
        </div>

        <input
          type="email" required value={email} placeholder="Correo" autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          className="campo"
        />
        <input
          type="password" required value={password} placeholder="Contraseña" autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          className="campo"
        />

        {error && <p role="alert" className="text-sm text-rechazo">{error}</p>}

        <button type="submit" disabled={cargando} className="boton boton-principal w-full">
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
