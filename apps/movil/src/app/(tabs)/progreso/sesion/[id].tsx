import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { detalleSeries } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'
import { duracion, fechaConDia } from '@/lib/fechas'
import { misMembresias } from '@/lib/membresia'

interface SerieDeSesion {
  ejercicio_id: string
  numero_serie: number
  peso_kg: number
  repeticiones: number
  created_at: string
  ejercicios: { nombre: string } | null
}

interface Detalle {
  inicio: string
  fin: string | null
  rutina_dias: { nombre: string } | null
  series_registradas: SerieDeSesion[]
}

export default function SesionDelHistorial() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando')

  useEffect(() => {
    let vivo = true
    async function cargar() {
      // Filtra por las membresías propias: el personal puede leer las sesiones
      // de cualquier socio de su gimnasio.
      const ids = (await misMembresias()).map((m) => m.id)
      const r = await conLimite(
        supabase
          .from('sesiones')
          .select(`
            inicio, fin, rutina_dias ( nombre ),
            series_registradas ( ejercicio_id, numero_serie, peso_kg, repeticiones, created_at, ejercicios ( nombre ) )
          `)
          .eq('id', id)
          .in('membership_id', ids)
          .eq('series_registradas.completada', true)
          .maybeSingle(),
      )
      if (!vivo) return
      if (!r || r.error || !r.data) {
        setEstado('error')
        return
      }
      setDetalle(r.data as unknown as Detalle)
      setEstado('listo')
    }
    cargar().catch(() => { if (vivo) setEstado('error') })
    return () => { vivo = false }
  }, [id])

  if (estado === 'cargando') {
    return <View style={estilos.centrado}><ActivityIndicator /></View>
  }

  if (estado === 'error' || !detalle) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.vacio}>Necesitás conexión para ver este entrenamiento.</Text>
      </View>
    )
  }

  // Agrupadas por ejercicio, en el orden en que se hicieron.
  const ordenadas = [...detalle.series_registradas]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const grupos = new Map<string, { nombre: string; series: SerieDeSesion[] }>()
  for (const s of ordenadas) {
    const grupo = grupos.get(s.ejercicio_id)
    if (grupo) grupo.series.push(s)
    else grupos.set(s.ejercicio_id, { nombre: s.ejercicios?.nombre ?? 'Ejercicio', series: [s] })
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <Stack.Screen options={{ title: fechaConDia(detalle.inicio) }} />

      <View style={estilos.encabezado}>
        <Text style={estilos.titulo}>{detalle.rutina_dias?.nombre ?? 'Entrenamiento libre'}</Text>
        <Text style={estilos.sub}>
          {detalle.fin ? duracion(detalle.inicio, detalle.fin) : 'Sin terminar'}
        </Text>
      </View>

      {[...grupos.entries()].map(([ejercicioId, g]) => (
        <View key={ejercicioId} style={estilos.fila}>
          <Text style={estilos.nombre}>{g.nombre}</Text>
          <Text style={estilos.sub}>
            {detalleSeries(g.series.map((s) => ({ peso_kg: Number(s.peso_kg), repeticiones: s.repeticiones })))}
          </Text>
        </View>
      ))}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  encabezado: { padding: 16 },
  titulo: { fontSize: 20, fontWeight: '600' },
  fila: {
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
  },
  nombre: { fontSize: 16 },
  sub: { color: '#777', fontSize: 13, marginTop: 2 },
  vacio: { color: '#777', textAlign: 'center' },
})
