/**
 * Socios: el código QR, la contraseña inicial y las validaciones que
 * comparten el panel y la app. Ver las secciones 3, 4 y 5 del diseño de la
 * etapa 4.
 */

export const LARGO_MINIMO_CONTRASENA = 8

const CODIGO_QR = /^[0-9a-f]{32}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** El formato de memberships.codigo_qr: 16 bytes aleatorios en hexadecimal. */
export function esCodigoQr(texto: string): boolean {
  return CODIGO_QR.test(texto)
}

/**
 * La cámara lee el mismo QR muchas veces por segundo mientras el socio lo
 * sostiene. Se procesa una lectura por código cada `ventanaMs`; un código
 * distinto pasa enseguida. Lo que no es un código del sistema se ignora.
 */
export function debeProcesarLectura(
  codigo: string,
  ultima: { codigo: string; en: number } | null,
  ahora: number,
  ventanaMs = 5000,
): boolean {
  if (!esCodigoQr(codigo)) return false
  return !(ultima && ultima.codigo === codigo && ahora - ultima.en < ventanaMs)
}

// Sin tildes ni eñes: se dictan por teléfono y se escriben en cualquier teclado.
const PALABRAS = [
  'tigre', 'puma', 'condor', 'roble', 'rayo', 'faro', 'nube', 'pampa',
  'lago', 'sol', 'luna', 'monte', 'trueno', 'halcon', 'ceibo', 'delta',
  'sauce', 'cerro', 'brisa', 'yerba', 'tango', 'mate', 'piedra', 'rio',
  'zorro', 'carpincho', 'jacaranda', 'ombu', 'aguila', 'volcan', 'arena', 'ola',
]

/**
 * Aleatorio de calidad criptográfica en [0, 1). Existe en Node 22 y en el
 * navegador. Math.random no sirve para una contraseña.
 */
function azarSeguro(): number {
  return (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / 2 ** 32
}

/**
 * La contraseña inicial que el panel propone: 'tigre-faro-4821'. Legible para
 * pasarla por WhatsApp o dictarla. El socio la cambia desde la app.
 */
export function generarContrasena(azar: () => number = azarSeguro): string {
  const palabra = () => PALABRAS[Math.floor(azar() * PALABRAS.length)] ?? 'gym'
  const primera = palabra()
  const segunda = palabra()
  const numero = String(Math.floor(azar() * 10_000)).padStart(4, '0')
  return `${primera}-${segunda}-${numero}`
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validarAlta(alta: { nombre: string; apellido: string; email: string; password: string }): string | null {
  if (!alta.nombre.trim() || !alta.apellido.trim()) return 'Poné el nombre y el apellido'
  if (!EMAIL.test(normalizarEmail(alta.email))) return 'Ese email no es válido'
  if (alta.password.length < LARGO_MINIMO_CONTRASENA) {
    return `La contraseña tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`
  }
  return null
}

export function validarCambioContrasena(datos: { actual: string; nueva: string; repetida: string }): string | null {
  if (!datos.actual) return 'Poné tu contraseña actual'
  if (datos.nueva.length < LARGO_MINIMO_CONTRASENA) {
    return `La nueva tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`
  }
  if (datos.nueva !== datos.repetida) return 'Las dos contraseñas nuevas no coinciden'
  if (datos.nueva === datos.actual) return 'La nueva tiene que ser distinta de la actual'
  return null
}
