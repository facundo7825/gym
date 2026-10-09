# Diseño — Registro de entrenamiento (etapa 3)

**Fecha:** 2026-09-10
**Estado:** Implementado. Plan: [`2026-10-08-registro-entrenamiento.md`](../plans/2026-10-08-registro-entrenamiento.md).
**Desarrolla:** [Diseño general](2026-08-27-gym-saas-design.md), secciones 5 (Registro), 7 (Sin conexión) y 8 (Progreso)

---

## 0. Alcance decidido

La etapa 3 entera en un solo ciclo: registro serie por serie, modo sin conexión
y progreso.

Se descartó explícitamente hacer primero la versión con señal y agregar lo
offline después: el esquema del diseño general ya está pensado para offline
—`id_local` existe para eso— y meterlo en un segundo ciclo obliga a reescribir
todo el camino de escritura.

Entra en el alcance:

| | |
|---|---|
| Esquema | `sesiones`, `series_registradas` con su RLS |
| App | Pantalla de sesión: registrar serie por serie |
| App | Entrenar libre, sin rutina |
| App | Récords personales con aviso en el momento |
| App | Historial de sesiones |
| App | Evolución por ejercicio, con gráficos |
| App | Todo lo anterior funcionando sin señal, salvo lo indicado |
| Panel | Últimas sesiones del socio en su ficha |

Queda fuera: cuotas y check-in con QR (etapa 4), notificaciones push (etapa 5),
editar una serie ya registrada (ver sección 1), y gráficos del lado del panel.

---

## 1. Esquema y RLS

### Las dos tablas

Tal como las fija el diseño general, sección 5:

**`sesiones`** — `gym_id` · `membership_id` · `rutina_dia_id` (nulo: se permite
entrenar libre) · `inicio` · `fin` · `notas` · `id_local`

**`series_registradas`** — `sesion_id` · `ejercicio_id` · `numero_serie` ·
`peso_kg` · `repeticiones` · `rpe` (nulo) · `completada` · `id_local`

Una fila por serie y no un resumen: la realidad de una serie de cuatro es
`60, 60, 57.5, 55` —el peso baja con la fatiga— y ese detalle es justamente el
dato que hace que los gráficos digan algo.

### `series_registradas` no lleva `gym_id`

Llega al gimnasio a través de su sesión, igual que `rutina_dias` y
`rutina_ejercicios` llegan a través de su rutina. Es el mismo criterio que la
etapa 2 y por el mismo motivo: la regla vive en una función y las hijas la
consultan, en vez de copiarse por tabla y por operación.

### La función de lectura recibe columnas, no un id

Esto es una lección que la etapa 2 pagó con una ronda de arreglo, y acá se
aplica desde el día uno.

`insert … returning` falla con `42501` si la política de `select` resuelve la
fila **buscándola por id**: esa búsqueda corre con el snapshot de la sentencia y
no ve la fila que la sentencia está insertando. La app va a insertar sesiones y
necesitar el id de vuelta, así que no es un caso teórico.

Entonces: `puedo_ver_sesion_fila(gym_id, membership_id)` recibe las columnas y es
la que usa la política de `select` de `sesiones`. Una `puedo_ver_sesion(id)`
delega en ella para la política de `series_registradas`, que mira al padre y no
tiene el problema.

Ver `supabase/migrations/0007_rls_rutinas.sql` para el precedente y su comentario.

### Claves foráneas

`series_registradas.ejercicio_id` es `on delete restrict`, como
`rutina_ejercicios.ejercicio_id` en `0006_rutinas.sql`: un ejercicio con historial
no se borra del catálogo. `sesiones.membership_id` es `on delete cascade`, como
`rutinas.propietario_id`: el historial es del socio y se va con su membresía.
`series_registradas.sesion_id` también es `cascade`, aunque ningún rol pueda
borrar una sesión: solo corre cuando la cascada viene de arriba.

### Valores imposibles, frenados también en la base

`peso_kg >= 0`, `repeticiones > 0` y `rpe` entre 1 y 10 cuando no es nulo, como
`check`. La app los valida antes con `validarSerie` (sección 5); el `check` está
para lo que se escape, y su rechazo es uno de los permanentes de la cola.

### Append-only por construcción

Es la decisión que más peso carga de toda la etapa.

Todo el argumento de por qué sincronizar acá es fácil —sección 7 del diseño
general— se apoya en que **los registros se agregan y nunca se editan**. Si eso
queda como convención, el día que alguien agregue un `update` la cola de
sincronización se convierte en un problema distribuido sin que nadie lo note.

Por lo tanto **`series_registradas` no tiene política de `update` ni de
`delete`**. No están restringidas: no existen. La invariante se sostiene en la
base, no en la disciplina.

`sesiones` necesita una excepción acotada: al terminar de entrenar hay que
escribir `fin`. Se permite el `update` de **`fin` y `notas` únicamente**, sobre
la sesión propia, con el resto de las columnas inmutables por trigger — el mismo
mecanismo de `0008_rutinas_inmutables.sql` y de los grants por columna de
`videos`.

Consecuencia de interfaz, aceptada: **no se puede editar una serie ya
registrada.** Si el socio se equivoca, registra la serie correcta; el historial
muestra lo que pasó, que es para lo que sirve.

### Quién ve y quién escribe

| | |
|---|---|
| **Lee** | El socio lo suyo; entrenadores y admins, el de cualquier socio de su gimnasio |
| **Escribe** | Solo el propio socio. Nunca el personal |

Escribir es más angosto que leer, al revés de lo que suele pasar. Un entrenador
que pudiera registrar series a nombre de otro ensucia el único dato que la app
promete que es verdad.

Que el personal lea es lo que habilita las últimas sesiones en la ficha del
socio sin una política nueva.

### `id_local` es la llave de idempotencia

Un uuid generado en el teléfono antes de sincronizar, con índice único. Un
reintento que llega dos veces choca contra el índice; el cliente trata **ese
choque puntual como éxito**, no como error — el mismo patrón con el que la etapa
2 resolvió "Ya tenés esta rutina".

---

## 2. La base local y la sincronización

**Enfoque elegido: `expo-sqlite` con una cola propia.**

Se evaluaron y descartaron:

- **WatermelonDB** — trae su propio modelo de datos y su propio protocolo de
  sync, que hay que implementar igual del lado de Supabase, y está diseñado para
  sync bidireccional con resolución de conflictos: exactamente el problema que
  este proyecto no tiene. Se paga la complejidad de un caso general para un caso
  que ya se sabe trivial.
- **PowerSync o similar** — resuelve todo, pero es un servicio externo con costo,
  y el diseño general fija que hasta la etapa 3 el gasto es cero.

La razón de fondo para la cola propia está en la sección 7 del diseño general:
**un solo dispositivo escribe una sesión dada, y los registros se agregan y nunca
se editan**. Sin escrituras concurrentes ni modificaciones no hay conflictos que
resolver, así que sincronizar es una cola con reintentos, no un problema
distribuido.

### Tres cosas viven en el teléfono, y son de naturalezas distintas

**La rutina activa, como caché de lectura.** Se guarda como documento JSON, no
como espejo relacional del servidor: es una caché que se lee entera para mostrar
el día, y replicar las tres tablas en SQLite duplicaría el esquema y sus
migraciones a cambio de nada. Se refresca cuando hay señal.

**La cola de escritura**: sesiones y series pendientes, cada una con su
`id_local` y su estado. Es lo único que no se puede perder.

**Las mejores marcas por ejercicio.** Una fila por ejercicio con el mejor peso y
el mejor volumen.

> Esta tercera pieza resuelve una consecuencia de una decisión de alcance. Se
> decidió cachear **solo la rutina activa** y no el historial. Sin nada local no
> hay forma de detectar un récord sin señal — y el aviso de récord es una de las
> funciones elegidas. Pero para detectarlo no hace falta el historial entero:
> alcanza con el máximo anterior, que es una fila por ejercicio y pesa nada.

### Limitación aceptada y anotada

Con solo la rutina cacheada, **"La vez pasada: 60kg × 10, 10, 9, 8" funciona con
señal y no funciona sin ella.** El diseño general (sección 8) presenta esa
precarga como lo que hace que registrar cueste cuatro toques en vez de un minuto,
así que la limitación es real y hay que tenerla presente.

Si más adelante se decide que tiene que andar sin señal, es agregar una tabla
local más —la última serie por ejercicio—, no rehacer el enfoque.

Los videos siguen requiriendo señal, como ya fijaba el diseño general.

### La sincronización es una función y un orden

Empuja las sesiones pendientes, después sus series, después el `fin` de las
sesiones terminadas, marca lo enviado, y refresca la caché y las mejores marcas.

Escribir `fin` es el único `update` que viaja en la cola, y es seguro reintentarlo:
pone un valor fijo, no suma ni depende de lo que haya.

Corre en tres momentos: al volver la app a primer plano, al recuperar la red, y
como intento oportunista después de cada serie. Si falla, no pasa nada: la serie
ya está guardada local y el intento siguiente la lleva.

**El choque contra el índice único de `id_local` se trata como éxito**: significa
que un envío anterior sí había llegado y la respuesta se perdió.

El resto de los errores se clasifica en dos:

- **Transitorio** —sin red, timeout, 5xx—: la fila queda pendiente para el próximo
  intento.
- **Permanente** —RLS, clave foránea, `check`—: la fila queda **rechazada**. No se
  reintenta, no se borra, y el aviso de estado lo dice. Si la rechazada es una
  sesión, sus series quedan frenadas con ella: no tienen a qué colgarse.

Una excepción: si la base rechaza una sesión colgada de un día de rutina que ya no
existe, se reenvía una vez como libre, sin día. Imita el `on delete set null` de
`rutina_dia_id`: borrar un día no se lleva el historial, y la cola tampoco.

La cola usa todas las membresías del socio, activas o no, y no solo las activas:
así lo que quedó de una membresía dada de baja se envía, la base lo rechaza y el
aviso lo dice, en vez de desaparecer en silencio.

Se descartó reintentar siempre —con un rechazo permanente el contador no baja
nunca y el socio no sabe por qué— y descartar la fila, que rompe lo único que la
cola promete.

### Las dos lecturas que alimentan el teléfono

- **Las mejores marcas** salen de una vista `mejores_marcas` con
  `security_invoker`, para que la RLS de `sesiones` siga decidiendo qué filas
  entran: por membresía y ejercicio, el mayor peso y el mayor volumen de una
  sesión. La misma vista alimenta la lista de récords de Progreso.
- **"La vez pasada"** sale de una función `ultima_vez(ejercicio_ids)`,
  `security invoker`: las series de la sesión más reciente de quien llama en la
  que aparece cada ejercicio. Una consulta por pantalla y no una por ejercicio.

Al refrescar, las marcas locales se **fusionan** con las del servidor —gana el
máximo— en vez de reemplazarse: el servidor todavía no conoce lo que está en la
cola, y un récord recién hecho sin señal no puede desaparecer al sincronizar a
medias.

Sin señal, la pantalla de sesión precarga con lo que dice la rutina: la cantidad
de series, las repeticiones —el primer número de un rango como "8-12"— y el peso
sugerido si lo hay.

### El corte entre lo puro y el I/O

La sección 13 del diseño general ya pide la cola de sincronización como lógica
testeable de `packages/core`.

- En **`packages/core`**: qué se manda y en qué orden, cómo se clasifica cada
  respuesta, si una serie es récord, cómo se calcula el volumen. Funciones puras,
  con vitest, sin teléfono.
- En **la app**: solo el I/O — hablar con SQLite y con la red.

Esa costura es la que hace que lo más frágil de la etapa se pueda probar.

### Estado siempre visible

"3 series sin sincronizar", como pide la sección 7 del diseño general, y "1 serie
no se pudo guardar" cuando hay rechazadas. El socio nunca queda con la duda de si
se guardó.

La cola guarda el `membership_id` de cada fila y nunca empuja filas de otra
membresía, aunque en el teléfono haya iniciado sesión otra persona.

---

## 3. Pantallas

### La pantalla de sesión va en acordeón por ejercicio

Se evaluaron tres formas con maquetas: acordeón por ejercicio, un ejercicio por
pantalla, y planilla tipo tabla.

**Elegida: acordeón.** Todo el día en una pantalla; el ejercicio abierto muestra
sus series precargadas con los valores de la vez pasada, y los demás quedan
plegados con su cuenta (`0/3`). Se ve el día entero y cuánto falta.

Se resigna el tamaño de control de la opción "un ejercicio por pantalla", que era
mayor, y hay que scrollear con seis ejercicios.

Las tres alternativas compartían: valores precargados con los de la vez pasada,
aviso de sincronización pendiente siempre visible, y ninguna exige señal.

La condición que el diseño general pone y que esta pantalla tiene que cumplir: si
el socio repitió lo de la vez pasada, registrar el ejercicio son **cuatro
toques**.

### De dónde se llega

Dos entradas: el botón **Empezar** que la etapa 2 dejó a propósito sin construir
en la pestaña Hoy, y **entrenar libre**.

**Entrenar libre** reusa la misma pantalla de sesión, vacía, y se agregan
ejercicios con el buscador de la etapa 1.

> Esa sería la **tercera** pantalla que reusa el buscador de ejercicios —la
> pestaña Ejercicios, el armador de la etapa 2, y esta—. Ahí sí conviene
> extraerlo a un componente compartido en vez de copiarlo una vez más.

**Terminar** escribe `fin` y cierra. Si quedaron series sin marcar, se avisa antes
en vez de descartarlas en silencio.

### El aviso de récord

Aparece en el momento de marcar la serie, contra las mejores marcas locales. Es
lo único de Progreso que funciona sin señal.

Superar la marca es récord; igualarla no. **La primera vez que se hace un
ejercicio no es récord**: sin nada contra qué comparar, avisarlo en cada ejercicio
nuevo sería ruido.

Hay dos récords. **De peso**, que se evalúa en cada serie. **De volumen**, que se
evalúa sobre lo acumulado del ejercicio en la sesión y se avisa en la serie que
cruza la marca —una sola vez por sesión, porque las siguientes ya parten de
arriba—. Si una serie bate los dos, se avisa el de peso, que es el que se entiende
sin explicación.

Las marcas del aviso son por membresía: las del gimnasio donde se entrena.
Progreso y el gráfico juntan todas las membresías del socio, así que alguien que
entrena en dos gimnasios puede ver un punto dorado que el aviso no anunció. Se
acepta: es un caso raro, y el aviso local no puede conocer el otro gimnasio sin
señal.

### Marcar una serie es registrarla

Tocar el tilde de una serie es lo que la inserta en la cola, con `completada =
true`. Las filas precargadas que no se tildan no existen para la base. Por eso
**Terminar** avisa si quedaron filas sin tildar: después de confirmar no se
registran, y el socio lo decidió.

`completada` queda en el esquema tal como lo fija el diseño general, con `true`
por defecto. Esta etapa no escribe `false`, y todas las lecturas de Progreso
filtran por `completada`, así que el día que exista no ensucia los gráficos.

Al retomar una sesión, los ejercicios que ya tienen series en ella no muestran
"La vez pasada" y se precargan por la rutina: una vez sincronizada, la sesión
abierta sería su propia "vez pasada".

### La pestaña Progreso

En orden de cuánto pesan:

1. **Récords personales** — lo mejor por ejercicio.
2. **Historial de sesiones** — cuándo entrenó, qué día de qué rutina, y abrir una
   para ver lo que hizo.
3. **Evolución por ejercicio** — peso máximo y volumen en el tiempo. Es la única
   parte con gráficos; ver sección 4.

Las tres requieren señal, y lo dicen cuando no la hay en vez de mostrar una
pantalla vacía.

### Panel

La ficha del socio que la etapa 2 dejó mínima gana sus **últimas sesiones**:
cuándo entrenó y qué hizo. La RLS de la sección 1 ya lo permite, así que es una
consulta y una lista, no una política nueva.

**Sin gráficos del lado del panel.** Si el entrenador necesita ver evolución, eso
es una etapa aparte y no se vende como incluido acá.

---

## 4. Evolución por ejercicio

### Forma

Se evaluaron tres con maquetas: dos gráficos apilados, uno solo con selector, y
uno combinado con línea de peso y barras de volumen.

**Elegida: un gráfico con selector.** Un gráfico de línea grande, con un selector
**Peso máximo · Volumen** arriba, y sobre el selector el resumen con las dos
mejores marcas. Se llega tocando un ejercicio en Progreso.

Se resigna ver peso y volumen a la vez —el caso en que el peso se estanca pero el
volumen sigue subiendo queda detrás de un toque— a cambio de un gráfico más alto
y más legible. El combinado se descartó por mezclar dos escalas en un dibujo.

### Qué es cada punto

Una sesión en la que el ejercicio tiene al menos una serie completada.

- **Peso máximo:** el mayor `peso_kg` entre sus series completadas.
- **Volumen:** la suma de `peso_kg × repeticiones` de sus series completadas.

Las series no marcadas como completadas no cuentan para nada.

**Récords en dorado.** En cada vista se marca el punto que supera a todos los
anteriores, con el mismo criterio que el aviso de récord de la sección 3 —incluido
que el primero no cuenta—, para que el gráfico y el aviso no se contradigan nunca.

**Eje horizontal por sesión, no por fecha.** Los puntos van equidistantes; abajo,
la primera fecha, la del medio y la última. Con pocos puntos se lee mejor, y un
hueco de vacaciones no aplasta el resto.

### Lo que se dejó afuera a propósito

- **Selector de período** (3 meses · 6 meses · Todo): siempre se ve todo. En los
  primeros meses nadie tiene historial que filtrar. Agregarlo después es filtrar
  por fecha antes de dibujar: una función más en core, sin cambiar el diseño.
- **Tocar un punto para ver su valor:** el gráfico es un dibujo quieto. La
  tendencia la da el gráfico, la marca el resumen, y el detalle de un día el
  historial. Sin gestos que manejar, es lo más fácil de dejar bien dibujando a
  mano.

### Librería: `react-native-svg`, dibujado a mano

Es la primera dependencia de gráficos del proyecto, y la única que suma Progreso.
Las otras dependencias nuevas de la etapa son de la sección 2: `expo-sqlite` para
la base local, `expo-network` para enterarse de que volvió la red, y `expo-crypto`
para generar los `id_local`.

Se descartaron **`react-native-gifted-charts`** —una dependencia grande para un
solo gráfico, difícil de sacar de su estilo, y con la lógica adentro de la
librería, donde no se puede probar— y **`victory-native`**, que suma
`@shopify/react-native-skia`, un motor de dibujo entero, para una línea.

Dibujarlo a mano permite el mismo corte que la sección 2:

- En **`packages/core`**, con vitest:
  - `evolucionPorSesion(series)` agrupa filas por sesión y devuelve
    `{ fecha, pesoMax, volumen }`.
  - `marcarRecords(valores)` dice qué puntos son récord.
  - `geometriaGrafico(valores, ancho, alto)` devuelve las coordenadas de los
    puntos y las guías.
- En **la app**: una consulta que trae las series completadas del ejercicio con la
  fecha de su sesión, y un componente `GraficoEvolucion` que solo traduce esa
  geometría a `react-native-svg`.

La agregación se hace en el cliente y no con una función de la base: un año
entrenando tres veces por semana son unas 600 filas, y así queda como lógica pura.

### Casos borde

| | |
|---|---|
| Sin sesiones del ejercicio | "Todavía no registraste este ejercicio" |
| Una sola sesión | El punto solo, y "Con una sesión más aparece la evolución" |
| Todos los valores iguales | `geometriaGrafico` no divide por cero; tiene su test |
| Sin señal | El mismo aviso que el resto de Progreso |

---

## 5. Manejo de errores

En el tono de la sección 14 del diseño general: castellano, sin códigos ni stack
traces.

| Situación | Comportamiento |
|---|---|
| Sin señal al registrar | No es un error. La serie se guarda local y el aviso dice "3 series sin sincronizar" |
| Reintento duplicado —una respuesta que se perdió— | El choque contra `id_local` es éxito y la fila sale de la cola |
| Rechazo permanente del servidor | La fila queda rechazada: guardada, sin reintento, y el aviso dice "1 serie no se pudo guardar". Una sesión rechazada frena sus series |
| Terminar sin señal | El `fin` va a la cola detrás de las series. Pone un valor fijo, así que reintentarlo no hace daño |
| La app se cierra en medio de una sesión | Al volver, si hay una sesión local sin `fin`, se ofrece **Seguir entrenando** o **Terminar**. Si nunca se termina, el historial la muestra como "sin terminar" |
| Cerrar sesión con pendientes | "Tenés 3 series sin sincronizar; si cerrás sesión se pierden", con confirmación. Y la cola nunca empuja filas de otra membresía |
| Valores imposibles —peso negativo, 0 repeticiones— | `validarSerie` los frena junto al campo; el `check` de la base, lo que se escape |
| Borrar del catálogo un ejercicio con series registradas | La clave foránea `restrict` lo impide. El panel hoy no ofrece borrar ejercicios —el aviso "en cuántas rutinas está" de la etapa 2 nunca se construyó—, así que no hay mensaje que cambiar: la protección es la base |
| Terminar con series sin marcar | Se avisa antes, en vez de descartarlas en silencio (sección 3) |
| Progreso sin señal | "Necesitás conexión para ver tu progreso", nunca una pantalla vacía. El aviso de récord sí funciona |

---

## 6. Tests

En el orden de prioridad de la sección 13 del diseño general: por costo del fallo,
no por cobertura.

1. **Aislamiento** — `tests/rls/registro.test.ts`: dos gimnasios con datos, y
   ninguno lee ni escribe `sesiones` ni `series_registradas` del otro. Con
   atención a `series_registradas`, que no tiene `gym_id` propio.
2. **La tabla de escritura de la sección 1, caso por caso**, desde tres sesiones:
   el socio dueño, otro socio del mismo gimnasio y el entrenador.
   - El entrenador no inserta nada, ni sesiones ni series.
   - Sobre la sesión propia se actualizan `fin` y `notas`; el trigger rechaza
     cualquier otra columna.
   - **`update` y `delete` sobre `series_registradas`.** Sin política, Postgres no
     da error: afecta cero filas. El test afirma que **la fila sigue igual**, no
     que haya un error. Es el test más fácil de escribir mal de la etapa, y el
     que sostiene la invariante de la que depende la sincronización.
3. **Regresión de la lección de la etapa 2:** `insert … returning` sobre
   `sesiones` funciona desde la sesión del socio.
4. **`id_local`:** el segundo insert con el mismo valor da `23505`, que es el
   código que la cola interpreta como éxito. Y los `check` de valores imposibles.
5. **`packages/core`** con vitest. El bloque más grande, porque es donde vive lo
   frágil:
   - **Cola:** el orden de envío —sesión, series, `fin`—; la clasificación de cada
     respuesta —éxito, duplicado como éxito, transitorio pendiente, permanente
     rechazado—; las series de una sesión rechazada quedan frenadas; nunca se
     empujan filas de otra membresía.
   - **Récords:** superar es récord, igualar no, la primera vez no.
   - `validarSerie`, `evolucionPorSesion`, `marcarRecords` y `geometriaGrafico`,
     incluido el caso de valores todos iguales.
6. **La app** cierra con `tsc --noEmit` y lint, como en la etapa 2. La
   verificación a mano queda para el usuario, con un recorrido concreto: modo
   avión → registrar tres series → cerrar la app a la fuerza → abrir y seguir →
   sacar el modo avión → el contador baja a cero → la sesión aparece en la ficha
   del socio en el panel.

**Sin e2e de navegador**, por el mismo motivo que la etapa 2: montar Playwright y
Expo es un proyecto en sí mismo.

---

## 7. Documentos a corregir al terminar

- **README.md** — la etapa 3 pasa a "Hecha".
- **Diseño general, sección 7** — anotar que la cola distingue errores
  transitorios de permanentes y que lo rechazado se guarda y se avisa.
- **Diseño general, sección 8** — anotar que "La vez pasada" precargada requiere
  señal (sección 2 de este documento).
- **Diseño general, sección 12** — la pestaña Hoy ya tiene el botón *Empezar*.
