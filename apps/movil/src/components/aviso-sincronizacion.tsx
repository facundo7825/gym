import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ESPACIO } from '@gym/core'
import { Aviso } from '@/ui'
import { escucharEstado, type EstadoVisible } from '@/lib/sincronizar'

/** "3 series sin sincronizar". El socio nunca queda con la duda de si se guardó. */
export function AvisoSincronizacion() {
  const [estado, setEstado] = useState<EstadoVisible>({ texto: null, hayRechazadas: false })

  useEffect(() => escucharEstado(setEstado), [])

  if (!estado.texto) return null

  return (
    <View style={{ paddingHorizontal: ESPACIO.l, paddingVertical: ESPACIO.xs }}>
      <Aviso tono={estado.hayRechazadas ? 'rechazo' : 'pendiente'} texto={estado.texto} />
    </View>
  )
}
