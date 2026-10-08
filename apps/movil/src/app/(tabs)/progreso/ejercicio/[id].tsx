import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { evolucionPorSesion, formatearKg, type FilaSerie, type PuntoEvolucion } from '@gym/core'
import { GraficoEvolucion } from '@/components/grafico-evolucion'
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'
import { misMembresias } from '@/lib/membresia'

const VERDE = '#1b7f3b'
const AZUL = '#2b6cb0'

type Vista = 'peso' | 'volumen'

async function cargar(ejercicioId: string): Promise<{ nombre: string; puntos: PuntoEvolucion[] } | null> {
  const ids = (await misMembresias()).map((m) => m.id)

  // La agregación se hace acá y no en la base, y queda como lógica pura en
  // core. Con cinco series por sesión, un año son casi 800 filas: se pagina
  // para no chocar con el tope de PostgREST, que corta en silencio.
  const ejercicio = await conLimite(
    supabase.from('ejercicios').select('nombre').eq('id', ejercicioId).maybeSingle(),
  )
  if (!ejercicio || ejercicio.error) return null

  const TAMANO = 1000
  const series = []
  for (let desde = 0; ; desde += TAMANO) {
    const pagina = await conLimite(
      supabase
        .from('series_registradas')
        .select('sesion_id, peso_kg, repeticiones, completada, sesiones!inner ( inicio, membership_id )')
        .eq('ejercicio_id', ejercicioId)
        .eq('completada', true)
        .in('sesiones.membership_id', ids)
        .order('id')
        .range(desde, desde + TAMANO - 1),
    )
    if (!pagina || pagina.error) return null
    series.push(...pagina.data)
    if (pagina.data.length < TAMANO) break
  }

  const filas: FilaSerie[] = series.map((f) => ({
    sesion_id: f.sesion_id,
    inicio: f.sesiones.inicio,
    peso_kg: Number(f.peso_kg),
    repeticiones: f.repeticiones,
    completada: f.completada,
  }))

  return { nombre: ejercicio.data?.nombre ?? 'Ejercicio', puntos: evolucionPorSesion(filas) }
}

export default function EvolucionEjercicio() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [nombre, setNombre] = useState('')
  const [puntos, setPuntos] = useState<PuntoEvolucion[]>([])
  const [vista, setVista] = useState<Vista>('peso')
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'sin-conexion'>('cargando')

  useEffect(() => {
    let vivo = true
    cargar(id)
      .then((r) => {
        if (!vivo) return
        if (!r) {
          setEstado('sin-conexion')
          return
        }
        setNombre(r.nombre)
        setPuntos(r.puntos)
        setEstado('listo')
      })
      .catch(() => { if (vivo) setEstado('sin-conexion') })
    return () => { vivo = false }
  }, [id])

  if (estado === 'cargando') {
    return <View style={estilos.centrado}><ActivityIndicator /></View>
  }

  if (estado === 'sin-conexion') {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.vacio}>Necesitás conexión para ver tu progreso.</Text>
      </View>
    )
  }

  if (puntos.length === 0) {
    return (
      <View style={estilos.centrado}>
        <Stack.Screen options={{ title: nombre }} />
        <Text style={estilos.vacio}>Todavía no registraste este ejercicio.</Text>
      </View>
    )
  }

  const mejorPeso = Math.max(...puntos.map((p) => p.pesoMax))
  const mejorVolumen = Math.max(...puntos.map((p) => p.volumen))
  const valores = puntos.map((p) => (vista === 'peso' ? p.pesoMax : p.volumen))

  return (
    <View style={estilos.pantalla}>
      <Stack.Screen options={{ title: nombre }} />

      <View style={estilos.resumen}>
        <View style={estilos.marca}>
          <Text style={estilos.marcaValor}>{formatearKg(mejorPeso)} kg</Text>
          <Text style={estilos.marcaEtiqueta}>mejor peso</Text>
        </View>
        <View style={estilos.marca}>
          <Text style={estilos.marcaValor}>{formatearKg(mejorVolumen)} kg</Text>
          <Text style={estilos.marcaEtiqueta}>mejor volumen</Text>
        </View>
      </View>

      <View style={estilos.selector}>
        <Opcion texto="Peso máximo" activa={vista === 'peso'} onPress={() => setVista('peso')} />
        <Opcion texto="Volumen" activa={vista === 'volumen'} onPress={() => setVista('volumen')} />
      </View>

      <GraficoEvolucion
        valores={valores}
        fechas={puntos.map((p) => p.fecha)}
        color={vista === 'peso' ? VERDE : AZUL}
      />

      {puntos.length === 1 && (
        <Text style={estilos.vacio}>Con una sesión más aparece la evolución.</Text>
      )}
      <Text style={estilos.leyenda}>
        {vista === 'peso' ? 'El peso más alto de cada sesión.' : 'Peso × repeticiones, sumado por sesión.'}
        {' '}En dorado, los récords.
      </Text>
    </View>
  )
}

function Opcion({ texto, activa, onPress }: { texto: string; activa: boolean; onPress: () => void }) {
  return (
    <Pressable style={[estilos.opcion, activa && estilos.opcionActiva]} onPress={onPress}>
      <Text style={activa ? estilos.opcionTextoActiva : estilos.opcionTexto}>{texto}</Text>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, padding: 16, gap: 12, backgroundColor: '#fff' },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  vacio: { color: '#777', textAlign: 'center' },
  resumen: { flexDirection: 'row', gap: 8 },
  marca: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#f2f2f2' },
  marcaValor: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  marcaEtiqueta: { fontSize: 12, color: '#777' },
  selector: { flexDirection: 'row', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, overflow: 'hidden' },
  opcion: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  opcionActiva: { backgroundColor: '#111' },
  opcionTexto: { color: '#333' },
  opcionTextoActiva: { color: '#fff', fontWeight: '600' },
  leyenda: { color: '#777', fontSize: 12 },
})
