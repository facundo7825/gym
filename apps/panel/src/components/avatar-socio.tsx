export function nombreCompleto(perfil: { nombre: string; apellido: string } | null): string {
  return `${perfil?.nombre ?? ''} ${perfil?.apellido ?? ''}`.trim() || 'Sin nombre'
}

/** La foto de verificación, o las iniciales si todavía no tiene. */
export function AvatarSocio({ nombre, url, grande = false }: {
  nombre: string
  url?: string | null
  grande?: boolean
}) {
  const medida = grande ? 'size-28 text-3xl' : 'size-10 text-sm'

  if (url) {
    // <img> y no next/image: la URL firmada cambia en cada render y vence en
    // una hora; optimizarla no sirve de nada.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={`Foto de ${nombre}`} className={`${medida} shrink-0 rounded-full object-cover`} />
  }

  const iniciales = nombre.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span
      className={`${medida} flex shrink-0 items-center justify-center rounded-full bg-superficie-elevada font-bold text-texto-secundario`}
      aria-hidden
    >
      {iniciales}
    </span>
  )
}
