import { useEffect, useState } from 'react'
import { Button, StyleSheet, Text, View } from 'react-native'
import { supabase } from '@/lib/supabase'

export default function Hoy() {
  const [gym, setGym] = useState<string | null>(null)
  const [rol, setRol] = useState<string | null>(null)

  useEffect(() => {
    // limit(1) y no single(): ver la nota del layout del panel. Una persona
    // puede pertenecer a más de un gimnasio.
    supabase
      .from('memberships')
      .select('rol, gyms(nombre)')
      .order('created_at')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setGym(data?.gyms?.nombre ?? null)
        setRol(data?.rol ?? null)
      })
  }, [])

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.titulo}>{gym ?? 'Sin gimnasio asignado'}</Text>
      {rol && <Text style={estilos.sub}>Tu rol: {rol}</Text>}
      <Button title="Cerrar sesión" onPress={() => supabase.auth.signOut()} />
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  titulo: { fontSize: 24, fontWeight: '600' },
  sub: { color: '#666' },
})
