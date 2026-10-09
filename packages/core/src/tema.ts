/**
 * Los valores del sistema visual —"Neón eléctrico", ver el diseño del
 * rediseño—. Solo valores: los usan la app (directamente) y el panel (repetidos
 * en el @theme de globals.css, con un test que los compara).
 *
 * Ninguna pantalla escribe un color, un radio o un tamaño a mano. Cambiar la
 * marca es cambiar este archivo.
 */

export const COLORES = {
  /** Fondo de todas las pantallas. */
  fondo: '#0A0F1E',
  /** Hacia dónde va el degradé del fondo, arriba. */
  fondoAlto: '#1E1650',
  /** La barra de pestañas: el fondo casi opaco. */
  fondoBarra: 'rgba(10,15,30,0.96)',
  /** Tarjetas tipo vidrio. */
  superficie: 'rgba(255,255,255,0.05)',
  superficieBorde: 'rgba(255,255,255,0.08)',
  /** Campos, filas abiertas, modales. */
  superficieElevada: 'rgba(255,255,255,0.08)',
  /** El interior de los campos de texto: más oscuro que el fondo. */
  hundido: 'rgba(0,0,0,0.3)',
  texto: '#EEF1FF',
  textoSecundario: '#8C93B8',
  /** Solo para datos de apoyo: no llega a 4,5:1. */
  textoTenue: '#5B6290',
  violeta: '#7C5CFF',
  cian: '#22D3EE',
  /** Píldoras y detalles encima del degradé. */
  sobreDegrade: 'rgba(255,255,255,0.2)',
  /** "N series sin sincronizar". */
  pendiente: '#F59E0B',
  pendienteSuave: 'rgba(245,158,11,0.12)',
  /** "No se pudo guardar", errores. */
  rechazo: '#F87171',
  /** Fondo de los avisos de error y del botón de peligro. */
  rechazoSuave: 'rgba(248,113,113,0.12)',
  /** Puntos de récord en el gráfico. */
  record: '#FACC15',
  /** Lo que oscurece la pantalla detrás de un modal. */
  velo: 'rgba(0,0,0,0.4)',
} as const

/** Violeta → cian, a 135°. Para una sola acción o dato destacado por pantalla. */
export const DEGRADE = { desde: COLORES.violeta, hasta: COLORES.cian } as const

export const RADIOS = { chico: 10, medio: 14, grande: 18, enorme: 24 } as const

export const ESPACIO = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const

export const TAMANOS = { titulo: 28, subtitulo: 22, grande: 17, cuerpo: 15, chico: 13, mini: 11 } as const

/** Lo mínimo que mide algo que se toca: se usa con las manos transpiradas o con guantes. */
export const TOQUE_MINIMO = 44

/**
 * Los mismos valores con el nombre de variable que usa el @theme del panel.
 * El test de tema compara este mapa contra globals.css.
 */
export const VARIABLES_CSS: Record<string, string> = {
  '--color-fondo': COLORES.fondo,
  '--color-fondo-alto': COLORES.fondoAlto,
  '--color-fondo-barra': COLORES.fondoBarra,
  '--color-superficie': COLORES.superficie,
  '--color-superficie-borde': COLORES.superficieBorde,
  '--color-superficie-elevada': COLORES.superficieElevada,
  '--color-hundido': COLORES.hundido,
  '--color-texto': COLORES.texto,
  '--color-texto-secundario': COLORES.textoSecundario,
  '--color-texto-tenue': COLORES.textoTenue,
  '--color-violeta': COLORES.violeta,
  '--color-cian': COLORES.cian,
  '--color-sobre-degrade': COLORES.sobreDegrade,
  '--color-pendiente': COLORES.pendiente,
  '--color-pendiente-suave': COLORES.pendienteSuave,
  '--color-rechazo': COLORES.rechazo,
  '--color-rechazo-suave': COLORES.rechazoSuave,
  '--color-record': COLORES.record,
  '--color-velo': COLORES.velo,
  '--radius-chico': `${RADIOS.chico}px`,
  '--radius-medio': `${RADIOS.medio}px`,
  '--radius-grande': `${RADIOS.grande}px`,
  '--radius-enorme': `${RADIOS.enorme}px`,
}

function luminancia(hex: string): number {
  const canales = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = canales.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** La relación de contraste WCAG entre dos colores `#RRGGBB`, de 1 a 21. */
export function contraste(a: string, b: string): number {
  const [clara, oscura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (clara! + 0.05) / (oscura! + 0.05)
}
