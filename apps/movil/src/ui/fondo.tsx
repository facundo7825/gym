import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORES } from '@gym/core'

/** El fondo de cada pantalla: azul noche, con un resplandor violeta arriba a la derecha. */
export function Fondo({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      colors={[COLORES.fondoAlto, COLORES.fondo, COLORES.fondo]}
      locations={[0, 0.45, 1]}
      start={{ x: 1, y: 0 }}
      end={{ x: 0.3, y: 1 }}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </LinearGradient>
  )
}
