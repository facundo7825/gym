import { Stack, useRouter } from 'expo-router'
import { BuscadorEjercicios } from '@/components/buscador-ejercicios'
import { Fondo } from '@/ui'

export default function ListaEjercicios() {
  const router = useRouter()

  return (
    <Fondo>
      <Stack.Screen options={{ title: 'Ejercicios' }} />
      <BuscadorEjercicios onElegir={(e) => router.push(`/(tabs)/ejercicios/${e.id}`)} />
    </Fondo>
  )
}
