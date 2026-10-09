import { useCallback, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable,
  StyleSheet, View,
} from 'react-native'
import { Link, Stack, useFocusEffect, useRouter } from 'expo-router'
import { COLORES, ESPACIO, TOQUE_MINIMO, etiqueta, type NivelRutina, type ObjetivoRutina } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { tomarRutina } from '@/lib/tomar-rutina'
import { Boton, Chip, Fondo, Tarjeta, Texto } from '@/ui'

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
    return <Fondo><View style={estilos.centrado}><ActivityIndicator color={COLORES.cian} /></View></Fondo>
  }
  if (error) {
    return <Fondo><View style={estilos.centrado}><Texto tono="rechazo">{error}</Texto></View></Fondo>
  }

  const visibles = solapa === 'mias'
    ? mias.filter((r) => (archivadas ? r.estado === 'archivada' : r.estado === 'activa'))
    : catalogo

  return (
    <Fondo>
      <Stack.Screen options={{ title: 'Rutinas' }} />

      <View style={estilos.solapas}>
        <Chip activo={solapa === 'mias'} texto="Mis rutinas"
          onPress={() => setSolapa('mias')} />
        <Chip activo={solapa === 'catalogo'} texto="Catálogo del gym"
          onPress={() => setSolapa('catalogo')} />
      </View>

      {solapa === 'mias' && (
        <View style={estilos.filtro}>
          <Pressable onPress={() => setArchivadas((v) => !v)} hitSlop={14}>
            <Texto variante="chico" peso="semi" tono="cian">
              {archivadas ? '‹ Ver las activas' : 'Ver las archivadas ›'}
            </Texto>
          </Pressable>
        </View>
      )}

      <FlatList
        data={visibles}
        keyExtractor={(x) => x.id}
        contentContainerStyle={estilos.lista}
        ListEmptyComponent={
          <Texto tono="secundario" style={estilos.vacio}>
            {solapa === 'catalogo'
              ? 'Tu gimnasio todavía no cargó rutinas.'
              : archivadas
                ? 'No tenés rutinas archivadas.'
                : 'Todavía no tenés rutinas. Tomá una del catálogo o armate una.'}
          </Texto>
        }
        renderItem={({ item }) => (
          <Tarjeta style={estilos.fila}>
            <Link href={`/(tabs)/rutinas/${item.id}`} asChild>
              <Pressable style={{ flex: 1, minHeight: TOQUE_MINIMO, justifyContent: 'center' }}>
                <Texto peso="semi">{item.nombre}</Texto>
                <Texto variante="chico" tono="secundario">
                  {etiqueta(item.objetivo)} · {etiqueta(item.nivel)} · {item.rutina_dias.length} días
                  {item.asignada_por ? ' · Te la asignó tu entrenador' : ''}
                </Texto>
              </Pressable>
            </Link>
            {solapa === 'catalogo' && (
              <Boton variante="secundario" titulo="Tomar" onPress={() => tomar(item.id, item.gym_id)} />
            )}
          </Tarjeta>
        )}
      />

      <Boton
        titulo="+ Crear rutina" onPress={() => router.push('/(tabs)/rutinas/nueva')}
        style={estilos.flotante}
      />
    </Fondo>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  solapas: { flexDirection: 'row', gap: ESPACIO.s, padding: ESPACIO.m },
  filtro: { paddingHorizontal: ESPACIO.l, paddingBottom: ESPACIO.s },
  lista: { padding: ESPACIO.l, gap: ESPACIO.s, paddingBottom: TOQUE_MINIMO * 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: ESPACIO.m },
  vacio: { textAlign: 'center', marginTop: ESPACIO.xl, paddingHorizontal: ESPACIO.xl },
  flotante: { position: 'absolute', right: ESPACIO.l, bottom: ESPACIO.xl },
})
