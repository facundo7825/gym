import { Tabs } from 'expo-router'

export default function LayoutPestanas() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Hoy' }} />
    </Tabs>
  )
}
