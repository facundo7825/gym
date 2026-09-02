import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { etiqueta, type Equipamiento, type GrupoMuscular } from '@gym/core'
import { supabase } from '@/lib/supabase'

interface Ejercicio {
  nombre: string
  descripcion: string | null
  instrucciones: string | null
  grupo_muscular: GrupoMuscular
  equipamiento: Equipamiento
  video_id: string | null
}

export default function DetalleEjercicio() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [ejercicio, setEjercicio] = useState<Ejercicio | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    // RLS decide si este ejercicio es visible: si es de otro gimnasio, no
    // vuelve nada y se muestra el mensaje de no encontrado.
    supabase
      .from('ejercicios')
      .select('nombre, descripcion, instrucciones, grupo_muscular, equipamiento, video_id')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        setEjercicio(data as Ejercicio | null)
        setCargando(false)
      })
  }, [id])

  if (cargando) {
    return <View style={estilos.centrado}><ActivityIndicator /></View>
  }

  if (!ejercicio) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.gris}>No encontramos este ejercicio.</Text>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <Stack.Screen options={{ title: ejercicio.nombre }} />

      {/* Acá va el reproductor en la Tarea 15. Necesita la URL firmada que
          emite la Edge Function video-url, que a su vez necesita la cuenta
          de Cloudflare. Hasta entonces, solo se avisa que el video existe. */}
      {ejercicio.video_id && (
        <View style={estilos.videoPendiente}>
          <Text style={estilos.gris}>Este ejercicio tiene un video.</Text>
        </View>
      )}

      <Text style={estilos.titulo}>{ejercicio.nombre}</Text>
      <Text style={estilos.gris}>
        {etiqueta(ejercicio.grupo_muscular)} · {etiqueta(ejercicio.equipamiento)}
      </Text>

      {ejercicio.descripcion && <Text style={estilos.parrafo}>{ejercicio.descripcion}</Text>}

      {ejercicio.instrucciones && (
        <>
          <Text style={estilos.subtitulo}>Cómo se hace</Text>
          <Text style={estilos.parrafo}>{ejercicio.instrucciones}</Text>
        </>
      )}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contenido: { padding: 20, gap: 8 },
  titulo: { fontSize: 24, fontWeight: '600' },
  subtitulo: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  parrafo: { fontSize: 15, lineHeight: 22 },
  gris: { color: '#777' },
  videoPendiente: {
    aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#eee',
    alignItems: 'center', justifyContent: 'center',
  },
})
