import { beforeAll, describe, expect, it } from 'vitest'
import { admin, crearEscenario, type Escenario } from './ayudas'

describe('esquema de rutinas', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
  })

  it('una plantilla no puede tener propietario', async () => {
    const { error } = await admin.from('rutinas').insert({
      gym_id: e.gymA,
      nombre: 'Full body',
      tipo: 'plantilla',
      propietario_id: e.socioAMembresiaId,
    })
    expect(error).not.toBeNull()
  })

  it('una rutina activa exige propietario', async () => {
    const { error } = await admin.from('rutinas').insert({
      gym_id: e.gymA,
      nombre: 'Full body',
      tipo: 'activa',
      propietario_id: null,
    })
    expect(error).not.toBeNull()
  })

  it('una plantilla no puede estar asignada a nadie', async () => {
    const { error } = await admin.from('rutinas').insert({
      gym_id: e.gymA,
      nombre: 'Full body',
      tipo: 'plantilla',
      asignada_por: e.entrenadorAMembresiaId,
    })
    expect(error).not.toBeNull()
  })

  it('acepta una plantilla bien formada con sus días y ejercicios', async () => {
    const { data: rutina, error } = await admin
      .from('rutinas')
      .insert({ gym_id: e.gymA, nombre: 'Full body', tipo: 'plantilla' })
      .select('id')
      .single()
    expect(error).toBeNull()

    const { data: dia, error: errorDia } = await admin
      .from('rutina_dias')
      .insert({ rutina_id: rutina!.id, orden: 1, nombre: 'Día 1 — Pecho' })
      .select('id')
      .single()
    expect(errorDia).toBeNull()

    const { data: ejercicio } = await admin
      .from('ejercicios')
      .select('id')
      .limit(1)
      .single()

    const { error: errorEj } = await admin.from('rutina_ejercicios').insert({
      rutina_dia_id: dia!.id,
      ejercicio_id: ejercicio!.id,
      orden: 1,
      series: 4,
      repeticiones: '8-12',
    })
    expect(errorEj).toBeNull()
  })

  it('no acepta series en cero', async () => {
    const { data: rutina } = await admin
      .from('rutinas')
      .insert({ gym_id: e.gymA, nombre: 'Otra', tipo: 'plantilla' })
      .select('id')
      .single()
    const { data: dia } = await admin
      .from('rutina_dias')
      .insert({ rutina_id: rutina!.id, orden: 1, nombre: 'Día 1' })
      .select('id')
      .single()
    const { data: ejercicio } = await admin
      .from('ejercicios').select('id').limit(1).single()

    const { error } = await admin.from('rutina_ejercicios').insert({
      rutina_dia_id: dia!.id,
      ejercicio_id: ejercicio!.id,
      orden: 1,
      series: 0,
      repeticiones: '8-12',
    })
    expect(error).not.toBeNull()
  })
})

describe('permisos de rutinas', () => {
  let e: Escenario
  let plantillaA: string
  let propiaDelSocio: string
  let asignadaAlSocio: string
  let diaDePlantilla: string

  beforeAll(async () => {
    e = await crearEscenario()

    const { data: p } = await admin
      .from('rutinas')
      .insert({ gym_id: e.gymA, nombre: 'Plantilla del gym', tipo: 'plantilla' })
      .select('id').single()
    plantillaA = p!.id

    const { data: d } = await admin
      .from('rutina_dias')
      .insert({ rutina_id: plantillaA, orden: 1, nombre: 'Día 1' })
      .select('id').single()
    diaDePlantilla = d!.id

    const { data: propia } = await admin
      .from('rutinas')
      .insert({
        gym_id: e.gymA, nombre: 'La mía', tipo: 'activa',
        propietario_id: e.socioAMembresiaId,
      })
      .select('id').single()
    propiaDelSocio = propia!.id

    const { data: asignada } = await admin
      .from('rutinas')
      .insert({
        gym_id: e.gymA, nombre: 'La que me dieron', tipo: 'activa',
        propietario_id: e.socioAMembresiaId,
        asignada_por: e.entrenadorAMembresiaId,
      })
      .select('id').single()
    asignadaAlSocio = asignada!.id
  })

  const nombreDe = async (cliente: typeof e.comoSocioA, id: string) => {
    const { data } = await cliente.from('rutinas').select('id').eq('id', id)
    return data ?? []
  }

  const renombrar = async (cliente: typeof e.comoSocioA, id: string) => {
    const { data } = await cliente
      .from('rutinas').update({ nombre: 'Renombrada' }).eq('id', id).select('id')
    return data ?? []
  }

  // --- Lectura -------------------------------------------------------------

  it('el socio ve las plantillas de su gimnasio: es el catálogo', async () => {
    expect(await nombreDe(e.comoSocioA, plantillaA)).toHaveLength(1)
  })

  it('el socio ve su propia rutina activa', async () => {
    expect(await nombreDe(e.comoSocioA, propiaDelSocio)).toHaveLength(1)
  })

  it('otro socio del mismo gimnasio NO ve la rutina activa ajena', async () => {
    expect(await nombreDe(e.comoSocioA2, propiaDelSocio)).toHaveLength(0)
  })

  it('el entrenador ve la rutina activa del socio, incluso la que se armó solo', async () => {
    expect(await nombreDe(e.comoEntrenadorA, propiaDelSocio)).toHaveLength(1)
  })

  it('el socio del gimnasio B no ve nada del gimnasio A', async () => {
    expect(await nombreDe(e.comoSocioB, plantillaA)).toHaveLength(0)
    expect(await nombreDe(e.comoSocioB, propiaDelSocio)).toHaveLength(0)
  })

  it('el socio del gimnasio B tampoco ve los días de una rutina del A', async () => {
    const { data } = await e.comoSocioB
      .from('rutina_dias').select('id').eq('id', diaDePlantilla)
    expect(data ?? []).toHaveLength(0)
  })

  // --- Escritura: la matriz ------------------------------------------------

  it('plantilla: la edita el entrenador', async () => {
    expect(await renombrar(e.comoEntrenadorA, plantillaA)).toHaveLength(1)
  })

  it('plantilla: NO la edita el socio', async () => {
    expect(await renombrar(e.comoSocioA, plantillaA)).toHaveLength(0)
  })

  it('activa propia: la edita su dueño', async () => {
    expect(await renombrar(e.comoSocioA, propiaDelSocio)).toHaveLength(1)
  })

  it('activa propia: NO la edita el entrenador', async () => {
    expect(await renombrar(e.comoEntrenadorA, propiaDelSocio)).toHaveLength(0)
  })

  it('activa propia: NO la edita otro socio', async () => {
    expect(await renombrar(e.comoSocioA2, propiaDelSocio)).toHaveLength(0)
  })

  it('activa asignada: la edita su dueño', async () => {
    expect(await renombrar(e.comoSocioA, asignadaAlSocio)).toHaveLength(1)
  })

  it('activa asignada: la edita el entrenador que se la dio', async () => {
    expect(await renombrar(e.comoEntrenadorA, asignadaAlSocio)).toHaveLength(1)
  })

  it('activa asignada: NO la edita otro socio', async () => {
    expect(await renombrar(e.comoSocioA2, asignadaAlSocio)).toHaveLength(0)
  })

  // --- Escritura: alta -----------------------------------------------------

  it('el socio NO puede crear una plantilla', async () => {
    const { error } = await e.comoSocioA.from('rutinas').insert({
      gym_id: e.gymA, nombre: 'Trucha', tipo: 'plantilla',
    })
    expect(error).not.toBeNull()
  })

  it('el socio puede crearse una rutina activa propia', async () => {
    const { error } = await e.comoSocioA.from('rutinas').insert({
      gym_id: e.gymA, nombre: 'La que me armo', tipo: 'activa',
      propietario_id: e.socioAMembresiaId,
    })
    expect(error).toBeNull()
  })

  it('el socio NO puede crearse una rutina que diga que se la asignaron', async () => {
    const { error } = await e.comoSocioA.from('rutinas').insert({
      gym_id: e.gymA, nombre: 'Falsa asignada', tipo: 'activa',
      propietario_id: e.socioAMembresiaId,
      asignada_por: e.entrenadorAMembresiaId,
    })
    expect(error).not.toBeNull()
  })

  it('el socio NO puede crearle una rutina a otro socio', async () => {
    const { error } = await e.comoSocioA.from('rutinas').insert({
      gym_id: e.gymA, nombre: 'Para el otro', tipo: 'activa',
      propietario_id: e.socioA2MembresiaId,
    })
    expect(error).not.toBeNull()
  })

  it('el entrenador puede asignarle una rutina a un socio de su gimnasio', async () => {
    const { error } = await e.comoEntrenadorA.from('rutinas').insert({
      gym_id: e.gymA, nombre: 'Asignada por el entrenador', tipo: 'activa',
      propietario_id: e.socioA2MembresiaId,
      asignada_por: e.entrenadorAMembresiaId,
    })
    expect(error).toBeNull()
  })

  it('el entrenador NO puede asignarle una rutina a alguien de otro gimnasio', async () => {
    const { data: membresiaGymB } = await admin
      .from('memberships').select('id').eq('gym_id', e.gymB).single()

    const { error } = await e.comoEntrenadorA.from('rutinas').insert({
      gym_id: e.gymA, nombre: 'Asignada trucha', tipo: 'activa',
      propietario_id: membresiaGymB!.id,
      asignada_por: e.entrenadorAMembresiaId,
    })
    expect(error).not.toBeNull()
  })

  it('no se puede agregar a una rutina un ejercicio de otro gimnasio', async () => {
    const { data: ejercicioB } = await admin
      .from('ejercicios')
      .insert({
        gym_id: e.gymB, nombre: 'Privado del B',
        grupo_muscular: 'pecho', equipamiento: 'barra',
      })
      .select('id').single()

    const { data: miDia } = await admin
      .from('rutina_dias')
      .insert({ rutina_id: propiaDelSocio, orden: 1, nombre: 'Día 1' })
      .select('id').single()

    const { error } = await e.comoSocioA.from('rutina_ejercicios').insert({
      rutina_dia_id: miDia!.id,
      ejercicio_id: ejercicioB!.id,
      orden: 1, series: 3, repeticiones: '10',
    })
    expect(error).not.toBeNull()
  })
})

describe('columnas inmutables de rutinas', () => {
  let e: Escenario
  let asignada: string
  let plantilla: string

  beforeAll(async () => {
    e = await crearEscenario()

    const { data: p } = await admin
      .from('rutinas')
      .insert({ gym_id: e.gymA, nombre: 'Plantilla', tipo: 'plantilla' })
      .select('id').single()
    plantilla = p!.id

    const { data: a } = await admin
      .from('rutinas')
      .insert({
        gym_id: e.gymA, nombre: 'Asignada', tipo: 'activa',
        propietario_id: e.socioAMembresiaId,
        asignada_por: e.entrenadorAMembresiaId,
        origen_id: plantilla,
      })
      .select('id').single()
    asignada = a!.id
  })

  it('el socio no puede sacarse al entrenador de encima', async () => {
    const { error } = await e.comoSocioA
      .from('rutinas').update({ asignada_por: null }).eq('id', asignada)
    expect(error).not.toBeNull()
  })

  it('el socio no puede pasarle su rutina a otro', async () => {
    const { error } = await e.comoSocioA
      .from('rutinas')
      .update({ propietario_id: e.socioA2MembresiaId })
      .eq('id', asignada)
    expect(error).not.toBeNull()
  })

  it('nadie puede mudar una rutina de gimnasio ni cambiarle el tipo', async () => {
    const { error: errorGym } = await admin
      .from('rutinas').update({ gym_id: e.gymB }).eq('id', asignada)
    expect(errorGym).not.toBeNull()

    const { error: errorTipo } = await admin
      .from('rutinas').update({ tipo: 'activa' }).eq('id', plantilla)
    expect(errorTipo).not.toBeNull()

    // Se mira el código y no solo que haya error: el trigger tira 42501, y
    // pasar una plantilla a 'activa' tiene además el check
    // rutinas_propietario_segun_tipo (23514) esperándola más atrás. Si
    // alguien sacara `tipo` del trigger, el test seguiría verde por esa otra
    // vía y la regresión pasaría sin que nadie la vea.
    expect(errorGym!.code).toBe('42501')
    expect(errorTipo!.code).toBe('42501')
  })

  it('origen_id no se puede repuntar a otra rutina', async () => {
    const { data: otra } = await admin
      .from('rutinas')
      .insert({ gym_id: e.gymA, nombre: 'Otra plantilla', tipo: 'plantilla' })
      .select('id').single()

    const { error } = await admin
      .from('rutinas').update({ origen_id: otra!.id }).eq('id', asignada)
    expect(error).not.toBeNull()
  })

  // La otra mitad de la regla, y la que se rompe si alguien "simplifica" el
  // trigger más adelante: la FK de origen_id es `on delete set null`, y esa
  // acción se ejecuta como un update de esta fila.
  it('borrar la plantilla de origen no falla y no toca la copia', async () => {
    const { error } = await admin.from('rutinas').delete().eq('id', plantilla)
    expect(error).toBeNull()

    const { data } = await admin
      .from('rutinas').select('id, origen_id, nombre').eq('id', asignada).single()
    expect(data!.origen_id).toBeNull()
    expect(data!.nombre).toBe('Asignada')
  })

  it('el estado sí se puede cambiar: archivar tiene que seguir andando', async () => {
    const { error } = await e.comoSocioA
      .from('rutinas').update({ estado: 'archivada' }).eq('id', asignada)
    expect(error).toBeNull()
  })
})

describe('tomar y duplicar rutinas', () => {
  let e: Escenario
  let plantilla: string

  beforeAll(async () => {
    e = await crearEscenario()

    const { data: p } = await admin
      .from('rutinas')
      .insert({
        gym_id: e.gymA, nombre: 'Full body 3 días', tipo: 'plantilla',
        objetivo: 'hipertrofia', nivel: 'principiante',
      })
      .select('id').single()
    plantilla = p!.id

    const { data: ejercicios } = await admin
      .from('ejercicios').select('id').limit(2)

    for (const orden of [1, 2]) {
      const { data: dia } = await admin
        .from('rutina_dias')
        .insert({ rutina_id: plantilla, orden, nombre: `Día ${orden}` })
        .select('id').single()

      await admin.from('rutina_ejercicios').insert([
        {
          rutina_dia_id: dia!.id, ejercicio_id: ejercicios![0].id,
          orden: 1, series: 4, repeticiones: '8-12', descanso_seg: 90,
        },
        {
          rutina_dia_id: dia!.id, ejercicio_id: ejercicios![1].id,
          orden: 2, series: 3, repeticiones: '12', descanso_seg: 60,
        },
      ])
    }
  })

  it('el socio toma una plantilla y se copia el árbol entero', async () => {
    const { data: nuevaId, error } = await e.comoSocioA.rpc('tomar_rutina', {
      p_plantilla_id: plantilla,
      p_propietario_id: e.socioAMembresiaId,
    })
    expect(error).toBeNull()

    const { data: copia } = await admin
      .from('rutinas')
      .select('tipo, propietario_id, origen_id, asignada_por, objetivo, nombre')
      .eq('id', nuevaId).single()

    expect(copia).toMatchObject({
      tipo: 'activa',
      propietario_id: e.socioAMembresiaId,
      origen_id: plantilla,
      asignada_por: null,
      objetivo: 'hipertrofia',
      nombre: 'Full body 3 días',
    })

    const { data: dias } = await admin
      .from('rutina_dias').select('id, orden, nombre')
      .eq('rutina_id', nuevaId).order('orden')
    expect(dias).toHaveLength(2)
    expect(dias![0].nombre).toBe('Día 1')

    const { data: ejercicios } = await admin
      .from('rutina_ejercicios')
      .select('orden, series, repeticiones, descanso_seg')
      .eq('rutina_dia_id', dias![0].id).order('orden')
    expect(ejercicios).toHaveLength(2)
    expect(ejercicios![0]).toMatchObject({
      orden: 1, series: 4, repeticiones: '8-12', descanso_seg: 90,
    })
  })

  it('tomar dos veces la misma plantilla falla', async () => {
    const { error } = await e.comoSocioA.rpc('tomar_rutina', {
      p_plantilla_id: plantilla,
      p_propietario_id: e.socioAMembresiaId,
    })
    expect(error).not.toBeNull()
    // 23505 = unique_violation. La pantalla lo traduce a "Ya tenés esta rutina".
    expect(error!.code).toBe('23505')
  })

  it('el socio del gimnasio B no puede copiar una plantilla del A', async () => {
    const { error } = await e.comoSocioB.rpc('tomar_rutina', {
      p_plantilla_id: plantilla,
      p_propietario_id: e.socioAMembresiaId,
    })
    expect(error).not.toBeNull()
  })

  it('el entrenador le asigna la plantilla a un socio y queda firmada', async () => {
    const { data: nuevaId, error } = await e.comoEntrenadorA.rpc('tomar_rutina', {
      p_plantilla_id: plantilla,
      p_propietario_id: e.socioA2MembresiaId,
    })
    expect(error).toBeNull()

    const { data: copia } = await admin
      .from('rutinas').select('propietario_id, asignada_por')
      .eq('id', nuevaId).single()

    expect(copia).toMatchObject({
      propietario_id: e.socioA2MembresiaId,
      asignada_por: e.entrenadorAMembresiaId,
    })
  })

  it('un socio no puede asignarle una rutina a otro socio', async () => {
    const { error } = await e.comoSocioA.rpc('tomar_rutina', {
      p_plantilla_id: plantilla,
      p_propietario_id: e.socioA2MembresiaId,
    })
    expect(error).not.toBeNull()
  })

  it('duplicar una plantilla deja origen_id nulo', async () => {
    const { data: nuevaId, error } = await e.comoEntrenadorA
      .rpc('duplicar_plantilla', { p_rutina_id: plantilla })
    expect(error).toBeNull()

    const { data: copia } = await admin
      .from('rutinas').select('tipo, origen_id, propietario_id, nombre')
      .eq('id', nuevaId).single()

    expect(copia).toMatchObject({
      tipo: 'plantilla', origen_id: null, propietario_id: null,
    })
    expect(copia!.nombre).toBe('Full body 3 días (copia)')

    const { data: dias } = await admin
      .from('rutina_dias').select('id').eq('rutina_id', nuevaId)
    expect(dias).toHaveLength(2)
  })

  it('el socio no puede duplicar una plantilla', async () => {
    const { error } = await e.comoSocioA
      .rpc('duplicar_plantilla', { p_rutina_id: plantilla })
    expect(error).not.toBeNull()
  })
})

// Red para el bug de 42501 que encontramos en esta tarea: insert ... returning
// exige que la fila nueva pase la política de SELECT. Si esa política buscara
// la fila por id (como hacía puedo_ver_rutina antes del arreglo), el
// RETURNING siempre fallaba, porque esa búsqueda corre con el snapshot de la
// sentencia y todavía no ve la fila que la propia sentencia está insertando.
// rutinas_leer ahora evalúa puedo_ver_rutina_fila(gym_id, tipo, propietario_id)
// directo sobre las columnas de la fila, sin volver a buscarla — así un
// insert con .select() (lo que hacen las pantallas de las tareas 7 a 11 para
// conseguir el id recién creado) funciona.
describe('insert con returning sobre rutinas', () => {
  it('un insert con select devuelve la fila recién creada', async () => {
    const e = await crearEscenario()

    const { data, error } = await e.comoSocioA
      .from('rutinas')
      .insert({
        gym_id: e.gymA, nombre: 'La que me armo', tipo: 'activa',
        propietario_id: e.socioAMembresiaId,
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    expect(data!.id).toBeDefined()
  })
})

describe('reordenar', () => {
  let e: Escenario
  let rutina: string
  let dias: string[]
  // La carga el primer test de ejercicios y la usan los cuatro rechazos de
  // abajo, como los tests de días se apoyan en el orden que dejó el anterior.
  let ejerciciosDelDia: string[]

  beforeAll(async () => {
    e = await crearEscenario()

    const { data: r } = await admin
      .from('rutinas')
      .insert({
        gym_id: e.gymA, nombre: 'Mía', tipo: 'activa',
        propietario_id: e.socioAMembresiaId,
      })
      .select('id').single()
    rutina = r!.id

    const { data: creados } = await admin
      .from('rutina_dias')
      .insert([
        { rutina_id: rutina, orden: 1, nombre: 'Día 1' },
        { rutina_id: rutina, orden: 2, nombre: 'Día 2' },
        { rutina_id: rutina, orden: 3, nombre: 'Día 3' },
      ])
      .select('id, orden')
    dias = creados!.sort((a, b) => a.orden - b.orden).map((d) => d.id)
  })

  it('reescribe el orden según la posición en el arreglo', async () => {
    const { error } = await e.comoSocioA.rpc('reordenar_dias', {
      p_rutina_id: rutina,
      p_ids: [dias[2], dias[0], dias[1]],
    })
    expect(error).toBeNull()

    const { data } = await admin
      .from('rutina_dias').select('id, orden').eq('rutina_id', rutina).order('orden')
    expect(data!.map((d) => d.id)).toEqual([dias[2], dias[0], dias[1]])
    expect(data!.map((d) => d.orden)).toEqual([1, 2, 3])
  })

  it('rechaza una lista incompleta: dejaría huecos en el orden', async () => {
    const { error } = await e.comoSocioA.rpc('reordenar_dias', {
      p_rutina_id: rutina,
      p_ids: [dias[0], dias[1]],
    })
    expect(error).not.toBeNull()
  })

  it('rechaza una lista con repetidos', async () => {
    const { error } = await e.comoSocioA.rpc('reordenar_dias', {
      p_rutina_id: rutina,
      p_ids: [dias[0], dias[0], dias[1]],
    })
    expect(error).not.toBeNull()
  })

  it('rechaza un día que no es de esta rutina: no se roba un día ajeno', async () => {
    const { data: otra } = await admin
      .from('rutinas')
      .insert({
        gym_id: e.gymA, nombre: 'Otra', tipo: 'activa',
        propietario_id: e.socioAMembresiaId,
      })
      .select('id').single()
    const { data: ajeno } = await admin
      .from('rutina_dias')
      .insert({ rutina_id: otra!.id, orden: 1, nombre: 'Ajeno' })
      .select('id').single()

    const { error } = await e.comoSocioA.rpc('reordenar_dias', {
      p_rutina_id: rutina,
      p_ids: [dias[0], dias[1], ajeno!.id],
    })
    expect(error).not.toBeNull()
  })

  it('no lo puede hacer alguien que no puede editar la rutina', async () => {
    const { error } = await e.comoSocioA2.rpc('reordenar_dias', {
      p_rutina_id: rutina,
      p_ids: [dias[0], dias[1], dias[2]],
    })
    expect(error).not.toBeNull()
  })

  it('reordena los ejercicios de un día', async () => {
    const { data: ejercicios } = await admin
      .from('ejercicios').select('id').limit(2)

    const { data: creados } = await admin
      .from('rutina_ejercicios')
      .insert([
        {
          rutina_dia_id: dias[0], ejercicio_id: ejercicios![0].id,
          orden: 1, series: 3, repeticiones: '10',
        },
        {
          rutina_dia_id: dias[0], ejercicio_id: ejercicios![1].id,
          orden: 2, series: 3, repeticiones: '10',
        },
      ])
      .select('id, orden')
    const ids = creados!.sort((a, b) => a.orden - b.orden).map((x) => x.id)

    const { error } = await e.comoSocioA.rpc('reordenar_ejercicios', {
      p_dia_id: dias[0],
      p_ids: [ids[1], ids[0]],
    })
    expect(error).toBeNull()

    const { data } = await admin
      .from('rutina_ejercicios').select('id, orden')
      .eq('rutina_dia_id', dias[0]).order('orden')
    expect(data!.map((x) => x.id)).toEqual([ids[1], ids[0]])

    ejerciciosDelDia = [ids[1], ids[0]]
  })

  // Los mismos cuatro rechazos que arriba, pero sobre reordenar_ejercicios:
  // es otra función, con su propia copia de la validación, y una permutación
  // mal verificada acá deja exactamente los mismos huecos en el orden.
  it('los ejercicios: rechaza una lista incompleta', async () => {
    const { error } = await e.comoSocioA.rpc('reordenar_ejercicios', {
      p_dia_id: dias[0],
      p_ids: [ejerciciosDelDia[0]],
    })
    expect(error).not.toBeNull()
  })

  it('los ejercicios: rechaza una lista con repetidos', async () => {
    const { error } = await e.comoSocioA.rpc('reordenar_ejercicios', {
      p_dia_id: dias[0],
      p_ids: [ejerciciosDelDia[0], ejerciciosDelDia[0]],
    })
    expect(error).not.toBeNull()
  })

  it('los ejercicios: rechaza uno que no es de este día', async () => {
    const { data: ejercicio } = await admin
      .from('ejercicios').select('id').limit(1).single()
    const { data: ajeno } = await admin
      .from('rutina_ejercicios')
      .insert({
        rutina_dia_id: dias[1], ejercicio_id: ejercicio!.id,
        orden: 1, series: 3, repeticiones: '10',
      })
      .select('id').single()

    const { error } = await e.comoSocioA.rpc('reordenar_ejercicios', {
      p_dia_id: dias[0],
      p_ids: [ejerciciosDelDia[0], ajeno!.id],
    })
    expect(error).not.toBeNull()
  })

  it('los ejercicios: no los reordena quien no puede editar la rutina', async () => {
    const { error } = await e.comoSocioA2.rpc('reordenar_ejercicios', {
      p_dia_id: dias[0],
      p_ids: [ejerciciosDelDia[1], ejerciciosDelDia[0]],
    })
    expect(error).not.toBeNull()
  })
})

// Prioridad 1 de la sección 9 del diseño: "tabla por tabla que ninguno lee ni
// escribe lo del otro. Con atención a las hijas, que es donde es fácil que se
// escape porque no tienen gym_id propio."
//
// La lectura de las hijas ya está cubierta más arriba. Lo que faltaba era la
// ESCRITURA negada: hasta acá, casi todo lo que toca rutina_dias y
// rutina_ejercicios pasa por `admin` —que saltea RLS— o por las RPC, así que
// las políticas de insert, update y delete de las dos hijas no se probaban
// desde una sesión de usuario que no tuviera permiso.
describe('escritura negada sobre las tablas hijas', () => {
  let e: Escenario
  let plantillaA: string
  let rutinaDelSocio: string
  let diaDelSocio: string
  let ejercicioEnElDia: string
  let ejercicioGlobal: string
  let otroEjercicioGlobal: string
  let ejercicioDelB: string

  beforeAll(async () => {
    e = await crearEscenario()

    const { data: globales } = await admin
      .from('ejercicios').select('id').is('gym_id', null).limit(2)
    ejercicioGlobal = globales![0].id
    otroEjercicioGlobal = globales![1].id

    const { data: ejB } = await admin
      .from('ejercicios')
      .insert({
        gym_id: e.gymB, nombre: 'Privado del B',
        grupo_muscular: 'pecho', equipamiento: 'barra',
      })
      .select('id').single()
    ejercicioDelB = ejB!.id

    const { data: p } = await admin
      .from('rutinas')
      .insert({ gym_id: e.gymA, nombre: 'Plantilla del gym', tipo: 'plantilla' })
      .select('id').single()
    plantillaA = p!.id

    const { data: r } = await admin
      .from('rutinas')
      .insert({
        gym_id: e.gymA, nombre: 'La del socio A', tipo: 'activa',
        propietario_id: e.socioAMembresiaId,
      })
      .select('id').single()
    rutinaDelSocio = r!.id

    const { data: d } = await admin
      .from('rutina_dias')
      .insert({ rutina_id: rutinaDelSocio, orden: 1, nombre: 'Día 1' })
      .select('id').single()
    diaDelSocio = d!.id

    const { data: re } = await admin
      .from('rutina_ejercicios')
      .insert({
        rutina_dia_id: diaDelSocio, ejercicio_id: ejercicioGlobal,
        orden: 1, series: 3, repeticiones: '10',
      })
      .select('id').single()
    ejercicioEnElDia = re!.id
  })

  // --- insert --------------------------------------------------------------

  it('el socio del gimnasio B no puede colgarle un día a una rutina del A', async () => {
    const { error: enLaActiva } = await e.comoSocioB.from('rutina_dias').insert({
      rutina_id: rutinaDelSocio, orden: 9, nombre: 'Metido desde el B',
    })
    expect(enLaActiva).not.toBeNull()

    const { error: enLaPlantilla } = await e.comoSocioB.from('rutina_dias').insert({
      rutina_id: plantillaA, orden: 9, nombre: 'Metido desde el B',
    })
    expect(enLaPlantilla).not.toBeNull()
  })

  it('el socio no puede agregarle un día a una plantilla: la lee, no la escribe', async () => {
    const { error } = await e.comoSocioA.from('rutina_dias').insert({
      rutina_id: plantillaA, orden: 9, nombre: 'Día que no me toca',
    })
    expect(error).not.toBeNull()
  })

  it('otro socio del mismo gimnasio no puede meterle un ejercicio a un día ajeno', async () => {
    const { error } = await e.comoSocioA2.from('rutina_ejercicios').insert({
      rutina_dia_id: diaDelSocio, ejercicio_id: ejercicioGlobal,
      orden: 9, series: 3, repeticiones: '10',
    })
    expect(error).not.toBeNull()
  })

  it('el socio del gimnasio B tampoco puede meterle un ejercicio a un día del A', async () => {
    const { error } = await e.comoSocioB.from('rutina_ejercicios').insert({
      rutina_dia_id: diaDelSocio, ejercicio_id: ejercicioGlobal,
      orden: 9, series: 3, repeticiones: '10',
    })
    expect(error).not.toBeNull()
  })

  // --- delete --------------------------------------------------------------
  //
  // Un delete que la política niega no devuelve error: devuelve cero filas.
  // Por eso acá se mira lo que volvió del .select() y, además, que la fila
  // siga estando.

  it('otro socio no puede borrar un día ajeno', async () => {
    const { data, error } = await e.comoSocioA2
      .from('rutina_dias').delete().eq('id', diaDelSocio).select('id')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)

    const { data: sigue } = await admin
      .from('rutina_dias').select('id').eq('id', diaDelSocio)
    expect(sigue).toHaveLength(1)
  })

  it('otro socio no puede borrar un ejercicio de un día ajeno', async () => {
    const { data, error } = await e.comoSocioA2
      .from('rutina_ejercicios').delete().eq('id', ejercicioEnElDia).select('id')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)

    const { data: sigue } = await admin
      .from('rutina_ejercicios').select('id').eq('id', ejercicioEnElDia)
    expect(sigue).toHaveLength(1)
  })

  it('el socio del gimnasio B no puede borrar un día del A', async () => {
    const { data, error } = await e.comoSocioB
      .from('rutina_dias').delete().eq('id', diaDelSocio).select('id')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  // --- update --------------------------------------------------------------

  it('otro socio no puede renombrarle un día ajeno', async () => {
    const { data, error } = await e.comoSocioA2
      .from('rutina_dias').update({ nombre: 'Te lo cambio' })
      .eq('id', diaDelSocio).select('id')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  // El with check de rutina_ejercicios_editar repite el exists contra
  // ejercicios que ya tenía el insert. Sin eso se podía entrar por la puerta
  // legítima —un ejercicio visible— y después mover ejercicio_id a uno
  // privado de otro gimnasio. No hay fuga de lectura, pero queda una
  // referencia cruzada que, por el `on delete restrict`, le impide al otro
  // gimnasio borrar su propio ejercicio.
  it('no se puede repuntar ejercicio_id a un ejercicio de otro gimnasio', async () => {
    const { error } = await e.comoSocioA
      .from('rutina_ejercicios')
      .update({ ejercicio_id: ejercicioDelB })
      .eq('id', ejercicioEnElDia)
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data } = await admin
      .from('rutina_ejercicios').select('ejercicio_id').eq('id', ejercicioEnElDia).single()
    expect(data!.ejercicio_id).toBe(ejercicioGlobal)
  })

  it('sí se puede cambiarlo por otro que se ve: el arreglo no rompe lo legítimo', async () => {
    const { data, error } = await e.comoSocioA
      .from('rutina_ejercicios')
      .update({ ejercicio_id: otroEjercicioGlobal })
      .eq('id', ejercicioEnElDia).select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  // Va al final porque borra los datos que usan los tests de arriba. Es el
  // control positivo de las dos políticas de delete: sin él, todo lo negado
  // más arriba daría verde también con las políticas rotas de la otra punta,
  // las que no dejan borrar nada a nadie.
  it('el dueño sí puede borrar su ejercicio y su día', async () => {
    const { data: borradoEjercicio } = await e.comoSocioA
      .from('rutina_ejercicios').delete().eq('id', ejercicioEnElDia).select('id')
    expect(borradoEjercicio).toHaveLength(1)

    const { data: borradoDia } = await e.comoSocioA
      .from('rutina_dias').delete().eq('id', diaDelSocio).select('id')
    expect(borradoDia).toHaveLength(1)
  })
})
