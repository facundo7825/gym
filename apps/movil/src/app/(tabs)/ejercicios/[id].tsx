import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
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

  const [urlVideo, setUrlVideo] = useState<string | null>(null)
  const [errorVideo, setErrorVideo] = useState<string | null>(null)

  useEffect(() => {
    if (!ejercicio?.video_id) return

    // La URL firmada vence en 5 minutos. Como el video dura 60 segundos como
    // máximo, la única forma de toparse con el vencimiento es dejar la
    // pantalla abierta sin mirar; en ese caso se vuelve a montar y se pide de
    // nuevo. No hace falta renovarla con un timer.
    supabase.functions
      .invoke('video-url', { body: { videoId: ejercicio.video_id } })
      .then(({ data, error }) => {
        if (error || !data?.rutaFirmada) {
          setErrorVideo('No pudimos cargar el video.')
          return
        }
        // La función devuelve solo la ruta: adentro del runtime de Edge
        // Functions, SUPABASE_URL es el nombre interno del contenedor y no se
        // puede resolver desde el teléfono. La base la pone el cliente.
        setUrlVideo(`${process.env.EXPO_PUBLIC_SUPABASE_URL}${data.rutaFirmada}`)
      })
  }, [ejercicio?.video_id])

  const reproductor = useVideoPlayer(urlVideo, (p) => {
    p.loop = true
  })

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

      {ejercicio.video_id && (
        <View style={estilos.video}>
          {urlVideo ? (
            <VideoView
              player={reproductor}
              style={estilos.reproductor}
              // `allowsFullscreen` ya no existe en esta versión de expo-video
              // (SDK 57): el pantalla-completa queda habilitado por default
              // vía `fullscreenOptions`, así que no hace falta pasar nada.
              nativeControls
            />
          ) : (
            <Text style={estilos.gris}>
              {errorVideo ?? 'Cargando video…'}
            </Text>
          )}
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
  video: {
    aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#eee',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  reproductor: { width: '100%', height: '100%' },
})
