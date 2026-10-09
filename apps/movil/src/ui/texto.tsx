import { Text, type TextProps } from 'react-native'
import { COLORES, TAMANOS } from '@gym/core'

/** Los nombres que registra useFonts en el layout raíz. */
export const FUENTES = {
  normal: 'Sora_400Regular',
  semi: 'Sora_600SemiBold',
  negrita: 'Sora_700Bold',
} as const

const TONOS = {
  normal: COLORES.texto,
  secundario: COLORES.textoSecundario,
  tenue: COLORES.textoTenue,
  pendiente: COLORES.pendiente,
  rechazo: COLORES.rechazo,
  cian: COLORES.cian,
} as const

type Variante = keyof typeof TAMANOS
type Tono = keyof typeof TONOS
type Peso = keyof typeof FUENTES

const PESO_POR_VARIANTE: Record<Variante, Peso> = {
  titulo: 'negrita', subtitulo: 'negrita', grande: 'semi', cuerpo: 'normal', chico: 'normal', mini: 'normal',
}

interface Props extends TextProps {
  variante?: Variante
  tono?: Tono
  peso?: Peso
  /** Cifras de ancho fijo: peso, repeticiones, reloj. Que no "bailen" al cambiar. */
  numerico?: boolean
}

/**
 * Todo texto de la app pasa por acá. La familia ya trae el peso —con una fuente
 * cargada, `fontWeight` en Android elige otra familia—, así que nunca se
 * combina con fontWeight.
 */
export function Texto({ variante = 'cuerpo', tono = 'normal', peso, numerico, style, ...resto }: Props) {
  const tamano = TAMANOS[variante]
  return (
    <Text
      {...resto}
      style={[
        {
          fontFamily: FUENTES[peso ?? PESO_POR_VARIANTE[variante]],
          fontSize: tamano,
          lineHeight: Math.round(tamano * 1.3),
          color: TONOS[tono],
        },
        numerico && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  )
}
