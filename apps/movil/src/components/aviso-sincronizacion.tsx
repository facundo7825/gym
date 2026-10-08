import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { escucharEstado, type EstadoVisible } from '@/lib/sincronizar'

/** "3 series sin sincronizar". El socio nunca queda con la duda de si se guardó. */
export function AvisoSincronizacion() {
  const [estado, setEstado] = useState<EstadoVisible>({ texto: null, hayRechazadas: false })

  useEffect(() => escucharEstado(setEstado), [])

  if (!estado.texto) return null

  return (
    <View style={[estilos.aviso, estado.hayRechazadas && estilos.rechazo]}>
      <Text style={estilos.texto}>{estado.texto}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  aviso: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: 'rgba(200,140,0,0.15)' },
  rechazo: { backgroundColor: 'rgba(176,0,0,0.12)' },
  texto: { fontSize: 13, color: '#555' },
})
