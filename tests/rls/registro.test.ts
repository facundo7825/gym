import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, crearEscenario, type Escenario } from './ayudas'

// ---------------------------------------------------------------------------
// Ayudas de este archivo. Preparan datos con el cliente admin, que saltea RLS:
// lo que se prueba después es lo que cada usuario puede hacer sobre esos datos.
// ---------------------------------------------------------------------------

/** Un ejercicio del catálogo global, visible para todos los gimnasios. */
async function unEjercicio(): Promise<string> {
  const { data, error } = await admin
    .from('ejercicios').select('id').is('gym_id', null).limit(1).single()
  if (error) throw error
  return data.id
}

async function sesionDe(
  gymId: string, membershipId: string, inicio = new Date().toISOString(),
): Promise<string> {
  const { data, error } = await admin
    .from('sesiones')
    .insert({ gym_id: gymId, membership_id: membershipId, inicio, id_local: randomUUID() })
    .select('id').single()
  if (error) throw error
  return data.id
}

async function serieEn(
  sesionId: string,
  ejercicioId: string,
  datos: { numero_serie?: number; peso_kg?: number; repeticiones?: number; completada?: boolean } = {},
): Promise<string> {
  const { data, error } = await admin
    .from('series_registradas')
    .insert({
      sesion_id: sesionId,
      ejercicio_id: ejercicioId,
      numero_serie: datos.numero_serie ?? 1,
      peso_kg: datos.peso_kg ?? 60,
      repeticiones: datos.repeticiones ?? 10,
      completada: datos.completada ?? true,
      id_local: randomUUID(),
    })
    .select('id').single()
  if (error) throw error
  return data.id
}

describe('esquema del registro', () => {
  let e: Escenario
  let ejercicio: string
  let sesion: string

  beforeAll(async () => {
    e = await crearEscenario()
    ejercicio = await unEjercicio()
    sesion = await sesionDe(e.gymA, e.socioAMembresiaId)
  })

  const serieCon = (campos: Record<string, unknown>) =>
    admin.from('series_registradas').insert({
      sesion_id: sesion, ejercicio_id: ejercicio, numero_serie: 1,
      peso_kg: 60, repeticiones: 10, id_local: randomUUID(),
      ...campos,
    })

  it('acepta una serie bien formada y la da por completada', async () => {
    const id = await serieEn(sesion, ejercicio)
    const { data } = await admin
      .from('series_registradas').select('completada').eq('id', id).single()
    expect(data!.completada).toBe(true)
  })

  it('acepta peso cero: los ejercicios con el propio cuerpo existen', async () => {
    const { error } = await serieCon({ peso_kg: 0 })
    expect(error).toBeNull()
  })

  it('no acepta peso negativo', async () => {
    const { error } = await serieCon({ peso_kg: -5 })
    expect(error?.code).toBe('23514')
  })

  it('no acepta cero repeticiones', async () => {
    const { error } = await serieCon({ repeticiones: 0 })
    expect(error?.code).toBe('23514')
  })

  it('no acepta un número de serie en cero', async () => {
    const { error } = await serieCon({ numero_serie: 0 })
    expect(error?.code).toBe('23514')
  })

  it('no acepta un RPE fuera de 1 a 10', async () => {
    const { error } = await serieCon({ rpe: 11 })
    expect(error?.code).toBe('23514')
  })

  it('no acepta una sesión que termina antes de empezar', async () => {
    const { error } = await admin.from('sesiones').insert({
      gym_id: e.gymA, membership_id: e.socioAMembresiaId,
      inicio: '2026-10-08T10:00:00Z', fin: '2026-10-08T09:00:00Z',
      id_local: randomUUID(),
    })
    expect(error?.code).toBe('23514')
  })

  it('un id_local repetido choca contra el índice único', async () => {
    const idLocal = randomUUID()
    await serieCon({ id_local: idLocal })
    const { error } = await serieCon({ id_local: idLocal })
    expect(error?.code).toBe('23505')
  })

  it('no se puede borrar del catálogo un ejercicio con series registradas', async () => {
    const { data: privado } = await admin
      .from('ejercicios')
      .insert({ gym_id: e.gymA, nombre: 'Press del gym', grupo_muscular: 'pecho', equipamiento: 'barra' })
      .select('id').single()
    await serieEn(sesion, privado!.id)

    const { error } = await admin.from('ejercicios').delete().eq('id', privado!.id)
    expect(error?.code).toBe('23503')
  })

  it('borrar la membresía se lleva su historial', async () => {
    // Una membresía propia para este test: borrar la del escenario rompería
    // los demás.
    const { data: usuario } = await admin.auth.admin.createUser({
      email: `se-va-${randomUUID().slice(0, 8)}@ejemplo.com`,
      password: 'prueba-123456', email_confirm: true,
    })
    const { data: membresia } = await admin
      .from('memberships')
      .insert({ gym_id: e.gymA, user_id: usuario.user!.id, rol: 'socio' })
      .select('id').single()
    const suya = await sesionDe(e.gymA, membresia!.id)
    const serie = await serieEn(suya, ejercicio)

    await admin.from('memberships').delete().eq('id', membresia!.id)

    const { data: sesiones } = await admin.from('sesiones').select('id').eq('id', suya)
    const { data: series } = await admin.from('series_registradas').select('id').eq('id', serie)
    expect(sesiones).toEqual([])
    expect(series).toEqual([])
  })
})

describe('permisos del registro', () => {
  let e: Escenario
  let ejercicio: string
  let sesionA: string
  let serieA: string
  let sesionB: string
  let serieB: string
  let diaDeOtroGym: string

  beforeAll(async () => {
    e = await crearEscenario()
    ejercicio = await unEjercicio()
    sesionA = await sesionDe(e.gymA, e.socioAMembresiaId)
    serieA = await serieEn(sesionA, ejercicio)
    sesionB = await sesionDe(e.gymB, e.socioBMembresiaId)
    serieB = await serieEn(sesionB, ejercicio)

    const { data: plantillaB } = await admin
      .from('rutinas')
      .insert({ gym_id: e.gymB, nombre: 'Del B', tipo: 'plantilla' })
      .select('id').single()
    const { data: dia } = await admin
      .from('rutina_dias')
      .insert({ rutina_id: plantillaB!.id, orden: 1, nombre: 'Día 1' })
      .select('id').single()
    diaDeOtroGym = dia!.id
  })

  const ve = async (cliente: typeof e.comoSocioA, tabla: 'sesiones' | 'series_registradas', id: string) => {
    const { data } = await cliente.from(tabla).select('id').eq('id', id)
    return (data ?? []).length === 1
  }

  const nuevaSesion = (membershipId: string, extra: Record<string, unknown> = {}) => ({
    gym_id: e.gymA, membership_id: membershipId,
    inicio: new Date().toISOString(), id_local: randomUUID(), ...extra,
  })

  const nuevaSerie = (sesionId: string, extra: Record<string, unknown> = {}) => ({
    sesion_id: sesionId, ejercicio_id: ejercicio, numero_serie: 1,
    peso_kg: 50, repeticiones: 8, id_local: randomUUID(), ...extra,
  })

  // --- Lectura ---------------------------------------------------------------

  it('el socio ve sus sesiones y sus series', async () => {
    expect(await ve(e.comoSocioA, 'sesiones', sesionA)).toBe(true)
    expect(await ve(e.comoSocioA, 'series_registradas', serieA)).toBe(true)
  })

  it('otro socio del mismo gimnasio NO ve las ajenas', async () => {
    expect(await ve(e.comoSocioA2, 'sesiones', sesionA)).toBe(false)
    expect(await ve(e.comoSocioA2, 'series_registradas', serieA)).toBe(false)
  })

  it('el entrenador ve las del socio: es lo que alimenta la ficha del panel', async () => {
    expect(await ve(e.comoEntrenadorA, 'sesiones', sesionA)).toBe(true)
    expect(await ve(e.comoEntrenadorA, 'series_registradas', serieA)).toBe(true)
  })

  it('el gimnasio A no ve nada del B, tampoco las series, que no tienen gym_id', async () => {
    expect(await ve(e.comoAdminA, 'sesiones', sesionB)).toBe(false)
    expect(await ve(e.comoAdminA, 'series_registradas', serieB)).toBe(false)
    expect(await ve(e.comoSocioB, 'series_registradas', serieA)).toBe(false)
  })

  // --- Alta de sesiones ------------------------------------------------------

  // La lección que la etapa 2 pagó con una ronda de arreglo: si la política de
  // select buscara la fila por id, este returning fallaría con 42501.
  it('el socio registra una sesión propia y recibe el id de vuelta', async () => {
    const { data, error } = await e.comoSocioA
      .from('sesiones').insert(nuevaSesion(e.socioAMembresiaId)).select('id').single()
    expect(error).toBeNull()
    expect(data!.id).toBeTruthy()
  })

  it('el socio NO puede registrar una sesión a nombre de otro socio', async () => {
    const { error } = await e.comoSocioA
      .from('sesiones').insert(nuevaSesion(e.socioA2MembresiaId))
    expect(error?.code).toBe('42501')
  })

  it('el entrenador NO puede registrar una sesión a nombre del socio', async () => {
    const { error } = await e.comoEntrenadorA
      .from('sesiones').insert(nuevaSesion(e.socioAMembresiaId))
    expect(error?.code).toBe('42501')
  })

  it('una sesión no se puede colgar de un día de rutina de otro gimnasio', async () => {
    const { error } = await e.comoSocioA
      .from('sesiones').insert(nuevaSesion(e.socioAMembresiaId, { rutina_dia_id: diaDeOtroGym }))
    expect(error?.code).toBe('42501')
  })

  // --- Alta de series --------------------------------------------------------

  it('el socio agrega series a su sesión', async () => {
    const { error } = await e.comoSocioA.from('series_registradas').insert(nuevaSerie(sesionA))
    expect(error).toBeNull()
  })

  it('otro socio NO puede agregar series a una sesión ajena', async () => {
    const { error } = await e.comoSocioA2.from('series_registradas').insert(nuevaSerie(sesionA))
    expect(error?.code).toBe('42501')
  })

  it('el entrenador NO puede agregar series a la sesión del socio', async () => {
    const { error } = await e.comoEntrenadorA.from('series_registradas').insert(nuevaSerie(sesionA))
    expect(error?.code).toBe('42501')
  })

  it('una serie no puede apuntar a un ejercicio privado de otro gimnasio', async () => {
    const { data: privadoB } = await admin
      .from('ejercicios')
      .insert({ gym_id: e.gymB, nombre: 'Secreto del B', grupo_muscular: 'pecho', equipamiento: 'barra' })
      .select('id').single()
    const { error } = await e.comoSocioA
      .from('series_registradas').insert(nuevaSerie(sesionA, { ejercicio_id: privadoB!.id }))
    expect(error?.code).toBe('42501')
  })

  // --- Cierre de sesión ------------------------------------------------------

  it('el socio cierra su sesión: escribe fin y notas', async () => {
    const { data, error } = await e.comoSocioA
      .from('sesiones')
      .update({ fin: new Date(Date.now() + 60_000).toISOString(), notas: 'Bien' })
      .eq('id', sesionA).select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  // Sin una política que lo habilite, Postgres no da error: el update no
  // encuentra filas. Por eso se mira la fila, no el error.
  it('otro socio NO puede cerrar una sesión ajena', async () => {
    const { data } = await e.comoSocioA2
      .from('sesiones').update({ notas: 'Ajena' }).eq('id', sesionA).select('id')
    expect(data).toEqual([])
    const { data: fila } = await admin.from('sesiones').select('notas').eq('id', sesionA).single()
    expect(fila!.notas).not.toBe('Ajena')
  })

  it('el entrenador NO puede tocar la sesión del socio', async () => {
    const { data } = await e.comoEntrenadorA
      .from('sesiones').update({ notas: 'Del entrenador' }).eq('id', sesionA).select('id')
    expect(data).toEqual([])
  })

  // --- Lo que no existe ------------------------------------------------------

  it('nadie puede borrar una sesión, ni la propia', async () => {
    await e.comoSocioA.from('sesiones').delete().eq('id', sesionA)
    const { data } = await admin.from('sesiones').select('id').eq('id', sesionA)
    expect(data).toHaveLength(1)
  })

  // Los dos tests que sostienen la invariante de la que depende la
  // sincronización. Sin política, update y delete no fallan: no tocan nada. Un
  // test que esperara un error pasaría por el motivo equivocado o fallaría por
  // el equivocado; este mira la fila.
  it('una serie NO se puede editar: el update no toca la fila', async () => {
    await e.comoSocioA.from('series_registradas').update({ peso_kg: 999 }).eq('id', serieA)
    const { data } = await admin
      .from('series_registradas').select('peso_kg').eq('id', serieA).single()
    expect(Number(data!.peso_kg)).toBe(60)
  })

  it('una serie NO se puede borrar: el delete no toca la fila', async () => {
    await e.comoSocioA.from('series_registradas').delete().eq('id', serieA)
    const { data } = await admin.from('series_registradas').select('id').eq('id', serieA)
    expect(data).toHaveLength(1)
  })

  // --- Idempotencia ----------------------------------------------------------

  it('reenviar la misma serie devuelve 23505, que la cola toma como éxito', async () => {
    const serie = nuevaSerie(sesionA)
    const primero = await e.comoSocioA.from('series_registradas').insert(serie)
    expect(primero.error).toBeNull()
    const segundo = await e.comoSocioA.from('series_registradas').insert(serie)
    expect(segundo.error?.code).toBe('23505')
  })

  it('reenviar la misma sesión devuelve 23505', async () => {
    const sesion = nuevaSesion(e.socioAMembresiaId)
    await e.comoSocioA.from('sesiones').insert(sesion)
    const { error } = await e.comoSocioA.from('sesiones').insert(sesion)
    expect(error?.code).toBe('23505')
  })
})

describe('columnas inmutables de una sesión', () => {
  let e: Escenario
  let sesion: string
  let dia: string
  let otroDia: string

  beforeAll(async () => {
    e = await crearEscenario()

    const { data: rutina } = await admin
      .from('rutinas')
      .insert({ gym_id: e.gymA, nombre: 'La mía', tipo: 'activa', propietario_id: e.socioAMembresiaId })
      .select('id').single()
    const { data: dias } = await admin
      .from('rutina_dias')
      .insert([
        { rutina_id: rutina!.id, orden: 1, nombre: 'Día 1' },
        { rutina_id: rutina!.id, orden: 2, nombre: 'Día 2' },
      ])
      .select('id, orden')
    dia = dias!.find((d) => d.orden === 1)!.id
    otroDia = dias!.find((d) => d.orden === 2)!.id

    const { data } = await admin
      .from('sesiones')
      .insert({
        gym_id: e.gymA, membership_id: e.socioAMembresiaId, rutina_dia_id: dia,
        inicio: '2026-10-08T10:00:00Z', id_local: randomUUID(),
      })
      .select('id').single()
    sesion = data!.id
  })

  const actualizar = (campos: Record<string, unknown>) =>
    e.comoSocioA.from('sesiones').update(campos).eq('id', sesion).select('id')

  it('fin y notas sí se pueden escribir: es terminar de entrenar', async () => {
    const { error } = await actualizar({ fin: '2026-10-08T11:00:00Z', notas: 'Pesado' })
    expect(error).toBeNull()
  })

  it('el inicio no se puede cambiar', async () => {
    const { error } = await actualizar({ inicio: '2026-10-01T10:00:00Z' })
    expect(error?.code).toBe('42501')
  })

  it('no se puede mudar una sesión de gimnasio', async () => {
    const { error } = await actualizar({ gym_id: e.gymB })
    expect(error?.code).toBe('42501')
  })

  it('el id_local no se puede cambiar: es la llave de los reintentos', async () => {
    const { error } = await actualizar({ id_local: randomUUID() })
    expect(error?.code).toBe('42501')
  })

  it('no se puede repuntar la sesión a otro día de la rutina', async () => {
    const { error } = await actualizar({ rutina_dia_id: otroDia })
    expect(error?.code).toBe('42501')
  })

  // La otra mitad de la regla anterior, y la que se rompe si alguien
  // "simplifica" el trigger: el `on delete set null` de rutina_dia_id es un
  // update de esta fila, y tiene que pasar.
  it('borrar el día de la rutina no falla y deja la sesión como libre', async () => {
    const { error } = await admin.from('rutina_dias').delete().eq('id', dia)
    expect(error).toBeNull()

    const { data } = await admin.from('sesiones').select('rutina_dia_id').eq('id', sesion).single()
    expect(data!.rutina_dia_id).toBeNull()
  })
})

describe('mejores marcas y la vez pasada', () => {
  let e: Escenario
  let x: string
  let y: string

  beforeAll(async () => {
    e = await crearEscenario()
    const { data } = await admin
      .from('ejercicios').select('id').is('gym_id', null).order('nombre').limit(2)
    x = data![0]!.id
    y = data![1]!.id

    // Ayer: X 60×10 y 62.5×8 (volumen 1100), Y 20×12.
    const ayer = await sesionDe(e.gymA, e.socioAMembresiaId, '2026-10-07T10:00:00Z')
    await serieEn(ayer, x, { numero_serie: 1, peso_kg: 60, repeticiones: 10 })
    await serieEn(ayer, x, { numero_serie: 2, peso_kg: 62.5, repeticiones: 8 })
    await serieEn(ayer, y, { numero_serie: 1, peso_kg: 20, repeticiones: 12 })

    // Hoy: X 65×5 y 60×5 (volumen 625: más peso, menos volumen). Y una serie
    // de 100 kg sin completar, que no puede contar para nada.
    const hoy = await sesionDe(e.gymA, e.socioAMembresiaId, '2026-10-08T10:00:00Z')
    await serieEn(hoy, x, { numero_serie: 1, peso_kg: 65, repeticiones: 5 })
    await serieEn(hoy, x, { numero_serie: 2, peso_kg: 60, repeticiones: 5 })
    await serieEn(hoy, x, { numero_serie: 3, peso_kg: 100, repeticiones: 1, completada: false })
  })

  it('las marcas de X: el mejor peso de hoy y el mejor volumen de ayer', async () => {
    const { data, error } = await e.comoSocioA
      .from('mejores_marcas').select('*')
      .eq('membership_id', e.socioAMembresiaId).eq('ejercicio_id', x).single()
    expect(error).toBeNull()
    expect(Number(data!.mejor_peso_kg)).toBe(65)
    expect(Number(data!.mejor_volumen_kg)).toBe(1100)
    expect(data!.sesiones).toBe(2)
  })

  it('otro socio no ve las marcas ajenas: la vista respeta la RLS', async () => {
    const { data } = await e.comoSocioA2
      .from('mejores_marcas').select('*').eq('membership_id', e.socioAMembresiaId)
    expect(data).toEqual([])
  })

  it('el entrenador sí las ve', async () => {
    const { data } = await e.comoEntrenadorA
      .from('mejores_marcas').select('ejercicio_id').eq('membership_id', e.socioAMembresiaId)
    expect(data).toHaveLength(2)
  })

  it('la vez pasada trae la sesión más reciente de cada ejercicio, sin las incompletas', async () => {
    const { data, error } = await e.comoSocioA.rpc('ultima_vez', { p_ejercicio_ids: [x, y] })
    expect(error).toBeNull()

    const deX = data!.filter((f) => f.ejercicio_id === x)
    expect(deX.map((f) => [f.numero_serie, Number(f.peso_kg), f.repeticiones]))
      .toEqual([[1, 65, 5], [2, 60, 5]])

    // Y no se hizo hoy: viene de ayer.
    const deY = data!.filter((f) => f.ejercicio_id === y)
    expect(deY.map((f) => Number(f.peso_kg))).toEqual([20])
  })

  // El entrenador VE las sesiones del socio, pero "la vez pasada" es la de
  // quien llama, no la de cualquiera que pueda leer.
  it('la vez pasada es la propia: el entrenador no recibe la del socio', async () => {
    const { data } = await e.comoEntrenadorA.rpc('ultima_vez', { p_ejercicio_ids: [x, y] })
    expect(data).toEqual([])
  })

  it('otro socio no recibe nada', async () => {
    const { data } = await e.comoSocioA2.rpc('ultima_vez', { p_ejercicio_ids: [x, y] })
    expect(data).toEqual([])
  })
})

describe('últimas sesiones para la ficha del panel', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
    const ejercicio = await unEjercicio()

    // Cuatro sesiones del socio A: la vista tiene que devolver las tres últimas.
    for (const dia of ['01', '02', '03']) {
      await sesionDe(e.gymA, e.socioAMembresiaId, `2026-10-${dia}T10:00:00Z`)
    }
    const ultima = await sesionDe(e.gymA, e.socioAMembresiaId, '2026-10-04T10:00:00Z')
    await serieEn(ultima, ejercicio, { numero_serie: 1 })
    await serieEn(ultima, ejercicio, { numero_serie: 2, completada: false })

    await sesionDe(e.gymA, e.socioA2MembresiaId, '2026-10-04T10:00:00Z')
    await sesionDe(e.gymB, e.socioBMembresiaId, '2026-10-04T10:00:00Z')
  })

  it('el entrenador ve las tres más recientes de cada socio, con sus series completadas', async () => {
    const { data, error } = await e.comoEntrenadorA
      .from('ultimas_sesiones').select('*')
      .eq('membership_id', e.socioAMembresiaId)
      .order('inicio', { ascending: false })
    expect(error).toBeNull()
    expect(data).toHaveLength(3)
    expect(data![0]!.inicio).toContain('2026-10-04')
    expect(data![0]!.series).toBe(1)
    expect(data![0]!.dia_nombre).toBeNull()
  })

  it('ve también las del otro socio: cada uno tiene sus tres', async () => {
    const { data } = await e.comoEntrenadorA
      .from('ultimas_sesiones').select('id').eq('membership_id', e.socioA2MembresiaId)
    expect(data).toHaveLength(1)
  })

  it('el gimnasio A no ve las del B: la vista respeta la RLS', async () => {
    const { data } = await e.comoAdminA
      .from('ultimas_sesiones').select('id').eq('membership_id', e.socioBMembresiaId)
    expect(data).toEqual([])
  })

  it('un socio ve solo las suyas', async () => {
    const { data } = await e.comoSocioA2.from('ultimas_sesiones').select('membership_id')
    expect(data!.every((f) => f.membership_id === e.socioA2MembresiaId)).toBe(true)
  })
})
