import { useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { ESPACIO, NIVELES_RUTINA, OBJETIVOS_RUTINA, etiqueta, type NivelRutina, type ObjetivoRutina } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { Boton, Campo, Chip, Fondo, Texto } from '@/ui'

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
    <Fondo style={estilos.contenedor}>
      <Stack.Screen options={{ title: 'Nueva rutina' }} />

      <Campo
        placeholder="Nombre de la rutina"
        value={nombre} onChangeText={setNombre}
      />

      <Texto variante="chico" tono="secundario" style={estilos.etiqueta}>Objetivo</Texto>
      <View style={estilos.chips}>
        {OBJETIVOS_RUTINA.map((v) => (
          <Chip key={v} activo={objetivo === v} texto={etiqueta(v)} onPress={() => setObjetivo(v)} />
        ))}
      </View>

      <Texto variante="chico" tono="secundario" style={estilos.etiqueta}>Nivel</Texto>
      <View style={estilos.chips}>
        {NIVELES_RUTINA.map((v) => (
          <Chip key={v} activo={nivel === v} texto={etiqueta(v)} onPress={() => setNivel(v)} />
        ))}
      </View>

      <Boton
        titulo={guardando ? 'Creando…' : 'Crear y agregar días'}
        onPress={crear} deshabilitado={guardando}
        style={estilos.boton}
      />
    </Fondo>
  )
}

const estilos = StyleSheet.create({
  contenedor: { padding: ESPACIO.l, gap: ESPACIO.s },
  etiqueta: { marginTop: ESPACIO.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: ESPACIO.s },
  boton: { marginTop: ESPACIO.m },
})
