# Diseño — Plataforma SaaS de gimnasios

**Fecha:** 2026-08-27
**Estado:** aprobado, pendiente de plan de implementación

---

## 1. Qué es

Una plataforma que se vende a gimnasios. Cada gimnasio contratante obtiene:

- Una **app móvil** (Android e iOS) para sus socios: ver las rutinas del gym, armarse rutinas propias con los ejercicios y máquinas de ese gimnasio, mirar los videos de cada ejercicio y registrar sus entrenamientos.
- Un **panel web** para su personal: cargar ejercicios, máquinas y videos, crear rutinas y asignarlas a socios, gestionar socios y cuotas, y hacer el check-in de asistencia.

No es una app para un solo gimnasio: es multi-cliente desde el primer día.

## 2. Decisiones de contexto

Definidas antes de diseñar, condicionan todo lo demás:

| Decisión | Elección |
|---|---|
| Modelo de negocio | SaaS multi-gimnasio |
| Nivel del equipo | Un desarrollador junior; se prioriza curva de aprendizaje corta |
| Origen de los videos | Catálogo central curado + subida propia de cada gym |
| Distribución de rutinas | Catálogo abierto **y** asignación uno a uno del entrenador |
| Funciones incluidas | Registro de entrenamiento, check-in QR, socios y cuotas, notificaciones push |
| Cobro de cuotas | Solo se **registra** el estado; no se cobra dentro de la app |

## 3. Stack

| Pieza | Tecnología | Motivo |
|---|---|---|
| App móvil | Expo (React Native, TypeScript) | Un código para Android e iOS |
| Panel web | Next.js (TypeScript) | Mismo lenguaje y mismo cliente de datos que la app |
| Base de datos, auth, storage | Supabase (PostgreSQL) | Datos relacionales, y multi-tenancy resuelto con RLS |
| Videos | Cloudflare Stream | Transcodifica, sirve con calidad adaptativa y soporta URLs firmadas |
| Push | Expo Notifications | Integrado con el resto del stack |
| Errores | Sentry | App y panel |

**Alternativas descartadas.** Firebase: Firestore es NoSQL y estos datos son intensamente relacionales; consultas como "volumen total en press de banca en los últimos tres meses" son triviales en SQL y muy costosas en Firestore. Backend propio (NestJS + PostgreSQL): meses de trabajo en autenticación, permisos, subidas, deploy y backups antes de la primera pantalla.

**Salida de emergencia.** Supabase *es* PostgreSQL. Si alguna vez hay que migrar a infraestructura propia, el esquema y los datos se llevan tal cual; solo se reescribe la capa de acceso.

---

## 4. Multi-tenancy, roles y seguridad

El riesgo más grave del producto no es una caída: es que un gimnasio vea los datos de otro. Por eso el aislamiento vive en la base de datos, no en el código de las apps.

### Identidad en tres tablas

- `gyms` — el gimnasio cliente. Es el *tenant*.
- `profiles` — la persona. Una persona equivale a un registro, de forma permanente.
- `memberships` — la relación entre una persona y un gimnasio, **con su rol en ese gimnasio**.

Separar `profiles` de `memberships` es deliberado. Poner `gym_id` y `rol` directamente en el perfil sería más simple, pero rompe en dos casos que van a ocurrir: un entrenador que trabaja en dos gimnasios de la plataforma, y un socio que se cambia de gimnasio y quiere conservar su historial. Con `memberships` ambos casos funcionan sin trabajo extra; sin ella, exigen una migración justo cuando ya hay clientes en producción.

### Roles

| Rol | Permisos |
|---|---|
| `socio` | Ver rutinas, crear las propias, registrar entrenamientos, presentar su QR en el mostrador |
| `entrenador` | Lo anterior + crear rutinas del gym, asignarlas, subir ejercicios y videos |
| `admin` | Lo anterior + gestionar socios, cuotas y máquinas |
| `superadmin` | Alta de gimnasios nuevos. Vive fuera de `memberships`, como `profiles.es_superadmin` |

### Cómo se aplica el aislamiento

Una función SQL devuelve los gimnasios a los que pertenece quien consulta:

```sql
create function mis_gyms() returns setof uuid
language sql stable security definer as $$
  select gym_id from memberships
  where user_id = auth.uid() and estado = 'activo'
$$;
```

Cada tabla lleva `gym_id` y una política de Row Level Security equivalente a:

```sql
create policy tenant_aislado on <tabla>
  for select using (gym_id in (select mis_gyms()));
```

La regla vive en PostgreSQL. Si una consulta de la app olvida un filtro, o si alguien extrae la clave pública del APK y consulta directo contra la API, la base devuelve vacío igual. No hay forma de saltear la política desde el cliente.

**Contrapartida:** las políticas hay que escribirlas con cuidado y probarlas. Los tests de aislamiento son parte obligatoria de la etapa 0, no un extra.

---

## 5. Modelo de datos

Todos los identificadores son `uuid`. Todas las tablas llevan `created_at timestamptz not null default now()`.

### Identidad

**`gyms`**
`id` · `nombre` · `slug` (único) · `logo_url` · `zona_horaria` · `plan` · `activo`

**`profiles`**
`id` (= `auth.users.id`) · `nombre` · `apellido` · `telefono` · `avatar_url` · `fecha_nacimiento` · `es_superadmin` (bool, default false)

**`memberships`**
`id` · `gym_id` · `user_id` · `rol` (`socio` \| `entrenador` \| `admin`) · `estado` (`activo` \| `inactivo`) · `fecha_alta` · `codigo_qr` (texto opaco aleatorio, único)
Restricción: único por (`gym_id`, `user_id`).

`codigo_qr` es un valor aleatorio sin significado, no el `id`. Se puede revocar y regenerar sin tocar el resto de los datos.

### Ejercicios, máquinas y videos

**`maquinas`**
`id` · `gym_id` · `nombre` · `marca` · `foto_url` · `cantidad` · `notas`

Tienen tabla propia porque habilitan el filtro **"solo lo que hay en mi gimnasio"** al armar una rutina. Sin ellas ese filtro no se puede expresar.

**`videos`**
`id` · `gym_id` (nulo = global) · `stream_uid` (id en Cloudflare) · `estado` (`procesando` \| `listo` \| `error`) · `duracion_seg` · `thumbnail_url` · `subido_por` · `error_detalle`

Tabla separada, y no un campo `video_url` dentro del ejercicio, porque un video subido a Cloudflare Stream **no está disponible al terminar la subida**: tarda de segundos a minutos en transcodificar. Ese estado hay que representarlo para que el panel muestre "procesando" y la app no ofrezca un video roto. Además un ejercicio puede tener más de un video (la ejecución correcta, y cómo se regula esa máquina en particular).

**`ejercicios`**
`id` · `gym_id` (**nulo = catálogo global**) · `nombre` · `descripcion` · `instrucciones` · `grupo_muscular` · `equipamiento` · `maquina_id` (nulo) · `video_id` (nulo) · `creado_por`

`grupo_muscular`: pecho, espalda, hombros, bíceps, tríceps, cuádriceps, isquiotibiales, glúteos, gemelos, abdominales, antebrazo, cuerpo completo.
`equipamiento`: barra, mancuerna, máquina, polea, kettlebell, banda, peso corporal, otro.

**El `gym_id` nulo es el mecanismo del catálogo compartido.** Nulo significa ejercicio global, curado por la plataforma, visible para todos los gimnasios y editable por ninguno. Con valor, significa ejercicio propio de ese gimnasio. Un gym nuevo entra y ya tiene contenido útil sin filmar nada. La política queda:

```sql
using (gym_id is null or gym_id in (select mis_gyms()))
```

### Rutinas

**`rutinas`**
`id` · `gym_id` · `nombre` · `descripcion` · `objetivo` (`fuerza` \| `hipertrofia` \| `resistencia` \| `perdida_grasa` \| `general`) · `nivel` (`principiante` \| `intermedio` \| `avanzado`) · `tipo` (`plantilla` \| `activa`) · `propietario_id` · `origen_id` · `creado_por` · `asignada_por` · `fecha_inicio` · `fecha_fin` · `estado` (`activa` \| `archivada`)

Restricción: `tipo = 'plantilla'` exige `propietario_id` nulo; `tipo = 'activa'` exige `propietario_id` no nulo.

**`rutina_dias`**
`id` · `rutina_id` · `orden` · `nombre` ("Día 2 — Espalda") · `notas`

**`rutina_ejercicios`**
`id` · `rutina_dia_id` · `ejercicio_id` · `orden` · `series` · `repeticiones` (texto: `"8-12"`) · `descanso_seg` · `peso_sugerido_kg` · `notas`

`repeticiones` es texto y no número porque los rangos (`"8-12"`, `"al fallo"`) son la forma normal de prescribir.

#### Al tomar una rutina, se copia — no se referencia

Cuando un socio toma una plantilla del catálogo, se crea **una copia completa** a su nombre (`tipo = 'activa'`, `propietario_id` = su membresía), con `origen_id` apuntando a la plantilla original.

Duplica filas, y es correcto. Si el socio apuntara a la plantilla, el día que el entrenador la corrige le cambiaría el entrenamiento por debajo a todos los socios que la están usando, incluso a alguno en mitad de una serie. Y el socio no podría cambiar un ejercicio porque la máquina está ocupada sin modificar la rutina de todos los demás.

Con la copia, los tres casos de uso caen del mismo mecanismo:

| Caso | Cómo se expresa |
|---|---|
| Ver las rutinas del gym | Listar `tipo = 'plantilla'` |
| Que el entrenador te asigne una | Copia con `asignada_por` cargado |
| Armarse una propia | `tipo = 'activa'` sin `origen_id` |

**Un socio puede tener varias rutinas activas a la vez** (por ejemplo, una de fuerza y una de acondicionamiento). No se limita a una. La pestaña "Hoy" muestra la de `fecha_inicio` más reciente; el resto quedan accesibles desde "Mis rutinas". Las terminadas se pasan a `estado = 'archivada'` y conservan su historial.

### Registro de entrenamiento

**`sesiones`**
`id` · `gym_id` · `membership_id` · `rutina_dia_id` (nulo: se permite entrenar libre) · `inicio` · `fin` · `notas` · `id_local`

**`series_registradas`**
`id` · `sesion_id` · `ejercicio_id` · `numero_serie` · `peso_kg` · `repeticiones` · `rpe` (nulo) · `completada` · `id_local`

Se guarda **una fila por serie**, no un resumen. La realidad de una serie de cuatro es `60, 60, 57.5, 55`: el peso baja con la fatiga. Ese detalle es justamente el dato que hace que los gráficos digan algo.

`id_local` es un uuid generado en el teléfono antes de sincronizar. Es único, y garantiza que un reintento de envío no duplique el registro.

### Asistencia y cuotas

**`checkins`**
`id` · `gym_id` · `membership_id` · `registrado_por` · `metodo` (`qr` \| `manual`)

**`cuotas`**
`id` · `gym_id` · `membership_id` · `periodo_desde` · `periodo_hasta` · `monto` · `moneda` · `metodo` (`efectivo` \| `transferencia` \| `otro`) · `registrado_por` · `fecha_pago` · `notas`

**No existe un campo "estado: al día".** El estado se calcula: ¿hay una cuota cuyo período cubre la fecha de hoy? Guardarlo como campo obligaría a que algo lo actualice con el paso del tiempo, y el tiempo pasa sin que nadie ejecute nada; el día que esa tarea falle, medio gimnasio queda marcado como moroso sin que nadie se entere. Calculado, es imposible que quede desactualizado.

### Notificaciones

**`push_tokens`**
`id` · `user_id` · `token` · `plataforma` (`ios` \| `android`) · `ultima_vez`

**`preferencias_notificacion`**
`membership_id` · `rutina_asignada` · `cuota_por_vencer` · `record_personal` · `recordatorio_entrenamiento` · `recordatorio_dias` · `recordatorio_hora`

---

## 6. Acceso a los videos

Los videos de un gimnasio no pueden servirse desde una URL pública compartible por mensajería: el contenido propio es el diferencial que el gym está pagando.

Flujo de reproducción:

1. La app pide reproducir un video.
2. Una función de Supabase verifica que quien pide pertenece a ese gimnasio (o que el video es global).
3. Devuelve una **URL firmada de Cloudflare Stream que vence en minutos**.

Toda la integración con Cloudflare vive detrás de un módulo con tres funciones: `subir`, `estado`, `urlFirmada`. Cambiar de proveedor implica reescribir ese archivo y nada más.

**Fuera de alcance:** grabar video dentro de la app, edición de video, y subida desde el teléfono del socio. Solo se sube desde el panel web y solo por personal del gimnasio. Reduce superficie de ataque, costos y necesidad de moderar contenido.

---

## 7. Funcionamiento sin conexión

Los gimnasios suelen estar en subsuelos, con paredes de hormigón y sin WiFi útil. Si marcar una serie exige un viaje al servidor, la función es inservible exactamente donde tiene que servir.

**Escritura local primero.** Cada serie se guarda al instante en SQLite en el teléfono. Un proceso en segundo plano envía lo pendiente cuando hay conexión.

Esto normalmente preocupa porque sincronizar es difícil. Acá no lo es, por dos razones concretas:

- **Un solo dispositivo escribe una sesión dada.** Nadie registra la misma serie desde dos teléfonos.
- **Los registros se agregan, nunca se editan.**

Sin escrituras concurrentes ni modificaciones, no hay conflictos que resolver. Alcanza con una cola de pendientes que reintenta, y con `id_local` para que los reintentos no dupliquen.

**Estado siempre visible.** La app muestra "3 series sin sincronizar". El socio nunca queda con la duda de si se guardó.

**Limitación aceptada:** los videos requieren conexión. Sin señal, el socio registra sus series con normalidad pero no puede ver el video del ejercicio. Precargar los videos de la rutina activa queda como mejora futura; ahora agregaría gestión de caché y de espacio en disco por un caso de borde.

---

## 8. Funciones del socio

### Armador de rutinas

Búsqueda de ejercicios con tres filtros: grupo muscular, tipo de equipamiento, y **"solo lo que hay en mi gimnasio"**. Se toca un ejercicio, se ve el video, se agrega al día. Se definen series, repeticiones y descanso. Se reordena arrastrando.

### Registro de entrenamiento

Al abrir un ejercicio, lo primero que aparece es **la última vez**:

> `La vez pasada: 60kg × 10, 10, 9, 8`

con esos valores ya precargados. Si repitió, son cuatro toques. Registrar un entrenamiento completo tiene que costar menos de un minuto, o no lo hace nadie. Es la diferencia entre tener la función y no tenerla.

### Progreso

1. **Récords personales**, detectados automáticamente, con aviso en el momento ("🏆 Nuevo récord en sentadilla: 100kg"). Es barato de calcular y es el mejor gancho de la app.
2. **Evolución por ejercicio** — peso máximo y volumen total en el tiempo.
3. **Historial** de sesiones.

---

## 9. Check-in con QR

**El socio muestra su QR y el empleado lo escanea desde el panel.** No al revés.

La alternativa —un QR pegado en la puerta que el socio escanea— permite que alguien le saque una foto, la comparta y se registren asistencias desde la casa. Taparlo exige un código rotativo y una pantalla en la puerta.

Con el empleado escaneando, ese problema no existe porque hay una persona verificando. Y aparece el beneficio principal: al escanear, el panel muestra **foto, nombre y estado de cuota**:

> **Juan Pérez** · Cuota vigente hasta el 15/09 ✅
> **Marina López** · ⚠️ Cuota vencida hace 12 días

Control de acceso y control de cobranza pasan a ser el mismo gesto.

Como hay verificación humana contra la foto, **el QR puede ser estático**: no hace falta rotación ni criptografía.

**Premisa confirmada con el cliente:** siempre hay personal en el mostrador. Los gimnasios 24 horas sin personal nocturno necesitarían el modo con código rotativo, que queda fuera de la primera versión.

---

## 10. Notificaciones push

Cuatro tipos, y ninguno más:

| Disparador | Mensaje |
|---|---|
| El entrenador asigna una rutina | "Martín te asignó una rutina nueva" |
| 3 días antes del vencimiento de la cuota | "Tu cuota vence el 15/09" |
| Récord personal | "🏆 Nuevo récord en sentadilla: 100kg" |
| Recordatorio de entrenamiento | Opcional, con día y hora elegidos por el socio |

**Los cuatro se apagan por separado desde la app.** No es cortesía: una notificación no deseada no se silencia, provoca una desinstalación, y una desinstalación no se revierte.

Implementación: tokens en `push_tokens`, envío desde funciones de Supabase contra la API de Expo, y el aviso de vencimiento disparado por una tarea diaria con `pg_cron`.

---

## 11. Estructura del repositorio

```
gym/
├── apps/
│   ├── movil/          Expo — app del socio
│   └── panel/          Next.js — panel del empleado
├── packages/
│   └── core/           tipos, cliente de datos y lógica compartida
└── supabase/
    ├── migrations/     esquema SQL versionado
    └── functions/      envío de push, firma de URLs de video
```

`packages/core` contiene lo que no es de pantalla y usan las dos apps: tipos de la base, cliente de Supabase, detección de récords, cálculo de vigencia de cuota, y la cola de sincronización.

**Generación de tipos.** Supabase genera los tipos de TypeScript leyendo la base. Al renombrar una columna y regenerar, el compilador marca cada punto roto en ambas apps de inmediato. Sin eso, un cambio de esquema se descubre en producción.

Se usan *workspaces* de npm. Sin herramientas adicionales.

---

## 12. Pantallas

### App del socio — cinco pestañas

| Pestaña | Contenido |
|---|---|
| **Hoy** | Qué toca entrenar y un botón grande: *Empezar*. Pantalla de inicio. |
| **Rutinas** | Las mías · Catálogo del gym · Crear nueva |
| **Ejercicios** | Buscador con videos; filtros por músculo, equipamiento y disponibilidad en el gym |
| **Progreso** | Récords, gráficos por ejercicio, historial |
| **Perfil** | Mi QR, estado de cuota, preferencias de notificación |

### Panel del empleado — cinco secciones

Socios (alta y ficha completa) · **Escanear** (diseñada para usar desde el celular, no desde la computadora) · Rutinas · Ejercicios, máquinas y videos · Asistencia.

### Superadmin

Una pantalla de alta de gimnasios, de uso interno. Funcional, sin trabajo de diseño; ningún cliente la ve.

---

## 13. Pruebas

Priorizadas por costo del fallo, no por cobertura:

1. **Aislamiento entre gimnasios (RLS).** La prioridad máxima. Un test que crea dos gimnasios con datos y verifica, tabla por tabla, que ninguno accede a los datos del otro. Corre en cada cambio.
2. **Lógica de `packages/core`.** Detección de récords, vigencia de cuotas, cola de sincronización. Son funciones puras, rápidas de probar, y donde los errores son silenciosos.
3. **Dos flujos de punta a punta:** registrar un entrenamiento completo, y asignar una rutina desde el panel hasta que aparece en la app del socio.

No se persigue cobertura total.

---

## 14. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Sin conexión | La app sigue funcionando; muestra "3 series sin sincronizar" |
| Falla la subida de un video | Queda marcado en el panel con botón de reintentar. Nunca desaparece en silencio |
| Video en transcodificación | El panel muestra "procesando"; la app no lo ofrece hasta `estado = 'listo'` |
| Error inesperado | Se reporta a Sentry con contexto; al usuario le aparece un mensaje en castellano |

Al socio nunca se le muestra un stack trace ni un código de error.

---

## 15. Etapas de entrega

Cada etapa termina en algo mostrable y usable.

| # | Etapa | Resultado |
|---|---|---|
| **0** | Cimientos | Esquema completo, login, roles, RLS y tests de aislamiento. Sin pantallas |
| **1** | Ejercicios y videos | El empleado sube un video; el socio lo ve. Catálogo global + propio del gym |
| **2** | Rutinas | Catálogo, armador propio y asignación del entrenador. **Primera demo vendible** |
| **3** | Entrenar | Registro serie por serie sin conexión, récords y gráficos |
| **4** | Administración | Socios, cuotas y check-in con QR |
| **5** | Publicación | Notificaciones push y publicación en Play Store y App Store |

**Orden.** Las etapas 1 y 2 tienen dependencia real: una rutina se compone de ejercicios. De ahí en adelante es elección: primero lo del socio (2 y 3), después lo del gimnasio (4), porque valida antes si la propuesta sirve.

**Al terminar la etapa 2 hay una demo vendible**: el ciclo completo de subir videos, armar una rutina, asignarla y verla en el teléfono. Es el momento de sentarse con un gimnasio real.

**Flexibilidad.** Si el primer gimnasio se interesa más por la parte administrativa, la etapa 4 puede adelantarse: solo depende de la etapa 0.

### Advertencias prácticas

**Cuentas de desarrollador.** Apple cuesta USD 99 por año, Google USD 25 una sola vez. El trámite de Apple puede tardar días o semanas si exige verificación de identidad o registro como empresa. Hay que iniciarlo al comienzo del proyecto y probar en dispositivos reales desde la etapa 1.

**Plazos.** No se estiman en semanas: siendo el primer proyecto de este tamaño del desarrollador, cualquier estimación sería falsa. Lo que sí aplica: **la etapa 0 es la más lenta en relación a lo visible** — pasan días sin una sola pantalla, y es lo esperable.

**Costos.** Hasta la etapa 3, prácticamente cero: las capas gratuitas de Supabase y Cloudflare alcanzan para desarrollar y para los primeros gimnasios. El gasto real aparece con volumen de video, momento en el que ya debería haber ingresos.

---

## 16. Fuera de alcance

Descartado a propósito, con el motivo:

| Descartado | Motivo |
|---|---|
| Cobro de cuotas dentro de la app | Pasarela, webhooks, reembolsos y posible comisión de las tiendas. El registro manual cubre el grueso del valor |
| Periodización y progresión automática de cargas | Suena bien, no es necesario para que la app funcione. Se agrega sabiendo qué pide el usuario real |
| Compartir rutinas entre gimnasios | Es contenido propio de cada cliente |
| Grabar o editar video en la app | Superficie y moderación de contenido |
| Descarga de videos para uso sin conexión | Gestión de caché y de espacio en disco por un caso de borde |
| Cálculo de calorías | Es estimación disfrazada de dato |
| Integración con relojes, Google Fit y Apple Health | Mucha superficie, poco valor inicial |
| Fotos de progreso corporal | Moderación y privacidad |
| QR rotativo para gimnasios sin personal | La premisa confirmada es que siempre hay alguien en el mostrador |

---

## 17. Riesgos

| Riesgo | Mitigación |
|---|---|
| Fuga de datos entre gimnasios | RLS en la base + tests de aislamiento obligatorios en cada cambio |
| Filtración de videos de un gimnasio | URLs firmadas de vida corta, nunca URLs públicas |
| Sin señal dentro del gimnasio | Escritura local primero y cola de sincronización |
| Un gimnasio nuevo arranca con la app vacía | Catálogo global de ejercicios precargado |
| Demora en la aprobación de Apple | Iniciar el trámite de cuentas al comienzo, probar en dispositivo real desde la etapa 1 |
| Costo de video sin control al crecer | Cloudflare detrás de un módulo propio, reemplazable sin tocar el resto |

---

## 18. Próximo paso

Plan de implementación detallado de **las etapas 0 y 1** únicamente. Planificar hasta la etapa 5 sería inventar: para entonces habrá información que hoy no existe.
