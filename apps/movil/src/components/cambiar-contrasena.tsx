import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { ESPACIO, validarCambioContrasena } from '@gym/core'
import { Boton, Campo, Tarjeta, Texto } from '@/ui'
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'

const SIN_SENAL = 'Necesitás conexión para cambiar la contraseña'

/**
 * La contraseña inicial la puso el empleado y viajó por WhatsApp: el socio
 * tiene que poder cambiarla. Ver la sección 5 del diseño de la etapa 4.
 */
export function CambiarContrasena() {
  const [abierto, setAbierto] = useState(false)
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const cerrar = () => {
    setAbierto(false)
    setActual('')
    setNueva('')
    setRepetida('')
    setError(null)
  }

  async function guardar() {
    const problema = validarCambioContrasena({ actual, nueva, repetida })
    if (problema) {
      setError(problema)
      return
    }

    setEnviando(true)
    setError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const email = data.session?.user.email
      if (!email) {
        setError('Tu sesión venció. Volvé a entrar.')
        return
      }

      // Supabase deja cambiar la contraseña con la sesión abierta, sin pedir
      // la actual. Se comprueba igual: un teléfono prestado o desbloqueado no
      // tiene que alcanzar para quedarse con la cuenta.
      const prueba = await conLimite(supabase.auth.signInWithPassword({ email, password: actual }), 8000)
      if (!prueba) {
        setError(SIN_SENAL)
        return
      }
      if (prueba.error) {
        // Sin señal, signInWithPassword también devuelve error, pero no este.
        setError(prueba.error.code === 'invalid_credentials' ? 'La contraseña actual no es correcta' : SIN_SENAL)
        return
      }

      const cambio = await conLimite(supabase.auth.updateUser({ password: nueva }), 8000)
      if (!cambio) {
        setError(SIN_SENAL)
        return
      }
      if (cambio.error) {
        setError('No pudimos cambiar la contraseña, probá de nuevo')
        return
      }

      cerrar()
      setListo(true)
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) {
    return (
      <View style={estilos.cerrado}>
        {listo && <Texto tono="vigente">Contraseña cambiada.</Texto>}
        <Boton
          titulo="Cambiar contraseña" variante="secundario" icono="key-outline"
          onPress={() => { setListo(false); setAbierto(true) }}
        />
      </View>
    )
  }

  return (
    <Tarjeta style={estilos.tarjeta}>
      <Texto peso="semi">Cambiar contraseña</Texto>
      <Campo
        placeholder="Contraseña actual" value={actual} onChangeText={setActual}
        secureTextEntry autoCapitalize="none" autoComplete="current-password"
      />
      <Campo
        placeholder="Contraseña nueva" value={nueva} onChangeText={setNueva}
        secureTextEntry autoCapitalize="none" autoComplete="new-password"
      />
      <Campo
        placeholder="Repetí la nueva" value={repetida} onChangeText={setRepetida}
        secureTextEntry autoCapitalize="none" autoComplete="new-password"
      />
      {error && <Texto variante="chico" tono="rechazo">{error}</Texto>}
      <View style={estilos.acciones}>
        <Boton titulo={enviando ? 'Guardando…' : 'Guardar'} deshabilitado={enviando} style={{ flex: 1 }} onPress={() => void guardar()} />
        <Boton titulo="Cancelar" variante="secundario" deshabilitado={enviando} style={{ flex: 1 }} onPress={cerrar} />
      </View>
    </Tarjeta>
  )
}

const estilos = StyleSheet.create({
  cerrado: { marginTop: ESPACIO.l, gap: ESPACIO.s },
  tarjeta: { marginTop: ESPACIO.l, gap: ESPACIO.s },
  acciones: { flexDirection: 'row', gap: ESPACIO.s },
})
