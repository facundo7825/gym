import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import Ionicons from '@expo/vector-icons/Ionicons'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  aNumero, COLORES, detectarRecord, ESPACIO, filasPrecargadas, formatearKg, sesionAbierta,
  textoVezPasada, TOQUE_MINIMO, validarSerie, volumen,
  type FilaPrecargada, type Marcas, type SerieHecha, type SesionEnCola, type TipoRecord,
} from '@gym/core'
import { Aviso, Boton, Cronometro, FilaSerie, Fondo, Tarjeta, Texto } from '@/ui'
import { AvisoSincronizacion } from '@/components/aviso-sincronizacion'
import { BuscadorEjercicios, type EjercicioDelCatalogo } from '@/components/buscador-ejercicios'
import * as local from '@/lib/local/cola'
import { membresiaPara, membresiasGuardadas, type Membresia } from '@/lib/membresia'
import { rutinaGuardada, type DiaDeRutina } from '@/lib/rutina-activa'
import { actualizarEstado, sincronizar } from '@/lib/sincronizar'
import { terminarSesion } from '@/lib/terminar-sesion'
import { vezPasada } from '@/lib/vez-pasada'

// Los campos son texto mientras el socio escribe: "57," es un estado válido de
// un campo a medio escribir y no es un número.
interface Fila {
  peso: string
  reps: string
  registrada: boolean
}

interface EjercicioEnSesion {
  ejercicio_id: string
  nombre: string
  vezPasada: string | null
  filas: Fila[]
}

const aTexto = (n: number | null) => (n === null ? '' : formatearKg(n))
const aFila = (f: FilaPrecargada): Fila => ({
  peso: aTexto(f.peso_kg), reps: aTexto(f.repeticiones), registrada: f.registrada,
})
const aSerie = (f: Fila): SerieHecha => ({ peso_kg: aNumero(f.peso), repeticiones: aNumero(f.reps) })

/**
 * La pantalla de sesión: un acordeón por ejercicio. Ver la sección 3 del diseño
 * de la etapa 3.
 *
 * Se llega de tres formas:
 * - `?diaId=…`: Empezar desde Hoy, con un día de la rutina.
 * - sin parámetros: entrenar libre.
 * - `?retomar=1`: seguir la sesión que quedó abierta.
 *
 * Nada acá exige señal. Tildar una serie la guarda en el teléfono al instante;
 * la sincronización la lleva cuando puede. Volver atrás sin tocar Terminar deja
 * la sesión abierta, y Hoy ofrece seguirla.
 */
export default function Entrenar() {
  const { diaId, retomar } = useLocalSearchParams<{ diaId?: string; retomar?: string }>()
  const router = useRouter()
  const [cargando, setCargando] = useState(true)
  const [titulo, setTitulo] = useState('Entrenar libre')
  const [ejercicios, setEjercicios] = useState<EjercicioEnSesion[]>([])
  const [abierto, setAbierto] = useState(0)
  const [eligiendo, setEligiendo] = useState(false)
  const [record, setRecord] = useState<string | null>(null)
  // Para el cronómetro del encabezado. La sesión nace con la primera serie:
  // hasta entonces no hay inicio y el cronómetro muestra 0:00.
  const [inicio, setInicio] = useState<string | null>(null)

  // Refs y no estado: no se dibujan, y registrar() tiene que ver el valor
  // actual aunque el socio toque dos tildes seguidos.
  const sesion = useRef<SesionEnCola | null>(null)
  const membresia = useRef<Membresia | null>(null)
  const gymId = useRef<string | null>(null)
  const rutinaDiaId = useRef<string | null>(null)
  // Las de ANTES de la sesión. No se tocan hasta Terminar (ver terminar-sesion.ts).
  const marcasPrevias = useRef<Marcas>({})
  const ocupado = useRef(false)
  const cerrando = useRef(false)
  const temporizadorRecord = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (temporizadorRecord.current) clearTimeout(temporizadorRecord.current)
  }, [])

  useEffect(() => {
    let vivo = true

    async function preparar(): Promise<EjercicioEnSesion[]> {
      const rutina = await rutinaGuardada()
      let dia: DiaDeRutina | null = null
      let hechas: local.SerieLocal[] = []
      let snapshot: Marcas | null = null

      if (retomar) {
        const { sesiones } = await local.leerCola()
        const ids = (await membresiasGuardadas()).map((m) => m.id)
        const abierta = sesionAbierta(sesiones, ids)
        if (abierta) {
          sesion.current = abierta
          setInicio(abierta.inicio)
          membresia.current = { id: abierta.membership_id, gym_id: abierta.gym_id }
          gymId.current = abierta.gym_id
          rutinaDiaId.current = abierta.rutina_dia_id
          hechas = await local.seriesDeSesionLocal(abierta.id_local)
          // Las de antes de ESTA sesión, guardadas al crearla. Las de leerMarcas
          // ya pueden incluir sus series sincronizadas.
          snapshot = await local.leerCache<Marcas>(`marcas-previas:${abierta.id_local}`)
          dia =rutina?.rutina_dias.find((d) => d.id === abierta.rutina_dia_id) ?? null
        }
      } else {
        dia = diaId ? (rutina?.rutina_dias.find((d) => d.id === diaId) ?? null) : null
        gymId.current = rutina?.gym_id ?? null
        rutinaDiaId.current = dia?.id ?? null
      }

      membresia.current ??= await membresiaPara(gymId.current)
      // Sin snapshot (una sesión creada antes de guardarlo) se cae a las marcas
      // del teléfono, como antes.
      if (snapshot) marcasPrevias.current = snapshot
      else if (membresia.current) marcasPrevias.current = await local.leerMarcas(membresia.current.id)
      if (dia) setTitulo(dia.nombre)

      const delDia = [...(dia?.rutina_ejercicios ?? [])]
        .filter((re) => re.ejercicios !== null)
        .sort((a, b) => a.orden - b.orden)
      // Los que se agregaron entrenando no están en el día: salen de lo
      // registrado. Un ejercicio repetido en el mismo día queda como uno solo.
      const ids = [...new Set([
        ...delDia.map((re) => re.ejercicios!.id),
        ...hechas.map((h) => h.ejercicio_id),
      ])]
      const pasada = await vezPasada(ids)

      return ids.map((id) => {
        const re = delDia.find((x) => x.ejercicios!.id === id)
        const suyas = hechas.filter((h) => h.ejercicio_id === id)
        // Al retomar, una sesión ya sincronizada es la última vez de sí misma:
        // si ya tiene series, se precarga con la rutina y sin "la vez pasada".
        const anterior = suyas.length > 0 ? null : (pasada?.get(id) ?? null)
        return {
          ejercicio_id: id,
          nombre: re?.ejercicios!.nombre ?? suyas[0]?.nombre_ejercicio ?? 'Ejercicio',
          vezPasada: anterior ? textoVezPasada(anterior) : null,
          filas: filasPrecargadas({
            prescripcion: re
              ? { series: re.series, repeticiones: re.repeticiones, peso_sugerido_kg: re.peso_sugerido_kg }
              : null,
            vezPasada: anterior,
            hechas: suyas,
          }).map(aFila),
        }
      })
    }

    preparar()
      .then((lista) => {
        if (!vivo) return
        setEjercicios(lista)
        // Se abre el primero que tenga algo sin tildar.
        setAbierto(Math.max(0, lista.findIndex((e) => e.filas.some((f) => !f.registrada))))
        setCargando(false)
      })
      .catch(() => {
        if (!vivo) return
        Alert.alert('No pudimos abrir el entrenamiento', 'Probá de nuevo.')
        router.back()
      })

    return () => { vivo = false }
  }, [diaId, retomar, router])

  const editar = (iEj: number, iFila: number, campo: 'peso' | 'reps', valor: string) =>
    setEjercicios((previos) => previos.map((e, i) => (i !== iEj ? e : {
      ...e,
      filas: e.filas.map((f, j) => (j === iFila ? { ...f, [campo]: valor } : f)),
    })))

  const agregarFila = (iEj: number) =>
    setEjercicios((previos) => previos.map((e, i) => {
      if (i !== iEj) return e
      const ultima = e.filas[e.filas.length - 1]
      return { ...e, filas: [...e.filas, { peso: ultima?.peso ?? '', reps: ultima?.reps ?? '', registrada: false }] }
    }))

  function avisarRecord(tipo: TipoRecord | null, nombre: string, nueva: SerieHecha, todas: SerieHecha[]) {
    if (!tipo) return
    setRecord(tipo === 'peso'
      ? `🏆 Nuevo récord en ${nombre}: ${formatearKg(nueva.peso_kg)}kg`
      : `🏆 Nuevo récord de volumen en ${nombre}: ${formatearKg(volumen(todas))}kg`)
    if (temporizadorRecord.current) clearTimeout(temporizadorRecord.current)
    temporizadorRecord.current = setTimeout(() => setRecord(null), 4000)
  }

  async function registrar(iEj: number, iFila: number) {
    if (ocupado.current) return
    const ej = ejercicios[iEj]
    const fila = ej?.filas[iFila]
    if (!ej || !fila || fila.registrada) return

    const nueva = aSerie(fila)
    const error = validarSerie(nueva)
    if (error) {
      Alert.alert(error)
      return
    }

    ocupado.current = true
    try {
      if (!membresia.current) {
        membresia.current = await membresiaPara(gymId.current)
        if (membresia.current) marcasPrevias.current = await local.leerMarcas(membresia.current.id)
      }
      if (!membresia.current) {
        Alert.alert(
          'No pudimos identificar tu gimnasio',
          'Abrí la app una vez con señal para que sepa de qué gimnasio sos. Después podés entrenar sin señal.',
        )
        return
      }

      // La sesión nace con la primera serie: abrir la pantalla y salir sin
      // tildar nada no deja una sesión vacía en el historial.
      if (!sesion.current) {
        sesion.current = await local.crearSesionLocal({
          membership_id: membresia.current.id,
          gym_id: membresia.current.gym_id,
          rutina_dia_id: rutinaDiaId.current,
        })
        // Para retomarla: las marcas del teléfono se fusionan con las del
        // servidor, que ya incluirían lo hecho en esta sesión.
        await local.guardarCache(`marcas-previas:${sesion.current.id_local}`, marcasPrevias.current)
        setInicio(sesion.current.inicio)
      }

      const anteriores = ej.filas.filter((f) => f.registrada).map(aSerie)
      await local.agregarSerieLocal({
        sesion_id_local: sesion.current.id_local,
        ejercicio_id: ej.ejercicio_id,
        nombre_ejercicio: ej.nombre,
        numero_serie: anteriores.length + 1,
        peso_kg: nueva.peso_kg,
        repeticiones: nueva.repeticiones,
      })
      // Confirma el toque sin tener que mirar. Si el teléfono no vibra —o en
      // web—, no pasa nada.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})

      avisarRecord(
        detectarRecord(marcasPrevias.current[ej.ejercicio_id], anteriores, nueva),
        ej.nombre, nueva, [...anteriores, nueva],
      )

      // Solo se tilda esta fila: lo escrito en otras mientras se guardaba no se pisa.
      const filasTildadas = ej.filas.map((f, i) => (i === iFila ? { ...f, registrada: true } : f))
      setEjercicios((previos) => previos.map((e, i) => (i !== iEj ? e : {
        ...e,
        filas: e.filas.map((f, j) => (j === iFila ? { ...f, registrada: true } : f)),
      })))
      // Terminado un ejercicio se abre el siguiente: es parte de los cuatro toques.
      if (filasTildadas.every((f) => f.registrada) && iEj + 1 < ejercicios.length) setAbierto(iEj + 1)

      void actualizarEstado()
      void sincronizar()
    } catch {
      Alert.alert('No pudimos guardar la serie', 'Probá de nuevo.')
    } finally {
      ocupado.current = false
    }
  }

  async function agregarEjercicio(elegido: EjercicioDelCatalogo) {
    setEligiendo(false)
    const anterior = (await vezPasada([elegido.id]))?.get(elegido.id) ?? null
    const nuevo: EjercicioEnSesion = {
      ejercicio_id: elegido.id,
      nombre: elegido.nombre,
      vezPasada: anterior ? textoVezPasada(anterior) : null,
      filas: filasPrecargadas({ prescripcion: null, vezPasada: anterior, hechas: [] }).map(aFila),
    }
    // El control de duplicados va dentro del updater: dos elecciones seguidas
    // del mismo ejercicio no pueden agregarlo dos veces.
    setEjercicios((previos) => {
      const yaEsta = previos.findIndex((e) => e.ejercicio_id === elegido.id)
      setAbierto(yaEsta >= 0 ? yaEsta : previos.length)
      return yaEsta >= 0 ? previos : [...previos, nuevo]
    })
  }

  function terminar() {
    if (ocupado.current || cerrando.current) return
    const actual = sesion.current
    // No se registró nada: no hay sesión que cerrar.
    if (!actual) {
      router.back()
      return
    }

    const cerrar = async () => {
      if (ocupado.current || cerrando.current) return
      cerrando.current = true
      try {
        await terminarSesion(actual)
        router.back()
      } catch {
        cerrando.current = false
        Alert.alert('No pudimos terminar el entrenamiento', 'Probá de nuevo.')
      }
    }

    const sinMarcar = ejercicios.reduce((n, e) => n + e.filas.filter((f) => !f.registrada).length, 0)
    if (sinMarcar === 0) {
      void cerrar()
      return
    }

    // Avisar en vez de descartarlas en silencio: después de confirmar no se
    // registran, y lo decidió el socio.
    Alert.alert(
      sinMarcar === 1 ? 'Quedó 1 serie sin marcar' : `Quedaron ${sinMarcar} series sin marcar`,
      'Si terminás ahora, no se registran.',
      [
        { text: 'Seguir entrenando', style: 'cancel' },
        { text: 'Terminar igual', style: 'destructive', onPress: () => { void cerrar() } },
      ],
    )
  }

  if (cargando) {
    return (
      <Fondo style={estilos.centrado}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <ActivityIndicator color={COLORES.cian} />
      </Fondo>
    )
  }

  return (
    <Fondo>
      <Stack.Screen
        options={{
          headerShown: true,
          title: titulo,
          headerRight: () => <View style={estilos.reloj}><Cronometro inicio={inicio} /></View>,
        }}
      />
      <AvisoSincronizacion />
      {record && <View style={estilos.record}><Aviso tono="record" texto={record} /></View>}

      <ScrollView contentContainerStyle={estilos.lista} keyboardShouldPersistTaps="handled">
        {ejercicios.length === 0 && (
          <Tarjeta style={estilos.vacia}>
            <Ionicons name="barbell-outline" size={30} color={COLORES.cian} />
            <Texto tono="secundario">Agregá el primer ejercicio para empezar.</Texto>
          </Tarjeta>
        )}

        {ejercicios.map((ej, iEj) => {
          const hechas = ej.filas.filter((f) => f.registrada).length
          const completo = hechas === ej.filas.length && hechas > 0
          const estaAbierto = iEj === abierto
          return (
            <Tarjeta key={ej.ejercicio_id} style={estilos.ejercicio}>
              <Pressable
                style={estilos.cabecera}
                onPress={() => setAbierto(estaAbierto ? -1 : iEj)}
                accessibilityRole="button"
                accessibilityState={{ expanded: estaAbierto }}
              >
                <Texto variante="grande" style={{ flex: 1 }}>{ej.nombre}</Texto>
                <Texto variante="chico" tono={completo ? 'cian' : 'secundario'} peso="semi" numerico>
                  {hechas}/{ej.filas.length}
                </Texto>
                <Ionicons
                  name={estaAbierto ? 'chevron-up' : 'chevron-down'}
                  size={18} color={COLORES.textoTenue}
                />
              </Pressable>

              {estaAbierto && (
                <View style={estilos.cuerpo}>
                  {ej.vezPasada && (
                    <Texto variante="chico" tono="secundario" numerico>{ej.vezPasada}</Texto>
                  )}

                  {ej.filas.map((f, iFila) => (
                    <FilaSerie
                      key={iFila}
                      numero={iFila + 1}
                      peso={f.peso}
                      reps={f.reps}
                      registrada={f.registrada}
                      onCambiarPeso={(v) => editar(iEj, iFila, 'peso', v)}
                      onCambiarReps={(v) => editar(iEj, iFila, 'reps', v)}
                      onTildar={() => void registrar(iEj, iFila)}
                    />
                  ))}

                  <Pressable onPress={() => agregarFila(iEj)} hitSlop={8} style={estilos.agregarSerie}>
                    <Ionicons name="add" size={18} color={COLORES.cian} />
                    <Texto peso="semi" tono="cian">Serie</Texto>
                  </Pressable>
                </View>
              )}
            </Tarjeta>
          )
        })}

        <Boton titulo="Agregar ejercicio" variante="secundario" icono="add" onPress={() => setEligiendo(true)} />
        <Boton titulo="Terminar" icono="checkmark-done" onPress={terminar} />
      </ScrollView>

      <Modal visible={eligiendo} animationType="slide" onRequestClose={() => setEligiendo(false)}>
        <Fondo>
          <SafeAreaView style={{ flex: 1 }}>
            <Pressable style={estilos.cancelar} onPress={() => setEligiendo(false)} hitSlop={8}>
              <Texto peso="semi" tono="cian">Cancelar</Texto>
            </Pressable>
            <BuscadorEjercicios onElegir={(e) => void agregarEjercicio(e)} />
          </SafeAreaView>
        </Fondo>
      </Modal>
    </Fondo>
  )
}

const estilos = StyleSheet.create({
  centrado: { alignItems: 'center', justifyContent: 'center' },
  reloj: { marginRight: ESPACIO.l },
  record: { paddingHorizontal: ESPACIO.l, paddingTop: ESPACIO.s },
  lista: { padding: ESPACIO.l, gap: ESPACIO.m, paddingBottom: ESPACIO.xl * 2 },
  vacia: { alignItems: 'center', gap: ESPACIO.s, paddingVertical: ESPACIO.xl },
  ejercicio: { padding: 0 },
  cabecera: {
    flexDirection: 'row', alignItems: 'center', gap: ESPACIO.s,
    minHeight: TOQUE_MINIMO + 12, paddingHorizontal: ESPACIO.l,
  },
  cuerpo: { paddingHorizontal: ESPACIO.l, paddingBottom: ESPACIO.l, gap: ESPACIO.s },
  agregarSerie: {
    flexDirection: 'row', alignItems: 'center', gap: ESPACIO.xs,
    alignSelf: 'flex-start', minHeight: TOQUE_MINIMO,
  },
  cancelar: { padding: ESPACIO.l, minHeight: TOQUE_MINIMO },
})
