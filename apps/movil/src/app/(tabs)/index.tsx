import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Link, Tabs, useFocusEffect, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Ionicons from '@expo/vector-icons/Ionicons'
import { COLORES, ESPACIO, TOQUE_MINIMO, diaAMostrar, sesionAbierta, type SesionEnCola } from '@gym/core'
import { AvisoSincronizacion } from '@/components/aviso-sincronizacion'
import { Boton, Chip, Fondo, Tarjeta, Texto } from '@/ui'
import { cerrarSesion } from '@/lib/cerrar-sesion'
import { leerCola } from '@/lib/local/cola'
import { membresiasGuardadas } from '@/lib/membresia'
import { cargarRutinaActiva, type EjercicioDelDia, type RutinaActiva } from '@/lib/rutina-activa'
import { terminarSesion } from '@/lib/terminar-sesion'

const CLAVE_ULTIMO_DIA = 'hoy.ultimoDia'

async function buscarSesionAbierta(): Promise<SesionEnCola | null> {
  const { sesiones } = await leerCola()
  return sesionAbierta(sesiones, (await membresiasGuardadas()).map((m) => m.id))
}

export default function Hoy() {
  const router = useRouter()
  const [rutina, setRutina] = useState<RutinaActiva | null>(null)
  const [guardada, setGuardada] = useState(false)
  const [diaId, setDiaId] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<SesionEnCola | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // useFocusEffect y no useEffect: al volver de entrenar, o del armador, tiene
  // que verse el cambio.
  useFocusEffect(
    useCallback(() => {
      let vivo = true
      setCargando(true)

      Promise.all([
        cargarRutinaActiva(),
        AsyncStorage.getItem(CLAVE_ULTIMO_DIA),
        buscarSesionAbierta(),
      ]).then(([resultado, ultimoId, sinTerminar]) => {
        if (!vivo) return
        setAbierta(sinTerminar)

        if (!resultado) {
          setError('No pudimos cargar tu rutina')
          setCargando(false)
          return
        }

        setError(null)
        setRutina(resultado.rutina)
        setGuardada(resultado.guardada)
        setDiaId(resultado.rutina
          ? (diaAMostrar(resultado.rutina.rutina_dias, ultimoId)?.id ?? null)
          : null)
        setCargando(false)
      }).catch(() => {
        // Cubre también un AsyncStorage o un SQLite que fallan: sin esto, el
        // socio queda en la pantalla de carga sin ningún botón para salir.
        if (!vivo) return
        setError('No pudimos cargar tu rutina')
        setCargando(false)
      })

      return () => { vivo = false }
    }, []),
  )

  const elegirDia = (id: string) => {
    setDiaId(id)
    AsyncStorage.setItem(CLAVE_ULTIMO_DIA, id)
  }

  const terminarAbierta = async () => {
    if (!abierta) return
    try {
      await terminarSesion(abierta)
      setAbierta(null)
    } catch {
      Alert.alert('No pudimos terminar el entrenamiento', 'Probá de nuevo.')
    }
  }

  const entrenarLibre = () => router.push('/entrenar')

  // Cerrar sesión pasa al encabezado: era un botón suelto al pie de cada estado.
  const encabezado = (
    <Tabs.Screen
      options={{
        headerRight: () => (
          <Pressable
            onPress={() => void cerrarSesion()} hitSlop={8} style={estilos.salir}
            accessibilityRole="button" accessibilityLabel="Cerrar sesión"
          >
            <Ionicons name="log-out-outline" size={22} color={COLORES.textoSecundario} />
          </Pressable>
        ),
      }}
    />
  )

  // Lo que va arriba en todos los casos: el estado de la cola y la sesión que
  // quedó abierta. Una sesión abierta no depende de tener rutina ni señal.
  const avisos = (
    <>
      <AvisoSincronizacion />
      {abierta && (
        <Tarjeta style={estilos.abierta}>
          <View style={estilos.filaAbierta}>
            <Ionicons name="time-outline" size={20} color={COLORES.cian} />
            <Texto peso="semi" style={{ flex: 1 }}>Tenés un entrenamiento sin terminar.</Texto>
          </View>
          <View style={estilos.accionesAbierta}>
            <Boton
              titulo="Seguir" style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/entrenar', params: { retomar: '1' } })}
            />
            <Boton titulo="Terminar" variante="secundario" style={{ flex: 1 }} onPress={() => void terminarAbierta()} />
          </View>
        </Tarjeta>
      )}
    </>
  )

  if (cargando) {
    return (
      <Fondo style={estilos.centrado}>
        {encabezado}
        <ActivityIndicator color={COLORES.cian} />
      </Fondo>
    )
  }

  if (error || !rutina) {
    return (
      <Fondo>
        {encabezado}
        <ScrollView contentContainerStyle={estilos.contenido}>
          {avisos}
          <Tarjeta style={estilos.vacia}>
            <Ionicons
              name={error ? 'cloud-offline-outline' : 'barbell-outline'}
              size={32} color={error ? COLORES.rechazo : COLORES.cian}
            />
            <Texto variante="grande" style={estilos.centradoTexto}>
              {error ?? 'Todavía no tenés una rutina.'}
            </Texto>
            {!error && (
              <Link href="/(tabs)/rutinas" asChild>
                <Pressable hitSlop={14}>
                  <Texto peso="semi" tono="cian">Mirá el catálogo de tu gimnasio.</Texto>
                </Pressable>
              </Link>
            )}
          </Tarjeta>
          <Boton titulo="Entrenar libre" variante="secundario" icono="add" onPress={entrenarLibre} />
        </ScrollView>
      </Fondo>
    )
  }

  const dias = [...rutina.rutina_dias].sort((a, b) => a.orden - b.orden)
  const dia = dias.find((d) => d.id === diaId) ?? null
  const ejercicios = dia
    ? [...dia.rutina_ejercicios].sort((a, b) => a.orden - b.orden)
    : []

  return (
    <Fondo>
      {encabezado}
      <ScrollView contentContainerStyle={estilos.contenido}>
        {avisos}
        {guardada && (
          <Texto variante="chico" tono="secundario">Sin conexión: es tu rutina guardada en el teléfono.</Texto>
        )}

        <Tarjeta destacada>
          <View style={estilos.etiquetaHoy}>
            <Texto variante="mini" peso="semi">HOY TOCA</Texto>
          </View>
          <Texto variante="subtitulo" style={{ marginTop: ESPACIO.m }}>{dia?.nombre ?? rutina.nombre}</Texto>
          <Texto variante="chico" style={{ opacity: 0.85 }}>
            {rutina.nombre} · {ejercicios.length} {ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'}
          </Texto>
          {dia && ejercicios.length > 0 && (
            <Boton
              titulo="Empezar" variante="claro" icono="play" style={{ marginTop: ESPACIO.l }}
              onPress={() => router.push({ pathname: '/entrenar', params: { diaId: dia.id } })}
            />
          )}
        </Tarjeta>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.chips}>
          {dias.map((d) => (
            <Chip key={d.id} activo={d.id === diaId} texto={d.nombre} onPress={() => elegirDia(d.id)} />
          ))}
        </ScrollView>

        {ejercicios.length === 0 ? (
          <Texto tono="secundario" style={estilos.centradoTexto}>Este día todavía no tiene ejercicios.</Texto>
        ) : (
          <View style={{ gap: ESPACIO.s }}>
            {ejercicios.map((e) => <FilaEjercicio key={e.id} ejercicio={e} />)}
          </View>
        )}

        <Boton titulo="Entrenar libre" variante="secundario" icono="add" onPress={entrenarLibre} />
      </ScrollView>
    </Fondo>
  )
}

// Modo lectura: sin agarre de reordenar ni acceso al armador, a diferencia de
// la pantalla equivalente dentro de Rutinas.
function FilaEjercicio({ ejercicio }: { ejercicio: EjercicioDelDia }) {
  return (
    <Tarjeta style={estilos.fila}>
      <View style={{ flex: 1 }}>
        <Texto peso="semi">{ejercicio.ejercicios?.nombre}</Texto>
        <Texto variante="chico" tono="secundario" numerico>
          {ejercicio.series}×{ejercicio.repeticiones}
          {ejercicio.descanso_seg ? ` · ${ejercicio.descanso_seg}s de descanso` : ''}
        </Texto>
      </View>
      {ejercicio.ejercicios?.video_id && (
        <Link href={`/(tabs)/ejercicios/${ejercicio.ejercicios.id}`} asChild>
          <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel="Ver el video">
            <Ionicons name="play-circle" size={30} color={COLORES.cian} />
          </Pressable>
        </Link>
      )}
    </Tarjeta>
  )
}

const estilos = StyleSheet.create({
  centrado: { alignItems: 'center', justifyContent: 'center' },
  centradoTexto: { textAlign: 'center' },
  contenido: { padding: ESPACIO.l, gap: ESPACIO.l, paddingBottom: ESPACIO.xl * 2 },
  salir: { minWidth: TOQUE_MINIMO, minHeight: TOQUE_MINIMO, alignItems: 'center', justifyContent: 'center', marginRight: ESPACIO.s },
  abierta: { gap: ESPACIO.m },
  filaAbierta: { flexDirection: 'row', alignItems: 'center', gap: ESPACIO.s },
  accionesAbierta: { flexDirection: 'row', gap: ESPACIO.s },
  vacia: { alignItems: 'center', gap: ESPACIO.m, paddingVertical: ESPACIO.xl },
  etiquetaHoy: {
    alignSelf: 'flex-start', paddingHorizontal: ESPACIO.s + 2, paddingVertical: ESPACIO.xs,
    borderRadius: 999, backgroundColor: COLORES.sobreDegrade,
  },
  chips: { gap: ESPACIO.s },
  fila: { flexDirection: 'row', alignItems: 'center', gap: ESPACIO.m, paddingVertical: ESPACIO.m },
})
