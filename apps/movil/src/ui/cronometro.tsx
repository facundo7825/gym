import { useEffect, useState } from 'react'
import { formatearCronometro } from '@gym/core'
import { Texto } from './texto'

/**
 * El tiempo desde el inicio de la sesión. No es un dato nuevo: `inicio` ya se
 * guarda. Sin sesión —todavía no se tildó nada— muestra 0:00.
 */
export function Cronometro({ inicio }: { inicio: string | null }) {
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    if (!inicio) return
    const intervalo = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(intervalo)
  }, [inicio])

  const segundos = inicio ? (ahora - Date.parse(inicio)) / 1000 : 0
  return (
    <Texto variante="grande" peso="negrita" tono="cian" numerico accessibilityLabel="Tiempo de la sesión">
      {formatearCronometro(segundos)}
    </Texto>
  )
}
