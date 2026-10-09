const dosCifras = (n: number) => String(n).padStart(2, '0')

/**
 * El cronómetro de la sesión: "0:00", "24:10", "1:02:05". Un valor negativo o
 * roto —el reloj del teléfono se atrasó— se muestra como "0:00" en vez de
 * números negativos.
 */
export function formatearCronometro(segundos: number): string {
  const total = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const segs = total % 60
  return horas > 0
    ? `${horas}:${dosCifras(minutos)}:${dosCifras(segs)}`
    : `${minutos}:${dosCifras(segs)}`
}
