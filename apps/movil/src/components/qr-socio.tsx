import { useCallback } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Brightness from 'expo-brightness'
import QRCode from 'react-native-qrcode-svg'
import { COLORES, ESPACIO, RADIOS } from '@gym/core'

/**
 * El QR del socio. Mientras la pestaña está a la vista el brillo sube al
 * máximo, y al salir vuelve al que estaba: un lector toma mejor una pantalla
 * brillante, y nadie quiere quedarse con el teléfono encandilando.
 */
export function QrSocio({ codigo }: { codigo: string }) {
  const { width } = useWindowDimensions()
  const lado = Math.min(width - ESPACIO.xl * 4, 300)

  useFocusEffect(
    useCallback(() => {
      let vivo = true
      let anterior: number | null = null

      Brightness.getBrightnessAsync()
        .then((brillo) => {
          if (!vivo) return
          anterior = brillo
          return Brightness.setBrightnessAsync(1)
        })
        // Sin permiso o sin soporte: el QR se ve igual, solo menos brillante.
        .catch(() => {})

      return () => {
        vivo = false
        if (anterior !== null) void Brightness.setBrightnessAsync(anterior).catch(() => {})
      }
    }, []),
  )

  return (
    <View style={estilos.marco}>
      <QRCode value={codigo} size={lado} color={COLORES.qrTinta} backgroundColor={COLORES.qrFondo} />
    </View>
  )
}

const estilos = StyleSheet.create({
  marco: { backgroundColor: COLORES.qrFondo, padding: ESPACIO.l, borderRadius: RADIOS.grande, alignSelf: 'center' },
})
