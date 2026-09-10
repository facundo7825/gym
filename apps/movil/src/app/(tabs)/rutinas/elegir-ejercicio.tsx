import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
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
}

// No es un buscador nuevo: copia la estructura de (tabs)/ejercicios/index.tsx
// —mismo filtrarEjercicios, mismos chips— y cambia solo el onPress de la
// fila: en vez de navegar al detalle, abre los campos de alta.
export default function ElegirEjercicio() {
  const { diaId } = useLocalSearchParams<{ diaId: string }>()
  const router = useRouter()
  const [ejercicios, setEjercicios] = useState<Ejercicio[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [grupo, setGrupo] = useState<GrupoMuscular | null>(null)
  const [equipo, setEquipo] = useState<Equipamiento | null>(null)
  const [soloMiGym, setSoloMiGym] = useState(false)
  const [seleccionado, setSeleccionado] = useState<Ejercicio | null>(null)

  useEffect(() => {
    // RLS ya limita esto al catálogo global más los del gimnasio del socio.
    supabase
      .from('ejercicios')
      .select('id, nombre, grupo_muscular, equipamiento, gym_id')
      .order('nombre')
      .then(({ data, error }) => {
        if (error) setError('No pudimos cargar los ejercicios')
        else setEjercicios((data ?? []) as Ejercicio[])
        setCargando(false)
      })
  }, [])

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
      <Stack.Screen options={{ title: 'Agregar ejercicio' }} />

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
          <Pressable style={estilos.fila} onPress={() => setSeleccionado(item)}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.nombre}>{item.nombre}</Text>
              <Text style={estilos.sub}>
                {etiqueta(item.grupo_muscular)}
                {item.gym_id === null ? ' · Catálogo general' : ' · De tu gimnasio'}
              </Text>
            </View>
          </Pressable>
        )}
      />

      {seleccionado && (
        <AltaEjercicio
          ejercicio={seleccionado}
          diaId={diaId}
          onCancelar={() => setSeleccionado(null)}
          onAgregado={() => router.back()}
        />
      )}
    </View>
  )
}

function AltaEjercicio({
  ejercicio, diaId, onCancelar, onAgregado,
}: {
  ejercicio: Ejercicio
  diaId: string
  onCancelar: () => void
  onAgregado: () => void
}) {
  const [series, setSeries] = useState('4')
  const [repeticiones, setRepeticiones] = useState('8-12')
  const [descanso, setDescanso] = useState('90')
  const [guardando, setGuardando] = useState(false)

  const agregar = async () => {
    const seriesNum = Number(series)
    if (!seriesNum || seriesNum < 1) {
      Alert.alert('Las series tienen que ser al menos 1')
      return
    }
    if (!repeticiones.trim()) {
      Alert.alert('Poné las repeticiones')
      return
    }
    setGuardando(true)

    // El orden del nuevo va al final. Se lee el máximo actual y no se cuentan
    // filas, igual que agregarEjercicio en el panel.
    const { data: ultimo } = await supabase
      .from('rutina_ejercicios').select('orden').eq('rutina_dia_id', diaId)
      .order('orden', { ascending: false }).limit(1).maybeSingle()

    const { error } = await supabase.from('rutina_ejercicios').insert({
      rutina_dia_id: diaId,
      ejercicio_id: ejercicio.id,
      orden: (ultimo?.orden ?? 0) + 1,
      series: seriesNum,
      repeticiones: repeticiones.trim(),
      descanso_seg: descanso.trim() ? Number(descanso) : null,
    })

    setGuardando(false)
    if (error) {
      Alert.alert('No pudimos agregar el ejercicio')
      return
    }
    onAgregado()
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onCancelar}>
      <View style={estilos.fondoModal}>
        <View style={estilos.hoja}>
          <Text style={estilos.tituloModal}>{ejercicio.nombre}</Text>

          <Text style={estilos.etiquetaCampo}>Series</Text>
          <TextInput style={estilos.campo} value={series} onChangeText={setSeries}
            keyboardType="number-pad" />

          <Text style={estilos.etiquetaCampo}>Repeticiones</Text>
          <TextInput style={estilos.campo} value={repeticiones} onChangeText={setRepeticiones}
            placeholder="8-12" />

          <Text style={estilos.etiquetaCampo}>Descanso (segundos)</Text>
          <TextInput style={estilos.campo} value={descanso} onChangeText={setDescanso}
            keyboardType="number-pad" />

          <View style={estilos.accionesModal}>
            <Pressable style={estilos.botonCancelar} onPress={onCancelar} disabled={guardando}>
              <Text>Cancelar</Text>
            </Pressable>
            <Pressable style={estilos.botonAgregar} onPress={agregar} disabled={guardando}>
              <Text style={estilos.botonAgregarTexto}>
                {guardando ? 'Agregando…' : 'Agregar'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  fondoModal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  hoja: {
    backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 20, gap: 4,
  },
  tituloModal: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  etiquetaCampo: { color: '#777', fontSize: 13, marginTop: 8 },
  campo: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10 },
  accionesModal: { flexDirection: 'row', gap: 8, marginTop: 16 },
  botonCancelar: {
    flex: 1, borderRadius: 8, padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#ddd',
  },
  botonAgregar: {
    flex: 1, backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center',
  },
  botonAgregarTexto: { color: '#fff' },
})
