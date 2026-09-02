'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Panel del gimnasio</h1>

        <input
          type="email" required value={email} placeholder="Correo"
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
        <input
          type="password" required value={password} placeholder="Contraseña"
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <button
          type="submit" disabled={cargando}
          className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
        >
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
