import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { COLORES, DEGRADE, ESPACIO, RADIOS, TOQUE_MINIMO } from '@gym/core'
import { Texto } from './texto'

type Variante = 'principal' | 'secundario' | 'peligro' | 'claro'

interface Props {
  titulo: string
  onPress: () => void
  variante?: Variante
  deshabilitado?: boolean
  icono?: keyof typeof Ionicons.glyphMap
  style?: StyleProp<ViewStyle>
}

/**
 * El principal lleva el degradé y es UNA acción por pantalla. El secundario es
 * de vidrio; el de peligro, coral —cerrar sesión—. El claro va sobre la tarjeta
 * destacada: un degradé encima de otro no se distingue.
 */
export function Boton({ titulo, onPress, variante = 'principal', deshabilitado, icono, style }: Props) {
  const colorTexto = variante === 'peligro' ? COLORES.rechazo : variante === 'claro' ? COLORES.fondo : COLORES.texto
  const contenido = (
    <View style={estilos.contenido}>
      {icono && <Ionicons name={icono} size={18} color={colorTexto} />}
      <Texto variante="cuerpo" peso="negrita" style={{ color: colorTexto }}>{titulo}</Texto>
    </View>
  )

  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!deshabilitado }}
      style={({ pressed }) => [estilos.base, deshabilitado && estilos.deshabilitado, pressed && estilos.apretado, style]}
    >
      {variante === 'principal' ? (
        <LinearGradient
          colors={[DEGRADE.desde, DEGRADE.hasta]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[estilos.relleno, estilos.sombra]}
        >
          {contenido}
        </LinearGradient>
      ) : (
        <View style={[estilos.relleno, estilos[variante]]}>
          {contenido}
        </View>
      )}
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  base: { borderRadius: RADIOS.medio },
  relleno: {
    minHeight: TOQUE_MINIMO + 8, borderRadius: RADIOS.medio,
    paddingHorizontal: ESPACIO.xl, justifyContent: 'center',
  },
  contenido: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ESPACIO.s },
  secundario: { backgroundColor: COLORES.superficieElevada, borderWidth: 1, borderColor: COLORES.superficieBorde },
  peligro: { backgroundColor: COLORES.rechazoSuave },
  claro: { backgroundColor: COLORES.texto },
  sombra: { shadowColor: COLORES.violeta, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  deshabilitado: { opacity: 0.4 },
  apretado: { opacity: 0.85, transform: [{ scale: 0.98 }] },
})
