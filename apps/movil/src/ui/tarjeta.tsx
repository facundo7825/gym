import type { ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORES, DEGRADE, ESPACIO, RADIOS } from '@gym/core'

/**
 * Superficie de vidrio. `destacada` la pinta con el degradé de la marca: es
 * para una sola tarjeta por pantalla —"Hoy toca"—.
 */
export function Tarjeta({ children, destacada, style }: {
  children?: ReactNode
  destacada?: boolean
  style?: StyleProp<ViewStyle>
}) {
  if (destacada) {
    return (
      <LinearGradient
        colors={[DEGRADE.desde, DEGRADE.hasta]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[estilos.base, style]}
      >
        {children}
      </LinearGradient>
    )
  }
  return <View style={[estilos.base, estilos.vidrio, style]}>{children}</View>
}

const estilos = StyleSheet.create({
  base: { borderRadius: RADIOS.grande, padding: ESPACIO.l, overflow: 'hidden' },
  vidrio: { backgroundColor: COLORES.superficie, borderWidth: 1, borderColor: COLORES.superficieBorde },
})
