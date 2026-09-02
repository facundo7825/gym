import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native'
import { Link, Stack } from 'expo-router'
import {
  EQUIPAMIENTOS, GRUPOS_MUSCULARES, etiqueta, filtrarEjercicios,
  type Equipamiento, type GrupoMuscular,
} from '@gym/core'
import { supabase } from '@/lib/supabase'

interface Ejercicio {
  id: string
  nombre: string
  grupo_muscular: GrupoMuscular
  equipamiento: Equipamiento
  gym_id: string | null
  video_id: string | null
}

export default function ListaEjercicios() {
  const [ejercicios, setEjercicios] = useState<Ejercicio[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [grupo, setGrupo] = useState<GrupoMuscular | null>(null)
  const [equipo, setEquipo] = useState<Equipamiento | null>(null)
  const [soloMiGym, setSoloMiGym] = useState(false)

  useEffect(() => {
    // RLS ya limita esto al catálogo global más los del gimnasio del socio.
    supabase
      .from('ejercicios')
      .select('id, nombre, grupo_muscular, equipamiento, gym_id, video_id')
      .order('nombre')
      .then(({ data, error }) => {
        if (error) setError('No pudimos cargar los ejercicios')
        else setEjercicios((data ?? []) as Ejercicio[])
        setCargando(false)
      })
  }, [])

  // El filtrado vive en @gym/core para poder probarlo: acá adentro solo se
  // verificaría a mano, tocando la app.
  const visibles = useMemo(
    () => filtrarEjercicios(ejercicios, { busqueda, grupo, equipo, soloMiGym }) as Ejercicio[],
    [ejercicios, busqueda, grupo, equipo, soloMiGym],
  )

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator />
      </View>
    )
  }

  if (error) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.error}>{error}</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Ejercicios' }} />

      <TextInput
        style={estilos.buscador} placeholder="Buscar ejercicio"
        value={busqueda} onChangeText={setBusqueda}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={estilos.filtros} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        <Chip activo={grupo === null} texto="Todos" onPress={() => setGrupo(null)} />
        {GRUPOS_MUSCULARES.map((g) => (
          <Chip key={g} activo={grupo === g} texto={etiqueta(g)}
            onPress={() => setGrupo(grupo === g ? null : g)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={estilos.filtros} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        <Chip activo={soloMiGym} texto="Solo lo que hay acá"
          onPress={() => setSoloMiGym((v) => !v)} />
        {EQUIPAMIENTOS.map((eq) => (
          <Chip key={eq} activo={equipo === eq} texto={etiqueta(eq)}
            onPress={() => setEquipo(equipo === eq ? null : eq)} />
        ))}
      </ScrollView>

      <FlatList
        data={visibles}
        keyExtractor={(x) => x.id}
        ListEmptyComponent={
          <Text style={estilos.vacio}>
            No encontramos ejercicios con esos filtros.
          </Text>
        }
        renderItem={({ item }) => (
          <Link href={`/(tabs)/ejercicios/${item.id}`} asChild>
            <Pressable style={estilos.fila}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.nombre}>{item.nombre}</Text>
                <Text style={estilos.sub}>
                  {etiqueta(item.grupo_muscular)}
                  {item.gym_id === null ? ' · Catálogo general' : ' · De tu gimnasio'}
                </Text>
              </View>
              {item.video_id && <Text>▶</Text>}
            </Pressable>
          </Link>
        )}
      />
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
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#b00' },
  buscador: {
    margin: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10,
  },
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
  },
  nombre: { fontSize: 16 },
  sub: { color: '#777', fontSize: 13, marginTop: 2 },
  vacio: { textAlign: 'center', color: '#777', marginTop: 32 },
})
