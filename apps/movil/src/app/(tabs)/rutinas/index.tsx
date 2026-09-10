import { useCallback, useState } from 'react'
import {
  ActivityIndicator, Alert, FlatList, Pressable,
  StyleSheet, Text, View,
} from 'react-native'
import { Link, Stack, useFocusEffect, useRouter, type Href } from 'expo-router'
import { etiqueta, type NivelRutina, type ObjetivoRutina } from '@gym/core'
import { supabase } from '@/lib/supabase'

interface Rutina {
  id: string
  nombre: string
  objetivo: ObjetivoRutina
  nivel: NivelRutina
  asignada_por: string | null
  origen_id: string | null
  tipo: 'plantilla' | 'activa'
  rutina_dias: { id: string }[]
}

// La tarea 11 todavía no creó `/(tabs)/rutinas/[id]` ni `/(tabs)/rutinas/nueva`,
// así que el generador de rutas tipadas de Expo Router no los conoce todavía y
// una ruta literal no tipa. El cast es a propósito y no hace falta sacarlo
// cuando esos archivos existan: solo amplía el tipo, no cambia el destino.
function hrefRutina(id: string): Href {
  return `/(tabs)/rutinas/${id}` as Href
}
const HREF_NUEVA = '/(tabs)/rutinas/nueva' as Href

export default function Rutinas() {
  const router = useRouter()
  const [solapa, setSolapa] = useState<'mias' | 'catalogo'>('mias')
  const [mias, setMias] = useState<Rutina[]>([])
  const [catalogo, setCatalogo] = useState<Rutina[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // useFocusEffect y no useEffect: al volver del armador la lista tiene que
  // reflejar lo que se acaba de crear.
  useFocusEffect(
    useCallback(() => {
      let vivo = true
      setCargando(true)

      // RLS ya decide qué se ve: las plantillas del gimnasio y las rutinas
      // activas propias (o las que el entrenador armó y asignó). El filtro
      // por tipo acá es solo para separar las dos solapas, no un control de
      // acceso.
      supabase
        .from('rutinas')
        .select('id, nombre, objetivo, nivel, asignada_por, origen_id, tipo, rutina_dias(id)')
        .eq('estado', 'activa')
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (!vivo) return
          if (error) {
            setError('No pudimos cargar las rutinas')
          } else {
            const todas = (data ?? []) as Rutina[]
            setMias(todas.filter((r) => r.tipo === 'activa'))
            setCatalogo(todas.filter((r) => r.tipo === 'plantilla'))
          }
          setCargando(false)
        })

      return () => { vivo = false }
    }, []),
  )

  const tomar = async (plantillaId: string) => {
    const { data: membresia } = await supabase
      .from('memberships')
      .select('id')
      .order('created_at')
      .limit(1)
      .maybeSingle()

    if (!membresia) {
      Alert.alert('No pudimos identificar tu membresía', 'Probá cerrar sesión y volver a entrar.')
      return
    }

    const { data: nuevaId, error } = await supabase.rpc('tomar_rutina', {
      p_plantilla_id: plantillaId,
      p_propietario_id: membresia.id,
    })

    // 23505 = unique_violation: el índice único dice que ya tenés una copia
    // activa de esta plantilla. No es un error rojo — tocar dos veces, o
    // tocar con mala señal y reintentar, es algo razonable que hace la gente.
    if (error?.code === '23505') {
      Alert.alert('Ya tenés esta rutina', 'Está en "Mis rutinas".')
      return
    }
    if (error) {
      Alert.alert('No pudimos agregar la rutina', 'Probá de nuevo.')
      return
    }

    router.push(hrefRutina(nuevaId))
  }

  if (cargando) {
    return <View style={estilos.centrado}><ActivityIndicator /></View>
  }
  if (error) {
    return <View style={estilos.centrado}><Text style={estilos.error}>{error}</Text></View>
  }

  const visibles = solapa === 'mias' ? mias : catalogo

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Rutinas' }} />

      <View style={estilos.solapas}>
        <Solapa activa={solapa === 'mias'} texto="Mis rutinas"
          onPress={() => setSolapa('mias')} />
        <Solapa activa={solapa === 'catalogo'} texto="Catálogo del gym"
          onPress={() => setSolapa('catalogo')} />
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(x) => x.id}
        ListEmptyComponent={
          <Text style={estilos.vacio}>
            {solapa === 'mias'
              ? 'Todavía no tenés rutinas. Tomá una del catálogo o armate una.'
              : 'Tu gimnasio todavía no cargó rutinas.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={estilos.fila}>
            <Link href={hrefRutina(item.id)} asChild>
              <Pressable style={{ flex: 1 }}>
                <Text style={estilos.nombre}>{item.nombre}</Text>
                <Text style={estilos.sub}>
                  {etiqueta(item.objetivo)} · {etiqueta(item.nivel)} · {item.rutina_dias.length} días
                  {item.asignada_por ? ' · Te la asignó tu entrenador' : ''}
                </Text>
              </Pressable>
            </Link>
            {solapa === 'catalogo' && (
              <Pressable style={estilos.boton} onPress={() => tomar(item.id)}>
                <Text style={estilos.botonTexto}>Tomar</Text>
              </Pressable>
            )}
          </View>
        )}
      />

      <Link href={HREF_NUEVA} asChild>
        <Pressable style={estilos.flotante}>
          <Text style={estilos.botonTexto}>+ Crear rutina</Text>
        </Pressable>
      </Link>
    </View>
  )
}

function Solapa({ activa, texto, onPress }: {
  activa: boolean; texto: string; onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={[estilos.solapa, activa && estilos.solapaActiva]}>
      <Text style={activa ? estilos.solapaTextoActivo : estilos.solapaTexto}>{texto}</Text>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#b00' },
  solapas: { flexDirection: 'row', gap: 8, padding: 12 },
  solapa: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#eee' },
  solapaActiva: { backgroundColor: '#111' },
  solapaTexto: { color: '#333' },
  solapaTextoActivo: { color: '#fff' },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
  },
  nombre: { fontSize: 16 },
  sub: { color: '#777', fontSize: 13, marginTop: 2 },
  boton: { backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  botonTexto: { color: '#fff' },
  vacio: { textAlign: 'center', color: '#777', marginTop: 32, paddingHorizontal: 24 },
  flotante: {
    position: 'absolute', right: 16, bottom: 24,
    backgroundColor: '#111', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 14,
  },
})
