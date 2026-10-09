import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Link, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import ReorderableList, {
  reorderItems, useReorderableDrag, type ReorderableListReorderEvent,
} from 'react-native-reorderable-list'
import { COLORES, ESPACIO } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { Boton, Fondo, Tarjeta, Texto } from '@/ui'

interface EjercicioEnDia {
  id: string
  orden: number
  series: number
  repeticiones: string
  descanso_seg: number | null
  ejercicios: { id: string; nombre: string; video_id: string | null } | null
}

export default function PantallaDia() {
  const router = useRouter()
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
    return <Fondo><View style={estilos.centrado}><ActivityIndicator color={COLORES.cian} /></View></Fondo>
  }
  if (error || nombreDia === null) {
    return (
      <Fondo>
        <View style={estilos.centrado}>
          <Texto tono="rechazo">{error ?? 'No encontramos este día'}</Texto>
        </View>
      </Fondo>
    )
  }

  return (
    <Fondo>
      <Stack.Screen options={{ title: nombreDia }} />

      <ReorderableList
        data={ejercicios}
        keyExtractor={(e) => e.id}
        onReorder={reordenar}
        contentContainerStyle={estilos.lista}
        renderItem={({ item }) => (
          <FilaEjercicio ejercicio={item} onBorrar={() => borrar(item)} />
        )}
        ListEmptyComponent={
          <Texto tono="secundario" style={estilos.vacio}>Todavía no agregaste ejercicios.</Texto>
        }
      />

      <Boton
        titulo="+ Agregar ejercicio"
        onPress={() => router.push({ pathname: '/(tabs)/rutinas/elegir-ejercicio', params: { diaId } })}
        style={estilos.botonAgregar}
      />
    </Fondo>
  )
}

// Componente aparte: useReorderableDrag solo se puede usar dentro de un ítem
// de la lista.
function FilaEjercicio({ ejercicio, onBorrar }: {
  ejercicio: EjercicioEnDia; onBorrar: () => void
}) {
  const drag = useReorderableDrag()

  return (
    <View style={estilos.separacion}>
      <Tarjeta style={estilos.fila}>
        <Pressable onLongPress={drag} hitSlop={8} style={estilos.agarre}>
          <Ionicons name="reorder-three" size={22} color={COLORES.textoTenue} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Texto peso="semi">{ejercicio.ejercicios?.nombre}</Texto>
          <Texto variante="chico" tono="secundario" numerico>
            {ejercicio.series}×{ejercicio.repeticiones}
            {ejercicio.descanso_seg ? ` · ${ejercicio.descanso_seg}s de descanso` : ''}
          </Texto>
        </View>
        {ejercicio.ejercicios?.video_id && (
          <Link href={`/(tabs)/ejercicios/${ejercicio.ejercicios.id}`} asChild>
            <Pressable hitSlop={10}>
              <Ionicons name="play-circle" size={26} color={COLORES.cian} />
            </Pressable>
          </Link>
        )}
        <Pressable onPress={onBorrar} hitSlop={12}>
          <Ionicons name="trash-outline" size={22} color={COLORES.rechazo} />
        </Pressable>
      </Tarjeta>
    </View>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lista: { padding: ESPACIO.l },
  // La separación va dentro del ítem y no como gap de la lista: el reordenable
  // mide cada ítem, y así el espacio viaja con él al arrastrarlo.
  separacion: { paddingBottom: ESPACIO.s },
  fila: { flexDirection: 'row', alignItems: 'center', gap: ESPACIO.m },
  agarre: { padding: ESPACIO.xs },
  vacio: { textAlign: 'center', marginTop: ESPACIO.xl, paddingHorizontal: ESPACIO.xl },
  botonAgregar: { margin: ESPACIO.l },
})
