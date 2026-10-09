// A mano y no con toLocaleDateString: el soporte de Intl en Hermes depende de
// cómo se compiló la app. Todas en la hora del teléfono, que es la del socio.

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** "8/10" */
export function fechaCorta(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/** "mié 8/10" */
export function fechaConDia(iso: string): string {
  return `${DIAS[new Date(iso).getDay()]} ${fechaCorta(iso)}`
}

/** "52 min", "1 h 10 min" */
export function duracion(inicio: string, fin: string): string {
  const minutos = Math.max(0, Math.round((Date.parse(fin) - Date.parse(inicio)) / 60_000))
  if (minutos < 60) return `${minutos} min`
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`
}

const dosCifras = (n: number) => String(n).padStart(2, '0')

/**
 * Hoy en el teléfono, como 'AAAA-MM-DD'. La app no usa la zona del gimnasio
 * —Intl con timeZone depende de cómo se compiló Hermes—: el socio está en la
 * misma ciudad que su gimnasio.
 */
export function hoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`
}

/** "18:40" */
export function horaCorta(iso: string): string {
  const d = new Date(iso)
  return `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`
}

/** "08/10 a las 19:20" */
export function fechaYHora(iso: string): string {
  const d = new Date(iso)
  return `${dosCifras(d.getDate())}/${dosCifras(d.getMonth() + 1)} a las ${horaCorta(iso)}`
}
