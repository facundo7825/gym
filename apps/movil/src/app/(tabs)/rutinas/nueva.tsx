import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { NIVELES_RUTINA, OBJETIVOS_RUTINA, etiqueta, type NivelRutina, type ObjetivoRutina } from '@gym/core'
import { supabase } from '@/lib/supabase'

export default function NuevaRutina() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [objetivo, setObjetivo] = useState<ObjetivoRutina>('general')
  const [nivel, setNivel] = useState<NivelRutina>('principiante')
  const [guardando, setGuardando] = useState(false)

  const crear = async () => {
    if (!nombre.trim()) {
      Alert.alert('Poné un nombre a la rutina')
      return
    }
    setGuardando(true)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: membresia } = await supabase
      .from('memberships').select('id, gym_id').eq('user_id', user!.id)
      .order('created_at').limit(1).maybeSingle()

    if (!membresia) {
      setGuardando(false)
      Alert.alert('No estás asociado a ningún gimnasio')
      return
    }

    const { data, error } = await supabase
      .from('rutinas')
      .insert({
        gym_id: membresia.gym_id,
        nombre: nombre.trim(),
        objetivo,
        nivel,
        tipo: 'activa',
        propietario_id: membresia.id,
        creado_por: membresia.id,
      })
      .select('id')
      .single()

    setGuardando(false)
    if (error) {
      Alert.alert('No pudimos crear la rutina', 'Probá de nuevo.')
      return
    }
    router.replace(`/(tabs)/rutinas/${data.id}`)
  }

  return (
    <View style={estilos.contenedor}>
      <Stack.Screen options={{ title: 'Nueva rutina' }} />

      <TextInput
        style={estilos.campo} placeholder="Nombre de la rutina"
        value={nombre} onChangeText={setNombre}
      />

      <Text style={estilos.etiqueta}>Objetivo</Text>
      <View style={estilos.chips}>
        {OBJETIVOS_RUTINA.map((v) => (
          <Chip key={v} activo={objetivo === v} texto={etiqueta(v)} onPress={() => setObjetivo(v)} />
        ))}
      </View>

      <Text style={estilos.etiqueta}>Nivel</Text>
      <View style={estilos.chips}>
        {NIVELES_RUTINA.map((v) => (
          <Chip key={v} activo={nivel === v} texto={etiqueta(v)} onPress={() => setNivel(v)} />
        ))}
      </View>

      <Pressable style={estilos.boton} onPress={crear} disabled={guardando}>
        <Text style={estilos.botonTexto}>
          {guardando ? 'Creando…' : 'Crear y agregar días'}
        </Text>
      </Pressable>
    </View>
  )
}

function Chip({ activo, texto, onPress }: {
  activo: boolean; texto: string; onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={[estilos.chip, activo && estilos.chipActivo]}>
      <Text style={activo ? estilos.chipTextoActivo : estilos.chipTexto}>{texto}</Text>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, padding: 16, gap: 8 },
  campo: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12 },
  etiqueta: { color: '#777', fontSize: 13, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: '#eee',
  },
  chipActivo: { backgroundColor: '#111' },
  chipTexto: { color: '#333' },
  chipTextoActivo: { color: '#fff' },
  boton: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12 },
  botonTexto: { color: '#fff' },
})
