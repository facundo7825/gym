import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { COLORES, ESPACIO, evolucionPorSesion, formatearKg, type FilaSerie, type PuntoEvolucion } from '@gym/core'
import { GraficoEvolucion } from '@/components/grafico-evolucion'
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'
import { misMembresias } from '@/lib/membresia'
import { Chip, Fondo, Tarjeta, Texto } from '@/ui'

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
    return <Fondo><View style={estilos.centrado}><ActivityIndicator color={COLORES.cian} /></View></Fondo>
  }

  if (estado === 'sin-conexion') {
    return (
      <Fondo>
        <View style={estilos.centrado}>
          <Texto tono="secundario" style={estilos.vacio}>Necesitás conexión para ver tu progreso.</Texto>
        </View>
      </Fondo>
    )
  }

  if (puntos.length === 0) {
    return (
      <Fondo>
        <View style={estilos.centrado}>
          <Stack.Screen options={{ title: nombre }} />
          <Texto tono="secundario" style={estilos.vacio}>Todavía no registraste este ejercicio.</Texto>
        </View>
      </Fondo>
    )
  }

  const mejorPeso = Math.max(...puntos.map((p) => p.pesoMax))
  const mejorVolumen = Math.max(...puntos.map((p) => p.volumen))
  const valores = puntos.map((p) => (vista === 'peso' ? p.pesoMax : p.volumen))

  return (
    <Fondo>
      <View style={estilos.pantalla}>
        <Stack.Screen options={{ title: nombre }} />

        <View style={estilos.resumen}>
          <Tarjeta style={estilos.marca}>
            <Texto variante="subtitulo" numerico>{formatearKg(mejorPeso)} kg</Texto>
            <Texto variante="mini" tono="secundario">mejor peso</Texto>
          </Tarjeta>
          <Tarjeta style={estilos.marca}>
            <Texto variante="subtitulo" numerico>{formatearKg(mejorVolumen)} kg</Texto>
            <Texto variante="mini" tono="secundario">mejor volumen</Texto>
          </Tarjeta>
        </View>

        <View style={estilos.selector}>
          <Chip texto="Peso máximo" activo={vista === 'peso'} onPress={() => setVista('peso')} />
          <Chip texto="Volumen" activo={vista === 'volumen'} onPress={() => setVista('volumen')} />
        </View>

        <Tarjeta>
          <GraficoEvolucion valores={valores} fechas={puntos.map((p) => p.fecha)} />
        </Tarjeta>

        {puntos.length === 1 && (
          <Texto tono="secundario" style={estilos.vacio}>Con una sesión más aparece la evolución.</Texto>
        )}
        <Texto variante="mini" tono="tenue">
          {vista === 'peso' ? 'El peso más alto de cada sesión.' : 'Peso × repeticiones, sumado por sesión.'}
          {' '}En dorado, los récords.
        </Texto>
      </View>
    </Fondo>
  )
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, padding: ESPACIO.l, gap: ESPACIO.m },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: ESPACIO.l },
  vacio: { textAlign: 'center' },
  resumen: { flexDirection: 'row', gap: ESPACIO.s },
  marca: { flex: 1 },
  selector: { flexDirection: 'row', gap: ESPACIO.s },
})
