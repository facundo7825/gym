import { DarkTheme, type Theme } from 'expo-router'
import { COLORES, TAMANOS } from '@gym/core'
import { FUENTES } from './texto'

/** El tema oscuro de React Navigation con los colores de la marca. */
export const TEMA_NAVEGACION: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: COLORES.cian,
    background: COLORES.fondo,
    card: COLORES.fondo,
    text: COLORES.texto,
    border: COLORES.superficieBorde,
    notification: COLORES.violeta,
  },
}

/** Encabezados de los Stack: sin sombra, título en Sora. */
export const OPCIONES_ENCABEZADO = {
  headerStyle: { backgroundColor: COLORES.fondo },
  headerShadowVisible: false,
  headerTintColor: COLORES.texto,
  headerTitleStyle: { fontFamily: FUENTES.semi, fontSize: TAMANOS.grande },
  contentStyle: { backgroundColor: COLORES.fondo },
} as const
