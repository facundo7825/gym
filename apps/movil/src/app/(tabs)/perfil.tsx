import { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native'
import { useFocusEffect } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import {
  COLORES, ESPACIO, ETIQUETA_METODO_PAGO, estadoCuota, estaAlDia, primerDiaDelMes, textoEstadoCuota,
  textoPeriodo,
} from '@gym/core'
import { Aviso, Boton, Fondo, Tarjeta, Texto } from '@/ui'
import { QrSocio } from '@/components/qr-socio'
import { cerrarSesion } from '@/lib/cerrar-sesion'
import { fechaConDia, fechaYHora, horaCorta, hoyLocal } from '@/lib/fechas'
import { cargarPerfil, type DatosPerfil } from '@/lib/perfil'

type Carga = { datos: DatosPerfil | null; conSenal: boolean }

/** "$ 25.000", a mano por lo mismo que las fechas: Intl en Hermes no es confiable. */
const plata = (monto: number) => `$ ${Math.round(monto).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`

export default function Perfil() {
  const [carga, setCarga] = useState<Carga | null>(null)

  useFocusEffect(
    useCallback(() => {
      let vivo = true
      cargarPerfil()
        .then((r) => { if (vivo) setCarga(r) })
        // Un SQLite que falla no puede dejar la pantalla cargando para siempre.
        .catch(() => { if (vivo) setCarga({ datos: null, conSenal: false }) })
      return () => { vivo = false }
    }, []),
  )

  if (!carga) {
    return (
      <Fondo style={estilos.centrado}>
        <ActivityIndicator color={COLORES.cian} />
      </Fondo>
    )
  }

  const { datos, conSenal } = carga
  // Se calcula al mostrar y no al guardar: sin señal, una cuota guardada
  // ayer como vigente puede haber vencido hoy.
  const hoy = hoyLocal()

  return (
    <Fondo>
      <ScrollView contentContainerStyle={estilos.contenido}>
        {!datos && (
          <Tarjeta style={estilos.mensaje}>
            <Ionicons name="cloud-offline-outline" size={32} color={COLORES.rechazo} />
            <Texto tono="secundario" style={estilos.centro}>
              Necesitás conexión la primera vez que abrís tu perfil.
            </Texto>
          </Tarjeta>
        )}

        {datos && !datos.activa && (
          <Tarjeta style={estilos.mensaje}>
            <Ionicons name="alert-circle-outline" size={32} color={COLORES.rechazo} />
            <Texto tono="secundario" style={estilos.centro}>
              Tu membresía está inactiva. Consultá en el mostrador.
            </Texto>
          </Tarjeta>
        )}

        {datos?.activa && datos.codigoQr && (() => {
          const estado = estadoCuota(datos.pagos, hoy)
          const tono = estaAlDia(estado) ? 'vigente' : estado.tipo === 'empieza' ? 'pendiente' : 'rechazo'
          const veces = datos.mes === primerDiaDelMes(hoy) ? datos.vecesEsteMes : null

          return (
            <>
              {!conSenal && <Aviso tono="pendiente" texto={`Sin conexión · actualizado el ${fechaYHora(datos.actualizado)}`} />}

              <Tarjeta style={estilos.qr}>
                <QrSocio codigo={datos.codigoQr} />
                <Texto tono="secundario" style={estilos.centro}>Mostralo en el mostrador al entrar</Texto>
              </Tarjeta>

              <Texto variante="mini" tono="tenue" peso="semi" style={estilos.seccion}>CUOTA</Texto>
              <Tarjeta style={estilos.bloque}>
                <Texto variante="grande" tono={tono}>{textoEstadoCuota(estado)}</Texto>
                {datos.pagos.slice(0, 5).map((p) => (
                  <Texto key={`${p.periodo_desde}-${p.fecha_pago}`} variante="chico" tono="secundario" numerico>
                    {textoPeriodo(p)} · {plata(p.monto)} · {ETIQUETA_METODO_PAGO[p.metodo]}
                  </Texto>
                ))}
              </Tarjeta>

              <Texto variante="mini" tono="tenue" peso="semi" style={estilos.seccion}>ASISTENCIAS</Texto>
              <Tarjeta style={estilos.bloque}>
                <Texto variante="grande">
                  {veces === null ? 'Todavía sin datos de este mes' : `Viniste ${veces} ${veces === 1 ? 'vez' : 'veces'} este mes`}
                </Texto>
                {datos.entradas.map((e) => (
                  <Texto key={e.id} variante="chico" tono="secundario" numerico>
                    {fechaConDia(e.created_at)} · {horaCorta(e.created_at)}
                  </Texto>
                ))}
              </Tarjeta>
            </>
          )
        })()}

        {/* CAMBIAR CONTRASEÑA: lo agrega la tarea 14, acá. */}

        <Boton
          titulo="Cerrar sesión" variante="secundario" icono="log-out-outline"
          style={estilos.seccion} onPress={() => void cerrarSesion()}
        />
      </ScrollView>
    </Fondo>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contenido: { padding: ESPACIO.l, gap: ESPACIO.s },
  mensaje: { alignItems: 'center', gap: ESPACIO.s },
  centro: { textAlign: 'center' },
  qr: { alignItems: 'center', gap: ESPACIO.m },
  seccion: { marginTop: ESPACIO.l },
  bloque: { gap: ESPACIO.xs },
})
