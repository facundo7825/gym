import { useCallback, useState } from 'react'
import {
  ActivityIndicator, Alert, Button, FlatList, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native'
import { Link, useFocusEffect, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { diaAMostrar, sesionAbierta, type SesionEnCola } from '@gym/core'
import { AvisoSincronizacion } from '@/components/aviso-sincronizacion'
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

  // Lo que va arriba en todos los casos: el estado de la cola y la sesión que
  // quedó abierta. Una sesión abierta no depende de tener rutina ni señal.
  const avisos = (
    <>
      <AvisoSincronizacion />
      {abierta && (
        <View style={estilos.abierta}>
          <Text style={estilos.abiertaTexto}>Tenés un entrenamiento sin terminar.</Text>
          <View style={estilos.abiertaAcciones}>
            <Pressable onPress={() => router.push({ pathname: '/entrenar', params: { retomar: '1' } })}>
              <Text style={estilos.enlace}>Seguir</Text>
            </Pressable>
            <Pressable onPress={() => void terminarAbierta()}>
              <Text style={estilos.enlace}>Terminar</Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
  )

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator />
        <Button title="Cerrar sesión" onPress={() => void cerrarSesion()} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={{ flex: 1 }}>
        {avisos}
        <View style={estilos.centrado}>
          <Text style={estilos.error}>{error}</Text>
          <Pressable style={estilos.botonSecundario} onPress={entrenarLibre}>
            <Text>Entrenar libre</Text>
          </Pressable>
          <Button title="Cerrar sesión" onPress={() => void cerrarSesion()} />
        </View>
      </View>
    )
  }

  if (!rutina) {
    return (
      <View style={{ flex: 1 }}>
        {avisos}
        <View style={estilos.centrado}>
          <Text style={estilos.vacio}>Todavía no tenés una rutina.</Text>
          <Link href="/(tabs)/rutinas" asChild>
            <Pressable>
              <Text style={estilos.enlace}>Mirá el catálogo de tu gimnasio.</Text>
            </Pressable>
          </Link>
          <Pressable style={estilos.botonSecundario} onPress={entrenarLibre}>
            <Text>Entrenar libre</Text>
          </Pressable>
          <Button title="Cerrar sesión" onPress={() => void cerrarSesion()} />
        </View>
      </View>
    )
  }

  const dias = [...rutina.rutina_dias].sort((a, b) => a.orden - b.orden)
  const dia = dias.find((d) => d.id === diaId) ?? null
  const ejercicios = dia
    ? [...dia.rutina_ejercicios].sort((a, b) => a.orden - b.orden)
    : []

  return (
    <View style={{ flex: 1 }}>
      {avisos}
      {guardada && (
        <Text style={estilos.guardada}>Sin conexión: es tu rutina guardada en el teléfono.</Text>
      )}

      <View style={estilos.encabezado}>
        <Text style={estilos.titulo}>{rutina.nombre}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={estilos.filtros} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        {dias.map((d) => (
          <Chip key={d.id} activo={d.id === diaId} texto={d.nombre}
            onPress={() => elegirDia(d.id)} />
        ))}
      </ScrollView>

      <FlatList
        data={ejercicios}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <FilaEjercicio ejercicio={item} />}
        ListEmptyComponent={
          <Text style={estilos.vacio}>Este día todavía no tiene ejercicios.</Text>
        }
      />

      <View style={estilos.pie}>
        {dia && ejercicios.length > 0 && (
          <Pressable
            style={estilos.botonPrincipal}
            onPress={() => router.push({ pathname: '/entrenar', params: { diaId: dia.id } })}
          >
            <Text style={estilos.botonPrincipalTexto}>Empezar</Text>
          </Pressable>
        )}
        <Pressable style={estilos.botonSecundario} onPress={entrenarLibre}>
          <Text>Entrenar libre</Text>
        </Pressable>
        <Button title="Cerrar sesión" onPress={() => void cerrarSesion()} />
      </View>
    </View>
  )
}

// Modo lectura: sin agarre de reordenar ni acceso al armador, a diferencia de
// la pantalla equivalente dentro de Rutinas.
function FilaEjercicio({ ejercicio }: { ejercicio: EjercicioDelDia }) {
  return (
    <View style={estilos.fila}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.nombre}>{ejercicio.ejercicios?.nombre}</Text>
        <Text style={estilos.sub}>
          {ejercicio.series}×{ejercicio.repeticiones}
          {ejercicio.descanso_seg ? ` · ${ejercicio.descanso_seg}s de descanso` : ''}
        </Text>
      </View>
      {ejercicio.ejercicios?.video_id && (
        <Link href={`/(tabs)/ejercicios/${ejercicio.ejercicios.id}`} asChild>
          <Pressable hitSlop={8}>
            <Text style={estilos.video}>▶</Text>
          </Pressable>
        </Link>
      )}
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
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  error: { color: '#b00' },
  encabezado: { padding: 16, paddingBottom: 8 },
  titulo: { fontSize: 22, fontWeight: '600' },
  guardada: { paddingHorizontal: 16, paddingTop: 8, color: '#777', fontSize: 13 },
  filtros: { flexGrow: 0, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: '#eee',
  },
  chipActivo: { backgroundColor: '#111' },
  chipTexto: { color: '#333' },
  chipTextoActivo: { color: '#fff' },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
    backgroundColor: '#fff',
  },
  nombre: { fontSize: 16 },
  sub: { color: '#777', fontSize: 13, marginTop: 2 },
  video: { fontSize: 18 },
  vacio: { textAlign: 'center', color: '#777', marginTop: 32, paddingHorizontal: 24 },
  enlace: { textAlign: 'center', color: '#111', fontWeight: '600', textDecorationLine: 'underline' },
  abierta: {
    margin: 12, padding: 12, borderRadius: 10, gap: 8,
    backgroundColor: 'rgba(27,127,59,0.10)',
  },
  abiertaTexto: { fontWeight: '600' },
  abiertaAcciones: { flexDirection: 'row', gap: 24 },
  pie: { padding: 12, gap: 8 },
  botonPrincipal: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  botonPrincipalTexto: { color: '#fff', fontWeight: '600', fontSize: 16 },
  botonSecundario: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, alignItems: 'center',
    alignSelf: 'stretch',
  },
})
