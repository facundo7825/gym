import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORES, DEGRADE, ESPACIO, RADIOS } from '@gym/core'
import { Texto } from './texto'

type Tono = 'pendiente' | 'rechazo' | 'record'

/** Pendiente en ámbar, rechazo en coral, récord con el degradé de la marca. */
export function Aviso({ tono, texto }: { tono: Tono; texto: string }) {
  if (tono === 'record') {
    return (
      <LinearGradient
        colors={[DEGRADE.desde, DEGRADE.hasta]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[estilos.base, estilos.record]}
        accessibilityLiveRegion="polite"
      >
        <Texto peso="semi">{texto}</Texto>
      </LinearGradient>
    )
  }
  return (
    <View style={[estilos.base, estilos.pildora, tono === 'rechazo' ? estilos.rechazo : estilos.pendiente]}>
      <Texto variante="mini" tono={tono}>● {texto}</Texto>
    </View>
  )
}

const estilos = StyleSheet.create({
  base: { borderRadius: RADIOS.medio },
  pildora: { alignSelf: 'flex-start', paddingHorizontal: ESPACIO.m, paddingVertical: ESPACIO.xs + 2, borderRadius: 999 },
  pendiente: { backgroundColor: COLORES.pendienteSuave },
  rechazo: { backgroundColor: COLORES.rechazoSuave },
  record: {
    padding: ESPACIO.m, alignItems: 'center',
    shadowColor: COLORES.violeta, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
})
