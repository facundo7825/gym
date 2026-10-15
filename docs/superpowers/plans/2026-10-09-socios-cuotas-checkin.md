# Socios, cuotas y check-in con QR (etapa 4) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el admin dé de alta socios desde el panel, les saque la foto y registre sus pagos; que el personal haga el check-in escaneando el QR del socio desde el celular y vea en el momento su foto y el estado de la cuota; y que el socio tenga en la app una pestaña Perfil con su QR, su cuota y sus asistencias.

**Architecture:** Dos tablas nuevas, `cuotas` y `checkins`, más `memberships.foto`. El estado de la cuota no se guarda: lo calcula una función pura de `packages/core` que usan el panel y la app. Los check-in no se insertan directo: entran solo por dos funciones SQL `security definer` (`checkin_por_qr`, `checkin_manual`) que verifican el rol, calculan el día en la zona del gimnasio y devuelven en una sola respuesta lo que la tarjeta del escaneo necesita. La cuenta del socio la crea una Edge Function, `socio-alta`, con la clave de servicio, siguiendo el esquema de las funciones de video.

**Tech Stack:** PostgreSQL 15 (Supabase), Supabase Edge Functions (Deno), TypeScript, Next.js 16 (panel), `qr-scanner` (lectura de QR en el navegador), Expo Router 57 / React Native 0.86 (app), `react-native-qrcode-svg`, `expo-brightness`, vitest.

**Spec:** [`docs/superpowers/specs/2026-10-09-socios-cuotas-checkin-design.md`](../specs/2026-10-09-socios-cuotas-checkin-design.md)

## Global Constraints

- **Todo el código, los comentarios, los identificadores de base de datos y los textos de interfaz van en castellano.** Es la convención de todo el repositorio.
- **Las funciones de Postgres que se llaman desde una política, o que deciden permisos, llevan `security definer` y `set search_path = ''`**, y escriben los nombres completos (`public.memberships`, `auth.uid()`). El motivo está en `supabase/migrations/0002_rls_identidad.sql`.
- **Toda política de `update` escribe el `with check` explícito**, aunque repita el `using`.
- **Toda clave foránea entre dos tablas con `gym_id` lleva el `gym_id` adentro** (sección 4 del diseño general).
- **`checkins` no tiene política de `insert` ni de `update`.** Las entradas se crean solo con `checkin_por_qr` y `checkin_manual`. **`cuotas` no tiene política de `update`:** un pago mal cargado se borra y se carga de nuevo.
- **El estado de la cuota nunca se guarda.** Se calcula con `estadoCuota` de `@gym/core`.
- **`periodo_hasta` es el primer día SIN cobertura.** Una cuota del 15/10 al 15/11 cubre hasta el 14/11 inclusive. "Vigente hasta" muestra el último día cubierto.
- **"Hoy" es la fecha local del gimnasio** (`gyms.zona_horaria`), nunca la del servidor ni la de UTC.
- **El `codigo_qr` solo lo lee su dueño**, con la función `mi_codigo_qr`. Ninguna pantalla del panel lo pide.
- **La contraseña inicial del socio no se guarda ni se registra en ningún log.** Se muestra una sola vez.
- **Al usuario nunca se le muestra un código de error ni un stack trace.** Los mensajes van en castellano (sección 6 del spec).
- **Migraciones:** una o más por tarea, numeradas correlativas a partir de `0016`. No se edita una migración ya commiteada.
- **`npm run db:tipos` después de cada migración que cambie el esquema o agregue una función**, para regenerar `packages/core/src/tipos-db.ts`, y se commitea junto con la migración.
- **Comandos de prueba:** `npm run test:rls` (necesita `npx supabase start` y un `.env.test` generado con `npx supabase status -o env > .env.test`), `npm run test:core` y, desde la tarea 7, `npm run test:funciones` (necesita además `npx supabase functions serve` corriendo en otra terminal).
- **App móvil:** antes de usar una API de Expo, leer la documentación de la versión exacta en https://docs.expo.dev/versions/v57.0.0/ —lo exige `apps/movil/AGENTS.md`—. Las dependencias de la app se instalan con `npx expo install`, nunca con `npm install`.
- **Panel:** antes de usar una API de Next, leer la guía en `node_modules/next/dist/docs/` —lo exige `apps/panel/AGENTS.md`—. En esta versión `params` y `searchParams` de una página son `Promise`.
- **Las tareas de interfaz no tienen tests automáticos.** El repo no tiene infraestructura de tests de componentes y se decidió no montarla. Cierran con `npx tsc --noEmit` y `npm run lint` en la app correspondiente; la verificación tocando la app queda para el usuario.
- **Colores, radios y tamaños salen del tema** (`COLORES` en la app, variables `--color-*` en el panel). Ninguna pantalla escribe un color a mano.
- **Cada tarea termina en un commit.** Mensaje en castellano, imperativo, explicando el porqué y no el qué, y terminado con la línea literal `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` —esa línea exacta, sea cual sea el modelo que implemente—.

## Review Focus

Las cinco cosas que el spec implica y que más probablemente le fallen a alguien usándolo. Cada una tiene su test en la tarea que es dueña del código.

1. **La cuota pagada por adelantado o encadenada.** Un socio que pagó octubre y noviembre tiene que verse "Vigente hasta" el fin de noviembre, no el de octubre. → Tarea 5, `estadoCuota` encadena cuotas contiguas.
2. **La cámara lee el mismo QR diez veces por segundo.** Tiene que salir una sola llamada y una sola tarjeta. → Tarea 6, `debeProcesarLectura`, y la base no duplica la entrada (tarea 3).
3. **El check-in cerca de la medianoche.** Una entrada a las 23:30 en Buenos Aires es de ese día aunque el servidor esté en UTC. → Tarea 3, test con zonas UTC+14 y UTC−11.
4. **Un socio lee el `codigo_qr` de otro.** Con la RLS de hoy, cualquier socio lee todas las membresías de su gimnasio, con código incluido, y podría generar el QR ajeno. → Tarea 2, permisos por columna y `mi_codigo_qr`.
5. **El email del alta con mayúsculas o espacios** ("Juan@Mail.com "). Tiene que crear la cuenta en minúsculas, y un segundo alta con el mismo email en otra forma tiene que encontrarla. → Tarea 7.

---

## Estructura de archivos

**Base de datos**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0016_socios_cuotas.sql` | `cuotas`, `checkins`, `memberships.foto`, enums, claves e índices |
| `supabase/migrations/0017_rls_socios.sql` | Políticas de `cuotas` y `checkins`, permisos por columna de `memberships`, `mi_codigo_qr`, `editar_datos_socio` |
| `supabase/migrations/0018_checkin.sql` | `registrar_checkin` (interna), `checkin_por_qr`, `checkin_manual` |
| `supabase/migrations/0019_fotos_socios.sql` | Bucket `fotos-socios` y sus políticas |
| `supabase/migrations/0020_alta_socios.sql` | `usuario_por_email`, solo para `service_role` |

**Tests de base y de funciones**

| Archivo | Responsabilidad |
|---|---|
| `tests/rls/ayudas.ts` | Se amplía: membresía del admin A |
| `tests/rls/identidad.test.ts` | Dos `.select()` pasan a `.select('id')` por el permiso por columna |
| `tests/rls/socios.test.ts` | Esquema, permisos, check-in, fotos y `usuario_por_email` |
| `tests/funciones/socio-alta.test.ts` | La Edge Function de alta, de punta a punta |
| `vitest.config.ts` / `vitest.funciones.config.ts` | Separar los tests que necesitan `functions serve` |

**Lógica compartida**

| Archivo | Responsabilidad |
|---|---|
| `packages/core/src/cuotas.ts` | Fechas sin hora, estado de la cuota, período y monto propuestos, textos |
| `packages/core/src/socios.ts` | Código QR, contraseña inicial, validaciones de alta, pago y contraseña, filtro de lecturas repetidas |
| `packages/core/src/tema.ts` | Se suma el color `vigente` |
| `packages/core/tests/cuotas.test.ts`, `socios.test.ts` | Sus tests |

**Edge Function**

| Archivo | Responsabilidad |
|---|---|
| `supabase/functions/socio-alta/index.ts` | Crear la cuenta y la membresía del socio |

**Panel**

| Archivo | Responsabilidad |
|---|---|
| `apps/panel/src/app/globals.css` | Variables `--color-vigente*` |
| `apps/panel/src/app/(panel)/layout.tsx`, `nav-lateral.tsx` | Diseño que funciona en el celular; *Escanear* y *Asistencia* |
| `apps/panel/src/lib/membresia.ts` | La membresía de quien usa el panel, con rol y zona |
| `apps/panel/src/lib/fotos.ts` | URLs firmadas de las fotos |
| `apps/panel/src/lib/paginar.ts` | Leer todas las páginas de una consulta |
| `apps/panel/src/components/estado-cuota.tsx` | La etiqueta verde o roja |
| `apps/panel/src/app/(panel)/socios/page.tsx` | Lista con buscador, filtros, foto y estado |
| `apps/panel/src/app/(panel)/socios/acciones.ts` | Todas las Server Actions de socios, pagos y entradas |
| `apps/panel/src/app/(panel)/socios/nuevo/` | Alta de socio |
| `apps/panel/src/app/(panel)/socios/[id]/` | Ficha del socio |
| `apps/panel/src/app/(panel)/escanear/` | Escaneo y check-in manual |
| `apps/panel/src/app/(panel)/asistencia/` | Entradas de un día |

**App**

| Archivo | Responsabilidad |
|---|---|
| `apps/movil/src/lib/perfil.ts` | Cargar y guardar en caché los datos de Perfil |
| `apps/movil/src/components/qr-socio.tsx` | El QR con el brillo al máximo |
| `apps/movil/src/components/cambiar-contrasena.tsx` | El formulario de cambio de contraseña |
| `apps/movil/src/app/(tabs)/perfil.tsx` | La pestaña |
| `apps/movil/src/app/(tabs)/_layout.tsx` | La quinta pestaña |
| `apps/movil/src/app/(tabs)/index.tsx` | Sale el botón de cerrar sesión |

---

## Preparación (antes de la tarea 1)

La hace quien coordina la ejecución, no un implementador. Es la misma de la etapa 3.

- [ ] Crear la rama y el worktree desde el `HEAD` local (no desde `origin/main`):

```bash
git -C C:/Users/facun/OneDrive/Desktop/gym worktree add .claude/worktrees/etapa-4 -b etapa-4
```

- [ ] Entrar al worktree con `EnterWorktree` usando `path`.
- [ ] Aislar Supabase: en `supabase/config.toml` del worktree cambiar `project_id = "gym"` por `project_id = "gym-etapa4"` y marcarlo para que git no lo vea:

```bash
git -C .claude/worktrees/etapa-4 update-index --skip-worktree supabase/config.toml
```

- [ ] Instalar y levantar: `npm install`, `npx supabase start`, `npx supabase db reset`, `npx supabase status -o env > .env.test`.
- [ ] Verificar el punto de partida: `npm run test:rls` y `npm run test:core` en verde.
- [ ] Tipos de rutas: `npx next typegen` en `apps/panel`, y `CI=1 timeout 120 npx expo start --offline` en `apps/movil` para generar `.expo/types`.

---

## Tarea 1: Esquema de cuotas y asistencia

**Files:**
- Create: `supabase/migrations/0016_socios_cuotas.sql`
- Modify: `tests/rls/ayudas.ts`
- Create: `tests/rls/socios.test.ts`
- Modify: `packages/core/src/tipos-db.ts` (regenerado)

**Interfaces:**
- Produces: tablas `cuotas` y `checkins`; enums `metodo_pago` (`efectivo` | `transferencia` | `otro`) y `metodo_checkin` (`qr` | `manual`); columna `memberships.foto text`; restricción `memberships_id_gym_unico unique (id, gym_id)`; restricción `checkins_uno_por_dia unique (membership_id, dia)`.
- Produces (tests): `Escenario.adminAMembresiaId: string` en `tests/rls/ayudas.ts`.

- [ ] **Step 1: Ampliar el escenario de los tests**

En `tests/rls/ayudas.ts`, agregar al `interface Escenario`, debajo de `entrenadorAMembresiaId`:

```ts
  /** Hace falta como `registrado_por` de las cuotas que carga el admin. */
  adminAMembresiaId: string
```

Y en el objeto que devuelve `crearEscenario`, debajo de `entrenadorAMembresiaId: membresiaDe(entrenadorA.id),`:

```ts
    adminAMembresiaId: membresiaDe(adminA.id),
```

- [ ] **Step 2: Escribir los tests del esquema**

Crear `tests/rls/socios.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, crearEscenario, type Escenario } from './ayudas'

// ---------------------------------------------------------------------------
// Ayudas de este archivo. Preparan datos con el cliente admin, que saltea RLS:
// lo que se prueba después es lo que cada usuario puede hacer sobre esos datos.
// ---------------------------------------------------------------------------

/** Una cuota bien formada; `campos` pisa lo que haga falta para el caso. */
const cuotaPara = (gymId: string, membershipId: string, campos: Record<string, unknown> = {}) => ({
  gym_id: gymId,
  membership_id: membershipId,
  periodo_desde: '2026-10-15',
  periodo_hasta: '2026-11-15',
  monto: 25000,
  metodo: 'efectivo',
  fecha_pago: '2026-10-15',
  ...campos,
})

async function cuotaDe(gymId: string, membershipId: string, campos: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin.from('cuotas').insert(cuotaPara(gymId, membershipId, campos)).select('id').single()
  if (error) throw error
  return data.id
}

async function checkinDe(gymId: string, membershipId: string, dia = '2026-10-09'): Promise<string> {
  const { data, error } = await admin
    .from('checkins')
    .insert({ gym_id: gymId, membership_id: membershipId, metodo: 'manual', dia })
    .select('id').single()
  if (error) throw error
  return data.id
}

describe('esquema de cuotas y asistencia', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
  })

  it('acepta una cuota bien formada', async () => {
    const { error } = await admin.from('cuotas').insert(cuotaPara(e.gymA, e.socioAMembresiaId))
    expect(error).toBeNull()
  })

  it('no acepta un período que termina antes de empezar', async () => {
    const { error } = await admin.from('cuotas').insert(
      cuotaPara(e.gymA, e.socioAMembresiaId, { periodo_desde: '2026-11-15', periodo_hasta: '2026-10-15' }),
    )
    expect(error?.code).toBe('23514')
  })

  it('no acepta un período de cero días', async () => {
    const { error } = await admin.from('cuotas').insert(
      cuotaPara(e.gymA, e.socioAMembresiaId, { periodo_desde: '2026-10-15', periodo_hasta: '2026-10-15' }),
    )
    expect(error?.code).toBe('23514')
  })

  it('no acepta un monto negativo', async () => {
    const { error } = await admin.from('cuotas').insert(cuotaPara(e.gymA, e.socioAMembresiaId, { monto: -1 }))
    expect(error?.code).toBe('23514')
  })

  it('acepta un monto cero: una beca existe', async () => {
    const { error } = await admin.from('cuotas').insert(cuotaPara(e.gymA, e.socioAMembresiaId, { monto: 0 }))
    expect(error).toBeNull()
  })

  it('una cuota del gimnasio A no puede apuntar a una membresía del B', async () => {
    const { error } = await admin.from('cuotas').insert(cuotaPara(e.gymA, e.socioBMembresiaId))
    expect(error?.code).toBe('23503')
  })

  it('un check-in del gimnasio A no puede apuntar a una membresía del B', async () => {
    const { error } = await admin
      .from('checkins')
      .insert({ gym_id: e.gymA, membership_id: e.socioBMembresiaId, metodo: 'manual', dia: '2026-10-09' })
    expect(error?.code).toBe('23503')
  })

  it('la base no deja dos entradas del mismo socio el mismo día', async () => {
    await checkinDe(e.gymA, e.socioA2MembresiaId, '2026-10-01')
    const { error } = await admin
      .from('checkins')
      .insert({ gym_id: e.gymA, membership_id: e.socioA2MembresiaId, metodo: 'qr', dia: '2026-10-01' })
    expect(error?.code).toBe('23505')
  })

  it('el mismo socio sí puede entrar al día siguiente', async () => {
    await checkinDe(e.gymA, e.socioA2MembresiaId, '2026-10-02')
    const { count } = await admin
      .from('checkins').select('id', { count: 'exact', head: true })
      .eq('membership_id', e.socioA2MembresiaId)
    expect(count).toBe(2)
  })
})

// Se exportan para los describe de las tareas siguientes, que viven en este
// mismo archivo.
export { cuotaPara, cuotaDe, checkinDe }
```

> El `export` del final evita que el lint marque las ayudas como sin usar mientras solo las usa el primer `describe`. Las tareas 2 a 4 agregan sus `describe` a este mismo archivo, debajo del de esta tarea y antes del `export`.

- [ ] **Step 3: Correr los tests y ver que fallan**

Run: `npm run test:rls -- tests/rls/socios.test.ts`
Expected: FAIL — `relation "public.cuotas" does not exist` (o el equivalente de PostgREST: `Could not find the table 'public.cuotas'`).

- [ ] **Step 4: Escribir la migración**

Crear `supabase/migrations/0016_socios_cuotas.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Socios, cuotas y asistencia (etapa 4).
--
-- No hay ninguna columna "al día". El estado de la cuota se calcula —¿hay una
-- cuota cuyo período cubre hoy?— con estadoCuota de @gym/core. Guardarlo
-- obligaría a que algo lo actualice con el paso del tiempo, y el tiempo pasa
-- sin que nadie ejecute nada. Ver la sección 5 del diseño general.
-- ---------------------------------------------------------------------------

create type metodo_pago as enum ('efectivo', 'transferencia', 'otro');
create type metodo_checkin as enum ('qr', 'manual');

-- Para que cuotas y checkins apunten a (membresía, gimnasio) juntos: así la
-- base rechaza una cuota del gimnasio A colgada de un socio del B, sin
-- depender de que la política se acuerde de chequearlo.
alter table memberships add constraint memberships_id_gym_unico unique (id, gym_id);

-- La foto de verificación: ruta del objeto en el bucket fotos-socios (0019).
-- Va en la membresía y no en profiles.avatar_url porque el perfil es de la
-- persona y lo comparten todos sus gimnasios, y además el socio puede editar
-- su propio avatar_url. Esta foto es del gimnasio que la sacó, y solo la
-- cambia su admin. Ver la sección 1 del diseño de la etapa 4.
alter table memberships add column foto text;

create table cuotas (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references gyms(id) on delete cascade,
  membership_id   uuid not null,
  periodo_desde   date not null,
  -- El primer día SIN cobertura: una cuota del 15/10 al 15/11 cubre hasta el
  -- 14/11 inclusive. Así dos cuotas seguidas se tocan sin superponerse.
  periodo_hasta   date not null,
  monto           numeric(12,2) not null,
  moneda          text not null default 'ARS',
  metodo          metodo_pago not null,
  fecha_pago      date not null,
  -- set null: si el empleado que cobró se va, el pago queda.
  registrado_por  uuid references memberships(id) on delete set null,
  notas           text,
  created_at      timestamptz not null default now(),

  constraint cuotas_membresia_fk foreign key (membership_id, gym_id)
    references memberships (id, gym_id) on delete cascade,
  constraint cuotas_periodo_valido check (periodo_hasta > periodo_desde),
  constraint cuotas_monto_no_negativo check (monto >= 0)
);

create index cuotas_membresia_idx on cuotas (membership_id, periodo_hasta desc);
create index cuotas_gym_idx on cuotas (gym_id);

create table checkins (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references gyms(id) on delete cascade,
  membership_id   uuid not null,
  registrado_por  uuid references memberships(id) on delete set null,
  metodo          metodo_checkin not null,
  -- La fecha local del gimnasio en el momento de la entrada. La calcula
  -- registrar_checkin (0018) con gyms.zona_horaria; nunca la manda el
  -- cliente. Es lo que hace cumplir "una entrada por día" con un índice.
  dia             date not null,
  created_at      timestamptz not null default now(),

  constraint checkins_membresia_fk foreign key (membership_id, gym_id)
    references memberships (id, gym_id) on delete cascade,
  constraint checkins_uno_por_dia unique (membership_id, dia)
);

create index checkins_gym_dia_idx on checkins (gym_id, dia desc);
```

- [ ] **Step 5: Aplicar y regenerar los tipos**

Run: `npx supabase db reset` y después `npm run db:tipos`
Expected: el reset termina sin errores y `packages/core/src/tipos-db.ts` tiene `cuotas`, `checkins`, `metodo_pago` y `metodo_checkin`.

- [ ] **Step 6: Correr los tests y ver que pasan**

Run: `npm run test:rls -- tests/rls/socios.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Correr toda la suite de RLS**

Run: `npm run test:rls`
Expected: PASS. Ningún test anterior se rompe por la columna y la restricción nuevas de `memberships`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0016_socios_cuotas.sql tests/rls/ayudas.ts tests/rls/socios.test.ts packages/core/src/tipos-db.ts
git commit -m "Agregar las tablas de cuotas y asistencia

El estado de la cuota no se guarda: se calcula a partir de los períodos
pagados. La regla de una entrada por día la impone un índice único, no
la pantalla.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 2: Permisos de cuotas, asistencia y membresías

**Files:**
- Create: `supabase/migrations/0017_rls_socios.sql`
- Modify: `tests/rls/socios.test.ts`
- Modify: `tests/rls/identidad.test.ts:56` y `:66`
- Modify: `packages/core/src/tipos-db.ts` (regenerado)

**Interfaces:**
- Consumes: `cuotaPara`, `cuotaDe`, `checkinDe` de `tests/rls/socios.test.ts` (tarea 1); `puedo_ver_sesion_fila(p_gym_id uuid, p_membership_id uuid) returns boolean` de `0012_rls_registro.sql`; `mi_rol`, `mi_membresia`, `mis_gyms` de `0002`/`0007`.
- Produces:
  - RPC `mi_codigo_qr(p_gym_id uuid) returns text` — el código del que llama en ese gimnasio, o `null`.
  - RPC `editar_datos_socio(p_membership_id uuid, p_nombre text, p_apellido text, p_telefono text) returns void` — solo admin del gimnasio de esa membresía; si no, error `42501`; nombre vacío, error `22023`.
  - `authenticated` ya no puede leer `memberships.codigo_qr`. Columnas legibles: `id, gym_id, user_id, rol, estado, fecha_alta, foto, created_at`.

- [ ] **Step 1: Ajustar los dos tests de identidad que piden todas las columnas**

En `tests/rls/identidad.test.ts`, el test `'un socio NO puede ascenderse a admin en su propio gimnasio'` (línea ~56) y el test `'nadie puede borrar membresías'` (línea ~66) terminan en `.select()`. Cambiar esos dos `.select()` por `.select('id')`. Con el permiso por columna de esta tarea, `select()` pide también `codigo_qr` y la consulta falla por permiso en vez de devolver `[]`: el test seguiría en rojo por un motivo que no es el que prueba.

- [ ] **Step 2: Escribir los tests de permisos**

En `tests/rls/socios.test.ts`, debajo del `describe` de la tarea 1 y antes del `export`, agregar:

```ts
describe('quién puede hacer qué con las cuotas', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
    await cuotaDe(e.gymA, e.socioAMembresiaId)
    await cuotaDe(e.gymA, e.socioA2MembresiaId)
    await cuotaDe(e.gymB, e.socioBMembresiaId)
  })

  it('el admin registra un pago a su nombre', async () => {
    const { error } = await e.comoAdminA.from('cuotas').insert(
      cuotaPara(e.gymA, e.socioAMembresiaId, { registrado_por: e.adminAMembresiaId }),
    )
    expect(error).toBeNull()
  })

  it('el admin no puede registrar un pago a nombre de otro empleado', async () => {
    const { error } = await e.comoAdminA.from('cuotas').insert(
      cuotaPara(e.gymA, e.socioAMembresiaId, { registrado_por: e.entrenadorAMembresiaId }),
    )
    expect(error).not.toBeNull()
  })

  it('el admin de A no puede registrar un pago en el gimnasio B', async () => {
    const { error } = await e.comoAdminA.from('cuotas').insert(
      cuotaPara(e.gymB, e.socioBMembresiaId, { registrado_por: e.adminAMembresiaId }),
    )
    expect(error).not.toBeNull()
  })

  it('el entrenador no puede registrar pagos', async () => {
    const { error } = await e.comoEntrenadorA.from('cuotas').insert(
      cuotaPara(e.gymA, e.socioAMembresiaId, { registrado_por: e.entrenadorAMembresiaId }),
    )
    expect(error).not.toBeNull()
  })

  it('el entrenador ve las cuotas de todo su gimnasio, para el escaneo', async () => {
    const { data } = await e.comoEntrenadorA.from('cuotas').select('membership_id')
    const socios = new Set(data!.map((c) => c.membership_id))
    expect(socios.has(e.socioAMembresiaId)).toBe(true)
    expect(socios.has(e.socioA2MembresiaId)).toBe(true)
    expect(socios.has(e.socioBMembresiaId)).toBe(false)
  })

  it('el socio ve solo las suyas', async () => {
    const { data } = await e.comoSocioA.from('cuotas').select('membership_id')
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((c) => c.membership_id === e.socioAMembresiaId)).toBe(true)
  })

  it('el socio no puede registrarse un pago', async () => {
    const { error } = await e.comoSocioA.from('cuotas').insert(cuotaPara(e.gymA, e.socioAMembresiaId))
    expect(error).not.toBeNull()
  })

  it('nadie edita un pago: se borra y se carga de nuevo', async () => {
    const { data } = await e.comoAdminA
      .from('cuotas').update({ monto: 1 }).eq('membership_id', e.socioAMembresiaId).select('id')
    expect(data).toEqual([])
  })

  it('el entrenador no puede borrar un pago', async () => {
    const id = await cuotaDe(e.gymA, e.socioA2MembresiaId)
    await e.comoEntrenadorA.from('cuotas').delete().eq('id', id)
    const { data } = await admin.from('cuotas').select('id').eq('id', id)
    expect(data).toHaveLength(1)
  })

  it('el admin sí puede borrar un pago mal cargado', async () => {
    const id = await cuotaDe(e.gymA, e.socioA2MembresiaId)
    const { data } = await e.comoAdminA.from('cuotas').delete().eq('id', id).select('id')
    expect(data).toHaveLength(1)
  })
})

describe('quién puede hacer qué con la asistencia', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
    await checkinDe(e.gymA, e.socioAMembresiaId)
    await checkinDe(e.gymA, e.socioA2MembresiaId)
    await checkinDe(e.gymB, e.socioBMembresiaId)
  })

  // Las entradas se crean solo con checkin_por_qr y checkin_manual (0018):
  // son las que calculan el día en la zona del gimnasio.
  it('nadie inserta un check-in directo, ni el admin', async () => {
    for (const cliente of [e.comoAdminA, e.comoEntrenadorA, e.comoSocioA]) {
      const { error } = await cliente
        .from('checkins')
        .insert({ gym_id: e.gymA, membership_id: e.socioAMembresiaId, metodo: 'manual', dia: '2026-10-20' })
      expect(error).not.toBeNull()
    }
  })

  it('el entrenador ve las entradas de todo su gimnasio y de ningún otro', async () => {
    const { data } = await e.comoEntrenadorA.from('checkins').select('membership_id')
    const socios = new Set(data!.map((c) => c.membership_id))
    expect(socios.has(e.socioAMembresiaId)).toBe(true)
    expect(socios.has(e.socioA2MembresiaId)).toBe(true)
    expect(socios.has(e.socioBMembresiaId)).toBe(false)
  })

  it('el socio ve solo las suyas', async () => {
    const { data } = await e.comoSocioA.from('checkins').select('membership_id')
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((c) => c.membership_id === e.socioAMembresiaId)).toBe(true)
  })

  it('nadie edita una entrada', async () => {
    const { data } = await e.comoAdminA
      .from('checkins').update({ metodo: 'qr' }).eq('membership_id', e.socioAMembresiaId).select('id')
    expect(data).toEqual([])
  })

  it('el entrenador no puede borrar una entrada', async () => {
    const id = await checkinDe(e.gymA, e.socioAMembresiaId, '2026-10-03')
    await e.comoEntrenadorA.from('checkins').delete().eq('id', id)
    const { data } = await admin.from('checkins').select('id').eq('id', id)
    expect(data).toHaveLength(1)
  })

  it('el admin sí puede borrar una entrada cargada por error', async () => {
    const id = await checkinDe(e.gymA, e.socioAMembresiaId, '2026-10-04')
    const { data } = await e.comoAdminA.from('checkins').delete().eq('id', id).select('id')
    expect(data).toHaveLength(1)
  })
})

describe('el código QR es solo de su dueño', () => {
  let e: Escenario
  let codigoA: string

  beforeAll(async () => {
    e = await crearEscenario()
    const { data } = await admin
      .from('memberships').select('codigo_qr').eq('id', e.socioAMembresiaId).single()
    codigoA = data!.codigo_qr
  })

  // Sin esto, memberships_leer le deja a cualquier socio leer las membresías
  // de todo su gimnasio con el código incluido, y generar el QR de otro.
  it('un socio no lee el código de otro socio de su gimnasio', async () => {
    const { data, error } = await e.comoSocioA2
      .from('memberships').select('codigo_qr').eq('id', e.socioAMembresiaId)
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('el admin tampoco lo lee: el panel no lo necesita', async () => {
    const { error } = await e.comoAdminA.from('memberships').select('codigo_qr').eq('gym_id', e.gymA)
    expect(error).not.toBeNull()
  })

  it('las demás columnas se siguen leyendo', async () => {
    const { data, error } = await e.comoSocioA
      .from('memberships').select('id, gym_id, rol, estado, foto').eq('id', e.socioAMembresiaId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('el socio obtiene el suyo con mi_codigo_qr', async () => {
    const { data, error } = await e.comoSocioA.rpc('mi_codigo_qr', { p_gym_id: e.gymA })
    expect(error).toBeNull()
    expect(data).toBe(codigoA)
  })

  it('mi_codigo_qr de un gimnasio ajeno devuelve null', async () => {
    const { data } = await e.comoSocioA.rpc('mi_codigo_qr', { p_gym_id: e.gymB })
    expect(data).toBeNull()
  })
})

describe('editar los datos de un socio', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
  })

  const editar = (cliente: Escenario['comoAdminA'], membershipId: string, nombre = 'Juana') =>
    cliente.rpc('editar_datos_socio', {
      p_membership_id: membershipId, p_nombre: nombre, p_apellido: 'Pérez', p_telefono: '1155550000',
    })

  it('el admin edita a un socio de su gimnasio', async () => {
    const { error } = await editar(e.comoAdminA, e.socioAMembresiaId)
    expect(error).toBeNull()
    const { data } = await admin
      .from('profiles').select('nombre, apellido, telefono').eq('id', e.socioAId).single()
    expect(data).toEqual({ nombre: 'Juana', apellido: 'Pérez', telefono: '1155550000' })
  })

  it('el entrenador no puede', async () => {
    const { error } = await editar(e.comoEntrenadorA, e.socioA2MembresiaId)
    expect(error?.code).toBe('42501')
  })

  it('el admin de A no alcanza a un socio de B', async () => {
    const { error } = await editar(e.comoAdminA, e.socioBMembresiaId)
    expect(error?.code).toBe('42501')
  })

  it('no deja un nombre vacío', async () => {
    const { error } = await editar(e.comoAdminA, e.socioAMembresiaId, '   ')
    expect(error?.code).toBe('22023')
  })
})

describe('el socio no toca su membresía', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
  })

  // memberships_editar (0002) ya es solo para el admin; esto lo fija para la
  // foto, que es lo que el check-in compara contra la cara.
  it('un socio no puede cambiar su foto', async () => {
    const { data } = await e.comoSocioA
      .from('memberships').update({ foto: 'otra.jpg' }).eq('id', e.socioAMembresiaId).select('id')
    expect(data).toEqual([])
  })

  it('el entrenador tampoco puede dar de baja', async () => {
    const { data } = await e.comoEntrenadorA
      .from('memberships').update({ estado: 'inactivo' }).eq('id', e.socioAMembresiaId).select('id')
    expect(data).toEqual([])
  })
})
```

- [ ] **Step 3: Correr los tests y ver que fallan**

Run: `npm run test:rls -- tests/rls/socios.test.ts`
Expected: FAIL. Entre otros: el entrenador y el socio pueden insertar cuotas (todavía no hay RLS), `mi_codigo_qr` no existe, `editar_datos_socio` no existe y el socio A2 lee el código del socio A.

- [ ] **Step 4: Escribir la migración**

Crear `supabase/migrations/0017_rls_socios.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Permisos de cuotas, asistencia y membresías (etapa 4).
--
-- Leer es como en el registro de entrenamiento: el socio lo suyo, el personal
-- lo de todo su gimnasio. El entrenador necesita leer cuotas para ver el
-- estado al escanear, aunque no pueda cobrar.
--
-- Escribir: las cuotas solo el admin. Los check-in NO tienen política de
-- insert: entran únicamente por checkin_por_qr y checkin_manual (0018), que
-- son las que calculan el día en la zona del gimnasio. Ninguna de las dos
-- tablas tiene política de update: un pago mal cargado se borra y se carga
-- de nuevo, y eso solo lo hace el admin.
-- ---------------------------------------------------------------------------

alter table cuotas   enable row level security;
alter table checkins enable row level security;

-- puedo_ver_sesion_fila (0012) es exactamente la regla de lectura que hace
-- falta acá: del propio gimnasio, y o es mío o soy personal. Se reusa en vez
-- de copiarla.
create policy cuotas_leer on cuotas for select
  using (puedo_ver_sesion_fila(gym_id, membership_id));

-- registrado_por = la membresía de quien carga: nadie registra un pago a
-- nombre de otro empleado.
create policy cuotas_crear on cuotas for insert
  with check (
    mi_rol(gym_id) = 'admin'
    and registrado_por = mi_membresia(gym_id)
  );

create policy cuotas_borrar on cuotas for delete
  using (mi_rol(gym_id) = 'admin');

create policy checkins_leer on checkins for select
  using (puedo_ver_sesion_fila(gym_id, membership_id));

create policy checkins_borrar on checkins for delete
  using (mi_rol(gym_id) = 'admin');

-- ---------------------------------------------------------------------------
-- El código QR solo lo lee su dueño.
--
-- memberships_leer (0002) deja ver todas las membresías del propio gimnasio:
-- el entrenador necesita la lista de socios. Pero con el código adentro,
-- cualquier socio podía leer el de otro y generarse su QR. RLS decide filas,
-- nunca columnas: la columna se cierra con grants, como es_superadmin en 0002.
-- Se revoca el grant de tabla primero, porque Postgres suma privilegios.
--
-- Una columna nueva en memberships NO se puede leer hasta agregarla acá.
-- ---------------------------------------------------------------------------
revoke select on public.memberships from anon, authenticated;
grant select (id, gym_id, user_id, rol, estado, fecha_alta, foto, created_at)
  on public.memberships to authenticated;

create or replace function public.mi_codigo_qr(p_gym_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select codigo_qr
  from public.memberships
  where user_id = (select auth.uid())
    and gym_id = p_gym_id
    and estado = 'activo'
$$;

-- ---------------------------------------------------------------------------
-- El admin edita nombre, apellido y teléfono de un socio de su gimnasio.
--
-- profiles_editar_el_mio (0002) solo deja editar el propio perfil, y abrirlo
-- con una política nueva dejaría al admin editar cualquier columna permitida
-- —avatar_url, fecha_nacimiento— de cualquiera que comparta gimnasio con él,
-- entrenadores incluidos. Una función acota exactamente qué cambia.
--
-- El perfil es uno por persona: el cambio se ve en todos sus gimnasios. Se
-- acepta, porque es la misma persona en todos lados.
-- ---------------------------------------------------------------------------
create or replace function public.editar_datos_socio(
  p_membership_id uuid,
  p_nombre        text,
  p_apellido      text,
  p_telefono      text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select m.user_id into v_user
  from public.memberships m
  where m.id = p_membership_id
    and public.mi_rol(m.gym_id) = 'admin';

  if v_user is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre' using errcode = '22023';
  end if;

  update public.profiles
  set nombre   = trim(p_nombre),
      apellido = trim(coalesce(p_apellido, '')),
      telefono = nullif(trim(coalesce(p_telefono, '')), '')
  where id = v_user;
end;
$$;

revoke execute on function public.mi_codigo_qr(uuid) from anon;
revoke execute on function public.editar_datos_socio(uuid, text, text, text) from anon;
```

- [ ] **Step 5: Aplicar y regenerar los tipos**

Run: `npx supabase db reset` y después `npm run db:tipos`
Expected: sin errores; `tipos-db.ts` tiene `mi_codigo_qr` y `editar_datos_socio` en `Functions`.

- [ ] **Step 6: Correr los tests y ver que pasan**

Run: `npm run test:rls`
Expected: PASS, toda la suite. Si algún test anterior falla con `permission denied for table memberships`, es otro `.select()` sin columnas sobre `memberships`: cambiarlo por las columnas que usa, como en el step 1.

- [ ] **Step 7: Verificar que las apps no leen columnas cerradas**

Run: `npx tsc --noEmit` en `apps/panel` y en `apps/movil`, y buscar con Grep `from('memberships')` en `apps/`. Ninguna consulta pide `codigo_qr` ni `*`.
Expected: sin errores; ninguna coincidencia problemática.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0017_rls_socios.sql tests/rls/socios.test.ts tests/rls/identidad.test.ts packages/core/src/tipos-db.ts
git commit -m "Restringir cuotas y asistencia por rol y cerrar el código QR

El entrenador lee las cuotas para ver el estado al escanear pero no
cobra. El código QR deja de ser legible para el resto del gimnasio:
con él cualquier socio podía generarse el QR de otro.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 3: Las funciones de check-in

**Files:**
- Create: `supabase/migrations/0018_checkin.sql`
- Modify: `tests/rls/socios.test.ts`
- Modify: `packages/core/src/tipos-db.ts` (regenerado)

**Interfaces:**
- Consumes: tablas de la tarea 1; `mi_rol`, `mi_membresia`.
- Produces: RPC `checkin_por_qr(p_codigo text) returns jsonb` y RPC `checkin_manual(p_membership_id uuid) returns jsonb`. Las dos devuelven, si el código o la membresía no son válidos para quien llama, `{ "valido": false }`; si lo son:

```json
{
  "valido": true,
  "membership_id": "uuid",
  "nombre": "Juan",
  "apellido": "Pérez",
  "foto": "gym/membresia.jpg | null",
  "nuevo": true,
  "hora_entrada": "2026-10-09T21:40:00.123+00:00",
  "hoy": "2026-10-09",
  "cuotas": [{ "periodo_desde": "2026-10-15", "periodo_hasta": "2026-11-15" }]
}
```

- [ ] **Step 1: Escribir los tests**

En `tests/rls/socios.test.ts`, debajo del último `describe` y antes del `export`, agregar:

```ts
/** La fecha de hoy en una zona horaria, como 'AAAA-MM-DD'. */
const hoyEn = (zona: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())

async function codigoDe(membershipId: string): Promise<string> {
  const { data, error } = await admin.from('memberships').select('codigo_qr').eq('id', membershipId).single()
  if (error) throw error
  return data.codigo_qr
}

describe('check-in con QR', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
    await cuotaDe(e.gymA, e.socioAMembresiaId, { periodo_desde: '2026-10-15', periodo_hasta: '2026-11-15' })
  })

  it('el entrenador escanea a un socio de su gimnasio y queda la entrada', async () => {
    const { data, error } = await e.comoEntrenadorA.rpc('checkin_por_qr', {
      p_codigo: await codigoDe(e.socioAMembresiaId),
    })
    expect(error).toBeNull()
    expect(data).toMatchObject({
      valido: true,
      membership_id: e.socioAMembresiaId,
      nuevo: true,
      hoy: hoyEn('America/Argentina/Buenos_Aires'),
      cuotas: [{ periodo_desde: '2026-10-15', periodo_hasta: '2026-11-15' }],
    })

    const { data: filas } = await admin
      .from('checkins').select('metodo, registrado_por').eq('membership_id', e.socioAMembresiaId)
    expect(filas).toEqual([{ metodo: 'qr', registrado_por: e.entrenadorAMembresiaId }])
  })

  it('un segundo escaneo el mismo día no duplica y devuelve la hora de la primera', async () => {
    const codigo = await codigoDe(e.socioAMembresiaId)
    const primera = await e.comoEntrenadorA.rpc('checkin_por_qr', { p_codigo: codigo })
    const segunda = await e.comoAdminA.rpc('checkin_por_qr', { p_codigo: codigo })
    expect(segunda.data).toMatchObject({ valido: true, nuevo: false })
    expect((segunda.data as { hora_entrada: string }).hora_entrada)
      .toBe((primera.data as { hora_entrada: string }).hora_entrada)

    const { count } = await admin
      .from('checkins').select('id', { count: 'exact', head: true }).eq('membership_id', e.socioAMembresiaId)
    expect(count).toBe(1)
  })

  it('el código de un socio de otro gimnasio no es válido y no deja rastro', async () => {
    const { data } = await e.comoAdminA.rpc('checkin_por_qr', { p_codigo: await codigoDe(e.socioBMembresiaId) })
    expect(data).toEqual({ valido: false })
    const { count } = await admin
      .from('checkins').select('id', { count: 'exact', head: true }).eq('membership_id', e.socioBMembresiaId)
    expect(count).toBe(0)
  })

  it('un código inexistente no es válido', async () => {
    const { data } = await e.comoAdminA.rpc('checkin_por_qr', { p_codigo: '0'.repeat(32) })
    expect(data).toEqual({ valido: false })
  })

  it('un socio no puede hacerle el check-in a otro', async () => {
    const { data } = await e.comoSocioA.rpc('checkin_por_qr', { p_codigo: await codigoDe(e.socioA2MembresiaId) })
    expect(data).toEqual({ valido: false })
  })

  it('una membresía dada de baja no es válida', async () => {
    await admin.from('memberships').update({ estado: 'inactivo' }).eq('id', e.socioA2MembresiaId)
    const { data } = await e.comoAdminA.rpc('checkin_por_qr', { p_codigo: await codigoDe(e.socioA2MembresiaId) })
    await admin.from('memberships').update({ estado: 'activo' }).eq('id', e.socioA2MembresiaId)
    expect(data).toEqual({ valido: false })
  })

  it('el check-in manual queda marcado como manual', async () => {
    const { data } = await e.comoEntrenadorA.rpc('checkin_manual', { p_membership_id: e.socioA2MembresiaId })
    expect(data).toMatchObject({ valido: true, nuevo: true, membership_id: e.socioA2MembresiaId })
    const { data: filas } = await admin
      .from('checkins').select('metodo').eq('membership_id', e.socioA2MembresiaId)
    expect(filas).toEqual([{ metodo: 'manual' }])
  })

  it('el check-in manual de un socio de otro gimnasio no es válido', async () => {
    const { data } = await e.comoAdminA.rpc('checkin_manual', { p_membership_id: e.socioBMembresiaId })
    expect(data).toEqual({ valido: false })
  })

  it('la función interna no se puede llamar desde afuera', async () => {
    const { error } = await e.comoAdminA.rpc('registrar_checkin', {
      p_membership_id: e.socioAMembresiaId, p_metodo: 'manual',
    } as never)
    expect(error).not.toBeNull()
  })
})

// A cualquier hora del día, al menos una de estas dos zonas —UTC+14 y UTC−11—
// está en una fecha distinta de la de UTC. Si el día se calculara en UTC, uno
// de los dos tests falla siempre.
describe('el día del check-in es el del gimnasio', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
  })

  for (const [zona, membresia] of [
    ['Pacific/Kiritimati', 'socioAMembresiaId'],
    ['Pacific/Pago_Pago', 'socioA2MembresiaId'],
  ] as const) {
    it(`en ${zona}`, async () => {
      await admin.from('gyms').update({ zona_horaria: zona }).eq('id', e.gymA)
      const { data } = await e.comoAdminA.rpc('checkin_manual', { p_membership_id: e[membresia] })
      expect((data as { hoy: string }).hoy).toBe(hoyEn(zona))
      const { data: fila } = await admin.from('checkins').select('dia').eq('membership_id', e[membresia]).single()
      expect(fila!.dia).toBe(hoyEn(zona))
    })
  }
})
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npm run test:rls -- tests/rls/socios.test.ts`
Expected: FAIL — `Could not find the function public.checkin_por_qr`.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/0018_checkin.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Check-in: la única puerta de entrada a la tabla checkins.
--
-- El panel no busca el código con un select: llama a checkin_por_qr. Así un
-- código de otro gimnasio no se distingue de uno inexistente —los dos
-- devuelven { valido: false }—, y la respuesta trae en un solo viaje lo que
-- la tarjeta del escaneo muestra: nombre, foto, si la entrada es nueva y las
-- cuotas para calcular el estado. Ver la sección 1 del diseño de la etapa 4.
--
-- Con la cuota vencida la entrada se registra igual: la asistencia refleja
-- lo que pasó, y la conversación de la plata la maneja una persona.
-- ---------------------------------------------------------------------------

-- Interna. La comparten las dos de abajo para que la respuesta sea idéntica.
-- No se puede llamar desde afuera: no verifica de dónde salió el id.
create or replace function public.registrar_checkin(
  p_membership_id uuid,
  p_metodo        public.metodo_checkin
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m        public.memberships%rowtype;
  v_zona     text;
  v_hoy      date;
  v_hora     timestamptz;
  v_nuevo    boolean;
  v_nombre   text;
  v_apellido text;
begin
  select * into v_m
  from public.memberships
  where id = p_membership_id and estado = 'activo';

  -- El coalesce no es decorativo: mi_rol devuelve null para quien no es del
  -- gimnasio, y `null in (...)` es null, que el if trataría como "no falla".
  if not found
     or not coalesce(public.mi_rol(v_m.gym_id) in ('entrenador', 'admin'), false) then
    return jsonb_build_object('valido', false);
  end if;

  select zona_horaria into v_zona from public.gyms where id = v_m.gym_id;
  v_hoy := (now() at time zone v_zona)::date;

  insert into public.checkins (gym_id, membership_id, registrado_por, metodo, dia)
  values (v_m.gym_id, v_m.id, public.mi_membresia(v_m.gym_id), p_metodo, v_hoy)
  on conflict (membership_id, dia) do nothing
  returning created_at into v_hora;

  v_nuevo := v_hora is not null;
  if not v_nuevo then
    select created_at into v_hora
    from public.checkins
    where membership_id = v_m.id and dia = v_hoy;
  end if;

  select nombre, apellido into v_nombre, v_apellido
  from public.profiles
  where id = v_m.user_id;

  return jsonb_build_object(
    'valido',        true,
    'membership_id', v_m.id,
    'nombre',        v_nombre,
    'apellido',      v_apellido,
    'foto',          v_m.foto,
    'nuevo',         v_nuevo,
    'hora_entrada',  v_hora,
    'hoy',           v_hoy,
    'cuotas',        coalesce(
      (select jsonb_agg(jsonb_build_object(
                'periodo_desde', c.periodo_desde,
                'periodo_hasta', c.periodo_hasta))
       from public.cuotas c
       where c.membership_id = v_m.id),
      '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.registrar_checkin(uuid, public.metodo_checkin)
  from public, anon, authenticated;

create or replace function public.checkin_por_qr(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.memberships where codigo_qr = p_codigo;
  if v_id is null then
    return jsonb_build_object('valido', false);
  end if;
  return public.registrar_checkin(v_id, 'qr');
end;
$$;

create or replace function public.checkin_manual(p_membership_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.registrar_checkin(p_membership_id, 'manual')
$$;

revoke execute on function public.checkin_por_qr(text) from anon;
revoke execute on function public.checkin_manual(uuid) from anon;
```

- [ ] **Step 4: Aplicar y regenerar los tipos**

Run: `npx supabase db reset` y después `npm run db:tipos`
Expected: sin errores; `checkin_por_qr` y `checkin_manual` en `Functions`, y **no** `registrar_checkin` con permisos para `authenticated` (aparece en los tipos igual; lo que importa es el test).

- [ ] **Step 5: Correr los tests y ver que pasan**

Run: `npm run test:rls`
Expected: PASS, toda la suite.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0018_checkin.sql tests/rls/socios.test.ts packages/core/src/tipos-db.ts
git commit -m "Registrar el check-in por QR o a mano con una sola función

La función decide el día en la zona del gimnasio y no duplica la
entrada, y un código ajeno no se distingue de uno inexistente. Trae en
la misma respuesta lo que la tarjeta del escaneo necesita mostrar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 4: Las fotos de los socios

**Files:**
- Create: `supabase/migrations/0019_fotos_socios.sql`
- Create: `supabase/migrations/0020_alta_socios.sql`
- Modify: `tests/rls/socios.test.ts`
- Modify: `packages/core/src/tipos-db.ts` (regenerado)

**Interfaces:**
- Produces: bucket privado `fotos-socios` (5 MiB, solo `image/jpeg`). Ruta de cada foto: `<gym_id>/<membership_id>.jpg`. Lee el personal del gimnasio y el propio socio; sube, reemplaza y borra solo el admin.
- Produces: RPC `usuario_por_email(p_email text) returns uuid`, ejecutable solo por `service_role`. Compara sin mayúsculas ni espacios.

- [ ] **Step 1: Escribir los tests**

En `tests/rls/socios.test.ts`, agregar `afterAll` al import de vitest:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
```

Y debajo del último `describe`, antes del `export`:

```ts
describe('el bucket de fotos aísla por gimnasio', () => {
  let e: Escenario
  let rutaA: string
  const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' })
  const subir = (cliente: Escenario['comoAdminA'], ruta: string) =>
    cliente.storage.from('fotos-socios').upload(ruta, jpeg(), { contentType: 'image/jpeg', upsert: true })

  beforeAll(async () => {
    e = await crearEscenario()
    rutaA = `${e.gymA}/${e.socioAMembresiaId}.jpg`
  })

  // El bucket es compartido por todas las corridas: lo que se sube se borra.
  afterAll(async () => {
    await admin.storage.from('fotos-socios').remove([rutaA])
  })

  it('el admin sube la foto de un socio de su gimnasio', async () => {
    const { error } = await subir(e.comoAdminA, rutaA)
    expect(error).toBeNull()
  })

  it('el admin la reemplaza', async () => {
    const { error } = await subir(e.comoAdminA, rutaA)
    expect(error).toBeNull()
  })

  it('el entrenador no puede subir fotos', async () => {
    const { error } = await subir(e.comoEntrenadorA, `${e.gymA}/${e.socioA2MembresiaId}.jpg`)
    expect(error).not.toBeNull()
  })

  it('el admin de A no puede subir en la carpeta de B', async () => {
    const { error } = await subir(e.comoAdminA, `${e.gymB}/${e.socioBMembresiaId}.jpg`)
    expect(error).not.toBeNull()
  })

  it('la ruta tiene que ser la de una membresía real del gimnasio', async () => {
    const { error } = await subir(e.comoAdminA, `${e.gymA}/${crypto.randomUUID()}.jpg`)
    expect(error).not.toBeNull()
  })

  it('el bucket solo acepta JPEG', async () => {
    const { error } = await e.comoAdminA.storage.from('fotos-socios').upload(
      `${e.gymA}/${e.socioA2MembresiaId}.jpg`,
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
      { contentType: 'image/png', upsert: true },
    )
    expect(error).not.toBeNull()
  })

  it('el entrenador ve la foto: la necesita al escanear', async () => {
    const { error } = await e.comoEntrenadorA.storage.from('fotos-socios').download(rutaA)
    expect(error).toBeNull()
  })

  it('el socio ve la suya', async () => {
    const { error } = await e.comoSocioA.storage.from('fotos-socios').download(rutaA)
    expect(error).toBeNull()
  })

  it('otro socio del mismo gimnasio no la ve', async () => {
    const { error } = await e.comoSocioA2.storage.from('fotos-socios').download(rutaA)
    expect(error).not.toBeNull()
  })

  it('alguien de otro gimnasio no la ve', async () => {
    const { error } = await e.comoSocioB.storage.from('fotos-socios').download(rutaA)
    expect(error).not.toBeNull()
  })
})

describe('usuario_por_email es solo para la función de alta', () => {
  let e: Escenario

  beforeAll(async () => {
    e = await crearEscenario()
  })

  it('un usuario autenticado no la puede llamar', async () => {
    const { error } = await e.comoAdminA.rpc('usuario_por_email', { p_email: 'x@ejemplo.com' })
    expect(error).not.toBeNull()
  })

  it('service_role encuentra la cuenta sin importar mayúsculas ni espacios', async () => {
    const { data: usuario } = await admin.auth.admin.getUserById(e.socioAId)
    const email = usuario.user!.email!
    const { data, error } = await admin.rpc('usuario_por_email', { p_email: `  ${email.toUpperCase()} ` })
    expect(error).toBeNull()
    expect(data).toBe(e.socioAId)
  })

  it('un email sin cuenta devuelve null', async () => {
    const { data } = await admin.rpc('usuario_por_email', { p_email: 'nadie-tiene-esto@ejemplo.com' })
    expect(data).toBeNull()
  })
})
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npm run test:rls -- tests/rls/socios.test.ts`
Expected: FAIL — `Bucket not found` y `Could not find the function public.usuario_por_email`.

- [ ] **Step 3: Escribir la migración del bucket**

Crear `supabase/migrations/0019_fotos_socios.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Las fotos de verificación de los socios.
--
-- Privado, como el de videos, pero a diferencia de él SÍ tiene políticas: el
-- panel sube directo desde el navegador del admin y pide URLs firmadas con la
-- sesión de quien mira. No hace falta una Edge Function en el medio.
--
-- La ruta es <gym_id>/<membership_id>.jpg, y las políticas exigen que
-- corresponda a una membresía real: no se puede subir un archivo cualquiera
-- en la carpeta del gimnasio, ni en la de otro.
--
-- Solo JPEG y hasta 5 MiB: el panel reduce la foto antes de subirla, y esto
-- es la segunda línea de defensa si esa reducción no corre.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-socios', 'fotos-socios', false, 5242880, array['image/jpeg']);

-- La ve el personal del gimnasio, para el escaneo, y el propio socio.
create or replace function public.puedo_ver_foto(p_ruta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where p_ruta = m.gym_id::text || '/' || m.id::text || '.jpg'
      and (
        public.mi_rol(m.gym_id) in ('entrenador', 'admin')
        or m.id = public.mi_membresia(m.gym_id)
      )
  )
$$;

-- La sube, la reemplaza o la borra solo el admin: es lo que el check-in
-- compara contra la cara.
create or replace function public.puedo_subir_foto(p_ruta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where p_ruta = m.gym_id::text || '/' || m.id::text || '.jpg'
      and public.mi_rol(m.gym_id) = 'admin'
  )
$$;

create policy fotos_socios_leer on storage.objects for select to authenticated
  using (bucket_id = 'fotos-socios' and public.puedo_ver_foto(name));

create policy fotos_socios_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-socios' and public.puedo_subir_foto(name));

-- upsert: true reemplaza el objeto, y eso es un update.
create policy fotos_socios_reemplazar on storage.objects for update to authenticated
  using (bucket_id = 'fotos-socios' and public.puedo_subir_foto(name))
  with check (bucket_id = 'fotos-socios' and public.puedo_subir_foto(name));

create policy fotos_socios_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-socios' and public.puedo_subir_foto(name));
```

- [ ] **Step 4: Escribir la migración de la búsqueda por email**

Crear `supabase/migrations/0020_alta_socios.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Para la Edge Function socio-alta: saber si un email ya tiene cuenta.
--
-- La API de administración de Auth no busca por email —solo lista de a
-- páginas—, y recorrer todos los usuarios en cada alta no escala. Esta
-- función lee auth.users, así que NADIE más que service_role la puede
-- ejecutar: con ella cualquiera podría averiguar qué emails están
-- registrados en la plataforma.
-- ---------------------------------------------------------------------------
create or replace function public.usuario_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1
$$;

revoke execute on function public.usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.usuario_por_email(text) to service_role;
```

- [ ] **Step 5: Aplicar y regenerar los tipos**

Run: `npx supabase db reset` y después `npm run db:tipos`
Expected: sin errores.

- [ ] **Step 6: Correr los tests y ver que pasan**

Run: `npm run test:rls`
Expected: PASS, toda la suite, incluido `storage-videos.test.ts`: las políticas nuevas están acotadas a `bucket_id = 'fotos-socios'` y no abren el de videos.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0019_fotos_socios.sql supabase/migrations/0020_alta_socios.sql tests/rls/socios.test.ts packages/core/src/tipos-db.ts
git commit -m "Guardar las fotos de los socios en un bucket privado por gimnasio

La foto es lo que el empleado compara contra la cara al escanear: la
sube solo el admin y la ve el personal y el propio socio. La búsqueda
de cuentas por email queda solo para la función de alta, porque
revela qué emails están registrados.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 5: El estado de la cuota en `@gym/core`

**Files:**
- Create: `packages/core/src/cuotas.ts`
- Create: `packages/core/tests/cuotas.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces (exportado desde `@gym/core`):
  - `type Fecha = string` — `'AAAA-MM-DD'`.
  - `interface PeriodoCuota { periodo_desde: Fecha; periodo_hasta: Fecha }`
  - `type EstadoCuota = { tipo: 'vigente'; hasta: Fecha } | { tipo: 'vencida'; desde: Fecha; dias: number } | { tipo: 'empieza'; desde: Fecha } | { tipo: 'sin_pagos' }` — `hasta` es el último día cubierto; `desde` de `vencida` es el primer día sin cubrir.
  - `estadoCuota(cuotas: readonly PeriodoCuota[], hoy: Fecha): EstadoCuota`
  - `textoEstadoCuota(estado: EstadoCuota): string`
  - `estaAlDia(estado: EstadoCuota): boolean` — `true` solo para `vigente`.
  - `periodoPropuesto(cuotas: readonly PeriodoCuota[], hoy: Fecha): PeriodoCuota`
  - `montoPropuesto(cuotas: readonly { monto: number; fecha_pago: Fecha; created_at: string }[]): number | null`
  - `validarPago(pago: { periodo_desde: Fecha; periodo_hasta: Fecha; monto: number }): string | null`
  - `textoPeriodo(cuota: PeriodoCuota): string` — `'15/10 al 14/11'`.
  - `formatearFecha(fecha: Fecha, conAnio?: boolean): string` — `'14/11'` o `'14/11/2026'`.
  - `hoyEnZona(zona: string, ahora?: Date): Fecha`
  - `sumarDias(fecha: Fecha, dias: number): Fecha`, `sumarMes(fecha: Fecha): Fecha`, `diasEntre(desde: Fecha, hasta: Fecha): number`, `primerDiaDelMes(fecha: Fecha): Fecha`
  - `METODOS_PAGO: readonly ['efectivo', 'transferencia', 'otro']`, `type MetodoPago`, `ETIQUETA_METODO_PAGO: Record<MetodoPago, string>`

- [ ] **Step 1: Escribir los tests**

Crear `packages/core/tests/cuotas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  diasEntre, estadoCuota, estaAlDia, formatearFecha, hoyEnZona, montoPropuesto, periodoPropuesto,
  primerDiaDelMes, sumarDias, sumarMes, textoEstadoCuota, textoPeriodo, validarPago,
} from '../src/cuotas'

const cuota = (periodo_desde: string, periodo_hasta: string) => ({ periodo_desde, periodo_hasta })

describe('fechas sin hora', () => {
  it('suma días cruzando meses y años', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(sumarDias('2026-11-15', -1)).toBe('2026-11-14')
  })

  it('cuenta días entre dos fechas', () => {
    expect(diasEntre('2026-10-01', '2026-10-13')).toBe(12)
    expect(diasEntre('2026-10-13', '2026-10-13')).toBe(0)
  })

  // Contar en UTC evita que un día de cambio de horario dure 23 horas y la
  // cuenta dé 30,96.
  it('no se corre con el horario de verano', () => {
    expect(diasEntre('2026-03-01', '2026-04-01')).toBe(31)
  })

  it('un mes después es el mismo día del mes siguiente', () => {
    expect(sumarMes('2026-10-15')).toBe('2026-11-15')
    expect(sumarMes('2026-12-15')).toBe('2027-01-15')
  })

  it('si ese día no existe, el último del mes', () => {
    expect(sumarMes('2026-01-31')).toBe('2026-02-28')
    expect(sumarMes('2028-01-31')).toBe('2028-02-29')
    expect(sumarMes('2026-03-31')).toBe('2026-04-30')
  })

  it('el primer día del mes', () => {
    expect(primerDiaDelMes('2026-10-27')).toBe('2026-10-01')
  })

  it('formatea como se lee acá', () => {
    expect(formatearFecha('2026-11-04')).toBe('04/11')
    expect(formatearFecha('2026-11-04', true)).toBe('04/11/2026')
  })
})

describe('hoyEnZona', () => {
  // 02:30 UTC del 10/10 son las 23:30 del 9/10 en Buenos Aires: la entrada de
  // esa hora es del 9.
  it('usa la fecha de la zona, no la de UTC', () => {
    const ahora = new Date('2026-10-10T02:30:00Z')
    expect(hoyEnZona('America/Argentina/Buenos_Aires', ahora)).toBe('2026-10-09')
    expect(hoyEnZona('UTC', ahora)).toBe('2026-10-10')
  })
})

describe('estadoCuota', () => {
  it('sin cuotas: sin pagos', () => {
    expect(estadoCuota([], '2026-10-20')).toEqual({ tipo: 'sin_pagos' })
  })

  it('vigente muestra el último día cubierto, no el del vencimiento', () => {
    expect(estadoCuota([cuota('2026-10-15', '2026-11-15')], '2026-10-20'))
      .toEqual({ tipo: 'vigente', hasta: '2026-11-14' })
  })

  it('el primer día del período ya está cubierto', () => {
    expect(estadoCuota([cuota('2026-10-15', '2026-11-15')], '2026-10-15').tipo).toBe('vigente')
  })

  it('el día del vencimiento ya no está cubierto', () => {
    expect(estadoCuota([cuota('2026-10-15', '2026-11-15')], '2026-11-15'))
      .toEqual({ tipo: 'vencida', desde: '2026-11-15', dias: 0 })
  })

  it('vencida cuenta los días desde el vencimiento', () => {
    expect(estadoCuota([cuota('2026-09-15', '2026-10-15')], '2026-10-27'))
      .toEqual({ tipo: 'vencida', desde: '2026-10-15', dias: 12 })
  })

  it('vencida toma el vencimiento más reciente', () => {
    const cuotas = [cuota('2026-08-15', '2026-09-15'), cuota('2026-09-15', '2026-10-15')]
    expect(estadoCuota(cuotas, '2026-10-20')).toMatchObject({ desde: '2026-10-15', dias: 5 })
  })

  // Review Focus 1: el que pagó dos meses tiene que verse al día hasta el
  // final del segundo, no del primero.
  it('encadena las cuotas pagadas por adelantado', () => {
    const cuotas = [cuota('2026-11-15', '2026-12-15'), cuota('2026-10-15', '2026-11-15')]
    expect(estadoCuota(cuotas, '2026-10-20')).toEqual({ tipo: 'vigente', hasta: '2026-12-14' })
  })

  it('no encadena si queda un hueco', () => {
    const cuotas = [cuota('2026-10-15', '2026-11-15'), cuota('2026-11-20', '2026-12-20')]
    expect(estadoCuota(cuotas, '2026-10-20')).toEqual({ tipo: 'vigente', hasta: '2026-11-14' })
  })

  it('una cuota que todavía no empezó, sin nada antes', () => {
    expect(estadoCuota([cuota('2026-11-01', '2026-12-01')], '2026-10-20'))
      .toEqual({ tipo: 'empieza', desde: '2026-11-01' })
  })

  it('una cuota futura no tapa una vencida', () => {
    const cuotas = [cuota('2026-09-01', '2026-10-01'), cuota('2026-11-01', '2026-12-01')]
    expect(estadoCuota(cuotas, '2026-10-20').tipo).toBe('vencida')
  })
})

describe('textoEstadoCuota', () => {
  it('cada caso, como lo lee el socio', () => {
    expect(textoEstadoCuota({ tipo: 'vigente', hasta: '2026-11-14' })).toBe('Vigente hasta el 14/11')
    expect(textoEstadoCuota({ tipo: 'vencida', desde: '2026-11-15', dias: 0 })).toBe('Venció hoy')
    expect(textoEstadoCuota({ tipo: 'vencida', desde: '2026-11-15', dias: 1 })).toBe('Vencida hace 1 día')
    expect(textoEstadoCuota({ tipo: 'vencida', desde: '2026-11-15', dias: 12 })).toBe('Vencida hace 12 días')
    expect(textoEstadoCuota({ tipo: 'empieza', desde: '2026-11-01' })).toBe('Empieza el 01/11')
    expect(textoEstadoCuota({ tipo: 'sin_pagos' })).toBe('Sin pagos registrados')
  })

  it('solo vigente está al día', () => {
    expect(estaAlDia({ tipo: 'vigente', hasta: '2026-11-14' })).toBe(true)
    expect(estaAlDia({ tipo: 'empieza', desde: '2026-11-01' })).toBe(false)
    expect(estaAlDia({ tipo: 'sin_pagos' })).toBe(false)
  })
})

describe('periodoPropuesto', () => {
  it('el primer pago arranca hoy y dura un mes', () => {
    expect(periodoPropuesto([], '2026-10-09')).toEqual(cuota('2026-10-09', '2026-11-09'))
  })

  // La regla acordada: desde el vencimiento anterior aunque pague tarde.
  it('el que paga atrasado sigue desde su vencimiento', () => {
    expect(periodoPropuesto([cuota('2026-09-15', '2026-10-15')], '2026-10-27'))
      .toEqual(cuota('2026-10-15', '2026-11-15'))
  })

  it('el que paga adelantado se encadena al final', () => {
    expect(periodoPropuesto([cuota('2026-10-15', '2026-11-15')], '2026-11-10'))
      .toEqual(cuota('2026-11-15', '2026-12-15'))
  })

  it('toma el vencimiento más tardío, no el último cargado', () => {
    const cuotas = [cuota('2026-11-15', '2026-12-15'), cuota('2026-10-15', '2026-11-15')]
    expect(periodoPropuesto(cuotas, '2026-11-10').periodo_desde).toBe('2026-12-15')
  })

  it('a fin de mes, el último día del mes siguiente', () => {
    expect(periodoPropuesto([cuota('2025-12-31', '2026-01-31')], '2026-01-31'))
      .toEqual(cuota('2026-01-31', '2026-02-28'))
  })
})

describe('montoPropuesto', () => {
  it('sin pagos, nada', () => {
    expect(montoPropuesto([])).toBeNull()
  })

  it('el del pago más reciente', () => {
    expect(montoPropuesto([
      { monto: 20000, fecha_pago: '2026-09-15', created_at: '2026-09-15T10:00:00Z' },
      { monto: 25000, fecha_pago: '2026-10-15', created_at: '2026-10-15T10:00:00Z' },
    ])).toBe(25000)
  })

  it('dos pagos el mismo día: el último cargado', () => {
    expect(montoPropuesto([
      { monto: 25000, fecha_pago: '2026-10-15', created_at: '2026-10-15T12:00:00Z' },
      { monto: 20000, fecha_pago: '2026-10-15', created_at: '2026-10-15T10:00:00Z' },
    ])).toBe(25000)
  })
})

describe('validarPago', () => {
  const bien = { periodo_desde: '2026-10-15', periodo_hasta: '2026-11-15', monto: 25000 }

  it('un pago normal está bien', () => {
    expect(validarPago(bien)).toBeNull()
  })

  it('cero está bien: una beca', () => {
    expect(validarPago({ ...bien, monto: 0 })).toBeNull()
  })

  it('exige el monto', () => {
    expect(validarPago({ ...bien, monto: NaN })).toBe('Poné el monto')
  })

  it('no acepta un monto negativo', () => {
    expect(validarPago({ ...bien, monto: -1 })).toBe('El monto no puede ser negativo')
  })

  it('exige las dos fechas', () => {
    expect(validarPago({ ...bien, periodo_hasta: '' })).toBe('Completá las fechas')
  })

  it('el vencimiento tiene que ser posterior al inicio', () => {
    expect(validarPago({ ...bien, periodo_hasta: '2026-10-15' }))
      .toBe('El vencimiento tiene que ser después del inicio')
  })
})

describe('textoPeriodo', () => {
  it('muestra el último día cubierto', () => {
    expect(textoPeriodo(cuota('2026-10-15', '2026-11-15'))).toBe('15/10 al 14/11')
  })
})
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npm run test:core -- cuotas`
Expected: FAIL — `Failed to resolve import "../src/cuotas"`.

- [ ] **Step 3: Escribir el módulo**

Crear `packages/core/src/cuotas.ts`:

```ts
/**
 * Cuotas: fechas sin hora, el estado de la cuota y lo que el panel propone al
 * registrar un pago. Ver la sección 2 del diseño de la etapa 4.
 *
 * Las fechas son texto 'AAAA-MM-DD', como devuelve Postgres una columna
 * `date`. Se comparan como texto —en ese formato el orden alfabético es el
 * cronológico— y las cuentas se hacen en UTC, donde todos los días duran 24
 * horas.
 *
 * `periodo_hasta` es el primer día SIN cobertura: una cuota del 15/10 al
 * 15/11 cubre hasta el 14/11. Todo lo que se le muestra a una persona dice el
 * último día cubierto.
 */

export type Fecha = string

export interface PeriodoCuota {
  periodo_desde: Fecha
  periodo_hasta: Fecha
}

export type EstadoCuota =
  | { tipo: 'vigente'; hasta: Fecha }
  | { tipo: 'vencida'; desde: Fecha; dias: number }
  | { tipo: 'empieza'; desde: Fecha }
  | { tipo: 'sin_pagos' }

export const METODOS_PAGO = ['efectivo', 'transferencia', 'otro'] as const
export type MetodoPago = (typeof METODOS_PAGO)[number]

export const ETIQUETA_METODO_PAGO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  otro: 'Otro',
}

const MS_DIA = 86_400_000

// Los valores por defecto están por noUncheckedIndexedAccess: una fecha bien
// formada siempre tiene las tres partes.
function aUtc(fecha: Fecha): number {
  const [anio = 0, mes = 1, dia = 1] = fecha.split('-').map(Number)
  return Date.UTC(anio, mes - 1, dia)
}

const deUtc = (ms: number): Fecha => new Date(ms).toISOString().slice(0, 10)

export function sumarDias(fecha: Fecha, dias: number): Fecha {
  return deUtc(aUtc(fecha) + dias * MS_DIA)
}

export function diasEntre(desde: Fecha, hasta: Fecha): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_DIA)
}

/** El mismo día del mes siguiente; si no existe (31/01), el último del mes. */
export function sumarMes(fecha: Fecha): Fecha {
  const [anio = 0, mes = 1, dia = 1] = fecha.split('-').map(Number)
  // `mes` es 1-12 y Date.UTC cuenta 0-11: (anio, mes + 1, 0) es el día 0 del
  // mes que sigue al siguiente, o sea el último día del siguiente.
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
  return deUtc(Date.UTC(anio, mes, Math.min(dia, ultimo)))
}

export function primerDiaDelMes(fecha: Fecha): Fecha {
  return `${fecha.slice(0, 8)}01`
}

/**
 * La fecha de hoy en la zona del gimnasio. El panel puede correr en un
 * servidor en UTC, y una entrada a las 23:30 en Buenos Aires es de ese día.
 */
export function hoyEnZona(zona: string, ahora: Date = new Date()): Fecha {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(ahora)
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return `${parte('year')}-${parte('month')}-${parte('day')}`
}

/** '04/11', o '04/11/2026' con el año. */
export function formatearFecha(fecha: Fecha, conAnio = false): string {
  const [anio = '', mes = '', dia = ''] = fecha.split('-')
  return conAnio ? `${dia}/${mes}/${anio}` : `${dia}/${mes}`
}

const masTardia = (fechas: Fecha[]): Fecha => fechas.reduce((a, b) => (b > a ? b : a))

export function estadoCuota(cuotas: readonly PeriodoCuota[], hoy: Fecha): EstadoCuota {
  const cubren = cuotas.filter((c) => c.periodo_desde <= hoy && hoy < c.periodo_hasta)

  if (cubren.length) {
    // Encadena: una cuota que empieza antes o justo cuando termina la
    // cobertura la estira. Es el que pagó dos meses juntos.
    let fin = masTardia(cubren.map((c) => c.periodo_hasta))
    for (let estiro = true; estiro; ) {
      estiro = false
      for (const c of cuotas) {
        if (c.periodo_desde <= fin && c.periodo_hasta > fin) {
          fin = c.periodo_hasta
          estiro = true
        }
      }
    }
    return { tipo: 'vigente', hasta: sumarDias(fin, -1) }
  }

  const pasadas = cuotas.filter((c) => c.periodo_hasta <= hoy)
  if (pasadas.length) {
    const desde = masTardia(pasadas.map((c) => c.periodo_hasta))
    return { tipo: 'vencida', desde, dias: diasEntre(desde, hoy) }
  }

  if (cuotas.length) {
    const desde = cuotas.map((c) => c.periodo_desde).reduce((a, b) => (b < a ? b : a))
    return { tipo: 'empieza', desde }
  }

  return { tipo: 'sin_pagos' }
}

export function estaAlDia(estado: EstadoCuota): boolean {
  return estado.tipo === 'vigente'
}

export function textoEstadoCuota(estado: EstadoCuota): string {
  switch (estado.tipo) {
    case 'vigente':
      return `Vigente hasta el ${formatearFecha(estado.hasta)}`
    case 'vencida':
      if (estado.dias === 0) return 'Venció hoy'
      return `Vencida hace ${estado.dias} ${estado.dias === 1 ? 'día' : 'días'}`
    case 'empieza':
      return `Empieza el ${formatearFecha(estado.desde)}`
    case 'sin_pagos':
      return 'Sin pagos registrados'
  }
}

/**
 * El período que el panel propone al registrar un pago. Con pagos previos,
 * desde el vencimiento más tardío aunque ya haya pasado: el que paga tarde no
 * corre su fecha. Sin pagos, desde hoy. Siempre un mes.
 */
export function periodoPropuesto(cuotas: readonly PeriodoCuota[], hoy: Fecha): PeriodoCuota {
  const desde = cuotas.length ? masTardia(cuotas.map((c) => c.periodo_hasta)) : hoy
  return { periodo_desde: desde, periodo_hasta: sumarMes(desde) }
}

/** El monto del pago más reciente: sin planes, el precio es el último que se cobró. */
export function montoPropuesto(
  cuotas: readonly { monto: number; fecha_pago: Fecha; created_at: string }[],
): number | null {
  const masNueva = (a: (typeof cuotas)[number], b: (typeof cuotas)[number]) =>
    b.fecha_pago > a.fecha_pago || (b.fecha_pago === a.fecha_pago && b.created_at > a.created_at) ? b : a
  return cuotas.length ? cuotas.reduce(masNueva).monto : null
}

export function validarPago(pago: { periodo_desde: Fecha; periodo_hasta: Fecha; monto: number }): string | null {
  if (Number.isNaN(pago.monto)) return 'Poné el monto'
  if (pago.monto < 0) return 'El monto no puede ser negativo'
  if (!pago.periodo_desde || !pago.periodo_hasta) return 'Completá las fechas'
  if (pago.periodo_hasta <= pago.periodo_desde) return 'El vencimiento tiene que ser después del inicio'
  return null
}

/** '15/10 al 14/11': el último día que se muestra es el último cubierto. */
export function textoPeriodo(cuota: PeriodoCuota): string {
  return `${formatearFecha(cuota.periodo_desde)} al ${formatearFecha(sumarDias(cuota.periodo_hasta, -1))}`
}
```

- [ ] **Step 4: Exportar desde el índice**

Al final de `packages/core/src/index.ts`, agregar:

```ts
export {
  METODOS_PAGO, ETIQUETA_METODO_PAGO, sumarDias, diasEntre, sumarMes, primerDiaDelMes, hoyEnZona,
  formatearFecha, estadoCuota, estaAlDia, textoEstadoCuota, periodoPropuesto, montoPropuesto,
  validarPago, textoPeriodo,
} from './cuotas'
export type { Fecha, PeriodoCuota, EstadoCuota, MetodoPago } from './cuotas'
```

- [ ] **Step 5: Correr los tests y ver que pasan**

Run: `npm run test:core`
Expected: PASS, toda la suite de core.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/cuotas.ts packages/core/tests/cuotas.test.ts packages/core/src/index.ts
git commit -m "Calcular el estado de la cuota y el próximo período en core

El panel y la app tienen que decir lo mismo sobre la misma cuota, y los
errores de fechas son silenciosos: van en funciones puras con tests,
incluidos fin de mes, pagos encadenados y el corte de medianoche.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 6: Socios en `@gym/core` y el color de "al día"

**Files:**
- Create: `packages/core/src/socios.ts`
- Create: `packages/core/tests/socios.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/tema.ts`
- Modify: `packages/core/tests/tema.test.ts`
- Modify: `apps/panel/src/app/globals.css`

**Interfaces:**
- Produces (exportado desde `@gym/core`):
  - `esCodigoQr(texto: string): boolean` — 32 caracteres hexadecimales en minúscula.
  - `debeProcesarLectura(codigo: string, ultima: { codigo: string; en: number } | null, ahora: number, ventanaMs?: number): boolean` — `ventanaMs` por defecto `5000`.
  - `generarContrasena(azar?: () => number): string` — `'palabra-palabra-NNNN'`.
  - `validarAlta(alta: { nombre: string; apellido: string; email: string; password: string }): string | null`
  - `validarCambioContrasena(datos: { actual: string; nueva: string; repetida: string }): string | null`
  - `normalizarEmail(email: string): string`
  - `LARGO_MINIMO_CONTRASENA = 8`
  - `COLORES.vigente`, `COLORES.vigenteSuave`; variables CSS `--color-vigente` y `--color-vigente-suave` (clases Tailwind `text-vigente`, `bg-vigente-suave`).

- [ ] **Step 1: Escribir los tests**

Crear `packages/core/tests/socios.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  debeProcesarLectura, esCodigoQr, generarContrasena, normalizarEmail, validarAlta, validarCambioContrasena,
} from '../src/socios'

describe('esCodigoQr', () => {
  it('acepta lo que genera la base: 16 bytes en hexadecimal', () => {
    expect(esCodigoQr('0123456789abcdef0123456789abcdef')).toBe(true)
  })

  it('ignora cualquier otro QR que la cámara encuentre', () => {
    expect(esCodigoQr('https://ejemplo.com')).toBe(false)
    expect(esCodigoQr('0123456789abcdef')).toBe(false)
    expect(esCodigoQr('0123456789ABCDEF0123456789ABCDEF')).toBe(false)
    expect(esCodigoQr('')).toBe(false)
  })
})

describe('debeProcesarLectura', () => {
  const codigo = '0123456789abcdef0123456789abcdef'
  const otro = 'fedcba9876543210fedcba9876543210'

  it('la primera lectura se procesa', () => {
    expect(debeProcesarLectura(codigo, null, 1000)).toBe(true)
  })

  // Review Focus 2: la cámara lee el mismo QR muchas veces por segundo.
  it('el mismo código dentro de los 5 segundos no', () => {
    expect(debeProcesarLectura(codigo, { codigo, en: 1000 }, 1100)).toBe(false)
    expect(debeProcesarLectura(codigo, { codigo, en: 1000 }, 5999)).toBe(false)
  })

  it('el mismo código pasados los 5 segundos sí', () => {
    expect(debeProcesarLectura(codigo, { codigo, en: 1000 }, 6000)).toBe(true)
  })

  it('otro código enseguida sí', () => {
    expect(debeProcesarLectura(otro, { codigo, en: 1000 }, 1100)).toBe(true)
  })

  it('algo que no es un código nunca', () => {
    expect(debeProcesarLectura('hola', null, 1000)).toBe(false)
  })
})

describe('generarContrasena', () => {
  it('dos palabras y cuatro números, fácil de dictar', () => {
    const valores = [0, 0.99, 0.1234]
    expect(generarContrasena(() => valores.shift() ?? 0)).toMatch(/^[a-z]+-[a-z]+-\d{4}$/)
  })

  it('siempre tiene al menos 8 caracteres', () => {
    for (let i = 0; i < 50; i++) expect(generarContrasena().length).toBeGreaterThanOrEqual(8)
  })

  it('completa con ceros a la izquierda', () => {
    const valores = [0, 0, 0.0007]
    expect(generarContrasena(() => valores.shift() ?? 0)).toMatch(/-0007$/)
  })
})

describe('normalizarEmail', () => {
  // Review Focus 5.
  it('minúsculas y sin espacios', () => {
    expect(normalizarEmail('  Juan@Mail.com ')).toBe('juan@mail.com')
  })
})

describe('validarAlta', () => {
  const bien = { nombre: 'Juan', apellido: 'Pérez', email: 'juan@mail.com', password: 'tigre-faro-4821' }

  it('un alta normal está bien', () => {
    expect(validarAlta(bien)).toBeNull()
  })

  it('exige nombre y apellido', () => {
    expect(validarAlta({ ...bien, nombre: ' ' })).toBe('Poné el nombre y el apellido')
    expect(validarAlta({ ...bien, apellido: '' })).toBe('Poné el nombre y el apellido')
  })

  it('rechaza un email mal escrito', () => {
    expect(validarAlta({ ...bien, email: 'juan@mail' })).toBe('Ese email no es válido')
    expect(validarAlta({ ...bien, email: 'juan mail.com' })).toBe('Ese email no es válido')
  })

  it('acepta el email con mayúsculas y espacios: se normaliza después', () => {
    expect(validarAlta({ ...bien, email: ' Juan@Mail.com ' })).toBeNull()
  })

  it('exige 8 caracteres de contraseña', () => {
    expect(validarAlta({ ...bien, password: '1234567' }))
      .toBe('La contraseña tiene que tener al menos 8 caracteres')
  })
})

describe('validarCambioContrasena', () => {
  const bien = { actual: 'tigre-faro-4821', nueva: 'mi-clave-nueva', repetida: 'mi-clave-nueva' }

  it('un cambio normal está bien', () => {
    expect(validarCambioContrasena(bien)).toBeNull()
  })

  it('exige la actual', () => {
    expect(validarCambioContrasena({ ...bien, actual: '' })).toBe('Poné tu contraseña actual')
  })

  it('exige 8 caracteres en la nueva', () => {
    expect(validarCambioContrasena({ ...bien, nueva: 'corta', repetida: 'corta' }))
      .toBe('La nueva tiene que tener al menos 8 caracteres')
  })

  it('las dos nuevas tienen que coincidir', () => {
    expect(validarCambioContrasena({ ...bien, repetida: 'otra-cosa-123' }))
      .toBe('Las dos contraseñas nuevas no coinciden')
  })

  it('la nueva tiene que ser distinta', () => {
    expect(validarCambioContrasena({ actual: 'tigre-faro-4821', nueva: 'tigre-faro-4821', repetida: 'tigre-faro-4821' }))
      .toBe('La nueva tiene que ser distinta de la actual')
  })
})
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npm run test:core -- socios`
Expected: FAIL — `Failed to resolve import "../src/socios"`.

- [ ] **Step 3: Escribir el módulo**

Crear `packages/core/src/socios.ts`:

```ts
/**
 * Socios: el código QR, la contraseña inicial y las validaciones que
 * comparten el panel y la app. Ver las secciones 3, 4 y 5 del diseño de la
 * etapa 4.
 */

export const LARGO_MINIMO_CONTRASENA = 8

const CODIGO_QR = /^[0-9a-f]{32}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** El formato de memberships.codigo_qr: 16 bytes aleatorios en hexadecimal. */
export function esCodigoQr(texto: string): boolean {
  return CODIGO_QR.test(texto)
}

/**
 * La cámara lee el mismo QR muchas veces por segundo mientras el socio lo
 * sostiene. Se procesa una lectura por código cada `ventanaMs`; un código
 * distinto pasa enseguida. Lo que no es un código del sistema se ignora.
 */
export function debeProcesarLectura(
  codigo: string,
  ultima: { codigo: string; en: number } | null,
  ahora: number,
  ventanaMs = 5000,
): boolean {
  if (!esCodigoQr(codigo)) return false
  return !(ultima && ultima.codigo === codigo && ahora - ultima.en < ventanaMs)
}

// Sin tildes ni eñes: se dictan por teléfono y se escriben en cualquier teclado.
const PALABRAS = [
  'tigre', 'puma', 'condor', 'roble', 'rayo', 'faro', 'nube', 'pampa',
  'lago', 'sol', 'luna', 'monte', 'trueno', 'halcon', 'ceibo', 'delta',
  'sauce', 'cerro', 'brisa', 'yerba', 'tango', 'mate', 'piedra', 'rio',
  'zorro', 'carpincho', 'jacaranda', 'ombu', 'aguila', 'volcan', 'arena', 'ola',
]

/**
 * Aleatorio de calidad criptográfica en [0, 1). Existe en Node 22 y en el
 * navegador. Math.random no sirve para una contraseña.
 */
function azarSeguro(): number {
  return (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / 2 ** 32
}

/**
 * La contraseña inicial que el panel propone: 'tigre-faro-4821'. Legible para
 * pasarla por WhatsApp o dictarla. El socio la cambia desde la app.
 */
export function generarContrasena(azar: () => number = azarSeguro): string {
  const palabra = () => PALABRAS[Math.floor(azar() * PALABRAS.length)] ?? 'gym'
  const primera = palabra()
  const segunda = palabra()
  const numero = String(Math.floor(azar() * 10_000)).padStart(4, '0')
  return `${primera}-${segunda}-${numero}`
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validarAlta(alta: { nombre: string; apellido: string; email: string; password: string }): string | null {
  if (!alta.nombre.trim() || !alta.apellido.trim()) return 'Poné el nombre y el apellido'
  if (!EMAIL.test(normalizarEmail(alta.email))) return 'Ese email no es válido'
  if (alta.password.length < LARGO_MINIMO_CONTRASENA) {
    return `La contraseña tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`
  }
  return null
}

export function validarCambioContrasena(datos: { actual: string; nueva: string; repetida: string }): string | null {
  if (!datos.actual) return 'Poné tu contraseña actual'
  if (datos.nueva.length < LARGO_MINIMO_CONTRASENA) {
    return `La nueva tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`
  }
  if (datos.nueva !== datos.repetida) return 'Las dos contraseñas nuevas no coinciden'
  if (datos.nueva === datos.actual) return 'La nueva tiene que ser distinta de la actual'
  return null
}
```

> `packages/core/tsconfig.json` no fija `lib`, así que incluye `DOM`: `crypto` e `Intl` tienen tipos. También tiene `noUncheckedIndexedAccess`, por eso los valores por defecto y los `??`. La app no llama a `generarContrasena`.

- [ ] **Step 4: Exportar desde el índice**

Al final de `packages/core/src/index.ts`, agregar:

```ts
export {
  LARGO_MINIMO_CONTRASENA, esCodigoQr, debeProcesarLectura, generarContrasena, normalizarEmail,
  validarAlta, validarCambioContrasena,
} from './socios'
```

- [ ] **Step 5: Escribir el test del color nuevo**

En `packages/core/tests/tema.test.ts`, dentro del `describe` que contiene `'los avisos de pendiente y rechazo también'`, agregar:

```ts
  it('el verde de cuota al día también', () => {
    expect(contraste(COLORES.vigente, COLORES.fondo)).toBeGreaterThanOrEqual(4.5)
  })
```

- [ ] **Step 6: Correr los tests y ver que fallan**

Run: `npm run test:core -- tema`
Expected: FAIL — `COLORES.vigente` es `undefined`.

- [ ] **Step 7: Agregar el color al tema**

En `packages/core/src/tema.ts`, dentro de `COLORES`, debajo de `rechazoSuave`:

```ts
  /** "Cuota vigente": el único verde del sistema. */
  vigente: '#34D399',
  vigenteSuave: 'rgba(52,211,153,0.12)',
```

En `VARIABLES_CSS`, debajo de `'--color-rechazo-suave': COLORES.rechazoSuave,`:

```ts
  '--color-vigente': COLORES.vigente,
  '--color-vigente-suave': COLORES.vigenteSuave,
```

En `apps/panel/src/app/globals.css`, dentro de `@theme`, debajo de `--color-rechazo-suave: rgba(248,113,113,0.12);`:

```css
  --color-vigente: #34d399;
  --color-vigente-suave: rgba(52,211,153,0.12);
```

> El test de tema compara `VARIABLES_CSS` contra `globals.css`. Las demás variables ya están en minúsculas en el CSS y en mayúsculas en `tema.ts`, así que el test normaliza; si no fuera así, escribir el valor igual que las otras variables.

- [ ] **Step 8: Correr los tests y ver que pasan**

Run: `npm run test:core`
Expected: PASS, toda la suite.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/socios.ts packages/core/tests/socios.test.ts packages/core/src/index.ts packages/core/src/tema.ts packages/core/tests/tema.test.ts apps/panel/src/app/globals.css
git commit -m "Validar altas y contraseñas, y filtrar lecturas repetidas del QR

La cámara lee el mismo código muchas veces por segundo: sin el filtro,
cada lectura sería una llamada y una tarjeta nueva. La contraseña
inicial usa azar criptográfico y palabras fáciles de dictar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 7: La función de alta de socios

**Files:**
- Create: `supabase/functions/socio-alta/index.ts`
- Create: `tests/funciones/socio-alta.test.ts`
- Create: `vitest.funciones.config.ts`
- Modify: `vitest.config.ts`
- Modify: `package.json` (raíz)

**Interfaces:**
- Consumes: `rechazoPrevio`, `clienteUsuario`, `usuarioAutenticado`, `clienteAlmacen` de `supabase/functions/_compartido/peticion.ts`; `CORS` de `_compartido/cors.ts`; RPC `usuario_por_email` (tarea 4).
- Produces: `POST /functions/v1/socio-alta` con cuerpo `{ gym_id: string, email: string, nombre: string, apellido: string, telefono?: string, password: string }`.
  - 200 → `{ resultado: 'creado' | 'cuenta_existente' | 'ya_es_socio', membership_id: string }`
  - 400 / 403 / 500 → `{ error: string }`, con el mensaje listo para mostrar.

- [ ] **Step 1: Separar los tests que necesitan las funciones corriendo**

En `vitest.config.ts`, cambiar `include: ['tests/**/*.test.ts'],` por:

```ts
    // Solo la base. Los de tests/funciones necesitan además
    // `npx supabase functions serve`, y van con su propia configuración.
    include: ['tests/rls/**/*.test.ts'],
```

Crear `vitest.funciones.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

// Los tests de las Edge Functions. Necesitan, además de `npx supabase start`,
// `npx supabase functions serve` corriendo en otra terminal: sin él, cada
// llamada falla con un error de conexión.
export default defineConfig({
  test: {
    include: ['tests/funciones/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ['./tests/setup.ts'],
  },
})
```

En `package.json` de la raíz, en `scripts`, debajo de `"test:rls"`:

```json
    "test:funciones": "vitest run --config vitest.funciones.config.ts",
```

- [ ] **Step 2: Escribir los tests**

Crear `tests/funciones/socio-alta.test.ts`:

```ts
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, crearEscenario, type Escenario } from '../rls/ayudas'

const URL = process.env.API_URL ?? 'http://127.0.0.1:54321'

/** Llama a la función y devuelve el status y el cuerpo, sea éxito o error. */
async function alta(cliente: SupabaseClient, cuerpo: Record<string, unknown>) {
  const { data, error } = await cliente.functions.invoke('socio-alta', { body: cuerpo })
  if (error instanceof FunctionsHttpError) {
    const respuesta = error.context as Response
    return { status: respuesta.status, cuerpo: await respuesta.json() }
  }
  if (error) throw error
  return { status: 200, cuerpo: data }
}

async function puedeEntrar(email: string, password: string): Promise<boolean> {
  const cliente = createClient(URL, process.env.ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await cliente.auth.signInWithPassword({ email, password })
  return !error
}

describe('socio-alta', () => {
  let e: Escenario
  const sufijo = Math.random().toString(36).slice(2, 10)
  const datos = (campos: Record<string, unknown> = {}) => ({
    nombre: 'Juan', apellido: 'Pérez', telefono: '1155550000',
    email: `nuevo-${sufijo}@ejemplo.com`, password: 'tigre-faro-4821',
    ...campos,
  })

  beforeAll(async () => {
    e = await crearEscenario()
  })

  it('el admin crea un socio nuevo que ya puede entrar', async () => {
    const r = await alta(e.comoAdminA, { gym_id: e.gymA, ...datos() })
    expect(r.status).toBe(200)
    expect(r.cuerpo.resultado).toBe('creado')

    const { data: membresia } = await admin
      .from('memberships').select('gym_id, rol, estado, user_id').eq('id', r.cuerpo.membership_id).single()
    expect(membresia).toMatchObject({ gym_id: e.gymA, rol: 'socio', estado: 'activo' })

    const { data: perfil } = await admin
      .from('profiles').select('nombre, apellido, telefono').eq('id', membresia!.user_id).single()
    expect(perfil).toEqual({ nombre: 'Juan', apellido: 'Pérez', telefono: '1155550000' })

    expect(await puedeEntrar(`nuevo-${sufijo}@ejemplo.com`, 'tigre-faro-4821')).toBe(true)
  })

  it('el mismo email otra vez, aunque venga con mayúsculas, ya es socio', async () => {
    const r = await alta(e.comoAdminA, {
      gym_id: e.gymA, ...datos({ email: `  NUEVO-${sufijo}@Ejemplo.com ` }),
    })
    expect(r.status).toBe(200)
    expect(r.cuerpo.resultado).toBe('ya_es_socio')
  })

  // Review Focus 5.
  it('guarda el email en minúsculas', async () => {
    const email = `Mayus-${sufijo}@Ejemplo.COM`
    const r = await alta(e.comoAdminA, { gym_id: e.gymA, ...datos({ email: ` ${email} ` }) })
    expect(r.cuerpo.resultado).toBe('creado')
    expect(await puedeEntrar(email.toLowerCase(), 'tigre-faro-4821')).toBe(true)
  })

  it('alguien con cuenta en otro gimnasio suma la membresía y conserva su contraseña', async () => {
    const { data: m } = await admin.from('memberships').select('user_id').eq('id', e.socioBMembresiaId).single()
    const { data: usuario } = await admin.auth.admin.getUserById(m!.user_id)
    const email = usuario.user!.email!

    const r = await alta(e.comoAdminA, { gym_id: e.gymA, ...datos({ email, password: 'otra-clave-9999' }) })
    expect(r.status).toBe(200)
    expect(r.cuerpo.resultado).toBe('cuenta_existente')

    const { data: nueva } = await admin
      .from('memberships').select('gym_id, user_id').eq('id', r.cuerpo.membership_id).single()
    expect(nueva).toEqual({ gym_id: e.gymA, user_id: m!.user_id })

    // La contraseña de ayudas.ts sigue andando; la que mandó el admin, no.
    expect(await puedeEntrar(email, 'prueba-123456')).toBe(true)
    expect(await puedeEntrar(email, 'otra-clave-9999')).toBe(false)
  })

  it('el entrenador no puede dar de alta', async () => {
    const r = await alta(e.comoEntrenadorA, { gym_id: e.gymA, ...datos({ email: `ent-${sufijo}@ejemplo.com` }) })
    expect(r.status).toBe(403)
    expect(r.cuerpo.error).toBe('Solo un administrador puede dar de alta socios')
  })

  it('el admin de A no puede dar de alta en el gimnasio B', async () => {
    const r = await alta(e.comoAdminA, { gym_id: e.gymB, ...datos({ email: `cruzado-${sufijo}@ejemplo.com` }) })
    expect(r.status).toBe(403)
  })

  it('un email mal escrito vuelve con el mensaje para mostrar', async () => {
    const r = await alta(e.comoAdminA, { gym_id: e.gymA, ...datos({ email: 'juan@mail' }) })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toBe('Ese email no es válido')
  })

  it('una contraseña corta también', async () => {
    const r = await alta(e.comoAdminA, {
      gym_id: e.gymA, ...datos({ email: `corta-${sufijo}@ejemplo.com`, password: '1234' }),
    })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toBe('La contraseña tiene que tener al menos 8 caracteres')
  })
})
```

> La limpieza cuando falla la membresía después de crear el usuario (spec, sección 3) no tiene test: no hay forma de hacer fallar ese insert desde afuera sin tocar la función. Se revisa leyendo el código en la revisión de esta tarea.

- [ ] **Step 3: Correr los tests y ver que fallan**

En otra terminal: `npx supabase functions serve`
Run: `npm run test:funciones`
Expected: FAIL — la función no existe (404 en cada llamada).

- [ ] **Step 4: Escribir la función**

Crear `supabase/functions/socio-alta/index.ts`:

```ts
import { CORS } from '../_compartido/cors.ts'
import {
  clienteAlmacen,
  clienteUsuario,
  rechazoPrevio,
  usuarioAutenticado,
} from '../_compartido/peticion.ts'

// Crea la cuenta del socio desde el panel. Ver la sección 3 del diseño de la
// etapa 4.
//
// Las validaciones repiten las de validarAlta en @gym/core a propósito: esta
// función corre en Deno y no importa el paquete, y no puede confiar en que el
// panel validó. Los mensajes tienen que ser los mismos.
//
// La contraseña no se registra en ningún log: los console.error de abajo
// reciben el error de Supabase, nunca el cuerpo de la petición.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ERROR_GENERICO = 'No se pudo crear la cuenta, probá de nuevo'

interface Alta {
  gym_id: string
  email: string
  nombre: string
  apellido: string
  telefono: string | null
  password: string
}

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: CORS })

function leerAlta(cuerpo: unknown): Alta | string {
  const c = (cuerpo ?? {}) as Record<string, unknown>
  const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const alta: Alta = {
    gym_id: texto(c.gym_id),
    email: texto(c.email).toLowerCase(),
    nombre: texto(c.nombre),
    apellido: texto(c.apellido),
    telefono: texto(c.telefono) || null,
    password: typeof c.password === 'string' ? c.password : '',
  }
  if (!alta.gym_id) return 'Falta el gimnasio'
  if (!alta.nombre || !alta.apellido) return 'Poné el nombre y el apellido'
  if (!EMAIL.test(alta.email)) return 'Ese email no es válido'
  if (alta.password.length < 8) return 'La contraseña tiene que tener al menos 8 caracteres'
  return alta
}

Deno.serve(async (peticion) => {
  const rechazo = rechazoPrevio(peticion)
  if (rechazo) return rechazo
  const supabase = clienteUsuario(peticion.headers.get('Authorization')!)

  const user = await usuarioAutenticado(supabase)
  if (user instanceof Response) return user

  let cuerpo: unknown
  try {
    cuerpo = await peticion.json()
  } catch {
    return json({ error: 'El pedido llegó mal armado' }, 400)
  }
  const alta = leerAlta(cuerpo)
  if (typeof alta === 'string') return json({ error: alta }, 400)

  // Con el cliente de quien llama: memberships_leer ya limita a sus
  // gimnasios, así que un gym_id ajeno da null y cae en el 403.
  const { data: soyAdmin, error: errorRol } = await supabase
    .from('memberships').select('id')
    .eq('user_id', user.id).eq('gym_id', alta.gym_id)
    .eq('rol', 'admin').eq('estado', 'activo')
    .maybeSingle()
  if (errorRol) {
    console.error('No se pudo verificar el rol', errorRol)
    return json({ error: 'No pudimos verificar tu permiso' }, 500)
  }
  if (!soyAdmin) return json({ error: 'Solo un administrador puede dar de alta socios' }, 403)

  // De acá en adelante, service_role: crear usuarios y leer auth.users lo
  // exige. La autorización ya se decidió arriba.
  const almacen = clienteAlmacen()

  const { data: existente, error: errorBusqueda } = await almacen
    .rpc('usuario_por_email', { p_email: alta.email })
  if (errorBusqueda) {
    console.error('No se pudo buscar el email', errorBusqueda)
    return json({ error: ERROR_GENERICO }, 500)
  }

  if (existente) {
    const { data: yaEs } = await almacen
      .from('memberships').select('id')
      .eq('gym_id', alta.gym_id).eq('user_id', existente)
      .maybeSingle()
    if (yaEs) return json({ resultado: 'ya_es_socio', membership_id: yaEs.id })

    // La persona ya tiene cuenta —viene de otro gimnasio de la plataforma—:
    // se le suma la membresía y no se toca ni su contraseña ni su perfil.
    const { data: nueva, error } = await almacen
      .from('memberships')
      .insert({ gym_id: alta.gym_id, user_id: existente, rol: 'socio' })
      .select('id').single()
    if (error || !nueva) {
      console.error('No se pudo crear la membresía', error)
      return json({ error: ERROR_GENERICO }, 500)
    }
    return json({ resultado: 'cuenta_existente', membership_id: nueva.id })
  }

  // email_confirm: true porque no hay envío de mails: el empleado le pasa los
  // datos al socio en mano. El nombre va en la metadata para el trigger que
  // crea el perfil (0001).
  const { data: creado, error: errorCrear } = await almacen.auth.admin.createUser({
    email: alta.email,
    password: alta.password,
    email_confirm: true,
    user_metadata: { nombre: alta.nombre, apellido: alta.apellido },
  })
  if (errorCrear || !creado.user) {
    console.error('No se pudo crear el usuario', errorCrear)
    return json({ error: ERROR_GENERICO }, 500)
  }
  const nuevoId = creado.user.id

  // Si algo falla después de crear el usuario, se borra: una cuenta sin
  // membresía puede entrar a la app y no ve nada, y el email queda tomado.
  const deshacer = async (motivo: string, error: unknown) => {
    console.error(motivo, error)
    const { error: errorBorrar } = await almacen.auth.admin.deleteUser(nuevoId)
    if (errorBorrar) console.error('Tampoco se pudo borrar el usuario', nuevoId, errorBorrar)
    return json({ error: ERROR_GENERICO }, 500)
  }

  if (alta.telefono) {
    const { error } = await almacen.from('profiles').update({ telefono: alta.telefono }).eq('id', nuevoId)
    if (error) return deshacer('No se pudo guardar el teléfono', error)
  }

  const { data: membresia, error: errorMembresia } = await almacen
    .from('memberships')
    .insert({ gym_id: alta.gym_id, user_id: nuevoId, rol: 'socio' })
    .select('id').single()
  if (errorMembresia || !membresia) return deshacer('No se pudo crear la membresía', errorMembresia)

  return json({ resultado: 'creado', membership_id: membresia.id })
})
```

- [ ] **Step 5: Correr los tests y ver que pasan**

Con `npx supabase functions serve` corriendo (se recarga solo al guardar):
Run: `npm run test:funciones`
Expected: PASS, 8 tests.

- [ ] **Step 6: Verificar que la suite de RLS sigue igual**

Run: `npm run test:rls`
Expected: PASS, y no corre nada de `tests/funciones`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/socio-alta/index.ts tests/funciones/socio-alta.test.ts vitest.funciones.config.ts vitest.config.ts package.json
git commit -m "Crear la cuenta del socio desde el panel con una Edge Function

Crear un usuario exige la clave de servicio, que no puede llegar al
navegador. Si el email ya tiene cuenta en otro gimnasio se le suma la
membresía sin tocarle la contraseña, y si algo falla a mitad se borra
el usuario recién creado.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 8: Panel — la base: diseño para celular y piezas compartidas

**Files:**
- Modify: `apps/panel/src/app/(panel)/layout.tsx`
- Modify: `apps/panel/src/app/(panel)/nav-lateral.tsx`
- Create: `apps/panel/src/lib/membresia.ts`
- Create: `apps/panel/src/lib/fotos.ts`
- Create: `apps/panel/src/lib/paginar.ts`
- Create: `apps/panel/src/components/avatar-socio.tsx`
- Create: `apps/panel/src/components/etiqueta-cuota.tsx`
- Create: `apps/panel/src/components/boton-confirmar.tsx`

**Interfaces:**
- Consumes: `Rol`, `estaAlDia`, `textoEstadoCuota`, `EstadoCuota` de `@gym/core` (tareas 5 y 6); clases `text-vigente`, `bg-vigente-suave` (tarea 6).
- Produces:
  - `miMembresia(): Promise<MiMembresia | null>` en `@/lib/membresia`, con `interface MiMembresia { id: string; gym_id: string; rol: Rol; zona: string }`.
  - `type ClienteServidor` y `urlsDeFotos(supabase: ClienteServidor, rutas: (string | null)[]): Promise<Map<string, string>>` en `@/lib/fotos`.
  - `todasLasPaginas<T>(pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]>` en `@/lib/paginar`.
  - `AvatarSocio({ nombre: string; url?: string | null; grande?: boolean })` y `nombreCompleto(perfil: { nombre: string; apellido: string } | null): string` en `@/components/avatar-socio`.
  - `EtiquetaCuota({ estado: EstadoCuota; grande?: boolean })` en `@/components/etiqueta-cuota`.
  - `BotonConfirmar({ texto: string; pregunta: string; confirmar?: string; peligro?: boolean; accion: () => Promise<{ error?: string }> })` en `@/components/boton-confirmar` (cliente).
  - `SECCIONES` de `nav-lateral.tsx` acepta `primeroEnCelular?: boolean`.

Esta tarea no agrega pantallas: deja lo que usan las tareas 9 a 12.

- [ ] **Step 1: La membresía de quien usa el panel**

Crear `apps/panel/src/lib/membresia.ts`:

```ts
import { cache } from 'react'
import type { Rol } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export interface MiMembresia {
  id: string
  gym_id: string
  rol: Rol
  /** gyms.zona_horaria: "hoy" es la fecha del gimnasio, no la del servidor. */
  zona: string
}

/**
 * La membresía activa de quien usa el panel, con su rol y la zona del
 * gimnasio. cache(): la página y sus partes la piden en el mismo render y va
 * una sola consulta.
 *
 * limit(1) y no single(): una persona puede pertenecer a varios gimnasios. Se
 * usa la más antigua, igual que el layout; el selector de gimnasio llega en
 * una etapa posterior.
 */
export const miMembresia = cache(async (): Promise<MiMembresia | null> => {
  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('memberships')
    .select('id, gym_id, rol, gyms ( zona_horaria )')
    .eq('user_id', user.id)
    .eq('estado', 'activo')
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (!data) return null

  return {
    id: data.id,
    gym_id: data.gym_id,
    rol: data.rol,
    zona: data.gyms?.zona_horaria ?? 'America/Argentina/Buenos_Aires',
  }
})
```

- [ ] **Step 2: Las URLs de las fotos y la paginación**

Crear `apps/panel/src/lib/fotos.ts`:

```ts
import type { crearClienteServidor } from '@/lib/supabase/servidor'

export type ClienteServidor = Awaited<ReturnType<typeof crearClienteServidor>>

/**
 * URLs firmadas de una hora para las fotos de los socios. El bucket es
 * privado: la firma la pide la sesión de quien mira, y la política de
 * storage (0019) decide si puede. Las que no se pudieron firmar no están en
 * el mapa, y la pantalla muestra las iniciales.
 */
export async function urlsDeFotos(
  supabase: ClienteServidor,
  rutas: (string | null)[],
): Promise<Map<string, string>> {
  const validas = [...new Set(rutas.filter((r): r is string => !!r))]
  if (!validas.length) return new Map()

  const { data } = await supabase.storage.from('fotos-socios').createSignedUrls(validas, 3600)
  return new Map(
    (data ?? [])
      .filter((f) => f.path && f.signedUrl && !f.error)
      .map((f) => [f.path!, f.signedUrl]),
  )
}
```

Crear `apps/panel/src/lib/paginar.ts`:

```ts
/**
 * PostgREST corta en ~1000 filas sin avisar. Esto pide de a páginas hasta que
 * una venga corta. La consulta tiene que estar ordenada por algo único, para
 * que dos páginas no se pisen. Si una página falla se devuelve lo acumulado:
 * en el panel, mostrar lo que hay es mejor que nada.
 */
export async function todasLasPaginas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pagina(desde, desde + 999)
    if (error || !data) break
    filas.push(...data)
    if (data.length < 1000) break
  }
  return filas
}
```

- [ ] **Step 3: Las tres piezas de interfaz**

Crear `apps/panel/src/components/avatar-socio.tsx`:

```tsx
export function nombreCompleto(perfil: { nombre: string; apellido: string } | null): string {
  return `${perfil?.nombre ?? ''} ${perfil?.apellido ?? ''}`.trim() || 'Sin nombre'
}

/** La foto de verificación, o las iniciales si todavía no tiene. */
export function AvatarSocio({ nombre, url, grande = false }: {
  nombre: string
  url?: string | null
  grande?: boolean
}) {
  const medida = grande ? 'size-28 text-3xl' : 'size-10 text-sm'

  if (url) {
    // <img> y no next/image: la URL firmada cambia en cada render y vence en
    // una hora; optimizarla no sirve de nada.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={`Foto de ${nombre}`} className={`${medida} shrink-0 rounded-full object-cover`} />
  }

  const iniciales = nombre.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span
      className={`${medida} flex shrink-0 items-center justify-center rounded-full bg-superficie-elevada font-bold text-texto-secundario`}
      aria-hidden
    >
      {iniciales}
    </span>
  )
}
```

Crear `apps/panel/src/components/etiqueta-cuota.tsx`:

```tsx
import { estaAlDia, textoEstadoCuota, type EstadoCuota } from '@gym/core'

/** Verde al día, ámbar si la cuota todavía no empezó, rojo en cualquier otro caso. */
export function EtiquetaCuota({ estado, grande = false }: { estado: EstadoCuota; grande?: boolean }) {
  const color = estaAlDia(estado)
    ? 'bg-vigente-suave text-vigente'
    : estado.tipo === 'empieza'
      ? 'bg-pendiente-suave text-pendiente'
      : 'bg-rechazo-suave text-rechazo'
  const medida = grande ? 'min-h-11 px-4 text-base' : 'min-h-7 px-3 text-xs'

  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${medida} ${color}`}>
      {estado.tipo === 'vencida' && '⚠️ '}
      {textoEstadoCuota(estado)}
    </span>
  )
}
```

Crear `apps/panel/src/components/boton-confirmar.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'

/**
 * Un botón que pregunta antes de hacer algo que no se deshace solo: borrar un
 * pago, dar de baja, regenerar el QR. En la misma línea y no con confirm():
 * un diálogo del navegador bloquea la página y en el celular se ve mal.
 */
export function BotonConfirmar({ texto, pregunta, confirmar = 'Sí', peligro = false, accion }: {
  texto: string
  pregunta: string
  confirmar?: string
  peligro?: boolean
  accion: () => Promise<{ error?: string }>
}) {
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const clase = `boton ${peligro ? 'boton-peligro' : 'boton-secundario'}`

  if (!abierto) {
    return (
      <div className="space-y-1">
        <button type="button" className={clase} onClick={() => { setError(null); setAbierto(true) }}>
          {texto}
        </button>
        {error && <p role="alert" className="text-sm text-rechazo">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>{pregunta}</span>
      <button
        type="button" disabled={pendiente} className={clase}
        onClick={() => iniciar(async () => {
          const r = await accion()
          setAbierto(false)
          setError(r.error ?? null)
        })}
      >
        {pendiente ? 'Un momento…' : confirmar}
      </button>
      <button type="button" disabled={pendiente} className="boton boton-secundario" onClick={() => setAbierto(false)}>
        Cancelar
      </button>
    </div>
  )
}
```

- [ ] **Step 4: El diseño para celular**

En `apps/panel/src/app/(panel)/layout.tsx`, reemplazar el `return (` final —el que arma `<div className="flex min-h-screen">`— por:

```tsx
  // En el celular la barra va arriba y la navegación se desliza de costado:
  // Escanear se usa parado en el mostrador, con el teléfono en la mano.
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="shrink-0 border-b border-superficie-borde bg-hundido p-4 md:w-64 md:border-r md:border-b-0 md:p-5">
        <div className="flex items-center gap-3">
          <span className="fondo-degrade size-9 shrink-0 rounded-medio" aria-hidden />
          <div className="min-w-0">
            <p className="truncate font-semibold">{membresia.gyms?.nombre}</p>
            <p className="truncate text-xs text-texto-secundario">
              {membresia.profiles?.nombre} · {membresia.rol}
            </p>
          </div>
        </div>
        <NavLateral />
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  )
```

En `apps/panel/src/app/(panel)/nav-lateral.tsx`:

1. Cambiar el tipo de `SECCIONES` por:

```tsx
// primeroEnCelular: en la barra de arriba del celular va antes que el resto,
// sin cambiar el orden de la barra lateral de la computadora.
const SECCIONES: { href: string; texto: string; icono: LucideIcon; primeroEnCelular?: boolean }[] = [
```

2. Reemplazar el `<nav ...>` y el `.map` por:

```tsx
    <nav className="-mx-1 mt-4 flex gap-1 overflow-x-auto px-1 text-sm md:mx-0 md:mt-8 md:flex-col md:overflow-visible md:px-0">
      {SECCIONES.map(({ href, texto, icono: Icono, primeroEnCelular }) => {
        const activa = href === '/' ? ruta === '/' : ruta.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={activa ? 'page' : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-3 rounded-medio px-3 transition ${
              primeroEnCelular ? 'order-first md:order-none' : ''
            } ${
              activa
                ? 'bg-superficie-elevada text-texto'
                : 'text-texto-secundario hover:bg-superficie hover:text-texto'
            }`}
          >
            <Icono size={18} className={activa ? 'text-cian' : undefined} />
            {texto}
          </Link>
        )
      })}
    </nav>
```

- [ ] **Step 5: Verificar tipos y lint**

Run (en `apps/panel`): `npx tsc --noEmit` y `npm run lint`
Expected: sin errores.

- [ ] **Step 6: Verificar a mano**

Run (en `apps/panel`): `npm run dev`, y abrir `http://localhost:3000/socios` con las herramientas del navegador en modo celular (390 px de ancho).
Expected: la barra lateral pasa a ser una franja arriba, con las secciones deslizables de costado, y no hay desplazamiento horizontal de la página. En una ventana ancha se ve como antes.

- [ ] **Step 7: Commit**

```bash
git add apps/panel/src/lib apps/panel/src/components "apps/panel/src/app/(panel)/layout.tsx" "apps/panel/src/app/(panel)/nav-lateral.tsx"
git commit -m "Adaptar el panel al celular y sumar las piezas de socios

El escaneo se hace desde el teléfono, parado en el mostrador: el panel
tiene que poder usarse a 390 px. Las piezas nuevas —foto, estado de
cuota, confirmación en línea— las comparten la lista, la ficha y el
escaneo.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 9: Panel — la lista de socios y el alta

**Files:**
- Modify (reemplazo completo): `apps/panel/src/app/(panel)/socios/page.tsx`
- Create: `apps/panel/src/app/(panel)/socios/acciones.ts`
- Create: `apps/panel/src/app/(panel)/socios/nuevo/page.tsx`
- Create: `apps/panel/src/app/(panel)/socios/nuevo/formulario-alta.tsx`

**Interfaces:**
- Consumes: `miMembresia`, `urlsDeFotos`, `todasLasPaginas`, `AvatarSocio`, `nombreCompleto`, `EtiquetaCuota` (tarea 8); `estadoCuota`, `estaAlDia`, `hoyEnZona`, `puede`, `generarContrasena`, `normalizarEmail`, `validarAlta`, `PeriodoCuota` de `@gym/core`; `POST socio-alta` (tarea 7).
- Produces, en `socios/acciones.ts` (`'use server'`):
  - `type Resultado = { error?: string }`
  - `type EstadoAlta = { error?: string; valores?: { nombre: string; apellido: string; email: string; telefono: string }; hecho?: { resultado: 'creado' | 'cuenta_existente'; membershipId: string; email: string; password: string } }`
  - `darDeAlta(previo: EstadoAlta, datos: FormData): Promise<EstadoAlta>` — campos `nombre`, `apellido`, `email`, `telefono`, `password`. Con `ya_es_socio` redirige a `/socios/<id>?aviso=ya-es-socio`.
- Las tareas 10 y 11 agregan más acciones a este mismo archivo.

- [ ] **Step 1: Las acciones de socios**

Crear `apps/panel/src/app/(panel)/socios/acciones.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { normalizarEmail, validarAlta } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { miMembresia } from '@/lib/membresia'

// Las reglas de quién puede hacer qué viven en la RLS y en las funciones de
// la base: acá no se vuelve a chequear el rol, para no tener la regla escrita
// en dos lados. Ver la sección 1 del diseño de la etapa 4.

export type Resultado = { error?: string }

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? '').trim()
const SESION_VENCIDA = 'Tu sesión venció. Volvé a entrar.'

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

export type EstadoAlta = {
  error?: string
  /** Lo que se escribió, para no perderlo si algo falla: React vacía el formulario al terminar la acción. */
  valores?: { nombre: string; apellido: string; email: string; telefono: string }
  hecho?: { resultado: 'creado' | 'cuenta_existente'; membershipId: string; email: string; password: string }
}

type RespuestaAlta = { resultado: 'creado' | 'cuenta_existente' | 'ya_es_socio'; membership_id: string }

export async function darDeAlta(_previo: EstadoAlta, datos: FormData): Promise<EstadoAlta> {
  const valores = {
    nombre: texto(datos, 'nombre'),
    apellido: texto(datos, 'apellido'),
    email: texto(datos, 'email'),
    telefono: texto(datos, 'telefono'),
  }
  const password = String(datos.get('password') ?? '')
  const invalido = validarAlta({ ...valores, password })
  if (invalido) return { error: invalido, valores }

  const yo = await miMembresia()
  if (!yo) return { error: SESION_VENCIDA, valores }

  const email = normalizarEmail(valores.email)
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.functions.invoke<RespuestaAlta>('socio-alta', {
    body: { gym_id: yo.gym_id, nombre: valores.nombre, apellido: valores.apellido, email, telefono: valores.telefono, password },
  })
  if (error || !data) return { error: await mensajeDeLaFuncion(error), valores }

  revalidatePath('/socios')
  // Fuera de cualquier try: redirect funciona tirando una excepción.
  if (data.resultado === 'ya_es_socio') redirect(`/socios/${data.membership_id}?aviso=ya-es-socio`)

  return {
    hecho: {
      resultado: data.resultado,
      membershipId: data.membership_id,
      email,
      // A alguien que ya tenía cuenta no se le cambió la contraseña: no hay
      // nada que mostrar.
      password: data.resultado === 'creado' ? password : '',
    },
  }
}

/** El mensaje que la función ya armó para mostrar, o uno genérico. */
async function mensajeDeLaFuncion(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const cuerpo = await (error.context as Response).json()
      if (typeof cuerpo?.error === 'string') return cuerpo.error
    } catch {
      // Un cuerpo que no es JSON cae en el genérico.
    }
  }
  return 'No se pudo crear la cuenta, probá de nuevo'
}
```

- [ ] **Step 2: La lista de socios**

Reemplazar todo `apps/panel/src/app/(panel)/socios/page.tsx` por:

```tsx
import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { estadoCuota, estaAlDia, hoyEnZona, puede, type PeriodoCuota } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { miMembresia } from '@/lib/membresia'
import { urlsDeFotos } from '@/lib/fotos'
import { todasLasPaginas } from '@/lib/paginar'
import { AvatarSocio, nombreCompleto } from '@/components/avatar-socio'
import { EtiquetaCuota } from '@/components/etiqueta-cuota'
import { Asignar } from './asignar'

const FILTROS = [
  { valor: 'todos', texto: 'Todos' },
  // Incluye a los que nunca pagaron: para quien cobra es la misma lista.
  { valor: 'sin-cuota', texto: 'Sin cuota al día' },
  { valor: 'inactivos', texto: 'Inactivos' },
] as const

export default async function Socios({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filtro?: string }>
}) {
  const { q = '', filtro = 'todos' } = await searchParams
  const yo = await miMembresia()
  // El layout ya mostró el aviso de cuenta sin gimnasio.
  if (!yo) return null

  const supabase = await crearClienteServidor()
  const hoy = hoyEnZona(yo.zona)
  const inactivos = filtro === 'inactivos'

  // memberships_leer (etapa 0) ya limita esto al propio gimnasio.
  const { data: socios } = await supabase
    .from('memberships')
    .select('id, foto, profiles ( nombre, apellido )')
    .eq('rol', 'socio')
    .eq('estado', inactivos ? 'inactivo' : 'activo')

  const { data: rutinas } = await supabase
    .from('rutinas')
    .select('id, nombre, tipo, propietario_id, asignada_por, estado')
    .eq('estado', 'activa')

  // Hasta tres por socio: lo resuelve la vista (0015). El segundo order
  // desempata para que las páginas no se pisen.
  const sesiones = await todasLasPaginas((desde, hasta) => supabase
    .from('ultimas_sesiones')
    .select('id, membership_id, inicio, fin, dia_nombre, series')
    .order('inicio', { ascending: false })
    .order('id')
    .range(desde, hasta))

  const cuotas = await todasLasPaginas((desde, hasta) => supabase
    .from('cuotas')
    .select('id, membership_id, periodo_desde, periodo_hasta')
    .order('id')
    .range(desde, hasta))

  const cuotasDe = new Map<string, PeriodoCuota[]>()
  for (const c of cuotas) cuotasDe.set(c.membership_id, [...(cuotasDe.get(c.membership_id) ?? []), c])

  const fotos = await urlsDeFotos(supabase, (socios ?? []).map((s) => s.foto))

  const busqueda = q.trim().toLowerCase()
  const lista = (socios ?? [])
    .map((s) => ({ ...s, nombre: nombreCompleto(s.profiles), estado: estadoCuota(cuotasDe.get(s.id) ?? [], hoy) }))
    .filter((s) => !busqueda || s.nombre.toLowerCase().includes(busqueda))
    .filter((s) => filtro !== 'sin-cuota' || !estaAlDia(s.estado))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const plantillas = rutinas?.filter((r) => r.tipo === 'plantilla') ?? []
  const activas = rutinas?.filter((r) => r.tipo === 'activa') ?? []

  const fecha = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short', day: 'numeric', month: 'numeric', timeZone: yo.zona,
  })

  const hrefFiltro = (valor: string) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (valor !== 'todos') p.set('filtro', valor)
    const s = p.toString()
    return s ? `/socios?${s}` : '/socios'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="titulo-pagina">Socios</h1>
        {puede(yo.rol, 'gestionar_socios') && (
          <Link href="/socios/nuevo" className="boton boton-principal">
            <UserPlus size={18} /> Nuevo socio
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {/* GET: la búsqueda queda en la URL y se puede volver atrás. */}
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar por nombre" className="campo" />
          {filtro !== 'todos' && <input type="hidden" name="filtro" value={filtro} />}
          <button type="submit" className="boton boton-secundario">Buscar</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <Link key={f.valor} href={hrefFiltro(f.valor)}
              className={`chip ${filtro === f.valor ? 'chip-activo' : ''}`}>
              {f.texto}
            </Link>
          ))}
        </div>
      </div>

      {lista.length === 0 && (
        <p className="tarjeta text-texto-secundario">
          {(socios ?? []).length === 0
            ? inactivos ? 'No hay socios dados de baja.' : 'Todavía no hay socios en el gimnasio.'
            : 'Ningún socio coincide con la búsqueda.'}
        </p>
      )}

      <ul className="grid gap-4 lg:grid-cols-2">
        {lista.map((s) => {
          const suyas = activas.filter((r) => r.propietario_id === s.id)
          const ultimas = sesiones.filter((x) => x.membership_id === s.id)

          return (
            <li key={s.id} className="tarjeta space-y-4">
              <Link href={`/socios/${s.id}`} className="flex items-center gap-3">
                <AvatarSocio nombre={s.nombre} url={s.foto ? fotos.get(s.foto) : null} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.nombre}</p>
                  <p className="text-xs text-texto-secundario">
                    {suyas.length ? `${suyas.length} ${suyas.length === 1 ? 'rutina activa' : 'rutinas activas'}` : 'Sin rutinas activas.'}
                  </p>
                </div>
                <EtiquetaCuota estado={s.estado} />
              </Link>

              {suyas.length > 0 && (
                <ul className="space-y-2">
                  {suyas.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-medio bg-hundido px-3 py-2 text-sm">
                      <span>{r.nombre}</span>
                      {/* La que se armó solo el socio no se edita: la RLS ya lo
                          decide, acá solo se refleja para no ofrecer un botón
                          que va a fallar. */}
                      {r.asignada_por ? (
                        <Link href={`/rutinas/${r.id}`} className="enlace">editar</Link>
                      ) : (
                        <span className="text-texto-tenue">(se la armó el socio)</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-1 text-sm">
                <p className="etiqueta">Últimas sesiones</p>
                {ultimas.length ? (
                  <ul className="space-y-0.5 tabular-nums text-texto">
                    {ultimas.map((x) => (
                      <li key={x.id!}>
                        {fecha.format(new Date(x.inicio!))}
                        {' · '}{x.dia_nombre ?? 'Entrenamiento libre'}
                        {' · '}{x.series} series
                        {!x.fin && <span className="text-pendiente"> · sin terminar</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-texto-tenue">Todavía no registró entrenamientos.</p>
                )}
              </div>

              {!inactivos && <Asignar socioId={s.id} plantillas={plantillas} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: La pantalla de alta**

Crear `apps/panel/src/app/(panel)/socios/nuevo/page.tsx`:

```tsx
import Link from 'next/link'
import { generarContrasena, puede } from '@gym/core'
import { miMembresia } from '@/lib/membresia'
import { FormularioAlta } from './formulario-alta'

export default async function NuevoSocio() {
  const yo = await miMembresia()
  if (!yo || !puede(yo.rol, 'gestionar_socios')) {
    return <p className="tarjeta text-texto-secundario">Solo un administrador puede dar de alta socios.</p>
  }

  return (
    <div className="max-w-lg space-y-6">
      <Link href="/socios" className="enlace text-sm">← Socios</Link>
      <h1 className="titulo-pagina">Nuevo socio</h1>
      {/* Se genera en el servidor en cada visita: la página no se cachea
          porque lee la sesión. */}
      <FormularioAlta contrasenaInicial={generarContrasena()} />
    </div>
  )
}
```

Crear `apps/panel/src/app/(panel)/socios/nuevo/formulario-alta.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { generarContrasena } from '@gym/core'
import { darDeAlta, type EstadoAlta } from '../acciones'

const INICIAL: EstadoAlta = {}

export function FormularioAlta({ contrasenaInicial }: { contrasenaInicial: string }) {
  const [estado, accion, pendiente] = useActionState(darDeAlta, INICIAL)
  // Controlada: es la única que cambia sin que la escriba nadie (botón "Otra").
  const [password, setPassword] = useState(contrasenaInicial)
  const [copiado, setCopiado] = useState(false)

  if (estado.hecho) {
    const { hecho } = estado
    const datosDeEntrada = `Email: ${hecho.email}\nContraseña: ${hecho.password}`

    return (
      <div className="tarjeta space-y-4">
        {hecho.resultado === 'creado' ? (
          <>
            <p className="font-semibold">Cuenta creada. Pasale estos datos al socio:</p>
            <pre className="whitespace-pre-wrap rounded-medio bg-hundido p-3 text-sm">{datosDeEntrada}</pre>
            <p className="text-sm text-texto-secundario">
              La contraseña no se vuelve a mostrar. El socio la puede cambiar desde la app, en Perfil.
            </p>
            <button
              type="button" className="boton boton-principal"
              onClick={async () => {
                await navigator.clipboard.writeText(datosDeEntrada)
                setCopiado(true)
              }}
            >
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </>
        ) : (
          <p>
            Esta persona ya tenía cuenta en la app: quedó como socio de este gimnasio y entra con su
            contraseña de siempre.
          </p>
        )}
        <Link href={`/socios/${hecho.membershipId}`} className="boton boton-secundario">
          Ir a su ficha para sacarle la foto
        </Link>
      </div>
    )
  }

  const v = estado.valores

  return (
    <form action={accion} className="tarjeta space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="etiqueta">Nombre</span>
          <input name="nombre" defaultValue={v?.nombre} required autoComplete="off" className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Apellido</span>
          <input name="apellido" defaultValue={v?.apellido} required autoComplete="off" className="campo" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="etiqueta">Email</span>
        <input name="email" type="email" defaultValue={v?.email} required autoComplete="off" className="campo" />
      </label>
      <label className="block space-y-1">
        <span className="etiqueta">Teléfono (opcional)</span>
        <input name="telefono" type="tel" defaultValue={v?.telefono} autoComplete="off" className="campo" />
      </label>
      <label className="block space-y-1">
        <span className="etiqueta">Contraseña inicial</span>
        <div className="flex gap-2">
          <input
            name="password" value={password} onChange={(ev) => setPassword(ev.target.value)}
            required minLength={8} autoComplete="off" className="campo font-mono"
          />
          <button type="button" className="boton boton-secundario" onClick={() => setPassword(generarContrasena())}>
            Otra
          </button>
        </div>
      </label>

      {estado.error && <p role="alert" className="text-sm text-rechazo">{estado.error}</p>}

      <button type="submit" disabled={pendiente} className="boton boton-principal">
        {pendiente ? 'Creando…' : 'Crear cuenta'}
      </button>
    </form>
  )
}
```

> Si después de un error los campos quedan vacíos en vez de mostrar `valores`, es el reseteo de formularios de React 19: agregar `key={JSON.stringify(v ?? {})}` al `<form>` para que se vuelva a montar con los `defaultValue` nuevos.

- [ ] **Step 4: Verificar tipos y lint**

Run (en `apps/panel`): `npx tsc --noEmit` y `npm run lint`
Expected: sin errores.

- [ ] **Step 5: Verificar a mano**

Con `npx supabase functions serve` en otra terminal y `npm run dev` en `apps/panel`, entrar como el admin del seed:
1. `/socios`: cada tarjeta tiene iniciales y "Sin pagos registrados" en rojo; el buscador y los tres filtros cambian la lista y la URL.
2. *Nuevo socio* → completar → *Crear cuenta*: aparece la pantalla con email y contraseña y *Copiar* los copia.
3. Repetir con el mismo email en mayúsculas: lleva a la ficha con `?aviso=ya-es-socio` (la ficha da 404 hasta la tarea 10; alcanza con ver la URL).
4. Un email inválido muestra "Ese email no es válido" y los demás campos siguen escritos.

- [ ] **Step 6: Commit**

```bash
git add "apps/panel/src/app/(panel)/socios"
git commit -m "Dar de alta socios desde el panel y ver el estado de su cuota

La contraseña inicial se muestra una sola vez, lista para copiar y
pasar por mensaje. La lista suma el filtro de quienes no tienen la
cuota al día, que es la que mira quien cobra.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 10: Panel — la ficha del socio

**Files:**
- Modify: `apps/panel/src/app/(panel)/socios/acciones.ts`
- Create: `apps/panel/src/app/(panel)/socios/[id]/page.tsx`
- Create: `apps/panel/src/app/(panel)/socios/[id]/foto-socio.tsx`
- Create: `apps/panel/src/app/(panel)/socios/[id]/formulario-pago.tsx`
- Create: `apps/panel/src/app/(panel)/socios/[id]/formulario-datos.tsx`
- Create: `apps/panel/src/app/(panel)/socios/[id]/registrar-entrada.tsx`

**Interfaces:**
- Consumes: todo lo de la tarea 8; `Resultado` de `acciones.ts` (tarea 9); `periodoPropuesto`, `montoPropuesto`, `textoPeriodo`, `formatearFecha`, `primerDiaDelMes`, `METODOS_PAGO`, `ETIQUETA_METODO_PAGO`, `validarPago`, `aNumero`, `esCodigoQr`, `estadoCuota` de `@gym/core`; RPC `editar_datos_socio`, `checkin_por_qr`, `checkin_manual` (tareas 2 y 3); bucket `fotos-socios` (tarea 4).
- Produces, en `socios/acciones.ts`:
  - `type EstadoPago = { error?: string; ok?: boolean; valores?: Record<string, string> }`
  - `registrarPago(previo: EstadoPago, datos: FormData): Promise<EstadoPago>` — campos `membership_id`, `periodo_desde`, `periodo_hasta`, `monto`, `metodo`, `fecha_pago`, `notas`.
  - `borrarPago(id: string, membershipId: string): Promise<Resultado>`
  - `guardarFoto(membershipId: string, ruta: string): Promise<Resultado>`
  - `type EstadoDatos = { error?: string; ok?: boolean }`; `editarDatos(previo: EstadoDatos, datos: FormData): Promise<EstadoDatos>` — campos `membership_id`, `nombre`, `apellido`, `telefono`.
  - `cambiarEstado(membershipId: string, estado: 'activo' | 'inactivo'): Promise<Resultado>`
  - `regenerarQr(membershipId: string): Promise<Resultado>`
  - `type ResultadoEntrada = { tipo: 'valido'; membershipId: string; nombre: string; fotoUrl: string | null; nuevo: boolean; hora: string; estado: EstadoCuota } | { tipo: 'invalido' } | { tipo: 'error' }`
  - `escanear(codigo: string): Promise<ResultadoEntrada>`
  - `entradaManual(membershipId: string): Promise<ResultadoEntrada>`
  - `borrarEntrada(id: string): Promise<Resultado>`
  - La sección de pagos lleva `id="pago"`: el escaneo enlaza a `/socios/<id>#pago`.

- [ ] **Step 1: Las acciones de la ficha y del check-in**

En `apps/panel/src/app/(panel)/socios/acciones.ts`, cambiar los imports del principio por:

```ts
import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { FunctionsHttpError } from '@supabase/supabase-js'
import {
  METODOS_PAGO, aNumero, esCodigoQr, estadoCuota, hoyEnZona, normalizarEmail, validarAlta, validarPago,
  type EstadoCuota, type MetodoPago, type PeriodoCuota,
} from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { miMembresia } from '@/lib/membresia'
import { urlsDeFotos } from '@/lib/fotos'
```

Y agregar al final del archivo:

```ts
// ---------------------------------------------------------------------------
// Ficha: pagos, foto, datos, baja, QR
// ---------------------------------------------------------------------------

const revalidarSocio = (membershipId: string) => {
  revalidatePath(`/socios/${membershipId}`)
  revalidatePath('/socios')
}

export type EstadoPago = { error?: string; ok?: boolean; valores?: Record<string, string> }

export async function registrarPago(_previo: EstadoPago, datos: FormData): Promise<EstadoPago> {
  const valores = Object.fromEntries(
    ['periodo_desde', 'periodo_hasta', 'monto', 'metodo', 'fecha_pago', 'notas'].map((c) => [c, texto(datos, c)]),
  )
  const membershipId = texto(datos, 'membership_id')
  const pago = {
    periodo_desde: valores.periodo_desde ?? '',
    periodo_hasta: valores.periodo_hasta ?? '',
    monto: aNumero(valores.monto ?? ''),
  }
  const invalido = validarPago(pago)
  if (invalido) return { error: invalido, valores }
  if (!METODOS_PAGO.includes(valores.metodo as MetodoPago)) return { error: 'Elegí cómo pagó', valores }

  const yo = await miMembresia()
  if (!yo) return { error: SESION_VENCIDA, valores }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('cuotas').insert({
    gym_id: yo.gym_id,
    membership_id: membershipId,
    ...pago,
    metodo: valores.metodo as MetodoPago,
    fecha_pago: valores.fecha_pago || hoyEnZona(yo.zona),
    notas: valores.notas || null,
    registrado_por: yo.id,
  })
  if (error) return { error: 'No pudimos registrar el pago', valores }

  revalidarSocio(membershipId)
  return { ok: true }
}

export async function borrarPago(id: string, membershipId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  // El .select() no es decorativo: un delete que la RLS niega no da error,
  // borra cero filas.
  const { data, error } = await supabase.from('cuotas').delete().eq('id', id).select('id')
  if (error || !data?.length) return { error: 'No pudimos borrar el pago' }
  revalidarSocio(membershipId)
  return {}
}

export async function guardarFoto(membershipId: string, ruta: string): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('memberships').update({ foto: ruta }).eq('id', membershipId).select('id')
  if (error || !data?.length) return { error: 'No pudimos guardar la foto' }
  revalidarSocio(membershipId)
  return {}
}

export type EstadoDatos = { error?: string; ok?: boolean }

export async function editarDatos(_previo: EstadoDatos, datos: FormData): Promise<EstadoDatos> {
  const membershipId = texto(datos, 'membership_id')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('editar_datos_socio', {
    p_membership_id: membershipId,
    p_nombre: texto(datos, 'nombre'),
    p_apellido: texto(datos, 'apellido'),
    p_telefono: texto(datos, 'telefono'),
  })
  if (error?.code === '22023') return { error: 'Poné el nombre' }
  if (error) return { error: 'No pudimos guardar los datos' }
  revalidarSocio(membershipId)
  return { ok: true }
}

export async function cambiarEstado(membershipId: string, estado: 'activo' | 'inactivo'): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('memberships').update({ estado }).eq('id', membershipId).select('id')
  if (error || !data?.length) return { error: 'No pudimos cambiar el estado' }
  revalidarSocio(membershipId)
  return {}
}

/**
 * Para cuando el socio sospecha que alguien usa su código. El viejo deja de
 * servir en el acto; el teléfono del socio muestra el nuevo la próxima vez
 * que abra Perfil con señal.
 */
export async function regenerarQr(membershipId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('memberships')
    .update({ codigo_qr: randomBytes(16).toString('hex') })
    .eq('id', membershipId)
    .select('id')
  if (error || !data?.length) return { error: 'No pudimos regenerar el código' }
  return {}
}

// ---------------------------------------------------------------------------
// Check-in: lo usan la ficha y la pantalla de escaneo
// ---------------------------------------------------------------------------

export type ResultadoEntrada =
  | { tipo: 'valido'; membershipId: string; nombre: string; fotoUrl: string | null; nuevo: boolean; hora: string; estado: EstadoCuota }
  | { tipo: 'invalido' }
  | { tipo: 'error' }

/** Lo que devuelven checkin_por_qr y checkin_manual (0018). */
type RespuestaCheckin =
  | { valido: false }
  | {
      valido: true
      membership_id: string
      nombre: string
      apellido: string
      foto: string | null
      nuevo: boolean
      hora_entrada: string
      hoy: string
      cuotas: PeriodoCuota[]
    }

async function aResultado(respuesta: { data: unknown; error: unknown }): Promise<ResultadoEntrada> {
  if (respuesta.error || !respuesta.data) return { tipo: 'error' }
  const r = respuesta.data as RespuestaCheckin
  if (!r.valido) return { tipo: 'invalido' }

  const yo = await miMembresia()
  const supabase = await crearClienteServidor()
  const fotos = await urlsDeFotos(supabase, [r.foto])
  const hora = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit', minute: '2-digit', timeZone: yo?.zona ?? 'America/Argentina/Buenos_Aires',
  }).format(new Date(r.hora_entrada))

  revalidatePath('/asistencia')
  revalidatePath(`/socios/${r.membership_id}`)

  return {
    tipo: 'valido',
    membershipId: r.membership_id,
    nombre: `${r.nombre} ${r.apellido}`.trim() || 'Sin nombre',
    fotoUrl: r.foto ? fotos.get(r.foto) ?? null : null,
    nuevo: r.nuevo,
    hora,
    // `hoy` lo calcula la base en la zona del gimnasio: el mismo "hoy" con el
    // que decidió el día de la entrada.
    estado: estadoCuota(r.cuotas, r.hoy),
  }
}

export async function escanear(codigo: string): Promise<ResultadoEntrada> {
  // El navegador ya filtra con debeProcesarLectura; esto cubre a quien llame
  // la acción directamente.
  if (!esCodigoQr(codigo)) return { tipo: 'invalido' }
  const supabase = await crearClienteServidor()
  return aResultado(await supabase.rpc('checkin_por_qr', { p_codigo: codigo }))
}

export async function entradaManual(membershipId: string): Promise<ResultadoEntrada> {
  const supabase = await crearClienteServidor()
  return aResultado(await supabase.rpc('checkin_manual', { p_membership_id: membershipId }))
}

export async function borrarEntrada(id: string): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('checkins').delete().eq('id', id).select('id, membership_id')
  if (error || !data?.length) return { error: 'No pudimos borrar la entrada' }
  revalidatePath('/asistencia')
  revalidatePath(`/socios/${data[0]!.membership_id}`)
  return {}
}
```

- [ ] **Step 2: La foto**

Crear `apps/panel/src/app/(panel)/socios/[id]/foto-socio.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { AvatarSocio } from '@/components/avatar-socio'
import { guardarFoto } from '../acciones'

const LADO_MAXIMO = 800
// La foto que sale de la cámara de un celular pasa fácil los 5 MB; lo que
// sube es la reducida, que queda muy por debajo del límite del bucket.
const TAMANO_MAXIMO_ORIGINAL = 20 * 1024 * 1024

/**
 * Reduce a 800 px de lado mayor y pasa a JPEG. Para reconocer una cara
 * alcanza de sobra, y el bucket solo acepta JPEG (0019).
 */
async function reducir(archivo: File): Promise<Blob> {
  const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(imagen.width * escala)
  lienzo.height = Math.round(imagen.height * escala)
  lienzo.getContext('2d')!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
  imagen.close()
  return new Promise((resolver, rechazar) =>
    lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No se pudo convertir'))), 'image/jpeg', 0.85),
  )
}

export function FotoSocio({ membershipId, gymId, nombre, url, puedeCambiar }: {
  membershipId: string
  gymId: string
  nombre: string
  url: string | null
  puedeCambiar: boolean
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function alElegir(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    // Se vacía para que elegir la misma foto otra vez vuelva a disparar el evento.
    evento.target.value = ''
    if (!archivo) return
    if (!archivo.type.startsWith('image/') || archivo.size > TAMANO_MAXIMO_ORIGINAL) {
      setError('Elegí una imagen de hasta 20 MB')
      return
    }

    setSubiendo(true)
    setError(null)
    try {
      const jpeg = await reducir(archivo)
      const ruta = `${gymId}/${membershipId}.jpg`
      const { error: errorSubida } = await crearClienteNavegador()
        .storage.from('fotos-socios')
        .upload(ruta, jpeg, { contentType: 'image/jpeg', upsert: true })
      if (errorSubida) throw errorSubida
      const r = await guardarFoto(membershipId, ruta)
      if (r.error) throw new Error(r.error)
    } catch {
      setError('No pudimos guardar la foto, probá de nuevo')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <AvatarSocio nombre={nombre} url={url} grande />
      {puedeCambiar && (
        <>
          {/* capture="environment": la saca el empleado, con la cámara de
              atrás. En la computadora abre el selector de archivos. */}
          <input ref={entrada} type="file" accept="image/*" capture="environment" hidden onChange={alElegir} />
          <button type="button" disabled={subiendo} className="boton boton-secundario"
            onClick={() => entrada.current?.click()}>
            <Camera size={16} /> {subiendo ? 'Subiendo…' : url ? 'Cambiar foto' : 'Sacar foto'}
          </button>
        </>
      )}
      {error && <p role="alert" className="text-center text-sm text-rechazo">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: El formulario de pago**

Crear `apps/panel/src/app/(panel)/socios/[id]/formulario-pago.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { ETIQUETA_METODO_PAGO, METODOS_PAGO, type MetodoPago, type PeriodoCuota } from '@gym/core'
import { registrarPago, type EstadoPago } from '../acciones'

const INICIAL: EstadoPago = {}

/**
 * Todo viene propuesto: período (un mes desde el vencimiento anterior), monto
 * (el del último pago) y método (el último usado). El admin confirma o
 * corrige. "Vence el" es el primer día sin cobertura, igual que en la base.
 */
export function FormularioPago({ membershipId, propuesto, monto, metodo, hoy }: {
  membershipId: string
  propuesto: PeriodoCuota
  monto: number | null
  metodo: MetodoPago
  hoy: string
}) {
  const [estado, accion, pendiente] = useActionState(registrarPago, INICIAL)
  const v = estado.valores

  return (
    <form action={accion} className="space-y-3 rounded-medio bg-hundido p-3">
      <input type="hidden" name="membership_id" value={membershipId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="etiqueta">Desde</span>
          <input name="periodo_desde" type="date" required defaultValue={v?.periodo_desde ?? propuesto.periodo_desde} className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Vence el</span>
          <input name="periodo_hasta" type="date" required defaultValue={v?.periodo_hasta ?? propuesto.periodo_hasta} className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Monto</span>
          <input name="monto" inputMode="decimal" required defaultValue={v?.monto ?? (monto ?? '')} className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Cómo pagó</span>
          <select name="metodo" defaultValue={v?.metodo ?? metodo} className="campo">
            {METODOS_PAGO.map((m) => <option key={m} value={m}>{ETIQUETA_METODO_PAGO[m]}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Fecha de pago</span>
          <input name="fecha_pago" type="date" required defaultValue={v?.fecha_pago ?? hoy} className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Notas (opcional)</span>
          <input name="notas" defaultValue={v?.notas} className="campo" />
        </label>
      </div>
      {estado.error && <p role="alert" className="text-sm text-rechazo">{estado.error}</p>}
      {estado.ok && <p role="status" className="text-sm text-vigente">Pago registrado.</p>}
      <button type="submit" disabled={pendiente} className="boton boton-principal">
        {pendiente ? 'Guardando…' : 'Registrar pago'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Los datos y la entrada manual**

Crear `apps/panel/src/app/(panel)/socios/[id]/formulario-datos.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { editarDatos, type EstadoDatos } from '../acciones'

const INICIAL: EstadoDatos = {}

export function FormularioDatos({ membershipId, nombre, apellido, telefono }: {
  membershipId: string
  nombre: string
  apellido: string
  telefono: string | null
}) {
  const [estado, accion, pendiente] = useActionState(editarDatos, INICIAL)

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="membership_id" value={membershipId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="etiqueta">Nombre</span>
          <input name="nombre" required defaultValue={nombre} className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Apellido</span>
          <input name="apellido" defaultValue={apellido} className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Teléfono</span>
          <input name="telefono" type="tel" defaultValue={telefono ?? ''} className="campo" />
        </label>
      </div>
      <p className="text-xs text-texto-tenue">
        El nombre y el teléfono son de la persona: si también es socio de otro gimnasio de la plataforma, allá se ve el cambio.
      </p>
      {estado.error && <p role="alert" className="text-sm text-rechazo">{estado.error}</p>}
      {estado.ok && <p role="status" className="text-sm text-vigente">Datos guardados.</p>}
      <button type="submit" disabled={pendiente} className="boton boton-secundario">
        {pendiente ? 'Guardando…' : 'Guardar datos'}
      </button>
    </form>
  )
}
```

Crear `apps/panel/src/app/(panel)/socios/[id]/registrar-entrada.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { entradaManual, type ResultadoEntrada } from '../acciones'

/** El check-in manual desde la ficha: para cuando el socio no trae el teléfono. */
export function RegistrarEntrada({ membershipId }: { membershipId: string }) {
  const [resultado, setResultado] = useState<ResultadoEntrada | null>(null)
  const [pendiente, iniciar] = useTransition()

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        type="button" disabled={pendiente} className="boton boton-secundario"
        onClick={() => iniciar(async () => setResultado(await entradaManual(membershipId)))}
      >
        {pendiente ? 'Registrando…' : 'Registrar entrada'}
      </button>
      {resultado?.tipo === 'valido' && (
        <span className="text-vigente">
          {resultado.nuevo ? `Entrada registrada ${resultado.hora}` : `Ya registró entrada hoy a las ${resultado.hora}`}
        </span>
      )}
      {resultado?.tipo === 'invalido' && <span className="text-rechazo">La membresía no está activa.</span>}
      {resultado?.tipo === 'error' && <span className="text-rechazo">No pudimos registrar la entrada, probá de nuevo.</span>}
    </div>
  )
}
```

- [ ] **Step 5: La página de la ficha**

Crear `apps/panel/src/app/(panel)/socios/[id]/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ETIQUETA_METODO_PAGO, estadoCuota, formatearFecha, hoyEnZona, montoPropuesto, periodoPropuesto,
  primerDiaDelMes, puede, textoPeriodo,
} from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { miMembresia } from '@/lib/membresia'
import { urlsDeFotos } from '@/lib/fotos'
import { nombreCompleto } from '@/components/avatar-socio'
import { EtiquetaCuota } from '@/components/etiqueta-cuota'
import { BotonConfirmar } from '@/components/boton-confirmar'
import { borrarEntrada, borrarPago, cambiarEstado, regenerarQr } from '../acciones'
import { FotoSocio } from './foto-socio'
import { FormularioPago } from './formulario-pago'
import { FormularioDatos } from './formulario-datos'
import { RegistrarEntrada } from './registrar-entrada'

export default async function FichaSocio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aviso?: string }>
}) {
  const { id } = await params
  const { aviso } = await searchParams
  const yo = await miMembresia()
  if (!yo) return null

  const supabase = await crearClienteServidor()
  // RLS ya devuelve vacío si la membresía es de otro gimnasio.
  const { data: socio } = await supabase
    .from('memberships')
    .select('id, gym_id, estado, fecha_alta, foto, profiles ( nombre, apellido, telefono )')
    .eq('id', id)
    .maybeSingle()
  if (!socio) notFound()

  const hoy = hoyEnZona(yo.zona)
  const [{ data: cuotas }, { count: vecesEsteMes }, { data: entradas }, fotos] = await Promise.all([
    supabase
      .from('cuotas')
      .select('id, periodo_desde, periodo_hasta, monto, moneda, metodo, fecha_pago, notas, created_at')
      .eq('membership_id', id)
      .order('periodo_desde', { ascending: false }),
    supabase
      .from('checkins').select('id', { count: 'exact', head: true })
      .eq('membership_id', id).gte('dia', primerDiaDelMes(hoy)),
    supabase
      .from('checkins').select('id, created_at, metodo')
      .eq('membership_id', id).order('created_at', { ascending: false }).limit(10),
    urlsDeFotos(supabase, [socio.foto]),
  ])

  const pagos = cuotas ?? []
  const esAdmin = puede(yo.rol, 'gestionar_socios')
  const activo = socio.estado === 'activo'
  const nombre = nombreCompleto(socio.profiles)
  const estado = estadoCuota(pagos, hoy)
  const propuesto = periodoPropuesto(pagos, hoy)
  const ultimo = [...pagos].sort((a, b) =>
    (b.fecha_pago + b.created_at).localeCompare(a.fecha_pago + a.created_at))[0]

  const plata = (monto: number, moneda: string) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(monto)
  const momento = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: yo.zona,
  })

  return (
    <div className="space-y-6">
      <Link href="/socios" className="enlace text-sm">← Socios</Link>

      {aviso === 'ya-es-socio' && (
        <p className="tarjeta text-texto-secundario">Esta persona ya era socio de este gimnasio.</p>
      )}

      <section className="tarjeta flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <FotoSocio
          membershipId={socio.id} gymId={socio.gym_id} nombre={nombre}
          url={socio.foto ? fotos.get(socio.foto) ?? null : null} puedeCambiar={esAdmin}
        />
        <div className="space-y-2 text-center sm:text-left">
          <h1 className="titulo-pagina">{nombre}</h1>
          <p className="text-sm text-texto-secundario">
            {socio.profiles?.telefono ?? 'Sin teléfono'} · Socio desde el {formatearFecha(socio.fecha_alta, true)}
          </p>
          {activo
            ? <EtiquetaCuota estado={estado} grande />
            : <span className="inline-flex min-h-7 items-center rounded-full bg-rechazo-suave px-3 text-xs font-semibold text-rechazo">Dado de baja</span>}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section id="pago" className="tarjeta space-y-4">
          <h2 className="text-lg font-semibold">Pagos</h2>
          {esAdmin && activo && (
            // key: al registrar un pago cambia el período propuesto y el
            // formulario se vuelve a montar con los valores nuevos.
            <FormularioPago
              key={propuesto.periodo_desde}
              membershipId={socio.id} propuesto={propuesto} hoy={hoy}
              monto={montoPropuesto(pagos)} metodo={ultimo?.metodo ?? 'efectivo'}
            />
          )}
          {pagos.length === 0 ? (
            <p className="text-sm text-texto-tenue">Todavía no hay pagos registrados.</p>
          ) : (
            <ul className="space-y-2">
              {pagos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-medio bg-hundido px-3 py-2 text-sm">
                  <div>
                    <p className="font-semibold tabular-nums">{textoPeriodo(c)} · {plata(c.monto, c.moneda)}</p>
                    <p className="text-xs text-texto-secundario">
                      {ETIQUETA_METODO_PAGO[c.metodo]} · pagó el {formatearFecha(c.fecha_pago, true)}
                      {c.notas && ` · ${c.notas}`}
                    </p>
                  </div>
                  {esAdmin && (
                    <BotonConfirmar
                      texto="Borrar" pregunta="¿Borrar este pago?" confirmar="Borrar" peligro
                      accion={borrarPago.bind(null, c.id, socio.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tarjeta space-y-4">
          <h2 className="text-lg font-semibold">Asistencias</h2>
          <p className="text-sm">
            <span className="text-2xl font-bold tabular-nums">{vecesEsteMes ?? 0}</span>{' '}
            {vecesEsteMes === 1 ? 'vez' : 'veces'} este mes
          </p>
          {activo && <RegistrarEntrada membershipId={socio.id} />}
          {(entradas ?? []).length === 0 ? (
            <p className="text-sm text-texto-tenue">Todavía no registró entradas.</p>
          ) : (
            <ul className="space-y-1 text-sm tabular-nums">
              {(entradas ?? []).map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2">
                  <span>{momento.format(new Date(x.created_at))} · {x.metodo === 'qr' ? 'QR' : 'a mano'}</span>
                  {esAdmin && (
                    <BotonConfirmar
                      texto="Borrar" pregunta="¿Borrar esta entrada?" confirmar="Borrar" peligro
                      accion={borrarEntrada.bind(null, x.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {esAdmin && (
        <section className="tarjeta space-y-4">
          <h2 className="text-lg font-semibold">Datos y cuenta</h2>
          <FormularioDatos
            membershipId={socio.id}
            nombre={socio.profiles?.nombre ?? ''} apellido={socio.profiles?.apellido ?? ''}
            telefono={socio.profiles?.telefono ?? null}
          />
          <div className="flex flex-wrap gap-3 border-t border-superficie-borde pt-4">
            {activo ? (
              <BotonConfirmar
                texto="Dar de baja" pregunta={`¿Dar de baja a ${nombre}? Deja de poder entrar y de usar la app.`}
                confirmar="Dar de baja" peligro accion={cambiarEstado.bind(null, socio.id, 'inactivo')}
              />
            ) : (
              <BotonConfirmar
                texto="Reactivar" pregunta={`¿Reactivar a ${nombre}?`}
                confirmar="Reactivar" accion={cambiarEstado.bind(null, socio.id, 'activo')}
              />
            )}
            <BotonConfirmar
              texto="Regenerar QR"
              pregunta="El código actual deja de servir. El socio ve el nuevo la próxima vez que abra Perfil con señal."
              confirmar="Regenerar" accion={regenerarQr.bind(null, socio.id)}
            />
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Verificar tipos y lint**

Run (en `apps/panel`): `npx tsc --noEmit` y `npm run lint`
Expected: sin errores. Si `c.metodo` no es `MetodoPago` para `ETIQUETA_METODO_PAGO`, es que faltó `npm run db:tipos` después de la tarea 1: el enum `metodo_pago` tiene que estar en `tipos-db.ts`.

- [ ] **Step 7: Verificar a mano**

Como admin, en la ficha del socio creado en la tarea 9:
1. *Sacar foto* → elegir una imagen grande del disco: aparece la foto redonda; en el bucket `fotos-socios` (Studio, `http://127.0.0.1:54323`) el objeto pesa menos de 200 KB.
2. *Registrar pago* con lo propuesto: la etiqueta pasa a verde "Vigente hasta …" y el formulario propone el mes siguiente. *Borrar* → *Borrar*: vuelve a rojo.
3. *Registrar entrada*: "Entrada registrada HH:MM"; otra vez: "Ya registró entrada hoy a las HH:MM"; el contador dice 1.
4. Editar el teléfono → *Guardar datos*: se ve el nuevo arriba.
5. *Dar de baja* → confirmar: "Dado de baja", sin formulario de pago ni entrada; aparece en el filtro *Inactivos* de la lista. *Reactivar* la vuelve.
6. Como entrenador: la ficha se ve sin botones de foto, pago, borrar ni datos, y *Registrar entrada* funciona.

- [ ] **Step 8: Commit**

```bash
git add "apps/panel/src/app/(panel)/socios"
git commit -m "Armar la ficha del socio con foto, pagos y asistencias

El período, el monto y el método del pago vienen propuestos para que
cobrar sea confirmar. La foto se reduce en el navegador antes de subir:
la del celular pesa megas y para reconocer una cara alcanza con mucho
menos.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 11: Panel — escanear

**Files:**
- Modify: `apps/panel/package.json` (dependencia `qr-scanner`)
- Create: `apps/panel/src/app/(panel)/escanear/page.tsx`
- Create: `apps/panel/src/app/(panel)/escanear/escaner.tsx`
- Create: `apps/panel/src/app/(panel)/escanear/tarjeta-entrada.tsx`
- Modify: `apps/panel/src/app/(panel)/nav-lateral.tsx`

**Interfaces:**
- Consumes: `escanear`, `entradaManual`, `ResultadoEntrada` de `socios/acciones.ts` (tarea 10); `debeProcesarLectura`, `estaAlDia`, `puede` de `@gym/core`; `AvatarSocio`, `EtiquetaCuota`, `nombreCompleto`, `miMembresia` (tarea 8).
- Produces: la ruta `/escanear` y su entrada en la navegación, primera en el celular.

- [ ] **Step 1: Instalar la librería de lectura**

Run (en la raíz del repo): `npm install qr-scanner@1.4.2 --workspace panel`
Expected: `apps/panel/package.json` tiene `"qr-scanner": "^1.4.2"` en `dependencies`.

> `qr-scanner` usa `BarcodeDetector` donde existe y un worker propio donde no (Safari en iPhone). Antes de escribir el componente, leer su README en `node_modules/qr-scanner/README.md`: la API de abajo es la de la 1.4 (`new QrScanner(video, alLeer, opciones)`, `start()`, `destroy()`).

- [ ] **Step 2: La tarjeta del resultado**

Crear `apps/panel/src/app/(panel)/escanear/tarjeta-entrada.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { estaAlDia } from '@gym/core'
import { AvatarSocio } from '@/components/avatar-socio'
import { EtiquetaCuota } from '@/components/etiqueta-cuota'
import type { ResultadoEntrada } from '../socios/acciones'

/**
 * Lo que el empleado mira en el mostrador: la foto contra la cara, y la
 * cuota en verde o rojo. Control de acceso y control de cobranza en el mismo
 * gesto (sección 9 del diseño general).
 */
export function TarjetaEntrada({ resultado, esAdmin, alCerrar }: {
  resultado: ResultadoEntrada
  esAdmin: boolean
  alCerrar: () => void
}) {
  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-velo p-4 sm:items-center" role="dialog" aria-live="assertive">
      <div className="tarjeta w-full max-w-md space-y-4 bg-fondo p-6 text-center">
        {resultado.tipo === 'valido' && (
          <>
            <div className="flex justify-center">
              <AvatarSocio nombre={resultado.nombre} url={resultado.fotoUrl} grande />
            </div>
            <p className="text-2xl font-bold">{resultado.nombre}</p>
            <EtiquetaCuota estado={resultado.estado} grande />
            <p className={resultado.nuevo ? 'text-vigente' : 'text-texto-secundario'}>
              {resultado.nuevo
                ? `Entrada registrada ${resultado.hora}`
                : `Ya registró entrada hoy a las ${resultado.hora}`}
            </p>
            {esAdmin && !estaAlDia(resultado.estado) && (
              <Link href={`/socios/${resultado.membershipId}#pago`} className="boton boton-principal w-full">
                Registrar pago
              </Link>
            )}
          </>
        )}
        {resultado.tipo === 'invalido' && (
          <p className="text-2xl font-bold text-rechazo">QR no válido</p>
        )}
        {resultado.tipo === 'error' && (
          <p className="text-lg font-semibold text-rechazo">No pudimos registrar la entrada, probá de nuevo.</p>
        )}
        <button type="button" className="boton boton-secundario w-full" onClick={alCerrar}>
          Seguir escaneando
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: El escáner y el check-in manual**

Crear `apps/panel/src/app/(panel)/escanear/escaner.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { debeProcesarLectura } from '@gym/core'
import { entradaManual, escanear, type ResultadoEntrada } from '../socios/acciones'
import { TarjetaEntrada } from './tarjeta-entrada'

const CIERRE_AUTOMATICO_MS = 5000

export function Escaner({ socios, esAdmin }: {
  socios: { id: string; nombre: string }[]
  esAdmin: boolean
}) {
  const video = useRef<HTMLVideoElement>(null)
  const ultima = useRef<{ codigo: string; en: number } | null>(null)
  // En un ref y no solo en el estado: el callback del escáner se arma una
  // vez y tiene que ver el valor de ahora, no el de cuando se creó.
  const ocupado = useRef(false)
  const [resultado, setResultado] = useState<ResultadoEntrada | null>(null)
  const [camara, setCamara] = useState<'iniciando' | 'activa' | 'sin-camara'>('iniciando')
  const [busqueda, setBusqueda] = useState('')

  const mostrar = useCallback((r: ResultadoEntrada) => {
    ocupado.current = true
    setResultado(r)
  }, [])

  const cerrar = useCallback(() => {
    ocupado.current = false
    setResultado(null)
  }, [])

  useEffect(() => {
    let escaner: { destroy: () => void } | null = null
    let vivo = true

    // Import dinámico: la librería toca `window` y el worker, y esta página
    // también se renderiza en el servidor.
    void import('qr-scanner').then(async ({ default: QrScanner }) => {
      if (!vivo || !video.current) return
      const instancia = new QrScanner(
        video.current,
        async ({ data }) => {
          const ahora = Date.now()
          // Review Focus 2: la cámara lee el mismo QR muchas veces por segundo.
          if (ocupado.current || !debeProcesarLectura(data, ultima.current, ahora)) return
          ultima.current = { codigo: data, en: ahora }
          ocupado.current = true
          mostrar(await escanear(data))
        },
        { preferredCamera: 'environment', highlightScanRegion: true, maxScansPerSecond: 5, returnDetailedScanResult: true },
      )
      escaner = instancia
      try {
        await instancia.start()
        if (vivo) setCamara('activa')
      } catch {
        // Permiso negado, sin cámara o página sin HTTPS: los tres se arreglan
        // fuera de la app, y el buscador manual sigue andando.
        if (vivo) setCamara('sin-camara')
      }
    })

    return () => {
      vivo = false
      escaner?.destroy()
    }
  }, [mostrar])

  useEffect(() => {
    if (!resultado) return
    const temporizador = setTimeout(cerrar, CIERRE_AUTOMATICO_MS)
    return () => clearTimeout(temporizador)
  }, [resultado, cerrar])

  const coincidencias = useMemo(() => {
    const b = busqueda.trim().toLowerCase()
    if (b.length < 2) return []
    return socios.filter((s) => s.nombre.toLowerCase().includes(b)).slice(0, 8)
  }, [busqueda, socios])

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-grande bg-hundido">
        <video ref={video} className="aspect-square w-full object-cover sm:aspect-video" muted playsInline />
        {camara === 'iniciando' && (
          <p className="absolute inset-0 flex items-center justify-center text-texto-secundario">Abriendo la cámara…</p>
        )}
        {camara === 'sin-camara' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-texto-secundario">
            No pudimos usar la cámara. Revisá que el navegador tenga permiso —el ícono a la izquierda de la
            dirección— y que la página se haya abierto con https. Mientras tanto, buscá al socio por nombre.
          </div>
        )}
      </div>

      <div className="tarjeta space-y-3">
        <label className="block space-y-1">
          <span className="etiqueta">¿No trae el teléfono? Buscalo por nombre</span>
          <input value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)} placeholder="Nombre o apellido" className="campo" />
        </label>
        {coincidencias.length > 0 && (
          <ul className="space-y-1">
            {coincidencias.map((s) => (
              <li key={s.id}>
                <button
                  type="button" className="boton boton-secundario w-full justify-start"
                  onClick={async () => {
                    setBusqueda('')
                    mostrar(await entradaManual(s.id))
                  }}
                >
                  {s.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {resultado && <TarjetaEntrada resultado={resultado} esAdmin={esAdmin} alCerrar={cerrar} />}
    </div>
  )
}
```

- [ ] **Step 4: La página**

Crear `apps/panel/src/app/(panel)/escanear/page.tsx`:

```tsx
import { puede } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { miMembresia } from '@/lib/membresia'
import { nombreCompleto } from '@/components/avatar-socio'
import { Escaner } from './escaner'

export default async function Escanear() {
  const yo = await miMembresia()
  if (!yo || !puede(yo.rol, 'escanear_checkin')) {
    return <p className="tarjeta text-texto-secundario">El check-in lo hace el personal del gimnasio.</p>
  }

  // Para el buscador manual. Se filtra en el navegador: la lista de socios
  // activos de un gimnasio entra cómoda en una página.
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from('memberships')
    .select('id, profiles ( nombre, apellido )')
    .eq('rol', 'socio')
    .eq('estado', 'activo')
  const socios = (data ?? [])
    .map((s) => ({ id: s.id, nombre: nombreCompleto(s.profiles) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="titulo-pagina">Escanear</h1>
      <Escaner socios={socios} esAdmin={puede(yo.rol, 'registrar_cuota')} />
    </div>
  )
}
```

- [ ] **Step 5: La entrada en la navegación**

En `apps/panel/src/app/(panel)/nav-lateral.tsx`, sumar `ScanLine` al import de `lucide-react` y agregar a `SECCIONES`, debajo de la de Socios:

```tsx
  { href: '/escanear', texto: 'Escanear', icono: ScanLine, primeroEnCelular: true },
```

- [ ] **Step 6: Verificar tipos y lint**

Run (en `apps/panel`): `npx tsc --noEmit` y `npm run lint`
Expected: sin errores.

- [ ] **Step 7: Verificar a mano desde el celular**

La cámara del navegador solo funciona con HTTPS (o en `localhost`).
1. En la computadora: `npm run dev -- --experimental-https` en `apps/panel`, y averiguar su IP en la red local (`ipconfig`).
2. En el celular, en la misma red Wi-Fi: abrir `https://<ip>:3000/escanear` y aceptar la advertencia del certificado. Si Supabase local no responde desde el celular, la URL de `NEXT_PUBLIC_SUPABASE_URL` tiene que apuntar a la IP de la computadora y no a `127.0.0.1`.
3. Mostrar a la cámara un QR con el código de un socio (sacarlo con Studio, `select codigo_qr from memberships`, y generar el QR con cualquier generador): aparece la tarjeta con foto, nombre, cuota y "Entrada registrada HH:MM"; se cierra sola a los 5 segundos.
4. Sostener el mismo QR: no aparece una segunda tarjeta enseguida; a los 5 segundos aparece "Ya registró entrada hoy a las …".
5. Un QR cualquiera (una URL): no pasa nada.
6. Un código de 32 caracteres inventado: "QR no válido".
7. Negar el permiso de cámara: aparece la explicación y el buscador manual sigue registrando entradas.

- [ ] **Step 8: Commit**

```bash
git add apps/panel/package.json package-lock.json "apps/panel/src/app/(panel)/escanear" "apps/panel/src/app/(panel)/nav-lateral.tsx"
git commit -m "Escanear el QR del socio desde el celular del mostrador

La tarjeta muestra foto, nombre y cuota en el mismo gesto que registra
la entrada. Las lecturas repetidas del mismo código se descartan, y sin
cámara el buscador por nombre sigue registrando entradas.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 12: Panel — asistencia del día

**Files:**
- Create: `apps/panel/src/app/(panel)/asistencia/page.tsx`
- Modify: `apps/panel/src/app/(panel)/nav-lateral.tsx`

**Interfaces:**
- Consumes: `miMembresia` (tarea 8); `BotonConfirmar` (tarea 8); `borrarEntrada` (tarea 10); `hoyEnZona`, `sumarDias`, `formatearFecha`, `puede` de `@gym/core`.
- Produces: la ruta `/asistencia?dia=AAAA-MM-DD` y su entrada en la navegación.

- [ ] **Step 1: La página**

Crear `apps/panel/src/app/(panel)/asistencia/page.tsx`:

```tsx
import Link from 'next/link'
import { formatearFecha, hoyEnZona, puede, sumarDias } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { miMembresia } from '@/lib/membresia'
import { nombreCompleto } from '@/components/avatar-socio'
import { BotonConfirmar } from '@/components/boton-confirmar'
import { borrarEntrada } from '../socios/acciones'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export default async function Asistencia({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>
}) {
  const yo = await miMembresia()
  if (!yo || !puede(yo.rol, 'escanear_checkin')) {
    return <p className="tarjeta text-texto-secundario">La asistencia la ve el personal del gimnasio.</p>
  }

  const hoy = hoyEnZona(yo.zona)
  const { dia: pedido } = await searchParams
  const dia = pedido && FECHA.test(pedido) ? pedido : hoy

  const supabase = await crearClienteServidor()
  // checkins tiene dos claves a memberships —el socio y quien registró—: el
  // nombre de la restricción le dice a PostgREST cuál es cuál.
  const { data: entradas } = await supabase
    .from('checkins')
    .select(`
      id, created_at, metodo, membership_id,
      socio:memberships!checkins_membresia_fk ( profiles ( nombre, apellido ) ),
      registrador:memberships!checkins_registrado_por_fkey ( profiles ( nombre, apellido ) )
    `)
    .eq('dia', dia)
    .order('created_at', { ascending: false })

  const hora = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: yo.zona })
  const esAdmin = puede(yo.rol, 'gestionar_socios')
  const lista = entradas ?? []

  return (
    <div className="space-y-6">
      <h1 className="titulo-pagina">Asistencia</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/asistencia?dia=${sumarDias(dia, -1)}`} className="boton boton-secundario">← Anterior</Link>
        <p className="min-w-32 text-center font-semibold tabular-nums">
          {dia === hoy ? 'Hoy' : formatearFecha(dia, true)}
        </p>
        {dia < hoy && (
          <Link href={`/asistencia?dia=${sumarDias(dia, 1)}`} className="boton boton-secundario">Siguiente →</Link>
        )}
        {dia !== hoy && <Link href="/asistencia" className="enlace text-sm">Volver a hoy</Link>}
      </div>

      <p className="text-sm text-texto-secundario">
        {lista.length} {lista.length === 1 ? 'entrada' : 'entradas'}
      </p>

      {lista.length === 0 ? (
        <p className="tarjeta text-texto-secundario">No hubo entradas este día.</p>
      ) : (
        <ul className="tarjeta divide-y divide-superficie-borde p-0">
          {lista.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="w-14 font-semibold tabular-nums">{hora.format(new Date(x.created_at))}</span>
              <Link href={`/socios/${x.membership_id}`} className="min-w-0 flex-1 truncate font-semibold">
                {nombreCompleto(x.socio?.profiles ?? null)}
              </Link>
              <span className="text-xs text-texto-secundario">
                {x.metodo === 'qr' ? 'QR' : 'A mano'}
                {x.registrador?.profiles && ` · ${x.registrador.profiles.nombre}`}
              </span>
              {esAdmin && (
                <BotonConfirmar
                  texto="Borrar" pregunta="¿Borrar esta entrada?" confirmar="Borrar" peligro
                  accion={borrarEntrada.bind(null, x.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

> Si `npx tsc` no reconoce `checkins_registrado_por_fkey`, mirar en `packages/core/src/tipos-db.ts`, en `checkins.Relationships`, el `foreignKeyName` real de la clave de `registrado_por` y usar ese.

- [ ] **Step 2: La entrada en la navegación**

En `apps/panel/src/app/(panel)/nav-lateral.tsx`, sumar `CalendarCheck` al import de `lucide-react` y agregar a `SECCIONES`, debajo de la de Escanear:

```tsx
  { href: '/asistencia', texto: 'Asistencia', icono: CalendarCheck },
```

- [ ] **Step 3: Verificar tipos y lint**

Run (en `apps/panel`): `npx tsc --noEmit` y `npm run lint`
Expected: sin errores.

- [ ] **Step 4: Verificar a mano**

Con las entradas registradas en las tareas 10 y 11: `/asistencia` lista las de hoy con hora, socio, método y quién la registró; *Anterior* muestra "No hubo entradas este día"; *Siguiente* no aparece en el día de hoy; como admin, *Borrar* → *Borrar* la quita.

- [ ] **Step 5: Commit**

```bash
git add "apps/panel/src/app/(panel)/asistencia" "apps/panel/src/app/(panel)/nav-lateral.tsx"
git commit -m "Mostrar las entradas del día en el panel

Lista quién entró, a qué hora y quién lo registró, con el día en la
zona del gimnasio. El admin puede borrar una entrada cargada por error.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 13: App — la pestaña Perfil

**Files:**
- Modify: `apps/movil/package.json` (dependencias `expo-brightness` y `react-native-qrcode-svg`)
- Modify: `apps/movil/src/lib/fechas.ts`
- Modify: `apps/movil/src/ui/texto.tsx`
- Create: `apps/movil/src/lib/perfil.ts`
- Create: `apps/movil/src/components/qr-socio.tsx`
- Create: `apps/movil/src/app/(tabs)/perfil.tsx`
- Modify: `apps/movil/src/app/(tabs)/_layout.tsx`
- Modify: `apps/movil/src/app/(tabs)/index.tsx`
- Modify: `packages/core/src/tema.ts`

**Interfaces:**
- Consumes: RPC `mi_codigo_qr` (tarea 2); `estadoCuota`, `estaAlDia`, `textoEstadoCuota`, `textoPeriodo`, `primerDiaDelMes`, `ETIQUETA_METODO_PAGO`, `COLORES.vigente` de `@gym/core` (tareas 5 y 6); `COLORES.qrFondo` y `COLORES.qrTinta`, que agrega esta tarea; `guardarCache`, `leerCache` de `@/lib/local/cola`; `conLimite`; `cerrarSesion` de `@/lib/cerrar-sesion`.
- Produces:
  - `cargarPerfil(): Promise<{ datos: DatosPerfil | null; conSenal: boolean }>` en `@/lib/perfil`.
  - `hoyLocal(): string` (`'AAAA-MM-DD'`), `horaCorta(iso: string): string` (`'18:40'`) y `fechaYHora(iso: string): string` (`'08/10 a las 19:20'`) en `@/lib/fechas`.
  - `<Texto tono="vigente">`.
  - La pantalla `perfil.tsx` deja un lugar marcado para `<CambiarContrasena />`, que suma la tarea 14.

- [ ] **Step 1: Instalar las dependencias**

Antes, leer en https://docs.expo.dev/versions/v57.0.0/sdk/brightness/ la API de `expo-brightness` de esta versión.

Run (en `apps/movil`): `npx expo install expo-brightness react-native-qrcode-svg`
Expected: las dos en `dependencies` de `apps/movil/package.json`.

> `expo-brightness` es un módulo nativo: la app instalada en el teléfono no lo tiene hasta compilar un APK nuevo (ver la memoria del proyecto sobre instalar en el celular). En Expo Go sí funciona.

- [ ] **Step 2: Fechas y el tono verde**

En `apps/movil/src/lib/fechas.ts`, agregar al final:

```ts
const dosCifras = (n: number) => String(n).padStart(2, '0')

/**
 * Hoy en el teléfono, como 'AAAA-MM-DD'. La app no usa la zona del gimnasio
 * —Intl con timeZone depende de cómo se compiló Hermes—: el socio está en la
 * misma ciudad que su gimnasio.
 */
export function hoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`
}

/** "18:40" */
export function horaCorta(iso: string): string {
  const d = new Date(iso)
  return `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`
}

/** "08/10 a las 19:20" */
export function fechaYHora(iso: string): string {
  const d = new Date(iso)
  return `${dosCifras(d.getDate())}/${dosCifras(d.getMonth() + 1)} a las ${horaCorta(iso)}`
}
```

En `apps/movil/src/ui/texto.tsx`, dentro de `TONOS`, debajo de `cian: COLORES.cian,`:

```ts
  vigente: COLORES.vigente,
```

- [ ] **Step 3: Los datos de Perfil, con y sin señal**

Crear `apps/movil/src/lib/perfil.ts`:

```ts
import { primerDiaDelMes, type MetodoPago, type PeriodoCuota } from '@gym/core'
import { supabase } from '@/lib/supabase'
import { conLimite } from '@/lib/con-limite'
import { hoyLocal } from '@/lib/fechas'
import { guardarCache, leerCache } from '@/lib/local/cola'

export interface PagoPerfil extends PeriodoCuota {
  monto: number
  metodo: MetodoPago
  fecha_pago: string
}

export interface DatosPerfil {
  /**
   * false = sin membresía activa. memberships_leer no deja ver una membresía
   * propia dada de baja, así que "dado de baja" y "nunca tuvo" se ven igual.
   */
  activa: boolean
  gym: string
  codigoQr: string | null
  /** Los últimos 24 por vencimiento: alcanzan para el estado, que encadena, y para la lista. */
  pagos: PagoPerfil[]
  vecesEsteMes: number
  /** El mes de `vecesEsteMes` ('AAAA-MM-01'): sin señal en el mes siguiente, ese número ya no aplica. */
  mes: string
  entradas: { id: string; created_at: string }[]
  /** Cuándo se trajo del servidor, para el "Actualizado el …" sin señal. */
  actualizado: string
}

// Por usuario: si en el teléfono entra otra persona, no ve el QR de la anterior.
const clave = (userId: string) => `perfil:${userId}`

/**
 * Con señal, trae todo y lo guarda; sin señal, lo último guardado. Lo que
 * importa sin señal es el QR: la puerta del gimnasio puede ser un subsuelo.
 */
export async function cargarPerfil(): Promise<{ datos: DatosPerfil | null; conSenal: boolean }> {
  // getSession y no getUser: lee el teléfono, no la red.
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return { datos: null, conSenal: false }

  const delServidor = await traer(userId)
  if (delServidor) {
    await guardarCache(clave(userId), delServidor)
    return { datos: delServidor, conSenal: true }
  }
  return { datos: await leerCache<DatosPerfil>(clave(userId)), conSenal: false }
}

/** null = sin señal o no llegó a tiempo. */
async function traer(userId: string): Promise<DatosPerfil | null> {
  const actualizado = new Date().toISOString()
  const mes = primerDiaDelMes(hoyLocal())

  // Filtra por user_id: memberships_leer deja ver todas las del gimnasio.
  const membresias = await conLimite(
    supabase
      .from('memberships')
      .select('id, gym_id, gyms ( nombre )')
      .eq('user_id', userId)
      .eq('estado', 'activo')
      .order('created_at')
      .limit(1),
  )
  if (!membresias || membresias.error) return null

  const m = membresias.data[0]
  if (!m) {
    return { activa: false, gym: '', codigoQr: null, pagos: [], vecesEsteMes: 0, mes, entradas: [], actualizado }
  }

  // Todo por membership_id propio: un entrenador que usa la app lee las
  // cuotas y entradas de todo su gimnasio.
  const [codigo, pagos, cuenta, entradas] = await Promise.all([
    conLimite(supabase.rpc('mi_codigo_qr', { p_gym_id: m.gym_id })),
    conLimite(
      supabase
        .from('cuotas')
        .select('periodo_desde, periodo_hasta, monto, metodo, fecha_pago')
        .eq('membership_id', m.id)
        .order('periodo_hasta', { ascending: false })
        .limit(24),
    ),
    conLimite(
      supabase
        .from('checkins')
        .select('id', { count: 'exact', head: true })
        .eq('membership_id', m.id)
        .gte('dia', mes),
    ),
    conLimite(
      supabase
        .from('checkins')
        .select('id, created_at')
        .eq('membership_id', m.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ),
  ])
  if (!codigo || codigo.error || !pagos || pagos.error || !cuenta || cuenta.error || !entradas || entradas.error) {
    return null
  }

  return {
    activa: true,
    gym: m.gyms?.nombre ?? '',
    codigoQr: codigo.data,
    pagos: pagos.data,
    vecesEsteMes: cuenta.count ?? 0,
    mes,
    entradas: entradas.data,
    actualizado,
  }
}
```

- [ ] **Step 4: El QR con el brillo al máximo**

Antes, agregar a `COLORES` en `packages/core/src/tema.ts`, debajo de `vigenteSuave`:

```ts
  /** El QR va negro sobre blanco puro aunque la app sea oscura: un lector lo toma mejor. */
  qrFondo: '#FFFFFF',
  qrTinta: '#000000',
```

(No van en `VARIABLES_CSS`: el panel no dibuja el QR.) Correr `npm run test:core` y confirmar que sigue en verde.

Crear `apps/movil/src/components/qr-socio.tsx`:

```tsx
import { useCallback } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Brightness from 'expo-brightness'
import QRCode from 'react-native-qrcode-svg'
import { COLORES, ESPACIO, RADIOS } from '@gym/core'

/**
 * El QR del socio. Mientras la pestaña está a la vista el brillo sube al
 * máximo, y al salir vuelve al que estaba: un lector toma mejor una pantalla
 * brillante, y nadie quiere quedarse con el teléfono encandilando.
 */
export function QrSocio({ codigo }: { codigo: string }) {
  const { width } = useWindowDimensions()
  const lado = Math.min(width - ESPACIO.xl * 4, 300)

  useFocusEffect(
    useCallback(() => {
      let vivo = true
      let anterior: number | null = null

      Brightness.getBrightnessAsync()
        .then((brillo) => {
          if (!vivo) return
          anterior = brillo
          return Brightness.setBrightnessAsync(1)
        })
        // Sin permiso o sin soporte: el QR se ve igual, solo menos brillante.
        .catch(() => {})

      return () => {
        vivo = false
        if (anterior !== null) void Brightness.setBrightnessAsync(anterior).catch(() => {})
      }
    }, []),
  )

  return (
    <View style={estilos.marco}>
      <QRCode value={codigo} size={lado} color={COLORES.qrTinta} backgroundColor={COLORES.qrFondo} />
    </View>
  )
}

const estilos = StyleSheet.create({
  marco: { backgroundColor: COLORES.qrFondo, padding: ESPACIO.l, borderRadius: RADIOS.grande, alignSelf: 'center' },
})
```

- [ ] **Step 5: La pantalla**

Crear `apps/movil/src/app/(tabs)/perfil.tsx`:

```tsx
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
```

- [ ] **Step 6: La quinta pestaña y cerrar sesión fuera de Hoy**

En `apps/movil/src/app/(tabs)/_layout.tsx`, debajo de la pestaña `progreso`:

```tsx
      <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: icono('person', 'person-outline') }} />
```

En `apps/movil/src/app/(tabs)/index.tsx`, cerrar sesión sale del encabezado de Hoy:
1. Borrar la constante `encabezado` entera, con su comentario ("Cerrar sesión pasa al encabezado…").
2. Borrar cada línea `{encabezado}` del JSX.
3. Borrar el import de `cerrarSesion` y el estilo `salir` de `estilos`.
4. Borrar los imports que queden sin usar (`Tabs`, `Pressable`, `Ionicons` o `COLORES`, según lo que siga usando el archivo): el lint los marca.

- [ ] **Step 7: Verificar tipos y lint**

Run (en `apps/movil`): `npx tsc --noEmit` y `npm run lint`
Expected: sin errores.

- [ ] **Step 8: Verificar a mano**

En Expo Go o en un APK nuevo, entrando como el socio creado en la tarea 9:
1. La pestaña *Perfil* es la quinta. El QR se ve negro sobre blanco y el brillo sube; al ir a otra pestaña vuelve al de antes.
2. Escanear ese QR desde el panel (tarea 11) registra la entrada de ese socio. Volver a *Perfil*: "Viniste 1 vez este mes" y la entrada con día y hora.
3. Con el pago de la tarea 10 cargado: "Vigente hasta …" en verde y el pago en la lista.
4. Modo avión, cerrar la app a la fuerza y abrirla: *Perfil* muestra el QR y el aviso "Sin conexión · actualizado el …".
5. *Hoy* ya no tiene el botón de salir arriba; *Cerrar sesión* en *Perfil* funciona y sigue preguntando si hay series sin sincronizar.
6. Dar de baja al socio desde el panel y abrir *Perfil* con señal: "Tu membresía está inactiva".

- [ ] **Step 9: Commit**

```bash
git add apps/movil packages/core/src/tema.ts package-lock.json
git commit -m "Sumar la pestaña Perfil con el QR, la cuota y las asistencias

El QR se guarda en el teléfono porque la puerta del gimnasio puede no
tener señal, y se muestra con el brillo al máximo. Cerrar sesión pasa
de Hoy a Perfil, que es donde se lo busca.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 14: App — cambiar la contraseña

**Files:**
- Create: `apps/movil/src/components/cambiar-contrasena.tsx`
- Modify: `apps/movil/src/app/(tabs)/perfil.tsx`

**Interfaces:**
- Consumes: `validarCambioContrasena` de `@gym/core` (tarea 6); `Boton`, `Campo`, `Tarjeta`, `Texto` de `@/ui`; `conLimite`; `<Texto tono="vigente">` (tarea 13).
- Produces: `CambiarContrasena()` en `@/components/cambiar-contrasena`.

- [ ] **Step 1: El componente**

Crear `apps/movil/src/components/cambiar-contrasena.tsx`:

```tsx
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
```

- [ ] **Step 2: Sumarlo a Perfil**

En `apps/movil/src/app/(tabs)/perfil.tsx`, agregar el import:

```tsx
import { CambiarContrasena } from '@/components/cambiar-contrasena'
```

y reemplazar la línea `{/* CAMBIAR CONTRASEÑA: lo agrega la tarea 14, acá. */}` por:

```tsx
        {/* Fuera de la condición de membresía activa: un socio dado de baja
            también puede querer cambiarla. */}
        <CambiarContrasena />
```

- [ ] **Step 3: Verificar tipos y lint**

Run (en `apps/movil`): `npx tsc --noEmit` y `npm run lint`
Expected: sin errores.

- [ ] **Step 4: Verificar a mano**

1. *Cambiar contraseña* con la actual mal: "La contraseña actual no es correcta".
2. Con las dos nuevas distintas: "Las dos contraseñas nuevas no coinciden", sin ir a la red.
3. Bien: "Contraseña cambiada."; la app sigue con la sesión iniciada; cerrar sesión y entrar con la nueva funciona y con la vieja no.
4. En modo avión: "Necesitás conexión para cambiar la contraseña".

- [ ] **Step 5: Commit**

```bash
git add apps/movil/src/components/cambiar-contrasena.tsx "apps/movil/src/app/(tabs)/perfil.tsx"
git commit -m "Dejar que el socio cambie la contraseña que le dieron en el mostrador

Se comprueba la contraseña actual antes de cambiarla aunque Supabase no
lo exija: con un teléfono prestado no tiene que alcanzar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 15: Cerrar la etapa en la documentación

**Files:**
- Modify: `docs/superpowers/specs/2026-10-09-socios-cuotas-checkin-design.md`
- Modify: `docs/superpowers/specs/2026-08-27-gym-saas-design.md`
- Modify: `README.md`

- [ ] **Step 1: El spec de la etapa**

En `docs/superpowers/specs/2026-10-09-socios-cuotas-checkin-design.md`:
1. Cambiar `**Estado:** Diseño aprobado. Falta el plan.` por `**Estado:** Implementado. Plan: [`2026-10-09-socios-cuotas-checkin.md`](../plans/2026-10-09-socios-cuotas-checkin.md).`
2. En la sección 1, debajo de la tabla de permisos, agregar:

```markdown
**El código QR solo lo lee su dueño.** `memberships_leer` deja ver todas las
membresías del gimnasio, y con ellas el `codigo_qr` de cualquiera: un socio
podía generarse el QR de otro. Se cerró la columna con permisos por columna
(`0017_rls_socios.sql`) y el socio obtiene el suyo con `mi_codigo_qr`. Se
detectó al escribir el plan; no estaba en el diseño original.
```

3. En la sección 4, en *Ficha del socio*, donde dice que la foto se reduce, agregar: `El archivo original puede pesar hasta 20 MB —una foto de celular pasa fácil los 5—; lo que se sube es la versión reducida, y el límite de 5 MB es del bucket.`
4. En la sección 6, en la fila de *Foto*, cambiar "pasa de 5 MB" por "pasa de 20 MB" y el mensaje por "Elegí una imagen de hasta 20 MB".
5. En la sección 4, en *Socios*, cambiar el filtro *Cuota vencida* por *Sin cuota al día* y aclarar: `incluye a quien nunca pagó: para quien cobra es la misma lista.`
6. En la sección 2, sumar al tipo de `estadoCuota` el caso `{ tipo: 'empieza', desde }`: una cuota que todavía no empezó, sin ninguna antes.
7. En la sección 4, en *Ficha del socio*, cambiar `capture="user"` por `capture="environment"`: la foto la saca el empleado con la cámara de atrás.

- [ ] **Step 2: El diseño general**

En `docs/superpowers/specs/2026-08-27-gym-saas-design.md`:
1. En la definición de `memberships` (sección 5), agregar `· \`foto\`` a la lista de columnas y, debajo del párrafo de `codigo_qr`, agregar: `La foto de verificación vive en la membresía y no en \`profiles.avatar_url\`: es del gimnasio que la sacó y solo la cambia su admin. \`codigo_qr\` solo lo lee su dueño. Ver la sección 1 del [diseño de la etapa 4](2026-10-09-socios-cuotas-checkin-design.md).`
2. En la sección de pantallas, reemplazar `La pestaña Perfil todavía no existe: llega con las etapas 4 y 5, junto con el QR, las cuotas y las notificaciones.` por `La pestaña Perfil llegó con la etapa 4: QR, cuota, asistencias, cambio de contraseña y cerrar sesión. Las preferencias de notificación llegan con la etapa 5.`
3. En la tabla de etapas, marcar la 4 como implementada siguiendo el formato que usan las anteriores.

- [ ] **Step 3: El README**

En `README.md`, cambiar "Las etapas 0 a 3 están implementadas" por "Las etapas 0 a 4 están implementadas" y sumar a la lista lo de la etapa 4 con el estilo de las anteriores. Donde el README explica cómo correr los tests, agregar:

```markdown
- `npm run test:funciones` — las Edge Functions. Necesita `npx supabase functions serve` corriendo en otra terminal.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs README.md
git commit -m "Cerrar la etapa 4 en la documentación

Registra lo que cambió respecto del diseño: el código QR cerrado por
columna, la foto en la membresía y el tamaño del archivo original.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Verificación final de la rama

Después de la tarea 15, antes de la revisión amplia:

- [ ] `npx supabase db reset && npm run test:rls` — PASS, con los de `socios.test.ts`.
- [ ] Con `npx supabase functions serve` corriendo: `npm run test:funciones` — PASS, 8 tests.
- [ ] `npm run test:core` — PASS, con los de `cuotas.test.ts` y `socios.test.ts`.
- [ ] Desde `apps/movil`: `npx tsc --noEmit && npm run lint` — sin errores.
- [ ] Desde `apps/panel`: `npx tsc --noEmit && npm run lint` — sin errores.
- [ ] `git grep -n "for insert\|for update" -- supabase/migrations/0016_socios_cuotas.sql supabase/migrations/0017_rls_socios.sql` — la única coincidencia es `cuotas_crear`. Una política de `insert` sobre `checkins` saltearía el cálculo del día en la zona del gimnasio; una de `update` sobre cualquiera de las dos rompe "se borra y se carga de nuevo".
- [ ] `git grep -n "codigo_qr" -- apps/` — ninguna coincidencia en el panel salvo `regenerarQr` (que escribe, no lee). En la app, ninguna: el código llega por `mi_codigo_qr`.

**El recorrido a mano, para el usuario.** Lo que ningún test automático cubre: el celular real en el mostrador.

1. En el panel, como admin: *Socios* → *Nuevo socio* → crear la cuenta y copiar los datos.
2. *Ir a su ficha* → *Sacar foto* desde el celular (abre la cámara) → la foto aparece.
3. *Registrar pago* con lo propuesto → la etiqueta pasa a verde.
4. En el teléfono del socio, entrar con los datos copiados. *Perfil* muestra el QR, "Vigente hasta …" y 0 asistencias. Cambiar la contraseña.
5. En el celular del mostrador, abrir el panel con HTTPS → *Escanear* → mostrarle el QR del teléfono del socio: foto, nombre, cuota en verde, "Entrada registrada". Volver a mostrarlo: "Ya registró entrada hoy a las …".
6. *Asistencia* lista la entrada. En el teléfono del socio, *Perfil* dice "Viniste 1 vez este mes".
7. Borrar el pago desde la ficha y escanear de nuevo al día siguiente (o borrar la entrada de hoy y volver a escanear): la tarjeta muestra la cuota en rojo y, al admin, *Registrar pago*.
8. Modo avión en el teléfono del socio: *Perfil* sigue mostrando el QR.
9. *Regenerar QR* desde la ficha: el QR viejo del teléfono da "QR no válido"; con señal, *Perfil* muestra el nuevo y vuelve a funcionar.
10. *Dar de baja*: el QR da "QR no válido" y *Perfil* dice "Tu membresía está inactiva".
