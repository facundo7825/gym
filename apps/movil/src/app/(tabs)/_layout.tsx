import { Tabs } from 'expo-router'

export default function LayoutPestanas() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Hoy' }} />
      <Tabs.Screen name="rutinas" options={{ title: 'Rutinas', headerShown: false }} />
      <Tabs.Screen name="ejercicios" options={{ title: 'Ejercicios', headerShown: false }} />
    </Tabs>
  )
}
