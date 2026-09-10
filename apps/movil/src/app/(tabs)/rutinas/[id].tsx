import { useCallback, useState } from 'react'
import {
  ActivityIndicator, Alert, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native'
import { Link, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import ReorderableList, {
  reorderItems, useReorderableDrag, type ReorderableListReorderEvent,
} from 'react-native-reorderable-list'
import { supabase } from '@/lib/supabase'
import { tomarRutina } from '@/lib/tomar-rutina'

interface EjercicioEnDia {
  id: string
  orden: number
  series: number
  repeticiones: string
  descanso_seg: number | null
  ejercicios: { id: string; nombre: string; video_id: string | null } | null
}

interface Dia {
  id: string
  orden: number
  nombre: string
  rutina_ejercicios: EjercicioEnDia[]
}

interface Rutina {
  nombre: string
  tipo: 'plantilla' | 'activa'
  gym_id: string
}

export default function PantallaRutina() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [rutina, setRutina] = useState<Rutina | null>(null)
  const [dias, setDias] = useState<Dia[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [agregando, setAgregando] = useState(false)
  const [tomando, setTomando] = useState(false)

  const cargar = useCallback(() => {
    setCargando(true)
    // Trae también `tipo`: una plantilla del catálogo se puede leer pero no
    // escribir, así que abre en modo lectura y no en el armador. Y los
    // ejercicios de cada día, que en esa vista se muestran.
    supabase
      .from('rutinas')
      .select(`
        nombre, tipo, gym_id,
        rutina_dias (
          id, orden, nombre,
          rutina_ejercicios (
            id, orden, series, repeticiones, descanso_seg,
            ejercicios ( id, nombre, video_id )
          )
        )
      `)
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setError('No pudimos cargar la rutina')
        } else {
          setRutina({ nombre: data.nombre, tipo: data.tipo, gym_id: data.gym_id })
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
    setDias((prev) => [...prev, { ...(data as Omit<Dia, 'rutina_ejercicios'>), rutina_ejercicios: [] }])
    setNombreNuevo('')
  }

  // El diseño resigna arrastrar un ejercicio de un día a otro justamente
  // porque se puede sacar y volver a agregar. Sin esto, un día agregado por
  // error se quedaba para siempre.
  const borrarDia = (dia: Dia) => {
    Alert.alert(
      'Borrar día',
      `¿Borrar "${dia.nombre}" y los ejercicios que tiene adentro?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            // El .select() no es decorativo: un delete que RLS niega no
            // devuelve error, devuelve cero filas. Sin mirar cuántas volvieron,
            // la pantalla borraría el día de la lista y mentiría.
            const { data, error } = await supabase
              .from('rutina_dias').delete().eq('id', dia.id).select('id')
            if (error || !data?.length) {
              Alert.alert('No pudimos borrar el día')
              return
            }
            setDias((prev) => prev.filter((d) => d.id !== dia.id))
          },
        },
      ],
    )
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

  const tomar = async () => {
    if (!rutina) return
    setTomando(true)
    const nuevaId = await tomarRutina(id, rutina.gym_id)
    setTomando(false)
    // replace y no push: la copia reemplaza a la plantilla en el historial,
    // así el botón de atrás vuelve a la lista y no a la plantilla que se
    // acaba de tomar.
    if (nuevaId) router.replace(`/(tabs)/rutinas/${nuevaId}`)
  }

  if (cargando) {
    return <View style={estilos.centrado}><ActivityIndicator /></View>
  }
  if (error || rutina === null) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.error}>{error ?? 'No encontramos esta rutina'}</Text>
      </View>
    )
  }

  // Una plantilla del catálogo se lee, no se edita: RLS solo deja escribirla
  // al entrenador o al admin. Ofrecerle al socio el armador era ofrecerle
  // botones que fallan siempre. Lo que sí puede hacer es tomarla.
  if (rutina.tipo === 'plantilla') {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: rutina.nombre }} />

        <ScrollView contentContainerStyle={estilos.lectura}>
          {dias.length === 0 && (
            <Text style={estilos.vacio}>Esta rutina todavía no tiene días.</Text>
          )}
          {dias.map((dia) => (
            <View key={dia.id} style={estilos.bloqueDia}>
              <Text style={estilos.tituloDia}>{dia.nombre}</Text>
              {[...dia.rutina_ejercicios]
                .sort((a, b) => a.orden - b.orden)
                .map((ej) => (
                  <View key={ej.id} style={estilos.filaLectura}>
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.nombre}>{ej.ejercicios?.nombre}</Text>
                      <Text style={estilos.sub}>
                        {ej.series}×{ej.repeticiones}
                        {ej.descanso_seg ? ` · ${ej.descanso_seg}s de descanso` : ''}
                      </Text>
                    </View>
                    {ej.ejercicios?.video_id && (
                      <Link href={`/(tabs)/ejercicios/${ej.ejercicios.id}`} asChild>
                        <Pressable hitSlop={8}>
                          <Text style={estilos.video}>▶</Text>
                        </Pressable>
                      </Link>
                    )}
                  </View>
                ))}
              {dia.rutina_ejercicios.length === 0 && (
                <Text style={estilos.sub}>Sin ejercicios.</Text>
              )}
            </View>
          ))}
        </ScrollView>

        <Pressable style={estilos.botonTomar} onPress={tomar} disabled={tomando}>
          <Text style={estilos.botonTomarTexto}>
            {tomando ? 'Agregando…' : 'Tomar esta rutina'}
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: rutina.nombre }} />

      <ReorderableList
        data={dias}
        keyExtractor={(d) => d.id}
        onReorder={reordenar}
        renderItem={({ item }) => <FilaDia dia={item} onBorrar={() => borrarDia(item)} />}
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
function FilaDia({ dia, onBorrar }: { dia: Dia; onBorrar: () => void }) {
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
  borrar: { color: '#b00', fontSize: 16, paddingHorizontal: 4 },
  nombre: { fontSize: 16 },
  sub: { color: '#777', fontSize: 13, marginTop: 2 },
  video: { fontSize: 18 },
  vacio: { textAlign: 'center', color: '#777', marginTop: 32, paddingHorizontal: 24 },
  lectura: { paddingBottom: 24 },
  bloqueDia: { paddingTop: 16 },
  tituloDia: { fontSize: 15, fontWeight: '600', paddingHorizontal: 16, paddingBottom: 6 },
  filaLectura: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
  },
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
  botonTomar: {
    backgroundColor: '#111', margin: 16, borderRadius: 8,
    padding: 14, alignItems: 'center',
  },
  botonTomarTexto: { color: '#fff' },
})
