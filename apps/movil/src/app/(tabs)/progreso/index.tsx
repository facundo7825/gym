import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Link, Stack, useFocusEffect } from 'expo-router'
import { formatearKg, fusionarMarcas, type Marcas } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'
import { duracion, fechaConDia } from '@/lib/fechas'
import { misMembresias } from '@/lib/membresia'

interface Record_ {
  ejercicio_id: string
  nombre: string
  mejor_peso_kg: number
  mejor_volumen_kg: number
}

interface SesionDelHistorial {
  id: string
  inicio: string
  fin: string | null
  rutina_dias: { nombre: string } | null
  series_registradas: { count: number }[]
}

type Datos = { records: Record_[]; historial: SesionDelHistorial[] }

/**
 * Todo requiere señal. `null` = no la hay —o no llegó a tiempo—, y la pantalla
 * lo dice en vez de quedar vacía.
 */
async function cargar(): Promise<Datos | null> {
  const ids = (await misMembresias()).map((m) => m.id)
  if (ids.length === 0) return null

  // Filtra por las membresías propias y no se apoya solo en la RLS: el
  // personal del gimnasio puede leer las de todos los socios.
  const [marcas, sesiones] = await Promise.all([
    conLimite(
      supabase
        .from('mejores_marcas')
        .select('ejercicio_id, mejor_peso_kg, mejor_volumen_kg')
        .in('membership_id', ids),
    ),
    conLimite(
      supabase
        .from('sesiones')
        .select('id, inicio, fin, rutina_dias ( nombre ), series_registradas ( count )')
        .in('membership_id', ids)
        .eq('series_registradas.completada', true)
        .order('inicio', { ascending: false })
        .limit(50),
    ),
  ])
  if (!marcas || marcas.error || !sesiones || sesiones.error) return null

  // Con membresía en dos gimnasios, el mismo ejercicio llega dos veces: queda
  // el mejor de los dos.
  let porEjercicio: Marcas = {}
  for (const m of marcas.data) {
    if (!m.ejercicio_id) continue
    porEjercicio = fusionarMarcas(porEjercicio, {
      [m.ejercicio_id]: {
        mejor_peso_kg: Number(m.mejor_peso_kg ?? 0),
        mejor_volumen_kg: Number(m.mejor_volumen_kg ?? 0),
      },
    })
  }

  const ejercicioIds = Object.keys(porEjercicio)
  let nombreDe = new Map<string, string>()
  if (ejercicioIds.length) {
    const nombres = await conLimite(supabase.from('ejercicios').select('id, nombre').in('id', ejercicioIds))
    if (!nombres || nombres.error) return null
    nombreDe = new Map(nombres.data.map((e) => [e.id, e.nombre]))
  }

  const records = Object.entries(porEjercicio)
    .filter(([id]) => nombreDe.has(id))
    .map(([id, m]) => ({ ejercicio_id: id, nombre: nombreDe.get(id)!, ...m }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return { records, historial: sesiones.data as unknown as SesionDelHistorial[] }
}

export default function Progreso() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'sin-conexion'>('cargando')

  useFocusEffect(
    useCallback(() => {
      let vivo = true
      setEstado('cargando')
      cargar()
        .then((r) => {
          if (!vivo) return
          setDatos(r)
          setEstado(r ? 'listo' : 'sin-conexion')
        })
        .catch(() => { if (vivo) setEstado('sin-conexion') })
      return () => { vivo = false }
    }, []),
  )

  if (estado === 'cargando') {
    return (
      <View style={estilos.centrado}>
        <Stack.Screen options={{ title: 'Progreso' }} />
        <ActivityIndicator />
      </View>
    )
  }

  if (estado === 'sin-conexion' || !datos) {
    return (
      <View style={estilos.centrado}>
        <Stack.Screen options={{ title: 'Progreso' }} />
        <Text style={estilos.vacio}>Necesitás conexión para ver tu progreso.</Text>
        <Text style={estilos.vacio}>Lo que entrenes sin señal se guarda igual y aparece acá después.</Text>
      </View>
    )
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      <Stack.Screen options={{ title: 'Progreso' }} />

      <Text style={estilos.seccion}>Récords personales</Text>
      {datos.records.length === 0 && (
        <Text style={estilos.vacio}>Tus mejores marcas aparecen acá después de tu primer entrenamiento.</Text>
      )}
      {datos.records.map((r) => (
        <Link key={r.ejercicio_id} href={`/(tabs)/progreso/ejercicio/${r.ejercicio_id}`} asChild>
          <Pressable style={estilos.fila}>
            <Text style={estilos.nombre}>{r.nombre}</Text>
            <Text style={estilos.sub}>
              {formatearKg(r.mejor_peso_kg)}kg · volumen {formatearKg(r.mejor_volumen_kg)}kg
            </Text>
          </Pressable>
        </Link>
      ))}

      <Text style={estilos.seccion}>Historial</Text>
      {datos.historial.length === 0 && (
        <Text style={estilos.vacio}>Todavía no registraste ningún entrenamiento.</Text>
      )}
      {datos.historial.map((s) => (
        <Link key={s.id} href={`/(tabs)/progreso/sesion/${s.id}`} asChild>
          <Pressable style={estilos.fila}>
            <Text style={estilos.nombre}>{fechaConDia(s.inicio)}</Text>
            <Text style={estilos.sub}>
              {s.rutina_dias?.nombre ?? 'Entrenamiento libre'}
              {' · '}{s.series_registradas[0]?.count ?? 0} series
              {' · '}{s.fin ? duracion(s.inicio, s.fin) : 'sin terminar'}
            </Text>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  seccion: { fontSize: 13, fontWeight: '600', color: '#777', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 },
  fila: {
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
  },
  nombre: { fontSize: 16 },
  sub: { color: '#777', fontSize: 13, marginTop: 2 },
  vacio: { color: '#777', paddingHorizontal: 16, paddingVertical: 8, textAlign: 'center' },
})
