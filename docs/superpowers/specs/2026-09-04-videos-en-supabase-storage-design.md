# Diseño — Videos en Supabase Storage

**Fecha:** 2026-09-04
**Estado:** aprobado, pendiente de plan de implementación
**Modifica:** [Diseño general](2026-08-27-gym-saas-design.md), sección 6

---

## 1. Por qué se cambia

El diseño original sirve los videos con Cloudflare Stream. Stream **no tiene capa
gratuita**: cuesta USD 5 por cada 1.000 minutos almacenados por mes, más USD 1
por cada 1.000 minutos entregados, y exige una tarjeta cargada para activarse.
El proyecto todavía no está en condiciones de sostener un gasto mensual, así que
la etapa 1 no puede completarse con el proveedor elegido.

Cloudflare R2 tampoco resuelve el problema: su capa gratuita es generosa —10 GB y
egress sin cargo— pero **también exige un medio de pago cargado** para habilitar
el servicio, que es exactamente el bloqueo que hay que evitar.

La alternativa elegida es **Supabase Storage**, que ya forma parte del stack. Su
plan Free incluye 1 GB de archivos, 5 GB de egress por mes y hasta 50 MB por
archivo, sin tarjeta.

Se descartó publicar los videos en YouTube o Vimeo como "no listados": un enlace
no listado se reenvía por mensajería igual que uno público, y eso derrota la razón
de ser de la sección 6 del diseño original — el contenido propio es el diferencial
que el gimnasio está pagando.

**Este cambio era previsible y estaba previsto.** El diseño original puso toda la
integración de video detrás de una frontera de tres funciones —`subir`, `estado`,
`urlFirmada`— justamente para que cambiar de proveedor no se propagara. El alcance
real del cambio, detallado más abajo, confirma que la frontera funcionó.

## 2. Qué se resigna y qué se conserva

| | Cloudflare Stream | Supabase Storage |
|---|---|---|
| Costo | USD 5/mes mínimo | USD 0 |
| Tarjeta | Obligatoria | No |
| URLs firmadas de vida corta | Sí | Sí |
| Aislamiento entre gimnasios | Sí | Sí |
| Transcodificación | Sí | **No** |
| Calidad adaptativa | Sí | **No** |
| Miniatura automática | Sí | **No** |
| Límite por archivo | 5 min de duración | 50 MB |

**Se conserva lo que la sección 6 del diseño original exige:** ningún video es
accesible por una URL pública compartible, el acceso se decide verificando la
pertenencia al gimnasio, y la URL emitida vence en minutos.

**Se resigna la transcodificación**, y de ahí se desprende todo lo demás: no hay
calidad adaptativa, no hay miniatura generada, y el archivo tiene que llegar ya
comprimido. La decisión de producto que lo hace viable está en la sección 4.

**Cuándo deja de alcanzar.** A unos 8 MB por video de 60 segundos en 720p, 1 GB
son unos 125 videos y 5 GB de egress son unas 625 reproducciones completas por
mes. Alcanza para desarrollar y para la demo del final de la etapa 2. Con un
gimnasio real facturando, el siguiente paso es Supabase Pro (USD 25: 100 GB de
archivos y 250 GB de egress) o mover únicamente el video a Stream, para lo cual
queda `docs/cloudflare-stream-alta.md`.

## 3. Base de datos

### `videos.stream_uid` pasa a llamarse `ruta`

La columna guardaba el uid de Cloudflare; pasa a guardar la ruta del objeto en
Storage, con la forma `{gym_id}/{video_id}.mp4`. Conserva `text not null unique`:
una ruta también es única.

Como no hay ningún proyecto remoto vinculado —`supabase/.temp/` no tiene
`project-ref`— la migración `0003_ejercicios.sql` se corrige **en el lugar**, en
vez de agregar una migración que renombra. No hay datos que preservar, y una
migración correctiva sobre un esquema que nunca se desplegó es ruido permanente
en el repositorio.

### El enum `estado_video` se conserva con significado nuevo

Sin transcodificación es tentador borrarlo, pero sigue existiendo un estado
intermedio real:

| Valor | Significado |
|---|---|
| `procesando` | La fila existe, el archivo todavía no. Es la ventana entre que se emite la URL de subida y que la subida se confirma. |
| `listo` | El objeto existe en el bucket y se puede reproducir. |
| `error` | La subida se abandonó o falló. |

El argumento del diseño original para que `videos` sea tabla propia y no un campo
`video_url` dentro de `ejercicios` sigue en pie: hay un estado que representar. Lo
que cambia es su duración, de minutos a segundos.

**Invariante que el sistema sostiene:** `estado = 'listo'` implica que el objeto
existe en el bucket. Se garantiza verificando contra Storage antes de escribir el
estado, no confiando en el cliente. De ahí sale la función `video-confirmar`.

### El bucket se crea por migración

Migración nueva `0005_storage_videos.sql`:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 52428800, array['video/mp4']);
```

Por migración y no por `supabase/config.toml` porque los buckets declarados en el
config solo existen en el entorno local; una migración corre igual en local y en
la nube, y queda versionada.

**`public = false` y ninguna política sobre `storage.objects`.** Sin políticas,
RLS deniega todo: nadie lee ni escribe el bucket directamente, ni siquiera un
admin del gimnasio dueño. El único acceso es a través de las Edge Functions, que
usan `service_role` y firman URLs de vida corta. Es *deny by default*, y es lo que
hace cumplible la sección 6 del diseño original.

El `file_size_limit` del bucket es la segunda línea de defensa: el panel valida
antes de subir, pero si esa validación falla o alguien llama a la API directo,
Storage rechaza igual.

### Lo que no cambia

Las políticas de `0004_rls_ejercicios.sql` quedan intactas. `videos_leer`,
`videos_crear` y `videos_editar` ya expresan lo necesario, incluido el UPDATE que
habilita el paso de `procesando` a `listo`. Los tests de aislamiento existentes
tampoco se tocan.

### Hueco conocido

`thumbnail_url` queda sin usar: Cloudflare la generaba, Storage no. Se deja la
columna nula. Generar un fotograma con `<canvas>` en el panel y subirlo como
segundo objeto es posible, pero se difiere hasta que una pantalla lo pida de
verdad. Es una capacidad que se pierde en el cambio, no un olvido.

## 4. Límites de archivo

El plan Free admite 50 MB por archivo. Un video de 2 minutos grabado con un
celular en 1080p pesa entre 200 y 350 MB — diez veces el límite. Sin resolver
esto, el empleado del gimnasio intenta subir y le rebota todo.

**Decisión: el panel valida y rechaza antes de subir, con un tope de 60 segundos
de duración.** No se comprime en el navegador.

- **Por qué rechazar y no comprimir:** transcodificar en el navegador requiere
  ffmpeg.wasm —unos 30 MB de WASM y varios minutos de CPU por video— para
  resolver un problema que se evita grabando bien. El costo permanente en peso de
  página y complejidad no se justifica para una tarea que el gimnasio hace unas
  pocas decenas de veces.
- **Por qué 60 segundos y no los 5 minutos originales:** a 720p, 60 segundos pesan
  unos 8 MB y entran holgados en el límite; 2 minutos quedan al filo. Una
  demostración de ejercicio no necesita más, y el tope reduce a la vez el consumo
  del 1 GB disponible y el del egress mensual.

La validación es de tipo (`video/mp4`), tamaño y duración. La duración se lee de
los metadatos locales con un elemento `<video>` y `preload="metadata"`, así que un
archivo de 300 MB se descarta sin transferir un byte.

Se agrega `docs/grabar-videos.md` con los ajustes concretos —720p, 60 segundos,
MP4/H.264— y qué hacer si el archivo se pasa. Es el documento al que apunta el
mensaje de error.

## 5. Backend

### Patrón común a las tres funciones

Cada función construye **dos clientes de Supabase**:

- Uno con el token de quien llama, que hereda su RLS. Es el que autoriza.
- Uno con `service_role`, que se usa **solo después** de que el primero confirmó
  el acceso, y **nunca con una ruta que venga del request**: la ruta sale siempre
  de la fila que RLS devolvió.

Esa segunda condición es la que evita el path traversal. El cliente envía un
`videoId`; si RLS no le devuelve esa fila, la función corta antes de que
`service_role` toque nada. `service_role` está acá por una sola razón: el bucket
no tiene políticas, así que firmar URLs requiere saltear RLS. Es una capacidad,
no una autorización.

**`service_role` toca únicamente Storage. Todo lo que sea la tabla `videos` —leer,
insertar y actualizar— va por el cliente con el token del usuario.** Escrito
explícito porque la alternativa es fácil de escribir por descuido y difícil de
notar: un insert o un update con `service_role` deja de pasar por `videos_crear`
y `videos_editar`, y esas políticas dejarían de ser lo que garantiza que un
entrenador no escriba en el gimnasio ajeno. La regla concreta por función:

| Función | Cliente del usuario | `service_role` |
|---|---|---|
| `video-subir` | membresía y rol, insert en `videos` | `createSignedUploadUrl` |
| `video-confirmar` | select y update de `videos` | `list` sobre el bucket |
| `video-url` | select de `videos` | `createSignedUrl` |

El bloque de CORS, hoy repetido literalmente, se extrae a
`supabase/functions/_compartido/cors.ts`.

### `video-subir` — se modifica

Sobreviven CORS, el 401 sin `Authorization`, la resolución de membresía con
`.order('created_at').limit(1).maybeSingle()`, el chequeo de rol y el insert.
Cambia únicamente el bloque que hoy llama a `api.cloudflare.com`.

```
POST /functions/v1/video-subir   { duracionSeg }
  → 401 sin sesión · 403 si no es entrenador ni admin
  → videoId = crypto.randomUUID()
  → ruta = `${gym_id}/${videoId}.mp4`
  → service_role: createSignedUploadUrl('videos', ruta)
  → insert videos { id: videoId, gym_id, ruta, estado: 'procesando',
                    duracion_seg, subido_por }
  → { videoId, ruta, uploadUrl, token }
```

El uuid se genera en la función y no lo pone la base porque la ruta tiene que
existir antes del insert.

`duracionSeg` llega del cliente y se guarda sin verificar. Es correcto que así
sea, pero conviene decir qué significa: es **metadato de presentación, no un
control**. Un panel modificado puede declarar 10 segundos y subir un video de
media hora. Lo que impide de verdad que eso entre es el `file_size_limit` del
bucket, que lo aplica Storage y no el navegador. La duración declarada solo se
usa para mostrarla en el listado.

Se mantiene el orden actual —firmar primero, insertar después— y el comentario que
lo explica sigue aplicando, con mejor resultado que antes: si el insert falla, lo
que queda huérfano es un token de subida que caduca solo y al que ninguna fila
apunta, invisible e inofensivo. Al revés, el huérfano sería una fila en
`procesando` que el panel muestra como video roto.

El contrato suma dos campos pero conserva `{ videoId, uploadUrl }`.

### `video-confirmar` — nueva, reemplaza a `video-estado`

```
POST /functions/v1/video-confirmar   { videoId }
  → RLS lee la fila           → 404 si es de otro gimnasio
  → si estado ≠ 'procesando'  → devuelve el estado actual (idempotente)
  → service_role: list(gym_id, { search: `${videoId}.mp4` })
     ├─ existe    → update estado = 'listo'            → { estado: 'listo' }
     └─ no existe → update estado = 'error',
                    error_detalle = 'La subida no llegó a completarse'  → 409
```

Es lo que sostiene la invariante de la sección 3. Sin la verificación contra
Storage, un bug en el panel puede marcar `listo` un video que nunca subió, y el
socio se encuentra con un reproductor vacío.

Desaparecen el bucle de polling de 60 intentos cada 5 segundos y
`mapearEstadoCloudflare` entero: la confirmación es una sola llamada, inmediata,
justo después de que la subida resuelve.

### `video-url` — nueva

```
POST /functions/v1/video-url   { videoId }
  → RLS lee la fila     → 404 si es de otro gimnasio
  → estado ≠ 'listo'    → 409
  → service_role: createSignedUrl(ruta, 300)
  → { rutaFirmada, expiraEn: 300 }
```

Toda la seguridad es la misma línea de siempre: RLS devuelve la fila solo si quien
pregunta pertenece a ese gimnasio, o si el video es del catálogo global.

**Devuelve la ruta firmada, no una URL absoluta.** Adentro del runtime de Edge
Functions `SUPABASE_URL` vale `http://kong:8000` —el nombre interno del
contenedor—, así que la URL que arma `createSignedUrl` no la puede resolver ni el
navegador ni el teléfono. Verificado en
`supabase/.temp/start-secrets/supabase_edge_runtime_gym/env/docker.env`.

Devolver solo la ruta lo resuelve sin variables de entorno nuevas: cada cliente la
pega a su propia URL de Supabase, que ya conoce porque la usa para todo lo demás.
La firma no se ve afectada, viaja en la query string. La alternativa —una variable
`URL_PUBLICA` que la función use como base— agrega un valor de configuración que,
mal puesto, rompe la reproducción en silencio y hay que mantener distinto en cada
entorno, incluido el celular físico, cuya IP de red local cambia.

**Vigencia de 300 segundos, no 3600.** El plan de implementación decía una hora,
pero el diseño original pide una URL que "vence en minutos" y ahí manda el diseño.
Con videos de 60 segundos como máximo, cinco minutos alcanzan de sobra para
reproducir, y es una hora menos de ventana útil si alguien copia la URL desde las
herramientas de desarrollador.

### Errores

| Situación | Respuesta |
|---|---|
| Sin `Authorization` | 401 |
| Sesión inválida | 401 |
| No es entrenador ni admin | 403 |
| Video de otro gimnasio | 404 — no se confirma que exista |
| Video sin confirmar todavía | 409 |
| Storage no responde | 502, con el error crudo en los logs |

### Efecto secundario

La duplicación deliberada de `video.ts` entre `packages/core` y
`supabase/functions/_compartido` —aceptada porque Deno y npm no comparten
resolución de módulos— se disuelve sola: `mapearEstadoCloudflare` y `urlHls` dejan
de existir, y eran lo único que las funciones necesitaban compartir. Queda
`_compartido/cors.ts`, que no duplica nada de `core`.

## 6. `packages/core`

`video.ts` pierde `mapearEstadoCloudflare` y `urlHls`, y gana la validación, que
es lógica pura, la consumen el panel y las funciones, y es exactamente lo que
`core` existe para alojar:

```ts
export const TAMANO_MAXIMO_BYTES = 50 * 1024 * 1024
export const DURACION_MAXIMA_SEG = 60

/** Devuelve el motivo del rechazo, o null si el archivo sirve. */
export function validarArchivoVideo(
  archivo: { tamanoBytes: number; duracionSeg: number; tipo: string },
): string | null
```

`validarArchivoVideo` devuelve el mensaje ya redactado en castellano en vez de un
booleano o un código: el panel lo muestra tal cual, y así el texto que ve el
empleado del gimnasio queda bajo test en vez de suelto en un JSX.

**No hay una función `rutaVideo` compartida.** Sería la candidata natural —une la
fila con el objeto— pero no tendría un solo consumidor: las Edge Functions corren
en Deno y no pueden importar del workspace npm, así que `video-subir` arma la ruta
inline, y el panel la recibe en la respuesta. Exportarla desde `core` dejaría dos
definiciones del mismo formato, capaces de divergir sin que nada lo agarre. El
formato se verifica de punta a punta en la prueba de subida y confirmación.

## 7. Panel

Componente nuevo `apps/panel/src/app/(panel)/ejercicios/subir-video.tsx`,
siguiendo el patrón de `formulario.tsx`.

```
1. El usuario elige un .mp4
2. Se lee la duración de los metadatos locales, sin subir nada
3. validarArchivoVideo(...)
     ├─ devuelve texto → se muestra y no se sube nada
     └─ devuelve null  → sigue
4. invoke('video-subir', { duracionSeg })  → { videoId, ruta, uploadUrl, token }
5. uploadToSignedUrl('videos', ruta, token, archivo)
6. invoke('video-confirmar', { videoId })  → estado 'listo'
7. update ejercicios set video_id = videoId
```

**No hay polling.** El paso 6 es una llamada y termina; el componente pasa de
"Subiendo…" a "Video listo." sin estado intermedio que consultar.

**El indicador de subida es indeterminado, no una barra de progreso.** El cliente
de Storage de supabase-js no expone el progreso; conseguirlo obliga a reemplazar
`uploadToSignedUrl` por un `PUT` crudo con XMLHttpRequest, o sea cambiar un camino
probado de la librería por código propio para ganar un porcentaje en una
transferencia de 8 MB que dura segundos.

Si el paso 5 falla, el 6 nunca corre y la fila queda en `procesando`. Si el 6
devuelve 409, se muestra "La subida no se completó, probá de nuevo" y la fila ya
quedó en `error`, no en un limbo silencioso.

El panel no comprime, no recorta y no genera miniatura.

## 8. App móvil

`expo-video` se agrega en la tarea del reproductor. La fuente pasa de un
manifiesto HLS a un MP4 directo:

```
al montar → invoke('video-url', { videoId })  → { rutaFirmada, expiraEn: 300 }
          → useVideoPlayer(`${EXPO_PUBLIC_SUPABASE_URL}${rutaFirmada}`)
409 → "El video todavía se está subiendo."
404 → no se muestra reproductor
```

Storage responde *range requests*, así que buscar dentro del video funciona igual
que con HLS. Lo que se pierde es la calidad adaptativa: el socio con mala señal
descarga el mismo archivo que el que está en WiFi. Con clips de 60 segundos a
720p —unos 8 MB— es una espera tolerable, y era el precio anunciado del cambio.

La URL se pide al montar y vence a los 5 minutos. Como el video dura 60 segundos
como máximo, la única forma de toparse con el vencimiento es dejar la pantalla
abierta sin mirar: si la reproducción falla, se vuelve a pedir una vez y se
reintenta. Sin timers ni renovación anticipada.

## 9. Tests

Los tests de aislamiento de `tests/rls/ejercicios.test.ts` cubren la fila `videos`
y no se tocan. Se suman:

**`packages/core/tests/video.test.ts`** — reemplaza a los actuales, con los casos de
`validarArchivoVideo`: archivo válido, tipo incorrecto, tamaño excedido, duración
excedida, duración ilegible, los dos límites excedidos a la vez —gana el tamaño, que
es el límite duro— y el valor exacto de cada límite, que tiene que pasar.

**Un test de RLS nuevo sobre el bucket:**

```
preparación: con service_role, subir un objeto real a `${gymA}/${uuid}.mp4`

1. con service_role SÍ baja
     → el objeto existe y la ruta está bien armada
2. comoAdminA.storage.from('videos').download(ruta)   →  error
     → un admin del gimnasio DUEÑO no puede bajarlo directo
3. comoSocioA.storage.from('videos').download(ruta)   →  error
```

El orden importa y la aserción 1 no es decorativa: sin ella, el test pasa
igual con un bucket abierto de par en par, porque `download` de una ruta
inexistente también falla. Sería un test verde que no verifica nada — el peor
resultado posible para el único test que cubre esta garantía.

La sección 3 afirma que el bucket es *deny by default* y que el único camino es la
URL firmada. Eso es una configuración, y las configuraciones se rompen calladas:
alcanza con que alguien agregue una política "para probar algo" y el contenido del
gimnasio queda descargable por cualquier socio con la sesión abierta. Es
exactamente el riesgo que la sección 6 del diseño original dice cubrir, así que
tiene que avisar un test rojo y no un cliente.

## 10. Alcance del cambio

**Se toca:** dos migraciones, tres Edge Functions, un módulo de `core` con sus
tests, un componente del panel, una pantalla y media de la app.

**No se toca:** el aislamiento entre gimnasios, que sigue viviendo entero en
PostgreSQL; las políticas de `0004`; la estructura de `ejercicios`, `maquinas` y
`memberships`; el resto del panel; el catálogo de la app.

### Documentos a corregir

| Archivo | Qué cambia |
|---|---|
| `docs/superpowers/specs/2026-08-27-gym-saas-design.md` | §6 reescrita; tabla de stack; párrafo de costos; tabla de riesgos |
| `README.md` | Fila "Videos" de la tabla de stack; el estado "Todavía no hay código", que quedó viejo |
| `docs/superpowers/plans/2026-08-27-etapas-0-1-…md` | Tareas 11, 12, 13 y 15 reescritas; fragmento de migración de la Tarea 7 |
| `.env.example` | Se van las tres variables de Cloudflare |
| `supabase/functions/.env` | Queda sin contenido |
| `apps/movil/src/app/(tabs)/ejercicios/[id].tsx` | Comentario que menciona la cuenta de Cloudflare |
| `docs/cloudflare-stream-alta.md` | Nota de archivado: es la guía para cuando se migre |
| `docs/grabar-videos.md` | Nuevo |

### Una consecuencia que conviene registrar

Después del cambio **el proyecto no tiene ninguna credencial de terceros**. Hoy
`supabase/functions/.env` existe solo para las claves de Cloudflare; al terminar no
queda un solo secreto externo, ni en el repositorio ni en los secrets de
producción. Un proveedor menos al que rotarle tokens y una superficie menos que
auditar.

## 11. Camino de vuelta

Si el proyecto factura y la calidad adaptativa pasa a importar, volver a Stream
toca las mismas piezas que este cambio: las tres Edge Functions y `video.ts`. La
tabla `videos` no cambia —`ruta` vuelve a alojar un identificador de proveedor— y
`estado` recupera su significado original sin migración. `docs/cloudflare-stream-alta.md`
tiene el alta de la cuenta ya escrita.
