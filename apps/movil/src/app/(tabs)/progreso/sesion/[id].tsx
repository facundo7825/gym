import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { COLORES, ESPACIO, detalleSeries } from '@gym/core'
import { Fondo, Tarjeta, Texto } from '@/ui'
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
    return <Fondo><View style={estilos.centrado}><ActivityIndicator color={COLORES.cian} /></View></Fondo>
  }

  if (estado === 'error' || !detalle) {
    return (
      <Fondo>
        <View style={estilos.centrado}>
          <Texto tono="secundario" style={estilos.vacio}>Necesitás conexión para ver este entrenamiento.</Texto>
        </View>
      </Fondo>
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
    <Fondo>
      <ScrollView contentContainerStyle={estilos.lista}>
        <Stack.Screen options={{ title: fechaConDia(detalle.inicio) }} />

        <View style={estilos.encabezado}>
          <Texto variante="subtitulo">{detalle.rutina_dias?.nombre ?? 'Entrenamiento libre'}</Texto>
          <Texto tono="secundario">
            {detalle.fin ? duracion(detalle.inicio, detalle.fin) : 'Sin terminar'}
          </Texto>
        </View>

        {[...grupos.entries()].map(([ejercicioId, g]) => (
          <Tarjeta key={ejercicioId}>
            <Texto peso="semi">{g.nombre}</Texto>
            <Texto variante="chico" tono="secundario" numerico>
              {detalleSeries(g.series.map((s) => ({ peso_kg: Number(s.peso_kg), repeticiones: s.repeticiones })))}
            </Texto>
          </Tarjeta>
        ))}
      </ScrollView>
    </Fondo>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: ESPACIO.l },
  lista: { padding: ESPACIO.l, gap: ESPACIO.s },
  encabezado: { paddingBottom: ESPACIO.s },
  vacio: { textAlign: 'center' },
})
