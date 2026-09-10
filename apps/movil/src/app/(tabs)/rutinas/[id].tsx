import { useCallback, useState } from 'react'
import {
  ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { Link, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import ReorderableList, {
  reorderItems, useReorderableDrag, type ReorderableListReorderEvent,
} from 'react-native-reorderable-list'
import { supabase } from '@/lib/supabase'

interface Dia {
  id: string
  orden: number
  nombre: string
}

export default function PantallaRutina() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [nombreRutina, setNombreRutina] = useState<string | null>(null)
  const [dias, setDias] = useState<Dia[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [agregando, setAgregando] = useState(false)

  const cargar = useCallback(() => {
    setCargando(true)
    supabase
      .from('rutinas')
      .select('nombre, rutina_dias(id, orden, nombre)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setError('No pudimos cargar la rutina')
        } else {
          setNombreRutina(data.nombre)
          setDias([...(data.rutina_dias as Dia[])].sort((a, b) => a.orden - b.orden))
        }
        setCargando(false)
      })
  }, [id])

  // useFocusEffect y no useEffect: al volver de un día (donde se pudo haber
  // reordenado o agregado ejercicios) esta pantalla no necesita refrescar sus
  // propios datos, pero al volver de "elegir-ejercicio" sí puede haber
  // cambiado la cantidad de ejercicios que en otra vista se mostraría — y es
  // más simple mantener un solo camino de carga que dos.
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const agregarDia = async () => {
    if (!nombreNuevo.trim()) {
      Alert.alert('Poné un nombre al día')
      return
    }
    setAgregando(true)

    // El orden del nuevo va al final. Se lee el máximo actual y no se cuentan
    // filas: si se borró un día del medio, contar daría un orden repetido.
    const orden = dias.length > 0 ? Math.max(...dias.map((d) => d.orden)) + 1 : 0

    const { data, error } = await supabase
      .from('rutina_dias')
      .insert({ rutina_id: id, orden, nombre: nombreNuevo.trim() })
      .select('id, orden, nombre')
      .single()

    setAgregando(false)
    if (error) {
      Alert.alert('No pudimos agregar el día')
      return
    }
    setDias((prev) => [...prev, data as Dia])
    setNombreNuevo('')
  }

  // Mueve el día local y manda la lista COMPLETA en el orden final:
  // reordenar_dias exige una permutación exacta, nunca solo lo que se movió.
  const reordenar = ({ from, to }: ReorderableListReorderEvent) => {
    const nuevo = reorderItems(dias, from, to)
    setDias(nuevo)
    supabase.rpc('reordenar_dias', {
      p_rutina_id: id,
      p_ids: nuevo.map((d) => d.id),
    }).then(({ error }) => {
      if (error) {
        Alert.alert('No pudimos guardar el orden')
        cargar()
      }
    })
  }

  const archivar = () => {
    Alert.alert('Archivar rutina', '¿Archivar esta rutina?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Archivar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('rutinas').update({ estado: 'archivada' }).eq('id', id)
          if (error) {
            Alert.alert('No pudimos archivar la rutina')
            return
          }
          router.back()
        },
      },
    ])
  }

  if (cargando) {
    return <View style={estilos.centrado}><ActivityIndicator /></View>
  }
  if (error || nombreRutina === null) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.error}>{error ?? 'No encontramos esta rutina'}</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: nombreRutina }} />

      <ReorderableList
        data={dias}
        keyExtractor={(d) => d.id}
        onReorder={reordenar}
        renderItem={({ item }) => <FilaDia dia={item} />}
        ListEmptyComponent={
          <Text style={estilos.vacio}>Todavía no agregaste días.</Text>
        }
      />

      <View style={estilos.alta}>
        <TextInput
          style={estilos.campo} placeholder="Día 4 — Hombros"
          value={nombreNuevo} onChangeText={setNombreNuevo}
        />
        <Pressable style={estilos.botonAgregar} onPress={agregarDia} disabled={agregando}>
          <Text style={estilos.botonAgregarTexto}>{agregando ? '…' : '+'}</Text>
        </Pressable>
      </View>

      <Pressable style={estilos.botonArchivar} onPress={archivar}>
        <Text style={estilos.botonArchivarTexto}>Archivar rutina</Text>
      </Pressable>
    </View>
  )
}

// Componente aparte: useReorderableDrag solo se puede usar dentro de un ítem
// de la lista.
function FilaDia({ dia }: { dia: Dia }) {
  const drag = useReorderableDrag()

  return (
    <View style={estilos.fila}>
      <Pressable onLongPress={drag} hitSlop={8} style={estilos.agarre}>
        <Text style={estilos.agarreTexto}>☰</Text>
      </Pressable>
      <Link href={`/(tabs)/rutinas/dia/${dia.id}`} asChild>
        <Pressable style={{ flex: 1 }}>
          <Text style={estilos.nombre}>{dia.nombre}</Text>
        </Pressable>
      </Link>
    </View>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#b00' },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
    backgroundColor: '#fff',
  },
  agarre: { padding: 4 },
  agarreTexto: { color: '#aaa', fontSize: 18 },
  nombre: { fontSize: 16 },
  vacio: { textAlign: 'center', color: '#777', marginTop: 32, paddingHorizontal: 24 },
  alta: { flexDirection: 'row', gap: 8, padding: 12 },
  campo: {
    flex: 1, borderWidth: 1, borderColor: '#ddd',
    borderRadius: 8, padding: 12,
  },
  botonAgregar: {
    backgroundColor: '#111', borderRadius: 8,
    paddingHorizontal: 18, justifyContent: 'center',
  },
  botonAgregarTexto: { color: '#fff', fontSize: 18 },
  botonArchivar: { alignItems: 'center', padding: 14 },
  botonArchivarTexto: { color: '#b00' },
})
