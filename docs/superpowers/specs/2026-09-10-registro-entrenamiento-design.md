# Diseño — Registro de entrenamiento (etapa 3)

**Fecha:** 2026-09-10
**Estado:** BORRADOR — brainstorming a mitad de camino. No es un diseño aprobado todavía.
**Desarrolla:** [Diseño general](2026-08-27-gym-saas-design.md), secciones 5 (Registro), 7 (Sin conexión) y 8 (Progreso)

---

## Cómo leer este documento

Las secciones 1 a 3 están **discutidas y aprobadas** en conversación. Lo que
falta está en "Qué quedó pendiente", al final. Cuando esas dos cosas se cierren,
este documento se completa, se revisa entero y recién ahí pasa a plan de
implementación.

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

Empuja las sesiones pendientes, después sus series, marca lo enviado, y refresca
la caché y las mejores marcas.

Corre en tres momentos: al volver la app a primer plano, al recuperar la red, y
como intento oportunista después de cada serie. Si falla, no pasa nada: la serie
ya está guardada local y el intento siguiente la lleva.

**El choque contra el índice único de `id_local` se trata como éxito**: significa
que un envío anterior sí había llegado y la respuesta se perdió. Cualquier otro
error deja la fila pendiente para el próximo intento.

### El corte entre lo puro y el I/O

La sección 13 del diseño general ya pide la cola de sincronización como lógica
testeable de `packages/core`.

- En **`packages/core`**: qué se manda y en qué orden, cómo se interpreta cada
  respuesta, si una serie es récord, cómo se calcula el volumen. Funciones puras,
  con vitest, sin teléfono.
- En **la app**: solo el I/O — hablar con SQLite y con la red.

Esa costura es la que hace que lo más frágil de la etapa se pueda probar.

### Estado siempre visible

"3 series sin sincronizar", como pide la sección 7. El socio nunca queda con la
duda de si se guardó.

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

### La pestaña Progreso

En orden de cuánto pesan:

1. **Récords personales** — lo mejor por ejercicio.
2. **Historial de sesiones** — cuándo entrenó, qué día de qué rutina, y abrir una
   para ver lo que hizo.
3. **Evolución por ejercicio** — peso máximo y volumen en el tiempo. Es la única
   parte con gráficos.

Las tres requieren señal, y lo dicen cuando no la hay en vez de mostrar una
pantalla vacía.

### Panel

La ficha del socio que la etapa 2 dejó mínima gana sus **últimas sesiones**:
cuándo entrenó y qué hizo. La RLS de la sección 1 ya lo permite, así que es una
consulta y una lista, no una política nueva.

**Sin gráficos del lado del panel.** Si el entrenador necesita ver evolución, eso
es una etapa aparte y no se vende como incluido acá.

---

## Qué quedó pendiente

Dos cosas, y con eso el diseño se cierra:

1. **Cómo se ven los gráficos de evolución por ejercicio.** Es la primera
   librería de gráficos del proyecto y conviene decidirla mirando maquetas, no en
   abstracto. Hay que elegir la librería (o SVG a mano) y la forma de los dos
   gráficos: peso máximo en el tiempo y volumen en el tiempo.
2. **La sección de manejo de errores y pruebas** — equivalente a las secciones 8
   y 9 del diseño de la etapa 2. Incluye qué se prueba de la cola de
   sincronización, que es lo más frágil de esta etapa.

Después de eso: auto-revisión del spec, revisión del usuario, y recién ahí el
plan de implementación.
