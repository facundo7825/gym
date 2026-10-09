import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import {
  Stack,
  ThemeProvider,
  router,
  useSegments,
} from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { useFonts, Sora_400Regular, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora'
import type { Session } from '@supabase/supabase-js'
import { COLORES } from '@gym/core'
import { OPCIONES_ENCABEZADO, TEMA_NAVEGACION } from '@/ui'
import { supabase } from '@/lib/supabase'
import { iniciarSincronizacion } from '@/lib/sincronizar'

export default function LayoutRaiz() {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)
  const segmentos = useSegments()
  // Sin la fuente cargada la primera pantalla se pinta con la del sistema y
  // "salta" al cargar: se espera, igual que se espera la sesión.
  const [fuentesListas] = useFonts({ Sora_400Regular, Sora_600SemiBold, Sora_700Bold })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) =>
      setSesion(s),
    )
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (cargando) return
    const enLogin = segmentos[0] === 'login'
    if (!sesion && !enLogin) router.replace('/login')
    if (sesion && enLogin) router.replace('/(tabs)')
  }, [sesion, cargando, segmentos])

  // La cola se sincroniza mientras haya alguien con la sesión iniciada. Por el
  // id y no por el objeto sesión: ese objeto cambia en cada refresco del token
  // y volvería a enganchar los oyentes.
  const usuarioId = sesion?.user.id
  useEffect(() => {
    if (!usuarioId) return
    return iniciarSincronizacion()
  }, [usuarioId])

  if (cargando || !fuentesListas) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: COLORES.fondo }}>
        <ActivityIndicator color={COLORES.cian} />
      </View>
    )
  }

  // El armador de rutinas arrastra días y ejercicios con
  // react-native-gesture-handler: esos gestos necesitan que la raíz de la app
  // esté envuelta acá, no solo en la pantalla que los usa.
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORES.fondo }}>
      <ThemeProvider value={TEMA_NAVEGACION}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, ...OPCIONES_ENCABEZADO }} />
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}
