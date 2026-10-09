import { useState } from 'react'
import { StyleSheet, TextInput, type TextInputProps } from 'react-native'
import { COLORES, ESPACIO, RADIOS, TAMANOS, TOQUE_MINIMO } from '@gym/core'
import { FUENTES } from './texto'

/** Entrada de texto. El foco se marca en violeta. */
export function Campo({ numerico, style, onFocus, onBlur, ...resto }: TextInputProps & { numerico?: boolean }) {
  const [foco, setFoco] = useState(false)
  return (
    <TextInput
      placeholderTextColor={COLORES.textoTenue}
      selectionColor={COLORES.cian}
      {...resto}
      onFocus={(e) => { setFoco(true); onFocus?.(e) }}
      onBlur={(e) => { setFoco(false); onBlur?.(e) }}
      style={[estilos.base, numerico && estilos.numerico, foco && estilos.foco, style]}
    />
  )
}

const estilos = StyleSheet.create({
  base: {
    minHeight: TOQUE_MINIMO, borderRadius: RADIOS.medio,
    paddingHorizontal: ESPACIO.l, paddingVertical: ESPACIO.m,
    backgroundColor: COLORES.hundido, borderWidth: 1, borderColor: COLORES.superficieBorde,
    color: COLORES.texto, fontFamily: FUENTES.normal, fontSize: TAMANOS.cuerpo,
  },
  numerico: { textAlign: 'center', fontFamily: FUENTES.negrita, fontSize: TAMANOS.grande, fontVariant: ['tabular-nums'] },
  foco: { borderColor: COLORES.violeta },
})
