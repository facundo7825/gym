import { useCallback, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable,
  StyleSheet, Text, View,
} from 'react-native'
import { Link, Stack, useFocusEffect, useRouter } from 'expo-router'
import { etiqueta, type NivelRutina, type ObjetivoRutina } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { tomarRutina } from '@/lib/tomar-rutina'

interface Rutina {
  id: string
  gym_id: string
  nombre: string
  objetivo: ObjetivoRutina
  nivel: NivelRutina
  estado: 'activa' | 'archivada'
  asignada_por: string | null
  origen_id: string | null
  tipo: 'plantilla' | 'activa'
  rutina_dias: { id: string }[]
}

export default function Rutinas() {
  const router = useRouter()
  const [solapa, setSolapa] = useState<'mias' | 'catalogo'>('mias')
  const [archivadas, setArchivadas] = useState(false)
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
      //
      // No filtra por estado en la consulta: "Mis rutinas" tiene el filtro de
      // archivadas, así que las dos hacen falta. Del catálogo sí se sacan las
      // archivadas, que es lo que significa archivar una plantilla.
      supabase
        .from('rutinas')
        .select('id, gym_id, nombre, objetivo, nivel, estado, asignada_por, origen_id, tipo, rutina_dias(id)')
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (!vivo) return
          if (error) {
            setError('No pudimos cargar las rutinas')
          } else {
            const todas = (data ?? []) as Rutina[]
            setMias(todas.filter((r) => r.tipo === 'activa'))
            setCatalogo(todas.filter((r) => r.tipo === 'plantilla' && r.estado === 'activa'))
          }
          setCargando(false)
        })

      return () => { vivo = false }
    }, []),
  )

  const tomar = async (plantillaId: string, gymId: string) => {
    const nuevaId = await tomarRutina(plantillaId, gymId)
    if (nuevaId) router.push(`/(tabs)/rutinas/${nuevaId}`)
  }

  if (cargando) {
    return <View style={estilos.centrado}><ActivityIndicator /></View>
  }
  if (error) {
    return <View style={estilos.centrado}><Text style={estilos.error}>{error}</Text></View>
  }

  const visibles = solapa === 'mias'
    ? mias.filter((r) => (archivadas ? r.estado === 'archivada' : r.estado === 'activa'))
    : catalogo

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Rutinas' }} />

      <View style={estilos.solapas}>
        <Solapa activa={solapa === 'mias'} texto="Mis rutinas"
          onPress={() => setSolapa('mias')} />
        <Solapa activa={solapa === 'catalogo'} texto="Catálogo del gym"
          onPress={() => setSolapa('catalogo')} />
      </View>

      {solapa === 'mias' && (
        <View style={estilos.filtro}>
          <Pressable onPress={() => setArchivadas((v) => !v)} hitSlop={8}>
            <Text style={estilos.filtroTexto}>
              {archivadas ? '‹ Ver las activas' : 'Ver las archivadas ›'}
            </Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={visibles}
        keyExtractor={(x) => x.id}
        ListEmptyComponent={
          <Text style={estilos.vacio}>
            {solapa === 'catalogo'
              ? 'Tu gimnasio todavía no cargó rutinas.'
              : archivadas
                ? 'No tenés rutinas archivadas.'
                : 'Todavía no tenés rutinas. Tomá una del catálogo o armate una.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={estilos.fila}>
            <Link href={`/(tabs)/rutinas/${item.id}`} asChild>
              <Pressable style={{ flex: 1 }}>
                <Text style={estilos.nombre}>{item.nombre}</Text>
                <Text style={estilos.sub}>
                  {etiqueta(item.objetivo)} · {etiqueta(item.nivel)} · {item.rutina_dias.length} días
                  {item.asignada_por ? ' · Te la asignó tu entrenador' : ''}
                </Text>
              </Pressable>
            </Link>
            {solapa === 'catalogo' && (
              <Pressable style={estilos.boton} onPress={() => tomar(item.id, item.gym_id)}>
                <Text style={estilos.botonTexto}>Tomar</Text>
              </Pressable>
            )}
          </View>
        )}
      />

      <Link href="/(tabs)/rutinas/nueva" asChild>
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
  filtro: { paddingHorizontal: 16, paddingBottom: 8 },
  filtroTexto: { color: '#555', fontSize: 13 },
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
