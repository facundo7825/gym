import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useEventListener } from 'expo'
import { useVideoPlayer, VideoView } from 'expo-video'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { COLORES, ESPACIO, RADIOS, etiqueta, type Equipamiento, type GrupoMuscular } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { Fondo, Texto } from '@/ui'

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

  // El id del video que hay que pedir ahora mismo, y si ya se gastó el único
  // reintento permitido. Van en refs porque los lee pedirUrl(), que se llama
  // tanto desde el efecto de montaje como desde el listener de más abajo —y
  // ninguno de los dos debe recrearse cuando cambia el estado.
  const videoIdRef = useRef<string | null>(null)
  const yaReintentado = useRef(false)

  const pedirUrl = useCallback(() => {
    const videoId = videoIdRef.current
    if (!videoId) return

    supabase.functions
      .invoke('video-url', { body: { videoId } })
      .then(({ data, error }) => {
        if (error || !data?.rutaFirmada) {
          // 409 = "la fila todavía no llegó a estado 'listo'" (el diseño lo
          // pide explícito, distinto del genérico). Se puede leer porque
          // FunctionsHttpError guarda la Response cruda en `context`.
          const status = error instanceof FunctionsHttpError ? error.context?.status : undefined
          setErrorVideo(
            status === 409
              ? 'El video todavía se está subiendo.'
              : 'No pudimos cargar el video.',
          )
          return
        }
        // La función devuelve solo la ruta: adentro del runtime de Edge
        // Functions, SUPABASE_URL es el nombre interno del contenedor y no se
        // puede resolver desde el teléfono. La base la pone el cliente. Se le
        // saca la barra final por si la variable de entorno la trae puesta:
        // sin esto, la URL queda con "//storage/..." en el medio.
        const base = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
        setUrlVideo(`${base}${data.rutaFirmada}`)
      })
  }, [])

  useEffect(() => {
    if (!ejercicio?.video_id) return

    // Se resetea acá y no solo al montar: si video_id cambiara sin que el
    // componente se desmonte, por un instante se seguiría viendo (o el error
    // de) el video anterior.
    videoIdRef.current = ejercicio.video_id
    yaReintentado.current = false
    setUrlVideo(null)
    setErrorVideo(null)
    pedirUrl()
  }, [ejercicio?.video_id, pedirUrl])

  const reproductor = useVideoPlayer(urlVideo, (p) => {
    p.loop = true
  })

  // La URL firmada vence en 5 minutos y el video dura 60 segundos como
  // máximo, así que la única forma real de toparse con el vencimiento es
  // dejar la pantalla abierta sin mirar. Y ese es justo el caso en el que
  // NO se vuelve a montar el componente: sin este listener, el reproductor
  // queda roto y sin salida hasta navegar afuera y volver. Un solo reintento
  // (yaReintentado corta el segundo) porque si la URL nueva también falla,
  // no hay nada que un segundo pedido vaya a arreglar.
  useEventListener(reproductor, 'statusChange', ({ status }) => {
    if (status !== 'error' || yaReintentado.current) return
    yaReintentado.current = true
    pedirUrl()
  })

  if (cargando) {
    return <Fondo><View style={estilos.centrado}><ActivityIndicator color={COLORES.cian} /></View></Fondo>
  }

  if (!ejercicio) {
    return (
      <Fondo>
        <View style={estilos.centrado}>
          <Texto tono="secundario">No encontramos este ejercicio.</Texto>
        </View>
      </Fondo>
    )
  }

  return (
    <Fondo>
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
            <Texto tono="secundario">
              {errorVideo ?? 'Cargando video…'}
            </Texto>
          )}
        </View>
      )}

      <Texto variante="subtitulo">{ejercicio.nombre}</Texto>
      <Texto tono="secundario">
        {etiqueta(ejercicio.grupo_muscular)} · {etiqueta(ejercicio.equipamiento)}
      </Texto>

      {ejercicio.descripcion && <Texto style={estilos.parrafo}>{ejercicio.descripcion}</Texto>}

      {ejercicio.instrucciones && (
        <>
          <Texto variante="grande" style={estilos.subtitulo}>Cómo se hace</Texto>
          <Texto style={estilos.parrafo}>{ejercicio.instrucciones}</Texto>
        </>
      )}
    </ScrollView>
    </Fondo>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contenido: { padding: ESPACIO.l, gap: ESPACIO.s },
  subtitulo: { marginTop: ESPACIO.m },
  parrafo: { lineHeight: 22 },
  video: {
    aspectRatio: 16 / 9, borderRadius: RADIOS.medio, backgroundColor: COLORES.hundido,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  reproductor: { width: '100%', height: '100%' },
})
