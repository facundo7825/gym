# Alta de la cuenta de Cloudflare Stream

> **Archivado.** El proyecto usa Supabase Storage, ver
> [Videos en Supabase Storage](superpowers/specs/2026-09-04-videos-en-supabase-storage-design.md).
> Esta guía queda por si el proyecto llega a facturar y la calidad adaptativa
> pasa a importar: el camino de vuelta toca las mismas piezas que la ida.

Guía de una sola vez para dejar la cuenta lista y completar las variables que el
proyecto ya espera. Al terminar vas a tener estos cinco valores:

| Variable | Qué es | Dónde se usa |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Identificador de tu cuenta | `supabase/functions/video-subir` |
| `CLOUDFLARE_STREAM_TOKEN` | API token con permiso sobre Stream | `supabase/functions/video-subir` |
| `CLOUDFLARE_CUSTOMER_CODE` | Subdominio propio desde el que se sirven tus videos | `packages/core/src/video.ts` (`urlHls`) |
| `CLOUDFLARE_STREAM_KEY_ID` | Id de la clave de firma | firmado de URLs (etapa 1) |
| `CLOUDFLARE_STREAM_KEY_JWK` | Clave privada de firma, en JWK base64 | firmado de URLs (etapa 1) |

> Los dos últimos todavía **no** están en `.env.example`: aparecen recién cuando se
> implemente `urlFirmada`. Conseguilos igual ahora, porque la clave privada se
> muestra una única vez y no se puede volver a leer.

---

## Antes de empezar

**Necesitás una tarjeta.** Stream no tiene capa gratuita. La ingesta y la
transcodificación son gratis, pero almacenar y servir se pagan:

- **USD 5 por cada 1.000 minutos almacenados por mes**, prepago, en bloques de 5
  dólares. Sin comprar al menos un bloque no podés guardar ni un video.
- **USD 1 por cada 1.000 minutos entregados**, pospago según consumo. Incluye el
  ancho de banda; no hay cargo aparte por egreso.

Para dimensionar: 1.000 minutos son unos 500 videos de ejercicio de 2 minutos, y
1.000 minutos entregados son unas 500 reproducciones completas de esos videos.
Para desarrollo y los primeros gimnasios, el piso de USD 5/mes alcanza.

**No necesitás un dominio.** Stream funciona sin agregar ningún sitio a
Cloudflare: los videos se sirven desde `customer-<CODE>.cloudflarestream.com`.
Si el asistente de alta te insiste con agregar un dominio, salteálo.

**Usá un mail de la empresa, no uno personal.** Esta cuenta va a ser la que
sirve el contenido de los gimnasios clientes; que dependa de una casilla
personal es un problema el día que tengas que dar acceso a alguien más.

---

## Paso 1 — Crear la cuenta

1. Entrá a <https://dash.cloudflare.com/sign-up>.
2. Cargá email y contraseña, y creá la cuenta.
3. Revisá tu casilla y confirmá el mail de verificación. Hasta que no lo
   confirmes, varias secciones del panel aparecen bloqueadas.
4. Si te ofrece elegir un plan de sitio web (Free / Pro / Business), elegí
   **Free**: no tiene nada que ver con Stream, que se cobra aparte por uso.

## Paso 2 — Activar la verificación en dos pasos

En **My Profile → Authentication → Two-Factor Authentication**, activala con una
app de códigos (Authy, Google Authenticator, 1Password) y **guardá los códigos de
recuperación** en el gestor de contraseñas.

No es opcional en la práctica: quien entra a esta cuenta puede borrar todos los
videos de todos los gimnasios y generar gasto a tu nombre.

## Paso 3 — Cargar el medio de pago

En **Manage Account → Billing → Payment Methods**, agregá la tarjeta. Sin esto
el paso 5 falla.

## Paso 4 — Anotar el Account ID

Entrá a cualquier sección del panel y mirá la URL:

```
https://dash.cloudflare.com/8f3c…a91/stream
                            ^^^^^^^^^ esto es el Account ID
```

También aparece en **Manage Account → Account Home**, en el panel lateral
derecho, con un botón para copiarlo. Son 32 caracteres hexadecimales.

```
CLOUDFLARE_ACCOUNT_ID=8f3c...a91
```

El Account ID no es un secreto (viaja en cada URL de la API), pero igual va al
`.env` junto con el resto.

## Paso 5 — Activar Stream

1. En el menú lateral entrá a **Stream → Videos**.
2. Te va a pedir suscribirte. Comprá el primer bloque: **1.000 minutos de
   almacenamiento por USD 5/mes**.
3. Confirmá el cargo.

Desde acá ya podés subir videos, pero no lo hagas a mano todavía: el proyecto los
sube por la Edge Function, que es lo que vas a probar en el paso 10.

## Paso 6 — Crear el API token

**No uses la Global API Key.** Esa llave puede hacer todo en tu cuenta y no se
puede limitar. Creá un token acotado a Stream:

1. Andá a **My Profile → API Tokens → Create Token**.
2. Abajo de todo, elegí **Create Custom Token → Get started**.
3. Completá así:

   | Campo | Valor |
   |---|---|
   | Token name | `gym-stream-dev` (después creás uno aparte para producción) |
   | Permissions | **Account** · **Stream** · **Edit** |
   | Account Resources | **Include** · tu cuenta (solo esa) |
   | Client IP Address Filtering | vacío |
   | TTL | vacío, o una fecha si querés que caduque solo |

4. **Continue to summary → Create Token**.
5. Copiá el token **ahora**: se muestra una sola vez.

```
CLOUDFLARE_STREAM_TOKEN=<el token largo que te mostró>
```

`Stream: Edit` es lo mínimo que necesita `video-subir`: pedir una URL de subida
(`POST /stream/direct_upload`), consultar el estado del video y crear la clave de
firma del paso 8. No agregues permisos de DNS, Workers ni Zone: si el token se
filtra, lo único que se puede tocar es Stream.

Creá **un token distinto para producción** cuando llegue el momento, así podés
revocar el de desarrollo sin cortar el servicio.

## Paso 7 — Anotar el customer code

Es el subdominio propio desde el que se sirven tus videos. Lo encontrás en
**Stream → Videos**: cualquier código de inserción (embed) que te muestre el
panel tiene esta forma, y lo que va en `<CODE>` es tu customer code.

```
https://customer-a1b2c3d4e5f6g7h8.cloudflarestream.com/<VIDEO_UID>/iframe
                  ^^^^^^^^^^^^^^^^ esto
```

Si todavía no subiste ningún video y no ves ningún embed, subí uno de prueba
desde el panel de Cloudflare y mirá el campo `playback.hls` que devuelve la API
(`GET /accounts/{account_id}/stream`): trae el mismo subdominio.

```
CLOUDFLARE_CUSTOMER_CODE=a1b2c3d4e5f6g7h8
```

Es fijo por cuenta y no cambia. Es el valor que consume `urlHls()` en
`packages/core/src/video.ts`.

## Paso 8 — Crear la clave de firma

`video-subir` pide los videos con `requireSignedURLs: true`, así que sin clave de
firma nadie va a poder reproducirlos. Se crea una sola vez, por API:

```bash
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/stream/keys" \
  -H "Authorization: Bearer $CLOUDFLARE_STREAM_TOKEN"
```

La respuesta trae `result.id`, `result.pem` y `result.jwk`:

```
CLOUDFLARE_STREAM_KEY_ID=<result.id>
CLOUDFLARE_STREAM_KEY_JWK=<result.jwk>
```

> **`pem` y `jwk` no se muestran nunca más.** Guardalos en el gestor de
> contraseñas en el mismo momento, antes de cerrar la terminal. Si los perdés,
> hay que crear una clave nueva y revocar la anterior.

El `jwk` es la clave privada que firma los tokens de reproducción: tratalo con el
mismo cuidado que la `service_role_key` de Supabase.

## Paso 9 — Cargar las variables

**Local — `.env` de la raíz** (para tests y scripts):

```
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_STREAM_TOKEN=...
CLOUDFLARE_CUSTOMER_CODE=...
CLOUDFLARE_STREAM_KEY_ID=...
CLOUDFLARE_STREAM_KEY_JWK=...
```

**Local — `supabase/functions/.env`** (lo lee la Edge Function). Ese archivo hoy
tiene valores de relleno; reemplazalos por los reales.

**Producción — secrets de Supabase**, una vez que el proyecto esté en la nube:

```bash
npx supabase secrets set \
  CLOUDFLARE_ACCOUNT_ID=... \
  CLOUDFLARE_STREAM_TOKEN=... \
  CLOUDFLARE_CUSTOMER_CODE=... \
  CLOUDFLARE_STREAM_KEY_ID=... \
  CLOUDFLARE_STREAM_KEY_JWK=...
```

Verificá que ninguno de estos archivos se vaya al repositorio:

```bash
git check-ignore -v .env supabase/functions/.env
```

Si no imprime nada, **frená** y agregalos a `.gitignore` antes de seguir.

## Paso 10 — Verificar que funciona

**1. El token es válido y ve tu Stream:**

```bash
curl "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/stream" \
  -H "Authorization: Bearer $CLOUDFLARE_STREAM_TOKEN"
```

Esperado: `"success": true`. Si devuelve `10000 / Authentication error`, el token
o el Account ID están mal. Si devuelve un error de permisos, al token le falta
`Stream: Edit`.

**2. La Edge Function habla con Cloudflare de verdad:**

```bash
npx supabase functions serve video-subir --env-file supabase/functions/.env
```

Desde el panel, subí un video como entrenador o admin. Tiene que aparecer una
fila en `videos` con `estado = 'procesando'` y el `stream_uid` que devolvió
Cloudflare, y el video tiene que verse en **Stream → Videos** del panel de
Cloudflare.

Si la función responde `502 No pudimos preparar la subida`, mirá los logs: ahí se
loguea el error crudo que devolvió Cloudflare.

---

## Costos: cómo no llevarte una sorpresa

- El almacenamiento es prepago: si te quedás sin minutos, las subidas fallan,
  pero no se genera deuda.
- **La entrega es pospaga y no tiene tope automático.** Configurá una alerta en
  **Manage Account → Notifications → Add → Billing / Usage** para enterarte antes
  de que el consumo se vaya de escala.
- Borrar un video libera sus minutos de almacenamiento.
- El límite de 5 minutos por video (`maxDurationSeconds: 300` en `video-subir`)
  también es un control de costos: son videos de demostración de ejercicios, no
  clases completas.

## Mantenimiento

- **Rotar el token:** creá el nuevo, actualizá los secrets, verificá con el
  paso 10, recién ahí borrá el viejo en **My Profile → API Tokens**.
- **Si se filtra el token:** borralo desde el panel; deja de funcionar al
  instante. Los videos ya subidos no se ven afectados.
- **Si se filtra la clave de firma:** creá una clave nueva y borrá la anterior
  (`DELETE /accounts/{account_id}/stream/keys/{key_id}`). Las URLs firmadas con
  la clave vieja dejan de servir, que es exactamente lo que querés.

## Checklist

- [ ] Cuenta creada y mail verificado
- [ ] 2FA activo y códigos de recuperación guardados
- [ ] Tarjeta cargada
- [ ] Account ID anotado
- [ ] Stream activo con el bloque de 1.000 minutos comprado
- [ ] API token `Stream: Edit` creado y guardado
- [ ] Customer code anotado
- [ ] Clave de firma creada, `id` y `jwk` guardados en el gestor de contraseñas
- [ ] Variables en `.env` y en `supabase/functions/.env`
- [ ] `git check-ignore` confirma que ninguno de los dos se sube
- [ ] `curl` al endpoint de Stream devuelve `success: true`
- [ ] Subida de prueba desde el panel llega a Cloudflare
- [ ] Alerta de facturación configurada

---

## Referencias

- [Precios de Cloudflare Stream](https://developers.cloudflare.com/stream/pricing/)
- [Proteger tus videos con URLs firmadas](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/)
- [Empezar con Stream](https://developers.cloudflare.com/stream/get-started/)
- [Preguntas frecuentes de Stream](https://developers.cloudflare.com/stream/faq/)
