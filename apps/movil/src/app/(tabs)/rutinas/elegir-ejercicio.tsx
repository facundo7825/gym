import { useState } from 'react'
import {
  Alert, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { BuscadorEjercicios, type EjercicioDelCatalogo } from '@/components/buscador-ejercicios'
import { supabase } from '@/lib/supabase'

type Ejercicio = EjercicioDelCatalogo

// El buscador es el compartido; acá solo cambia qué pasa al tocar una fila: en
// vez de navegar al detalle, abre los campos de alta.
export default function ElegirEjercicio() {
  const { diaId } = useLocalSearchParams<{ diaId: string }>()
  const router = useRouter()
  const [seleccionado, setSeleccionado] = useState<Ejercicio | null>(null)

  return (
    <View style={{ flex: 1 }}>
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

const estilos = StyleSheet.create({
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
