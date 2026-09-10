import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Link, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import ReorderableList, {
  reorderItems, useReorderableDrag, type ReorderableListReorderEvent,
} from 'react-native-reorderable-list'
import { supabase } from '@/lib/supabase'

interface EjercicioEnDia {
  id: string
  orden: number
  series: number
  repeticiones: string
  descanso_seg: number | null
  ejercicios: { id: string; nombre: string; video_id: string | null } | null
}

export default function PantallaDia() {
  const { diaId } = useLocalSearchParams<{ diaId: string }>()
  const [nombreDia, setNombreDia] = useState<string | null>(null)
  const [ejercicios, setEjercicios] = useState<EjercicioEnDia[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    setCargando(true)
    // RLS ya decide si este día es visible (mismo camino que la rutina que lo
    // contiene): si es de otro gimnasio, no vuelve nada.
    supabase
      .from('rutina_dias')
      .select(`
        nombre,
        rutina_ejercicios (
          id, orden, series, repeticiones, descanso_seg,
          ejercicios ( id, nombre, video_id )
        )
      `)
      .eq('id', diaId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setError('No pudimos cargar el día')
        } else {
          setNombreDia(data.nombre)
          setEjercicios(
            [...(data.rutina_ejercicios as EjercicioEnDia[])].sort((a, b) => a.orden - b.orden),
          )
        }
        setCargando(false)
      })
  }, [diaId])

  // useFocusEffect y no useEffect: al volver de "elegir-ejercicio" esta
  // pantalla tiene que mostrar el ejercicio recién agregado.
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  // El diseño resigna arrastrar un ejercicio de un día a otro justamente
  // porque se puede sacar y volver a agregar. Sin esto, el ejercicio agregado
  // por error se quedaba para siempre.
  const borrar = (ejercicio: EjercicioEnDia) => {
    Alert.alert(
      'Borrar ejercicio',
      `¿Sacar "${ejercicio.ejercicios?.nombre ?? 'este ejercicio'}" del día?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            // El .select() no es decorativo: un delete que RLS niega no
            // devuelve error, devuelve cero filas. Sin mirar cuántas
            // volvieron, la pantalla lo sacaría de la lista y mentiría.
            const { data, error } = await supabase
              .from('rutina_ejercicios').delete().eq('id', ejercicio.id).select('id')
            if (error || !data?.length) {
              Alert.alert('No pudimos borrar el ejercicio')
              return
            }
            setEjercicios((prev) => prev.filter((e) => e.id !== ejercicio.id))
          },
        },
      ],
    )
  }

  // Mueve el ejercicio local y manda la lista COMPLETA en el orden final:
  // reordenar_ejercicios exige una permutación exacta, nunca solo lo que se
  // movió.
  const reordenar = ({ from, to }: ReorderableListReorderEvent) => {
    const nuevo = reorderItems(ejercicios, from, to)
    setEjercicios(nuevo)
    supabase.rpc('reordenar_ejercicios', {
      p_dia_id: diaId,
      p_ids: nuevo.map((e) => e.id),
    }).then(({ error }) => {
      if (error) {
        Alert.alert('No pudimos guardar el orden')
        cargar()
      }
    })
  }

  if (cargando) {
    return <View style={estilos.centrado}><ActivityIndicator /></View>
  }
  if (error || nombreDia === null) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.error}>{error ?? 'No encontramos este día'}</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: nombreDia }} />

      <ReorderableList
        data={ejercicios}
        keyExtractor={(e) => e.id}
        onReorder={reordenar}
        renderItem={({ item }) => (
          <FilaEjercicio ejercicio={item} onBorrar={() => borrar(item)} />
        )}
        ListEmptyComponent={
          <Text style={estilos.vacio}>Todavía no agregaste ejercicios.</Text>
        }
      />

      <Link href={{ pathname: '/(tabs)/rutinas/elegir-ejercicio', params: { diaId } }} asChild>
        <Pressable style={estilos.botonAgregar}>
          <Text style={estilos.botonAgregarTexto}>+ Agregar ejercicio</Text>
        </Pressable>
      </Link>
    </View>
  )
}

// Componente aparte: useReorderableDrag solo se puede usar dentro de un ítem
// de la lista.
function FilaEjercicio({ ejercicio, onBorrar }: {
  ejercicio: EjercicioEnDia; onBorrar: () => void
}) {
  const drag = useReorderableDrag()

  return (
    <View style={estilos.fila}>
      <Pressable onLongPress={drag} hitSlop={8} style={estilos.agarre}>
        <Text style={estilos.agarreTexto}>☰</Text>
      </Pressable>
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
      <Pressable onPress={onBorrar} hitSlop={8}>
        <Text style={estilos.borrar}>✕</Text>
      </Pressable>
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
  sub: { color: '#777', fontSize: 13, marginTop: 2 },
  video: { fontSize: 18 },
  borrar: { color: '#b00', fontSize: 16, paddingHorizontal: 4 },
  vacio: { textAlign: 'center', color: '#777', marginTop: 32, paddingHorizontal: 24 },
  botonAgregar: {
    backgroundColor: '#111', margin: 16, borderRadius: 8,
    padding: 14, alignItems: 'center',
  },
  botonAgregarTexto: { color: '#fff' },
})
