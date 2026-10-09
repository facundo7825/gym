import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import {
  COLORES, EQUIPAMIENTOS, ESPACIO, GRUPOS_MUSCULARES, etiqueta, filtrarEjercicios,
  type Equipamiento, type GrupoMuscular,
} from '@gym/core'
import { supabase } from '@/lib/supabase'
import { Campo, Chip, Tarjeta, Texto } from '@/ui'

export interface EjercicioDelCatalogo {
  id: string
  nombre: string
  grupo_muscular: GrupoMuscular
  equipamiento: Equipamiento
  gym_id: string | null
  video_id: string | null
}

/**
 * El buscador de la etapa 1, con sus tres filtros. Lo usan la pestaña
 * Ejercicios, el armador de rutinas y la pantalla de sesión; cada una decide
 * qué pasa al tocar un ejercicio.
 */
export function BuscadorEjercicios({ onElegir }: {
  onElegir: (ejercicio: EjercicioDelCatalogo) => void
}) {
  const [ejercicios, setEjercicios] = useState<EjercicioDelCatalogo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [grupo, setGrupo] = useState<GrupoMuscular | null>(null)
  const [equipo, setEquipo] = useState<Equipamiento | null>(null)
  const [soloMiGym, setSoloMiGym] = useState(false)

  useEffect(() => {
    // RLS ya limita esto al catálogo global más los del gimnasio del socio.
    supabase
      .from('ejercicios')
      .select('id, nombre, grupo_muscular, equipamiento, gym_id, video_id')
      .order('nombre')
      .then(({ data, error }) => {
        if (error) setError('No pudimos cargar los ejercicios')
        else setEjercicios((data ?? []) as EjercicioDelCatalogo[])
        setCargando(false)
      })
  }, [])

  // El filtrado vive en @gym/core para poder probarlo: acá adentro solo se
  // verificaría a mano, tocando la app.
  const visibles = useMemo(
    () => filtrarEjercicios(ejercicios, { busqueda, grupo, equipo, soloMiGym }) as EjercicioDelCatalogo[],
    [ejercicios, busqueda, grupo, equipo, soloMiGym],
  )

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator color={COLORES.cian} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={estilos.centrado}>
        <Texto tono="rechazo">{error}</Texto>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={estilos.cajaBuscador}>
        <Campo
          placeholder="Buscar ejercicio" value={busqueda} onChangeText={setBusqueda}
          style={estilos.buscador}
        />
        <View style={estilos.lupa} pointerEvents="none">
          <Ionicons name="search" size={18} color={COLORES.textoTenue} />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={estilos.filtros} contentContainerStyle={estilos.contenidoFiltros}>
        <Chip activo={grupo === null} texto="Todos" onPress={() => setGrupo(null)} />
        {GRUPOS_MUSCULARES.map((g) => (
          <Chip key={g} activo={grupo === g} texto={etiqueta(g)}
            onPress={() => setGrupo(grupo === g ? null : g)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={estilos.filtros} contentContainerStyle={estilos.contenidoFiltros}>
        <Chip activo={soloMiGym} texto="Solo lo que hay acá"
          onPress={() => setSoloMiGym((v) => !v)} />
        {EQUIPAMIENTOS.map((eq) => (
          <Chip key={eq} activo={equipo === eq} texto={etiqueta(eq)}
            onPress={() => setEquipo(equipo === eq ? null : eq)} />
        ))}
      </ScrollView>

      <FlatList
        data={visibles}
        keyExtractor={(x) => x.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: ESPACIO.l, gap: ESPACIO.s }}
        ListEmptyComponent={
          <Texto tono="secundario" style={{ textAlign: 'center', marginTop: ESPACIO.xl }}>
            No encontramos ejercicios con esos filtros.
          </Texto>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => onElegir(item)}>
            <Tarjeta style={estilos.fila}>
              <View style={{ flex: 1 }}>
                <Texto peso="semi">{item.nombre}</Texto>
                <Texto variante="chico" tono="secundario">
                  {etiqueta(item.grupo_muscular)}
                  {item.gym_id === null ? ' · Catálogo general' : ' · De tu gimnasio'}
                </Texto>
              </View>
              {item.video_id && <Ionicons name="play-circle" size={26} color={COLORES.cian} />}
            </Tarjeta>
          </Pressable>
        )}
      />
    </View>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cajaBuscador: { margin: ESPACIO.l, marginBottom: ESPACIO.s, justifyContent: 'center' },
  buscador: { paddingRight: ESPACIO.xl + ESPACIO.l },
  lupa: { position: 'absolute', right: ESPACIO.l },
  filtros: { flexGrow: 0 },
  contenidoFiltros: { gap: ESPACIO.s, paddingHorizontal: ESPACIO.l, paddingVertical: ESPACIO.xs },
  fila: { flexDirection: 'row', alignItems: 'center', gap: ESPACIO.m },
})
