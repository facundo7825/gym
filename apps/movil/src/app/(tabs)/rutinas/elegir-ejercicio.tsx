import { useState } from 'react'
import { Alert, Modal, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { BuscadorEjercicios, type EjercicioDelCatalogo } from '@/components/buscador-ejercicios'
import { COLORES, ESPACIO, RADIOS } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { Boton, Campo, Fondo, Texto } from '@/ui'

type Ejercicio = EjercicioDelCatalogo

// El buscador es el compartido; acá solo cambia qué pasa al tocar una fila: en
// vez de navegar al detalle, abre los campos de alta.
export default function ElegirEjercicio() {
  const { diaId } = useLocalSearchParams<{ diaId: string }>()
  const router = useRouter()
  const [seleccionado, setSeleccionado] = useState<Ejercicio | null>(null)

  return (
    <Fondo>
      <Stack.Screen options={{ title: 'Agregar ejercicio' }} />

      <BuscadorEjercicios onElegir={setSeleccionado} />

      {seleccionado && (
        <AltaEjercicio
          ejercicio={seleccionado}
          diaId={diaId}
          onCancelar={() => setSeleccionado(null)}
          onAgregado={() => router.back()}
        />
      )}
    </Fondo>
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
          <Texto variante="grande" style={estilos.tituloModal}>{ejercicio.nombre}</Texto>

          <Texto variante="chico" tono="secundario" style={estilos.etiquetaCampo}>Series</Texto>
          <Campo numerico value={series} onChangeText={setSeries}
            keyboardType="number-pad" />

          <Texto variante="chico" tono="secundario" style={estilos.etiquetaCampo}>Repeticiones</Texto>
          <Campo numerico value={repeticiones} onChangeText={setRepeticiones}
            placeholder="8-12" />

          <Texto variante="chico" tono="secundario" style={estilos.etiquetaCampo}>Descanso (segundos)</Texto>
          <Campo numerico value={descanso} onChangeText={setDescanso}
            keyboardType="number-pad" />

          <View style={estilos.accionesModal}>
            <Boton variante="secundario" titulo="Cancelar" onPress={onCancelar}
              deshabilitado={guardando} style={{ flex: 1 }} />
            <Boton titulo={guardando ? 'Agregando…' : 'Agregar'} onPress={agregar}
              deshabilitado={guardando} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  fondoModal: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORES.velo },
  hoja: {
    backgroundColor: COLORES.fondo,
    borderTopLeftRadius: RADIOS.enorme, borderTopRightRadius: RADIOS.enorme,
    borderTopWidth: 1, borderColor: COLORES.superficieBorde,
    padding: ESPACIO.xl, gap: ESPACIO.xs,
  },
  tituloModal: { marginBottom: ESPACIO.s },
  etiquetaCampo: { marginTop: ESPACIO.s },
  accionesModal: { flexDirection: 'row', gap: ESPACIO.s, marginTop: ESPACIO.l },
})
