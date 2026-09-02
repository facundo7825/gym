import { useState } from 'react'
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native'
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
    <View style={estilos.contenedor}>
      <Text style={estilos.titulo}>Entrar</Text>
      <TextInput
        style={estilos.campo} placeholder="Correo" value={email}
        onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
      />
      <TextInput
        style={estilos.campo} placeholder="Contraseña" value={password}
        onChangeText={setPassword} secureTextEntry
      />
      <Button title={cargando ? 'Entrando…' : 'Entrar'} onPress={entrar} disabled={cargando} />
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  titulo: { fontSize: 28, fontWeight: '600', marginBottom: 12 },
  campo: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
})
