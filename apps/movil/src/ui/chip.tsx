import { Pressable, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORES, DEGRADE, ESPACIO, TOQUE_MINIMO } from '@gym/core'
import { Texto } from './texto'

const ALTO = 36

/** Selección: días de la rutina, filtros, el selector de Progreso. */
export function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  const etiqueta = (
    <Texto variante="chico" peso={activo ? 'semi' : 'normal'} tono={activo ? 'normal' : 'secundario'}>
      {texto}
    </Texto>
  )
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      // El chip mide 36: el hitSlop completa los 44 que pide TOQUE_MINIMO.
      hitSlop={(TOQUE_MINIMO - ALTO) / 2}
    >
      {activo ? (
        <LinearGradient colors={[DEGRADE.desde, DEGRADE.hasta]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={estilos.base}>
          {etiqueta}
        </LinearGradient>
      ) : (
        <View style={[estilos.base, estilos.inactivo]}>{etiqueta}</View>
      )}
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  base: { height: ALTO, borderRadius: ALTO / 2, paddingHorizontal: ESPACIO.l, justifyContent: 'center' },
  inactivo: { backgroundColor: COLORES.superficie, borderWidth: 1, borderColor: COLORES.superficieBorde },
})
