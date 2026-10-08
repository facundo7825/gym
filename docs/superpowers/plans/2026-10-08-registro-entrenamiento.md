# Registro de entrenamiento (etapa 3) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el socio registre su entrenamiento serie por serie —también sin señal—, se entere en el momento cuando bate un récord, y vea su historial y la evolución de cada ejercicio; y que el personal vea las últimas sesiones del socio en el panel.

**Architecture:** Dos tablas nuevas, `sesiones` y `series_registradas`, donde la segunda no tiene política de `update` ni de `delete`: los registros solo se agregan, y eso es lo que hace que sincronizar sea una cola con reintentos y no un problema distribuido. En el teléfono, `expo-sqlite` guarda una cola de escritura, una caché de la rutina y las mejores marcas por ejercicio. Toda la lógica que decide —qué se manda y en qué orden, cómo se clasifica cada respuesta, qué es récord, cómo se agrupa y se dibuja la evolución— vive en `packages/core` como funciones puras con vitest; la app solo hace I/O.

**Tech Stack:** PostgreSQL 15 (Supabase), TypeScript, Expo Router 57 / React Native 0.86 (app), `expo-sqlite`, `expo-network`, `expo-crypto`, `react-native-svg`, Next.js 16 (panel), vitest.

**Spec:** [`docs/superpowers/specs/2026-09-10-registro-entrenamiento-design.md`](../specs/2026-09-10-registro-entrenamiento-design.md)

## Global Constraints

- **Todo el código, los comentarios, los identificadores de base de datos y los textos de interfaz van en castellano.** Es la convención de todo el repositorio.
- **`series_registradas` no tiene política de `update` ni de `delete`.** No restringidas: inexistentes. Ninguna tarea agrega una.
- **Las funciones de Postgres que se llaman desde una política llevan `security definer` y `set search_path = ''`**, y escriben los nombres completos (`public.sesiones`, `auth.uid()`). El motivo está en `supabase/migrations/0002_rls_identidad.sql`.
- **Las funciones y vistas que consulta el usuario (`ultima_vez`, `mejores_marcas`) son `security invoker`**, para que la RLS siga decidiendo qué filas entran.
- **La política de `select` de `sesiones` recibe columnas, no un id** (`puedo_ver_sesion_fila(gym_id, membership_id)`). El motivo está en el comentario de `puedo_ver_rutina_fila` en `0007_rls_rutinas.sql`.
- **Toda política de `update` escribe el `with check` explícito**, aunque repita el `using`.
- **Al usuario nunca se le muestra un código de error ni un stack trace.** Los mensajes van en castellano (sección 14 del diseño general).
- **Migraciones:** una por tarea, numeradas correlativas a partir de `0011`. No se edita una migración ya commiteada.
- **`npm run db:tipos` después de cada migración que cambie el esquema**, para regenerar `packages/core/src/tipos-db.ts`.
- **Comandos de prueba:** `npm run test:rls` (necesita `npx supabase start` y un `.env.test` generado con `npx supabase status -o env > .env.test`) y `npm run test:core`.
- **App móvil:** antes de usar una API de Expo, leer la documentación de la versión exacta en https://docs.expo.dev/versions/v57.0.0/ —lo exige `apps/movil/AGENTS.md`—. Las dependencias nativas se instalan con `npx expo install`, nunca con `npm install`, para que tomen la versión compatible con el SDK.
- **Las tareas de interfaz no tienen tests automáticos.** El repo no tiene infraestructura de tests de componentes y se decidió no montarla. Cierran con `npx tsc --noEmit` y `npm run lint` en la app correspondiente; la verificación tocando la app queda para el usuario.
- **Toda lectura de Progreso filtra por `completada`.** Esta etapa no escribe `completada = false`, pero el día que exista no puede ensuciar los gráficos.
- **En la app, toda consulta de sesiones o series filtra por las membresías propias.** La RLS deja a un entrenador ver las de todo su gimnasio, y el que usa la app puede ser un entrenador que también entrena.
- **Cada tarea termina en un commit.** Mensaje en castellano, imperativo, explicando el porqué y no el qué.

---

## Estructura de archivos

**Base de datos**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0011_registro.sql` | Las dos tablas, checks, claves foráneas, índices |
| `supabase/migrations/0012_rls_registro.sql` | Funciones de permisos y políticas de las dos tablas |
| `supabase/migrations/0013_sesiones_inmutables.sql` | Trigger: de una sesión solo cambian `fin` y `notas` |
| `supabase/migrations/0014_registro_lecturas.sql` | Vista `mejores_marcas` y función `ultima_vez` |
| `supabase/migrations/0015_ultimas_sesiones.sql` | Vista `ultimas_sesiones`: hasta tres por socio, para el panel |

**Tests de base**

| Archivo | Responsabilidad |
|---|---|
| `tests/rls/ayudas.ts` | Se amplía: hace falta la membresía del socio B |
| `tests/rls/registro.test.ts` | Esquema, aislamiento, matriz de escritura, trigger y las tres vistas o funciones de lectura |

**Lógica compartida**

| Archivo | Responsabilidad |
|---|---|
| `packages/core/src/registro.ts` | `validarSerie`, `repsSugeridas`, `volumen`, récords y marcas |
| `packages/core/src/cola.ts` | Qué se manda, en qué orden, cómo se clasifica cada respuesta, el texto de estado |
| `packages/core/src/evolucion.ts` | `evolucionPorSesion`, `marcarRecords`, `geometriaGrafico` |
| `packages/core/tests/registro.test.ts`, `cola.test.ts`, `evolucion.test.ts` | Sus tests |

**App**

| Archivo | Responsabilidad |
|---|---|
| `apps/movil/src/lib/local/base.ts` | Abre la base SQLite y crea sus tablas |
| `apps/movil/src/lib/local/cola.ts` | Leer y escribir la cola, las marcas y la caché. Solo SQL |
| `apps/movil/src/lib/membresia.ts` | Las membresías propias, con caché para cuando no hay señal |
| `apps/movil/src/lib/con-limite.ts` | Tope de espera para consultas con señal mala |
| `apps/movil/src/lib/rutina-activa.ts` | La rutina de Hoy, con caché para abrir sin señal |
| `apps/movil/src/lib/vez-pasada.ts` | Llama a `ultima_vez` y agrupa por ejercicio |
| `apps/movil/src/lib/terminar-sesion.ts` | Terminar: el fin a la cola y las marcas al día |
| `apps/movil/src/lib/fechas.ts` | "8/10", "mié 8/10", "52 min" |
| `apps/movil/src/lib/sincronizar.ts` | La función de sincronización y el estado que escucha la interfaz |
| `apps/movil/src/lib/cerrar-sesion.ts` | Cerrar sesión avisando si hay cosas sin sincronizar |
| `apps/movil/src/components/aviso-sincronizacion.tsx` | "3 series sin sincronizar", siempre visible |
| `apps/movil/src/components/buscador-ejercicios.tsx` | El buscador de la etapa 1, extraído: lo usan tres pantallas |
| `apps/movil/src/components/grafico-evolucion.tsx` | Traduce la geometría de core a `react-native-svg` |
| `apps/movil/src/app/entrenar.tsx` | La pantalla de sesión: acordeón por ejercicio |
| `apps/movil/src/app/(tabs)/index.tsx` | Hoy: botón Empezar, entrenar libre, sesión sin terminar |
| `apps/movil/src/app/(tabs)/progreso/_layout.tsx` | Stack de la pestaña |
| `apps/movil/src/app/(tabs)/progreso/index.tsx` | Récords e historial |
| `apps/movil/src/app/(tabs)/progreso/sesion/[id].tsx` | Una sesión del historial |
| `apps/movil/src/app/(tabs)/progreso/ejercicio/[id].tsx` | Evolución de un ejercicio |

**Panel**

| Archivo | Responsabilidad |
|---|---|
| `apps/panel/src/app/(panel)/socios/page.tsx` | Suma las últimas sesiones de cada socio |

La pantalla de sesión va en `src/app/entrenar.tsx` y no adentro de `(tabs)`: entrenar ocupa la pantalla entera, sin la barra de pestañas, y se llega desde dos lugares —Hoy con un día, Hoy con "entrenar libre"—.

---

## Tarea 1: Esquema

**Files:**
- Create: `supabase/migrations/0011_registro.sql`
- Modify: `tests/rls/ayudas.ts`
- Create: `tests/rls/registro.test.ts`
- Modify (regenerado): `packages/core/src/tipos-db.ts`

**Interfaces:**
- Consumes: `gyms`, `memberships`, `rutina_dias`, `ejercicios` (etapas 0 a 2).
- Produces:
  - Tabla `sesiones`: `id uuid`, `gym_id uuid`, `membership_id uuid`, `rutina_dia_id uuid | null`, `inicio timestamptz`, `fin timestamptz | null`, `notas text | null`, `id_local uuid` (único), `created_at`.
  - Tabla `series_registradas`: `id uuid`, `sesion_id uuid`, `ejercicio_id uuid`, `numero_serie int`, `peso_kg numeric(6,2)`, `repeticiones int`, `rpe numeric(3,1) | null`, `completada boolean` (default `true`), `id_local uuid` (único), `created_at`.
  - `Escenario.socioBMembresiaId: string` en `tests/rls/ayudas.ts`.
  - En `tests/rls/registro.test.ts`, las ayudas `unEjercicio()`, `sesionDe(gymId, membershipId, inicio?)` y `serieEn(sesionId, ejercicioId, datos?)`, que usan las tareas 2 a 4.

- [ ] **Step 1: Ampliar el escenario con la membresía del socio B**

En `tests/rls/ayudas.ts`, agregar el campo a la interfaz, debajo de `entrenadorAMembresiaId`:

```ts
  entrenadorAMembresiaId: string
  /** Hace falta para cargar sesiones del gimnasio B y probar que el A no las ve. */
  socioBMembresiaId: string
```

y en el `return` de `crearEscenario`, debajo de `entrenadorAMembresiaId: membresiaDe(entrenadorA.id),`:

```ts
    socioBMembresiaId: membresiaDe(socioB.id),
```

- [ ] **Step 2: Escribir los tests de esquema**

Crear `tests/rls/registro.test.ts`:

```ts
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
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `npm run test:rls -- tests/rls/registro.test.ts`
Expected: FAIL — `relation "public.sesiones" does not exist` (o el equivalente de PostgREST, `PGRST205`).

- [ ] **Step 4: Escribir la migración**

Crear `supabase/migrations/0011_registro.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Registro de entrenamiento: una fila por sesión y una fila por serie.
--
-- Una fila por serie y no un resumen: la realidad de una serie de cuatro es
-- 60, 60, 57.5, 55 —el peso baja con la fatiga— y ese detalle es el dato que
-- hace que los gráficos digan algo.
--
-- id_local es un uuid que genera el teléfono antes de sincronizar. Es la llave
-- de idempotencia: un reintento que llega dos veces choca contra el índice
-- único, y la app trata ese choque como éxito. Ver la sección 2 del diseño de
-- la etapa 3.
-- ---------------------------------------------------------------------------

create table sesiones (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id) on delete cascade,
  -- cascade como rutinas.propietario_id: el historial es del socio y se va
  -- con su membresía.
  membership_id  uuid not null references memberships(id) on delete cascade,
  -- Nulo = entrenó libre, sin rutina. set null y no restrict: borrar un día de
  -- la rutina no puede impedirse por haberlo entrenado, ni llevarse el
  -- historial. El trigger de 0013 deja pasar este null a propósito.
  rutina_dia_id  uuid references rutina_dias(id) on delete set null,
  -- La hora del teléfono, no la del servidor: la sesión puede llegar horas
  -- después, cuando vuelva la señal.
  inicio         timestamptz not null,
  fin            timestamptz,
  notas          text,
  id_local       uuid not null,
  created_at     timestamptz not null default now(),

  constraint sesiones_id_local_unico unique (id_local),
  constraint sesiones_fin_despues_de_inicio check (fin is null or fin >= inicio)
);

create index sesiones_membresia_inicio_idx on sesiones (membership_id, inicio desc);
create index sesiones_gym_idx on sesiones (gym_id);

-- Sin gym_id: llega al gimnasio a través de su sesión, igual que rutina_dias
-- llega a través de su rutina.
create table series_registradas (
  id            uuid primary key default gen_random_uuid(),
  -- cascade solo corre cuando la cascada viene de arriba (membresía o
  -- gimnasio): ningún rol puede borrar una sesión.
  sesion_id     uuid not null references sesiones(id) on delete cascade,
  -- restrict: un ejercicio con historial no se borra del catálogo, como en
  -- rutina_ejercicios.
  ejercicio_id  uuid not null references ejercicios(id) on delete restrict,
  numero_serie  integer not null check (numero_serie > 0),
  -- Cero es válido: dominadas, fondos, plancha.
  peso_kg       numeric(6,2) not null check (peso_kg >= 0),
  repeticiones  integer not null check (repeticiones > 0),
  rpe           numeric(3,1) check (rpe between 1 and 10),
  -- Esta etapa solo escribe true: tildar una serie es registrarla. Queda la
  -- columna tal como la fija el diseño general, y toda lectura de Progreso
  -- filtra por ella.
  completada    boolean not null default true,
  id_local      uuid not null,
  created_at    timestamptz not null default now(),

  constraint series_registradas_id_local_unico unique (id_local)
);

create index series_registradas_sesion_idx on series_registradas (sesion_id);
create index series_registradas_ejercicio_idx on series_registradas (ejercicio_id);
```

- [ ] **Step 5: Aplicar, regenerar tipos y correr los tests**

Run: `npm run db:reset && npm run db:tipos && npm run test:rls -- tests/rls/registro.test.ts`
Expected: PASS, 10 tests.

Si `db:reset` deja caído el contenedor de Realtime o Storage, `npx supabase stop && npx supabase start` antes de volver a correr. `.env.test` no cambia con un reset.

- [ ] **Step 6: Correr la suite de base completa**

Run: `npm run test:rls`
Expected: PASS. Ningún test anterior se rompe: `socioBMembresiaId` es un campo nuevo.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0011_registro.sql tests/rls/ayudas.ts tests/rls/registro.test.ts packages/core/src/tipos-db.ts
git commit -m "Agregar las tablas del registro de entrenamiento

Una fila por serie, con id_local único para que un reintento no
duplique. Los checks frenan en la base lo que la app ya valida, porque
su rechazo es el que la cola trata como permanente."
```

---

## Tarea 2: Permisos

**Files:**
- Create: `supabase/migrations/0012_rls_registro.sql`
- Modify: `tests/rls/registro.test.ts`
- Modify (regenerado): `packages/core/src/tipos-db.ts`

**Interfaces:**
- Consumes: `public.mis_gyms()`, `public.mi_rol(gym_id)` (0002), `public.mi_membresia(gym_id)` (0007); las ayudas `unEjercicio`, `sesionDe`, `serieEn` de la Tarea 1.
- Produces:
  - `public.puedo_ver_sesion_fila(p_gym_id uuid, p_membership_id uuid) returns boolean`
  - `public.puedo_ver_sesion(p_sesion_id uuid) returns boolean`
  - `public.es_mi_sesion(p_sesion_id uuid) returns boolean`
  - Políticas `sesiones_leer`, `sesiones_crear`, `sesiones_editar`, `series_registradas_leer`, `series_registradas_crear`. **No hay ninguna otra.**

- [ ] **Step 1: Escribir los tests de permisos**

Agregar al final de `tests/rls/registro.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:rls -- tests/rls/registro.test.ts`
Expected: FAIL. Sin RLS habilitada todo se puede: fallan los de "NO ve" y "NO puede", y los de update y delete encuentran la fila modificada o borrada.

Que los de update y delete fallen acá es la prueba de que miden lo que dicen medir: sin RLS el update sí toca la fila.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/0012_rls_registro.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Permisos del registro de entrenamiento.
--
-- Leer es más ancho que escribir, al revés de lo usual: el socio lee lo suyo y
-- el personal lo de cualquier socio de su gimnasio, pero escribir lo escribe
-- solo el propio socio. Un entrenador que pudiera registrar series a nombre de
-- otro ensucia el único dato que la app promete que es verdad.
--
-- series_registradas NO TIENE política de update ni de delete. No están
-- restringidas: no existen. Todo el argumento de por qué sincronizar es fácil
-- —sección 7 del diseño general— se apoya en que los registros solo se
-- agregan, y eso tiene que sostenerlo la base, no la disciplina. Antes de
-- agregar una, leer la sección 1 del diseño de la etapa 3.
--
-- Las funciones son SECURITY DEFINER por el mismo motivo que las de 0002: se
-- llaman desde una política y leen las tablas que esa política protege.
-- ---------------------------------------------------------------------------

-- Recibe las columnas y no el id, por la misma razón que
-- puedo_ver_rutina_fila en 0007: así la política de select puede evaluarse
-- sobre la fila que un INSERT ... RETURNING acaba de crear. La app inserta
-- sesiones y necesita el id de vuelta para colgarles las series.
create or replace function public.puedo_ver_sesion_fila(
  p_gym_id        uuid,
  p_membership_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_gym_id in (select public.mis_gyms())
     and (
       p_membership_id = public.mi_membresia(p_gym_id)
       or public.mi_rol(p_gym_id) in ('entrenador', 'admin')
     )
$$;

-- Para la política de series_registradas, que mira al padre. El padre lo
-- insertó una sentencia anterior, así que buscarlo por id no tiene el problema
-- de arriba.
create or replace function public.puedo_ver_sesion(p_sesion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.puedo_ver_sesion_fila(s.gym_id, s.membership_id)
  from public.sesiones s
  where s.id = p_sesion_id
$$;

-- Escribir: solo el dueño. Una membresía dada de baja deja de ser "mía"
-- —mi_membresia() exige estado activo—, y su rechazo es uno de los
-- permanentes que la cola de la app marca como rechazados.
create or replace function public.es_mi_sesion(p_sesion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select s.membership_id = public.mi_membresia(s.gym_id)
  from public.sesiones s
  where s.id = p_sesion_id
$$;

alter table sesiones           enable row level security;
alter table series_registradas enable row level security;

create policy sesiones_leer on sesiones for select
  using (puedo_ver_sesion_fila(gym_id, membership_id));

-- El exists contra rutina_dias corre con RLS, así que exige a la vez que el día
-- sea visible y que su rutina sea de ESTE gimnasio. Sin él, alguien con
-- membresía en dos gimnasios podía registrar una sesión del A colgada de un día
-- de rutina del B.
--
-- `sesiones.gym_id` va calificado a propósito: adentro del exists, un gym_id
-- suelto se resolvería contra rutinas, que también tiene esa columna, y la
-- comparación sería siempre verdadera.
create policy sesiones_crear on sesiones for insert with check (
  membership_id = mi_membresia(gym_id)
  and (
    rutina_dia_id is null
    or exists (
      select 1
      from rutina_dias d
      join rutinas r on r.id = d.rutina_id
      where d.id = rutina_dia_id
        and r.gym_id = sesiones.gym_id
    )
  )
);

-- La política deja pasar la fila entera; qué columnas se pueden cambiar lo
-- decide el trigger de 0013. RLS decide filas, nunca columnas.
create policy sesiones_editar on sesiones for update
  using (membership_id = mi_membresia(gym_id))
  with check (membership_id = mi_membresia(gym_id));

-- Sin política de delete en sesiones: el historial no se borra a mano.

create policy series_registradas_leer on series_registradas for select
  using (puedo_ver_sesion(sesion_id));

-- El exists contra ejercicios, por el mismo motivo que en
-- rutina_ejercicios_crear (0007): sin él se podía registrar una serie
-- apuntando a un ejercicio privado de otro gimnasio adivinando el uuid, y por
-- el restrict de 0011 eso le impediría al otro gimnasio borrar su ejercicio.
create policy series_registradas_crear on series_registradas for insert
  with check (
    es_mi_sesion(sesion_id)
    and exists (select 1 from ejercicios e where e.id = ejercicio_id)
  );
```

- [ ] **Step 4: Aplicar, regenerar tipos y correr los tests**

Run: `npm run db:reset && npm run db:tipos && npm run test:rls -- tests/rls/registro.test.ts`
Expected: PASS, 30 tests (10 de esquema y 20 de permisos).

Si `una sesión no se puede colgar de un día de rutina de otro gimnasio` falla con la sesión insertada, el `sesiones.gym_id` del exists quedó sin calificar.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0012_rls_registro.sql tests/rls/registro.test.ts packages/core/src/tipos-db.ts
git commit -m "Dejar que el socio escriba solo lo suyo y el personal lo lea

series_registradas no tiene política de update ni de delete: la
sincronización entera se apoya en que los registros solo se agregan, y
eso lo sostiene la base. Los tests de update y delete miran la fila y
no el error, porque sin política Postgres no falla: no toca nada."
```

---

## Tarea 3: Columnas inmutables de una sesión

**Files:**
- Create: `supabase/migrations/0013_sesiones_inmutables.sql`
- Modify: `tests/rls/registro.test.ts`

**Interfaces:**
- Consumes: la tabla `sesiones` (Tarea 1) y su política `sesiones_editar` (Tarea 2); las ayudas `sesionDe`, `unEjercicio`.
- Produces: trigger `sesiones_columnas_inmutables_trg`. De una sesión solo cambian `fin` y `notas`; `rutina_dia_id` solo puede pasar a nulo. Error `42501` en cualquier otro caso.

- [ ] **Step 1: Escribir los tests**

Agregar al final de `tests/rls/registro.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:rls -- tests/rls/registro.test.ts`
Expected: FAIL en los cuatro tests de "no se puede"; pasan el de `fin y notas` y el del día borrado.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/0013_sesiones_inmutables.sql`:

```sql
-- ---------------------------------------------------------------------------
-- De una sesión cambian fin y notas, y nada más.
--
-- sesiones_editar (0012) le deja al socio el update de su propia sesión,
-- porque al terminar de entrenar hay que escribir fin. Pero RLS decide filas,
-- no columnas: sin esto podría reescribir inicio y correr su historial, o
-- cambiar id_local y romper la llave con la que la cola reconoce un reintento.
--
-- Se escribe como "todo menos fin y notas" comparando la fila entera, y no
-- como una lista de columnas prohibidas: una columna que se agregue mañana
-- nace inmutable, en vez de nacer editable hasta que alguien se acuerde de
-- sumarla acá. Es el mismo mecanismo que 0008_rutinas_inmutables.sql.
-- ---------------------------------------------------------------------------

create or replace function public.sesiones_columnas_inmutables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'fin' - 'notas' - 'rutina_dia_id')
     is distinct from (to_jsonb(old) - 'fin' - 'notas' - 'rutina_dia_id') then
    raise exception 'Esta columna no se puede modificar'
      using errcode = '42501';
  end if;

  -- rutina_dia_id lleva una regla propia por el mismo motivo que origen_id en
  -- 0008: su clave foránea es `on delete set null`, y esa acción se ejecuta
  -- como un update de esta fila. Se prohíbe repuntarlo y se deja pasar el
  -- null.
  if new.rutina_dia_id is distinct from old.rutina_dia_id
     and new.rutina_dia_id is not null then
    raise exception 'El día de una sesión no se puede cambiar'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger sesiones_columnas_inmutables_trg
  before update on public.sesiones
  for each row execute function public.sesiones_columnas_inmutables();
```

- [ ] **Step 4: Aplicar y correr los tests**

Run: `npm run db:reset && npm run test:rls -- tests/rls/registro.test.ts`
Expected: PASS, 36 tests.

No hace falta `db:tipos`: un trigger no cambia los tipos.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0013_sesiones_inmutables.sql tests/rls/registro.test.ts
git commit -m "Dejar que de una sesión cambien solo fin y notas

La política de update deja tocar la fila entera, porque RLS no sabe de
columnas. Se compara la fila entera menos esas dos, para que una
columna nueva nazca inmutable. rutina_dia_id puede pasar a nulo
porque así borra la clave foránea al borrarse el día."
```

---

## Tarea 4: Las dos lecturas que alimentan el teléfono

**Files:**
- Create: `supabase/migrations/0014_registro_lecturas.sql`
- Modify: `tests/rls/registro.test.ts`
- Modify (regenerado): `packages/core/src/tipos-db.ts`

**Interfaces:**
- Consumes: las tablas y políticas de las tareas 1 y 2; las ayudas `sesionDe`, `serieEn`.
- Produces:
  - Vista `public.mejores_marcas` (`security_invoker`): columnas `membership_id uuid`, `ejercicio_id uuid`, `mejor_peso_kg numeric`, `mejor_volumen_kg numeric`, `sesiones integer`. Una fila por membresía y ejercicio.
  - Función `public.ultima_vez(p_ejercicio_ids uuid[])` (`security invoker`) que devuelve `table (ejercicio_id uuid, numero_serie integer, peso_kg numeric, repeticiones integer)`: las series completadas de la sesión más reciente de quien llama en la que aparece cada ejercicio, ordenadas por ejercicio y número de serie.

- [ ] **Step 1: Escribir los tests**

Agregar al final de `tests/rls/registro.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:rls -- tests/rls/registro.test.ts`
Expected: FAIL — `mejores_marcas` y `ultima_vez` no existen.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/0014_registro_lecturas.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Las dos lecturas que alimentan el teléfono. Ver la sección 2 del diseño de la
-- etapa 3.
--
-- Las dos son security invoker: corren con los permisos de quien consulta, así
-- que la RLS de sesiones y series_registradas sigue decidiendo qué filas
-- entran. Una vista security definer —el default de una vista en Postgres—
-- saltearía la RLS y le mostraría a cualquiera las marcas de todo el mundo.
-- ---------------------------------------------------------------------------

-- Por membresía y ejercicio: el mayor peso de una serie, y el mayor volumen de
-- UNA sesión (no el total histórico). Es lo que el teléfono cachea para
-- detectar un récord sin señal, y la lista de récords de Progreso.
create view public.mejores_marcas
with (security_invoker = true)
as
with por_sesion as (
  select
    s.membership_id,
    sr.ejercicio_id,
    max(sr.peso_kg)                   as peso_max,
    sum(sr.peso_kg * sr.repeticiones) as volumen
  from public.series_registradas sr
  join public.sesiones s on s.id = sr.sesion_id
  where sr.completada
  group by s.membership_id, sr.ejercicio_id, s.id
)
select
  membership_id,
  ejercicio_id,
  max(peso_max)  as mejor_peso_kg,
  max(volumen)   as mejor_volumen_kg,
  count(*)::int  as sesiones
from por_sesion
group by membership_id, ejercicio_id;

-- "La vez pasada: 60kg × 10, 10, 9, 8". Una llamada por pantalla, con todos los
-- ejercicios del día, en vez de una consulta por ejercicio.
--
-- Filtra por las membresías de quien llama y no se apoya solo en la RLS: un
-- entrenador puede LEER las sesiones de sus socios, pero su "vez pasada" es la
-- suya.
create or replace function public.ultima_vez(p_ejercicio_ids uuid[])
returns table (
  ejercicio_id  uuid,
  numero_serie  integer,
  peso_kg       numeric,
  repeticiones  integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mias as (
    select s.id, s.inicio
    from public.sesiones s
    join public.memberships m on m.id = s.membership_id
    where m.user_id = (select auth.uid())
  ),
  ultima as (
    select distinct on (sr.ejercicio_id) sr.ejercicio_id, sr.sesion_id
    from public.series_registradas sr
    join mias on mias.id = sr.sesion_id
    where sr.ejercicio_id = any (p_ejercicio_ids)
      and sr.completada
    order by sr.ejercicio_id, mias.inicio desc
  )
  select sr.ejercicio_id, sr.numero_serie, sr.peso_kg, sr.repeticiones
  from public.series_registradas sr
  join ultima u on u.sesion_id = sr.sesion_id and u.ejercicio_id = sr.ejercicio_id
  where sr.completada
  order by sr.ejercicio_id, sr.numero_serie
$$;
```

- [ ] **Step 4: Aplicar, regenerar tipos y correr toda la suite de base**

Run: `npm run db:reset && npm run db:tipos && npm run test:rls`
Expected: PASS. `registro.test.ts` suma 42 tests.

Verificar en `packages/core/src/tipos-db.ts` que aparecen `mejores_marcas` bajo `Views` y `ultima_vez` bajo `Functions`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0014_registro_lecturas.sql tests/rls/registro.test.ts packages/core/src/tipos-db.ts
git commit -m "Agregar las mejores marcas y la vez pasada

Son lo que el teléfono necesita del servidor: las marcas para detectar
un récord sin señal, y la vez pasada para precargar la sesión. Las dos
son security invoker; una vista común saltearía la RLS. La vez pasada
filtra además por quien llama, porque el entrenador puede leer las
sesiones del socio pero la suya es otra."
```

---
## Tarea 5: Récords y marcas en `@gym/core`

**Files:**
- Create: `packages/core/src/registro.ts`
- Create: `packages/core/tests/registro.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nada.
- Produces (todo exportado desde `@gym/core`):
  - `interface SerieHecha { peso_kg: number; repeticiones: number }`
  - `interface MejorMarca { mejor_peso_kg: number; mejor_volumen_kg: number }`
  - `type Marcas = Record<string, MejorMarca>` — la clave es `ejercicio_id`
  - `type TipoRecord = 'peso' | 'volumen'`
  - `PESO_MAXIMO_KG = 9999.99`
  - `aNumero(texto: string): number` — `NaN` si no es un número
  - `validarSerie(serie: SerieHecha): string | null`
  - `repsSugeridas(prescripcion: string): number | null`
  - `volumen(series: SerieHecha[]): number`
  - `detectarRecord(previa: MejorMarca | undefined, anteriores: SerieHecha[], nueva: SerieHecha): TipoRecord | null`
  - `marcaDeSesion(series: SerieHecha[]): MejorMarca | null`
  - `fusionarMarcas(a: Marcas, b: Marcas): Marcas`
  - `formatearKg(kg: number): string`
  - `detalleSeries(series: SerieHecha[]): string` — "60kg × 10, 10, 9, 8"
  - `textoVezPasada(series: SerieHecha[]): string | null`
  - `interface Prescripcion { series: number; repeticiones: string; peso_sugerido_kg: number | null }`
  - `interface FilaPrecargada { peso_kg: number | null; repeticiones: number | null; registrada: boolean }`
  - `filasPrecargadas(datos: { prescripcion: Prescripcion | null; vezPasada: SerieHecha[] | null; hechas: SerieHecha[] }): FilaPrecargada[]`

- [ ] **Step 1: Escribir los tests**

Crear `packages/core/tests/registro.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  aNumero, detalleSeries, detectarRecord, filasPrecargadas, formatearKg,
  fusionarMarcas, marcaDeSesion, repsSugeridas, textoVezPasada, validarSerie, volumen,
} from '../src/registro'

describe('aNumero', () => {
  it('acepta la coma decimal, que es la que escribe la gente acá', () => {
    expect(aNumero('57,5')).toBe(57.5)
    expect(aNumero(' 60 ')).toBe(60)
  })

  it('un campo vacío no es cero', () => {
    expect(aNumero('')).toBeNaN()
    expect(aNumero('   ')).toBeNaN()
    expect(aNumero('abc')).toBeNaN()
  })
})

describe('validarSerie', () => {
  it('una serie normal está bien', () => {
    expect(validarSerie({ peso_kg: 60, repeticiones: 10 })).toBeNull()
  })

  it('peso cero está bien: dominadas, fondos', () => {
    expect(validarSerie({ peso_kg: 0, repeticiones: 8 })).toBeNull()
  })

  it('exige el peso', () => {
    expect(validarSerie({ peso_kg: NaN, repeticiones: 10 })).toBe('Poné el peso')
  })

  it('no acepta peso negativo', () => {
    expect(validarSerie({ peso_kg: -5, repeticiones: 10 })).toBe('El peso no puede ser negativo')
  })

  it('no acepta un peso que no entra en la base', () => {
    expect(validarSerie({ peso_kg: 10000, repeticiones: 1 })).toBe('Ese peso no parece real')
  })

  it('exige al menos una repetición entera', () => {
    expect(validarSerie({ peso_kg: 60, repeticiones: 0 }))
      .toBe('Las repeticiones tienen que ser al menos 1')
    expect(validarSerie({ peso_kg: 60, repeticiones: 2.5 }))
      .toBe('Las repeticiones tienen que ser al menos 1')
    expect(validarSerie({ peso_kg: 60, repeticiones: NaN }))
      .toBe('Las repeticiones tienen que ser al menos 1')
  })
})

describe('repsSugeridas', () => {
  it('de un rango toma el primer número', () => {
    expect(repsSugeridas('8-12')).toBe(8)
    expect(repsSugeridas('10')).toBe(10)
  })

  it('sin número no sugiere nada', () => {
    expect(repsSugeridas('al fallo')).toBeNull()
    expect(repsSugeridas('0')).toBeNull()
  })
})

describe('volumen', () => {
  it('es la suma de peso por repeticiones', () => {
    expect(volumen([
      { peso_kg: 60, repeticiones: 10 },
      { peso_kg: 57.5, repeticiones: 8 },
    ])).toBe(1060)
  })

  it('sin series es cero', () => {
    expect(volumen([])).toBe(0)
  })

  it('redondea a centavos: no arrastra errores de coma flotante', () => {
    expect(volumen([{ peso_kg: 0.1, repeticiones: 3 }])).toBe(0.3)
  })
})

describe('detectarRecord', () => {
  const previa = { mejor_peso_kg: 100, mejor_volumen_kg: 1000 }

  it('la primera vez que se hace un ejercicio no es récord', () => {
    expect(detectarRecord(undefined, [], { peso_kg: 200, repeticiones: 10 })).toBeNull()
  })

  it('superar el peso es récord', () => {
    expect(detectarRecord(previa, [], { peso_kg: 102.5, repeticiones: 1 })).toBe('peso')
  })

  it('igualarlo no', () => {
    expect(detectarRecord(previa, [], { peso_kg: 100, repeticiones: 1 })).toBeNull()
  })

  // Si no, la tercera serie de una sesión en la que ya se batió el récord en
  // la primera volvería a avisar contra la marca vieja.
  it('compara también contra lo que ya se hizo en la sesión', () => {
    const anteriores = [{ peso_kg: 105, repeticiones: 1 }]
    expect(detectarRecord(previa, anteriores, { peso_kg: 102.5, repeticiones: 1 })).toBeNull()
    expect(detectarRecord(previa, anteriores, { peso_kg: 107.5, repeticiones: 1 })).toBe('peso')
  })

  it('el volumen es récord en la serie que cruza la marca', () => {
    const anteriores = [{ peso_kg: 50, repeticiones: 10 }, { peso_kg: 50, repeticiones: 9 }] // 950
    expect(detectarRecord(previa, anteriores, { peso_kg: 50, repeticiones: 2 })).toBe('volumen') // 1050
  })

  it('el volumen se avisa una sola vez: la serie siguiente ya parte de arriba', () => {
    const anteriores = [{ peso_kg: 50, repeticiones: 10 }, { peso_kg: 50, repeticiones: 11 }] // 1050
    expect(detectarRecord(previa, anteriores, { peso_kg: 50, repeticiones: 5 })).toBeNull()
  })

  it('si una serie bate los dos, gana el de peso', () => {
    const anteriores = [{ peso_kg: 90, repeticiones: 10 }] // 900
    expect(detectarRecord(previa, anteriores, { peso_kg: 110, repeticiones: 1 })).toBe('peso')
  })
})

describe('marcaDeSesion', () => {
  it('el mejor peso y el volumen de la sesión', () => {
    expect(marcaDeSesion([
      { peso_kg: 60, repeticiones: 10 },
      { peso_kg: 65, repeticiones: 5 },
    ])).toEqual({ mejor_peso_kg: 65, mejor_volumen_kg: 925 })
  })

  it('sin series no hay marca', () => {
    expect(marcaDeSesion([])).toBeNull()
  })
})

describe('fusionarMarcas', () => {
  // El servidor todavía no conoce lo que está en la cola: si reemplazara, un
  // récord hecho sin señal desaparecería al sincronizar a medias.
  it('gana el máximo de cada campo, venga de donde venga', () => {
    const locales = { x: { mejor_peso_kg: 105, mejor_volumen_kg: 900 } }
    const servidor = { x: { mejor_peso_kg: 100, mejor_volumen_kg: 1000 } }
    expect(fusionarMarcas(locales, servidor))
      .toEqual({ x: { mejor_peso_kg: 105, mejor_volumen_kg: 1000 } })
  })

  it('conserva los ejercicios que están en un solo lado', () => {
    const a = { x: { mejor_peso_kg: 1, mejor_volumen_kg: 1 } }
    const b = { y: { mejor_peso_kg: 2, mejor_volumen_kg: 2 } }
    expect(fusionarMarcas(a, b)).toEqual({ ...a, ...b })
  })
})

describe('formatearKg', () => {
  it('sin decimales cuando no hacen falta, con coma cuando sí', () => {
    expect(formatearKg(60)).toBe('60')
    expect(formatearKg(57.5)).toBe('57,5')
    expect(formatearKg(1062.25)).toBe('1062,25')
  })
})

describe('textoVezPasada', () => {
  it('con el mismo peso, el peso una vez y las repeticiones en fila', () => {
    expect(textoVezPasada([
      { peso_kg: 60, repeticiones: 10 }, { peso_kg: 60, repeticiones: 10 },
      { peso_kg: 60, repeticiones: 9 }, { peso_kg: 60, repeticiones: 8 },
    ])).toBe('La vez pasada: 60kg × 10, 10, 9, 8')
  })

  it('con pesos distintos, cada serie con el suyo', () => {
    expect(textoVezPasada([
      { peso_kg: 60, repeticiones: 10 }, { peso_kg: 57.5, repeticiones: 9 },
    ])).toBe('La vez pasada: 60kg × 10, 57,5kg × 9')
  })

  it('sin series no hay texto', () => {
    expect(textoVezPasada([])).toBeNull()
  })
})

describe('detalleSeries', () => {
  it('es el mismo detalle sin el prefijo: lo usa el historial', () => {
    expect(detalleSeries([
      { peso_kg: 60, repeticiones: 10 }, { peso_kg: 60, repeticiones: 8 },
    ])).toBe('60kg × 10, 8')
  })
})

// Es lo que hace que registrar un ejercicio repetido cueste cuatro toques.
describe('filasPrecargadas', () => {
  const rutina = { series: 3, repeticiones: '8-12', peso_sugerido_kg: 40 }
  const pasada = [
    { peso_kg: 60, repeticiones: 10 }, { peso_kg: 60, repeticiones: 9 }, { peso_kg: 57.5, repeticiones: 8 },
  ]

  it('con señal, precarga lo de la vez pasada antes que lo de la rutina', () => {
    expect(filasPrecargadas({ prescripcion: rutina, vezPasada: pasada, hechas: [] })).toEqual([
      { peso_kg: 60, repeticiones: 10, registrada: false },
      { peso_kg: 60, repeticiones: 9, registrada: false },
      { peso_kg: 57.5, repeticiones: 8, registrada: false },
    ])
  })

  it('sin señal, lo de la rutina: las series, el primer número del rango y el peso sugerido', () => {
    const filas = filasPrecargadas({ prescripcion: rutina, vezPasada: null, hechas: [] })
    expect(filas).toHaveLength(3)
    expect(filas[0]).toEqual({ peso_kg: 40, repeticiones: 8, registrada: false })
  })

  it('si la rutina pide más series que la vez pasada, repite la última', () => {
    const filas = filasPrecargadas({
      prescripcion: { ...rutina, series: 4 }, vezPasada: pasada, hechas: [],
    })
    expect(filas).toHaveLength(4)
    expect(filas[3]).toEqual({ peso_kg: 57.5, repeticiones: 8, registrada: false })
  })

  it('si la vez pasada hizo más series que la rutina, precarga todas', () => {
    const filas = filasPrecargadas({
      prescripcion: { ...rutina, series: 2 }, vezPasada: pasada, hechas: [],
    })
    expect(filas).toHaveLength(3)
  })

  // Al retomar una sesión que quedó abierta.
  it('las series ya registradas ocupan las primeras filas', () => {
    const filas = filasPrecargadas({
      prescripcion: rutina, vezPasada: pasada, hechas: [{ peso_kg: 62.5, repeticiones: 10 }],
    })
    expect(filas).toEqual([
      { peso_kg: 62.5, repeticiones: 10, registrada: true },
      { peso_kg: 60, repeticiones: 9, registrada: false },
      { peso_kg: 57.5, repeticiones: 8, registrada: false },
    ])
  })

  it('con más series hechas que previstas, quedan todas las hechas', () => {
    const hechas = [1, 2, 3, 4].map(() => ({ peso_kg: 50, repeticiones: 10 }))
    const filas = filasPrecargadas({ prescripcion: rutina, vezPasada: null, hechas })
    expect(filas).toHaveLength(4)
    expect(filas.every((f) => f.registrada)).toBe(true)
  })

  it('entrenando libre y sin historial, una fila vacía para empezar', () => {
    expect(filasPrecargadas({ prescripcion: null, vezPasada: null, hechas: [] }))
      .toEqual([{ peso_kg: null, repeticiones: null, registrada: false }])
  })

  it('con "al fallo" no inventa repeticiones', () => {
    const filas = filasPrecargadas({
      prescripcion: { series: 1, repeticiones: 'al fallo', peso_sugerido_kg: null },
      vezPasada: null, hechas: [],
    })
    expect(filas).toEqual([{ peso_kg: null, repeticiones: null, registrada: false }])
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:core`
Expected: FAIL — `Failed to resolve import "../src/registro"`.

- [ ] **Step 3: Escribir la implementación**

Crear `packages/core/src/registro.ts`:

```ts
/**
 * Lógica del registro serie por serie. Vive acá y no en la pantalla de sesión
 * por el mismo motivo que validarBorrador: en un componente de React Native
 * solo se verificaría a mano. Y es la que decide si una serie es récord sin
 * señal, que es lo único de Progreso que funciona en un subsuelo.
 */

export interface SerieHecha {
  peso_kg: number
  repeticiones: number
}

/** Por ejercicio. Es lo que el teléfono cachea y lo que devuelve la vista `mejores_marcas`. */
export interface MejorMarca {
  mejor_peso_kg: number
  /** De UNA sesión, no el total histórico. */
  mejor_volumen_kg: number
}

/** La clave es el `ejercicio_id`. */
export type Marcas = Record<string, MejorMarca>

export type TipoRecord = 'peso' | 'volumen'

/** El máximo que entra en `numeric(6,2)`. Lo que pase de acá la base lo rechaza. */
export const PESO_MAXIMO_KG = 9999.99

/** Lee lo que escribió el socio. Acepta la coma decimal; un campo vacío da `NaN`, no cero. */
export function aNumero(texto: string): number {
  const limpio = texto.trim().replace(',', '.')
  return limpio === '' ? NaN : Number(limpio)
}

/**
 * El motivo por el que la serie no se puede registrar, listo para mostrar, o
 * `null` si está bien. Frena antes lo que el `check` de la base frenaría
 * después: un rechazo de la base es permanente y la serie quedaría marcada
 * como "no se pudo guardar".
 */
export function validarSerie(serie: SerieHecha): string | null {
  if (Number.isNaN(serie.peso_kg)) return 'Poné el peso'
  if (serie.peso_kg < 0) return 'El peso no puede ser negativo'
  if (!Number.isFinite(serie.peso_kg) || serie.peso_kg > PESO_MAXIMO_KG) {
    return 'Ese peso no parece real'
  }
  if (!Number.isInteger(serie.repeticiones) || serie.repeticiones < 1) {
    return 'Las repeticiones tienen que ser al menos 1'
  }
  return null
}

/**
 * Las repeticiones a precargar a partir de lo que dice la rutina, que es texto
 * libre: de "8-12" toma 8, de "al fallo" nada.
 */
export function repsSugeridas(prescripcion: string): number | null {
  const encontrado = prescripcion.match(/\d+/)
  if (!encontrado) return null
  const n = Number(encontrado[0])
  return n > 0 ? n : null
}

/** Peso por repeticiones, sumado. Redondeado a centavos para no arrastrar errores de coma flotante. */
export function volumen(series: SerieHecha[]): number {
  const total = series.reduce((suma, s) => suma + s.peso_kg * s.repeticiones, 0)
  return Math.round(total * 100) / 100
}

/**
 * Si la serie nueva es récord, y de qué.
 *
 * `previa` es la marca de ANTES de esta sesión —la pantalla la lee al empezar
 * y no la toca hasta terminar—. `anteriores` son las series de este ejercicio
 * ya registradas en esta sesión.
 *
 * - Sin marca previa no hay récord: la primera vez que se hace un ejercicio no
 *   hay contra qué comparar, y avisarlo en cada ejercicio nuevo sería ruido.
 * - El de peso compara contra la marca y contra lo ya hecho hoy, para no
 *   volver a avisar un récord que se batió dos series antes.
 * - El de volumen mira lo acumulado del ejercicio en la sesión y se avisa en la
 *   serie que cruza la marca: una sola vez, porque la siguiente ya parte de
 *   arriba.
 * - Si una serie bate los dos, gana el de peso, que se entiende sin explicación.
 */
export function detectarRecord(
  previa: MejorMarca | undefined,
  anteriores: SerieHecha[],
  nueva: SerieHecha,
): TipoRecord | null {
  if (!previa) return null

  const pesoDeReferencia = Math.max(previa.mejor_peso_kg, ...anteriores.map((s) => s.peso_kg))
  if (nueva.peso_kg > pesoDeReferencia) return 'peso'

  const antes = volumen(anteriores)
  const despues = volumen([...anteriores, nueva])
  if (antes <= previa.mejor_volumen_kg && despues > previa.mejor_volumen_kg) return 'volumen'

  return null
}

/** Lo que una sesión aporta a las marcas de un ejercicio. */
export function marcaDeSesion(series: SerieHecha[]): MejorMarca | null {
  if (series.length === 0) return null
  return {
    mejor_peso_kg: Math.max(...series.map((s) => s.peso_kg)),
    mejor_volumen_kg: volumen(series),
  }
}

/**
 * Junta dos fuentes de marcas quedándose con el máximo de cada campo. Se usa
 * al refrescar desde el servidor: reemplazar borraría un récord hecho sin señal
 * que todavía está en la cola.
 */
export function fusionarMarcas(a: Marcas, b: Marcas): Marcas {
  const resultado: Marcas = { ...a }
  for (const [ejercicioId, marca] of Object.entries(b)) {
    const actual = resultado[ejercicioId]
    resultado[ejercicioId] = actual
      ? {
          mejor_peso_kg: Math.max(actual.mejor_peso_kg, marca.mejor_peso_kg),
          mejor_volumen_kg: Math.max(actual.mejor_volumen_kg, marca.mejor_volumen_kg),
        }
      : marca
  }
  return resultado
}

/**
 * "57,5" y no "57.5". A mano y no con toLocaleString: el soporte de Intl en
 * Hermes depende de cómo se compiló la app.
 */
export function formatearKg(kg: number): string {
  return String(Math.round(kg * 100) / 100).replace('.', ',')
}

/**
 * "60kg × 10, 10, 9, 8" si todas tienen el mismo peso; "60kg × 10, 57,5kg × 9"
 * si no. Lo usan "la vez pasada" y el detalle de una sesión del historial.
 */
export function detalleSeries(series: SerieHecha[]): string {
  const primera = series[0]
  if (!primera) return ''

  const mismoPeso = series.every((s) => s.peso_kg === primera.peso_kg)
  return mismoPeso
    ? `${formatearKg(primera.peso_kg)}kg × ${series.map((s) => s.repeticiones).join(', ')}`
    : series.map((s) => `${formatearKg(s.peso_kg)}kg × ${s.repeticiones}`).join(', ')
}

/** "La vez pasada: 60kg × 10, 10, 9, 8". */
export function textoVezPasada(series: SerieHecha[]): string | null {
  return series.length ? `La vez pasada: ${detalleSeries(series)}` : null
}

/** Lo que la rutina dice de un ejercicio, tal como viene de `rutina_ejercicios`. */
export interface Prescripcion {
  series: number
  /** Texto libre: "8-12", "10", "al fallo". */
  repeticiones: string
  peso_sugerido_kg: number | null
}

/** Una fila de la pantalla de sesión. `null` = el campo arranca vacío. */
export interface FilaPrecargada {
  peso_kg: number | null
  repeticiones: number | null
  registrada: boolean
}

/**
 * Las filas con las que arranca un ejercicio en la pantalla de sesión. Es lo
 * que hace que repetir lo de la vez pasada cueste cuatro toques: abrir el
 * ejercicio y tildar tres series.
 *
 * - Con señal manda la vez pasada: es lo que el socio hizo, no lo que alguien
 *   le prescribió. Si la rutina pide más series, se repite la última.
 * - Sin señal (`vezPasada` nulo), lo que dice la rutina: la cantidad de series,
 *   el primer número del rango y el peso sugerido.
 * - Las ya registradas —al retomar una sesión abierta— ocupan las primeras
 *   filas.
 * - Entrenando libre y sin historial, una fila vacía para empezar.
 */
export function filasPrecargadas(datos: {
  prescripcion: Prescripcion | null
  vezPasada: SerieHecha[] | null
  hechas: SerieHecha[]
}): FilaPrecargada[] {
  const pasada = datos.vezPasada ?? []
  const p = datos.prescripcion
  const cantidad = Math.max(p?.series ?? 0, pasada.length, 1)

  const sugeridas: FilaPrecargada[] = []
  for (let i = 0; i < cantidad; i++) {
    const dePasada = pasada[i] ?? pasada[pasada.length - 1]
    sugeridas.push(dePasada
      ? { peso_kg: dePasada.peso_kg, repeticiones: dePasada.repeticiones, registrada: false }
      : {
          peso_kg: p?.peso_sugerido_kg ?? null,
          repeticiones: p ? repsSugeridas(p.repeticiones) : null,
          registrada: false,
        })
  }

  const hechas = datos.hechas.map((h) => ({
    peso_kg: h.peso_kg, repeticiones: h.repeticiones, registrada: true,
  }))
  return [...hechas, ...sugeridas.slice(hechas.length)]
}
```

- [ ] **Step 4: Exportar desde el índice**

Agregar al final de `packages/core/src/index.ts`:

```ts
export {
  PESO_MAXIMO_KG, aNumero, validarSerie, repsSugeridas, volumen, detectarRecord,
  marcaDeSesion, fusionarMarcas, formatearKg, detalleSeries, textoVezPasada,
  filasPrecargadas,
} from './registro'
export type {
  SerieHecha, MejorMarca, Marcas, TipoRecord, Prescripcion, FilaPrecargada,
} from './registro'
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm run test:core`
Expected: PASS, incluidos los 37 de `registro.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/registro.ts packages/core/tests/registro.test.ts packages/core/src/index.ts
git commit -m "Decidir en core qué serie es récord y con qué se precarga

Es lo único de Progreso que funciona sin señal, y en un componente
solo se probaría tocando la app. La primera vez no cuenta, igualar no
cuenta, y el de volumen se avisa una sola vez por sesión. Las marcas
se fusionan en vez de pisarse para que un récord hecho sin señal no
se pierda."
```

---

## Tarea 6: La cola de sincronización en `@gym/core`

**Files:**
- Create: `packages/core/src/cola.ts`
- Create: `packages/core/tests/cola.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nada.
- Produces (todo exportado desde `@gym/core`):
  - `type EstadoEnvio = 'pendiente' | 'enviada' | 'rechazada'`
  - `type EstadoFin = 'abierta' | 'pendiente' | 'enviado' | 'rechazado'`
  - `interface SesionEnCola { id_local; membership_id; gym_id; rutina_dia_id: string | null; inicio: string; fin: string | null; notas: string | null; estado: EstadoEnvio; servidor_id: string | null; estado_fin: EstadoFin }` (los campos sin tipo son `string`)
  - `interface SerieEnCola { id_local; sesion_id_local; ejercicio_id: string; numero_serie: number; peso_kg: number; repeticiones: number; estado: EstadoEnvio }`
  - `type Operacion = { tipo: 'sesion'; sesion: SesionEnCola } | { tipo: 'serie'; serie: SerieEnCola; sesion_servidor_id: string } | { tipo: 'fin'; sesion: SesionEnCola; servidor_id: string; fin: string }`
  - `type Clasificacion = 'exito' | 'duplicado' | 'transitorio' | 'permanente'`
  - `siguientesOperaciones(sesiones: SesionEnCola[], series: SerieEnCola[], membresias: string[]): Operacion[]`
  - `clasificarRespuesta(error: { code?: string | null } | null): Clasificacion`
  - `estadoTras(c: Clasificacion): EstadoEnvio | null` — `null` = no cambia
  - `estadoFinTras(c: Clasificacion): EstadoFin | null`
  - `interface ResumenCola { seriesPendientes: number; otrasPendientes: number; rechazadas: number }`
  - `resumenCola(sesiones, series, membresias): ResumenCola`
  - `textoEstadoCola(r: ResumenCola): string | null`
  - `sesionesLimpiables(sesiones, series): string[]` — `id_local` de las que ya no hace falta guardar
  - `sesionAbierta(sesiones, membresias): SesionEnCola | null`

- [ ] **Step 1: Escribir los tests**

Crear `packages/core/tests/cola.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  clasificarRespuesta, estadoFinTras, estadoTras, resumenCola, sesionAbierta,
  sesionesLimpiables, siguientesOperaciones, textoEstadoCola,
  type SerieEnCola, type SesionEnCola,
} from '../src/cola'

const YO = 'membresia-mia'
const OTRO = 'membresia-de-otro'

function sesion(campos: Partial<SesionEnCola> = {}): SesionEnCola {
  return {
    id_local: 's1', membership_id: YO, gym_id: 'g1', rutina_dia_id: null,
    inicio: '2026-10-08T10:00:00Z', fin: null, notas: null,
    estado: 'pendiente', servidor_id: null, estado_fin: 'abierta',
    ...campos,
  }
}

function serie(campos: Partial<SerieEnCola> = {}): SerieEnCola {
  return {
    id_local: 'r1', sesion_id_local: 's1', ejercicio_id: 'e1',
    numero_serie: 1, peso_kg: 60, repeticiones: 10, estado: 'pendiente',
    ...campos,
  }
}

const enviada = (campos: Partial<SesionEnCola> = {}) =>
  sesion({ estado: 'enviada', servidor_id: 'srv-1', ...campos })

describe('siguientesOperaciones', () => {
  it('primero la sesión: sus series esperan a tener a qué colgarse', () => {
    const ops = siguientesOperaciones([sesion()], [serie()], [YO])
    expect(ops).toEqual([{ tipo: 'sesion', sesion: sesion() }])
  })

  it('con la sesión enviada, las series con el id del servidor', () => {
    const ops = siguientesOperaciones([enviada()], [serie()], [YO])
    expect(ops).toEqual([{ tipo: 'serie', serie: serie(), sesion_servidor_id: 'srv-1' }])
  })

  it('el fin va después de la última serie, no junto con ellas', () => {
    const terminada = enviada({ fin: '2026-10-08T11:00:00Z', estado_fin: 'pendiente' })
    expect(siguientesOperaciones([terminada], [serie()], [YO]).map((o) => o.tipo))
      .toEqual(['serie'])
    expect(siguientesOperaciones([terminada], [serie({ estado: 'enviada' })], [YO]))
      .toEqual([{ tipo: 'fin', sesion: terminada, servidor_id: 'srv-1', fin: '2026-10-08T11:00:00Z' }])
  })

  it('una sesión abierta no manda fin', () => {
    expect(siguientesOperaciones([enviada()], [], [YO])).toEqual([])
  })

  it('las series de una sesión rechazada quedan frenadas', () => {
    expect(siguientesOperaciones([sesion({ estado: 'rechazada' })], [serie()], [YO])).toEqual([])
  })

  it('lo rechazado no se vuelve a mandar', () => {
    expect(siguientesOperaciones([enviada()], [serie({ estado: 'rechazada' })], [YO])).toEqual([])
  })

  // Si en el teléfono inició sesión otra persona, lo que quedó en la cola del
  // anterior no sale con la cuenta del nuevo.
  it('nunca empuja filas de otra membresía', () => {
    const ajena = sesion({ membership_id: OTRO })
    expect(siguientesOperaciones([ajena], [serie()], [YO])).toEqual([])
    expect(siguientesOperaciones([enviada({ membership_id: OTRO })], [serie()], [YO])).toEqual([])
  })

  it('todo enviado: no hay nada que hacer', () => {
    const lista = enviada({ fin: '2026-10-08T11:00:00Z', estado_fin: 'enviado' })
    expect(siguientesOperaciones([lista], [serie({ estado: 'enviada' })], [YO])).toEqual([])
  })
})

describe('clasificarRespuesta', () => {
  it('sin error es éxito', () => {
    expect(clasificarRespuesta(null)).toBe('exito')
  })

  // Un envío anterior sí había llegado y la respuesta se perdió.
  it('el choque contra id_local es un duplicado, no un error', () => {
    expect(clasificarRespuesta({ code: '23505' })).toBe('duplicado')
  })

  it('RLS, clave foránea y check son permanentes: reintentar no los arregla', () => {
    expect(clasificarRespuesta({ code: '42501' })).toBe('permanente')
    expect(clasificarRespuesta({ code: '23503' })).toBe('permanente')
    expect(clasificarRespuesta({ code: '23514' })).toBe('permanente')
    expect(clasificarRespuesta({ code: '22P02' })).toBe('permanente')
  })

  it('sin red, timeout o un error del servidor son transitorios', () => {
    // supabase-js devuelve code vacío cuando falla el fetch.
    expect(clasificarRespuesta({ code: '' })).toBe('transitorio')
    expect(clasificarRespuesta({})).toBe('transitorio')
    // JWT vencido: se arregla solo cuando se refresca la sesión.
    expect(clasificarRespuesta({ code: 'PGRST301' })).toBe('transitorio')
  })
})

describe('estadoTras y estadoFinTras', () => {
  it('éxito y duplicado dejan la fila enviada', () => {
    expect(estadoTras('exito')).toBe('enviada')
    expect(estadoTras('duplicado')).toBe('enviada')
    expect(estadoFinTras('exito')).toBe('enviado')
  })

  it('lo permanente queda rechazado', () => {
    expect(estadoTras('permanente')).toBe('rechazada')
    expect(estadoFinTras('permanente')).toBe('rechazado')
  })

  it('lo transitorio no cambia nada: el intento siguiente la lleva', () => {
    expect(estadoTras('transitorio')).toBeNull()
    expect(estadoFinTras('transitorio')).toBeNull()
  })
})

describe('resumenCola y textoEstadoCola', () => {
  it('cuenta las series pendientes', () => {
    const r = resumenCola(
      [enviada()],
      [serie({ id_local: 'a' }), serie({ id_local: 'b' }), serie({ id_local: 'c', estado: 'enviada' })],
      [YO],
    )
    expect(r).toEqual({ seriesPendientes: 2, otrasPendientes: 0, rechazadas: 0 })
    expect(textoEstadoCola(r)).toBe('2 series sin sincronizar')
  })

  it('en singular cuando es una', () => {
    expect(textoEstadoCola({ seriesPendientes: 1, otrasPendientes: 0, rechazadas: 0 }))
      .toBe('1 serie sin sincronizar')
  })

  it('las series de una sesión rechazada cuentan como rechazadas, no como pendientes', () => {
    const r = resumenCola([sesion({ estado: 'rechazada' })], [serie()], [YO])
    expect(r.rechazadas).toBe(1)
    expect(r.seriesPendientes).toBe(0)
    expect(textoEstadoCola(r)).toBe('1 serie no se pudo guardar')
  })

  it('rechazadas y pendientes juntas se dicen las dos', () => {
    expect(textoEstadoCola({ seriesPendientes: 3, otrasPendientes: 0, rechazadas: 2 }))
      .toBe('2 series no se pudieron guardar · 3 series sin sincronizar')
  })

  it('si solo falta el cierre de la sesión, también se dice', () => {
    const r = resumenCola(
      [enviada({ fin: '2026-10-08T11:00:00Z', estado_fin: 'pendiente' })],
      [serie({ estado: 'enviada' })],
      [YO],
    )
    expect(textoEstadoCola(r)).toBe('Falta sincronizar el entrenamiento')
  })

  it('todo al día no muestra nada', () => {
    expect(textoEstadoCola({ seriesPendientes: 0, otrasPendientes: 0, rechazadas: 0 })).toBeNull()
  })

  it('no cuenta lo de otra membresía', () => {
    expect(resumenCola([sesion({ membership_id: OTRO })], [serie()], [YO]).seriesPendientes).toBe(0)
  })
})

describe('sesionesLimpiables', () => {
  const terminada = enviada({ fin: '2026-10-08T11:00:00Z', estado_fin: 'enviado' })

  it('una sesión con todo enviado ya no hace falta en el teléfono', () => {
    expect(sesionesLimpiables([terminada], [serie({ estado: 'enviada' })])).toEqual(['s1'])
  })

  it('con alguna serie pendiente se queda', () => {
    expect(sesionesLimpiables([terminada], [serie()])).toEqual([])
  })

  // Lo rechazado se guarda: nunca se borra solo.
  it('con algo rechazado se queda', () => {
    expect(sesionesLimpiables([terminada], [serie({ estado: 'rechazada' })])).toEqual([])
    expect(sesionesLimpiables([sesion({ estado: 'rechazada' })], [])).toEqual([])
  })

  it('una sesión abierta se queda, aunque esté enviada', () => {
    expect(sesionesLimpiables([enviada()], [serie({ estado: 'enviada' })])).toEqual([])
  })
})

describe('sesionAbierta', () => {
  it('la más reciente sin terminar, propia', () => {
    const vieja = sesion({ id_local: 'vieja', inicio: '2026-10-07T10:00:00Z' })
    const nueva = sesion({ id_local: 'nueva', inicio: '2026-10-08T10:00:00Z' })
    expect(sesionAbierta([vieja, nueva], [YO])?.id_local).toBe('nueva')
  })

  it('las terminadas y las ajenas no cuentan', () => {
    const terminada = sesion({ fin: '2026-10-08T11:00:00Z', estado_fin: 'pendiente' })
    const ajena = sesion({ id_local: 's2', membership_id: OTRO })
    expect(sesionAbierta([terminada, ajena], [YO])).toBeNull()
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:core`
Expected: FAIL — `Failed to resolve import "../src/cola"`.

- [ ] **Step 3: Escribir la implementación**

Crear `packages/core/src/cola.ts`:

```ts
/**
 * La cola de sincronización, sin I/O. La app guarda las filas en SQLite y
 * habla con Supabase; todo lo que DECIDE —qué se manda, en qué orden, qué
 * significa cada respuesta, qué se le muestra al socio— está acá, porque es lo
 * más frágil de la etapa y acá se puede probar sin un teléfono.
 *
 * Por qué alcanza con una cola y no hace falta resolver conflictos: un solo
 * dispositivo escribe una sesión dada, y las series se agregan y nunca se
 * editan. Ver la sección 2 del diseño de la etapa 3.
 */

export type EstadoEnvio = 'pendiente' | 'enviada' | 'rechazada'

/**
 * El cierre de la sesión viaja aparte de la sesión: es el único update de la
 * cola. `abierta` = todavía no se tocó Terminar.
 */
export type EstadoFin = 'abierta' | 'pendiente' | 'enviado' | 'rechazado'

export interface SesionEnCola {
  id_local: string
  membership_id: string
  gym_id: string
  rutina_dia_id: string | null
  inicio: string
  fin: string | null
  notas: string | null
  estado: EstadoEnvio
  /** El id que le dio el servidor. Hace falta para colgarle las series y para escribir el fin. */
  servidor_id: string | null
  estado_fin: EstadoFin
}

export interface SerieEnCola {
  id_local: string
  sesion_id_local: string
  ejercicio_id: string
  numero_serie: number
  peso_kg: number
  repeticiones: number
  estado: EstadoEnvio
}

export type Operacion =
  | { tipo: 'sesion'; sesion: SesionEnCola }
  | { tipo: 'serie'; serie: SerieEnCola; sesion_servidor_id: string }
  | { tipo: 'fin'; sesion: SesionEnCola; servidor_id: string; fin: string }

export type Clasificacion = 'exito' | 'duplicado' | 'transitorio' | 'permanente'

const propias = (sesiones: SesionEnCola[], membresias: string[]) =>
  sesiones.filter((s) => membresias.includes(s.membership_id))

/**
 * Lo que se puede mandar AHORA. Una sesión, sus series y su fin no salen en la
 * misma tanda: las series necesitan el id que el servidor le da a la sesión, y
 * el fin va después de la última serie. La app llama de nuevo después de cada
 * tanda hasta que no quede nada o falle algo transitorio.
 *
 * `membresias` son las de quien tiene la sesión iniciada: lo de otra persona
 * que haya quedado en el teléfono no sale con esta cuenta.
 */
export function siguientesOperaciones(
  sesiones: SesionEnCola[],
  series: SerieEnCola[],
  membresias: string[],
): Operacion[] {
  const mias = propias(sesiones, membresias)
  const porIdLocal = new Map(mias.map((s) => [s.id_local, s]))
  const operaciones: Operacion[] = []

  for (const s of mias) {
    if (s.estado === 'pendiente') operaciones.push({ tipo: 'sesion', sesion: s })
  }

  for (const r of series) {
    if (r.estado !== 'pendiente') continue
    const suya = porIdLocal.get(r.sesion_id_local)
    // Sin sesión enviada no hay a qué colgarla. Si la sesión fue rechazada,
    // la serie queda frenada para siempre: resumenCola la cuenta como
    // rechazada.
    if (suya?.estado === 'enviada' && suya.servidor_id) {
      operaciones.push({ tipo: 'serie', serie: r, sesion_servidor_id: suya.servidor_id })
    }
  }

  for (const s of mias) {
    if (s.estado !== 'enviada' || !s.servidor_id || !s.fin || s.estado_fin !== 'pendiente') continue
    const quedanSeries = series.some((r) => r.sesion_id_local === s.id_local && r.estado === 'pendiente')
    if (!quedanSeries) {
      operaciones.push({ tipo: 'fin', sesion: s, servidor_id: s.servidor_id, fin: s.fin })
    }
  }

  return operaciones
}

/**
 * Qué significa la respuesta del servidor para la fila.
 *
 * - `23505`: chocó contra el índice único de `id_local`. Un envío anterior sí
 *   había llegado y la respuesta se perdió: es éxito.
 * - Clases `22` (dato inválido), `23` (integridad: clave foránea, check) y `42`
 *   (permisos, RLS): permanentes. Reintentar no los arregla; el ejemplo típico
 *   es una membresía dada de baja mientras el socio entrenaba sin señal.
 * - Todo lo demás —sin red (supabase-js devuelve `code` vacío), timeout, 5xx,
 *   JWT vencido—: transitorio.
 */
export function clasificarRespuesta(error: { code?: string | null } | null): Clasificacion {
  if (!error) return 'exito'
  const codigo = error.code ?? ''
  if (codigo === '23505') return 'duplicado'
  if (/^(22|23|42)/.test(codigo)) return 'permanente'
  return 'transitorio'
}

/** `null` = la fila no cambia y el intento siguiente la vuelve a llevar. */
export function estadoTras(c: Clasificacion): EstadoEnvio | null {
  if (c === 'exito' || c === 'duplicado') return 'enviada'
  if (c === 'permanente') return 'rechazada'
  return null
}

export function estadoFinTras(c: Clasificacion): EstadoFin | null {
  if (c === 'exito' || c === 'duplicado') return 'enviado'
  if (c === 'permanente') return 'rechazado'
  return null
}

export interface ResumenCola {
  seriesPendientes: number
  /** Sesiones o cierres pendientes. Solo se mencionan si no hay series pendientes. */
  otrasPendientes: number
  /** Series rechazadas, más las frenadas por una sesión rechazada. */
  rechazadas: number
}

export function resumenCola(
  sesiones: SesionEnCola[],
  series: SerieEnCola[],
  membresias: string[],
): ResumenCola {
  const mias = propias(sesiones, membresias)
  const porIdLocal = new Map(mias.map((s) => [s.id_local, s]))
  const resumen: ResumenCola = { seriesPendientes: 0, otrasPendientes: 0, rechazadas: 0 }

  for (const r of series) {
    const suya = porIdLocal.get(r.sesion_id_local)
    if (!suya) continue
    if (r.estado === 'rechazada' || suya.estado === 'rechazada') resumen.rechazadas++
    else if (r.estado === 'pendiente') resumen.seriesPendientes++
  }

  // Un cierre rechazado no se cuenta: solo pasa si la membresía se dio de baja,
  // y en ese caso lo que el socio necesita saber ya lo dicen sus series.
  resumen.otrasPendientes = mias.filter((s) =>
    s.estado === 'pendiente' || (s.estado === 'enviada' && s.estado_fin === 'pendiente'),
  ).length

  return resumen
}

/** El aviso siempre visible. `null` cuando todo está al día. */
export function textoEstadoCola(r: ResumenCola): string | null {
  const partes: string[] = []

  if (r.rechazadas === 1) partes.push('1 serie no se pudo guardar')
  else if (r.rechazadas > 1) partes.push(`${r.rechazadas} series no se pudieron guardar`)

  if (r.seriesPendientes === 1) partes.push('1 serie sin sincronizar')
  else if (r.seriesPendientes > 1) partes.push(`${r.seriesPendientes} series sin sincronizar`)
  else if (r.otrasPendientes > 0) partes.push('Falta sincronizar el entrenamiento')

  return partes.length ? partes.join(' · ') : null
}

/**
 * Las sesiones que ya están enteras en el servidor y se pueden sacar del
 * teléfono. Lo rechazado se queda: nunca se borra solo.
 */
export function sesionesLimpiables(sesiones: SesionEnCola[], series: SerieEnCola[]): string[] {
  return sesiones
    .filter((s) => s.estado === 'enviada' && s.estado_fin === 'enviado')
    .filter((s) => series
      .filter((r) => r.sesion_id_local === s.id_local)
      .every((r) => r.estado === 'enviada'))
    .map((s) => s.id_local)
}

/** La sesión que quedó sin terminar —la app se cerró, o el socio salió sin tocar Terminar—. */
export function sesionAbierta(sesiones: SesionEnCola[], membresias: string[]): SesionEnCola | null {
  const abiertas = propias(sesiones, membresias)
    .filter((s) => s.fin === null)
    .sort((a, b) => b.inicio.localeCompare(a.inicio))
  return abiertas[0] ?? null
}
```

- [ ] **Step 4: Exportar desde el índice**

Agregar al final de `packages/core/src/index.ts`:

```ts
export {
  siguientesOperaciones, clasificarRespuesta, estadoTras, estadoFinTras,
  resumenCola, textoEstadoCola, sesionesLimpiables, sesionAbierta,
} from './cola'
export type {
  EstadoEnvio, EstadoFin, SesionEnCola, SerieEnCola, Operacion, Clasificacion, ResumenCola,
} from './cola'
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm run test:core`
Expected: PASS, incluidos los 28 de `cola.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/cola.ts packages/core/tests/cola.test.ts packages/core/src/index.ts
git commit -m "Decidir en core qué manda la cola y qué significa cada respuesta

Es lo más frágil de la etapa. La sesión sale primero porque las series
necesitan su id, y el cierre sale después de la última serie. Un
error permanente se marca como rechazado en vez de reintentarse para
siempre. Y la cola nunca manda filas de otra membresía, aunque en el
teléfono haya iniciado sesión otra persona."
```

---

## Tarea 7: La evolución por ejercicio en `@gym/core`

**Files:**
- Create: `packages/core/src/evolucion.ts`
- Create: `packages/core/tests/evolucion.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `volumen` de `./registro` (Tarea 5).
- Produces (todo exportado desde `@gym/core`):
  - `interface FilaSerie { sesion_id: string; inicio: string; peso_kg: number; repeticiones: number; completada: boolean }`
  - `interface PuntoEvolucion { sesion_id: string; fecha: string; pesoMax: number; volumen: number }`
  - `evolucionPorSesion(filas: FilaSerie[]): PuntoEvolucion[]` — ordenado por fecha ascendente
  - `marcarRecords(valores: number[]): boolean[]`
  - `interface Margenes { izq: number; der: number; arr: number; abj: number }`
  - `MARGENES_GRAFICO: Margenes`
  - `interface Geometria { puntos: { x: number; y: number }[]; guias: { y: number; valor: number }[]; etiquetasX: { x: number; indice: number }[] }`
  - `geometriaGrafico(valores: number[], ancho: number, alto: number, margenes?: Margenes): Geometria`

- [ ] **Step 1: Escribir los tests**

Crear `packages/core/tests/evolucion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { evolucionPorSesion, geometriaGrafico, marcarRecords, type FilaSerie } from '../src/evolucion'

const fila = (campos: Partial<FilaSerie>): FilaSerie => ({
  sesion_id: 's1', inicio: '2026-10-08T10:00:00Z', peso_kg: 60, repeticiones: 10, completada: true,
  ...campos,
})

describe('evolucionPorSesion', () => {
  it('un punto por sesión, con su peso máximo y su volumen', () => {
    const puntos = evolucionPorSesion([
      fila({ peso_kg: 60, repeticiones: 10 }),
      fila({ peso_kg: 65, repeticiones: 5 }),
    ])
    expect(puntos).toEqual([
      { sesion_id: 's1', fecha: '2026-10-08T10:00:00Z', pesoMax: 65, volumen: 925 },
    ])
  })

  it('ordenado por fecha, aunque las filas lleguen en otro orden', () => {
    const puntos = evolucionPorSesion([
      fila({ sesion_id: 'hoy', inicio: '2026-10-08T10:00:00Z' }),
      fila({ sesion_id: 'ayer', inicio: '2026-10-07T10:00:00Z' }),
    ])
    expect(puntos.map((p) => p.sesion_id)).toEqual(['ayer', 'hoy'])
  })

  it('las series sin completar no cuentan para nada', () => {
    const puntos = evolucionPorSesion([
      fila({ peso_kg: 60, repeticiones: 10 }),
      fila({ peso_kg: 100, repeticiones: 1, completada: false }),
    ])
    expect(puntos[0]).toMatchObject({ pesoMax: 60, volumen: 600 })
  })

  it('una sesión con todo sin completar no es un punto', () => {
    expect(evolucionPorSesion([fila({ completada: false })])).toEqual([])
  })
})

describe('marcarRecords', () => {
  // El mismo criterio que el aviso de récord, para que gráfico y aviso no se
  // contradigan: la primera vez no cuenta, igualar no cuenta.
  it('marca los puntos que superan a todos los anteriores', () => {
    expect(marcarRecords([50, 52.5, 52.5, 55, 54, 57.5]))
      .toEqual([false, true, false, true, false, true])
  })

  it('sin puntos no hay marcas', () => {
    expect(marcarRecords([])).toEqual([])
  })
})

describe('geometriaGrafico', () => {
  const SIN_MARGEN = { izq: 0, der: 0, arr: 0, abj: 0 }

  it('reparte los puntos a la misma distancia y escala el alto entre mínimo y máximo', () => {
    const g = geometriaGrafico([10, 20, 30], 100, 50, SIN_MARGEN)
    expect(g.puntos).toEqual([{ x: 0, y: 50 }, { x: 50, y: 25 }, { x: 100, y: 0 }])
    expect(g.guias).toEqual([{ y: 50, valor: 10 }, { y: 0, valor: 30 }])
  })

  it('respeta los márgenes', () => {
    const g = geometriaGrafico([10, 30], 120, 70, { izq: 20, der: 0, arr: 10, abj: 10 })
    expect(g.puntos).toEqual([{ x: 20, y: 60 }, { x: 120, y: 10 }])
  })

  // Sin esto la escala divide por cero y los puntos salen en NaN.
  it('con todos los valores iguales, la línea va por el medio y hay una sola guía', () => {
    const g = geometriaGrafico([7, 7, 7], 100, 50, SIN_MARGEN)
    expect(g.puntos.map((p) => p.y)).toEqual([25, 25, 25])
    expect(g.guias).toEqual([{ y: 25, valor: 7 }])
  })

  it('un solo punto va centrado', () => {
    const g = geometriaGrafico([42], 100, 50, SIN_MARGEN)
    expect(g.puntos).toEqual([{ x: 50, y: 25 }])
    expect(g.etiquetasX).toEqual([{ x: 50, indice: 0 }])
  })

  it('sin valores no hay nada que dibujar', () => {
    expect(geometriaGrafico([], 100, 50, SIN_MARGEN))
      .toEqual({ puntos: [], guias: [], etiquetasX: [] })
  })

  it('las fechas de abajo: la primera, la del medio y la última', () => {
    const g = geometriaGrafico([1, 2, 3, 4, 5], 100, 50, SIN_MARGEN)
    expect(g.etiquetasX.map((e) => e.indice)).toEqual([0, 2, 4])
  })

  it('con dos puntos, las dos fechas sin repetir', () => {
    const g = geometriaGrafico([1, 2], 100, 50, SIN_MARGEN)
    expect(g.etiquetasX.map((e) => e.indice)).toEqual([0, 1])
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:core`
Expected: FAIL — `Failed to resolve import "../src/evolucion"`.

- [ ] **Step 3: Escribir la implementación**

Crear `packages/core/src/evolucion.ts`:

```ts
import { volumen } from './registro'

/**
 * La evolución de un ejercicio: de las filas de la base a los puntos del
 * gráfico, y de los puntos a coordenadas. El componente de la app solo
 * traduce la geometría a react-native-svg; todo lo que puede salir mal —una
 * escala que divide por cero, un récord marcado distinto que el aviso— está
 * acá y tiene test. Ver la sección 4 del diseño de la etapa 3.
 */

export interface FilaSerie {
  sesion_id: string
  /** El inicio de la sesión: es la fecha del punto. */
  inicio: string
  peso_kg: number
  repeticiones: number
  completada: boolean
}

export interface PuntoEvolucion {
  sesion_id: string
  fecha: string
  pesoMax: number
  volumen: number
}

/** Un punto por sesión con al menos una serie completada, ordenados por fecha. */
export function evolucionPorSesion(filas: FilaSerie[]): PuntoEvolucion[] {
  const porSesion = new Map<string, FilaSerie[]>()
  for (const f of filas) {
    if (!f.completada) continue
    const grupo = porSesion.get(f.sesion_id)
    if (grupo) grupo.push(f)
    else porSesion.set(f.sesion_id, [f])
  }

  return [...porSesion.entries()]
    .map(([sesion_id, grupo]) => ({
      sesion_id,
      fecha: grupo[0]!.inicio,
      pesoMax: Math.max(...grupo.map((f) => f.peso_kg)),
      volumen: volumen(grupo),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/**
 * Qué puntos van en dorado: los que superan a todos los anteriores. El primero
 * nunca —no hay contra qué compararlo—, igual que el aviso de récord.
 */
export function marcarRecords(valores: number[]): boolean[] {
  let mejor = -Infinity
  return valores.map((v, i) => {
    const esRecord = i > 0 && v > mejor
    mejor = Math.max(mejor, v)
    return esRecord
  })
}

export interface Margenes {
  izq: number
  der: number
  arr: number
  abj: number
}

/** Lugar a la izquierda para "1062,5" y abajo para las fechas. */
export const MARGENES_GRAFICO: Margenes = { izq: 44, der: 12, arr: 12, abj: 24 }

export interface Geometria {
  puntos: { x: number; y: number }[]
  /** Líneas horizontales en el mínimo y el máximo, con su valor. Una sola si son iguales. */
  guias: { y: number; valor: number }[]
  /** Dónde van las fechas de abajo: la primera, la del medio y la última. */
  etiquetasX: { x: number; indice: number }[]
}

/**
 * Las coordenadas del gráfico de línea. Los puntos van a la misma distancia —uno
 * por sesión, no proporcionales a la fecha—: con pocos puntos se lee mejor, y
 * un hueco de vacaciones no aplasta el resto.
 */
export function geometriaGrafico(
  valores: number[],
  ancho: number,
  alto: number,
  margenes: Margenes = MARGENES_GRAFICO,
): Geometria {
  if (valores.length === 0) return { puntos: [], guias: [], etiquetasX: [] }

  const izq = margenes.izq
  const anchoUtil = ancho - margenes.izq - margenes.der
  const arriba = margenes.arr
  const altoUtil = alto - margenes.arr - margenes.abj
  const n = valores.length

  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min

  const x = (i: number) => (n === 1 ? izq + anchoUtil / 2 : izq + (anchoUtil * i) / (n - 1))
  // Con todos los valores iguales no hay escala posible: la línea va por el
  // medio en vez de dividir por cero.
  const y = (v: number) => (rango === 0 ? arriba + altoUtil / 2 : arriba + altoUtil * (1 - (v - min) / rango))

  const puntos = valores.map((v, i) => ({ x: x(i), y: y(v) }))
  const guias = rango === 0
    ? [{ y: y(min), valor: min }]
    : [{ y: y(min), valor: min }, { y: y(max), valor: max }]
  const indices = [...new Set([0, Math.floor((n - 1) / 2), n - 1])]
  const etiquetasX = indices.map((i) => ({ x: x(i), indice: i }))

  return { puntos, guias, etiquetasX }
}
```

- [ ] **Step 4: Exportar desde el índice**

Agregar al final de `packages/core/src/index.ts`:

```ts
export {
  evolucionPorSesion, marcarRecords, geometriaGrafico, MARGENES_GRAFICO,
} from './evolucion'
export type { FilaSerie, PuntoEvolucion, Margenes, Geometria } from './evolucion'
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm run test:core`
Expected: PASS, incluidos los 13 de `evolucion.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/evolucion.ts packages/core/tests/evolucion.test.ts packages/core/src/index.ts
git commit -m "Calcular en core los puntos y la geometría del gráfico

El componente queda en traducir coordenadas a svg; lo que puede salir
mal está acá con test. La escala no divide por cero cuando todos los
valores son iguales, y los récords se marcan con el mismo criterio que
el aviso para que no se contradigan."
```

---
## Tarea 8: App — base local y sincronización

**Files:**
- Modify: `apps/movil/package.json` (vía `npx expo install`)
- Create: `apps/movil/src/lib/con-limite.ts`
- Create: `apps/movil/src/lib/local/base.ts`
- Create: `apps/movil/src/lib/local/cola.ts`
- Create: `apps/movil/src/lib/membresia.ts`
- Create: `apps/movil/src/lib/sincronizar.ts`
- Create: `apps/movil/src/lib/cerrar-sesion.ts`
- Create: `apps/movil/src/components/aviso-sincronizacion.tsx`
- Modify: `apps/movil/src/app/_layout.tsx`
- Modify: `apps/movil/src/app/(tabs)/index.tsx` (solo los cuatro botones de cerrar sesión)

**Interfaces:**
- Consumes: de `@gym/core` (Tareas 5 y 6): `SesionEnCola`, `SerieEnCola`, `EstadoEnvio`, `EstadoFin`, `Marcas`, `Operacion`, `Clasificacion`, `ResumenCola`, `siguientesOperaciones`, `clasificarRespuesta`, `estadoTras`, `estadoFinTras`, `resumenCola`, `textoEstadoCola`, `sesionesLimpiables`, `fusionarMarcas`. De la base (Tareas 1 a 4): las tablas `sesiones` y `series_registradas`, la vista `mejores_marcas`.
- Produces:
  - `conLimite<T>(consulta: PromiseLike<T>, ms?: number): Promise<T | null>` — `null` = no llegó a tiempo.
  - `base(): Promise<SQLiteDatabase>`
  - En `lib/local/cola.ts`: `interface SerieLocal extends SerieEnCola { nombre_ejercicio: string }`, `leerCola()`, `crearSesionLocal(datos)`, `agregarSerieLocal(datos)`, `seriesDeSesionLocal(sesionIdLocal)`, `terminarSesionLocal(idLocal)`, `marcarSesion(idLocal, estado, servidorId)`, `marcarSerie(idLocal, estado)`, `marcarFin(idLocal, estadoFin)`, `borrarSesionesLocales(ids)`, `vaciarTodo()`, `leerMarcas(membershipId)`, `guardarMarcas(membershipId, marcas)`, `leerCache<T>(clave)`, `guardarCache(clave, valor)`. Firmas exactas en el código de abajo.
  - En `lib/membresia.ts`: `interface Membresia { id: string; gym_id: string }`, `misMembresias(): Promise<Membresia[]>`, `membresiasGuardadas(): Promise<Membresia[]>`, `membresiaPara(gymId: string | null): Promise<Membresia | null>`.
  - En `lib/sincronizar.ts`: `interface EstadoVisible { texto: string | null; hayRechazadas: boolean }`, `sincronizar(): Promise<void>`, `actualizarEstado(): Promise<void>`, `resumenActual(): Promise<ResumenCola>`, `escucharEstado(oyente): () => void`, `iniciarSincronizacion(): () => void`.
  - `cerrarSesion(): Promise<void>`
  - Componente `<AvisoSincronizacion />`

Esta tarea no tiene pantalla nueva: deja la base, la cola y el aviso funcionando para que la Tarea 10 los use.

- [ ] **Step 1: Instalar las dependencias**

Leer antes, en la documentación de la versión 57, las páginas de `expo-sqlite`, `expo-network` y `expo-crypto`. Si alguna firma de abajo cambió, seguir la documentación y anotarlo en el reporte.

Run (desde `apps/movil`): `npx expo install expo-sqlite expo-network expo-crypto`
Expected: las tres aparecen en `dependencies` de `apps/movil/package.json` con versión `~57.x`.

- [ ] **Step 2: El tope de espera**

Crear `apps/movil/src/lib/con-limite.ts`:

```ts
/**
 * Una consulta con tope de espera. En un subsuelo la señal no siempre se corta
 * del todo: a veces queda tan mala que una consulta tarda un minuto en fallar,
 * y una pantalla no puede quedarse esperándola. `null` = no llegó a tiempo, y
 * quien llama lo trata igual que estar sin señal.
 */
export function conLimite<T>(consulta: PromiseLike<T>, ms = 4000): Promise<T | null> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const tope = new Promise<null>((resolver) => {
    temporizador = setTimeout(() => resolver(null), ms)
  })
  return Promise.race([Promise.resolve(consulta).catch(() => null), tope])
    .finally(() => clearTimeout(temporizador))
}
```

- [ ] **Step 3: La base del teléfono**

Crear `apps/movil/src/lib/local/base.ts`:

```ts
import * as SQLite from 'expo-sqlite'

/**
 * La base del teléfono. Guarda tres cosas de naturaleza distinta —ver la
 * sección 2 del diseño de la etapa 3—:
 *
 * - La cola de escritura (sesiones_locales, series_locales). Es lo único que
 *   no se puede perder.
 * - Las mejores marcas por ejercicio, para detectar un récord sin señal.
 * - Una caché de documentos JSON (la rutina activa, las membresías). Se lee
 *   entera; no es un espejo relacional del servidor.
 *
 * `user_version` es la versión del esquema local. Para cambiarlo, agregar un
 * bloque `if (version < 2)` debajo del de la versión 1; nunca editar el de 1,
 * que ya corrió en los teléfonos.
 */
let abierta: Promise<SQLite.SQLiteDatabase> | null = null

export function base(): Promise<SQLite.SQLiteDatabase> {
  abierta ??= abrir().catch((error) => {
    // Si falló, que el próximo intento vuelva a abrir en vez de heredar el error.
    abierta = null
    throw error
  })
  return abierta
}

async function abrir(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('gym.db')
  await db.execAsync('pragma journal_mode = wal;')

  const fila = await db.getFirstAsync<{ user_version: number }>('pragma user_version')
  const version = fila?.user_version ?? 0

  if (version < 1) {
    await db.execAsync(`
      create table if not exists sesiones_locales (
        id_local       text primary key,
        membership_id  text not null,
        gym_id         text not null,
        rutina_dia_id  text,
        inicio         text not null,
        fin            text,
        notas          text,
        estado         text not null default 'pendiente',
        servidor_id    text,
        estado_fin     text not null default 'abierta'
      );

      -- nombre_ejercicio no viaja al servidor: está para poder mostrar una
      -- sesión retomada sin señal.
      create table if not exists series_locales (
        id_local          text primary key,
        sesion_id_local   text not null,
        ejercicio_id      text not null,
        nombre_ejercicio  text not null,
        numero_serie      integer not null,
        peso_kg           real not null,
        repeticiones      integer not null,
        estado            text not null default 'pendiente'
      );

      create table if not exists marcas_locales (
        membership_id     text not null,
        ejercicio_id      text not null,
        mejor_peso_kg     real not null,
        mejor_volumen_kg  real not null,
        primary key (membership_id, ejercicio_id)
      );

      create table if not exists cache (
        clave  text primary key,
        valor  text not null
      );

      pragma user_version = 1;
    `)
  }

  return db
}
```

- [ ] **Step 4: Leer y escribir la cola**

Crear `apps/movil/src/lib/local/cola.ts`:

```ts
import * as Crypto from 'expo-crypto'
import type { EstadoEnvio, EstadoFin, Marcas, SerieEnCola, SesionEnCola } from '@gym/core'
import { base } from './base'

/**
 * La cola de escritura, las marcas y la caché tal como viven en SQLite. Solo
 * SQL: qué mandar, cuándo y qué significa cada respuesta lo decide @gym/core.
 */

export interface SerieLocal extends SerieEnCola {
  nombre_ejercicio: string
}

export async function leerCola(): Promise<{ sesiones: SesionEnCola[]; series: SerieLocal[] }> {
  const db = await base()
  const sesiones = await db.getAllAsync<SesionEnCola>('select * from sesiones_locales')
  const series = await db.getAllAsync<SerieLocal>('select * from series_locales order by rowid')
  return { sesiones, series }
}

/** El `id_local` se genera acá, antes de que exista señal: es la llave de los reintentos. */
export async function crearSesionLocal(datos: {
  membership_id: string
  gym_id: string
  rutina_dia_id: string | null
}): Promise<SesionEnCola> {
  const sesion: SesionEnCola = {
    id_local: Crypto.randomUUID(),
    ...datos,
    inicio: new Date().toISOString(),
    fin: null,
    notas: null,
    estado: 'pendiente',
    servidor_id: null,
    estado_fin: 'abierta',
  }
  const db = await base()
  await db.runAsync(
    `insert into sesiones_locales (id_local, membership_id, gym_id, rutina_dia_id, inicio)
     values (?, ?, ?, ?, ?)`,
    [sesion.id_local, sesion.membership_id, sesion.gym_id, sesion.rutina_dia_id, sesion.inicio],
  )
  return sesion
}

export async function agregarSerieLocal(
  datos: Omit<SerieLocal, 'id_local' | 'estado'>,
): Promise<SerieLocal> {
  const serie: SerieLocal = { id_local: Crypto.randomUUID(), estado: 'pendiente', ...datos }
  const db = await base()
  await db.runAsync(
    `insert into series_locales
       (id_local, sesion_id_local, ejercicio_id, nombre_ejercicio, numero_serie, peso_kg, repeticiones)
     values (?, ?, ?, ?, ?, ?, ?)`,
    [
      serie.id_local, serie.sesion_id_local, serie.ejercicio_id, serie.nombre_ejercicio,
      serie.numero_serie, serie.peso_kg, serie.repeticiones,
    ],
  )
  return serie
}

export async function seriesDeSesionLocal(sesionIdLocal: string): Promise<SerieLocal[]> {
  const db = await base()
  return db.getAllAsync<SerieLocal>(
    'select * from series_locales where sesion_id_local = ? order by rowid',
    [sesionIdLocal],
  )
}

/**
 * Terminar. `fin is null` para que tocar dos veces no corra la hora de cierre.
 * `max(?, inicio)` porque la base exige fin >= inicio, y el reloj del teléfono
 * se puede atrasar en el medio: sin esto el cierre quedaría rechazado para
 * siempre.
 */
export async function terminarSesionLocal(idLocal: string): Promise<void> {
  const db = await base()
  await db.runAsync(
    `update sesiones_locales
     set fin = max(?, inicio), estado_fin = 'pendiente'
     where id_local = ? and fin is null`,
    [new Date().toISOString(), idLocal],
  )
}

/** `servidorId` nulo deja el que haya: un rechazo no borra un id ya conocido. */
export async function marcarSesion(
  idLocal: string, estado: EstadoEnvio, servidorId: string | null,
): Promise<void> {
  const db = await base()
  await db.runAsync(
    'update sesiones_locales set estado = ?, servidor_id = coalesce(?, servidor_id) where id_local = ?',
    [estado, servidorId, idLocal],
  )
}

export async function marcarSerie(idLocal: string, estado: EstadoEnvio): Promise<void> {
  const db = await base()
  await db.runAsync('update series_locales set estado = ? where id_local = ?', [estado, idLocal])
}

export async function marcarFin(idLocal: string, estadoFin: EstadoFin): Promise<void> {
  const db = await base()
  await db.runAsync('update sesiones_locales set estado_fin = ? where id_local = ?', [estadoFin, idLocal])
}

/** Saca del teléfono las sesiones que ya están enteras en el servidor (ver `sesionesLimpiables`). */
export async function borrarSesionesLocales(idsLocales: string[]): Promise<void> {
  if (idsLocales.length === 0) return
  const db = await base()
  await db.withTransactionAsync(async () => {
    for (const id of idsLocales) {
      await db.runAsync('delete from series_locales where sesion_id_local = ?', [id])
      await db.runAsync('delete from sesiones_locales where id_local = ?', [id])
    }
  })
}

/** Al cerrar sesión: nada de una cuenta queda en el teléfono para la siguiente. */
export async function vaciarTodo(): Promise<void> {
  const db = await base()
  await db.execAsync(`
    delete from series_locales;
    delete from sesiones_locales;
    delete from marcas_locales;
    delete from cache;
  `)
}

export async function leerMarcas(membershipId: string): Promise<Marcas> {
  const db = await base()
  const filas = await db.getAllAsync<{
    ejercicio_id: string; mejor_peso_kg: number; mejor_volumen_kg: number
  }>(
    'select ejercicio_id, mejor_peso_kg, mejor_volumen_kg from marcas_locales where membership_id = ?',
    [membershipId],
  )
  return Object.fromEntries(filas.map((f) => [
    f.ejercicio_id, { mejor_peso_kg: f.mejor_peso_kg, mejor_volumen_kg: f.mejor_volumen_kg },
  ]))
}

/** Reemplaza fila por fila. Quien llama ya fusionó con `fusionarMarcas`. */
export async function guardarMarcas(membershipId: string, marcas: Marcas): Promise<void> {
  const db = await base()
  await db.withTransactionAsync(async () => {
    for (const [ejercicioId, m] of Object.entries(marcas)) {
      await db.runAsync(
        `insert or replace into marcas_locales (membership_id, ejercicio_id, mejor_peso_kg, mejor_volumen_kg)
         values (?, ?, ?, ?)`,
        [membershipId, ejercicioId, m.mejor_peso_kg, m.mejor_volumen_kg],
      )
    }
  })
}

export async function leerCache<T>(clave: string): Promise<T | null> {
  const db = await base()
  const fila = await db.getFirstAsync<{ valor: string }>('select valor from cache where clave = ?', [clave])
  return fila ? (JSON.parse(fila.valor) as T) : null
}

export async function guardarCache(clave: string, valor: unknown): Promise<void> {
  const db = await base()
  await db.runAsync(
    'insert or replace into cache (clave, valor) values (?, ?)',
    [clave, JSON.stringify(valor)],
  )
}
```

- [ ] **Step 5: Las membresías propias, también sin señal**

Crear `apps/movil/src/lib/membresia.ts`:

```ts
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'
import { guardarCache, leerCache } from '@/lib/local/cola'

export interface Membresia {
  id: string
  gym_id: string
}

// Por usuario: si en el teléfono entra otra persona, no hereda las membresías
// de la anterior.
const clave = (userId: string) => `membresias:${userId}`

async function usuarioActual(): Promise<string | null> {
  // getSession y no getUser: lee el teléfono, no la red. Sin señal tiene que
  // andar igual.
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/**
 * Las membresías activas de quien tiene la sesión iniciada. Con señal se
 * consultan y se guardan; sin señal, lo último guardado.
 *
 * Filtra por user_id por la misma lección que tomar-rutina.ts: memberships_leer
 * deja ver todas las del propio gimnasio, no solo las propias.
 */
export async function misMembresias(): Promise<Membresia[]> {
  const userId = await usuarioActual()
  if (!userId) return []

  const respuesta = await conLimite(
    supabase
      .from('memberships')
      .select('id, gym_id')
      .eq('user_id', userId)
      .eq('estado', 'activo')
      .order('created_at'),
  )
  if (respuesta && !respuesta.error && respuesta.data) {
    await guardarCache(clave(userId), respuesta.data)
    return respuesta.data
  }
  return (await leerCache<Membresia[]>(clave(userId))) ?? []
}

/** Solo lo guardado, sin ir a la red. Para el aviso de estado, que se recalcula seguido. */
export async function membresiasGuardadas(): Promise<Membresia[]> {
  const userId = await usuarioActual()
  if (!userId) return []
  return (await leerCache<Membresia[]>(clave(userId))) ?? []
}

/**
 * Con qué membresía se registra una sesión. Con un gimnasio dado, la de ese
 * gimnasio o ninguna: con la de otro, el servidor la rechazaría, porque el día
 * de la rutina tiene que ser del mismo gimnasio que la sesión. Sin gimnasio
 * —entrenar libre sin tener rutina—, la primera.
 */
export async function membresiaPara(gymId: string | null): Promise<Membresia | null> {
  const todas = await misMembresias()
  return (gymId ? todas.find((m) => m.gym_id === gymId) : todas[0]) ?? null
}
```

- [ ] **Step 6: La sincronización**

Crear `apps/movil/src/lib/sincronizar.ts`:

```ts
import { AppState } from 'react-native'
import * as Network from 'expo-network'
import {
  clasificarRespuesta, estadoFinTras, estadoTras, fusionarMarcas, resumenCola,
  sesionesLimpiables, siguientesOperaciones, textoEstadoCola,
  type Clasificacion, type Marcas, type Operacion, type ResumenCola, type SesionEnCola,
} from '@gym/core'
import { supabase } from '@/lib/supabase'
import { membresiasGuardadas, misMembresias } from '@/lib/membresia'
import * as local from '@/lib/local/cola'

/**
 * La sincronización: una función y un orden. Empuja sesiones, después series,
 * después cierres, y refresca las mejores marcas. Qué mandar y qué significa
 * cada respuesta lo decide @gym/core; acá solo se habla con SQLite y Supabase.
 *
 * Corre al volver la app a primer plano, al volver la red, y como intento
 * oportunista después de cada serie. Si falla no pasa nada: lo que no salió
 * sigue en la cola y lo lleva el intento siguiente.
 */

export interface EstadoVisible {
  texto: string | null
  hayRechazadas: boolean
}

type Oyente = (estado: EstadoVisible) => void

const oyentes = new Set<Oyente>()
let ultimo: EstadoVisible = { texto: null, hayRechazadas: false }
let corriendo = false
let otraVez = false

export async function sincronizar(): Promise<void> {
  // Si ya está corriendo se anota otra vuelta en vez de perder el pedido: la
  // serie que se acaba de registrar puede no estar en la cola que la vuelta
  // actual ya leyó.
  if (corriendo) {
    otraVez = true
    return
  }
  corriendo = true
  try {
    do {
      otraVez = false
      await correr()
    } while (otraVez)
  } catch {
    // Lo que no salió queda en la cola para el próximo intento.
  } finally {
    corriendo = false
    await actualizarEstado()
  }
}

async function correr(): Promise<void> {
  const membresias = (await misMembresias()).map((m) => m.id)
  if (membresias.length === 0) return

  // Tres tandas alcanzan: sesiones, sus series, sus cierres.
  for (let tanda = 0; tanda < 3; tanda++) {
    const { sesiones, series } = await local.leerCola()
    const operaciones = siguientesOperaciones(sesiones, series, membresias)
    if (operaciones.length === 0) break

    let huboTransitorio = false
    for (const op of operaciones) {
      if ((await ejecutar(op)) === 'transitorio') huboTransitorio = true
    }
    await actualizarEstado()
    // Sin señal, seguir solo acumula esperas.
    if (huboTransitorio) return
  }

  const { sesiones, series } = await local.leerCola()
  await local.borrarSesionesLocales(sesionesLimpiables(sesiones, series))
  await refrescarMarcas(membresias)
}

async function ejecutar(op: Operacion): Promise<Clasificacion> {
  try {
    switch (op.tipo) {
      case 'sesion': return await enviarSesion(op.sesion)
      case 'serie': return await enviarSerie(op)
      case 'fin': return await enviarFin(op)
    }
  } catch {
    return 'transitorio'
  }
}

async function enviarSesion(s: SesionEnCola): Promise<Clasificacion> {
  const { data, error } = await supabase
    .from('sesiones')
    .insert({
      id_local: s.id_local,
      gym_id: s.gym_id,
      membership_id: s.membership_id,
      rutina_dia_id: s.rutina_dia_id,
      inicio: s.inicio,
      notas: s.notas,
    })
    .select('id')
    .single()

  const c = clasificarRespuesta(error)
  let servidorId = data?.id ?? null

  // Ya estaba —un envío anterior llegó y la respuesta se perdió—. Hace falta
  // su id para colgarle las series.
  if (c === 'duplicado') {
    const { data: existente, error: errorBusqueda } = await supabase
      .from('sesiones').select('id').eq('id_local', s.id_local).maybeSingle()
    if (errorBusqueda || !existente) return 'transitorio'
    servidorId = existente.id
  }

  const estado = estadoTras(c)
  if (estado) await local.marcarSesion(s.id_local, estado, servidorId)
  return c
}

async function enviarSerie(op: Extract<Operacion, { tipo: 'serie' }>): Promise<Clasificacion> {
  const { serie } = op
  // Sin .select(): no hace falta el id de vuelta.
  const { error } = await supabase.from('series_registradas').insert({
    id_local: serie.id_local,
    sesion_id: op.sesion_servidor_id,
    ejercicio_id: serie.ejercicio_id,
    numero_serie: serie.numero_serie,
    peso_kg: serie.peso_kg,
    repeticiones: serie.repeticiones,
  })

  const c = clasificarRespuesta(error)
  const estado = estadoTras(c)
  if (estado) await local.marcarSerie(serie.id_local, estado)
  return c
}

async function enviarFin(op: Extract<Operacion, { tipo: 'fin' }>): Promise<Clasificacion> {
  const { data, error } = await supabase
    .from('sesiones')
    .update({ fin: op.fin, notas: op.sesion.notas })
    .eq('id', op.servidor_id)
    .select('id')

  // Sin error y sin filas: la RLS no dejó tocarla —la membresía ya no está
  // activa—. Postgres no da error en ese caso, así que se mira la respuesta.
  const c: Clasificacion = !error && (data ?? []).length === 0
    ? 'permanente'
    : clasificarRespuesta(error)

  const estado = estadoFinTras(c)
  if (estado) await local.marcarFin(op.sesion.id_local, estado)
  return c
}

async function refrescarMarcas(membresias: string[]): Promise<void> {
  const { data, error } = await supabase
    .from('mejores_marcas')
    .select('membership_id, ejercicio_id, mejor_peso_kg, mejor_volumen_kg')
    .in('membership_id', membresias)
  if (error || !data) return

  for (const membershipId of membresias) {
    const delServidor: Marcas = {}
    for (const f of data) {
      if (f.membership_id !== membershipId || !f.ejercicio_id) continue
      delServidor[f.ejercicio_id] = {
        mejor_peso_kg: Number(f.mejor_peso_kg ?? 0),
        mejor_volumen_kg: Number(f.mejor_volumen_kg ?? 0),
      }
    }
    // Fusionar y no reemplazar: lo que sigue en la cola el servidor no lo conoce.
    const locales = await local.leerMarcas(membershipId)
    await local.guardarMarcas(membershipId, fusionarMarcas(locales, delServidor))
  }
}

export async function resumenActual(): Promise<ResumenCola> {
  const membresias = (await membresiasGuardadas()).map((m) => m.id)
  const { sesiones, series } = await local.leerCola()
  return resumenCola(sesiones, series, membresias)
}

/**
 * Recalcula el aviso y se lo pasa a quien esté escuchando. La pantalla de
 * sesión la llama después de guardar una serie, para que el contador suba en
 * el momento y no recién cuando termine la sincronización.
 */
export async function actualizarEstado(): Promise<void> {
  try {
    const r = await resumenActual()
    ultimo = { texto: textoEstadoCola(r), hayRechazadas: r.rechazadas > 0 }
    oyentes.forEach((o) => o(ultimo))
  } catch {
    // Si no se puede leer la base, el aviso queda como estaba.
  }
}

export function escucharEstado(oyente: Oyente): () => void {
  oyentes.add(oyente)
  oyente(ultimo)
  return () => {
    oyentes.delete(oyente)
  }
}

/** Se llama una vez, cuando hay alguien con la sesión iniciada. Devuelve cómo apagarlo. */
export function iniciarSincronizacion(): () => void {
  void sincronizar()

  const app = AppState.addEventListener('change', (estado) => {
    if (estado === 'active') void sincronizar()
  })
  const red = Network.addNetworkStateListener((estado) => {
    if (estado.isConnected && estado.isInternetReachable !== false) void sincronizar()
  })

  return () => {
    app.remove()
    red.remove()
  }
}
```

- [ ] **Step 7: Cerrar sesión avisando**

Crear `apps/movil/src/lib/cerrar-sesion.ts`:

```ts
import { Alert } from 'react-native'
import { textoEstadoCola } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { vaciarTodo } from '@/lib/local/cola'
import { resumenActual, sincronizar } from '@/lib/sincronizar'

/**
 * Cerrar sesión borra todo lo local —la cola, las marcas, la caché—: nada de
 * una cuenta queda en el teléfono para la siguiente. Por eso primero se
 * intenta sincronizar, y si igual queda algo pendiente se pregunta.
 */
export async function cerrarSesion(): Promise<void> {
  await sincronizar()
  const resumen = await resumenActual()

  const salir = async () => {
    await vaciarTodo()
    await supabase.auth.signOut()
  }

  if (resumen.seriesPendientes + resumen.otrasPendientes === 0) {
    await salir()
    return
  }

  Alert.alert(
    'Tenés cosas sin sincronizar',
    `${textoEstadoCola(resumen)}. Si cerrás sesión ahora, se pierden.`,
    [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión igual', style: 'destructive', onPress: () => { void salir() } },
    ],
  )
}
```

- [ ] **Step 8: El aviso siempre visible**

Crear `apps/movil/src/components/aviso-sincronizacion.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { escucharEstado, type EstadoVisible } from '@/lib/sincronizar'

/** "3 series sin sincronizar". El socio nunca queda con la duda de si se guardó. */
export function AvisoSincronizacion() {
  const [estado, setEstado] = useState<EstadoVisible>({ texto: null, hayRechazadas: false })

  useEffect(() => escucharEstado(setEstado), [])

  if (!estado.texto) return null

  return (
    <View style={[estilos.aviso, estado.hayRechazadas && estilos.rechazo]}>
      <Text style={estilos.texto}>{estado.texto}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  aviso: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: 'rgba(200,140,0,0.15)' },
  rechazo: { backgroundColor: 'rgba(176,0,0,0.12)' },
  texto: { fontSize: 13, color: '#555' },
})
```

- [ ] **Step 9: Arrancar la sincronización con la sesión**

En `apps/movil/src/app/_layout.tsx`, agregar el import:

```tsx
import { iniciarSincronizacion } from '@/lib/sincronizar'
```

y debajo del segundo `useEffect` (el que redirige al login), antes del `if (cargando)`:

```tsx
  // La cola se sincroniza mientras haya alguien con la sesión iniciada. Por el
  // id y no por el objeto sesión: ese objeto cambia en cada refresco del token
  // y volvería a enganchar los oyentes.
  const usuarioId = sesion?.user.id
  useEffect(() => {
    if (!usuarioId) return
    return iniciarSincronizacion()
  }, [usuarioId])
```

- [ ] **Step 10: Cerrar sesión con aviso en Hoy**

En `apps/movil/src/app/(tabs)/index.tsx`, agregar el import:

```tsx
import { cerrarSesion } from '@/lib/cerrar-sesion'
```

y reemplazar las cuatro apariciones de

```tsx
<Button title="Cerrar sesión" onPress={() => supabase.auth.signOut()} />
```

por

```tsx
<Button title="Cerrar sesión" onPress={() => void cerrarSesion()} />
```

La Tarea 10 reescribe esta pantalla; el cambio va acá para que ninguna tarea deje un camino que cierra sesión sin avisar.

- [ ] **Step 11: Verificar tipos y lint**

Run (desde `apps/movil`): `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 12: Commit**

```bash
git add apps/movil/package.json package-lock.json apps/movil/src/lib apps/movil/src/components/aviso-sincronizacion.tsx apps/movil/src/app/_layout.tsx "apps/movil/src/app/(tabs)/index.tsx"
git commit -m "Guardar la cola en el teléfono y sincronizarla con el servidor

Cada serie se guarda en SQLite antes de que haya señal, y una sola
función la empuja cuando puede: al volver a primer plano, al volver
la red y después de cada serie. Las membresías se cachean, porque sin
ellas no se sabe a nombre de quién registrar. Cerrar sesión borra todo
lo local, así que primero se intenta sincronizar y si queda algo se
pregunta."
```

---

## Tarea 9: App — el buscador de ejercicios, compartido

**Files:**
- Create: `apps/movil/src/components/buscador-ejercicios.tsx`
- Modify: `apps/movil/src/app/(tabs)/ejercicios/index.tsx`
- Modify: `apps/movil/src/app/(tabs)/rutinas/elegir-ejercicio.tsx`

**Interfaces:**
- Consumes: `filtrarEjercicios`, `GRUPOS_MUSCULARES`, `EQUIPAMIENTOS`, `etiqueta` de `@gym/core` (etapa 1).
- Produces:
  - `interface EjercicioDelCatalogo { id: string; nombre: string; grupo_muscular: GrupoMuscular; equipamiento: Equipamiento; gym_id: string | null; video_id: string | null }`
  - `<BuscadorEjercicios onElegir={(e: EjercicioDelCatalogo) => void} />` — trae los ejercicios, muestra buscador, filtros y lista, y llama a `onElegir` al tocar una fila.

La pantalla de sesión (Tarea 10) va a ser la tercera que usa el buscador. Con tres copias, un arreglo en una no llega a las otras: se extrae ahora, antes de copiarlo otra vez.

- [ ] **Step 1: Extraer el componente**

Crear `apps/movil/src/components/buscador-ejercicios.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native'
import {
  EQUIPAMIENTOS, GRUPOS_MUSCULARES, etiqueta, filtrarEjercicios,
  type Equipamiento, type GrupoMuscular,
} from '@gym/core'
import { supabase } from '@/lib/supabase'

export interface EjercicioDelCatalogo {
  id: string
  nombre: string
  grupo_muscular: GrupoMuscular
  equipamiento: Equipamiento
  gym_id: string | null
  video_id: string | null
}

/**
 * El buscador de la etapa 1, con sus tres filtros. Lo usan la pestaña
 * Ejercicios, el armador de rutinas y la pantalla de sesión; cada una decide
 * qué pasa al tocar un ejercicio.
 */
export function BuscadorEjercicios({ onElegir }: {
  onElegir: (ejercicio: EjercicioDelCatalogo) => void
}) {
  const [ejercicios, setEjercicios] = useState<EjercicioDelCatalogo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [grupo, setGrupo] = useState<GrupoMuscular | null>(null)
  const [equipo, setEquipo] = useState<Equipamiento | null>(null)
  const [soloMiGym, setSoloMiGym] = useState(false)

  useEffect(() => {
    // RLS ya limita esto al catálogo global más los del gimnasio del socio.
    supabase
      .from('ejercicios')
      .select('id, nombre, grupo_muscular, equipamiento, gym_id, video_id')
      .order('nombre')
      .then(({ data, error }) => {
        if (error) setError('No pudimos cargar los ejercicios')
        else setEjercicios((data ?? []) as EjercicioDelCatalogo[])
        setCargando(false)
      })
  }, [])

  // El filtrado vive en @gym/core para poder probarlo: acá adentro solo se
  // verificaría a mano, tocando la app.
  const visibles = useMemo(
    () => filtrarEjercicios(ejercicios, { busqueda, grupo, equipo, soloMiGym }) as EjercicioDelCatalogo[],
    [ejercicios, busqueda, grupo, equipo, soloMiGym],
  )

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator />
      </View>
    )
  }

  if (error) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.error}>{error}</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={estilos.buscador} placeholder="Buscar ejercicio"
        value={busqueda} onChangeText={setBusqueda}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={estilos.filtros} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        <Chip activo={grupo === null} texto="Todos" onPress={() => setGrupo(null)} />
        {GRUPOS_MUSCULARES.map((g) => (
          <Chip key={g} activo={grupo === g} texto={etiqueta(g)}
            onPress={() => setGrupo(grupo === g ? null : g)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={estilos.filtros} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        <Chip activo={soloMiGym} texto="Solo lo que hay acá"
          onPress={() => setSoloMiGym((v) => !v)} />
        {EQUIPAMIENTOS.map((eq) => (
          <Chip key={eq} activo={equipo === eq} texto={etiqueta(eq)}
            onPress={() => setEquipo(equipo === eq ? null : eq)} />
        ))}
      </ScrollView>

      <FlatList
        data={visibles}
        keyExtractor={(x) => x.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={estilos.vacio}>
            No encontramos ejercicios con esos filtros.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable style={estilos.fila} onPress={() => onElegir(item)}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.nombre}>{item.nombre}</Text>
              <Text style={estilos.sub}>
                {etiqueta(item.grupo_muscular)}
                {item.gym_id === null ? ' · Catálogo general' : ' · De tu gimnasio'}
              </Text>
            </View>
            {item.video_id && <Text>▶</Text>}
          </Pressable>
        )}
      />
    </View>
  )
}

function Chip({ activo, texto, onPress }: {
  activo: boolean; texto: string; onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={[estilos.chip, activo && estilos.chipActivo]}>
      <Text style={activo ? estilos.chipTextoActivo : estilos.chipTexto}>{texto}</Text>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#b00' },
  buscador: {
    margin: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10,
  },
  filtros: { flexGrow: 0, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: '#eee',
  },
  chipActivo: { backgroundColor: '#111' },
  chipTexto: { color: '#333' },
  chipTextoActivo: { color: '#fff' },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
  },
  nombre: { fontSize: 16 },
  sub: { color: '#777', fontSize: 13, marginTop: 2 },
  vacio: { textAlign: 'center', color: '#777', marginTop: 32 },
})
```

- [ ] **Step 2: La pestaña Ejercicios usa el componente**

Reemplazar el contenido entero de `apps/movil/src/app/(tabs)/ejercicios/index.tsx` por:

```tsx
import { View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { BuscadorEjercicios } from '@/components/buscador-ejercicios'

export default function ListaEjercicios() {
  const router = useRouter()

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Ejercicios' }} />
      <BuscadorEjercicios onElegir={(e) => router.push(`/(tabs)/ejercicios/${e.id}`)} />
    </View>
  )
}
```

- [ ] **Step 3: El armador usa el componente**

En `apps/movil/src/app/(tabs)/rutinas/elegir-ejercicio.tsx`, reemplazar desde el primer import hasta el final de la función `ElegirEjercicio` (justo antes de `function AltaEjercicio`) por:

```tsx
import { useState } from 'react'
import {
  Alert, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { BuscadorEjercicios, type EjercicioDelCatalogo } from '@/components/buscador-ejercicios'
import { supabase } from '@/lib/supabase'

type Ejercicio = EjercicioDelCatalogo

// El buscador es el compartido; acá solo cambia qué pasa al tocar una fila: en
// vez de navegar al detalle, abre los campos de alta.
export default function ElegirEjercicio() {
  const { diaId } = useLocalSearchParams<{ diaId: string }>()
  const router = useRouter()
  const [seleccionado, setSeleccionado] = useState<Ejercicio | null>(null)

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Agregar ejercicio' }} />

      <BuscadorEjercicios onElegir={setSeleccionado} />

      {seleccionado && (
        <AltaEjercicio
          ejercicio={seleccionado}
          diaId={diaId}
          onCancelar={() => setSeleccionado(null)}
          onAgregado={() => router.back()}
        />
      )}
    </View>
  )
}
```

`AltaEjercicio` queda igual. Después, en el mismo archivo:
- Borrar la función `Chip`, que ahora vive en el componente.
- En `StyleSheet.create`, dejar solo las claves que usa `AltaEjercicio`: `fondoModal`, `hoja`, `tituloModal`, `etiquetaCampo`, `campo`, `accionesModal`, `botonCancelar`, `botonAgregar`, `botonAgregarTexto`. Borrar el resto (`centrado`, `error`, `buscador`, `filtros`, `chip`, `chipActivo`, `chipTexto`, `chipTextoActivo`, `fila`, `nombre`, `sub`, `vacio`).

- [ ] **Step 4: Verificar tipos y lint**

Run (desde `apps/movil`): `npx tsc --noEmit && npm run lint`
Expected: sin errores. Si queda un import sin usar (`useEffect`, `useMemo`, `FlatList`, `ScrollView`, `ActivityIndicator`, `@gym/core`), borrarlo.

- [ ] **Step 5: Commit**

```bash
git add apps/movil/src/components/buscador-ejercicios.tsx "apps/movil/src/app/(tabs)/ejercicios/index.tsx" "apps/movil/src/app/(tabs)/rutinas/elegir-ejercicio.tsx"
git commit -m "Extraer el buscador de ejercicios a un componente

La pantalla de sesión va a ser la tercera en usarlo. Con tres copias,
un arreglo en una no llega a las otras; cada pantalla decide ahora
solo qué pasa al tocar un ejercicio."
```

---

## Tarea 10: App — la pantalla de sesión y la pestaña Hoy

**Files:**
- Create: `apps/movil/src/lib/rutina-activa.ts`
- Create: `apps/movil/src/lib/vez-pasada.ts`
- Create: `apps/movil/src/lib/terminar-sesion.ts`
- Create: `apps/movil/src/app/entrenar.tsx`
- Modify (se reescribe): `apps/movil/src/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes:
  - De `@gym/core`: `aNumero`, `validarSerie`, `detectarRecord`, `filasPrecargadas`, `formatearKg`, `textoVezPasada`, `volumen`, `marcaDeSesion`, `fusionarMarcas`, `sesionAbierta`, `diaAMostrar`, y los tipos `Marcas`, `SerieHecha`, `SesionEnCola`, `TipoRecord`.
  - De la Tarea 8: `lib/local/cola.ts` (todo), `misMembresias`, `membresiasGuardadas`, `membresiaPara`, `conLimite`, `sincronizar`, `actualizarEstado`, `cerrarSesion`, `<AvisoSincronizacion />`.
  - De la Tarea 9: `<BuscadorEjercicios />`, `EjercicioDelCatalogo`.
  - De la Tarea 4: la función `ultima_vez`.
- Produces:
  - En `lib/rutina-activa.ts`: los tipos `RutinaActiva`, `DiaDeRutina`, `EjercicioDelDia`; `cargarRutinaActiva(): Promise<{ rutina: RutinaActiva | null; guardada: boolean } | null>` y `rutinaGuardada(): Promise<RutinaActiva | null>`.
  - `vezPasada(ejercicioIds: string[]): Promise<Map<string, SerieHecha[]> | null>` — `null` = sin señal.
  - `terminarSesion(sesion: SesionEnCola): Promise<void>`
  - La ruta `/entrenar`, con parámetros opcionales `diaId` y `retomar`.

- [ ] **Step 1: La rutina activa, con caché**

Crear `apps/movil/src/lib/rutina-activa.ts`:

```ts
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'
import { guardarCache, leerCache } from '@/lib/local/cola'
import { misMembresias } from '@/lib/membresia'

export interface EjercicioDelDia {
  id: string
  orden: number
  series: number
  repeticiones: string
  descanso_seg: number | null
  peso_sugerido_kg: number | null
  ejercicios: { id: string; nombre: string; video_id: string | null } | null
}

export interface DiaDeRutina {
  id: string
  orden: number
  nombre: string
  rutina_ejercicios: EjercicioDelDia[]
}

export interface RutinaActiva {
  id: string
  gym_id: string
  nombre: string
  fecha_inicio: string | null
  created_at: string
  rutina_dias: DiaDeRutina[]
}

// Envuelta en un objeto para distinguir "no tiene rutina" (guardado: null) de
// "nunca se guardó nada" (no hay fila).
interface Guardado { rutina: RutinaActiva | null }

const clave = (userId: string) => `rutina-activa:${userId}`

async function usuarioActual(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/**
 * La rutina que muestra Hoy. Con señal se consulta y se guarda en el teléfono
 * como un documento entero —es una caché que se lee entera para mostrar el
 * día, no un espejo de las tres tablas—; sin señal, la última guardada, y
 * `guardada` lo avisa.
 *
 * `null` = no se pudo consultar y no hay nada guardado.
 */
export async function cargarRutinaActiva(): Promise<{ rutina: RutinaActiva | null; guardada: boolean } | null> {
  const userId = await usuarioActual()
  if (!userId) return null

  const membresias = (await misMembresias()).map((m) => m.id)
  // Filtra por propietario y no se apoya solo en la RLS: un entrenador que
  // entrena con la app ve las rutinas activas de todos sus socios.
  const respuesta = membresias.length
    ? await conLimite(
        supabase
          .from('rutinas')
          .select(`
            id, gym_id, nombre, fecha_inicio, created_at,
            rutina_dias (
              id, orden, nombre,
              rutina_ejercicios (
                id, orden, series, repeticiones, descanso_seg, peso_sugerido_kg,
                ejercicios ( id, nombre, video_id )
              )
            )
          `)
          .eq('tipo', 'activa')
          .eq('estado', 'activa')
          .in('propietario_id', membresias),
      )
    : null

  if (respuesta && !respuesta.error) {
    // fecha_inicio es opcional —el armador no obliga a completarla—, así que
    // se cae a created_at cuando falta. Es el criterio de la etapa 2.
    const activas = [...((respuesta.data ?? []) as RutinaActiva[])].sort((a, b) =>
      (b.fecha_inicio ?? b.created_at).localeCompare(a.fecha_inicio ?? a.created_at))
    const rutina = activas[0] ?? null
    await guardarCache(clave(userId), { rutina } satisfies Guardado)
    return { rutina, guardada: false }
  }

  const guardado = await leerCache<Guardado>(clave(userId))
  return guardado ? { rutina: guardado.rutina, guardada: true } : null
}

/** Solo lo guardado, sin ir a la red. Lo usa la pantalla de sesión, que tiene que abrir sin señal. */
export async function rutinaGuardada(): Promise<RutinaActiva | null> {
  const userId = await usuarioActual()
  if (!userId) return null
  return (await leerCache<Guardado>(clave(userId)))?.rutina ?? null
}
```

- [ ] **Step 2: La vez pasada**

Crear `apps/movil/src/lib/vez-pasada.ts`:

```ts
import type { SerieHecha } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'

/**
 * "La vez pasada" de cada ejercicio, en una sola llamada. `null` = sin señal: la
 * pantalla precarga entonces con lo que dice la rutina. Es la limitación
 * aceptada de la sección 2 del diseño de la etapa 3.
 */
export async function vezPasada(ejercicioIds: string[]): Promise<Map<string, SerieHecha[]> | null> {
  if (ejercicioIds.length === 0) return new Map()

  const respuesta = await conLimite(supabase.rpc('ultima_vez', { p_ejercicio_ids: ejercicioIds }))
  if (!respuesta || respuesta.error || !respuesta.data) return null

  const porEjercicio = new Map<string, SerieHecha[]>()
  for (const f of respuesta.data) {
    const lista = porEjercicio.get(f.ejercicio_id) ?? []
    lista.push({ peso_kg: Number(f.peso_kg), repeticiones: f.repeticiones })
    porEjercicio.set(f.ejercicio_id, lista)
  }
  return porEjercicio
}
```

- [ ] **Step 3: Terminar una sesión**

Crear `apps/movil/src/lib/terminar-sesion.ts`:

```ts
import { fusionarMarcas, marcaDeSesion, type Marcas, type SesionEnCola } from '@gym/core'
import * as local from '@/lib/local/cola'
import { actualizarEstado, sincronizar } from '@/lib/sincronizar'

/**
 * Terminar: pone el fin en la cola y suma lo de la sesión a las mejores marcas
 * del teléfono.
 *
 * Las marcas se actualizan acá y no serie por serie: la pantalla de sesión
 * compara contra las de ANTES de la sesión. Si se actualizaran en el medio,
 * una sesión retomada tomaría como "previa" lo que se hizo en ella misma, y la
 * primera vez de un ejercicio dejaría de ser la primera.
 *
 * La usan la pantalla de sesión y el aviso de "entrenamiento sin terminar" de Hoy.
 */
export async function terminarSesion(sesion: SesionEnCola): Promise<void> {
  const series = await local.seriesDeSesionLocal(sesion.id_local)

  const porEjercicio = new Map<string, typeof series>()
  for (const s of series) {
    porEjercicio.set(s.ejercicio_id, [...(porEjercicio.get(s.ejercicio_id) ?? []), s])
  }

  const deLaSesion: Marcas = {}
  for (const [ejercicioId, suyas] of porEjercicio) {
    const marca = marcaDeSesion(suyas)
    if (marca) deLaSesion[ejercicioId] = marca
  }

  await local.terminarSesionLocal(sesion.id_local)
  const previas = await local.leerMarcas(sesion.membership_id)
  await local.guardarMarcas(sesion.membership_id, fusionarMarcas(previas, deLaSesion))
  await actualizarEstado()
  void sincronizar()
}
```

- [ ] **Step 4: La pantalla de sesión**

Crear `apps/movil/src/app/entrenar.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  aNumero, detectarRecord, filasPrecargadas, formatearKg, sesionAbierta, textoVezPasada,
  validarSerie, volumen,
  type FilaPrecargada, type Marcas, type SerieHecha, type SesionEnCola, type TipoRecord,
} from '@gym/core'
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

  // Refs y no estado: no se dibujan, y registrar() tiene que ver el valor
  // actual aunque el socio toque dos tildes seguidos.
  const sesion = useRef<SesionEnCola | null>(null)
  const membresia = useRef<Membresia | null>(null)
  const gymId = useRef<string | null>(null)
  const rutinaDiaId = useRef<string | null>(null)
  // Las de ANTES de la sesión. No se tocan hasta Terminar (ver terminar-sesion.ts).
  const marcasPrevias = useRef<Marcas>({})
  const ocupado = useRef(false)

  useEffect(() => {
    let vivo = true

    async function preparar(): Promise<EjercicioEnSesion[]> {
      const rutina = await rutinaGuardada()
      let dia: DiaDeRutina | null = null
      let hechas: local.SerieLocal[] = []

      if (retomar) {
        const { sesiones } = await local.leerCola()
        const ids = (await membresiasGuardadas()).map((m) => m.id)
        const abierta = sesionAbierta(sesiones, ids)
        if (abierta) {
          sesion.current = abierta
          membresia.current = { id: abierta.membership_id, gym_id: abierta.gym_id }
          gymId.current = abierta.gym_id
          rutinaDiaId.current = abierta.rutina_dia_id
          hechas = await local.seriesDeSesionLocal(abierta.id_local)
          dia = rutina?.rutina_dias.find((d) => d.id === abierta.rutina_dia_id) ?? null
        }
      } else {
        dia = diaId ? (rutina?.rutina_dias.find((d) => d.id === diaId) ?? null) : null
        gymId.current = rutina?.gym_id ?? null
        rutinaDiaId.current = dia?.id ?? null
      }

      membresia.current ??= await membresiaPara(gymId.current)
      if (membresia.current) marcasPrevias.current = await local.leerMarcas(membresia.current.id)
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
        const anterior = pasada?.get(id) ?? null
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
    setTimeout(() => setRecord(null), 4000)
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
      sesion.current ??= await local.crearSesionLocal({
        membership_id: membresia.current.id,
        gym_id: membresia.current.gym_id,
        rutina_dia_id: rutinaDiaId.current,
      })

      const anteriores = ej.filas.filter((f) => f.registrada).map(aSerie)
      await local.agregarSerieLocal({
        sesion_id_local: sesion.current.id_local,
        ejercicio_id: ej.ejercicio_id,
        nombre_ejercicio: ej.nombre,
        numero_serie: anteriores.length + 1,
        peso_kg: nueva.peso_kg,
        repeticiones: nueva.repeticiones,
      })

      avisarRecord(
        detectarRecord(marcasPrevias.current[ej.ejercicio_id], anteriores, nueva),
        ej.nombre, nueva, [...anteriores, nueva],
      )

      const filas = ej.filas.map((f, i) => (i === iFila ? { ...f, registrada: true } : f))
      setEjercicios((previos) => previos.map((e, i) => (i === iEj ? { ...e, filas } : e)))
      // Terminado un ejercicio se abre el siguiente: es parte de los cuatro toques.
      if (filas.every((f) => f.registrada) && iEj + 1 < ejercicios.length) setAbierto(iEj + 1)

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
    const yaEsta = ejercicios.findIndex((e) => e.ejercicio_id === elegido.id)
    if (yaEsta >= 0) {
      setAbierto(yaEsta)
      return
    }
    const anterior = (await vezPasada([elegido.id]))?.get(elegido.id) ?? null
    const nuevo: EjercicioEnSesion = {
      ejercicio_id: elegido.id,
      nombre: elegido.nombre,
      vezPasada: anterior ? textoVezPasada(anterior) : null,
      filas: filasPrecargadas({ prescripcion: null, vezPasada: anterior, hechas: [] }).map(aFila),
    }
    setAbierto(ejercicios.length)
    setEjercicios((previos) => [...previos, nuevo])
  }

  function terminar() {
    const actual = sesion.current
    // No se registró nada: no hay sesión que cerrar.
    if (!actual) {
      router.back()
      return
    }

    const cerrar = async () => {
      try {
        await terminarSesion(actual)
        router.back()
      } catch {
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
      <View style={estilos.centrado}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <View style={estilos.pantalla}>
      <Stack.Screen options={{ headerShown: true, title: titulo }} />
      <AvisoSincronizacion />
      {record && (
        <View style={estilos.record}>
          <Text style={estilos.recordTexto}>{record}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={estilos.lista} keyboardShouldPersistTaps="handled">
        {ejercicios.length === 0 && (
          <Text style={estilos.vacio}>Agregá el primer ejercicio para empezar.</Text>
        )}

        {ejercicios.map((ej, iEj) => {
          const hechas = ej.filas.filter((f) => f.registrada).length
          const estaAbierto = iEj === abierto
          return (
            <View key={ej.ejercicio_id} style={estilos.ejercicio}>
              <Pressable style={estilos.cabecera} onPress={() => setAbierto(estaAbierto ? -1 : iEj)}>
                <Text style={estilos.nombre}>{ej.nombre}</Text>
                <Text style={estilos.cuenta}>{hechas}/{ej.filas.length}</Text>
              </Pressable>

              {estaAbierto && (
                <View style={estilos.cuerpo}>
                  {ej.vezPasada && <Text style={estilos.pasada}>{ej.vezPasada}</Text>}

                  {ej.filas.map((f, iFila) => (
                    <View key={iFila} style={[estilos.serie, f.registrada && estilos.serieHecha]}>
                      <Text style={estilos.numero}>{iFila + 1}</Text>
                      <TextInput
                        style={estilos.campo} value={f.peso} placeholder="kg"
                        editable={!f.registrada} keyboardType="decimal-pad"
                        onChangeText={(v) => editar(iEj, iFila, 'peso', v)}
                      />
                      <Text style={estilos.por}>×</Text>
                      <TextInput
                        style={estilos.campo} value={f.reps} placeholder="reps"
                        editable={!f.registrada} keyboardType="number-pad"
                        onChangeText={(v) => editar(iEj, iFila, 'reps', v)}
                      />
                      <Pressable
                        style={[estilos.tilde, f.registrada && estilos.tildeHecho]}
                        disabled={f.registrada} hitSlop={6}
                        onPress={() => void registrar(iEj, iFila)}
                      >
                        <Text style={f.registrada ? estilos.tildeTextoHecho : estilos.tildeTexto}>✓</Text>
                      </Pressable>
                    </View>
                  ))}

                  <Pressable onPress={() => agregarFila(iEj)} hitSlop={6}>
                    <Text style={estilos.enlace}>+ Serie</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )
        })}

        <Pressable style={estilos.botonSecundario} onPress={() => setEligiendo(true)}>
          <Text>+ Agregar ejercicio</Text>
        </Pressable>
        <Pressable style={estilos.botonPrincipal} onPress={terminar}>
          <Text style={estilos.botonPrincipalTexto}>Terminar</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={eligiendo} animationType="slide" onRequestClose={() => setEligiendo(false)}>
        <SafeAreaView style={{ flex: 1 }}>
          <Pressable style={{ padding: 16 }} onPress={() => setEligiendo(false)}>
            <Text style={estilos.enlace}>Cancelar</Text>
          </Pressable>
          <BuscadorEjercicios onElegir={(e) => void agregarEjercicio(e)} />
        </SafeAreaView>
      </Modal>
    </View>
  )
}

const VERDE = '#1b7f3b'

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#fff' },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lista: { padding: 12, gap: 8 },
  vacio: { textAlign: 'center', color: '#777', marginTop: 32 },
  record: { padding: 12, backgroundColor: 'rgba(214,158,46,0.18)' },
  recordTexto: { fontWeight: '600', textAlign: 'center' },
  ejercicio: { borderWidth: 1, borderColor: '#e2e2e2', borderRadius: 10, overflow: 'hidden' },
  cabecera: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, backgroundColor: '#f4f4f4',
  },
  nombre: { fontSize: 16, fontWeight: '600', flex: 1 },
  cuenta: { color: '#777', fontVariant: ['tabular-nums'] },
  cuerpo: { padding: 10, gap: 8 },
  pasada: { color: '#666', fontSize: 13, backgroundColor: '#f6f6f6', padding: 8, borderRadius: 6 },
  serie: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  serieHecha: { opacity: 0.55 },
  numero: { width: 18, color: '#999', textAlign: 'center' },
  campo: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingVertical: 10, textAlign: 'center', fontSize: 16, fontVariant: ['tabular-nums'],
  },
  por: { color: '#999' },
  tilde: {
    width: 48, height: 44, borderRadius: 8, borderWidth: 1, borderColor: '#ccc',
    alignItems: 'center', justifyContent: 'center',
  },
  tildeHecho: { backgroundColor: VERDE, borderColor: VERDE },
  tildeTexto: { fontSize: 18, color: '#999' },
  tildeTextoHecho: { fontSize: 18, color: '#fff' },
  enlace: { color: '#111', fontWeight: '600', textDecorationLine: 'underline' },
  botonSecundario: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, alignItems: 'center',
  },
  botonPrincipal: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  botonPrincipalTexto: { color: '#fff', fontWeight: '600', fontSize: 16 },
})
```

- [ ] **Step 5: Reescribir la pestaña Hoy**

Reemplazar el contenido entero de `apps/movil/src/app/(tabs)/index.tsx` por:

```tsx
import { useCallback, useState } from 'react'
import {
  ActivityIndicator, Alert, Button, FlatList, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native'
import { Link, useFocusEffect, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { diaAMostrar, sesionAbierta, type SesionEnCola } from '@gym/core'
import { AvisoSincronizacion } from '@/components/aviso-sincronizacion'
import { cerrarSesion } from '@/lib/cerrar-sesion'
import { leerCola } from '@/lib/local/cola'
import { membresiasGuardadas } from '@/lib/membresia'
import { cargarRutinaActiva, type EjercicioDelDia, type RutinaActiva } from '@/lib/rutina-activa'
import { terminarSesion } from '@/lib/terminar-sesion'

const CLAVE_ULTIMO_DIA = 'hoy.ultimoDia'

async function buscarSesionAbierta(): Promise<SesionEnCola | null> {
  const { sesiones } = await leerCola()
  return sesionAbierta(sesiones, (await membresiasGuardadas()).map((m) => m.id))
}

export default function Hoy() {
  const router = useRouter()
  const [rutina, setRutina] = useState<RutinaActiva | null>(null)
  const [guardada, setGuardada] = useState(false)
  const [diaId, setDiaId] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<SesionEnCola | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // useFocusEffect y no useEffect: al volver de entrenar, o del armador, tiene
  // que verse el cambio.
  useFocusEffect(
    useCallback(() => {
      let vivo = true
      setCargando(true)

      Promise.all([
        cargarRutinaActiva(),
        AsyncStorage.getItem(CLAVE_ULTIMO_DIA),
        buscarSesionAbierta(),
      ]).then(([resultado, ultimoId, sinTerminar]) => {
        if (!vivo) return
        setAbierta(sinTerminar)

        if (!resultado) {
          setError('No pudimos cargar tu rutina')
          setCargando(false)
          return
        }

        setError(null)
        setRutina(resultado.rutina)
        setGuardada(resultado.guardada)
        setDiaId(resultado.rutina
          ? (diaAMostrar(resultado.rutina.rutina_dias, ultimoId)?.id ?? null)
          : null)
        setCargando(false)
      }).catch(() => {
        // Cubre también un AsyncStorage o un SQLite que fallan: sin esto, el
        // socio queda en la pantalla de carga sin ningún botón para salir.
        if (!vivo) return
        setError('No pudimos cargar tu rutina')
        setCargando(false)
      })

      return () => { vivo = false }
    }, []),
  )

  const elegirDia = (id: string) => {
    setDiaId(id)
    AsyncStorage.setItem(CLAVE_ULTIMO_DIA, id)
  }

  const terminarAbierta = async () => {
    if (!abierta) return
    try {
      await terminarSesion(abierta)
      setAbierta(null)
    } catch {
      Alert.alert('No pudimos terminar el entrenamiento', 'Probá de nuevo.')
    }
  }

  const entrenarLibre = () => router.push('/entrenar')

  // Lo que va arriba en todos los casos: el estado de la cola y la sesión que
  // quedó abierta. Una sesión abierta no depende de tener rutina ni señal.
  const avisos = (
    <>
      <AvisoSincronizacion />
      {abierta && (
        <View style={estilos.abierta}>
          <Text style={estilos.abiertaTexto}>Tenés un entrenamiento sin terminar.</Text>
          <View style={estilos.abiertaAcciones}>
            <Pressable onPress={() => router.push({ pathname: '/entrenar', params: { retomar: '1' } })}>
              <Text style={estilos.enlace}>Seguir</Text>
            </Pressable>
            <Pressable onPress={() => void terminarAbierta()}>
              <Text style={estilos.enlace}>Terminar</Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
  )

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator />
        <Button title="Cerrar sesión" onPress={() => void cerrarSesion()} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={{ flex: 1 }}>
        {avisos}
        <View style={estilos.centrado}>
          <Text style={estilos.error}>{error}</Text>
          <Pressable style={estilos.botonSecundario} onPress={entrenarLibre}>
            <Text>Entrenar libre</Text>
          </Pressable>
          <Button title="Cerrar sesión" onPress={() => void cerrarSesion()} />
        </View>
      </View>
    )
  }

  if (!rutina) {
    return (
      <View style={{ flex: 1 }}>
        {avisos}
        <View style={estilos.centrado}>
          <Text style={estilos.vacio}>Todavía no tenés una rutina.</Text>
          <Link href="/(tabs)/rutinas" asChild>
            <Pressable>
              <Text style={estilos.enlace}>Mirá el catálogo de tu gimnasio.</Text>
            </Pressable>
          </Link>
          <Pressable style={estilos.botonSecundario} onPress={entrenarLibre}>
            <Text>Entrenar libre</Text>
          </Pressable>
          <Button title="Cerrar sesión" onPress={() => void cerrarSesion()} />
        </View>
      </View>
    )
  }

  const dias = [...rutina.rutina_dias].sort((a, b) => a.orden - b.orden)
  const dia = dias.find((d) => d.id === diaId) ?? null
  const ejercicios = dia
    ? [...dia.rutina_ejercicios].sort((a, b) => a.orden - b.orden)
    : []

  return (
    <View style={{ flex: 1 }}>
      {avisos}
      {guardada && (
        <Text style={estilos.guardada}>Sin conexión: es tu rutina guardada en el teléfono.</Text>
      )}

      <View style={estilos.encabezado}>
        <Text style={estilos.titulo}>{rutina.nombre}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={estilos.filtros} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        {dias.map((d) => (
          <Chip key={d.id} activo={d.id === diaId} texto={d.nombre}
            onPress={() => elegirDia(d.id)} />
        ))}
      </ScrollView>

      <FlatList
        data={ejercicios}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <FilaEjercicio ejercicio={item} />}
        ListEmptyComponent={
          <Text style={estilos.vacio}>Este día todavía no tiene ejercicios.</Text>
        }
      />

      <View style={estilos.pie}>
        {dia && ejercicios.length > 0 && (
          <Pressable
            style={estilos.botonPrincipal}
            onPress={() => router.push({ pathname: '/entrenar', params: { diaId: dia.id } })}
          >
            <Text style={estilos.botonPrincipalTexto}>Empezar</Text>
          </Pressable>
        )}
        <Pressable style={estilos.botonSecundario} onPress={entrenarLibre}>
          <Text>Entrenar libre</Text>
        </Pressable>
        <Button title="Cerrar sesión" onPress={() => void cerrarSesion()} />
      </View>
    </View>
  )
}

// Modo lectura: sin agarre de reordenar ni acceso al armador, a diferencia de
// la pantalla equivalente dentro de Rutinas.
function FilaEjercicio({ ejercicio }: { ejercicio: EjercicioDelDia }) {
  return (
    <View style={estilos.fila}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.nombre}>{ejercicio.ejercicios?.nombre}</Text>
        <Text style={estilos.sub}>
          {ejercicio.series}×{ejercicio.repeticiones}
          {ejercicio.descanso_seg ? ` · ${ejercicio.descanso_seg}s de descanso` : ''}
        </Text>
      </View>
      {ejercicio.ejercicios?.video_id && (
        <Link href={`/(tabs)/ejercicios/${ejercicio.ejercicios.id}`} asChild>
          <Pressable hitSlop={8}>
            <Text style={estilos.video}>▶</Text>
          </Pressable>
        </Link>
      )}
    </View>
  )
}

function Chip({ activo, texto, onPress }: {
  activo: boolean; texto: string; onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={[estilos.chip, activo && estilos.chipActivo]}>
      <Text style={activo ? estilos.chipTextoActivo : estilos.chipTexto}>{texto}</Text>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  error: { color: '#b00' },
  encabezado: { padding: 16, paddingBottom: 8 },
  titulo: { fontSize: 22, fontWeight: '600' },
  guardada: { paddingHorizontal: 16, paddingTop: 8, color: '#777', fontSize: 13 },
  filtros: { flexGrow: 0, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: '#eee',
  },
  chipActivo: { backgroundColor: '#111' },
  chipTexto: { color: '#333' },
  chipTextoActivo: { color: '#fff' },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
    backgroundColor: '#fff',
  },
  nombre: { fontSize: 16 },
  sub: { color: '#777', fontSize: 13, marginTop: 2 },
  video: { fontSize: 18 },
  vacio: { textAlign: 'center', color: '#777', marginTop: 32, paddingHorizontal: 24 },
  enlace: { textAlign: 'center', color: '#111', fontWeight: '600', textDecorationLine: 'underline' },
  abierta: {
    margin: 12, padding: 12, borderRadius: 10, gap: 8,
    backgroundColor: 'rgba(27,127,59,0.10)',
  },
  abiertaTexto: { fontWeight: '600' },
  abiertaAcciones: { flexDirection: 'row', gap: 24 },
  pie: { padding: 12, gap: 8 },
  botonPrincipal: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  botonPrincipalTexto: { color: '#fff', fontWeight: '600', fontSize: 16 },
  botonSecundario: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, alignItems: 'center',
    alignSelf: 'stretch',
  },
})
```

- [ ] **Step 6: Verificar tipos y lint**

Run (desde `apps/movil`): `npx tsc --noEmit && npm run lint`
Expected: sin errores.

Con `typedRoutes`, la ruta nueva `/entrenar` entra en los tipos recién cuando Expo los regenera. Si `tsc` marca el `router.push('/entrenar')` como ruta inexistente, correr `npx expo start` hasta que diga que el bundler está listo (genera `.expo/types/router.d.ts`), cortarlo y volver a correr `tsc`.

- [ ] **Step 7: Commit**

```bash
git add apps/movil/src/lib/rutina-activa.ts apps/movil/src/lib/vez-pasada.ts apps/movil/src/lib/terminar-sesion.ts apps/movil/src/app/entrenar.tsx "apps/movil/src/app/(tabs)/index.tsx"
git commit -m "Registrar el entrenamiento serie por serie, también sin señal

Hoy suma el botón Empezar que la etapa 2 dejó sin construir, entrenar
libre y el aviso de sesión sin terminar. La pantalla de sesión precarga
la vez pasada si hay señal y la rutina si no. Tildar una serie la guarda
en el teléfono y avisa el récord en el momento. La rutina se cachea
para que todo esto abra en un subsuelo."
```

---

## Tarea 11: App — la pestaña Progreso: récords e historial

**Files:**
- Create: `apps/movil/src/lib/fechas.ts`
- Create: `apps/movil/src/app/(tabs)/progreso/_layout.tsx`
- Create: `apps/movil/src/app/(tabs)/progreso/index.tsx`
- Create: `apps/movil/src/app/(tabs)/progreso/sesion/[id].tsx`
- Modify: `apps/movil/src/app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `fusionarMarcas`, `formatearKg`, `detalleSeries`, `Marcas` de `@gym/core`; `misMembresias`, `conLimite` (Tarea 8); la vista `mejores_marcas` (Tarea 4).
- Produces:
  - En `lib/fechas.ts`: `fechaCorta(iso: string): string` ("8/10"), `fechaConDia(iso: string): string` ("mié 8/10"), `duracion(inicio: string, fin: string): string` ("52 min").
  - Las rutas `/(tabs)/progreso`, `/(tabs)/progreso/sesion/[id]`. La lista de récords enlaza a `/(tabs)/progreso/ejercicio/[id]`, que crea la Tarea 12.

- [ ] **Step 1: Las fechas**

Crear `apps/movil/src/lib/fechas.ts`:

```ts
// A mano y no con toLocaleDateString: el soporte de Intl en Hermes depende de
// cómo se compiló la app. Todas en la hora del teléfono, que es la del socio.

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** "8/10" */
export function fechaCorta(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/** "mié 8/10" */
export function fechaConDia(iso: string): string {
  return `${DIAS[new Date(iso).getDay()]} ${fechaCorta(iso)}`
}

/** "52 min", "1 h 10 min" */
export function duracion(inicio: string, fin: string): string {
  const minutos = Math.max(0, Math.round((Date.parse(fin) - Date.parse(inicio)) / 60_000))
  if (minutos < 60) return `${minutos} min`
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`
}
```

- [ ] **Step 2: La pestaña**

Crear `apps/movil/src/app/(tabs)/progreso/_layout.tsx`:

```tsx
import { Stack } from 'expo-router'

export default function LayoutProgreso() {
  return <Stack />
}
```

En `apps/movil/src/app/(tabs)/_layout.tsx`, agregar debajo de la pestaña `ejercicios`:

```tsx
      <Tabs.Screen name="progreso" options={{ title: 'Progreso', headerShown: false }} />
```

- [ ] **Step 3: Récords e historial**

Crear `apps/movil/src/app/(tabs)/progreso/index.tsx`:

```tsx
import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Link, Stack, useFocusEffect } from 'expo-router'
import { formatearKg, fusionarMarcas, type Marcas } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'
import { duracion, fechaConDia } from '@/lib/fechas'
import { misMembresias } from '@/lib/membresia'

interface Record_ {
  ejercicio_id: string
  nombre: string
  mejor_peso_kg: number
  mejor_volumen_kg: number
}

interface SesionDelHistorial {
  id: string
  inicio: string
  fin: string | null
  rutina_dias: { nombre: string } | null
  series_registradas: { count: number }[]
}

type Datos = { records: Record_[]; historial: SesionDelHistorial[] }

/**
 * Todo requiere señal. `null` = no la hay —o no llegó a tiempo—, y la pantalla
 * lo dice en vez de quedar vacía.
 */
async function cargar(): Promise<Datos | null> {
  const ids = (await misMembresias()).map((m) => m.id)
  if (ids.length === 0) return null

  // Filtra por las membresías propias y no se apoya solo en la RLS: el
  // personal del gimnasio puede leer las de todos los socios.
  const [marcas, sesiones] = await Promise.all([
    conLimite(
      supabase
        .from('mejores_marcas')
        .select('ejercicio_id, mejor_peso_kg, mejor_volumen_kg')
        .in('membership_id', ids),
    ),
    conLimite(
      supabase
        .from('sesiones')
        .select('id, inicio, fin, rutina_dias ( nombre ), series_registradas ( count )')
        .in('membership_id', ids)
        .eq('series_registradas.completada', true)
        .order('inicio', { ascending: false })
        .limit(50),
    ),
  ])
  if (!marcas || marcas.error || !sesiones || sesiones.error) return null

  // Con membresía en dos gimnasios, el mismo ejercicio llega dos veces: queda
  // el mejor de los dos.
  let porEjercicio: Marcas = {}
  for (const m of marcas.data) {
    if (!m.ejercicio_id) continue
    porEjercicio = fusionarMarcas(porEjercicio, {
      [m.ejercicio_id]: {
        mejor_peso_kg: Number(m.mejor_peso_kg ?? 0),
        mejor_volumen_kg: Number(m.mejor_volumen_kg ?? 0),
      },
    })
  }

  const ejercicioIds = Object.keys(porEjercicio)
  let nombreDe = new Map<string, string>()
  if (ejercicioIds.length) {
    const nombres = await conLimite(supabase.from('ejercicios').select('id, nombre').in('id', ejercicioIds))
    if (!nombres || nombres.error) return null
    nombreDe = new Map(nombres.data.map((e) => [e.id, e.nombre]))
  }

  const records = Object.entries(porEjercicio)
    .filter(([id]) => nombreDe.has(id))
    .map(([id, m]) => ({ ejercicio_id: id, nombre: nombreDe.get(id)!, ...m }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return { records, historial: sesiones.data as unknown as SesionDelHistorial[] }
}

export default function Progreso() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'sin-conexion'>('cargando')

  useFocusEffect(
    useCallback(() => {
      let vivo = true
      setEstado('cargando')
      cargar()
        .then((r) => {
          if (!vivo) return
          setDatos(r)
          setEstado(r ? 'listo' : 'sin-conexion')
        })
        .catch(() => { if (vivo) setEstado('sin-conexion') })
      return () => { vivo = false }
    }, []),
  )

  if (estado === 'cargando') {
    return (
      <View style={estilos.centrado}>
        <Stack.Screen options={{ title: 'Progreso' }} />
        <ActivityIndicator />
      </View>
    )
  }

  if (estado === 'sin-conexion' || !datos) {
    return (
      <View style={estilos.centrado}>
        <Stack.Screen options={{ title: 'Progreso' }} />
        <Text style={estilos.vacio}>Necesitás conexión para ver tu progreso.</Text>
        <Text style={estilos.vacio}>Lo que entrenes sin señal se guarda igual y aparece acá después.</Text>
      </View>
    )
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      <Stack.Screen options={{ title: 'Progreso' }} />

      <Text style={estilos.seccion}>Récords personales</Text>
      {datos.records.length === 0 && (
        <Text style={estilos.vacio}>Tus mejores marcas aparecen acá después de tu primer entrenamiento.</Text>
      )}
      {datos.records.map((r) => (
        <Link key={r.ejercicio_id} href={`/(tabs)/progreso/ejercicio/${r.ejercicio_id}`} asChild>
          <Pressable style={estilos.fila}>
            <Text style={estilos.nombre}>{r.nombre}</Text>
            <Text style={estilos.sub}>
              {formatearKg(r.mejor_peso_kg)}kg · volumen {formatearKg(r.mejor_volumen_kg)}kg
            </Text>
          </Pressable>
        </Link>
      ))}

      <Text style={estilos.seccion}>Historial</Text>
      {datos.historial.length === 0 && (
        <Text style={estilos.vacio}>Todavía no registraste ningún entrenamiento.</Text>
      )}
      {datos.historial.map((s) => (
        <Link key={s.id} href={`/(tabs)/progreso/sesion/${s.id}`} asChild>
          <Pressable style={estilos.fila}>
            <Text style={estilos.nombre}>{fechaConDia(s.inicio)}</Text>
            <Text style={estilos.sub}>
              {s.rutina_dias?.nombre ?? 'Entrenamiento libre'}
              {' · '}{s.series_registradas[0]?.count ?? 0} series
              {' · '}{s.fin ? duracion(s.inicio, s.fin) : 'sin terminar'}
            </Text>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  seccion: { fontSize: 13, fontWeight: '600', color: '#777', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 },
  fila: {
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
  },
  nombre: { fontSize: 16 },
  sub: { color: '#777', fontSize: 13, marginTop: 2 },
  vacio: { color: '#777', paddingHorizontal: 16, paddingVertical: 8, textAlign: 'center' },
})
```

- [ ] **Step 4: Una sesión del historial**

Crear `apps/movil/src/app/(tabs)/progreso/sesion/[id].tsx`:

```tsx
import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { detalleSeries } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'
import { duracion, fechaConDia } from '@/lib/fechas'

interface SerieDeSesion {
  ejercicio_id: string
  numero_serie: number
  peso_kg: number
  repeticiones: number
  created_at: string
  ejercicios: { nombre: string } | null
}

interface Detalle {
  inicio: string
  fin: string | null
  rutina_dias: { nombre: string } | null
  series_registradas: SerieDeSesion[]
}

export default function SesionDelHistorial() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando')

  useEffect(() => {
    conLimite(
      supabase
        .from('sesiones')
        .select(`
          inicio, fin, rutina_dias ( nombre ),
          series_registradas ( ejercicio_id, numero_serie, peso_kg, repeticiones, created_at, ejercicios ( nombre ) )
        `)
        .eq('id', id)
        .eq('series_registradas.completada', true)
        .maybeSingle(),
    ).then((r) => {
      if (!r || r.error || !r.data) {
        setEstado('error')
        return
      }
      setDetalle(r.data as unknown as Detalle)
      setEstado('listo')
    })
  }, [id])

  if (estado === 'cargando') {
    return <View style={estilos.centrado}><ActivityIndicator /></View>
  }

  if (estado === 'error' || !detalle) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.vacio}>Necesitás conexión para ver este entrenamiento.</Text>
      </View>
    )
  }

  // Agrupadas por ejercicio, en el orden en que se hicieron.
  const ordenadas = [...detalle.series_registradas]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const grupos = new Map<string, { nombre: string; series: SerieDeSesion[] }>()
  for (const s of ordenadas) {
    const grupo = grupos.get(s.ejercicio_id)
    if (grupo) grupo.series.push(s)
    else grupos.set(s.ejercicio_id, { nombre: s.ejercicios?.nombre ?? 'Ejercicio', series: [s] })
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <Stack.Screen options={{ title: fechaConDia(detalle.inicio) }} />

      <View style={estilos.encabezado}>
        <Text style={estilos.titulo}>{detalle.rutina_dias?.nombre ?? 'Entrenamiento libre'}</Text>
        <Text style={estilos.sub}>
          {detalle.fin ? duracion(detalle.inicio, detalle.fin) : 'Sin terminar'}
        </Text>
      </View>

      {[...grupos.entries()].map(([ejercicioId, g]) => (
        <View key={ejercicioId} style={estilos.fila}>
          <Text style={estilos.nombre}>{g.nombre}</Text>
          <Text style={estilos.sub}>
            {detalleSeries(g.series.map((s) => ({ peso_kg: Number(s.peso_kg), repeticiones: s.repeticiones })))}
          </Text>
        </View>
      ))}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  encabezado: { padding: 16 },
  titulo: { fontSize: 20, fontWeight: '600' },
  fila: {
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
  },
  nombre: { fontSize: 16 },
  sub: { color: '#777', fontSize: 13, marginTop: 2 },
  vacio: { color: '#777', textAlign: 'center' },
})
```

- [ ] **Step 5: Verificar tipos y lint**

Run (desde `apps/movil`): `npx tsc --noEmit && npm run lint`
Expected: sin errores, salvo el `href` a `/(tabs)/progreso/ejercicio/...`, que todavía no existe: si `tsc` lo marca, crear en este paso un `apps/movil/src/app/(tabs)/progreso/ejercicio/[id].tsx` provisorio con `export default function EvolucionEjercicio() { return null }` —la Tarea 12 lo reemplaza— y regenerar los tipos de rutas como en el Step 6 de la Tarea 10.

- [ ] **Step 6: Commit**

```bash
git add apps/movil/src/lib/fechas.ts "apps/movil/src/app/(tabs)/progreso" "apps/movil/src/app/(tabs)/_layout.tsx"
git commit -m "Agregar la pestaña Progreso con récords e historial

Todo filtra por las membresías propias, porque el personal puede leer
las sesiones de cualquier socio de su gimnasio. Sin señal lo dice en
vez de quedar vacía: lo entrenado sin señal se guarda igual y aparece
acá después."
```

---

## Tarea 12: App — la evolución por ejercicio, con gráfico

**Files:**
- Modify: `apps/movil/package.json` (vía `npx expo install`)
- Create: `apps/movil/src/components/grafico-evolucion.tsx`
- Create (o reemplaza el provisorio de la Tarea 11): `apps/movil/src/app/(tabs)/progreso/ejercicio/[id].tsx`

**Interfaces:**
- Consumes: `evolucionPorSesion`, `marcarRecords`, `geometriaGrafico`, `MARGENES_GRAFICO`, `formatearKg`, `FilaSerie`, `PuntoEvolucion` de `@gym/core` (Tarea 7); `fechaCorta` (Tarea 11); `misMembresias`, `conLimite` (Tarea 8).
- Produces: `<GraficoEvolucion valores={number[]} fechas={string[]} color={string} />`; la ruta `/(tabs)/progreso/ejercicio/[id]`.

- [ ] **Step 1: Instalar `react-native-svg`**

Leer antes la página de `react-native-svg` en la documentación de la versión 57.

Run (desde `apps/movil`): `npx expo install react-native-svg`
Expected: aparece en `dependencies`.

- [ ] **Step 2: El componente del gráfico**

Crear `apps/movil/src/components/grafico-evolucion.tsx`:

```tsx
import { useState } from 'react'
import { View } from 'react-native'
import Svg, { Circle, G, Line, Polyline, Text as TextoSvg } from 'react-native-svg'
import { MARGENES_GRAFICO, formatearKg, geometriaGrafico, marcarRecords } from '@gym/core'
import { fechaCorta } from '@/lib/fechas'

const ALTO = 240
const DORADO = '#d69e2e'
const GRIS = '#999'

/**
 * Traduce la geometría de @gym/core a react-native-svg y nada más: las escalas,
 * los récords y las fechas a mostrar se calculan allá, con tests. Un dibujo
 * quieto, sin gestos —ver la sección 4 del diseño de la etapa 3—.
 */
export function GraficoEvolucion({ valores, fechas, color }: {
  valores: number[]
  fechas: string[]
  color: string
}) {
  // El ancho se conoce recién al dibujarse: hasta entonces no hay gráfico.
  const [ancho, setAncho] = useState(0)
  const g = geometriaGrafico(valores, ancho, ALTO)
  const records = marcarRecords(valores)

  return (
    <View style={{ height: ALTO }} onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
      {ancho > 0 && (
        <Svg width={ancho} height={ALTO}>
          {g.guias.map((guia, i) => (
            <G key={i}>
              <Line
                x1={MARGENES_GRAFICO.izq} x2={ancho - MARGENES_GRAFICO.der}
                y1={guia.y} y2={guia.y} stroke={GRIS} strokeOpacity={0.3} strokeWidth={1}
              />
              <TextoSvg
                x={MARGENES_GRAFICO.izq - 6} y={guia.y + 4}
                fontSize={11} fill={GRIS} textAnchor="end"
              >
                {formatearKg(guia.valor)}
              </TextoSvg>
            </G>
          ))}

          {g.puntos.length > 1 && (
            <Polyline
              points={g.puntos.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round"
            />
          )}

          {g.puntos.map((p, i) => (
            <Circle
              key={i} cx={p.x} cy={p.y}
              r={records[i] ? 5 : 3} fill={records[i] ? DORADO : color}
            />
          ))}

          {g.etiquetasX.map((etiqueta) => (
            <TextoSvg
              key={etiqueta.indice} x={etiqueta.x} y={ALTO - 6}
              fontSize={11} fill={GRIS} textAnchor="middle"
            >
              {fechaCorta(fechas[etiqueta.indice] ?? '')}
            </TextoSvg>
          ))}
        </Svg>
      )}
    </View>
  )
}
```

- [ ] **Step 3: La pantalla de evolución**

Crear (o reemplazar) `apps/movil/src/app/(tabs)/progreso/ejercicio/[id].tsx`:

```tsx
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { evolucionPorSesion, formatearKg, type FilaSerie, type PuntoEvolucion } from '@gym/core'
import { GraficoEvolucion } from '@/components/grafico-evolucion'
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'
import { misMembresias } from '@/lib/membresia'

const VERDE = '#1b7f3b'
const AZUL = '#2b6cb0'

type Vista = 'peso' | 'volumen'

async function cargar(ejercicioId: string): Promise<{ nombre: string; puntos: PuntoEvolucion[] } | null> {
  const ids = (await misMembresias()).map((m) => m.id)

  // La agregación se hace acá y no en la base: un año entrenando tres veces
  // por semana son unas 600 filas, y así queda como lógica pura en core.
  const [ejercicio, series] = await Promise.all([
    conLimite(supabase.from('ejercicios').select('nombre').eq('id', ejercicioId).maybeSingle()),
    conLimite(
      supabase
        .from('series_registradas')
        .select('sesion_id, peso_kg, repeticiones, completada, sesiones!inner ( inicio, membership_id )')
        .eq('ejercicio_id', ejercicioId)
        .eq('completada', true)
        .in('sesiones.membership_id', ids),
    ),
  ])
  if (!ejercicio || ejercicio.error || !series || series.error) return null

  const filas: FilaSerie[] = series.data.map((f) => ({
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
    return <View style={estilos.centrado}><ActivityIndicator /></View>
  }

  if (estado === 'sin-conexion') {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.vacio}>Necesitás conexión para ver tu progreso.</Text>
      </View>
    )
  }

  if (puntos.length === 0) {
    return (
      <View style={estilos.centrado}>
        <Stack.Screen options={{ title: nombre }} />
        <Text style={estilos.vacio}>Todavía no registraste este ejercicio.</Text>
      </View>
    )
  }

  const mejorPeso = Math.max(...puntos.map((p) => p.pesoMax))
  const mejorVolumen = Math.max(...puntos.map((p) => p.volumen))
  const valores = puntos.map((p) => (vista === 'peso' ? p.pesoMax : p.volumen))

  return (
    <View style={estilos.pantalla}>
      <Stack.Screen options={{ title: nombre }} />

      <View style={estilos.resumen}>
        <View style={estilos.marca}>
          <Text style={estilos.marcaValor}>{formatearKg(mejorPeso)} kg</Text>
          <Text style={estilos.marcaEtiqueta}>mejor peso</Text>
        </View>
        <View style={estilos.marca}>
          <Text style={estilos.marcaValor}>{formatearKg(mejorVolumen)} kg</Text>
          <Text style={estilos.marcaEtiqueta}>mejor volumen</Text>
        </View>
      </View>

      <View style={estilos.selector}>
        <Opcion texto="Peso máximo" activa={vista === 'peso'} onPress={() => setVista('peso')} />
        <Opcion texto="Volumen" activa={vista === 'volumen'} onPress={() => setVista('volumen')} />
      </View>

      <GraficoEvolucion
        valores={valores}
        fechas={puntos.map((p) => p.fecha)}
        color={vista === 'peso' ? VERDE : AZUL}
      />

      {puntos.length === 1 && (
        <Text style={estilos.vacio}>Con una sesión más aparece la evolución.</Text>
      )}
      <Text style={estilos.leyenda}>
        {vista === 'peso' ? 'El peso más alto de cada sesión.' : 'Peso × repeticiones, sumado por sesión.'}
        {' '}En dorado, los récords.
      </Text>
    </View>
  )
}

function Opcion({ texto, activa, onPress }: { texto: string; activa: boolean; onPress: () => void }) {
  return (
    <Pressable style={[estilos.opcion, activa && estilos.opcionActiva]} onPress={onPress}>
      <Text style={activa ? estilos.opcionTextoActiva : estilos.opcionTexto}>{texto}</Text>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, padding: 16, gap: 12, backgroundColor: '#fff' },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  vacio: { color: '#777', textAlign: 'center' },
  resumen: { flexDirection: 'row', gap: 8 },
  marca: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#f2f2f2' },
  marcaValor: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  marcaEtiqueta: { fontSize: 12, color: '#777' },
  selector: { flexDirection: 'row', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, overflow: 'hidden' },
  opcion: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  opcionActiva: { backgroundColor: '#111' },
  opcionTexto: { color: '#333' },
  opcionTextoActiva: { color: '#fff', fontWeight: '600' },
  leyenda: { color: '#777', fontSize: 12 },
})
```

- [ ] **Step 4: Verificar tipos y lint**

Run (desde `apps/movil`): `npx tsc --noEmit && npm run lint`
Expected: sin errores.

Si `tsc` marca `f.sesiones.inicio` como posiblemente nulo o como arreglo, es que los tipos generados no infirieron la relación muchos-a-uno: castear la respuesta a la forma esperada, como hace la Tarea 11 con `as unknown as`, y anotarlo en el reporte.

- [ ] **Step 5: Commit**

```bash
git add apps/movil/package.json package-lock.json apps/movil/src/components/grafico-evolucion.tsx "apps/movil/src/app/(tabs)/progreso/ejercicio"
git commit -m "Mostrar la evolución de cada ejercicio con un gráfico

Un solo gráfico de línea con selector entre peso máximo y volumen, como
se eligió con las maquetas. El componente solo traduce a svg la
geometría que core calcula y prueba, incluidos los récords en dorado y
el caso de valores iguales."
```

---
## Tarea 13: Panel — las últimas sesiones en la ficha del socio

**Files:**
- Create: `supabase/migrations/0015_ultimas_sesiones.sql`
- Modify: `tests/rls/registro.test.ts`
- Modify (regenerado): `packages/core/src/tipos-db.ts`
- Modify: `apps/panel/src/app/(panel)/socios/page.tsx`

**Interfaces:**
- Consumes: las tablas y políticas de las tareas 1 y 2; las ayudas `unEjercicio`, `sesionDe`, `serieEn` de `registro.test.ts`.
- Produces: vista `public.ultimas_sesiones` (`security_invoker`), con columnas `id uuid`, `membership_id uuid`, `inicio timestamptz`, `fin timestamptz | null`, `dia_nombre text | null`, `series integer`. Hasta tres filas por membresía, las más recientes.

El spec dice que esto es "una consulta y una lista, no una política nueva", y sigue siéndolo: la vista no agrega permisos. Hace falta porque "las tres últimas de cada socio" no se puede pedir con un `limit` sobre todo el gimnasio. Con 300 socios entrenando tres veces por semana, las 200 sesiones más recientes cubren un día y medio, y la ficha de quien entrenó el lunes quedaría vacía.

- [ ] **Step 1: Escribir los tests**

Agregar al final de `tests/rls/registro.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:rls -- tests/rls/registro.test.ts`
Expected: FAIL — `ultimas_sesiones` no existe.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/0015_ultimas_sesiones.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Las últimas sesiones de cada socio, para su ficha en el panel.
--
-- Una vista y no un `limit` sobre la tabla: "las tres últimas de CADA socio"
-- no se puede pedir así. Con un gimnasio de 300 socios, las 200 sesiones más
-- recientes cubren un día y medio, y la ficha de quien entrenó el lunes
-- quedaría vacía.
--
-- security_invoker: no agrega permisos. Corre con la RLS de quien consulta
-- —el personal ve las de su gimnasio, un socio las suyas—, igual que
-- mejores_marcas en 0014.
-- ---------------------------------------------------------------------------

create view public.ultimas_sesiones
with (security_invoker = true)
as
select id, membership_id, inicio, fin, dia_nombre, series
from (
  select
    s.id,
    s.membership_id,
    s.inicio,
    s.fin,
    d.nombre as dia_nombre,
    (
      select count(*)::int
      from public.series_registradas sr
      where sr.sesion_id = s.id and sr.completada
    ) as series,
    row_number() over (partition by s.membership_id order by s.inicio desc) as posicion
  from public.sesiones s
  left join public.rutina_dias d on d.id = s.rutina_dia_id
) recientes
where posicion <= 3;
```

- [ ] **Step 4: Aplicar, regenerar tipos y correr la suite de base completa**

Run: `npm run db:reset && npm run db:tipos && npm run test:rls`
Expected: PASS. `registro.test.ts` suma 46 tests.

- [ ] **Step 5: Mostrarlas en la ficha**

En `apps/panel/src/app/(panel)/socios/page.tsx`, debajo de la consulta de `rutinas`, agregar:

```tsx
  // Hasta tres por socio: lo resuelve la vista (0015). La RLS ya limita esto al
  // propio gimnasio.
  const { data: sesiones } = await supabase
    .from('ultimas_sesiones')
    .select('id, membership_id, inicio, fin, dia_nombre, series')
    .order('inicio', { ascending: false })
```

Debajo de `const activas = …`, agregar el formateador:

```tsx
  // La zona fija de Argentina: el servidor del panel puede correr en UTC, y una
  // sesión de las 22 hs no puede aparecer como del día siguiente.
  const fecha = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short', day: 'numeric', month: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
```

Adentro del `map` de socios, debajo de `const nombre = …`:

```tsx
          const ultimas = (sesiones ?? []).filter((x) => x.membership_id === s.id)
```

Y en el JSX, entre el bloque de rutinas (`{suyas.length ? … }`) y `<Asignar … />`:

```tsx
              <div className="text-sm">
                <p className="text-gray-500">Últimas sesiones</p>
                {ultimas.length ? (
                  <ul className="text-gray-700">
                    {ultimas.map((x) => (
                      <li key={x.id!}>
                        {fecha.format(new Date(x.inicio!))}
                        {' · '}{x.dia_nombre ?? 'Entrenamiento libre'}
                        {' · '}{x.series} series
                        {!x.fin && <span className="text-gray-500"> · sin terminar</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">Todavía no registró entrenamientos.</p>
                )}
              </div>
```

- [ ] **Step 6: Verificar tipos y lint del panel**

Run (desde `apps/panel`): `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0015_ultimas_sesiones.sql tests/rls/registro.test.ts packages/core/src/tipos-db.ts "apps/panel/src/app/(panel)/socios/page.tsx"
git commit -m "Mostrar las últimas sesiones del socio en su ficha

Una vista y no un limit, porque las tres últimas de cada socio no se
pueden pedir con un limit sobre todo el gimnasio: con trescientos
socios, la ficha de quien entrenó el lunes quedaría vacía. La vista no
agrega permisos; corre con la RLS de quien mira."
```

---

## Tarea 14: Cerrar la etapa en la documentación

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-27-gym-saas-design.md`
- Modify: `docs/superpowers/specs/2026-09-10-registro-entrenamiento-design.md`

**Interfaces:**
- Consumes: todo lo anterior, terminado.
- Produces: nada que otra tarea use.

Es la sección 7 del spec de la etapa 3, punto por punto.

- [ ] **Step 1: README**

En `README.md`, reemplazar el párrafo de estado:

```markdown
En construcción. Las etapas 0, 1 y 2 están implementadas: esquema con RLS,
autenticación en el panel y la app, ejercicios, máquinas y videos, y rutinas
—catálogo del gimnasio, armador propio del socio y asignación del entrenador.
```

por:

```markdown
En construcción. Las etapas 0 a 3 están implementadas: esquema con RLS,
autenticación en el panel y la app, ejercicios, máquinas y videos, rutinas
—catálogo del gimnasio, armador propio del socio y asignación del entrenador—, y
registro de entrenamiento serie por serie, que funciona sin señal, con récords,
historial y evolución por ejercicio.
```

y en la tabla de etapas, la fila 3:

```markdown
| 3 | Registro de entrenamiento, modo sin conexión y progreso | Hecha |
```

- [ ] **Step 2: Diseño general, sección 7**

En `docs/superpowers/specs/2026-08-27-gym-saas-design.md`, debajo del párrafo que empieza con `**Estado siempre visible.**`, agregar:

```markdown
**Lo que el servidor rechaza para siempre.** La cola distingue un error transitorio —sin red, timeout, error del servidor— de uno permanente —un permiso negado, una clave foránea, un `check`—. Lo transitorio se reintenta; lo permanente queda marcado como rechazado: se guarda en el teléfono, no se reintenta y el aviso lo dice ("1 serie no se pudo guardar"). El caso típico es una membresía dada de baja mientras el socio entrenaba sin señal. Ver la sección 2 del [diseño de la etapa 3](2026-09-10-registro-entrenamiento-design.md).
```

- [ ] **Step 3: Diseño general, sección 8**

En el mismo archivo, debajo del párrafo que termina en `Es la diferencia entre tener la función y no tenerla.`, agregar:

```markdown
**"La vez pasada" requiere señal.** El teléfono cachea la rutina activa y las mejores marcas, no el historial. Sin señal, la pantalla precarga lo que dice la rutina —series, repeticiones y peso sugerido— y el aviso de récord sigue funcionando. Si hiciera falta sin señal, es una tabla local más, no otro enfoque. Ver la sección 2 del [diseño de la etapa 3](2026-09-10-registro-entrenamiento-design.md).
```

- [ ] **Step 4: Diseño general, sección 12**

En el mismo archivo, reemplazar el párrafo:

```markdown
El botón *Empezar* de la pestaña Hoy llega recién con la etapa 3, junto con el registro de entrenamiento. En la etapa 2 la pestaña es de solo lectura: muestra la rutina activa del socio y sus días, y es el socio quien elige qué día mirar —todavía no hay una detección automática de "qué toca hoy".
```

por:

```markdown
La pestaña Hoy muestra la rutina activa del socio y sus días; es el socio quien elige qué día mirar —no hay una detección automática de "qué toca hoy"—. *Empezar* abre la pantalla de sesión con ese día, y *Entrenar libre* la abre vacía. Si una sesión quedó sin terminar, Hoy ofrece seguirla o terminarla.

La pestaña Perfil todavía no existe: llega con las etapas 4 y 5, junto con el QR, las cuotas y las notificaciones.
```

- [ ] **Step 5: El spec de la etapa 3**

En `docs/superpowers/specs/2026-09-10-registro-entrenamiento-design.md`, reemplazar la línea de estado:

```markdown
**Estado:** Aprobado en conversación — secciones 1 a 3 el 2026-09-10, 4 a 7 el 2026-10-08.
```

por:

```markdown
**Estado:** Implementado. Plan: [`2026-10-08-registro-entrenamiento.md`](../plans/2026-10-08-registro-entrenamiento.md).
```

- [ ] **Step 6: Commit**

```bash
git add README.md docs/superpowers/specs/2026-08-27-gym-saas-design.md docs/superpowers/specs/2026-09-10-registro-entrenamiento-design.md
git commit -m "Registrar la etapa 3 como terminada

El diseño general prometía cosas que la etapa precisó: que la vez
pasada requiere señal, y que la cola separa lo que reintenta de lo que
rechaza. Quedan anotadas donde un lector las va a buscar."
```

---

## Verificación final de la rama

Después de la Tarea 14, antes de la revisión amplia:

- [ ] `npm run db:reset && npm run test:rls` — PASS, con los 46 de `registro.test.ts`.
- [ ] `npm run test:core` — PASS, con los 37 de `registro.test.ts`, los 28 de `cola.test.ts` y los 13 de `evolucion.test.ts`.
- [ ] Desde `apps/movil`: `npx tsc --noEmit && npm run lint` — sin errores.
- [ ] Desde `apps/panel`: `npx tsc --noEmit && npm run lint` — sin errores.
- [ ] `git grep -n "for update\|for delete\|for all" -- supabase/migrations/0011_registro.sql supabase/migrations/0012_rls_registro.sql supabase/migrations/0013_sesiones_inmutables.sql supabase/migrations/0014_registro_lecturas.sql supabase/migrations/0015_ultimas_sesiones.sql` — la única coincidencia es `sesiones_editar`. Si aparece una política de `update` o `delete` sobre `series_registradas`, la rama rompe la invariante de la que depende la sincronización.

**El recorrido a mano, para el usuario.** Es lo que ningún test automático cubre: el teléfono real, sin señal. En un teléfono o emulador con la app y el panel abiertos:

1. Con señal, abrir Hoy, elegir un día con ejercicios y tocar **Empezar**. Registrar dos series. Volver atrás sin terminar: Hoy dice "Tenés un entrenamiento sin terminar".
2. Poner **modo avión**. Tocar **Seguir**: las dos series están tildadas. Registrar tres más. El aviso dice "3 series sin sincronizar" (o 5, si las dos primeras no llegaron a salir).
3. Con un peso mayor que el mejor que tengas en ese ejercicio, tildar una serie: aparece "🏆 Nuevo récord en …" sin señal.
4. **Cerrar la app a la fuerza** y abrirla otra vez, todavía en modo avión. Hoy carga la rutina guardada ("Sin conexión: es tu rutina guardada") y sigue ofreciendo la sesión abierta.
5. Entrar y tocar **Terminar**. Si quedaron filas sin tildar, avisa cuántas antes de cerrar.
6. **Sacar el modo avión.** En unos segundos el aviso desaparece.
7. En el panel, en **Socios**, la sesión aparece en las últimas sesiones del socio, con la cantidad de series correcta.
8. En la app, en **Progreso**, la sesión está en el historial; tocar el ejercicio del récord muestra el gráfico con el punto en dorado, y el selector cambia a volumen.
9. Con algo pendiente —modo avión, una serie registrada—, **Cerrar sesión** pregunta antes de borrar.
