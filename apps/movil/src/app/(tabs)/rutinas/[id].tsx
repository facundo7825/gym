import { useCallback, useState } from 'react'
import {
  ActivityIndicator, Alert, Pressable, ScrollView,
  StyleSheet, View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Link, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import ReorderableList, {
  reorderItems, useReorderableDrag, type ReorderableListReorderEvent,
} from 'react-native-reorderable-list'
import { COLORES, ESPACIO } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { tomarRutina } from '@/lib/tomar-rutina'
import { Boton, Campo, Fondo, Tarjeta, Texto } from '@/ui'

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
    return <Fondo><View style={estilos.centrado}><ActivityIndicator color={COLORES.cian} /></View></Fondo>
  }
  if (error || rutina === null) {
    return (
      <Fondo>
        <View style={estilos.centrado}>
          <Texto tono="rechazo">{error ?? 'No encontramos esta rutina'}</Texto>
        </View>
      </Fondo>
    )
  }

  // Una plantilla del catálogo se lee, no se edita: RLS solo deja escribirla
  // al entrenador o al admin. Ofrecerle al socio el armador era ofrecerle
  // botones que fallan siempre. Lo que sí puede hacer es tomarla.
  if (rutina.tipo === 'plantilla') {
    return (
      <Fondo>
        <Stack.Screen options={{ title: rutina.nombre }} />

        <ScrollView contentContainerStyle={estilos.lectura}>
          {dias.length === 0 && (
            <Texto tono="secundario" style={estilos.vacio}>Esta rutina todavía no tiene días.</Texto>
          )}
          {dias.map((dia) => (
            <View key={dia.id} style={estilos.bloqueDia}>
              <Texto peso="semi">{dia.nombre}</Texto>
              {[...dia.rutina_ejercicios]
                .sort((a, b) => a.orden - b.orden)
                .map((ej) => (
                  <Tarjeta key={ej.id} style={estilos.filaLectura}>
                    <View style={{ flex: 1 }}>
                      <Texto peso="semi">{ej.ejercicios?.nombre}</Texto>
                      <Texto variante="chico" tono="secundario" numerico>
                        {ej.series}×{ej.repeticiones}
                        {ej.descanso_seg ? ` · ${ej.descanso_seg}s de descanso` : ''}
                      </Texto>
                    </View>
                    {ej.ejercicios?.video_id && (
                      <Link href={`/(tabs)/ejercicios/${ej.ejercicios.id}`} asChild>
                        <Pressable hitSlop={10}>
                          <Ionicons name="play-circle" size={26} color={COLORES.cian} />
                        </Pressable>
                      </Link>
                    )}
                  </Tarjeta>
                ))}
              {dia.rutina_ejercicios.length === 0 && (
                <Texto variante="chico" tono="secundario">Sin ejercicios.</Texto>
              )}
            </View>
          ))}
        </ScrollView>

        <Boton
          titulo={tomando ? 'Agregando…' : 'Tomar esta rutina'}
          onPress={tomar} deshabilitado={tomando} style={estilos.botonTomar}
        />
      </Fondo>
    )
  }

  return (
    <Fondo>
      <Stack.Screen options={{ title: rutina.nombre }} />

      <ReorderableList
        data={dias}
        keyExtractor={(d) => d.id}
        onReorder={reordenar}
        contentContainerStyle={estilos.lista}
        renderItem={({ item }) => <FilaDia dia={item} onBorrar={() => borrarDia(item)} />}
        ListEmptyComponent={
          <Texto tono="secundario" style={estilos.vacio}>Todavía no agregaste días.</Texto>
        }
      />

      <View style={estilos.alta}>
        <Campo
          style={{ flex: 1 }} placeholder="Día 4 — Hombros"
          value={nombreNuevo} onChangeText={setNombreNuevo}
        />
        <Boton titulo={agregando ? '…' : '+'} onPress={agregarDia} deshabilitado={agregando} />
      </View>

      <Boton variante="peligro" titulo="Archivar rutina" onPress={archivar} style={estilos.botonArchivar} />
    </Fondo>
  )
}

// Componente aparte: useReorderableDrag solo se puede usar dentro de un ítem
// de la lista.
function FilaDia({ dia, onBorrar }: { dia: Dia; onBorrar: () => void }) {
  const drag = useReorderableDrag()

  return (
    <View style={estilos.separacion}>
      <Tarjeta style={estilos.fila}>
        <Pressable onLongPress={drag} hitSlop={8} style={estilos.agarre}>
          <Ionicons name="reorder-three" size={22} color={COLORES.textoTenue} />
        </Pressable>
        <Link href={`/(tabs)/rutinas/dia/${dia.id}`} asChild>
          <Pressable style={{ flex: 1 }}>
            <Texto peso="semi">{dia.nombre}</Texto>
          </Pressable>
        </Link>
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
  lectura: { padding: ESPACIO.l, gap: ESPACIO.s },
  bloqueDia: { paddingTop: ESPACIO.s, gap: ESPACIO.s },
  filaLectura: { flexDirection: 'row', alignItems: 'center', gap: ESPACIO.m },
  alta: { flexDirection: 'row', gap: ESPACIO.s, paddingHorizontal: ESPACIO.l, paddingVertical: ESPACIO.m },
  botonArchivar: { marginHorizontal: ESPACIO.l, marginBottom: ESPACIO.l },
  botonTomar: { margin: ESPACIO.l },
})
