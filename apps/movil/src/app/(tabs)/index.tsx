import { useCallback, useState } from 'react'
import {
  ActivityIndicator, Button, FlatList, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native'
import { Link, useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { diaAMostrar } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { cerrarSesion } from '@/lib/cerrar-sesion'

const CLAVE_ULTIMO_DIA = 'hoy.ultimoDia'

interface EjercicioDelDia {
  id: string
  orden: number
  series: number
  repeticiones: string
  descanso_seg: number | null
  ejercicios: { id: string; nombre: string; video_id: string | null } | null
}

interface DiaDeRutina {
  id: string
  orden: number
  nombre: string
  rutina_ejercicios: EjercicioDelDia[]
}

interface RutinaActiva {
  id: string
  nombre: string
  fecha_inicio: string | null
  created_at: string
  rutina_dias: DiaDeRutina[]
}

export default function Hoy() {
  const [rutina, setRutina] = useState<RutinaActiva | null>(null)
  const [diaId, setDiaId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // useFocusEffect y no useEffect: si el socio borra el día que estaba viendo
  // desde el armador y vuelve a esta pestaña, tiene que verse el cambio.
  useFocusEffect(
    useCallback(() => {
      let vivo = true
      setCargando(true)

      Promise.all([
        supabase
          .from('rutinas')
          .select(`
            id, nombre, fecha_inicio, created_at,
            rutina_dias (
              id, orden, nombre,
              rutina_ejercicios (
                id, orden, series, repeticiones, descanso_seg,
                ejercicios ( id, nombre, video_id )
              )
            )
          `)
          .eq('tipo', 'activa')
          .eq('estado', 'activa'),
        AsyncStorage.getItem(CLAVE_ULTIMO_DIA),
      ]).then(([{ data, error }, ultimoId]) => {
        if (!vivo) return

        if (error) {
          setError('No pudimos cargar tu rutina')
          setCargando(false)
          return
        }

        // fecha_inicio es opcional —el armador no obliga a completarla, y en
        // una plantilla no significa nada— así que ordenar solo por esa
        // columna deja sin resolver justo el caso más común: la rutina que el
        // socio se acaba de armar y todavía no tiene fecha. Se cae a
        // created_at cuando falta.
        const activas = [...((data ?? []) as RutinaActiva[])].sort((a, b) =>
          (b.fecha_inicio ?? b.created_at).localeCompare(a.fecha_inicio ?? a.created_at))
        const actual = activas[0] ?? null

        setRutina(actual)
        setDiaId(actual ? (diaAMostrar(actual.rutina_dias, ultimoId)?.id ?? null) : null)
        setCargando(false)
      }).catch(() => {
        // Cubre también un AsyncStorage que falla: sin esto, el socio queda
        // en la pantalla de carga sin ningún botón para salir.
        if (!vivo) return
        setError('No pudimos cargar tu rutina')
        setCargando(false)
      })

      return () => { vivo = false }
    }, []),
  )

  const elegirDia = (id: string) => {
    setDiaId(id)
    AsyncStorage.setItem(CLAVE_ULTIMO_DIA, id)
  }

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator />
        <Button title="Cerrar sesión" onPress={() => void cerrarSesion()} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.error}>{error}</Text>
        <Button title="Cerrar sesión" onPress={() => void cerrarSesion()} />
      </View>
    )
  }

  if (!rutina) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.vacio}>Todavía no tenés una rutina.</Text>
        <Link href="/(tabs)/rutinas" asChild>
          <Pressable>
            <Text style={estilos.enlace}>Mirá el catálogo de tu gimnasio.</Text>
          </Pressable>
        </Link>
        <Button title="Cerrar sesión" onPress={() => void cerrarSesion()} />
      </View>
    )
  }

  const dias = [...rutina.rutina_dias].sort((a, b) => a.orden - b.orden)
  const dia = dias.find((d) => d.id === diaId) ?? null
  const ejercicios = dia
    ? [...dia.rutina_ejercicios].sort((a, b) => a.orden - b.orden)
    : []

  return (
    <View style={{ flex: 1 }}>
      <View style={estilos.encabezado}>
        <Text style={estilos.titulo}>{rutina.nombre}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={estilos.filtros} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        {dias.map((d) => (
          <Chip key={d.id} activo={d.id === diaId} texto={d.nombre}
            onPress={() => elegirDia(d.id)} />
        ))}
      </ScrollView>

      <FlatList
        data={ejercicios}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <FilaEjercicio ejercicio={item} />}
        ListEmptyComponent={
          <Text style={estilos.vacio}>Este día todavía no tiene ejercicios.</Text>
        }
      />

      <Button title="Cerrar sesión" onPress={() => void cerrarSesion()} />
    </View>
  )
}

// Modo lectura: sin agarre de reordenar ni acceso al armador, a diferencia de
// la pantalla equivalente dentro de Rutinas.
function FilaEjercicio({ ejercicio }: { ejercicio: EjercicioDelDia }) {
  return (
    <View style={estilos.fila}>
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
    </View>
  )
}

function Chip({ activo, texto, onPress }: {
  activo: boolean; texto: string; onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={[estilos.chip, activo && estilos.chipActivo]}>
      <Text style={activo ? estilos.chipTextoActivo : estilos.chipTexto}>{texto}</Text>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  error: { color: '#b00' },
  encabezado: { padding: 16, paddingBottom: 8 },
  titulo: { fontSize: 22, fontWeight: '600' },
  filtros: { flexGrow: 0, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: '#eee',
  },
  chipActivo: { backgroundColor: '#111' },
  chipTexto: { color: '#333' },
  chipTextoActivo: { color: '#fff' },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
    backgroundColor: '#fff',
  },
  nombre: { fontSize: 16 },
  sub: { color: '#777', fontSize: 13, marginTop: 2 },
  video: { fontSize: 18 },
  vacio: { textAlign: 'center', color: '#777', marginTop: 32, paddingHorizontal: 24 },
  enlace: { textAlign: 'center', color: '#111', fontWeight: '600', textDecorationLine: 'underline' },
})
