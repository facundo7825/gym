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
