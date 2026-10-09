import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { COLORES, DEGRADE, ESPACIO, RADIOS } from '@gym/core'
import { Boton, Campo, Fondo, Texto } from '@/ui'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)

  async function entrar() {
    setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setCargando(false)
    // Mensaje genérico a propósito, igual que en el panel: distinguir "no
    // existe el usuario" de "contraseña incorrecta" le confirma a un atacante
    // qué correos están registrados.
    if (error) Alert.alert('No pudimos entrar', 'Correo o contraseña incorrectos')
  }

  return (
    <Fondo>
      <KeyboardAvoidingView
        style={estilos.contenedor}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <LinearGradient
          colors={[DEGRADE.desde, DEGRADE.hasta]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={estilos.logo}
        >
          <Ionicons name="flash" size={30} color={COLORES.texto} />
        </LinearGradient>

        <View style={{ gap: ESPACIO.xs }}>
          <Texto variante="titulo">Entrá a tu gimnasio</Texto>
          <Texto tono="secundario">Registrá cada serie y mirá cómo progresás.</Texto>
        </View>

        <View style={{ gap: ESPACIO.m }}>
          <Campo
            placeholder="Correo" value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" autoComplete="email"
          />
          <Campo
            placeholder="Contraseña" value={password} onChangeText={setPassword}
            secureTextEntry autoComplete="password"
          />
        </View>

        <Boton titulo={cargando ? 'Entrando…' : 'Entrar'} onPress={() => void entrar()} deshabilitado={cargando} />
      </KeyboardAvoidingView>
    </Fondo>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, justifyContent: 'center', padding: ESPACIO.xl, gap: ESPACIO.xl },
  logo: { width: 60, height: 60, borderRadius: RADIOS.grande, alignItems: 'center', justifyContent: 'center' },
})
