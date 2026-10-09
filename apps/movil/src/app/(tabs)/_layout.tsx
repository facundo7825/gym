import type { ColorValue } from 'react-native'
import { Tabs } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { COLORES, TAMANOS } from '@gym/core'
import { FUENTES, OPCIONES_ENCABEZADO } from '@/ui'

type Icono = keyof typeof Ionicons.glyphMap

// Ícono lleno cuando la pestaña está activa, contorno cuando no.
const icono = (lleno: Icono, contorno: Icono) =>
  function IconoPestana({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Ionicons name={focused ? lleno : contorno} color={color} size={size} />
  }

export default function LayoutPestanas() {
  return (
    <Tabs
      screenOptions={{
        ...OPCIONES_ENCABEZADO,
        tabBarActiveTintColor: COLORES.cian,
        tabBarInactiveTintColor: COLORES.textoTenue,
        tabBarStyle: {
          backgroundColor: COLORES.fondoBarra,
          borderTopColor: COLORES.superficieBorde,
        },
        tabBarLabelStyle: { fontFamily: FUENTES.semi, fontSize: TAMANOS.mini },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoy', tabBarIcon: icono('flash', 'flash-outline') }} />
      <Tabs.Screen name="rutinas" options={{ title: 'Rutinas', headerShown: false, tabBarIcon: icono('list', 'list-outline') }} />
      <Tabs.Screen name="ejercicios" options={{ title: 'Ejercicios', headerShown: false, tabBarIcon: icono('barbell', 'barbell-outline') }} />
      <Tabs.Screen name="progreso" options={{ title: 'Progreso', headerShown: false, tabBarIcon: icono('trending-up', 'trending-up-outline') }} />
    </Tabs>
  )
}
