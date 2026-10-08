import { View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { BuscadorEjercicios } from '@/components/buscador-ejercicios'

export default function ListaEjercicios() {
  const router = useRouter()

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Ejercicios' }} />
      <BuscadorEjercicios onElegir={(e) => router.push(`/(tabs)/ejercicios/${e.id}`)} />
    </View>
  )
}
