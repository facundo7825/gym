import { Pressable, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { COLORES, DEGRADE, ESPACIO, RADIOS, TOQUE_MINIMO } from '@gym/core'
import { Campo } from './campo'
import { Texto } from './texto'

interface Props {
  numero: number
  peso: string
  reps: string
  registrada: boolean
  onCambiarPeso: (valor: string) => void
  onCambiarReps: (valor: string) => void
  onTildar: () => void
}

/**
 * La pieza más tocada de la app. El tilde mide 44 y se llena con el degradé al
 * marcarlo; una serie ya registrada se atenúa y no se puede editar —registrar es
 * agregar, nunca editar—.
 */
export function FilaSerie({ numero, peso, reps, registrada, onCambiarPeso, onCambiarReps, onTildar }: Props) {
  return (
    <View style={[estilos.fila, registrada && estilos.hecha]}>
      <Texto variante="chico" tono="tenue" peso="semi" style={estilos.numero}>{numero}</Texto>
      <Campo
        numerico style={estilos.campo} value={peso} placeholder="kg"
        editable={!registrada} keyboardType="decimal-pad" onChangeText={onCambiarPeso}
        accessibilityLabel={`Peso de la serie ${numero}`}
      />
      <Texto tono="tenue">×</Texto>
      <Campo
        numerico style={estilos.campo} value={reps} placeholder="reps"
        editable={!registrada} keyboardType="number-pad" onChangeText={onCambiarReps}
        accessibilityLabel={`Repeticiones de la serie ${numero}`}
      />
      <Pressable
        onPress={onTildar}
        disabled={registrada}
        hitSlop={4}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: registrada }}
        accessibilityLabel={`Registrar la serie ${numero}`}
      >
        {registrada ? (
          <LinearGradient colors={[DEGRADE.desde, DEGRADE.hasta]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={estilos.tilde}>
            <Ionicons name="checkmark" size={22} color={COLORES.texto} />
          </LinearGradient>
        ) : (
          <View style={[estilos.tilde, estilos.tildeVacio]}>
            <Ionicons name="checkmark" size={22} color={COLORES.textoTenue} />
          </View>
        )}
      </Pressable>
    </View>
  )
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: ESPACIO.s },
  hecha: { opacity: 0.55 },
  numero: { width: 18, textAlign: 'center' },
  campo: { flex: 1, paddingHorizontal: ESPACIO.s },
  tilde: {
    width: TOQUE_MINIMO, height: TOQUE_MINIMO, borderRadius: RADIOS.chico,
    alignItems: 'center', justifyContent: 'center',
  },
  tildeVacio: { backgroundColor: COLORES.superficieElevada },
})
