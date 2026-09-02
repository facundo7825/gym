# Etapas 0 y 1 — Cimientos, ejercicios y videos

> **Para agentes:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** Dejar funcionando el monorepo con aislamiento entre gimnasios verificado por tests, y el ciclo completo de que un empleado suba un video de ejercicio desde el panel web y un socio lo vea en su celular.

**Arquitectura:** Monorepo con npm workspaces. Toda la seguridad multi-gimnasio vive en PostgreSQL mediante Row Level Security, no en el código de las apps. Los videos se suben desde el navegador directo a Cloudflare Stream usando una URL de subida de un solo uso emitida por una Edge Function, y se reproducen con URLs firmadas de vida corta.

**Stack:** Expo (React Native) · Next.js 16 (App Router) · Supabase (PostgreSQL) · Cloudflare Stream · TypeScript · Vitest

**Spec:** `docs/superpowers/specs/2026-08-27-gym-saas-design.md`

---

## Restricciones globales

Aplican a **todas** las tareas de este plan:

- **Node 22+**, npm 10+. Probado en Node 24 LTS. El piso lo impone
  `@supabase/supabase-js`: en Node 20 no hay `WebSocket` global y el cliente
  revienta al construirse, porque arma un cliente de Realtime aunque no lo uses.
  Está fijado en `engines` del `package.json` de raíz. El repo ya está en `main`
  con la spec commiteada.
- **TypeScript en modo `strict`** en los tres paquetes. Nada de `any` sin un comentario que lo justifique.
- **Todo el texto visible al usuario va en castellano.** Nombres de tablas, columnas, funciones y variables también en castellano (`ejercicios`, `mis_gyms`, `puede`). Excepto lo que impone una librería.
- **Toda tabla nueva lleva `gym_id`** (salvo `profiles`, que es la persona, y las tablas donde `gym_id` nulo significa "global": `videos` y `ejercicios`).
- **Toda tabla nueva se crea con RLS habilitada y con su test de aislamiento en la misma tarea.** Una tarea que agrega una tabla sin su política y su test está incompleta.
- **Nunca commitear `.env`.** Ya está en `.gitignore`. Cada variable nueva se agrega a `.env.example` **sin el valor**.
- **Un commit por tarea**, como mínimo. Mensajes en castellano, imperativo.
- Zona horaria por defecto de los gimnasios: `America/Argentina/Buenos_Aires`.

## Prerrequisitos (una sola vez, antes de la Tarea 1)

- [ ] **Docker Desktop abierto.** Ya está instalado (v28.5.1, WSL2) pero el daemon no corre. Abrilo y esperá a que el ícono deje de girar. Verificá con `docker info` — tiene que devolver datos, no un error de conexión. Supabase local no arranca sin esto.
- [ ] **Cuenta de Cloudflare** con Stream habilitado (necesario recién en la Tarea 11, pero el alta puede tardar). Anotá tu Account ID.
- [ ] **Cuentas de desarrollador de Apple y Google.** No hacen falta en estas dos etapas, pero el trámite de Apple puede demorar semanas. Iniciálo ahora.

---

## Estructura de archivos

Al terminar este plan:

```
gym/
├── package.json                       workspaces + scripts raíz
├── vitest.config.ts                   config de los tests de RLS
├── .env.example                       nombres de variables, sin valores
├── tests/
│   ├── setup.ts                       carga .env.test antes de cada worker
│   └── rls/
│       ├── ayudas.ts                  crea gimnasios y usuarios de prueba
│       ├── identidad.test.ts          aislamiento de gyms/profiles/memberships
│       └── ejercicios.test.ts         aislamiento de maquinas/videos/ejercicios
├── packages/core/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts                   re-exporta todo lo público
│   │   ├── tipos-db.ts                GENERADO por supabase — no editar a mano
│   │   ├── permisos.ts                qué puede hacer cada rol
│   │   └── video.ts                   estado y URLs de Cloudflare
│   └── tests/
│       ├── permisos.test.ts
│       └── video.test.ts
├── apps/panel/                        Next.js
│   └── src/
│       ├── proxy.ts                   refresca sesión y protege rutas
│       ├── lib/supabase/navegador.ts
│       ├── lib/supabase/servidor.ts
│       └── app/
│           ├── login/page.tsx
│           └── (panel)/
│               ├── layout.tsx         barra lateral + datos de sesión
│               ├── page.tsx           inicio
│               ├── maquinas/page.tsx
│               └── ejercicios/
│                   ├── page.tsx       listado
│                   └── nuevo/page.tsx alta + subida de video
├── apps/movil/                        Expo
│   ├── lib/supabase.ts
│   └── app/
│       ├── _layout.tsx                sesión y redirección
│       ├── login.tsx
│       └── (tabs)/
│           ├── _layout.tsx
│           └── ejercicios/
│               ├── index.tsx          listado + buscador
│               └── [id].tsx           detalle + reproductor
└── supabase/
    ├── config.toml
    ├── migrations/
    │   ├── 0001_identidad.sql
    │   ├── 0002_rls_identidad.sql
    │   ├── 0003_ejercicios.sql
    │   └── 0004_rls_ejercicios.sql
    ├── seed.sql                       catálogo global de ejercicios
    └── functions/
        ├── video-subir/index.ts       emite URL de subida de un solo uso
        ├── video-estado/index.ts      consulta Cloudflare y actualiza la fila
        └── video-url/index.ts         emite URL firmada de reproducción
```

**Por qué `packages/core` existe:** es lo que evita escribir dos veces la lógica que no es de pantalla. Los tipos de la base, los permisos por rol y el manejo de estados de video los usan tanto la app como el panel.

**Por qué los tests de RLS viven en `tests/` y no dentro de un paquete:** no prueban código nuestro, prueban la base de datos. Corren contra Supabase local con dos usuarios reales de dos gimnasios distintos.

---

# PARTE A — Etapa 0: Cimientos

Al terminar la Parte A no hay ninguna pantalla del producto, y eso es esperable. Lo que hay es una base de datos que garantiza que un gimnasio no pueda ver los datos de otro, con tests que lo demuestran, y login funcionando en las dos apps.

---

### Tarea 1: Monorepo y Supabase local

**Archivos:**
- Crear: `package.json`, `.env.example`, `supabase/config.toml` (lo genera el CLI)

**Interfaces:**
- Consume: nada
- Produce: los scripts `npm run db:start`, `npm run db:reset`, `npm run db:tipos` disponibles desde la raíz

- [ ] **Paso 1: Crear el `package.json` raíz**

```json
{
  "name": "gym",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=22" },
  "scripts": {
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "db:reset": "supabase db reset",
    "db:estado": "supabase status",
    "db:tipos": "supabase gen types typescript --local > packages/core/src/tipos-db.ts",
    "test:rls": "vitest run --config vitest.config.ts",
    "test:core": "npm run test --workspace @gym/core"
  },
  "devDependencies": {
    "supabase": "^2.20.0",
    "vitest": "^3.0.0",
    "dotenv": "^16.4.0",
    "@supabase/supabase-js": "^2.48.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Paso 2: Instalar**

```bash
npm install
```

- [ ] **Paso 3: Inicializar Supabase**

```bash
npx supabase init
```

Responder **no** cuando pregunte por la configuración de VS Code / Deno; se agrega más adelante si hace falta.

- [ ] **Paso 4: Levantar Supabase local**

```bash
npm run db:start
```

La primera vez descarga varias imágenes de Docker y tarda entre 3 y 10 minutos. Si falla con un error de conexión al daemon, Docker Desktop no está abierto.

- [ ] **Paso 5: Verificar que quedó corriendo**

Correr: `npm run db:estado`
Esperado: una lista con `API URL: http://127.0.0.1:54321`, `DB URL`, `Studio URL: http://127.0.0.1:54323`, `anon key` y `service_role key`.

Abrí `http://127.0.0.1:54323` en el navegador: es el panel de administración de tu base local.

- [ ] **Paso 6: Crear `.env.example`**

```bash
# Supabase local — obtené los valores con `npm run db:estado`
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Panel web (Next.js)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# App móvil (Expo)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=

# Cloudflare Stream — se usan recién en la etapa 1
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_STREAM_TOKEN=
CLOUDFLARE_CUSTOMER_CODE=
```

> `SUPABASE_SERVICE_ROLE_KEY` **saltea RLS por completo**. Solo se usa en los tests y en Edge Functions. Nunca en la app ni en el panel.

- [ ] **Paso 7: Commit**

```bash
git add package.json package-lock.json .env.example supabase/
git commit -m "Configurar monorepo con npm workspaces y Supabase local"
```

---

### Tarea 2: Paquete `core` con permisos por rol

Primera pieza de lógica compartida, y la excusa para dejar Vitest andando.

**Archivos:**
- Crear: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/permisos.ts`, `packages/core/src/index.ts`
- Test: `packages/core/tests/permisos.test.ts`

**Interfaces:**
- Consume: nada
- Produce:
  - `type Rol = 'socio' | 'entrenador' | 'admin'`
  - `type Accion` (unión de strings, ver abajo)
  - `puede(rol: Rol, accion: Accion): boolean`

- [ ] **Paso 1: Crear el paquete**

`packages/core/package.json`:
```json
{
  "name": "@gym/core",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "test": "vitest run" },
  "devDependencies": { "vitest": "^3.0.0", "typescript": "^5.7.0" }
}
```

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

// Sin esta config propia, vitest sube buscando una y termina heredando la de
// la raíz, que es la de los tests de RLS: su `setupFiles: ['./tests/setup.ts']`
// resuelve contra este paquete y falla con "Cannot find module". Los tests de
// `core` son puros: no necesitan base ni setup.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
```

> El archivo de raíz se crea recién en la Tarea 4, así que mientras tanto esto
> parece de más. No lo es: sin él, `npm run test:core` se rompe en cuanto
> aparece aquel, y el síntoma no señala para nada a este paquete.

`packages/core/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Paso 2: Escribir el test que falla**

`packages/core/tests/permisos.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { puede } from '../src/permisos'

describe('puede', () => {
  it('un socio puede ver ejercicios', () => {
    expect(puede('socio', 'ver_ejercicios')).toBe(true)
  })

  it('un socio NO puede subir videos', () => {
    expect(puede('socio', 'subir_video')).toBe(false)
  })

  it('un entrenador puede subir videos y crear ejercicios', () => {
    expect(puede('entrenador', 'subir_video')).toBe(true)
    expect(puede('entrenador', 'crear_ejercicio')).toBe(true)
  })

  it('un entrenador NO puede gestionar socios', () => {
    expect(puede('entrenador', 'gestionar_socios')).toBe(false)
  })

  it('un admin puede todo lo del entrenador, y además gestionar socios', () => {
    expect(puede('admin', 'subir_video')).toBe(true)
    expect(puede('admin', 'gestionar_socios')).toBe(true)
  })
})
```

- [ ] **Paso 3: Correr el test para verificar que falla**

Correr: `npm run test:core`
Esperado: FALLA — no existe el módulo `../src/permisos`.

- [ ] **Paso 4: Implementar**

`packages/core/src/permisos.ts`:
```ts
export type Rol = 'socio' | 'entrenador' | 'admin'

export type Accion =
  | 'ver_ejercicios'
  | 'crear_ejercicio'
  | 'subir_video'
  | 'gestionar_maquinas'
  | 'crear_rutina_plantilla'
  | 'asignar_rutina'
  | 'gestionar_socios'
  | 'registrar_cuota'
  | 'escanear_checkin'

const DE_SOCIO: Accion[] = ['ver_ejercicios']

const DE_ENTRENADOR: Accion[] = [
  ...DE_SOCIO,
  'crear_ejercicio',
  'subir_video',
  'gestionar_maquinas',
  'crear_rutina_plantilla',
  'asignar_rutina',
  'escanear_checkin',
]

const DE_ADMIN: Accion[] = [...DE_ENTRENADOR, 'gestionar_socios', 'registrar_cuota']

const PERMISOS: Record<Rol, readonly Accion[]> = {
  socio: DE_SOCIO,
  entrenador: DE_ENTRENADOR,
  admin: DE_ADMIN,
}

/**
 * Ayuda para la interfaz: decide si se muestra un botón o una sección.
 * NO es un control de seguridad. La seguridad real la aplica RLS en la base
 * de datos; esto solo evita mostrarle a alguien una opción que le va a fallar.
 */
export function puede(rol: Rol, accion: Accion): boolean {
  return PERMISOS[rol].includes(accion)
}
```

`packages/core/src/index.ts`:
```ts
export { puede } from './permisos'
export type { Rol, Accion } from './permisos'
```

- [ ] **Paso 5: Correr el test para verificar que pasa**

Correr: `npm run test:core`
Esperado: PASA — 5 tests.

- [ ] **Paso 6: Commit**

```bash
git add packages/core package.json package-lock.json
git commit -m "Agregar paquete core con permisos por rol"
```

---

### Tarea 3: Migración de identidad

**Archivos:**
- Crear: `supabase/migrations/0001_identidad.sql`
- Modificar: `packages/core/src/tipos-db.ts` (generado)

**Interfaces:**
- Consume: Supabase local corriendo (Tarea 1)
- Produce: tablas `gyms`, `profiles`, `memberships`; tipos `rol_membresia`, `estado_membresia`; trigger que crea el `profile` al registrarse un usuario

- [ ] **Paso 1: Escribir la migración**

`supabase/migrations/0001_identidad.sql`:
```sql
-- ---------------------------------------------------------------------------
-- Identidad: gimnasios, personas y la relación entre ambos.
-- ---------------------------------------------------------------------------

create type rol_membresia as enum ('socio', 'entrenador', 'admin');
create type estado_membresia as enum ('activo', 'inactivo');

create table gyms (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  slug          text not null unique,
  logo_url      text,
  zona_horaria  text not null default 'America/Argentina/Buenos_Aires',
  plan          text not null default 'basico',
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- La persona. Existe una vez, independiente de en cuántos gimnasios esté.
create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  nombre            text not null default '',
  apellido          text not null default '',
  telefono          text,
  avatar_url        text,
  fecha_nacimiento  date,
  es_superadmin     boolean not null default false,
  created_at        timestamptz not null default now()
);

-- La relación persona <-> gimnasio, con su rol EN ESE GIMNASIO.
-- Es la tabla sobre la que se apoya todo el aislamiento multi-gimnasio.
create table memberships (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  rol         rol_membresia not null default 'socio',
  estado      estado_membresia not null default 'activo',
  fecha_alta  date not null default current_date,
  -- Valor opaco que va dentro del QR del socio. No es el id: se puede
  -- revocar y regenerar sin tocar ningún otro dato.
  codigo_qr   text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at  timestamptz not null default now(),
  unique (gym_id, user_id)
);

create index memberships_user_id_idx on memberships (user_id);
create index memberships_gym_id_idx  on memberships (gym_id);

-- Al registrarse un usuario en auth.users, crear su fila en profiles.
create function public.crear_profile_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre, apellido)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido', '')
  );
  return new;
end;
$$;

create trigger al_crearse_usuario
  after insert on auth.users
  for each row execute function public.crear_profile_al_registrarse();
```

- [ ] **Paso 2: Aplicar la migración**

```bash
npm run db:reset
```

`db:reset` borra la base local y reaplica todas las migraciones desde cero. Es el comando que vas a usar todo el tiempo en desarrollo, y por eso las migraciones tienen que poder correr sobre una base vacía.

Esperado: termina sin errores y muestra `Applying migration 0001_identidad.sql...`.

- [ ] **Paso 3: Verificar en el Studio**

Abrí `http://127.0.0.1:54323` → *Table Editor*. Tienen que aparecer `gyms`, `profiles` y `memberships`.

- [ ] **Paso 4: Verificar que el trigger anda**

En el Studio → *SQL Editor*:
```sql
select count(*) from profiles;
```
Ahora → *Authentication* → *Add user* → crear `prueba@ejemplo.com`. Volver al SQL Editor y repetir el `select`: tiene que haber pasado de 0 a 1.

Después borrá ese usuario desde *Authentication*.

- [ ] **Paso 5: Generar los tipos de TypeScript**

```bash
npm run db:tipos
```

Esto lee tu base y escribe `packages/core/src/tipos-db.ts`. **Ese archivo no se edita a mano nunca**: se regenera después de cada migración. Es lo que hace que renombrar una columna te marque en rojo cada punto roto de las dos apps.

- [ ] **Paso 6: Exportar los tipos desde `core`**

`packages/core/src/index.ts` — agregar al final:
```ts
export type { Database } from './tipos-db'
```

- [ ] **Paso 7: Commit**

```bash
git add supabase/migrations packages/core/src
git commit -m "Agregar tablas de identidad: gyms, profiles y memberships"
```

---

### Tarea 4: RLS y tests de aislamiento ⭐

**La tarea más importante del plan.** Si algo de acá queda mal, se filtran datos entre gimnasios.

**Archivos:**
- Crear: `supabase/migrations/0002_rls_identidad.sql`, `vitest.config.ts`, `tests/rls/ayudas.ts`, `tests/rls/identidad.test.ts`

**Interfaces:**
- Consume: tablas de la Tarea 3
- Produce:
  - SQL: `mis_gyms() returns setof uuid`, `mi_rol(p_gym_id uuid) returns rol_membresia`, `soy_superadmin() returns boolean`
  - TS, desde `tests/rls/ayudas.ts`:
    - `admin: SupabaseClient` — cliente con service_role, saltea RLS, solo para preparar datos
    - `crearEscenario(): Promise<Escenario>`
    - `interface Escenario { gymA: string; gymB: string; socioAId: string; comoAdminA: SupabaseClient; comoSocioA: SupabaseClient; comoSocioB: SupabaseClient }`

- [ ] **Paso 1: Escribir las políticas**

`supabase/migrations/0002_rls_identidad.sql`:
```sql
-- ---------------------------------------------------------------------------
-- Aislamiento entre gimnasios.
--
-- Las funciones son SECURITY DEFINER a propósito: corren con los permisos de
-- quien las creó y por lo tanto NO les aplica RLS. Eso es lo que evita la
-- recursión infinita: la política de `memberships` llama a mis_gyms(), que
-- lee `memberships`. Si la función respetara RLS, esa lectura volvería a
-- disparar la política, que volvería a llamar a la función, sin fin.
--
-- `set search_path = ''` obliga a escribir los nombres completos
-- (public.memberships, auth.uid()). Sin eso, alguien podría crear un esquema
-- propio y hacer que la función lea de otra tabla.
-- ---------------------------------------------------------------------------

create or replace function public.mis_gyms()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select gym_id
  from public.memberships
  where user_id = (select auth.uid())
    and estado = 'activo'
$$;

create or replace function public.mi_rol(p_gym_id uuid)
returns public.rol_membresia
language sql
stable
security definer
set search_path = ''
as $$
  select rol
  from public.memberships
  where user_id = (select auth.uid())
    and gym_id = p_gym_id
    and estado = 'activo'
$$;

create or replace function public.soy_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select es_superadmin from public.profiles where id = (select auth.uid())),
    false
  )
$$;

alter table gyms        enable row level security;
alter table profiles    enable row level security;
alter table memberships enable row level security;

-- gyms: solo los gimnasios a los que pertenezco.
create policy gyms_leer on gyms for select
  using (id in (select mis_gyms()) or soy_superadmin());

create policy gyms_editar on gyms for update
  using (mi_rol(id) = 'admin' or soy_superadmin());

-- profiles: mi propio perfil, y el de quienes comparten gimnasio conmigo
-- (el entrenador necesita ver el nombre y la foto de sus socios).
create policy profiles_leer on profiles for select
  using (
    id = (select auth.uid())
    or exists (
      select 1 from memberships m
      where m.user_id = profiles.id
        and m.gym_id in (select mis_gyms())
    )
    or soy_superadmin()
  );

create policy profiles_editar_el_mio on profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- RLS decide QUÉ FILAS se pueden tocar, nunca qué columnas. Y `es_superadmin`
-- vive en esta tabla. Sin lo que sigue, cualquier usuario autenticado se
-- promueve solo editando su propio perfil —pasa el `using` porque la fila es
-- suya, pasa el `with check` porque el id no cambia— y con eso se le abre la
-- rama `or soy_superadmin()` de casi todas las políticas: lee y escribe todos
-- los gimnasios. La restricción por columna se hace con grants, no con RLS.
--
-- Se revoca el grant de tabla ANTES de otorgar por columna: Postgres SUMA
-- privilegios, así que revocar solo la columna no descuenta un grant de tabla
-- preexistente y no serviría de nada.
revoke update on public.profiles from anon, authenticated;
grant update (nombre, apellido, telefono, avatar_url, fecha_nacimiento)
  on public.profiles to authenticated;
-- `service_role` conserva su grant de tabla, así que promover a un superadmin
-- de verdad desde el backend sigue siendo posible. Un trigger no serviría:
-- los triggers tampoco los saltea `service_role`, y bloquearía también esa
-- operación legítima.

-- memberships: las de mi gimnasio. Solo un admin da de alta.
create policy memberships_leer on memberships for select
  using (gym_id in (select mis_gyms()) or soy_superadmin());

create policy memberships_crear on memberships for insert
  with check (mi_rol(gym_id) = 'admin' or soy_superadmin());

create policy memberships_editar on memberships for update
  using (mi_rol(gym_id) = 'admin' or soy_superadmin());
```

> **Regla de PostgreSQL que conviene tener clara:** con RLS habilitada, **lo que no tiene política está prohibido**. No hace falta escribir reglas de denegación. Fijate que arriba no hay ninguna política de `delete`: nadie puede borrar nada, y es intencional.

- [ ] **Paso 2: Aplicar y verificar que las funciones existen**

```bash
npm run db:reset
```
Esperado: aplica `0001` y `0002` sin errores.

- [ ] **Paso 3: Configurar Vitest para los tests de RLS**

`vitest.config.ts` (raíz):
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Los tests de RLS comparten una única base local. Si corrieran en
    // paralelo se pisarían los datos entre sí.
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ['./tests/setup.ts'],
  },
})
```

`tests/setup.ts`:
```ts
import { config } from 'dotenv'

// Apunta explícitamente a .env.test. El atajo `dotenv/config` NO sirve acá:
// carga `.env`, que es el archivo de las apps y no tiene la SERVICE_ROLE_KEY
// que estos tests necesitan para preparar datos salteando RLS.
config({ path: '.env.test' })
```

Generar el archivo de entorno para los tests:
```bash
npx supabase status -o env 2>/dev/null > .env.test
```

Verificá que quedó bien antes de seguir:
```bash
grep -c -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=' .env.test
```
Esperado: `3`. Si da menos, los tests van a fallar por falta de credenciales y no por RLS, que es la peor forma de perder una hora.

Agregar `.env.test` a `.gitignore`:
```bash
echo ".env.test" >> .gitignore
```

- [ ] **Paso 4: Escribir el armador de escenarios**

`tests/rls/ayudas.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = process.env.API_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.ANON_KEY!
const SERVICE = process.env.SERVICE_ROLE_KEY!

/** Cliente que saltea RLS. Solo para preparar datos de prueba. */
export const admin: SupabaseClient = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Crea un usuario y devuelve un cliente autenticado COMO ese usuario. */
async function crearUsuario(email: string): Promise<{
  id: string
  cliente: SupabaseClient
}> {
  const password = 'prueba-123456'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error

  const cliente = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: errorLogin } = await cliente.auth.signInWithPassword({
    email,
    password,
  })
  if (errorLogin) throw errorLogin

  return { id: data.user.id, cliente }
}

export interface Escenario {
  gymA: string
  gymB: string
  socioAId: string
  comoAdminA: SupabaseClient
  comoSocioA: SupabaseClient
  comoSocioB: SupabaseClient
}

/**
 * Dos gimnasios sin ninguna relación entre sí, cada uno con sus usuarios.
 * Todos los tests de aislamiento parten de acá: lo que se verifica siempre
 * es que alguien del gimnasio A no alcance nada del gimnasio B.
 */
export async function crearEscenario(): Promise<Escenario> {
  const sufijo = Math.random().toString(36).slice(2, 10)

  const { data: gyms, error } = await admin
    .from('gyms')
    .insert([
      { nombre: 'Gimnasio A', slug: `gym-a-${sufijo}` },
      { nombre: 'Gimnasio B', slug: `gym-b-${sufijo}` },
    ])
    .select('id, slug')
  if (error) throw error

  const gymA = gyms.find((g) => g.slug.startsWith('gym-a'))!.id
  const gymB = gyms.find((g) => g.slug.startsWith('gym-b'))!.id

  const adminA = await crearUsuario(`admin-a-${sufijo}@ejemplo.com`)
  const socioA = await crearUsuario(`socio-a-${sufijo}@ejemplo.com`)
  const socioB = await crearUsuario(`socio-b-${sufijo}@ejemplo.com`)

  const { error: errorMem } = await admin.from('memberships').insert([
    { gym_id: gymA, user_id: adminA.id, rol: 'admin' },
    { gym_id: gymA, user_id: socioA.id, rol: 'socio' },
    { gym_id: gymB, user_id: socioB.id, rol: 'socio' },
  ])
  if (errorMem) throw errorMem

  return {
    gymA,
    gymB,
    socioAId: socioA.id,
    comoAdminA: adminA.cliente,
    comoSocioA: socioA.cliente,
    comoSocioB: socioB.cliente,
  }
}
```

- [ ] **Paso 5: Escribir los tests de aislamiento**

`tests/rls/identidad.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { crearEscenario, type Escenario } from './ayudas'

describe('aislamiento de identidad entre gimnasios', () => {
  let e: Escenario
  beforeAll(async () => {
    e = await crearEscenario()
  })

  it('un socio ve su gimnasio', async () => {
    const { data } = await e.comoSocioA.from('gyms').select('id')
    expect(data?.map((g) => g.id)).toEqual([e.gymA])
  })

  it('un socio NO ve el gimnasio ajeno, ni pidiéndolo por id', async () => {
    const { data } = await e.comoSocioA.from('gyms').select('id').eq('id', e.gymB)
    expect(data).toEqual([])
  })

  it('un socio NO ve las membresías del gimnasio ajeno', async () => {
    const { data } = await e.comoSocioA
      .from('memberships')
      .select('id')
      .eq('gym_id', e.gymB)
    expect(data).toEqual([])
  })

  it('un socio NO ve el perfil de alguien de otro gimnasio', async () => {
    const { data } = await e.comoSocioB
      .from('profiles')
      .select('id')
      .eq('id', e.socioAId)
    expect(data).toEqual([])
  })

  it('el admin sí ve a los socios de SU gimnasio', async () => {
    const { data } = await e.comoAdminA
      .from('profiles')
      .select('id')
      .eq('id', e.socioAId)
    expect(data).toHaveLength(1)
  })

  it('un socio NO puede darse de alta en otro gimnasio', async () => {
    const { error } = await e.comoSocioA
      .from('memberships')
      .insert({ gym_id: e.gymB, user_id: e.socioAId, rol: 'admin' })
    expect(error).not.toBeNull()
  })

  it('un socio NO puede ascenderse a admin en su propio gimnasio', async () => {
    const { data } = await e.comoSocioA
      .from('memberships')
      .update({ rol: 'admin' })
      .eq('gym_id', e.gymA)
      .select()
    // Sin política de update para el rol socio, no afecta ninguna fila.
    expect(data).toEqual([])
  })

  it('nadie puede borrar membresías', async () => {
    const { data } = await e.comoAdminA
      .from('memberships')
      .delete()
      .eq('gym_id', e.gymA)
      .select()
    expect(data).toEqual([])
  })
})
```

- [ ] **Paso 6: Correr los tests**

Correr: `npm run test:rls`
Esperado: PASAN los 8.

Si alguno falla, **la política está mal, no el test**. Estos tests son la definición de lo que el sistema tiene que garantizar.

- [ ] **Paso 7: Verificar que el test sirve de verdad**

Un test de seguridad que nunca falló no prueba nada. Comprobalo a mano:

En `0002_rls_identidad.sql`, cambiá temporalmente la política `gyms_leer` por `using (true)`. Corré `npm run db:reset && npm run test:rls`. **Tienen que fallar** los tests de gimnasio ajeno. Después revertí el cambio, volvé a resetear y confirmá que pasan de nuevo.

- [ ] **Paso 8: Commit**

```bash
git add supabase/migrations vitest.config.ts tests/ .gitignore package.json
git commit -m "Agregar RLS de identidad con tests de aislamiento entre gimnasios"
```

---

### Tarea 5: Autenticación en el panel web

**Archivos:**
- Crear: `apps/panel/` (Next.js), `apps/panel/src/lib/supabase/navegador.ts`, `apps/panel/src/lib/supabase/servidor.ts`, `apps/panel/src/proxy.ts`, `apps/panel/src/app/login/page.tsx`, `apps/panel/src/app/(panel)/layout.tsx`, `apps/panel/src/app/(panel)/page.tsx`

**Interfaces:**
- Consume: `@gym/core` (`Database`, `puede`), tablas y RLS de las Tareas 3 y 4
- Produce:
  - `crearClienteNavegador(): SupabaseClient<Database>` desde `@/lib/supabase/navegador`
  - `crearClienteServidor(): Promise<SupabaseClient<Database>>` desde `@/lib/supabase/servidor`
  - La ruta `/login` y el grupo de rutas `(panel)`, con el layout que ya resolvió la sesión

- [ ] **Paso 1: Crear la app**

```bash
mkdir -p apps   # create-next-app falla con "path is not writable" si el directorio padre no existe
npx create-next-app@latest apps/panel --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --skip-install --disable-git --yes

# El workspace es nuevo: sin este install de raíz npm no lo registra y el
# filtro --workspace se ignora en silencio ("no workspace folder present").
npm install
npm install --workspace panel @supabase/supabase-js @supabase/ssr @gym/core@*
```

> **`--no-turbopack` ya no existe.** En Next 16 Turbopack es el bundler por
> defecto; para salirse está `--webpack` en `next build`. Y `create-next-app`
> genera `AGENTS.md` + `CLAUDE.md`: conviene commitearlos, porque `next dev`
> los reescribe y si no quedan como cambio sin commitear para siempre.

Después, en `src/app/layout.tsx` (el que generó el scaffold) cambiar `lang="en"`
por `lang="es"` y el `metadata` de "Create Next App" a algo del proyecto.

- [ ] **Paso 2: Configurar el entorno**

Crear `apps/panel/.env.local` con los valores que devuelve `npm run db:estado`:
```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<el anon key de db:estado>
```

- [ ] **Paso 3: Clientes de Supabase**

`apps/panel/src/lib/supabase/navegador.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@gym/core'

export function crearClienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

`apps/panel/src/lib/supabase/servidor.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@gym/core'

export async function crearClienteServidor() {
  const almacen = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (nuevas) => {
          try {
            nuevas.forEach(({ name, value, options }) =>
              almacen.set(name, value, options),
            )
          } catch {
            // Llamado desde un Server Component: el proxy ya refrescó
            // la sesión, así que se puede ignorar sin consecuencias.
          }
        },
      },
    },
  )
}
```

- [ ] **Paso 4: Proxy que refresca sesión y protege rutas**

En Next 16 `middleware.ts` está **deprecado y se llama `proxy.ts`**: mismo
comportamiento, cambian el nombre del archivo y el del export. Los flags de
config con `middleware` en el nombre también se renombraron
(`skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`).

Y una advertencia que el propio doc de Next hace: **esto no es la barrera de
autorización.** Un cambio de `matcher` o mover una ruta la deja sin cobertura
en silencio. Quien decide de verdad es RLS en la base; el layout y cada Server
Action revalidan con `getUser()` por su cuenta.

`apps/panel/src/proxy.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (nuevas) => {
          nuevas.forEach(({ name, value }) => request.cookies.set(name, value))
          respuesta = NextResponse.next({ request })
          nuevas.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getUser() valida el token contra el servidor. getSession() solo lee la
  // cookie, que el cliente puede haber manipulado: no sirve para decidir
  // accesos.
  const { data: { user } } = await supabase.auth.getUser()

  const enLogin = request.nextUrl.pathname.startsWith('/login')

  if (!user && !enLogin) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (user && enLogin) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return respuesta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg)$).*)'],
}
```

- [ ] **Paso 5: Pantalla de login**

`apps/panel/src/app/login/page.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setCargando(true)
    setError(null)

    const supabase = crearClienteNavegador()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Mensaje genérico a propósito: distinguir "no existe el usuario" de
      // "la contraseña es incorrecta" le confirma a un atacante qué correos
      // están registrados.
      setError('Correo o contraseña incorrectos')
      setCargando(false)
      return
    }
    router.replace('/')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Panel del gimnasio</h1>

        <input
          type="email" required value={email} placeholder="Correo"
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
        <input
          type="password" required value={password} placeholder="Contraseña"
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <button
          type="submit" disabled={cargando}
          className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
        >
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Paso 6: Layout con los datos de la membresía**

`apps/panel/src/app/(panel)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export default async function LayoutPanel({
  children,
}: { children: React.ReactNode }) {
  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS ya limita esta consulta a las membresías de quien pregunta.
  //
  // limit(1) y NO single(): una persona puede tener membresía en más de un
  // gimnasio (un entrenador que trabaja en dos), y single() tira error si
  // vuelve más de una fila. Por ahora se usa la más antigua; el selector de
  // gimnasio llega en una etapa posterior.
  const { data: membresia } = await supabase
    .from('memberships')
    .select('rol, gyms(nombre), profiles(nombre, apellido)')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  if (!membresia) {
    return (
      <main className="p-8">
        <h1 className="text-xl font-semibold">Tu cuenta no está asociada a ningún gimnasio</h1>
        <p className="mt-2 text-gray-600">Pedile a un administrador que te dé de alta.</p>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r p-4">
        <p className="font-semibold">{membresia.gyms?.nombre}</p>
        <p className="text-sm text-gray-600">
          {membresia.profiles?.nombre} · {membresia.rol}
        </p>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
```

`apps/panel/src/app/(panel)/page.tsx`:
```tsx
export default function Inicio() {
  return <h1 className="text-2xl font-semibold">Inicio</h1>
}
```

Borrar `apps/panel/src/app/page.tsx` (el que generó `create-next-app`), porque choca con la ruta `/` del grupo `(panel)`.

- [ ] **Paso 7: Probar a mano**

```bash
npm run dev --workspace apps/panel
```

1. Abrí `http://localhost:3000` → tiene que redirigir a `/login`.
2. Creá un usuario y su membresía. En el *SQL Editor* del Studio:
```sql
insert into gyms (nombre, slug) values ('Gimnasio Prueba', 'prueba')
returning id;
```
Después, *Authentication* → *Add user* → `admin@prueba.com` / `prueba1234`,
con *Auto Confirm User* tildado (si no, no puede entrar). Y con los dos ids:
```sql
insert into memberships (gym_id, user_id, rol)
values ('<id del gym>', '<id del usuario>', 'admin');
```
3. Entrá con `admin@prueba.com`. Tiene que verse "Gimnasio Prueba" y el rol "admin" en la barra lateral.
4. Con una contraseña incorrecta tiene que aparecer "Correo o contraseña incorrectos".

- [ ] **Paso 8: Commit**

```bash
git add apps/panel package.json package-lock.json
git commit -m "Agregar autenticación y layout base del panel web"
```

---

### Tarea 6: Autenticación en la app móvil

**Archivos:**
- Crear: `apps/movil/` (Expo), `apps/movil/src/lib/supabase.ts`, `apps/movil/src/app/_layout.tsx`, `apps/movil/src/app/login.tsx`, `apps/movil/src/app/(tabs)/_layout.tsx`, `apps/movil/src/app/(tabs)/index.tsx`

**Interfaces:**
- Consume: `@gym/core` (`Database`), tablas y RLS de las Tareas 3 y 4
- Produce:
  - `supabase: SupabaseClient<Database>` exportado desde `apps/movil/src/lib/supabase.ts`
  - Las rutas `/login` y `/(tabs)`, con la redirección entre ambas ya resuelta en `app/_layout.tsx`

- [ ] **Paso 1: Crear la app**

```bash
npx create-expo-app@latest apps/movil --template default --no-install --yes

# El workspace es nuevo: sin este install de raíz npm no lo registra.
npm install

# expo install y no npm install: elige las versiones que corresponden al SDK.
cd apps/movil && npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill && cd ../..
npm install --workspace movil @gym/core@*
```

> Aunque le pases `--yes`, `create-expo-app` igual pregunta "Skip initializing
> a new git repository?". Contestá que sí: estamos dentro de un repo.

El template del SDK 57 trae una app de demostración. Hay que borrarla, porque
`src/app/index.tsx` y `src/app/explore.tsx` chocan con las rutas de abajo:

```bash
rm -rf apps/movil/src/components apps/movil/src/hooks apps/movil/src/constants \n       apps/movil/src/global.css apps/movil/src/app/index.tsx apps/movil/src/app/explore.tsx
```

No es solo prolijidad: `src/hooks/use-color-scheme.web.ts` llama a `setState`
dentro de un efecto y hace fallar `expo lint` con un **error**, no un warning.

En `app.json`, cambiar `"web": { "output": "static" }` por `"single"`. Con
`static`, Expo prerenderiza las rutas en Node y el export muere con
`ReferenceError: window is not defined`: `lib/supabase.ts` construye el cliente
al importarse y AsyncStorage toca `window`. Acá no hay nada que prerenderizar,
todas las pantallas dependen de la sesión.

> **Ojo con `tsc`**: `expo-env.d.ts` y `.expo/types` los genera `expo start`
> (no `expo export`). Hasta que corras el server una vez, el typecheck falla
> por tipos que todavía no existen.

- [ ] **Paso 2: Configurar el entorno**

Crear `apps/movil/.env` usando **la IP de tu máquina en la red local**, no
`127.0.0.1` (`ipconfig` → *Dirección IPv4*):
```bash
EXPO_PUBLIC_SUPABASE_URL=http://192.168.0.15:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<el anon key de db:estado>
```

> Desde un celular con Expo Go, `127.0.0.1` es el propio teléfono, así que no
> llega a nada. La IP de la LAN sirve para las dos cosas —celular y vista web—
> y Supabase local ya escucha ahí, no hace falta configurarle nada. En el
> emulador de Android va `http://10.0.2.2:54321`. Si cambiás de red, la IP
> cambia y hay que actualizar el archivo.

- [ ] **Paso 3: Cliente de Supabase**

`apps/movil/src/lib/supabase.ts`:
```ts
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@gym/core'

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      // Guarda la sesión en el teléfono para no pedir login en cada apertura.
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // React Native no tiene URL de navegador de donde leer el token.
      detectSessionInUrl: false,
    },
  },
)
```

- [ ] **Paso 4: Layout raíz con manejo de sesión**

`apps/movil/src/app/_layout.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Stack, router, useSegments } from 'expo-router'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export default function LayoutRaiz() {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)
  const segmentos = useSegments()

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

  if (cargando) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    )
  }

  return <Stack screenOptions={{ headerShown: false }} />
}
```

- [ ] **Paso 5: Pantalla de login**

`apps/movil/src/app/login.tsx`:
```tsx
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
```

- [ ] **Paso 6: Pestañas con los datos de la membresía**

`apps/movil/src/app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from 'expo-router'

export default function LayoutPestanas() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Hoy' }} />
    </Tabs>
  )
}
```

`apps/movil/src/app/(tabs)/index.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { Button, StyleSheet, Text, View } from 'react-native'
import { supabase } from '@/lib/supabase'

export default function Hoy() {
  const [gym, setGym] = useState<string | null>(null)
  const [rol, setRol] = useState<string | null>(null)

  useEffect(() => {
    // limit(1) y no single(): ver la nota del layout del panel. Una persona
    // puede pertenecer a más de un gimnasio.
    supabase
      .from('memberships')
      .select('rol, gyms(nombre)')
      .order('created_at')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setGym(data?.gyms?.nombre ?? null)
        setRol(data?.rol ?? null)
      })
  }, [])

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.titulo}>{gym ?? 'Sin gimnasio asignado'}</Text>
      {rol && <Text style={estilos.sub}>Tu rol: {rol}</Text>}
      <Button title="Cerrar sesión" onPress={() => supabase.auth.signOut()} />
    </View>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  titulo: { fontSize: 24, fontWeight: '600' },
  sub: { color: '#666' },
})
```

- [ ] **Paso 7: Probar a mano**

```bash
npm run start --workspace apps/movil
```

Abrí la app con Expo Go escaneando el QR, o con `w` para verla en el navegador.

1. Arranca en la pantalla de login.
2. Entrá con `admin@prueba.com` (el de la Tarea 5): tiene que aparecer "Gimnasio Prueba" y el rol.
3. *Cerrar sesión* vuelve al login.
4. Cerrá la app por completo y volvé a abrirla: **tiene que seguir la sesión iniciada**. Si pide login otra vez, AsyncStorage no está funcionando.

- [ ] **Paso 8: Commit**

```bash
git add apps/movil package.json package-lock.json
git commit -m "Agregar autenticación y navegación base de la app móvil"
```

---

**Fin de la Etapa 0.** Verificación de cierre: `npm run test:core && npm run test:rls` pasan, y las dos apps hacen login mostrando el gimnasio y el rol correctos.

---

# PARTE B — Etapa 1: Ejercicios, máquinas y videos

Al terminar la Parte B: un empleado carga las máquinas de su gimnasio, crea ejercicios, les sube un video desde el navegador, y el socio ve ese catálogo en el celular y reproduce el video.

---

### Tarea 7: Migración de ejercicios, máquinas y videos

**Archivos:**
- Crear: `supabase/migrations/0003_ejercicios.sql`, `supabase/migrations/0004_rls_ejercicios.sql`, `tests/rls/ejercicios.test.ts`
- Modificar: `packages/core/src/tipos-db.ts` (regenerado)

**Interfaces:**
- Consume: `mis_gyms()`, `mi_rol()`, `soy_superadmin()` (Tarea 4); `crearEscenario()` (Tarea 4)
- Produce: tablas `maquinas`, `videos`, `ejercicios`; tipos `grupo_muscular`, `tipo_equipamiento`, `estado_video`

- [ ] **Paso 1: Escribir la migración de tablas**

`supabase/migrations/0003_ejercicios.sql`:
```sql
create type grupo_muscular as enum (
  'pecho', 'espalda', 'hombros', 'biceps', 'triceps', 'cuadriceps',
  'isquiotibiales', 'gluteos', 'gemelos', 'abdominales', 'antebrazo',
  'cuerpo_completo'
);

create type tipo_equipamiento as enum (
  'barra', 'mancuerna', 'maquina', 'polea', 'kettlebell', 'banda',
  'peso_corporal', 'otro'
);

create type estado_video as enum ('procesando', 'listo', 'error');

-- Las máquinas que tiene físicamente cada gimnasio. Existen como tabla
-- propia porque habilitan el filtro "solo lo que hay acá" al armar rutinas.
create table maquinas (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  nombre      text not null,
  marca       text,
  foto_url    text,
  cantidad    integer not null default 1 check (cantidad > 0),
  notas       text,
  created_at  timestamptz not null default now(),
  -- Redundante con la clave primaria, pero necesaria: es el destino de la
  -- clave foránea compuesta de `ejercicios` de más abajo.
  unique (id, gym_id)
);

create index maquinas_gym_id_idx on maquinas (gym_id);

-- gym_id nulo = video del catálogo global.
-- Tabla propia y no un campo `video_url` en ejercicios porque un video
-- subido a Cloudflare NO está disponible al terminar la subida: tarda en
-- transcodificar, y ese estado hay que poder representarlo.
create table videos (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid references gyms(id) on delete cascade,
  stream_uid     text not null unique,
  estado         estado_video not null default 'procesando',
  duracion_seg   integer,
  thumbnail_url  text,
  subido_por     uuid references memberships(id) on delete set null,
  error_detalle  text,
  created_at     timestamptz not null default now()
);

create index videos_gym_id_idx on videos (gym_id);

-- gym_id nulo = ejercicio del catálogo global, visible para todos los
-- gimnasios y editable por ninguno.
create table ejercicios (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid references gyms(id) on delete cascade,
  nombre          text not null,
  descripcion     text,
  instrucciones   text,
  grupo_muscular  grupo_muscular not null,
  equipamiento    tipo_equipamiento not null,
  maquina_id      uuid,
  video_id        uuid references videos(id) on delete set null,
  creado_por      uuid references memberships(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index ejercicios_gym_id_idx  on ejercicios (gym_id);
create index ejercicios_grupo_idx   on ejercicios (grupo_muscular);

-- Un ejercicio global no puede apuntar a una máquina, que siempre es de
-- algún gimnasio concreto.
alter table ejercicios add constraint ejercicio_global_sin_maquina
  check (gym_id is not null or maquina_id is null);

-- La máquina tiene que ser del MISMO gimnasio que el ejercicio. Una FK a
-- maquinas(id) a secas dejaría que un ejercicio del gimnasio A apunte a una
-- máquina del B: RLS no lo impide, porque es un problema de integridad y no
-- de visibilidad. Al incluir gym_id en la FK, lo garantiza la base.
--
-- Con maquina_id nulo la restricción no se evalúa (MATCH SIMPLE), que es
-- justo lo que hace falta para los ejercicios globales.
--
-- `set null (maquina_id)` nombra la columna a propósito: sin esa lista,
-- borrar una máquina intentaría anular también gym_id, que es NOT NULL en
-- los ejercicios de un gimnasio. Requiere PostgreSQL 15+.
alter table ejercicios add constraint ejercicio_maquina_del_mismo_gym
  foreign key (maquina_id, gym_id) references maquinas (id, gym_id)
  on delete set null (maquina_id);
```

- [ ] **Paso 2: Escribir las políticas**

`supabase/migrations/0004_rls_ejercicios.sql`:
```sql
alter table maquinas   enable row level security;
alter table videos     enable row level security;
alter table ejercicios enable row level security;

-- Máquinas: son del gimnasio. Las gestionan entrenadores y admins.
create policy maquinas_leer on maquinas for select
  using (gym_id in (select mis_gyms()));

create policy maquinas_crear on maquinas for insert
  with check (mi_rol(gym_id) in ('entrenador', 'admin'));

-- El `with check` va explícito en las tres políticas de UPDATE de abajo.
-- Si se omite, PostgreSQL reutiliza el `using` para la fila nueva y el
-- resultado es el mismo, pero esa equivalencia es implícita: alcanza con que
-- alguien agregue un `with check` distinto por otro motivo para abrir, sin
-- darse cuenta, la posibilidad de mudar una fila a otro gimnasio. Escrito,
-- no se pierde.
create policy maquinas_editar on maquinas for update
  using (mi_rol(gym_id) in ('entrenador', 'admin'))
  with check (mi_rol(gym_id) in ('entrenador', 'admin'));

-- Videos: los globales los ve todo el mundo; los del gimnasio, solo su gente.
create policy videos_leer on videos for select
  using (gym_id is null or gym_id in (select mis_gyms()));

create policy videos_crear on videos for insert
  with check (gym_id is not null and mi_rol(gym_id) in ('entrenador', 'admin'));

create policy videos_editar on videos for update
  using (gym_id is not null and mi_rol(gym_id) in ('entrenador', 'admin'))
  with check (gym_id is not null and mi_rol(gym_id) in ('entrenador', 'admin'));

-- Ejercicios: idéntico criterio.
-- Ojo con el `gym_id is not null` del insert: impide que un gimnasio se
-- cuele contenido en el catálogo global. Los ejercicios globales los carga
-- el seed, que corre con service_role y no pasa por RLS.
create policy ejercicios_leer on ejercicios for select
  using (gym_id is null or gym_id in (select mis_gyms()));

create policy ejercicios_crear on ejercicios for insert
  with check (gym_id is not null and mi_rol(gym_id) in ('entrenador', 'admin'));

create policy ejercicios_editar on ejercicios for update
  using (gym_id is not null and mi_rol(gym_id) in ('entrenador', 'admin'))
  with check (gym_id is not null and mi_rol(gym_id) in ('entrenador', 'admin'));

-- Ninguna de las tres tablas define política de DELETE, así que con RLS
-- activa el borrado queda denegado para todos. Es deliberado: el historial
-- de un socio apunta a estos ejercicios, y borrarlos dejaría huecos. Si más
-- adelante hace falta dar de baja algo, va por una columna `archivado`, no
-- por un delete. `service_role` sigue pudiendo borrar para tareas de
-- mantenimiento.
--
-- Tampoco hay rama `or soy_superadmin()` en ninguna: el superadmin
-- administra la plataforma —gimnasios y membresías—, no el contenido de
-- cada gimnasio. Que no pueda leer los ejercicios ajenos es la intención.
```

- [ ] **Paso 3: Escribir los tests de aislamiento**

`tests/rls/ejercicios.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, crearEscenario, type Escenario } from './ayudas'

describe('aislamiento de ejercicios, máquinas y videos', () => {
  let e: Escenario
  let ejercicioDeB: string
  let maquinaDeB: string
  let maquinaDeA: string

  beforeAll(async () => {
    e = await crearEscenario()

    const { data: maquinaB } = await admin
      .from('maquinas')
      .insert({ gym_id: e.gymB, nombre: 'Prensa Hammer' })
      .select('id').single()
    maquinaDeB = maquinaB!.id

    const { data: maquinaA } = await admin
      .from('maquinas')
      .insert({ gym_id: e.gymA, nombre: 'Prensa del gym A' })
      .select('id').single()
    maquinaDeA = maquinaA!.id

    const { data: ejercicio } = await admin
      .from('ejercicios')
      .insert({
        gym_id: e.gymB, nombre: 'Prensa 45° del gym B',
        grupo_muscular: 'cuadriceps', equipamiento: 'maquina',
      })
      .select('id').single()
    ejercicioDeB = ejercicio!.id

    // Ejercicio del catálogo global: lo tienen que ver los dos gimnasios.
    await admin.from('ejercicios').insert({
      gym_id: null, nombre: 'Sentadilla con barra',
      grupo_muscular: 'cuadriceps', equipamiento: 'barra',
    })
  })

  it('un socio ve los ejercicios del catálogo global', async () => {
    const { data } = await e.comoSocioA
      .from('ejercicios').select('nombre').is('gym_id', null)
    expect(data?.some((x) => x.nombre === 'Sentadilla con barra')).toBe(true)
  })

  it('un socio NO ve los ejercicios propios de otro gimnasio', async () => {
    const { data } = await e.comoSocioA
      .from('ejercicios').select('id').eq('id', ejercicioDeB)
    expect(data).toEqual([])
  })

  it('un socio NO ve las máquinas de otro gimnasio', async () => {
    const { data } = await e.comoSocioA
      .from('maquinas').select('id').eq('id', maquinaDeB)
    expect(data).toEqual([])
  })

  it('un socio SÍ ve las máquinas de su propio gimnasio', async () => {
    const { data } = await e.comoSocioA
      .from('maquinas').select('id').eq('id', maquinaDeA)
    expect(data?.map((m) => m.id)).toEqual([maquinaDeA])
  })

  it('un socio NO puede crear ejercicios ni en su propio gimnasio', async () => {
    const { error } = await e.comoSocioA.from('ejercicios').insert({
      gym_id: e.gymA, nombre: 'Inventado',
      grupo_muscular: 'pecho', equipamiento: 'barra',
    })
    expect(error).not.toBeNull()
  })

  it('un socio NO puede crear máquinas', async () => {
    const { error } = await e.comoSocioA.from('maquinas').insert({
      gym_id: e.gymA, nombre: 'Máquina inventada',
    })
    expect(error).not.toBeNull()
  })

  it('un admin SÍ puede crear ejercicios en su gimnasio', async () => {
    const { error } = await e.comoAdminA.from('ejercicios').insert({
      gym_id: e.gymA, nombre: 'Press plano del gym A',
      grupo_muscular: 'pecho', equipamiento: 'barra',
    })
    expect(error).toBeNull()
  })

  it('un admin NO puede meter ejercicios en el catálogo global', async () => {
    const { error } = await e.comoAdminA.from('ejercicios').insert({
      gym_id: null, nombre: 'Intento de colarse',
      grupo_muscular: 'pecho', equipamiento: 'barra',
    })
    expect(error).not.toBeNull()
  })

  it('un admin NO puede crear ejercicios en un gimnasio ajeno', async () => {
    const { error } = await e.comoAdminA.from('ejercicios').insert({
      gym_id: e.gymB, nombre: 'Intento cruzado',
      grupo_muscular: 'pecho', equipamiento: 'barra',
    })
    expect(error).not.toBeNull()
  })

  // Alcance de este test, para no leerle de más: comprueba el comportamiento
  // observable a través de PostgREST, que es como entran las apps. NO aísla
  // el `with check` de la política: se comprobó que PostgREST rechaza el
  // update igual —la fila deja de ser visible después— aunque la política
  // tenga `with check (true)`. La garantía a nivel SQL la da el `with check`
  // explícito de 0004_rls_ejercicios.sql, verificado aparte con psql.
  it('un admin NO puede mudar un ejercicio suyo a otro gimnasio', async () => {
    const { data: mio } = await e.comoAdminA
      .from('ejercicios')
      .insert({
        gym_id: e.gymA, nombre: 'Para intentar mudarlo',
        grupo_muscular: 'espalda', equipamiento: 'barra',
      })
      .select('id').single()

    const { error } = await e.comoAdminA
      .from('ejercicios')
      .update({ gym_id: e.gymB })
      .eq('id', mio!.id)
    expect(error).not.toBeNull()

    // Y la fila quedó donde estaba.
    const { data: despues } = await admin
      .from('ejercicios').select('gym_id').eq('id', mio!.id).single()
    expect(despues!.gym_id).toBe(e.gymA)
  })

  // Esto no lo cubre RLS: es la clave foránea compuesta (maquina_id, gym_id).
  it('un ejercicio NO puede apuntar a una máquina de otro gimnasio', async () => {
    const { error } = await e.comoAdminA.from('ejercicios').insert({
      gym_id: e.gymA, nombre: 'Con máquina ajena',
      grupo_muscular: 'cuadriceps', equipamiento: 'maquina',
      maquina_id: maquinaDeB,
    })
    expect(error).not.toBeNull()
  })

  it('un ejercicio SÍ puede apuntar a una máquina de su gimnasio', async () => {
    const { error } = await e.comoAdminA.from('ejercicios').insert({
      gym_id: e.gymA, nombre: 'Con máquina propia',
      grupo_muscular: 'cuadriceps', equipamiento: 'maquina',
      maquina_id: maquinaDeA,
    })
    expect(error).toBeNull()
  })

  // Ninguna de las tres tablas define política de DELETE, y con RLS activa
  // eso significa denegado para todos. Sin test, nadie se entera si alguien
  // agrega una política de borrado sin pensarla.
  it('ni siquiera un admin puede borrar ejercicios', async () => {
    const { data: mio } = await e.comoAdminA
      .from('ejercicios')
      .insert({
        gym_id: e.gymA, nombre: 'Para intentar borrarlo',
        grupo_muscular: 'gemelos', equipamiento: 'peso_corporal',
      })
      .select('id').single()

    await e.comoAdminA.from('ejercicios').delete().eq('id', mio!.id)

    const { data: sigue } = await admin
      .from('ejercicios').select('id').eq('id', mio!.id)
    expect(sigue?.map((x) => x.id)).toEqual([mio!.id])
  })
})
```

- [ ] **Paso 4: Correr los tests**

```bash
npm run db:reset && npm run test:rls
```
Esperado: 26 en verde — 13 de identidad y 13 nuevos.

Y como pide la Tarea 4, comprobá que los tests sirven de verdad: rompé a mano
la FK compuesta y confirmá que falla el test de la máquina ajena.

> **Un límite que conviene saber.** El test de "no puede mudar un ejercicio a
> otro gimnasio" pasa aunque le pongas `with check (true)` a la política:
> PostgREST rechaza igual el update porque la fila deja de ser visible después.
> La garantía a nivel SQL la da el `with check` explícito, y para verla hay que
> salir de PostgREST y probar con psql haciendo `set role authenticated`.

- [ ] **Paso 5: Regenerar los tipos**

```bash
npm run db:tipos
```

- [ ] **Paso 6: Commit**

```bash
git add supabase/migrations tests/rls packages/core/src/tipos-db.ts
git commit -m "Agregar ejercicios, máquinas y videos con RLS y catálogo global"
```

---

### Tarea 8: Semilla del catálogo global

**Archivos:**
- Crear: `supabase/seed.sql`

**Interfaces:**
- Consume: tabla `ejercicios` (Tarea 7)
- Produce: 12 ejercicios con `gym_id = null`, disponibles tras cada `db:reset`

- [ ] **Paso 1: Escribir la semilla**

`supabase/seed.sql`:
```sql
-- Catálogo global: ejercicios que ve todo gimnasio desde el día uno, sin
-- tener que filmar nada. Corre con service_role, así que no pasa por RLS.
-- Todavía sin video: los videos globales se graban aparte y se asocian
-- cuando existan.
insert into ejercicios (gym_id, nombre, grupo_muscular, equipamiento, descripcion) values
  (null, 'Press de banca con barra',    'pecho',          'barra',         'Acostado en banco plano, barra a la altura del pecho.'),
  (null, 'Press inclinado con mancuernas', 'pecho',       'mancuerna',     'Banco a 30-45 grados.'),
  (null, 'Dominadas',                   'espalda',        'peso_corporal', 'Agarre prono, más ancho que los hombros.'),
  (null, 'Remo con barra',              'espalda',        'barra',         'Torso inclinado a 45 grados, espalda recta.'),
  (null, 'Jalón al pecho en polea',     'espalda',        'polea',         'Llevar la barra al pecho, no a la nuca.'),
  (null, 'Press militar con barra',     'hombros',        'barra',         'De pie, barra desde los hombros hasta arriba.'),
  (null, 'Elevaciones laterales',       'hombros',        'mancuerna',     'Subir hasta la altura de los hombros.'),
  (null, 'Curl de bíceps con barra',    'biceps',         'barra',         'Codos pegados al cuerpo.'),
  (null, 'Fondos en paralelas',         'triceps',        'peso_corporal', 'Torso vertical para cargar tríceps.'),
  (null, 'Sentadilla con barra',        'cuadriceps',     'barra',         'Barra en la espalda alta, bajar hasta paralelo.'),
  (null, 'Peso muerto',                 'isquiotibiales', 'barra',         'Espalda neutra, barra pegada a las piernas.'),
  (null, 'Plancha abdominal',           'abdominales',    'peso_corporal', 'Cuerpo alineado, sin hundir la cadera.');
```

- [ ] **Paso 2: Aplicar y verificar**

```bash
npm run db:reset
```

En el *SQL Editor* del Studio:
```sql
select count(*) from ejercicios where gym_id is null;
```
Esperado: `12`.

- [ ] **Paso 3: Verificar que los tests siguen pasando**

Correr: `npm run test:rls`
Esperado: PASAN todos. La semilla agrega filas globales, y el test "un socio ve los ejercicios del catálogo global" ahora tiene más datos que antes: sigue siendo válido.

- [ ] **Paso 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "Agregar semilla con 12 ejercicios del catálogo global"
```

---

### Tarea 9: Gestión de máquinas en el panel

**Archivos:**
- Crear: `apps/panel/src/app/(panel)/maquinas/page.tsx`, `apps/panel/src/app/(panel)/maquinas/acciones.ts`, `apps/panel/src/app/(panel)/maquinas/formulario.tsx`
- Modificar: `apps/panel/src/app/(panel)/layout.tsx` (agregar navegación)

**Interfaces:**
- Consume: `crearClienteServidor()` (Tarea 5), tabla `maquinas` (Tarea 7)
- Produce: `crearMaquina(estadoPrevio, datosFormulario): Promise<{ error?: string }>` — Server Action pensada para `useActionState`

- [ ] **Paso 1: Escribir la Server Action**

> Una Server Action pasada directo a `<form action={...}>` tiene que devolver
> `void`: si devuelve algo, TypeScript la rechaza. Un `{ error }` devuelto así
> no compila, y aunque compilara no llegaría nunca a la pantalla. Por eso la
> firma lleva el estado previo adelante y el formulario es un componente
> cliente con `useActionState`, que es lo que hace visible el error.

`apps/panel/src/app/(panel)/maquinas/acciones.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export type EstadoFormulario = { error?: string }

// La firma con estado previo es la que pide useActionState. Una Server Action
// pasada directo a <form action> tiene que devolver void, y entonces el
// { error } no llegaría nunca a la pantalla.
export async function crearMaquina(
  _estadoPrevio: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const nombre = String(datos.get('nombre') ?? '').trim()
  const marca = String(datos.get('marca') ?? '').trim()
  const cantidad = Number(datos.get('cantidad') ?? 1)

  if (!nombre) return { error: 'El nombre es obligatorio' }
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return { error: 'La cantidad tiene que ser un número entero mayor a cero' }
  }

  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión vencida' }

  // limit(1) y no single(): una persona puede pertenecer a varios gimnasios.
  const { data: membresia } = await supabase
    .from('memberships').select('gym_id').eq('user_id', user.id)
    .order('created_at').limit(1).maybeSingle()
  if (!membresia) return { error: 'No estás asociado a ningún gimnasio' }

  // Si el rol no alcanza, RLS rechaza el insert. No hace falta chequearlo
  // acá además: la base es la autoridad.
  const { error } = await supabase.from('maquinas').insert({
    gym_id: membresia.gym_id,
    nombre,
    marca: marca || null,
    cantidad,
  })

  if (error) return { error: 'No pudimos guardar la máquina' }

  revalidatePath('/maquinas')
  return {}
}
```

- [ ] **Paso 2: Escribir la pantalla**

`apps/panel/src/app/(panel)/maquinas/page.tsx`:
```tsx
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { FormularioMaquina } from './formulario'

export default async function Maquinas() {
  const supabase = await crearClienteServidor()
  const { data: maquinas } = await supabase
    .from('maquinas')
    .select('id, nombre, marca, cantidad')
    .order('nombre')

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Máquinas</h1>

      <FormularioMaquina />

      {maquinas?.length ? (
        <ul className="divide-y rounded border">
          {maquinas.map((m) => (
            <li key={m.id} className="flex justify-between px-4 py-3">
              <span>{m.nombre}{m.marca && <span className="text-gray-500"> · {m.marca}</span>}</span>
              <span className="text-gray-500">{m.cantidad}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-600">
          Todavía no cargaste ninguna máquina. Agregá las que tenga tu gimnasio
          para poder filtrar ejercicios por lo que hay disponible.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Paso 2b: Escribir el formulario (componente cliente)**

`apps/panel/src/app/(panel)/maquinas/formulario.tsx`:
```tsx
'use client'

import { useActionState } from 'react'
import { crearMaquina, type EstadoFormulario } from './acciones'

const INICIAL: EstadoFormulario = {}

export function FormularioMaquina() {
  const [estado, accion, pendiente] = useActionState(crearMaquina, INICIAL)

  return (
    <div className="space-y-2">
      <form action={accion} className="flex flex-wrap gap-2">
        <input name="nombre" placeholder="Nombre" required
          className="rounded border px-3 py-2" />
        <input name="marca" placeholder="Marca (opcional)"
          className="rounded border px-3 py-2" />
        <input name="cantidad" type="number" min={1} defaultValue={1}
          className="w-24 rounded border px-3 py-2" />
        <button type="submit" disabled={pendiente}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
          {pendiente ? 'Guardando…' : 'Agregar'}
        </button>
      </form>

      {estado.error && (
        <p role="alert" className="text-sm text-red-600">{estado.error}</p>
      )}
    </div>
  )
}
```

- [ ] **Paso 3: Agregar el enlace en la barra lateral**

En `apps/panel/src/app/(panel)/layout.tsx`, dentro del `<aside>`, después del bloque del nombre:
```tsx
<nav className="mt-6 flex flex-col gap-1 text-sm">
  <Link href="/" className="rounded px-2 py-1 hover:bg-gray-100">Inicio</Link>
  <Link href="/maquinas" className="rounded px-2 py-1 hover:bg-gray-100">Máquinas</Link>
  <Link href="/ejercicios" className="rounded px-2 py-1 hover:bg-gray-100">Ejercicios</Link>
</nav>
```

Y arriba del archivo, `import Link from 'next/link'`. Con `<a>` cada clic
recarga la página entera y se pierde la navegación del lado del cliente.

- [ ] **Paso 4: Probar a mano**

Con `npm run dev --workspace apps/panel`, entrando como `admin@prueba.com`:

1. Ir a `/maquinas` → mensaje de lista vacía.
2. Agregar "Prensa 45°", marca "Hammer", cantidad 2 → aparece en la lista.
3. Agregar sin nombre → el navegador lo bloquea por `required`.
4. Recargar la página → la máquina sigue ahí.
5. Entrar con un usuario de rol `socio` y probar el alta → tiene que aparecer
   "No pudimos guardar la máquina". La acción no chequea el rol a propósito:
   lo rechaza RLS, y así hay una sola autoridad y no dos que se desincronizan.

- [ ] **Paso 5: Commit**

```bash
git add apps/panel/src
git commit -m "Agregar alta y listado de máquinas en el panel"
```

---

### Tarea 10: Alta y listado de ejercicios en el panel

Sin video todavía: eso llega en la Tarea 12.

**Archivos:**
- Crear: `packages/core/src/catalogo.ts`, `packages/core/tests/catalogo.test.ts`, `apps/panel/src/app/(panel)/ejercicios/page.tsx`, `apps/panel/src/app/(panel)/ejercicios/acciones.ts`, `apps/panel/src/app/(panel)/ejercicios/formulario.tsx`

**Interfaces:**
- Consume: `crearClienteServidor()`, tablas `ejercicios` y `maquinas`
- Produce: `crearEjercicio(estadoPrevio, datos): Promise<{ error?: string }>` — Server Action para `useActionState`

- [ ] **Paso 1: Escribir el test de `etiqueta` (falla)**

`packages/core/tests/catalogo.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { EQUIPAMIENTOS, GRUPOS_MUSCULARES, etiqueta } from '../src/catalogo'
import { Constants } from '../src/tipos-db'

describe('etiqueta', () => {
  it('traduce los valores de la base a texto con acentos', () => {
    expect(etiqueta('biceps')).toBe('Bíceps')
    expect(etiqueta('cuerpo_completo')).toBe('Cuerpo completo')
    expect(etiqueta('peso_corporal')).toBe('Peso corporal')
  })

  it('tiene etiqueta para TODOS los valores posibles', () => {
    for (const valor of [...GRUPOS_MUSCULARES, ...EQUIPAMIENTOS]) {
      expect(etiqueta(valor)).toBeTruthy()
    }
  })
})

// Las listas se derivan de los tipos que genera Supabase, no se copian a mano.
// Si alguien las vuelve a escribir a mano, este test avisa en cuanto la base
// cambie: el enum de PostgreSQL es la única fuente de verdad.
describe('las listas salen del enum de la base', () => {
  it('GRUPOS_MUSCULARES es el enum grupo_muscular', () => {
    expect(GRUPOS_MUSCULARES).toEqual(Constants.public.Enums.grupo_muscular)
  })

  it('EQUIPAMIENTOS es el enum tipo_equipamiento', () => {
    expect(EQUIPAMIENTOS).toEqual(Constants.public.Enums.tipo_equipamiento)
  })
})
```

Correr `npm run test:core`: tiene que **fallar** con "Cannot find module
'../src/catalogo'". Si pasa, el test no está probando lo que creés.

- [ ] **Paso 2: Implementar `catalogo.ts`**

`packages/core/src/catalogo.ts`:
```ts
import { Constants } from './tipos-db'

// Derivadas del enum de PostgreSQL, no copiadas a mano: `npm run db:tipos`
// regenera tipos-db.ts desde la base, así que estas listas no pueden quedar
// desincronizadas con ella. Una lista escrita a mano sí puede, y en silencio.
export const GRUPOS_MUSCULARES = Constants.public.Enums.grupo_muscular
export const EQUIPAMIENTOS = Constants.public.Enums.tipo_equipamiento

export type GrupoMuscular = (typeof GRUPOS_MUSCULARES)[number]
export type Equipamiento = (typeof EQUIPAMIENTOS)[number]

// El Record exige una clave por cada valor posible. Si mañana se agrega un
// grupo muscular al enum y se regeneran los tipos, esto deja de compilar
// hasta que alguien escriba su etiqueta. Es a propósito: mejor un error de
// compilación que una pantalla mostrando "isquiotibiales_posteriores".
const ETIQUETAS: Record<GrupoMuscular | Equipamiento, string> = {
  pecho: 'Pecho', espalda: 'Espalda', hombros: 'Hombros', biceps: 'Bíceps',
  triceps: 'Tríceps', cuadriceps: 'Cuádriceps', isquiotibiales: 'Isquiotibiales',
  gluteos: 'Glúteos', gemelos: 'Gemelos', abdominales: 'Abdominales',
  antebrazo: 'Antebrazo', cuerpo_completo: 'Cuerpo completo',
  barra: 'Barra', mancuerna: 'Mancuerna', maquina: 'Máquina', polea: 'Polea',
  kettlebell: 'Kettlebell', banda: 'Banda', peso_corporal: 'Peso corporal',
  otro: 'Otro',
}

/** Convierte el valor de la base al texto que ve el usuario. */
export function etiqueta(valor: GrupoMuscular | Equipamiento): string {
  return ETIQUETAS[valor]
}
```

Agregar a `packages/core/src/index.ts`:
```ts
export { GRUPOS_MUSCULARES, EQUIPAMIENTOS, etiqueta } from './catalogo'
export type { GrupoMuscular, Equipamiento } from './catalogo'
```

- [ ] **Paso 3: Correr el test**

Correr: `npm run test:core`
Esperado: PASA.

La red de seguridad real no es el test sino el tipo: `Record<GrupoMuscular |
Equipamiento, string>` exige una clave por valor posible, así que si mañana se
agrega un grupo al enum y se regeneran los tipos, `catalogo.ts` **deja de
compilar** hasta que alguien escriba la etiqueta. Comprobalo borrando una y
corriendo `tsc`.

- [ ] **Paso 4: Escribir la Server Action**

`apps/panel/src/app/(panel)/ejercicios/acciones.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { EQUIPAMIENTOS, GRUPOS_MUSCULARES } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export type EstadoFormulario = { error?: string }

// Estado previo adelante: es la firma que pide useActionState. Ver la nota en
// maquinas/acciones.ts sobre por qué no puede ir directo en <form action>.
export async function crearEjercicio(
  _estadoPrevio: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const nombre = String(datos.get('nombre') ?? '').trim()
  const grupo = String(datos.get('grupo_muscular') ?? '')
  const equipamiento = String(datos.get('equipamiento') ?? '')
  const descripcion = String(datos.get('descripcion') ?? '').trim()
  const maquinaId = String(datos.get('maquina_id') ?? '')

  if (!nombre) return { error: 'El nombre es obligatorio' }
  if (!GRUPOS_MUSCULARES.includes(grupo as never)) {
    return { error: 'Elegí un grupo muscular' }
  }
  if (!EQUIPAMIENTOS.includes(equipamiento as never)) {
    return { error: 'Elegí un tipo de equipamiento' }
  }

  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión vencida' }

  // limit(1) y no single(): una persona puede pertenecer a varios gimnasios.
  const { data: membresia } = await supabase
    .from('memberships').select('id, gym_id').eq('user_id', user.id)
    .order('created_at').limit(1).maybeSingle()
  if (!membresia) return { error: 'No estás asociado a ningún gimnasio' }

  // maquina_id no se valida acá contra el gimnasio: la clave foránea compuesta
  // (maquina_id, gym_id) de 0003_ejercicios.sql rechaza una máquina ajena
  // aunque alguien manipule el formulario.
  const { error } = await supabase.from('ejercicios').insert({
    gym_id: membresia.gym_id,
    nombre,
    descripcion: descripcion || null,
    grupo_muscular: grupo as never,
    equipamiento: equipamiento as never,
    maquina_id: maquinaId || null,
    creado_por: membresia.id,
  })

  if (error) return { error: 'No pudimos guardar el ejercicio' }

  revalidatePath('/ejercicios')
  return {}
}
```

- [ ] **Paso 5: Escribir la pantalla**

`apps/panel/src/app/(panel)/ejercicios/page.tsx`:
```tsx
import { etiqueta } from '@gym/core'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { FormularioEjercicio } from './formulario'

export default async function Ejercicios() {
  const supabase = await crearClienteServidor()

  const { data: ejercicios } = await supabase
    .from('ejercicios')
    .select('id, nombre, grupo_muscular, equipamiento, gym_id')
    .order('nombre')

  const { data: maquinas } = await supabase
    .from('maquinas').select('id, nombre').order('nombre')

  const propios = ejercicios?.filter((x) => x.gym_id !== null) ?? []
  const globales = ejercicios?.filter((x) => x.gym_id === null) ?? []

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Ejercicios</h1>

      <FormularioEjercicio maquinas={maquinas ?? []} />

      <section>
        <h2 className="mb-2 font-semibold">De mi gimnasio ({propios.length})</h2>
        {propios.length ? (
          <ul className="divide-y rounded border">
            {propios.map((x) => (
              <li key={x.id} className="px-4 py-3">
                {x.nombre}
                <span className="text-gray-500">
                  {' · '}{etiqueta(x.grupo_muscular)}{' · '}{etiqueta(x.equipamiento)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600">Todavía no cargaste ejercicios propios.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Catálogo general ({globales.length})</h2>
        <p className="mb-2 text-sm text-gray-600">
          Vienen incluidos con la plataforma. Los ven todos los gimnasios y no se editan.
        </p>
        <ul className="divide-y rounded border">
          {globales.map((x) => (
            <li key={x.id} className="px-4 py-3">
              {x.nombre}
              <span className="text-gray-500">{' · '}{etiqueta(x.grupo_muscular)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Paso 5b: Escribir el formulario (componente cliente)**

`apps/panel/src/app/(panel)/ejercicios/formulario.tsx`:
```tsx
'use client'

import { useActionState } from 'react'
import { EQUIPAMIENTOS, GRUPOS_MUSCULARES, etiqueta } from '@gym/core'
import { crearEjercicio, type EstadoFormulario } from './acciones'

const INICIAL: EstadoFormulario = {}

export function FormularioEjercicio({
  maquinas,
}: {
  maquinas: { id: string; nombre: string }[]
}) {
  const [estado, accion, pendiente] = useActionState(crearEjercicio, INICIAL)

  return (
    <div className="max-w-2xl space-y-2">
      <form action={accion} className="grid gap-2 sm:grid-cols-2">
        <input name="nombre" placeholder="Nombre" required
          className="rounded border px-3 py-2 sm:col-span-2" />

        <select name="grupo_muscular" required className="rounded border px-3 py-2">
          <option value="">Grupo muscular…</option>
          {GRUPOS_MUSCULARES.map((g) => (
            <option key={g} value={g}>{etiqueta(g)}</option>
          ))}
        </select>

        <select name="equipamiento" required className="rounded border px-3 py-2">
          <option value="">Equipamiento…</option>
          {EQUIPAMIENTOS.map((eq) => (
            <option key={eq} value={eq}>{etiqueta(eq)}</option>
          ))}
        </select>

        <select name="maquina_id" className="rounded border px-3 py-2 sm:col-span-2">
          <option value="">Sin máquina asociada</option>
          {maquinas.map((m) => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>

        <textarea name="descripcion" placeholder="Descripción (opcional)"
          className="rounded border px-3 py-2 sm:col-span-2" rows={2} />

        <button type="submit" disabled={pendiente}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 sm:col-span-2">
          {pendiente ? 'Creando…' : 'Crear ejercicio'}
        </button>
      </form>

      {estado.error && (
        <p role="alert" className="text-sm text-red-600">{estado.error}</p>
      )}
    </div>
  )
}
```

- [ ] **Paso 6: Probar a mano**

1. `/ejercicios` muestra el **catálogo general con 12** y "De mi gimnasio (0)".
   Si corriste los tests de RLS antes, van a aparecer algunos globales de más:
   comparten esta base y no se limpian entre archivos. Con `db:reset` son 12.
2. Crear "Prensa 45° Hammer", cuádriceps, máquina, asociada a la máquina de la Tarea 9 → aparece en "De mi gimnasio".
3. Enviar sin elegir grupo muscular → el navegador lo bloquea por `required`, y
   si alguien saltea el navegador, la acción devuelve "Elegí un grupo muscular".
4. Manipular el `maquina_id` para apuntar a una máquina de otro gimnasio → tiene
   que fallar con "No pudimos guardar el ejercicio". La acción no lo valida: lo
   rechaza la clave foránea compuesta de la Tarea 7.

- [ ] **Paso 7: Commit**

```bash
git add apps/panel/src packages/core
git commit -m "Agregar alta y listado de ejercicios en el panel"
```

---

### Tarea 11: Edge Function para subir videos a Cloudflare

**Archivos:**
- Crear: `supabase/functions/video-subir/index.ts`, `packages/core/src/video.ts`, `packages/core/tests/video.test.ts`
- Modificar: `.env.example`, `packages/core/src/index.ts`

**Interfaces:**
- Consume: tabla `videos` (Tarea 7)
- Produce:
  - HTTP `POST /functions/v1/video-subir` → `{ videoId: string, uploadUrl: string }`
  - `mapearEstadoCloudflare(estado: string): EstadoVideo`
  - `urlHls(customerCode: string, token: string): string`

> **Por qué se sube directo del navegador a Cloudflare y no a través de nuestro servidor:** un video de celular pesa entre 50 y 200 MB. Pasarlo por una Edge Function significaría subirlo dos veces, con límites de tamaño y de tiempo de ejecución en el medio. Cloudflare emite una **URL de subida de un solo uso**; el navegador manda el archivo ahí y nuestro backend nunca toca los bytes.

- [ ] **Paso 1: Escribir el test de las funciones puras**

`packages/core/tests/video.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mapearEstadoCloudflare, urlHls } from '../src/video'
import { Constants } from '../src/tipos-db'

describe('mapearEstadoCloudflare', () => {
  it('traduce los estados de Cloudflare a los nuestros', () => {
    expect(mapearEstadoCloudflare('ready')).toBe('listo')
    expect(mapearEstadoCloudflare('inprogress')).toBe('procesando')
    expect(mapearEstadoCloudflare('queued')).toBe('procesando')
    expect(mapearEstadoCloudflare('downloading')).toBe('procesando')
    expect(mapearEstadoCloudflare('error')).toBe('error')
  })

  it('trata como error cualquier estado desconocido', () => {
    // Si Cloudflare inventa un estado nuevo, preferimos marcarlo en error
    // y que alguien lo vea, antes que dejarlo "procesando" para siempre.
    expect(mapearEstadoCloudflare('vaya-a-saber')).toBe('error')
  })

  // Lo que devuelve esta función se escribe en videos.estado, que es un enum
  // de PostgreSQL. Si alguien agrega un estado allá y no acá, el insert falla
  // en producción; este test lo agarra antes.
  it('solo devuelve valores que existen en el enum estado_video', () => {
    const posibles = ['ready', 'queued', 'inprogress', 'downloading', 'error', 'cualquiera']
    for (const estado of posibles) {
      expect(Constants.public.Enums.estado_video).toContain(mapearEstadoCloudflare(estado))
    }
  })
})

describe('urlHls', () => {
  it('arma la URL de reproducción con el token firmado', () => {
    expect(urlHls('abc123', 'tok')).toBe(
      'https://customer-abc123.cloudflarestream.com/tok/manifest/video.m3u8',
    )
  })
})
```

- [ ] **Paso 2: Correr el test para verificar que falla**

Correr: `npm run test:core`
Esperado: FALLA — no existe `../src/video`.

- [ ] **Paso 3: Implementar**

`packages/core/src/video.ts`:
```ts
import type { Constants } from './tipos-db'

// Derivado del enum de PostgreSQL, igual que en catalogo.ts: este valor se
// escribe en videos.estado, así que si los dos se separan el insert falla en
// producción y no acá.
export type EstadoVideo = (typeof Constants)['public']['Enums']['estado_video'][number]

/**
 * Cloudflare Stream reporta el estado con su propio vocabulario.
 * Lo traducimos al nuestro en un solo lugar, así el resto del código
 * no depende de cómo lo llame el proveedor.
 */
export function mapearEstadoCloudflare(estado: string): EstadoVideo {
  switch (estado) {
    case 'ready':
      return 'listo'
    case 'queued':
    case 'inprogress':
    case 'downloading':
      return 'procesando'
    default:
      // Cualquier estado que no conocemos se marca en error a propósito. Un
      // video colgado en "procesando" para siempre no se lo queja nadie; uno
      // en error, sí.
      return 'error'
  }
}

export function urlHls(customerCode: string, token: string): string {
  return `https://customer-${customerCode}.cloudflarestream.com/${token}/manifest/video.m3u8`
}
```

Agregar a `packages/core/src/index.ts`:
```ts
export { mapearEstadoCloudflare, urlHls } from './video'
export type { EstadoVideo } from './video'
```

- [ ] **Paso 4: Correr el test para verificar que pasa**

Correr: `npm run test:core`
Esperado: PASA.

- [ ] **Paso 5: Escribir la Edge Function**

> **CORS no es opcional acá.** La Tarea 12 llama a esta función con
> `supabase.functions.invoke()` desde un componente cliente, o sea desde el
> navegador, y eso manda antes un preflight `OPTIONS`. Una función que conteste
> 405 a todo lo que no sea POST rechaza ese preflight y la subida no funciona
> nunca. Peor: el error que ve el usuario no menciona CORS por ningún lado.
> Ojo al probarlo local, que el runtime de Supabase contesta el `OPTIONS` por
> su cuenta y tapa el problema; desplegada, no.

`supabase/functions/video-subir/index.ts`:
```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CUENTA = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!
const TOKEN = Deno.env.get('CLOUDFLARE_STREAM_TOKEN')!

// El panel llama a esta función con supabase.functions.invoke() desde un
// componente cliente, o sea desde el navegador. Eso manda antes un preflight
// OPTIONS: si no se contesta, la subida falla y el error que ve el usuario no
// menciona CORS por ningún lado.
//
// Origin '*' no abre nada acá: la función exige un Bearer del usuario, y ese
// token vive en el origen del panel, al que una página ajena no llega.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const responder = (cuerpo: string, status: number) =>
  new Response(cuerpo, { status, headers: CORS })

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (peticion.method !== 'POST') return responder('Método no permitido', 405)

  const autorizacion = peticion.headers.get('Authorization')
  if (!autorizacion) return responder('Falta autenticación', 401)

  // Cliente con el token de quien llama: hereda sus permisos y su RLS.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: autorizacion } } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return responder('Sesión inválida', 401)

  // limit(1) y no single(): una persona puede pertenecer a varios gimnasios.
  const { data: membresia } = await supabase
    .from('memberships').select('id, gym_id, rol').eq('user_id', user.id)
    .order('created_at').limit(1).maybeSingle()

  // Este chequeo de rol duplica lo que ya hace RLS en el insert de más abajo,
  // y acá la duplicación es a propósito: sin él le pediríamos a Cloudflare una
  // URL de subida para alguien que después no va a poder registrar el video,
  // y esa URL quedaría colgada. La autoridad sigue siendo RLS; esto es solo
  // para no gastar al pedo.
  if (!membresia || !['entrenador', 'admin'].includes(membresia.rol)) {
    return responder('No tenés permiso para subir videos', 403)
  }

  // Pedirle a Cloudflare una URL de subida de un solo uso.
  let cuerpo: { success?: boolean; errors?: unknown; result?: { uid: string; uploadURL: string } }
  try {
    const respuesta = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CUENTA}/stream/direct_upload`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDurationSeconds: 300,
          // Sin esto, el video queda accesible con su URL pública para
          // cualquiera que la tenga. Es lo que impide que el contenido del
          // gimnasio circule por WhatsApp.
          requireSignedURLs: true,
        }),
      },
    )
    cuerpo = await respuesta.json()
  } catch (e) {
    // Cloudflare caído, sin red, o el JSON no se pudo leer. Sin este catch la
    // función revienta con un 500 sin cuerpo y el panel no sabe qué mostrar.
    console.error('No se pudo hablar con Cloudflare', e)
    return responder('No pudimos preparar la subida', 502)
  }

  if (!cuerpo.success || !cuerpo.result) {
    console.error('Cloudflare rechazó la subida', cuerpo.errors)
    return responder('No pudimos preparar la subida', 502)
  }

  const { uid, uploadURL } = cuerpo.result

  const { data: video, error } = await supabase
    .from('videos')
    .insert({
      gym_id: membresia.gym_id,
      stream_uid: uid,
      estado: 'procesando',
      subido_por: membresia.id,
    })
    .select('id')
    .single()

  if (error) {
    // Acá ya se pidió la URL a Cloudflare, así que queda un direct_upload
    // huérfano que nadie va a usar. Caducan solos, y el chequeo de rol de
    // arriba hace que este camino sea raro. Si algún día molesta, se limpia
    // con DELETE /stream/{uid}.
    console.error('No se pudo registrar el video', error)
    return responder('No pudimos registrar el video', 500)
  }

  return Response.json({ videoId: video.id, uploadUrl: uploadURL }, { headers: CORS })
})
```

- [ ] **Paso 6: Configurar las credenciales locales**

Crear `supabase/functions/.env` (ya cubierto por `.gitignore` vía `.env`):
```bash
CLOUDFLARE_ACCOUNT_ID=<tu account id>
CLOUDFLARE_STREAM_TOKEN=<token con permiso Stream:Edit>
CLOUDFLARE_CUSTOMER_CODE=<el código de tu subdominio de Stream>
```

El token se crea en Cloudflare → *My Profile* → *API Tokens* → *Create Token* → permiso **Stream: Edit**.
El `CUSTOMER_CODE` aparece en Cloudflare → *Stream* → cualquier video → la URL del reproductor tiene la forma `customer-XXXX.cloudflarestream.com`: `XXXX` es el código.

Agregar esas tres líneas a `.env.example`, sin valores.

- [ ] **Paso 7: Levantar las funciones y probar**

```bash
npx supabase functions serve --env-file supabase/functions/.env
```

En otra terminal, con un token de sesión válido (lo sacás del navegador: DevTools → Application → Local Storage → la clave que termina en `-auth-token`, campo `access_token`):
```bash
curl -X POST http://127.0.0.1:54321/functions/v1/video-subir \
  -H "Authorization: Bearer <access_token>"
```
Esperado: `{"videoId":"...","uploadUrl":"https://upload.cloudflarestream.com/..."}`

> **Sin cuenta de Cloudflare todavía se prueba casi todo.** Poné valores de
> relleno en `supabase/functions/.env` y verificá:
>
> | Caso | Esperado |
> |---|---|
> | `GET` | 405 |
> | `POST` sin `Authorization` | 401 |
> | `POST` como `socio` | 403 |
> | `POST` como `admin` | **502** |
> | filas en `videos` después | **0** |
>
> El 502 es la buena noticia: significa que pasó autenticación y rol y falló
> justo donde tenía que fallar, en Cloudflare. Y que `videos` quede vacía
> confirma que un rechazo no deja el registro a medio crear.
>
> Lo único que queda sin probar es el camino feliz: que con credenciales reales
> devuelva `{ videoId, uploadUrl }`. Al `curl` le hace falta también
> `-H "apikey: <anon key>"`, si no lo frena el gateway antes de la función.

- [ ] **Paso 8: Commit**

```bash
git add supabase/functions packages/core .env.example
git commit -m "Agregar Edge Function que emite URL de subida a Cloudflare Stream"
```

---

### Tarea 12: Subida de video desde el panel

**Archivos:**
- Crear: `supabase/functions/video-estado/index.ts`, `apps/panel/src/app/(panel)/ejercicios/subir-video.tsx`
- Modificar: `apps/panel/src/app/(panel)/ejercicios/page.tsx`

**Interfaces:**
- Consume: `POST /functions/v1/video-subir` (Tarea 11), `mapearEstadoCloudflare` (Tarea 11)
- Produce:
  - HTTP `POST /functions/v1/video-estado` con `{ videoId }` → `{ estado: EstadoVideo }`
  - Componente `<SubirVideo ejercicioId={string} />`

> **Por qué consultamos el estado en vez de recibir un webhook de Cloudflare:** un webhook necesita una URL pública, y en desarrollo local no la hay sin montar un túnel. Consultar cada pocos segundos mientras el usuario mira la pantalla es más simple de escribir y de depurar. Cuando haya volumen, el webhook lo reemplaza sin tocar el resto.

- [ ] **Paso 1: Escribir la función de estado**

`supabase/functions/video-estado/index.ts`:
```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { mapearEstadoCloudflare } from '../_compartido/video.ts'

const CUENTA = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!
const TOKEN = Deno.env.get('CLOUDFLARE_STREAM_TOKEN')!

Deno.serve(async (peticion) => {
  const autorizacion = peticion.headers.get('Authorization')
  if (!autorizacion) return new Response('Falta autenticación', { status: 401 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: autorizacion } } },
  )

  const { videoId } = await peticion.json()

  // RLS: si el video es de otro gimnasio, esto no devuelve nada.
  const { data: video } = await supabase
    .from('videos').select('id, stream_uid, estado').eq('id', videoId).single()

  if (!video) return new Response('Video no encontrado', { status: 404 })
  if (video.estado !== 'procesando') {
    return Response.json({ estado: video.estado })
  }

  const respuesta = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CUENTA}/stream/${video.stream_uid}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  )
  const cuerpo = await respuesta.json()
  if (!cuerpo.success) return Response.json({ estado: 'procesando' })

  const estado = mapearEstadoCloudflare(cuerpo.result.status?.state ?? '')

  await supabase.from('videos').update({
    estado,
    duracion_seg: cuerpo.result.duration ? Math.round(cuerpo.result.duration) : null,
    thumbnail_url: cuerpo.result.thumbnail ?? null,
    error_detalle: estado === 'error'
      ? (cuerpo.result.status?.errorReasonText ?? 'Error desconocido')
      : null,
  }).eq('id', video.id)

  return Response.json({ estado })
})
```

`supabase/functions/_compartido/video.ts` — copia de la lógica de `packages/core/src/video.ts`, porque las Edge Functions corren en Deno y no pueden importar del workspace de npm:
```ts
export type EstadoVideo = 'procesando' | 'listo' | 'error'

export function mapearEstadoCloudflare(estado: string): EstadoVideo {
  switch (estado) {
    case 'ready':
      return 'listo'
    case 'queued':
    case 'inprogress':
    case 'downloading':
      return 'procesando'
    default:
      return 'error'
  }
}

export function urlHls(customerCode: string, token: string): string {
  return `https://customer-${customerCode}.cloudflarestream.com/${token}/manifest/video.m3u8`
}
```

> Sí, está duplicado a propósito, y es la única duplicación que este plan acepta: Deno y npm no comparten resolución de módulos. Los tests de `packages/core/tests/video.test.ts` cubren esta lógica; si cambiás una, cambiá la otra.

- [ ] **Paso 2: Escribir el componente de subida**

`apps/panel/src/app/(panel)/ejercicios/subir-video.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

type Estado = 'inactivo' | 'subiendo' | 'procesando' | 'listo' | 'error'

const MAXIMO_BYTES = 200 * 1024 * 1024 // 200 MB

export function SubirVideo({ ejercicioId }: { ejercicioId: string }) {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>('inactivo')
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function subir(archivo: File) {
    if (archivo.size > MAXIMO_BYTES) {
      setEstado('error')
      setMensaje('El video no puede pesar más de 200 MB')
      return
    }

    setEstado('subiendo')
    setMensaje(null)
    const supabase = crearClienteNavegador()

    try {
      // 1. Pedir la URL de subida de un solo uso.
      const { data: preparado, error: errorPrep } =
        await supabase.functions.invoke('video-subir', { method: 'POST' })
      if (errorPrep || !preparado) throw new Error('No pudimos preparar la subida')

      // 2. Mandar el archivo directo a Cloudflare, sin pasar por nuestro servidor.
      const formulario = new FormData()
      formulario.append('file', archivo)
      const subida = await fetch(preparado.uploadUrl, {
        method: 'POST',
        body: formulario,
      })
      if (!subida.ok) throw new Error('Falló la subida a Cloudflare')

      // 3. Asociar el video al ejercicio.
      const { error: errorAsociar } = await supabase
        .from('ejercicios')
        .update({ video_id: preparado.videoId })
        .eq('id', ejercicioId)
      if (errorAsociar) throw new Error('No pudimos asociar el video al ejercicio')

      // 4. Esperar a que Cloudflare termine de transcodificar.
      setEstado('procesando')
      const listo = await esperarProcesado(supabase, preparado.videoId)
      setEstado(listo ? 'listo' : 'error')
      if (!listo) setMensaje('Cloudflare no pudo procesar el video')
      router.refresh()
    } catch (e) {
      setEstado('error')
      setMensaje(e instanceof Error ? e.message : 'Algo salió mal')
    }
  }

  return (
    <div className="space-y-1">
      <input
        type="file" accept="video/*"
        disabled={estado === 'subiendo' || estado === 'procesando'}
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          if (archivo) void subir(archivo)
        }}
      />
      {estado === 'subiendo' && <p className="text-sm text-gray-600">Subiendo…</p>}
      {estado === 'procesando' && (
        <p className="text-sm text-gray-600">
          Procesando el video. Puede tardar unos minutos; podés seguir trabajando.
        </p>
      )}
      {estado === 'listo' && <p className="text-sm text-green-700">Video listo ✅</p>}
      {mensaje && <p role="alert" className="text-sm text-red-600">{mensaje}</p>}
    </div>
  )
}

/** Consulta el estado cada 5 segundos, hasta 5 minutos. */
async function esperarProcesado(
  supabase: ReturnType<typeof crearClienteNavegador>,
  videoId: string,
): Promise<boolean> {
  for (let intento = 0; intento < 60; intento++) {
    await new Promise((r) => setTimeout(r, 5000))
    const { data } = await supabase.functions.invoke('video-estado', {
      body: { videoId },
    })
    if (data?.estado === 'listo') return true
    if (data?.estado === 'error') return false
  }
  return false
}
```

- [ ] **Paso 3: Mostrar el estado del video en el listado**

En `apps/panel/src/app/(panel)/ejercicios/page.tsx`, cambiar la consulta de ejercicios por:
```tsx
const { data: ejercicios } = await supabase
  .from('ejercicios')
  .select('id, nombre, grupo_muscular, equipamiento, gym_id, videos(estado)')
  .order('nombre')
```

Y reemplazar el `<li>` de la sección "De mi gimnasio" por:
```tsx
<li key={x.id} className="flex items-center justify-between gap-4 px-4 py-3">
  <div>
    {x.nombre}
    <span className="text-gray-500">
      {' · '}{etiqueta(x.grupo_muscular)}{' · '}{etiqueta(x.equipamiento)}
    </span>
  </div>
  {x.videos?.estado === 'listo' ? (
    <span className="text-sm text-green-700">Video listo ✅</span>
  ) : x.videos?.estado === 'procesando' ? (
    <span className="text-sm text-gray-600">Procesando…</span>
  ) : x.videos?.estado === 'error' ? (
    <span className="text-sm text-red-600">Error en el video</span>
  ) : (
    <SubirVideo ejercicioId={x.id} />
  )}
</li>
```

Agregar el import: `import { SubirVideo } from './subir-video'`

- [ ] **Paso 4: Probar de punta a punta**

Con `npx supabase functions serve --env-file supabase/functions/.env` corriendo en una terminal y el panel en otra:

1. Ir a `/ejercicios`. Los ejercicios propios sin video muestran el selector de archivo.
2. Elegir un video corto (10-20 segundos). Tiene que pasar por "Subiendo…" → "Procesando…" → "Video listo ✅".
3. Recargar la página: el ejercicio ahora dice "Video listo ✅" en vez del selector.
4. Verificá en el panel de Cloudflare → *Stream* que el video aparece ahí.
5. Probar con un archivo de más de 200 MB → mensaje de error, sin subida.

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions apps/panel/src
git commit -m "Agregar subida de video a Cloudflare desde el panel con seguimiento de estado"
```

---

### Tarea 13: Edge Function de reproducción con URL firmada

**Archivos:**
- Crear: `supabase/functions/video-url/index.ts`

**Interfaces:**
- Consume: tabla `videos`, `urlHls` (Tarea 11/12)
- Produce: HTTP `POST /functions/v1/video-url` con `{ videoId }` → `{ url: string, expiraEn: number }`

- [ ] **Paso 1: Escribir la función**

`supabase/functions/video-url/index.ts`:
```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { urlHls } from '../_compartido/video.ts'

const CUENTA = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!
const TOKEN = Deno.env.get('CLOUDFLARE_STREAM_TOKEN')!
const CODIGO_CLIENTE = Deno.env.get('CLOUDFLARE_CUSTOMER_CODE')!

const VIGENCIA_SEGUNDOS = 60 * 60 // 1 hora

Deno.serve(async (peticion) => {
  const autorizacion = peticion.headers.get('Authorization')
  if (!autorizacion) return new Response('Falta autenticación', { status: 401 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: autorizacion } } },
  )

  const { videoId } = await peticion.json()

  // Acá está toda la seguridad de esta función, y es una sola línea:
  // RLS solo devuelve el video si quien pregunta pertenece a ese gimnasio,
  // o si es un video del catálogo global.
  const { data: video } = await supabase
    .from('videos').select('stream_uid, estado').eq('id', videoId).single()

  if (!video) return new Response('Video no encontrado', { status: 404 })
  if (video.estado !== 'listo') {
    return new Response('El video todavía se está procesando', { status: 409 })
  }

  const expira = Math.floor(Date.now() / 1000) + VIGENCIA_SEGUNDOS

  const respuesta = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CUENTA}/stream/${video.stream_uid}/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ exp: expira }),
    },
  )

  const cuerpo = await respuesta.json()
  if (!cuerpo.success) {
    console.error('Cloudflare no emitió el token', cuerpo.errors)
    return new Response('No pudimos preparar la reproducción', { status: 502 })
  }

  return Response.json({
    url: urlHls(CODIGO_CLIENTE, cuerpo.result.token),
    expiraEn: VIGENCIA_SEGUNDOS,
  })
})
```

- [ ] **Paso 2: Probar a mano**

Con las funciones sirviendo, y usando el id de un video con estado `listo`:
```bash
curl -X POST http://127.0.0.1:54321/functions/v1/video-url \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"videoId":"<id del video>"}'
```
Esperado: `{"url":"https://customer-....cloudflarestream.com/.../manifest/video.m3u8","expiraEn":3600}`

- [ ] **Paso 3: Verificar que el aislamiento funciona**

Repetir el `curl` con el token de un usuario de OTRO gimnasio.
Esperado: **404**, no la URL. Si devuelve la URL, la política `videos_leer` está mal.

- [ ] **Paso 4: Commit**

```bash
git add supabase/functions/video-url
git commit -m "Agregar Edge Function que emite URL firmada de reproducción"
```

---

### Tarea 14: Catálogo de ejercicios en la app móvil

**Archivos:**
- Crear: `apps/movil/src/app/(tabs)/ejercicios/index.tsx`
- Modificar: `apps/movil/src/app/(tabs)/_layout.tsx`

**Interfaces:**
- Consume: `supabase` (Tarea 6), tabla `ejercicios` (Tarea 7), y de `@gym/core`: `etiqueta`, `GRUPOS_MUSCULARES`, `EQUIPAMIENTOS`, tipos `GrupoMuscular` y `Equipamiento` (Tarea 10)
- Produce: navegación a `/(tabs)/ejercicios/[id]`

- [ ] **Paso 1: Agregar la pestaña**

`apps/movil/src/app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from 'expo-router'

export default function LayoutPestanas() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Hoy' }} />
      <Tabs.Screen name="ejercicios" options={{ title: 'Ejercicios', headerShown: false }} />
    </Tabs>
  )
}
```

- [ ] **Paso 2: Escribir el listado con buscador y filtro**

`apps/movil/src/app/(tabs)/ejercicios/index.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native'
import { Link, Stack } from 'expo-router'
import {
  EQUIPAMIENTOS, GRUPOS_MUSCULARES, etiqueta,
  type Equipamiento, type GrupoMuscular,
} from '@gym/core'
import { supabase } from '@/lib/supabase'

interface Ejercicio {
  id: string
  nombre: string
  grupo_muscular: GrupoMuscular
  equipamiento: Equipamiento
  gym_id: string | null
  video_id: string | null
}

export default function ListaEjercicios() {
  const [ejercicios, setEjercicios] = useState<Ejercicio[]>([])
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
        else setEjercicios((data ?? []) as Ejercicio[])
        setCargando(false)
      })
  }, [])

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return ejercicios.filter((x) => {
      if (grupo && x.grupo_muscular !== grupo) return false
      if (equipo && x.equipamiento !== equipo) return false
      // "Solo lo que hay acá" = ejercicios propios del gimnasio, que son
      // los que se cargaron sobre máquinas que existen físicamente.
      if (soloMiGym && x.gym_id === null) return false
      if (texto && !x.nombre.toLowerCase().includes(texto)) return false
      return true
    })
  }, [ejercicios, busqueda, grupo, equipo, soloMiGym])

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
      <Stack.Screen options={{ title: 'Ejercicios' }} />

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
        ListEmptyComponent={
          <Text style={estilos.vacio}>
            No encontramos ejercicios con esos filtros.
          </Text>
        }
        renderItem={({ item }) => (
          <Link href={`/(tabs)/ejercicios/${item.id}`} asChild>
            <Pressable style={estilos.fila}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.nombre}>{item.nombre}</Text>
                <Text style={estilos.sub}>
                  {etiqueta(item.grupo_muscular)}
                  {item.gym_id === null ? ' · Catálogo general' : ' · De tu gimnasio'}
                </Text>
              </View>
              {item.video_id && <Text>▶</Text>}
            </Pressable>
          </Link>
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

- [ ] **Paso 3: Probar a mano**

Con la app corriendo y sesión iniciada como el socio de prueba:

1. La pestaña *Ejercicios* muestra los 12 del catálogo general más los propios del gimnasio.
2. Escribir "sent" → queda solo "Sentadilla con barra". Borrar el texto los devuelve a todos.
3. Tocar el chip *Pecho* → solo los de pecho. Tocarlo de nuevo lo desactiva.
4. Tocar el chip *Barra* → solo los de barra. Combinado con *Pecho*, solo el press de banca.
5. Tocar *Solo lo que hay acá* → desaparecen los del catálogo general y quedan los cargados por el gimnasio.
6. Con los tres filtros activos a la vez y una búsqueda que no coincide → "No encontramos ejercicios con esos filtros", sin pantalla en blanco.
7. Los ejercicios propios dicen "De tu gimnasio"; los otros, "Catálogo general".
8. Los que tienen video muestran ▶.

- [ ] **Paso 4: Commit**

```bash
git add apps/movil/app
git commit -m "Agregar catálogo de ejercicios con buscador y filtros en la app móvil"
```

---

### Tarea 15: Detalle del ejercicio con reproductor

**Archivos:**
- Crear: `apps/movil/src/app/(tabs)/ejercicios/[id].tsx`, `apps/movil/src/app/(tabs)/ejercicios/_layout.tsx`

**Interfaces:**
- Consume: `POST /functions/v1/video-url` (Tarea 13), `supabase`, `etiqueta`
- Produce: nada; es una pantalla terminal

- [ ] **Paso 1: Instalar el reproductor**

```bash
npx expo install expo-video --project apps/movil
```

> Se usa `expo-video`, no `expo-av`: `expo-av` quedó obsoleto y `expo-video` es el que reproduce HLS, que es el formato que sirve Cloudflare Stream.

- [ ] **Paso 2: Crear el layout de la sección**

`apps/movil/src/app/(tabs)/ejercicios/_layout.tsx`:
```tsx
import { Stack } from 'expo-router'

export default function LayoutEjercicios() {
  return <Stack />
}
```

- [ ] **Paso 3: Escribir la pantalla de detalle**

`apps/movil/src/app/(tabs)/ejercicios/[id].tsx`:
```tsx
import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import { etiqueta, type Equipamiento, type GrupoMuscular } from '@gym/core'
import { supabase } from '@/lib/supabase'

interface Detalle {
  nombre: string
  descripcion: string | null
  instrucciones: string | null
  grupo_muscular: GrupoMuscular
  equipamiento: Equipamiento
  video_id: string | null
}

export default function DetalleEjercicio() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [ejercicio, setEjercicio] = useState<Detalle | null>(null)
  const [urlVideo, setUrlVideo] = useState<string | null>(null)
  const [avisoVideo, setAvisoVideo] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true

    async function cargar() {
      const { data } = await supabase
        .from('ejercicios')
        .select('nombre, descripcion, instrucciones, grupo_muscular, equipamiento, video_id')
        .eq('id', id)
        .single()

      if (!vigente) return
      setEjercicio(data as Detalle | null)
      setCargando(false)

      if (!data?.video_id) return

      // La URL se pide aparte y vence en una hora: el video no es público.
      const { data: firmada, error } = await supabase.functions.invoke('video-url', {
        body: { videoId: data.video_id },
      })
      if (!vigente) return

      if (error || !firmada?.url) {
        setAvisoVideo('No pudimos cargar el video. Revisá tu conexión.')
        return
      }
      setUrlVideo(firmada.url)
    }

    void cargar()
    return () => { vigente = false }
  }, [id])

  const reproductor = useVideoPlayer(urlVideo, (p) => { p.loop = true })

  if (cargando) {
    return <View style={estilos.centrado}><ActivityIndicator /></View>
  }

  if (!ejercicio) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.aviso}>No encontramos este ejercicio.</Text>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <Stack.Screen options={{ title: ejercicio.nombre }} />

      {urlVideo ? (
        <VideoView
          player={reproductor} style={estilos.video}
          allowsFullscreen nativeControls
        />
      ) : (
        <View style={[estilos.video, estilos.videoVacio]}>
          <Text style={estilos.aviso}>
            {avisoVideo ?? (ejercicio.video_id
              ? 'Cargando video…'
              : 'Este ejercicio todavía no tiene video.')}
          </Text>
        </View>
      )}

      <Text style={estilos.titulo}>{ejercicio.nombre}</Text>
      <Text style={estilos.meta}>
        {etiqueta(ejercicio.grupo_muscular)} · {etiqueta(ejercicio.equipamiento)}
      </Text>

      {ejercicio.descripcion && (
        <Text style={estilos.parrafo}>{ejercicio.descripcion}</Text>
      )}
      {ejercicio.instrucciones && (
        <>
          <Text style={estilos.subtitulo}>Cómo se hace</Text>
          <Text style={estilos.parrafo}>{ejercicio.instrucciones}</Text>
        </>
      )}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  contenido: { padding: 16, gap: 8 },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#000' },
  videoVacio: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee' },
  aviso: { color: '#777', textAlign: 'center', paddingHorizontal: 16 },
  titulo: { fontSize: 22, fontWeight: '600', marginTop: 8 },
  meta: { color: '#777' },
  subtitulo: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  parrafo: { fontSize: 15, lineHeight: 22 },
})
```

- [ ] **Paso 4: Probar de punta a punta**

Este es el momento en que se prueba la etapa entera. Con Supabase, las funciones y la app corriendo:

1. Como socio, entrar a *Ejercicios* → tocar el ejercicio al que le subiste video en la Tarea 12.
2. **El video tiene que reproducirse.** Es el ciclo completo: lo subió el empleado desde el navegador y lo está viendo el socio en el celular.
3. Entrar a un ejercicio sin video → "Este ejercicio todavía no tiene video", sin pantalla rota.
4. Poner el teléfono en modo avión y entrar a un ejercicio → aparece el aviso de conexión, la app no se cierra.
5. Volver atrás y adelante rápido varias veces → sin errores en consola. (El `vigente` del `useEffect` es lo que evita el aviso de actualizar un componente ya desmontado.)

- [ ] **Paso 5: Verificación final de las dos etapas**

```bash
npm run test:core
npm run test:rls
```
Esperado: PASAN todos.

- [ ] **Paso 6: Commit**

```bash
git add apps/movil package.json package-lock.json
git commit -m "Agregar detalle de ejercicio con reproductor de video firmado"
```

---

## Cierre

Al terminar la Tarea 15:

- ✅ Aislamiento entre gimnasios garantizado por la base y demostrado por 15 tests
- ✅ Login funcionando en app móvil y panel web
- ✅ Catálogo global de 12 ejercicios disponible para todo gimnasio nuevo
- ✅ Máquinas y ejercicios propios cargables desde el panel
- ✅ Subida de video del navegador a Cloudflare, con estado visible
- ✅ Reproducción en el celular con URL firmada que vence en una hora

**Lo que queda explícitamente pendiente** y no bloquea la Etapa 2:

- Editar y borrar máquinas y ejercicios (por ahora solo se crean).
- Videos para los 12 ejercicios del catálogo global: hay que filmarlos y asociarlos.
- Webhook de Cloudflare en lugar de consultar el estado.
- Pantalla de superadmin para dar de alta gimnasios: hoy se hace por SQL.
- Alta de socios desde el panel: hoy también por SQL. Llega en la Etapa 4.

**Siguiente:** plan de la Etapa 2 (rutinas), que se escribe cuando esta esté terminada y probada.
