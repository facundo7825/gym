# Videos en Supabase Storage — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar Cloudflare Stream por Supabase Storage como almacenamiento y servidor de los videos de ejercicios, sin perder el aislamiento entre gimnasios ni la imposibilidad de compartir el contenido por fuera de la app.

**Architecture:** Bucket privado `videos` sin ninguna política sobre `storage.objects`, así que RLS deniega todo acceso directo. Las tres Edge Functions son el único camino: autorizan con el token de quien llama (heredando RLS sobre la tabla `videos`) y recién después usan `service_role` para firmar URLs de vida corta contra Storage. Sin transcodificación: el panel valida tipo, tamaño y duración antes de subir.

**Tech Stack:** Supabase (PostgreSQL + Storage + Edge Functions en Deno), Next.js 15 con App Router, Expo con expo-router y expo-video, Vitest, TypeScript.

**Spec:** [`docs/superpowers/specs/2026-09-04-videos-en-supabase-storage-design.md`](../specs/2026-09-04-videos-en-supabase-storage-design.md)

## Global Constraints

- **Node >= 22.** Fijado en `package.json`; los tests dependen del `WebSocket` nativo que trae.
- **Monorepo con npm workspaces.** `@gym/core` se importa por nombre desde el panel y la app.
- **Las Edge Functions corren en Deno y NO pueden importar del workspace npm.** Lo que compartan entre sí va en `supabase/functions/_compartido/`, con importaciones `.ts` explícitas.
- **Toda tarea que escriba TypeScript corre `npx tsc --noEmit` y pega el resultado en su reporte**, además de los tests. Vitest transpila con esbuild y no chequea tipos (ruling de la Tarea 2 del ledger anterior).
- **Membresías: siempre `.order('created_at').limit(1).maybeSingle()`, nunca `.single()`.** Una persona puede pertenecer a varios gimnasios; `.single()` revienta con la segunda (Ruling 3 del ledger anterior).
- **Comentarios y textos de interfaz en castellano rioplatense**, siguiendo el código existente. Los comentarios explican *por qué*, no *qué*.
- **`service_role` toca únicamente Storage.** Todo lo que sea la tabla `videos` —select, insert, update— va por el cliente con el token del usuario, para que `videos_crear` y `videos_editar` sigan siendo lo que garantiza el aislamiento.
- **Límites del archivo:** `video/mp4`, 50 MB, 60 segundos.
- **Vigencia de la URL firmada de reproducción:** 300 segundos.

---

### Task 1: Base de datos — columna `ruta`, bucket privado y su test

**Files:**
- Modify: `supabase/migrations/0003_ejercicios.sql:44-56`
- Create: `supabase/migrations/0005_storage_videos.sql`
- Create: `tests/rls/storage-videos.test.ts`
- Modify: `packages/core/src/tipos-db.ts` (regenerado, no editado a mano)

**Interfaces:**
- Consumes: `admin`, `crearEscenario`, `Escenario` de `tests/rls/ayudas.ts`
- Produces: columna `videos.ruta` (`text not null unique`); bucket `videos` privado con `file_size_limit` de 52428800 y `allowed_mime_types` `['video/mp4']`

> **Por qué se edita `0003` en lugar de agregar una migración que renombre:** no hay proyecto remoto vinculado (`supabase/.temp/` no tiene `project-ref`), así que no hay datos que preservar. Una migración correctiva sobre un esquema que nunca se desplegó es ruido permanente en el repositorio.

- [ ] **Paso 1: Escribir el test que falla**

`tests/rls/storage-videos.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, crearEscenario, type Escenario } from './ayudas'

// El bucket `videos` no tiene ninguna política sobre storage.objects, así que
// RLS deniega todo. El único camino al contenido es la URL firmada que emite
// la Edge Function video-url. Eso es una CONFIGURACIÓN, y las configuraciones
// se rompen calladas: alcanza con que alguien agregue una política "para
// probar algo" y el contenido del gimnasio queda descargable por cualquier
// socio con la sesión abierta. Tiene que avisar un test rojo, no un cliente.
describe('el bucket de videos es privado de punta a punta', () => {
  let e: Escenario
  let ruta: string

  beforeAll(async () => {
    e = await crearEscenario()
    ruta = `${e.gymA}/${crypto.randomUUID()}.mp4`

    const { error } = await admin.storage.from('videos').upload(
      ruta,
      new Blob([new Uint8Array([0, 0, 0, 32])], { type: 'video/mp4' }),
      { contentType: 'video/mp4' },
    )
    if (error) throw error
  })

  // Esta aserción NO es decorativa y va primera a propósito: `download` de una
  // ruta inexistente también falla, así que sin ella las dos de abajo pasan
  // igual con el bucket abierto de par en par. Sería un test verde que no
  // verifica nada.
  it('service_role sí baja el objeto', async () => {
    const { data, error } = await admin.storage.from('videos').download(ruta)
    expect(error).toBeNull()
    expect(data).not.toBeNull()
  })

  it('un admin del gimnasio DUEÑO no puede bajarlo directo', async () => {
    const { error } = await e.comoAdminA.storage.from('videos').download(ruta)
    expect(error).not.toBeNull()
  })

  it('un socio del gimnasio dueño tampoco', async () => {
    const { error } = await e.comoSocioA.storage.from('videos').download(ruta)
    expect(error).not.toBeNull()
  })

  it('alguien de otro gimnasio tampoco', async () => {
    const { error } = await e.comoSocioB.storage.from('videos').download(ruta)
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Paso 2: Correr el test y verificar que falla**

```bash
npm run test:rls -- storage-videos
```

Esperado: **FALLA** en `beforeAll`, porque el bucket `videos` todavía no existe. El mensaje menciona `Bucket not found`.

- [ ] **Paso 3: Renombrar la columna en `0003_ejercicios.sql`**

Reemplazar el bloque de la tabla `videos` (comentario incluido) por:

```sql
-- gym_id nulo = video del catálogo global.
-- Tabla propia y no un campo `video_url` en ejercicios porque un video NO
-- está disponible al terminar la subida: entre que se emite la URL de subida
-- y que la subida se confirma hay una ventana en la que la fila existe y el
-- archivo no. `estado` es lo que representa esa ventana.
create table videos (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid references gyms(id) on delete cascade,
  -- Ruta del objeto en el bucket `videos`, con la forma {gym_id}/{id}.mp4.
  ruta           text not null unique,
  estado         estado_video not null default 'procesando',
  duracion_seg   integer,
  thumbnail_url  text,
  subido_por     uuid references memberships(id) on delete set null,
  error_detalle  text,
  created_at     timestamptz not null default now()
);
```

El enum `estado_video` de más arriba en el mismo archivo no se toca. Cambia su significado, no sus valores:

```sql
-- procesando = la fila existe, el archivo todavía no
-- listo      = el objeto está en el bucket y se puede reproducir
-- error      = la subida se abandonó o falló
create type estado_video as enum ('procesando', 'listo', 'error');
```

- [ ] **Paso 4: Crear la migración del bucket**

`supabase/migrations/0005_storage_videos.sql`:

```sql
-- El bucket va por migración y no por supabase/config.toml porque los buckets
-- declarados en el config solo existen en el entorno local. Una migración
-- corre igual en local y en la nube, y queda versionada.
--
-- public = false y NINGUNA política sobre storage.objects: sin políticas, RLS
-- deniega todo. Ni siquiera un admin del gimnasio dueño puede bajar el objeto
-- directamente. El único acceso es a través de las Edge Functions, que usan
-- service_role y firman URLs que vencen en 5 minutos. Es deny by default, y
-- es lo que hace cumplible la sección 6 del diseño general: el contenido del
-- gimnasio no puede circular por mensajería.
--
-- file_size_limit es la segunda línea de defensa. El panel valida antes de
-- subir, pero si esa validación falla o alguien llama a la API directo,
-- Storage rechaza igual. 52428800 = 50 MiB, el tope del plan Free.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 52428800, array['video/mp4']);
```

- [ ] **Paso 5: Reconstruir la base y regenerar los tipos**

```bash
npm run db:reset
npm run db:tipos
```

- [ ] **Paso 6: Verificar que los tipos tienen `ruta` y no `stream_uid`**

```bash
grep -c "stream_uid" packages/core/src/tipos-db.ts
grep -c "ruta" packages/core/src/tipos-db.ts
```

Esperado: `0` para el primero, mayor que `0` para el segundo. Si `stream_uid` sigue apareciendo, `db:reset` no tomó la migración editada.

- [ ] **Paso 7: Correr los tests y verificar que pasan**

```bash
npm run test:rls
```

Esperado: **PASA**, los 4 tests nuevos de `storage-videos` y los de `identidad` y `ejercicios` que ya existían. Ninguno de los viejos debería romperse: las políticas de `0004_rls_ejercicios.sql` no se tocaron.

> Si `ejercicios.test.ts` falla por `stream_uid`, es que algún test insertaba videos con esa columna. Cambiar el nombre del campo en el insert; el resto de la aserción queda igual.

- [ ] **Paso 8: Commit**

```bash
git add supabase/migrations packages/core/src/tipos-db.ts tests/rls/storage-videos.test.ts
git commit -m "Renombrar videos.stream_uid a ruta y crear el bucket privado"
```

---

### Task 2: `packages/core` — validación del archivo y armado de la ruta

**Files:**
- Modify: `packages/core/src/video.ts` (se reescribe entero)
- Modify: `packages/core/tests/video.test.ts` (se reescribe entero)
- Modify: `packages/core/src/index.ts:6-7`

**Interfaces:**
- Consumes: `Constants` de `./tipos-db` (Task 1 lo regeneró)
- Produces:
  - `TAMANO_MAXIMO_BYTES: number` (52428800)
  - `DURACION_MAXIMA_SEG: number` (60)
  - `TIPO_ACEPTADO: string` (`'video/mp4'`)
  - `validarArchivoVideo(archivo: { tamanoBytes: number; duracionSeg: number; tipo: string }): string | null`
  - `type EstadoVideo` (se conserva sin cambios)

> **Por qué `validarArchivoVideo` devuelve el mensaje ya redactado en vez de un booleano o un código:** el panel lo muestra tal cual, así que el texto que ve el empleado del gimnasio queda bajo test en lugar de suelto en un JSX.
>
> **El diseño preveía además una función `rutaVideo(gymId, videoId)`, y no se escribe.** No tendría un solo consumidor: las Edge Functions corren en Deno y no pueden importar del workspace npm, así que `video-subir` arma la ruta inline, y el panel la recibe en la respuesta. Exportarla desde `core` dejaría dos definiciones del formato que pueden divergir sin que nada lo agarre — peor que no tenerla. El formato de la ruta se verifica de punta a punta en el paso 3 de la Task 4.

- [ ] **Paso 1: Escribir los tests que fallan**

`packages/core/tests/video.test.ts` — reemplazar todo el contenido:

```ts
import { describe, expect, it } from 'vitest'
import {
  DURACION_MAXIMA_SEG,
  TAMANO_MAXIMO_BYTES,
  validarArchivoVideo,
} from '../src/video'

const VALIDO = { tamanoBytes: 8_000_000, duracionSeg: 42, tipo: 'video/mp4' }

describe('validarArchivoVideo', () => {
  it('acepta un mp4 dentro de los dos límites', () => {
    expect(validarArchivoVideo(VALIDO)).toBeNull()
  })

  it('rechaza cualquier cosa que no sea mp4', () => {
    const motivo = validarArchivoVideo({ ...VALIDO, tipo: 'video/quicktime' })
    expect(motivo).toContain('MP4')
  })

  it('rechaza por tamaño y dice cuánto pesa', () => {
    const motivo = validarArchivoVideo({ ...VALIDO, tamanoBytes: 240 * 1024 * 1024 })
    expect(motivo).toContain('240 MB')
    expect(motivo).toContain('50 MB')
  })

  it('rechaza por duración y la muestra en minutos y segundos', () => {
    const motivo = validarArchivoVideo({ ...VALIDO, duracionSeg: 134 })
    expect(motivo).toContain('2:14')
    expect(motivo).toContain('1:00')
  })

  // El navegador devuelve NaN cuando no puede leer los metadatos: un archivo
  // corrupto, o un contenedor que no sabe abrir. Dejarlo pasar significaría
  // subir 50 MB para descubrir después que no se reproduce.
  it('rechaza una duración que no se pudo leer', () => {
    expect(validarArchivoVideo({ ...VALIDO, duracionSeg: NaN })).not.toBeNull()
    expect(validarArchivoVideo({ ...VALIDO, duracionSeg: 0 })).not.toBeNull()
  })

  // Cuando se pasa de las dos cosas gana el tamaño, porque es el límite duro:
  // recortar la duración no garantiza entrar en 50 MB, pero bajar la calidad
  // sí resuelve los dos problemas de una.
  it('prioriza el tamaño cuando se pasa de ambos límites', () => {
    const motivo = validarArchivoVideo({
      tamanoBytes: 240 * 1024 * 1024, duracionSeg: 300, tipo: 'video/mp4',
    })
    expect(motivo).toContain('240 MB')
    expect(motivo).not.toContain('5:00')
  })

  it('acepta exactamente el límite, no un byte menos', () => {
    expect(validarArchivoVideo({ ...VALIDO, tamanoBytes: TAMANO_MAXIMO_BYTES })).toBeNull()
    expect(validarArchivoVideo({ ...VALIDO, duracionSeg: DURACION_MAXIMA_SEG })).toBeNull()
  })
})
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

```bash
npm run test:core
```

Esperado: **FALLA**. No existen `validarArchivoVideo`, `rutaVideo`, `TAMANO_MAXIMO_BYTES` ni `DURACION_MAXIMA_SEG`, y sí existen `mapearEstadoCloudflare` y `urlHls`, que el test nuevo ya no importa.

- [ ] **Paso 3: Reescribir `packages/core/src/video.ts`**

```ts
import type { Constants } from './tipos-db'

// Derivado del enum de PostgreSQL, igual que en catalogo.ts: este valor se
// escribe en videos.estado, así que si los dos se separan el insert falla en
// producción y no acá.
export type EstadoVideo = (typeof Constants)['public']['Enums']['estado_video'][number]

// El tope del plan Free de Supabase Storage. El bucket lo aplica también del
// lado del servidor (0005_storage_videos.sql); esto es para no hacerle subir
// 240 MB a alguien que va a recibir un rechazo igual.
export const TAMANO_MAXIMO_BYTES = 50 * 1024 * 1024
export const DURACION_MAXIMA_SEG = 60
export const TIPO_ACEPTADO = 'video/mp4'

function enMb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

function enMinutos(segundos: number): string {
  const minutos = Math.floor(segundos / 60)
  const resto = Math.round(segundos % 60)
  return `${minutos}:${String(resto).padStart(2, '0')}`
}

/**
 * Devuelve el motivo del rechazo listo para mostrar, o null si el archivo
 * sirve. El orden de los chequeos importa y está fijado por los tests: tipo,
 * duración ilegible, tamaño, duración.
 */
export function validarArchivoVideo(archivo: {
  tamanoBytes: number
  duracionSeg: number
  tipo: string
}): string | null {
  if (archivo.tipo !== TIPO_ACEPTADO) {
    return 'El archivo tiene que ser un MP4.'
  }

  if (!Number.isFinite(archivo.duracionSeg) || archivo.duracionSeg <= 0) {
    return 'No pudimos leer la duración del video. Probá exportarlo de nuevo como MP4.'
  }

  if (archivo.tamanoBytes > TAMANO_MAXIMO_BYTES) {
    return `El video pesa ${enMb(archivo.tamanoBytes)} y el máximo es ` +
      `${enMb(TAMANO_MAXIMO_BYTES)}. Grabá o exportá en 720p.`
  }

  if (archivo.duracionSeg > DURACION_MAXIMA_SEG) {
    return `El video dura ${enMinutos(archivo.duracionSeg)} y el máximo es ` +
      `${enMinutos(DURACION_MAXIMA_SEG)}.`
  }

  return null
}
```

- [ ] **Paso 4: Actualizar los exports**

En `packages/core/src/index.ts`, reemplazar las dos líneas de video por:

```ts
export {
  DURACION_MAXIMA_SEG,
  TAMANO_MAXIMO_BYTES,
  TIPO_ACEPTADO,
  validarArchivoVideo,
} from './video'
export type { EstadoVideo } from './video'
```

- [ ] **Paso 5: Correr los tests y el chequeo de tipos**

```bash
npm run test:core
npx tsc --noEmit
```

Esperado: **PASA**, 7 tests en `video.test.ts` y los de `catalogo`, `permisos` y `filtro-ejercicios` sin cambios. `tsc` sale con 0.

- [ ] **Paso 6: Commit**

```bash
git add packages/core/src/video.ts packages/core/src/index.ts packages/core/tests/video.test.ts
git commit -m "Reemplazar las funciones de Cloudflare por la validación de archivo"
```

---

### Task 3: `video-subir` sobre Storage y el módulo `_compartido/cors.ts`

**Files:**
- Create: `supabase/functions/_compartido/cors.ts`
- Modify: `supabase/functions/video-subir/index.ts` (se reescribe entero)

**Interfaces:**
- Consumes: tabla `videos` con la columna `ruta` (Task 1)
- Produces:
  - `CORS: Record<string, string>` y `responder(cuerpo: string, status: number): Response` en `_compartido/cors.ts`
  - HTTP `POST /functions/v1/video-subir` con `{ duracionSeg: number }` → `{ videoId: string, ruta: string, uploadUrl: string, token: string }`

> **Sobrevive casi todo lo que ya estaba:** CORS, el 401 sin `Authorization`, la resolución de membresía, el chequeo de rol con su comentario, y el insert. Cambia únicamente el bloque que llamaba a `api.cloudflare.com`.

- [ ] **Paso 1: Crear el módulo de CORS**

`supabase/functions/_compartido/cors.ts`:

```ts
// Las tres funciones de video se llaman con supabase.functions.invoke() desde
// un componente cliente, o sea desde el navegador. Eso manda antes un
// preflight OPTIONS: si no se contesta, la llamada falla y el error que ve el
// usuario no menciona CORS por ningún lado.
//
// Origin '*' no abre nada acá: las tres exigen un Bearer del usuario, y ese
// token vive en el origen del panel, al que una página ajena no llega.
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const responder = (cuerpo: string, status: number) =>
  new Response(cuerpo, { status, headers: CORS })
```

- [ ] **Paso 2: Reescribir `video-subir`**

`supabase/functions/video-subir/index.ts` — reemplazar todo el contenido:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS, responder } from '../_compartido/cors.ts'

const BUCKET = 'videos'

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (peticion.method !== 'POST') return responder('Método no permitido', 405)

  const autorizacion = peticion.headers.get('Authorization')
  if (!autorizacion) return responder('Falta autenticación', 401)

  // Cliente con el token de quien llama: hereda sus permisos y su RLS. Todo
  // lo que toque la tabla `videos` va por acá, nunca por service_role, para
  // que `videos_crear` siga siendo lo que impide escribir en el gym ajeno.
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
  // y acá la duplicación es a propósito: sin él firmaríamos una URL de subida
  // para alguien que después no va a poder registrar el video. La autoridad
  // sigue siendo RLS; esto es solo para no gastar al pedo.
  if (!membresia || !['entrenador', 'admin'].includes(membresia.rol)) {
    return responder('No tenés permiso para subir videos', 403)
  }

  // La duración llega del cliente y se guarda sin verificar. Es metadato de
  // presentación, no un control: un panel modificado puede declarar 10
  // segundos y subir media hora. Lo que impide eso de verdad es el
  // file_size_limit del bucket, que lo aplica Storage y no el navegador.
  let duracionSeg: number | null = null
  try {
    const cuerpo = await peticion.json()
    duracionSeg = typeof cuerpo?.duracionSeg === 'number' && Number.isFinite(cuerpo.duracionSeg)
      ? Math.round(cuerpo.duracionSeg)
      : null
  } catch {
    duracionSeg = null
  }

  // El uuid se genera acá y no lo pone la base porque la ruta tiene que
  // existir antes del insert.
  const videoId = crypto.randomUUID()
  const ruta = `${membresia.gym_id}/${videoId}.mp4`

  // service_role solo para Storage: el bucket no tiene políticas, así que
  // firmar exige saltear RLS. Es una capacidad, no una autorización — para
  // cuando llega acá, el chequeo de rol de arriba ya decidió.
  const almacen = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: firma, error: errorFirma } = await almacen.storage
    .from(BUCKET).createSignedUploadUrl(ruta)

  if (errorFirma || !firma) {
    console.error('No se pudo firmar la subida', errorFirma)
    return responder('No pudimos preparar la subida', 502)
  }

  const { error } = await supabase.from('videos').insert({
    id: videoId,
    gym_id: membresia.gym_id,
    ruta,
    estado: 'procesando',
    duracion_seg: duracionSeg,
    subido_por: membresia.id,
  })

  if (error) {
    // Se firma primero y se inserta después, a propósito. Si el insert falla,
    // lo que queda huérfano es un token de subida que caduca solo y al que
    // ninguna fila apunta: invisible e inofensivo. Al revés, el huérfano
    // sería una fila en `procesando` que el panel muestra como video roto.
    console.error('No se pudo registrar el video', error)
    return responder('No pudimos registrar el video', 500)
  }

  return Response.json(
    { videoId, ruta, uploadUrl: firma.signedUrl, token: firma.token },
    { headers: CORS },
  )
})
```

- [ ] **Paso 3: Vaciar el `.env` de las funciones**

`supabase/functions/.env` — reemplazar todo el contenido por:

```
# Sin variables: las funciones de video usan SUPABASE_URL, SUPABASE_ANON_KEY y
# SUPABASE_SERVICE_ROLE_KEY, que el runtime inyecta solo. El proyecto ya no
# tiene credenciales de terceros.
```

- [ ] **Paso 4: Servir las funciones y conseguir un token de prueba**

```bash
npx supabase functions serve --env-file supabase/functions/.env
```

En otra terminal, con las credenciales de un usuario que sea `entrenador` o `admin` en algún gimnasio (el mismo con el que entrás al panel):

```bash
export ANON=$(npx supabase status -o env | grep ANON_KEY | cut -d'"' -f2)
export TOKEN=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"TU_EMAIL","password":"TU_PASSWORD"}' | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
echo $TOKEN
```

> Si no tenés un usuario con rol `entrenador` o `admin`, crealo desde el Studio en <http://127.0.0.1:54323>: pestaña Authentication para el usuario, y luego un insert en `memberships` con el `gym_id` correspondiente.

- [ ] **Paso 5: Probar el camino feliz**

```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/video-subir \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"duracionSeg":42}'
```

Esperado: un JSON con `videoId`, `ruta` con la forma `<uuid-del-gym>/<uuid-del-video>.mp4`, `uploadUrl` y `token`.

En el Studio, la tabla `videos` tiene una fila nueva con ese `id`, `estado = 'procesando'` y `duracion_seg = 42`.

- [ ] **Paso 6: Probar el rechazo por rol**

Repetir el `curl` del paso 5 con el token de un usuario con rol `socio`.

Esperado: **403** y el texto `No tenés permiso para subir videos`. Si devuelve la URL firmada, el chequeo de rol está mal.

- [ ] **Paso 7: Commit**

```bash
git add supabase/functions/_compartido supabase/functions/video-subir supabase/functions/.env
git commit -m "Emitir la URL de subida contra Supabase Storage"
```

---

### Task 4: `video-confirmar`

**Files:**
- Create: `supabase/functions/video-confirmar/index.ts`

**Interfaces:**
- Consumes: `CORS`, `responder` de `../_compartido/cors.ts` (Task 3); `POST /functions/v1/video-subir` (Task 3)
- Produces: HTTP `POST /functions/v1/video-confirmar` con `{ videoId: string }` → `{ estado: 'procesando' | 'listo' | 'error' }`

> **Reemplaza a la `video-estado` que el plan anterior preveía.** Sin transcodificación no hay nada que esperar, así que desaparecen el polling de 60 intentos cada 5 segundos y `mapearEstadoCloudflare`. Lo que queda es una sola llamada, inmediata.
>
> **Lo que sostiene esta función es la invariante `estado = 'listo'` ⇒ el objeto existe.** Sin la verificación contra Storage, un bug en el panel puede marcar `listo` un video que nunca subió, y el socio se encuentra con un reproductor vacío.

- [ ] **Paso 1: Escribir la función**

`supabase/functions/video-confirmar/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS, responder } from '../_compartido/cors.ts'

const BUCKET = 'videos'

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (peticion.method !== 'POST') return responder('Método no permitido', 405)

  const autorizacion = peticion.headers.get('Authorization')
  if (!autorizacion) return responder('Falta autenticación', 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: autorizacion } } },
  )

  let videoId: string | undefined
  try {
    videoId = (await peticion.json())?.videoId
  } catch {
    videoId = undefined
  }
  if (!videoId) return responder('Falta videoId', 400)

  // Acá está toda la autorización, y es una sola línea: RLS solo devuelve el
  // video si quien pregunta pertenece a ese gimnasio.
  const { data: video } = await supabase
    .from('videos').select('id, ruta, estado').eq('id', videoId).maybeSingle()

  if (!video) return responder('Video no encontrado', 404)

  // Idempotente: si ya se confirmó, repetir la llamada no rompe nada. El
  // panel puede reintentar sin lógica extra.
  if (video.estado !== 'procesando') {
    return Response.json({ estado: video.estado }, { headers: CORS })
  }

  // service_role solo para Storage, y con la ruta que salió de la fila que
  // RLS devolvió — nunca con una que venga del request. Eso es lo que evita
  // el path traversal.
  const almacen = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const corte = video.ruta.lastIndexOf('/')
  const carpeta = video.ruta.slice(0, corte)
  const archivo = video.ruta.slice(corte + 1)

  const { data: encontrados, error: errorLista } = await almacen.storage
    .from(BUCKET).list(carpeta, { search: archivo, limit: 1 })

  if (errorLista) {
    console.error('Storage no respondió', errorLista)
    return responder('No pudimos verificar la subida', 502)
  }

  // `search` de Storage hace coincidencia parcial, así que la igualdad exacta
  // va acá: sin ella, un objeto con nombre parecido daría por buena una
  // subida que no ocurrió.
  const existe = (encontrados ?? []).some((objeto) => objeto.name === archivo)

  if (!existe) {
    await supabase.from('videos').update({
      estado: 'error',
      error_detalle: 'La subida no llegó a completarse',
    }).eq('id', video.id)
    return responder('La subida no llegó a completarse', 409)
  }

  const { error } = await supabase
    .from('videos').update({ estado: 'listo' }).eq('id', video.id)

  if (error) {
    console.error('No se pudo confirmar el video', error)
    return responder('No pudimos confirmar el video', 500)
  }

  return Response.json({ estado: 'listo' }, { headers: CORS })
})
```

- [ ] **Paso 2: Probar el rechazo cuando el archivo no está**

Con las funciones sirviendo y el `$TOKEN` de la Task 3, pedir una subida nueva y confirmarla **sin subir nada**:

```bash
VIDEO=$(curl -s -X POST http://127.0.0.1:54321/functions/v1/video-subir \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"duracionSeg":42}' | grep -o '"videoId":"[^"]*"' | cut -d'"' -f4)

curl -i -s -X POST http://127.0.0.1:54321/functions/v1/video-confirmar \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"videoId\":\"$VIDEO\"}"
```

Esperado: **409** con `La subida no llegó a completarse`. En el Studio, esa fila quedó en `estado = 'error'` con el `error_detalle` cargado.

Éste es el test más importante de la tarea: si devuelve `{"estado":"listo"}`, la verificación contra Storage no está funcionando y la invariante no se sostiene.

- [ ] **Paso 3: Probar el camino feliz**

Pedir otra subida, subir un archivo de verdad a la URL firmada, y recién ahí confirmar:

```bash
RESPUESTA=$(curl -s -X POST http://127.0.0.1:54321/functions/v1/video-subir \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"duracionSeg":42}')
VIDEO=$(echo "$RESPUESTA" | grep -o '"videoId":"[^"]*"' | cut -d'"' -f4)
SUBIDA=$(echo "$RESPUESTA" | grep -o '"uploadUrl":"[^"]*"' | cut -d'"' -f4)

curl -s -X PUT "$SUBIDA" -H "Content-Type: video/mp4" --data-binary @cualquier-video.mp4

curl -s -X POST http://127.0.0.1:54321/functions/v1/video-confirmar \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"videoId\":\"$VIDEO\"}"
```

Esperado: `{"estado":"listo"}`. Guardá ese `$VIDEO`: la Task 5 lo usa.

> Si no tenés un mp4 a mano, sirve cualquiera de menos de 50 MB. El contenido no importa para esta verificación, solo que el objeto exista.

- [ ] **Paso 4: Probar el aislamiento**

Repetir el `curl` del paso 3 con el token de un usuario de OTRO gimnasio.

Esperado: **404**, no el estado. Si devuelve el estado, la política `videos_leer` está mal.

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/video-confirmar
git commit -m "Agregar la Edge Function que confirma la subida contra Storage"
```

---

### Task 5: `video-url`

**Files:**
- Create: `supabase/functions/video-url/index.ts`

**Interfaces:**
- Consumes: `CORS`, `responder` de `../_compartido/cors.ts` (Task 3); un video en estado `listo` (Task 4)
- Produces: HTTP `POST /functions/v1/video-url` con `{ videoId: string }` → `{ rutaFirmada: string, expiraEn: number }`

> **Devuelve la ruta firmada, no una URL absoluta.** El diseño decía `{ url, expiraEn }`, pero adentro del runtime de Edge Functions `SUPABASE_URL` vale `http://kong:8000` —el nombre interno del contenedor— así que `createSignedUrl` arma una URL que ni el navegador ni el teléfono pueden resolver. Verificado en `supabase/.temp/start-secrets/supabase_edge_runtime_gym/env/docker.env`.
>
> Devolver solo la ruta lo resuelve sin variables de entorno nuevas: cada cliente la pega a su propia URL de Supabase, que ya conoce porque la usa para todo lo demás. La firma no se ve afectada, va en la query string.

- [ ] **Paso 1: Escribir la función**

`supabase/functions/video-url/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS, responder } from '../_compartido/cors.ts'

const BUCKET = 'videos'

// El diseño general pide una URL que "vence en minutos". Con videos de 60
// segundos como máximo, cinco alcanzan de sobra para reproducir, y es una
// hora menos de ventana útil si alguien copia la URL desde las herramientas
// de desarrollador.
const VIGENCIA_SEGUNDOS = 300

/**
 * Adentro del runtime, SUPABASE_URL es http://kong:8000 —el nombre interno
 * del contenedor—, así que la URL absoluta que arma createSignedUrl no la
 * puede resolver ni el navegador ni el teléfono. Devolvemos solo la ruta y
 * cada cliente la pega a su propia URL de Supabase.
 */
function soloRuta(url: string): string {
  if (!url.startsWith('http')) return url.startsWith('/') ? url : `/${url}`
  const partes = new URL(url)
  return partes.pathname + partes.search
}

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (peticion.method !== 'POST') return responder('Método no permitido', 405)

  const autorizacion = peticion.headers.get('Authorization')
  if (!autorizacion) return responder('Falta autenticación', 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: autorizacion } } },
  )

  let videoId: string | undefined
  try {
    videoId = (await peticion.json())?.videoId
  } catch {
    videoId = undefined
  }
  if (!videoId) return responder('Falta videoId', 400)

  // Acá está toda la seguridad de esta función, y es una sola línea: RLS solo
  // devuelve el video si quien pregunta pertenece a ese gimnasio, o si el
  // video es del catálogo global.
  const { data: video } = await supabase
    .from('videos').select('ruta, estado').eq('id', videoId).maybeSingle()

  if (!video) return responder('Video no encontrado', 404)
  if (video.estado !== 'listo') {
    return responder('El video todavía no está disponible', 409)
  }

  const almacen = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: firma, error } = await almacen.storage
    .from(BUCKET).createSignedUrl(video.ruta, VIGENCIA_SEGUNDOS)

  if (error || !firma) {
    console.error('No se pudo firmar la reproducción', error)
    return responder('No pudimos preparar la reproducción', 502)
  }

  return Response.json(
    { rutaFirmada: soloRuta(firma.signedUrl), expiraEn: VIGENCIA_SEGUNDOS },
    { headers: CORS },
  )
})
```

- [ ] **Paso 2: Probar el camino feliz**

Con el `$VIDEO` en estado `listo` de la Task 4:

```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/video-url \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"videoId\":\"$VIDEO\"}"
```

Esperado: `{"rutaFirmada":"/storage/v1/object/sign/videos/...?token=...","expiraEn":300}`.

Verificar que la ruta **empieza con `/`** y no con `http://kong:8000`. Si aparece `kong`, `soloRuta` no se está aplicando.

- [ ] **Paso 3: Verificar que la ruta firmada sirve de verdad**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:54321<pegar la rutaFirmada>"
```

Esperado: `200`. Y sin el `?token=...`, la misma URL tiene que dar `400`.

- [ ] **Paso 4: Verificar el aislamiento y el estado**

Con el token de un usuario de OTRO gimnasio: **404**.
Con el `$VIDEO` que quedó en `error` en la Task 4: **409**.

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/video-url
git commit -m "Agregar la Edge Function que emite la URL firmada de reproducción"
```

---

### Task 6: Panel — subida de video desde el listado de ejercicios

**Files:**
- Create: `apps/panel/src/app/(panel)/ejercicios/subir-video.tsx`
- Modify: `apps/panel/src/app/(panel)/ejercicios/page.tsx:8-12,32-45`
- Create: `docs/grabar-videos.md`

**Interfaces:**
- Consumes: `validarArchivoVideo` de `@gym/core` (Task 2); `crearClienteNavegador` de `@/lib/supabase/navegador`; `video-subir` (Task 3) y `video-confirmar` (Task 4)
- Produces: componente `<SubirVideo ejercicioId={string} tieneVideo={boolean} />`

> **No hay barra de progreso, hay un indicador indeterminado.** El cliente de Storage de supabase-js no expone el progreso de subida; conseguirlo obliga a reemplazar `uploadToSignedUrl` por un `PUT` crudo con XMLHttpRequest, o sea cambiar un camino probado de la librería por código propio para ganar un porcentaje en una transferencia de 8 MB que dura segundos. No vale el cambio.

- [ ] **Paso 1: Escribir el componente**

`apps/panel/src/app/(panel)/ejercicios/subir-video.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { validarArchivoVideo } from '@gym/core'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

type Fase =
  | { nombre: 'inactivo' }
  | { nombre: 'subiendo' }
  | { nombre: 'listo' }
  | { nombre: 'error'; mensaje: string }

/**
 * Lee la duración del archivo SIN subirlo: sale de los metadatos locales. Es
 * lo que hace que un archivo de 300 MB se descarte sin transferir un byte.
 * Devuelve NaN si el navegador no pudo abrirlo, y validarArchivoVideo lo
 * trata como rechazo.
 */
function leerDuracion(archivo: File): Promise<number> {
  return new Promise((resolver) => {
    const elemento = document.createElement('video')
    elemento.preload = 'metadata'
    elemento.onloadedmetadata = () => {
      URL.revokeObjectURL(elemento.src)
      resolver(elemento.duration)
    }
    elemento.onerror = () => {
      URL.revokeObjectURL(elemento.src)
      resolver(NaN)
    }
    elemento.src = URL.createObjectURL(archivo)
  })
}

export function SubirVideo({
  ejercicioId,
  tieneVideo,
}: {
  ejercicioId: string
  tieneVideo: boolean
}) {
  const [fase, setFase] = useState<Fase>({ nombre: 'inactivo' })

  async function alElegir(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    // Se limpia el input para que elegir el mismo archivo dos veces seguidas
    // vuelva a disparar el change.
    evento.target.value = ''
    if (!archivo) return

    const duracionSeg = await leerDuracion(archivo)
    const motivo = validarArchivoVideo({
      tamanoBytes: archivo.size,
      duracionSeg,
      tipo: archivo.type,
    })
    if (motivo) {
      setFase({ nombre: 'error', mensaje: motivo })
      return
    }

    setFase({ nombre: 'subiendo' })
    const supabase = crearClienteNavegador()

    const { data: firma, error: errorFirma } = await supabase.functions
      .invoke('video-subir', { body: { duracionSeg } })
    if (errorFirma || !firma) {
      setFase({ nombre: 'error', mensaje: 'No pudimos preparar la subida.' })
      return
    }

    const { error: errorSubida } = await supabase.storage
      .from('videos')
      .uploadToSignedUrl(firma.ruta, firma.token, archivo, { contentType: 'video/mp4' })
    if (errorSubida) {
      setFase({ nombre: 'error', mensaje: 'La subida falló. Probá de nuevo.' })
      return
    }

    // Si la subida falló, esta llamada no ocurre y la fila queda en
    // `procesando`. Si ocurre y el objeto no está, la función la pasa a
    // `error` y devuelve 409: nunca queda un limbo silencioso.
    const { error: errorConfirmar } = await supabase.functions
      .invoke('video-confirmar', { body: { videoId: firma.videoId } })
    if (errorConfirmar) {
      setFase({ nombre: 'error', mensaje: 'La subida no se completó. Probá de nuevo.' })
      return
    }

    // RLS decide si este ejercicio es del gimonasio de quien sube.
    const { error: errorAsociar } = await supabase
      .from('ejercicios').update({ video_id: firma.videoId }).eq('id', ejercicioId)
    if (errorAsociar) {
      setFase({
        nombre: 'error',
        mensaje: 'El video se subió pero no se pudo asociar al ejercicio.',
      })
      return
    }

    setFase({ nombre: 'listo' })
  }

  return (
    <div className="mt-1 text-sm">
      {fase.nombre === 'subiendo' ? (
        <span className="text-gray-600">Subiendo…</span>
      ) : (
        <label className="cursor-pointer text-blue-700 underline">
          {tieneVideo || fase.nombre === 'listo' ? 'Reemplazar video' : 'Subir video'}
          <input type="file" accept="video/mp4" className="hidden" onChange={alElegir} />
        </label>
      )}

      {fase.nombre === 'listo' && (
        <span className="ml-2 text-green-700">Video listo.</span>
      )}

      {fase.nombre === 'error' && (
        <p role="alert" className="mt-1 text-red-600">
          {fase.mensaje}{' '}
          <a href="/grabar-videos" className="underline">Cómo grabar el video</a>
        </p>
      )}
    </div>
  )
}
```

- [ ] **Paso 2: Corregir el typo del comentario**

En el paso anterior el comentario dice `gimonasio`. Corregirlo a `gimnasio`. (Está a propósito en el plan: si copiaste sin leer, este paso te lo hace notar.)

- [ ] **Paso 3: Mostrar el componente en el listado**

En `apps/panel/src/app/(panel)/ejercicios/page.tsx`, agregar `video_id` al select:

```tsx
  const { data: ejercicios } = await supabase
    .from('ejercicios')
    .select('id, nombre, grupo_muscular, equipamiento, gym_id, video_id')
    .order('nombre')
```

Importar el componente arriba:

```tsx
import { SubirVideo } from './subir-video'
```

Y en el `<li>` de la sección "De mi gimnasio" —solo ahí, porque los globales no se editan— agregar el componente después del `<span>`:

```tsx
            {propios.map((x) => (
              <li key={x.id} className="px-4 py-3">
                {x.nombre}
                <span className="text-gray-500">
                  {' · '}{etiqueta(x.grupo_muscular)}{' · '}{etiqueta(x.equipamiento)}
                </span>
                <SubirVideo ejercicioId={x.id} tieneVideo={x.video_id !== null} />
              </li>
            ))}
```

- [ ] **Paso 4: Escribir la guía de grabación**

`docs/grabar-videos.md`:

```markdown
# Cómo grabar los videos de los ejercicios

Los videos se suben desde el panel y tienen que cumplir tres condiciones:

| | Límite |
|---|---|
| Formato | MP4 (H.264) |
| Duración | 60 segundos |
| Peso | 50 MB |

Si el archivo no cumple, el panel lo rechaza antes de subir nada y te dice cuál
de los tres límites se pasó.

## Grabando con el celular

Un video de 60 segundos grabado en **1080p pesa unos 130 MB** y no entra. En
**720p pesa unos 8 MB** y entra holgado, sin diferencia visible en un teléfono.

- **Android:** Cámara → Ajustes → Resolución de video → 720p (HD)
- **iPhone:** Ajustes → Cámara → Grabar vídeo → 720p HD a 30 fps

Cambiá el ajuste una vez y grabá todos los ejercicios seguidos.

## Si el archivo ya está grabado y se pasa

Recomprimilo con [HandBrake](https://handbrake.fr), que es gratis:

1. Abrí el archivo.
2. Preset: **Fast 720p30**.
3. Format: **MP4**.
4. Si además dura más de un minuto, usá Range → Seconds para recortarlo.
5. Start Encode.

## Qué filmar

- Encuadre completo: que se vea el cuerpo entero y la máquina.
- Dos o tres repeticiones alcanzan. El video muestra **cómo se hace**, no es
  una serie completa.
- Sin audio necesario: la app no lo reproduce en primer plano.
- Buena luz de frente. El subsuelo del gimnasio suele estar más oscuro de lo
  que parece a simple vista.
```

- [ ] **Paso 5: Chequear tipos y levantar el panel**

```bash
npx tsc --noEmit
npm run dev --workspace panel
```

Con `npx supabase functions serve` corriendo en otra terminal.

- [ ] **Paso 6: Probar a mano los tres caminos**

Entrando al panel como `entrenador` o `admin`, en `/ejercicios`:

1. **Archivo demasiado pesado:** elegir un mp4 de más de 50 MB. Esperado: mensaje con el peso real y el máximo, **sin** que se dispare ninguna llamada de red (verificable en la pestaña Network de las herramientas de desarrollador: no aparece `video-subir`).
2. **Archivo demasiado largo:** un mp4 de más de 60 segundos y menos de 50 MB. Esperado: mensaje con la duración en `m:ss`, tampoco hay llamada.
3. **Archivo válido:** un mp4 de 720p de menos de un minuto. Esperado: "Subiendo…" y después "Video listo.". En el Studio, la fila de `videos` está en `listo` y el `ejercicios.video_id` quedó apuntando a ella.

- [ ] **Paso 7: Commit**

```bash
git add "apps/panel/src/app/(panel)/ejercicios" docs/grabar-videos.md
git commit -m "Agregar la subida de video al listado de ejercicios del panel"
```

---

### Task 7: App móvil — reproductor en el detalle del ejercicio

**Files:**
- Modify: `apps/movil/src/app/(tabs)/ejercicios/[id].tsx`
- Modify: `apps/movil/package.json` (lo cambia `expo install`)

**Interfaces:**
- Consumes: `POST /functions/v1/video-url` → `{ rutaFirmada, expiraEn }` (Task 5); `supabase` de `@/lib/supabase`
- Produces: nada que consuman otras tareas

- [ ] **Paso 1: Instalar expo-video**

```bash
npx expo install expo-video --workspace movil
```

> `expo install` y no `npm install`: elige la versión compatible con el SDK de Expo del proyecto, que `npm install` no sabe mirar.

- [ ] **Paso 2: Pedir la ruta firmada y reproducir**

En `apps/movil/src/app/(tabs)/ejercicios/[id].tsx`, agregar a los imports:

```tsx
import { useVideoPlayer, VideoView } from 'expo-video'
```

Agregar el estado y el efecto, después del `useEffect` que ya carga el ejercicio:

```tsx
  const [urlVideo, setUrlVideo] = useState<string | null>(null)
  const [errorVideo, setErrorVideo] = useState<string | null>(null)

  useEffect(() => {
    if (!ejercicio?.video_id) return

    // La URL firmada vence en 5 minutos. Como el video dura 60 segundos como
    // máximo, la única forma de toparse con el vencimiento es dejar la
    // pantalla abierta sin mirar; en ese caso se vuelve a montar y se pide de
    // nuevo. No hace falta renovarla con un timer.
    supabase.functions
      .invoke('video-url', { body: { videoId: ejercicio.video_id } })
      .then(({ data, error }) => {
        if (error || !data?.rutaFirmada) {
          setErrorVideo('No pudimos cargar el video.')
          return
        }
        // La función devuelve solo la ruta: adentro del runtime de Edge
        // Functions, SUPABASE_URL es el nombre interno del contenedor y no se
        // puede resolver desde el teléfono. La base la pone el cliente.
        setUrlVideo(`${process.env.EXPO_PUBLIC_SUPABASE_URL}${data.rutaFirmada}`)
      })
  }, [ejercicio?.video_id])

  const reproductor = useVideoPlayer(urlVideo, (p) => {
    p.loop = true
  })
```

Reemplazar el bloque del placeholder —el `{ejercicio.video_id && (...)}` con el comentario que menciona Cloudflare— por:

```tsx
      {ejercicio.video_id && (
        <View style={estilos.video}>
          {urlVideo ? (
            <VideoView
              player={reproductor}
              style={estilos.reproductor}
              allowsFullscreen
              nativeControls
            />
          ) : (
            <Text style={estilos.gris}>
              {errorVideo ?? 'Cargando video…'}
            </Text>
          )}
        </View>
      )}
```

Y en `StyleSheet.create`, reemplazar `videoPendiente` por:

```tsx
  video: {
    aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#eee',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  reproductor: { width: '100%', height: '100%' },
```

- [ ] **Paso 3: Chequear tipos**

```bash
npx tsc --noEmit
```

- [ ] **Paso 4: Probar en el teléfono o el emulador**

```bash
npm run start --workspace movil
```

Con `npx supabase functions serve` corriendo, y entrando como un socio del gimnasio que subió el video en la Task 6.

Esperado: al abrir el ejercicio con video, aparece el reproductor y el video se reproduce con los controles nativos.

> **Si estás en un dispositivo físico**, `EXPO_PUBLIC_SUPABASE_URL` tiene que ser la IP de tu máquina en la red local, no `127.0.0.1`. Es el mismo requisito que ya tiene el login, así que si podés entrar a la app, esto ya está bien.

- [ ] **Paso 5: Verificar el aislamiento desde la app**

Entrando como un socio de OTRO gimnasio, abrir la pantalla del mismo ejercicio.

Esperado: RLS ya no devuelve el ejercicio, así que se ve "No encontramos este ejercicio". Si de alguna forma se llegara a la pantalla, `video-url` devolvería 404 y aparecería "No pudimos cargar el video.". En ningún caso se reproduce.

- [ ] **Paso 6: Commit**

```bash
git add "apps/movil/src/app/(tabs)/ejercicios/[id].tsx" apps/movil/package.json package-lock.json
git commit -m "Reproducir el video del ejercicio con la URL firmada de Storage"
```

---

### Task 8: Documentación

**Files:**
- Modify: `docs/superpowers/specs/2026-08-27-gym-saas-design.md:37,150,152,237,239,416,449`
- Modify: `README.md:33-40`
- Modify: `docs/superpowers/plans/2026-08-27-etapas-0-1-cimientos-y-ejercicios.md` (encabezado)
- Modify: `.env.example:22-26`
- Modify: `docs/cloudflare-stream-alta.md` (encabezado)

**Interfaces:**
- Consumes: nada
- Produces: nada

- [ ] **Paso 1: Corregir el diseño general**

En `docs/superpowers/specs/2026-08-27-gym-saas-design.md`:

**Línea 37**, fila de la tabla de stack:

```markdown
| Videos | Supabase Storage | Bucket privado con URLs firmadas de vida corta; sin costo en el plan Free |
```

**Líneas 149-151**, la tabla `videos`. Reemplazar las dos líneas por:

```markdown
`id` · `gym_id` (nulo = global) · `ruta` (ruta del objeto en el bucket) · `estado` (`procesando` \| `listo` \| `error`) · `duracion_seg` · `thumbnail_url` · `subido_por` · `error_detalle`

Tabla separada, y no un campo `video_url` dentro del ejercicio, porque un video **no está disponible al terminar la subida**: entre que se emite la URL de subida y que la subida se confirma hay una ventana en la que la fila existe y el archivo no. Ese estado hay que representarlo para que el panel lo muestre y la app no ofrezca un video roto. Además un ejercicio puede tener más de un video (la ejecución correcta, y cómo se regula esa máquina en particular).
```

**Sección 6 completa** (líneas 229-241). Reemplazar desde `## 6. Acceso a los videos` hasta la línea que empieza con `**Fuera de alcance:**` —esa línea final se conserva tal cual— por:

```markdown
## 6. Acceso a los videos

Los videos de un gimnasio no pueden servirse desde una URL pública compartible por mensajería: el contenido propio es el diferencial que el gym está pagando.

Flujo de reproducción:

1. La app pide reproducir un video.
2. Una función de Supabase verifica que quien pide pertenece a ese gimnasio (o que el video es global).
3. Devuelve una **URL firmada de Supabase Storage que vence en 5 minutos**.

El bucket es privado y no tiene ninguna política sobre `storage.objects`, así que RLS deniega todo acceso directo: ni siquiera un admin del gimnasio dueño puede bajar el objeto. Las Edge Functions son el único camino.

El detalle de la implementación, y por qué el proveedor no es Cloudflare Stream, está en [Videos en Supabase Storage](2026-09-04-videos-en-supabase-storage-design.md), que reemplaza esta sección en todo lo que la contradiga.
```

**Línea 416** (costos). Reemplazar el párrafo por:

```markdown
**Costos.** Hasta la etapa 3, cero: las capas gratuitas de Supabase alcanzan para desarrollar y para los primeros gimnasios —1 GB de archivos y 5 GB de egress mensual, sin tarjeta. El gasto real aparece con volumen de video, momento en el que ya debería haber ingresos: el paso siguiente es Supabase Pro (USD 25) o mover únicamente el video a Cloudflare Stream.
```

**Línea 449** (riesgos). Reemplazar la fila por:

```markdown
| Costo de video sin control al crecer | Supabase Storage detrás de tres Edge Functions, reemplazable sin tocar el resto |
```

- [ ] **Paso 2: Corregir el README**

Fila de la tabla de stack:

```markdown
| Videos | Supabase Storage |
```

Y el estado, que quedó viejo hace más de diez commits:

```markdown
## Estado

En construcción. Las etapas 0 y 1 están implementadas: esquema con RLS,
autenticación en el panel y la app, ejercicios, máquinas y videos.
```

- [ ] **Paso 3: Marcar como superadas las tareas de video del plan anterior**

En `docs/superpowers/plans/2026-08-27-etapas-0-1-cimientos-y-ejercicios.md`, agregar debajo del título:

```markdown
> **Las tareas 11, 12, 13 y 15 quedaron superadas.** Se escribieron contra
> Cloudflare Stream, que resultó no tener capa gratuita. El reemplazo por
> Supabase Storage está en
> [2026-09-04-videos-en-supabase-storage.md](2026-09-04-videos-en-supabase-storage.md).
> Este plan no se reescribe: es el registro de lo que efectivamente se ejecutó.
```

> **Por qué un puntero y no reescribir las tareas:** la Tarea 11 se ejecutó y se commiteó. Reescribirla haría que el ledger de `.superpowers/sdd/` describa un trabajo que nunca ocurrió.

- [ ] **Paso 4: Limpiar `.env.example`**

Borrar el bloque de las tres variables de Cloudflare y su comentario. No se reemplaza por nada: las funciones usan las variables que el runtime inyecta solo.

- [ ] **Paso 5: Archivar la guía de Cloudflare**

Agregar arriba de todo en `docs/cloudflare-stream-alta.md`:

```markdown
> **Archivado.** El proyecto usa Supabase Storage, ver
> [Videos en Supabase Storage](superpowers/specs/2026-09-04-videos-en-supabase-storage-design.md).
> Esta guía queda por si el proyecto llega a facturar y la calidad adaptativa
> pasa a importar: el camino de vuelta toca las mismas piezas que la ida.
```

- [ ] **Paso 6: Verificar que no queda ninguna referencia viva a Cloudflare**

```bash
grep -rn -i "cloudflare\|stream_uid" --include="*.ts" --include="*.tsx" --include="*.sql" --include="*.md" . \
  | grep -v node_modules | grep -v "\.next" | grep -v "dist/" \
  | grep -v "cloudflare-stream-alta.md" \
  | grep -v "2026-09-04-videos-en-supabase-storage" \
  | grep -v "2026-08-27-etapas-0-1"
```

Esperado: **sin resultados**. Cualquier línea que aparezca es una referencia que quedó sin corregir.

- [ ] **Paso 7: Correr todo**

```bash
npm run test:core
npm run test:rls
npx tsc --noEmit
```

Esperado: todo verde.

- [ ] **Paso 8: Commit**

```bash
git add docs README.md .env.example
git commit -m "Actualizar la documentación al cambio de proveedor de video"
```
