# Diseño — Socios, cuotas y check-in con QR (etapa 4)

**Fecha:** 2026-10-09
**Estado:** Implementado. Plan: [`2026-10-09-socios-cuotas-checkin.md`](../plans/2026-10-09-socios-cuotas-checkin.md).
**Desarrolla:** [Diseño general](2026-08-27-gym-saas-design.md), secciones 5 (Asistencia y cuotas), 9 (Check-in con QR) y 12 (Pantallas)

---

## 0. Alcance decidido

La etapa 4 entera en un solo ciclo: alta y ficha de socios, registro de cuotas,
check-in con QR y la pestaña Perfil de la app.

Entra en el alcance:

| | |
|---|---|
| Esquema | `cuotas`, `checkins`, `memberships.foto`, con su RLS |
| Esquema | Función `checkin_por_qr`, bucket privado `fotos-socios` |
| Core | Estado de la cuota y período propuesto para el próximo pago |
| Función | `socio-alta`: crea la cuenta del socio desde el panel |
| Panel | Socios: buscador, filtros, estado de cuota, alta |
| Panel | Ficha del socio: foto, pagos, asistencias, baja, regenerar QR |
| Panel | Escanear, pensada para el celular, con check-in manual |
| Panel | Asistencia del día |
| App | Pestaña Perfil: QR, cuota, asistencias, cambiar contraseña, cerrar sesión |

Queda fuera: notificaciones de cuota por vencer (etapa 5), planes y precios,
cobro dentro de la app, QR rotativo y exportar reportes.

### Decisiones tomadas en el brainstorming

| Pregunta | Decisión |
|---|---|
| Cómo consigue cuenta el socio | La crea el empleado en el panel, con email y contraseña inicial |
| Qué período cubre un pago | Un mes desde el vencimiento anterior; el primero, desde el día del pago |
| Precios | Monto libre por pago; el panel propone el del último. Sin planes |
| Quién saca la foto | El admin, desde la ficha. El socio no la puede cambiar |
| Quién hace qué | El admin gestiona socios y cobra; el entrenador también hace check-in |
| Cuota vencida al escanear | Se registra la entrada igual, con aviso en rojo |
| Dos escaneos el mismo día | No se duplica; se informa la hora de la primera entrada |
| Cómo se crea la cuenta | Función de Supabase con la clave de servicio, como las de video |
| Cómo se lee el QR | Librería de lectura de QR en el navegador; `BarcodeDetector` no existe en Safari |

---

## 1. Esquema y RLS

### Tablas nuevas

**`cuotas`**
`id` · `gym_id` · `membership_id` · `periodo_desde` · `periodo_hasta` ·
`monto` · `moneda` (default `ARS`) · `metodo` (`efectivo` \| `transferencia` \|
`otro`) · `fecha_pago` · `registrado_por` · `notas` · `created_at`

- `check (periodo_hasta > periodo_desde)` y `check (monto >= 0)`.
- La clave foránea a la membresía lleva el `gym_id` adentro, según la regla
  general del diseño: `(membership_id, gym_id)`.
- `periodo_hasta` es el primer día **sin** cobertura: una cuota del 15/10 al
  15/11 cubre hasta el 14/11 inclusive. Así dos cuotas consecutivas se tocan sin
  superponerse y la cuenta de "vence el" es directa.

**`checkins`**
`id` · `gym_id` · `membership_id` · `registrado_por` · `metodo` (`qr` \|
`manual`) · `dia` (`date`) · `created_at`

- `dia` es la fecha local del gimnasio en el momento de la entrada, calculada
  en la base con `gyms.zona_horaria`, nunca enviada por el cliente.
- `unique (membership_id, dia)`: la regla de una entrada por día la impone la
  base, no la pantalla.

**`memberships.foto`** (columna nueva, texto nulo): ruta del objeto en el bucket
`fotos-socios`.

La foto va en la membresía y no en `profiles.avatar_url`. El perfil es de la
persona y lo comparten todos sus gimnasios; además el socio puede editar su
propio `avatar_url`. La foto de verificación es del gimnasio que la sacó, y solo
la cambia su admin.

### Estado de la cuota

No se guarda: se calcula, como fija el diseño general. Vigente si existe una
cuota con `periodo_desde <= hoy < periodo_hasta`, con `hoy` en la zona del
gimnasio.

### Permisos

| | Admin | Entrenador | Socio |
|---|---|---|---|
| `cuotas` leer | todas las del gym | todas las del gym | las suyas |
| `cuotas` crear / borrar | sí | no | no |
| `cuotas` editar | no (se borra y se carga de nuevo) | no | no |
| `checkins` leer | todos los del gym | todos los del gym | los suyos |
| `checkins` crear | sí | sí | no |
| `checkins` borrar | sí | no | no |
| `memberships`: estado, `codigo_qr`, `foto` | sí | no | no |
| Bucket `fotos-socios` leer | su gym | su gym | la suya |
| Bucket `fotos-socios` escribir | su gym | no | no |

**El código QR solo lo lee su dueño.** `memberships_leer` deja ver todas las
membresías del gimnasio, y con ellas el `codigo_qr` de cualquiera: un socio
podía generarse el QR de otro. Se cerró la columna con permisos por columna
(`0017_rls_socios.sql`) y el socio obtiene el suyo con `mi_codigo_qr`. Se
detectó al escribir el plan; no estaba en el diseño original.

Los objetos del bucket se guardan bajo `<gym_id>/<membership_id>.jpg`; las
políticas de storage parten la ruta y comparan el primer segmento con
`mis_gyms()`.

### `checkin_por_qr(p_codigo text)`

Función SQL `security definer` que llama el panel al escanear. No se busca el
código con un `select` directo: así un código de otro gimnasio no se puede
distinguir de uno inexistente.

1. Busca la membresía activa con ese `codigo_qr`.
2. Verifica que quien llama es entrenador o admin de ese gimnasio. Si no existe,
   está inactiva o es de otro gimnasio, devuelve `{ valido: false }` sin más
   detalle.
3. Inserta el check-in con `metodo = 'qr'` y `on conflict (membership_id, dia) do
   nothing`.
4. Devuelve: `valido`, `membership_id`, `nombre`, `apellido`, `foto`,
   `nuevo` (si la entrada se creó ahora), `hora_entrada` (de la de hoy, nueva o
   existente) y las cuotas necesarias para calcular el estado (la de
   `periodo_hasta` más tardío).

El check-in manual usa una segunda función, `checkin_manual(p_membership_id
uuid)`, con los mismos pasos 2 a 4 y `metodo = 'manual'`. Comparten el cuerpo a
través de una función interna, para que la respuesta sea idéntica.

### Decisiones tomadas en la implementación

**`registrado_por` es una clave foránea compuesta.** En `cuotas` y `checkins`,
`registrado_por` va con el `gym_id`: `(registrado_por, gym_id)`, como pide la
regla general de la sección 4. Un pago o una entrada no pueden figurar
registrados por alguien de otro gimnasio.

**`editar_datos_socio` alcanza solo a socios.** La función que usa el admin para
editar nombre, apellido y teléfono desde la ficha toca únicamente membresías con
rol `socio`, activas o dadas de baja. El admin no edita desde el panel el perfil
de entrenadores ni de otros admins.

---

## 2. Lógica en `packages/core`

`packages/core/src/cuotas.ts`, funciones puras con tests:

- **`estadoCuota(cuotas, hoy)`** devuelve uno de:
  `{ tipo: 'vigente', hasta }` (último día cubierto) ·
  `{ tipo: 'vencida', desde, dias }` · `{ tipo: 'sin_pagos' }` ·
  `{ tipo: 'empieza', desde }`: una cuota que todavía no empezó, sin ninguna antes.
- **`periodoPropuesto(cuotas, hoy)`** devuelve `{ desde, hasta }`:
  - con cuotas previas, `desde` = el `periodo_hasta` más tardío, aunque ya haya
    pasado: la regla acordada es **desde el vencimiento anterior aunque pague
    tarde**;
  - sin cuotas, `desde = hoy`.
  - `hasta` = `desde` + 1 mes calendario. Fin de mes: 31/01 + 1 mes = 28/02 (o
    29/02); se usa el último día del mes cuando el día no existe.
- **`montoPropuesto(cuotas)`**: el monto de la cuota con `fecha_pago` más
  reciente, o vacío.
- **`hoyEnZona(zona)`**: la fecha local de una zona horaria, para que el panel
  (que puede correr en UTC) y la app calculen el mismo "hoy".

Tests: primer pago, pago atrasado (sigue desde el vencimiento), pago adelantado
(se encadena), fin de mes, el borde exacto del día de vencimiento, y el corte de
medianoche en `America/Argentina/Buenos_Aires` con el reloj en UTC.

---

## 3. Función `socio-alta`

Función de Supabase en `supabase/functions/socio-alta`, con el mismo esqueleto
que `video-subir` (`_compartido/peticion.ts` y `cors.ts`).

Entrada: `gym_id`, `email`, `nombre`, `apellido`, `telefono?`, `password`.

1. Verifica que quien llama es `admin` de `gym_id`. Si no, 403.
2. Valida el email y que la contraseña tenga al menos 8 caracteres.
3. Busca un usuario con ese email.
   - **No existe:** lo crea con la API de administración (`email_confirm:
     true`, nombre y apellido en la metadata para el trigger de `profiles`),
     carga el teléfono y crea la membresía `socio`. Si la membresía falla,
     borra el usuario recién creado: no quedan cuentas huérfanas.
   - **Existe y ya es miembro de este gym:** responde `ya_es_socio` con el
     `membership_id`, sin tocar nada.
   - **Existe en otro gym:** crea solo la membresía. No toca la contraseña ni
     el perfil. Responde `cuenta_existente`.
4. Responde `{ resultado: 'creado' | 'cuenta_existente' | 'ya_es_socio',
   membership_id }`.

La contraseña no se guarda ni se registra en ningún log.

---

## 4. Panel

### Navegación

La barra lateral suma *Escanear* y *Asistencia* a *Socios*. En el celular,
*Escanear* va primero.

### Socios (`/socios`, página existente ampliada)

- Buscador por nombre y filtros: *Todos* · *Sin cuota al día* · *Inactivos*.
  *Sin cuota al día* incluye a quien nunca pagó: para quien cobra es la misma lista.
- Cada tarjeta conserva lo que tiene hoy (rutinas, últimas sesiones, asignar) y
  suma la foto o las iniciales y una etiqueta de estado de cuota. El nombre lleva
  a la ficha.
- **Nuevo socio** (solo admin): nombre, apellido, email, teléfono opcional y
  contraseña inicial, que el panel propone al azar en un formato legible
  (palabras y números) y se puede editar. Al guardar llama a `socio-alta` y
  muestra una pantalla final con el email y la contraseña, y un botón para
  copiarlos juntos. La contraseña no se vuelve a mostrar. Si la respuesta es
  `cuenta_existente`, avisa que la persona entra con su contraseña de siempre;
  si es `ya_es_socio`, lleva a su ficha.

### Ficha del socio (`/socios/[id]`, nueva)

- **Encabezado:** foto con *Sacar foto* (`<input type="file" accept="image/*"
  capture="environment">`: en el celular abre la cámara, en la computadora deja elegir
  un archivo), nombre, teléfono, fecha de alta y estado de cuota. La foto se
  reduce en el navegador a 800 px de lado mayor en JPEG antes de subirla. El
  archivo original puede pesar hasta 20 MB —una foto de celular pasa fácil los 5—;
  lo que se sube es la versión reducida, y el límite de 5 MB es del bucket.
- **Pagos:** *Registrar pago* abre un formulario con período, monto y método
  propuestos (`periodoPropuesto`, `montoPropuesto`, último método usado), fecha
  de pago = hoy y notas. Abajo, la lista de pagos con *Borrar*, que pide
  confirmación.
- **Asistencias:** veces este mes y últimas entradas. *Registrar entrada* para el
  check-in manual.
- **Acciones del admin:** editar nombre, apellido y teléfono; *Dar de baja* /
  *Reactivar*; *Regenerar QR*. Las tres últimas piden confirmación.
- El entrenador ve la ficha sin los controles de admin, con *Registrar entrada*.

Editar el nombre o el teléfono cambia el perfil de la persona, que es único en
la plataforma. Es aceptable: es la misma persona en todos lados. Hace falta una
función `security definer` que permita al admin editar esos campos solo de
socios con membresía en su gimnasio, activa o dada de baja, porque la RLS de
`profiles` solo deja editar el propio.

### Escanear (`/escanear`, nueva)

- La cámara trasera ocupa el ancho de la pantalla, con una librería de lectura
  de QR en el navegador (la elige el plan).
- Al leer un código llama a `checkin_por_qr` y muestra una tarjeta grande:
  foto, nombre, estado de cuota en verde o rojo, y "Entrada registrada 18:40" o
  "Ya registró entrada hoy a las 17:10". El admin ve también *Registrar pago*.
- *Seguir escaneando*, o la tarjeta se cierra sola a los 5 segundos. Mientras
  está abierta no se lee otro código, y el mismo código no se vuelve a procesar
  en los 5 segundos siguientes.
- Al pie, un buscador por nombre para el check-in manual.
- La cámara solo funciona con HTTPS: para probar desde el celular contra el
  panel local hay que levantarlo con `next dev --experimental-https`.

### Asistencia (`/asistencia`, nueva)

Las entradas de un día, de la más nueva a la más vieja: hora, socio, método y
quién la registró. Por defecto, hoy; se puede ir a días anteriores. El admin
puede borrar una entrada cargada por error.

---

## 5. App del socio

### Pestaña Perfil

Quinta pestaña, después de *Progreso*, con ícono de persona. De arriba abajo:

1. **Mi QR.** Ancho de la pantalla, negro sobre blanco puro aunque la app esté
   en tema oscuro. Mientras está a la vista el brillo sube al máximo y al salir
   vuelve al anterior. Debajo: "Mostralo en el mostrador al entrar".
2. **Cuota.** "Vigente hasta el 15/11" en verde, "Vencida hace 3 días" en rojo o
   "Sin pagos registrados". Debajo, los últimos 5 pagos: período, monto, método.
3. **Asistencias.** "Viniste 9 veces este mes" y las últimas 10 entradas.
4. **Cambiar contraseña.** Pide la actual y la nueva dos veces. Comprueba la
   actual con `signInWithPassword` y después llama a `updateUser`. Requiere
   señal y lo dice.
5. **Cerrar sesión.** Se reusa `src/lib/cerrar-sesion.ts`, con su aviso de series
   sin sincronizar. El botón se muestra solo acá; sale de *Hoy*.

### Sin señal

El código QR, la cuota y los últimos pagos y asistencias se guardan en el SQLite
local que ya usa la app, junto a la caché de la rutina, y se refrescan cada vez
que se abre Perfil con conexión. Sin señal el QR se muestra igual; el resto
lleva "Actualizado el 08/10 a las 19:20".

Si el admin regenera el código, el teléfono muestra el viejo hasta volver a
tener señal; al escanearlo el panel dice "QR no válido" y el empleado hace la
entrada a mano. Se acepta: regenerar es raro y siempre hay personal.

### Membresía inactiva

En lugar del QR: "Tu membresía está inactiva. Consultá en el mostrador".

---

## 6. Errores

Al usuario nunca se le muestra un código de error.

| Dónde | Caso | Mensaje / comportamiento |
|---|---|---|
| Alta | Email inválido | "Ese email no es válido" |
| Alta | Ya es socio de este gym | "Ya es socio de este gimnasio" y lleva a su ficha |
| Alta | Falla la creación | "No se pudo crear la cuenta, probá de nuevo"; la función limpia lo creado |
| Escaneo | Código desconocido, ajeno o inactivo | "QR no válido" |
| Escaneo | Texto que no es un código del sistema | Se ignora sin interrumpir |
| Escaneo | Permiso de cámara negado | Explica cómo habilitarlo; el buscador manual sigue disponible |
| Pago | Período invertido o monto negativo | El formulario no deja guardar; la base lo rechaza por `check` |
| Foto | No es imagen o pasa de 20 MB | "Elegí una imagen de hasta 20 MB" |
| App | Cambiar contraseña sin señal | "Necesitás conexión para cambiar la contraseña" |
| App | Contraseña actual incorrecta | "La contraseña actual no es correcta" |

---

## 7. Pruebas

- **RLS** en `tests/rls/socios.test.ts`: el entrenador no puede crear ni borrar
  pagos ni cambiar estado, QR o foto de una membresía; el socio solo ve sus
  cuotas y check-ins y no puede escribir ninguno; un gimnasio no ve nada de
  otro; `checkin_por_qr` rechaza un código ajeno o inactivo, rechaza a un socio
  que llama, y no duplica la entrada del día; el bucket `fotos-socios` aísla por
  gimnasio; la función de edición de perfil no alcanza a personas de otro gym.
- **`packages/core`**: los casos de la sección 2.
- **`socio-alta`**: cuenta nueva, email existente en otro gym, ya socio, llamada
  sin rol admin y limpieza ante falla.
- **Pantallas:** cierran con `tsc --noEmit` y lint. El recorrido completo lo
  prueba el usuario: alta → foto → pago → escaneo desde el celular → Perfil en
  la app, con y sin señal.

---

## 8. Forma de trabajo

Igual que la etapa 3: rama `etapa-4` en un worktree en `.claude/worktrees/`,
Supabase aislado `gym-etapa4` (`project_id` cambiado y marcado con
`skip-worktree`), y ejecución por subagentes con revisión tras cada tarea y
revisión amplia al final.

La base de desarrollo local del usuario todavía no tiene las migraciones 0011 a
0015; esta etapa no la toca. Cuando se quiera usar, se aplican con `npx supabase
migration up`, nunca con `db:reset`.
