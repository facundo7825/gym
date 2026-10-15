import { describe, expect, it } from 'vitest'
import {
  debeProcesarLectura, esCodigoQr, generarContrasena, normalizarEmail, validarAlta, validarCambioContrasena,
} from '../src/socios'

describe('esCodigoQr', () => {
  it('acepta lo que genera la base: 16 bytes en hexadecimal', () => {
    expect(esCodigoQr('0123456789abcdef0123456789abcdef')).toBe(true)
  })

  it('ignora cualquier otro QR que la cámara encuentre', () => {
    expect(esCodigoQr('https://ejemplo.com')).toBe(false)
    expect(esCodigoQr('0123456789abcdef')).toBe(false)
    expect(esCodigoQr('0123456789ABCDEF0123456789ABCDEF')).toBe(false)
    expect(esCodigoQr('')).toBe(false)
  })
})

describe('debeProcesarLectura', () => {
  const codigo = '0123456789abcdef0123456789abcdef'
  const otro = 'fedcba9876543210fedcba9876543210'

  it('la primera lectura se procesa', () => {
    expect(debeProcesarLectura(codigo, null, 1000)).toBe(true)
  })

  // Review Focus 2: la cámara lee el mismo QR muchas veces por segundo.
  it('el mismo código dentro de los 5 segundos no', () => {
    expect(debeProcesarLectura(codigo, { codigo, en: 1000 }, 1100)).toBe(false)
    expect(debeProcesarLectura(codigo, { codigo, en: 1000 }, 5999)).toBe(false)
  })

  it('el mismo código pasados los 5 segundos sí', () => {
    expect(debeProcesarLectura(codigo, { codigo, en: 1000 }, 6000)).toBe(true)
  })

  it('otro código enseguida sí', () => {
    expect(debeProcesarLectura(otro, { codigo, en: 1000 }, 1100)).toBe(true)
  })

  it('algo que no es un código nunca', () => {
    expect(debeProcesarLectura('hola', null, 1000)).toBe(false)
  })
})

describe('generarContrasena', () => {
  it('dos palabras y cuatro números, fácil de dictar', () => {
    const valores = [0, 0.99, 0.1234]
    expect(generarContrasena(() => valores.shift() ?? 0)).toMatch(/^[a-z]+-[a-z]+-\d{4}$/)
  })

  it('siempre tiene al menos 8 caracteres', () => {
    for (let i = 0; i < 50; i++) expect(generarContrasena().length).toBeGreaterThanOrEqual(8)
  })

  it('completa con ceros a la izquierda', () => {
    const valores = [0, 0, 0.0007]
    expect(generarContrasena(() => valores.shift() ?? 0)).toMatch(/-0007$/)
  })
})

describe('normalizarEmail', () => {
  // Review Focus 5.
  it('minúsculas y sin espacios', () => {
    expect(normalizarEmail('  Juan@Mail.com ')).toBe('juan@mail.com')
  })
})

describe('validarAlta', () => {
  const bien = { nombre: 'Juan', apellido: 'Pérez', email: 'juan@mail.com', password: 'tigre-faro-4821' }

  it('un alta normal está bien', () => {
    expect(validarAlta(bien)).toBeNull()
  })

  it('exige nombre y apellido', () => {
    expect(validarAlta({ ...bien, nombre: ' ' })).toBe('Poné el nombre y el apellido')
    expect(validarAlta({ ...bien, apellido: '' })).toBe('Poné el nombre y el apellido')
  })

  it('rechaza un email mal escrito', () => {
    expect(validarAlta({ ...bien, email: 'juan@mail' })).toBe('Ese email no es válido')
    expect(validarAlta({ ...bien, email: 'juan mail.com' })).toBe('Ese email no es válido')
  })

  it('acepta el email con mayúsculas y espacios: se normaliza después', () => {
    expect(validarAlta({ ...bien, email: ' Juan@Mail.com ' })).toBeNull()
  })

  it('exige 8 caracteres de contraseña', () => {
    expect(validarAlta({ ...bien, password: '1234567' }))
      .toBe('La contraseña tiene que tener al menos 8 caracteres')
  })
})

describe('validarCambioContrasena', () => {
  const bien = { actual: 'tigre-faro-4821', nueva: 'mi-clave-nueva', repetida: 'mi-clave-nueva' }

  it('un cambio normal está bien', () => {
    expect(validarCambioContrasena(bien)).toBeNull()
  })

  it('exige la actual', () => {
    expect(validarCambioContrasena({ ...bien, actual: '' })).toBe('Poné tu contraseña actual')
  })

  it('exige 8 caracteres en la nueva', () => {
    expect(validarCambioContrasena({ ...bien, nueva: 'corta', repetida: 'corta' }))
      .toBe('La nueva tiene que tener al menos 8 caracteres')
  })

  it('las dos nuevas tienen que coincidir', () => {
    expect(validarCambioContrasena({ ...bien, repetida: 'otra-cosa-123' }))
      .toBe('Las dos contraseñas nuevas no coinciden')
  })

  it('la nueva tiene que ser distinta', () => {
    expect(validarCambioContrasena({ actual: 'tigre-faro-4821', nueva: 'tigre-faro-4821', repetida: 'tigre-faro-4821' }))
      .toBe('La nueva tiene que ser distinta de la actual')
  })
})
