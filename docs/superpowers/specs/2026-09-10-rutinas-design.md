# Diseño — Rutinas (etapa 2)

**Fecha:** 2026-09-10
**Estado:** aprobado, pendiente de plan de implementación
**Desarrolla:** [Diseño general](2026-08-27-gym-saas-design.md), secciones 5 (Rutinas), 8 y 12

---

## 1. Qué se construye

La etapa 2 completa el ciclo que hace vendible la demo: el entrenador arma
plantillas en el panel, el socio las ve en el catálogo de su gimnasio y las toma,
el entrenador puede además asignarle una, y el socio puede armarse la suya desde
cero con los ejercicios y videos que ya existen de la etapa 1.

Entra en el alcance:

| | |
|---|---|
| Esquema | `rutinas`, `rutina_dias`, `rutina_ejercicios` con su RLS |
| Panel | Sección Rutinas: crear, editar, duplicar, archivar y asignar plantillas |
| Panel | Rutinas activas de un socio, en la ficha mínima |
| App | Pestaña Rutinas: Mis rutinas · Catálogo · Crear (armador) |
| App | Pestaña Hoy, en modo lectura |
| Ambos | Reordenar días y ejercicios arrastrando |

Queda fuera: el registro de entrenamiento y el modo sin conexión (etapa 3), y la
ficha completa del socio con cuotas (etapa 4).

---

## 2. Base de datos

Migración `0006_rutinas.sql` para las tablas y `0007_rls_rutinas.sql` para las
políticas, siguiendo la separación que ya usan identidad y ejercicios.

### Las tres tablas

```sql
create type objetivo_rutina as enum
  ('fuerza', 'hipertrofia', 'resistencia', 'perdida_grasa', 'general');

create type nivel_rutina as enum
  ('principiante', 'intermedio', 'avanzado');

create type tipo_rutina   as enum ('plantilla', 'activa');
create type estado_rutina as enum ('activa', 'archivada');

create table rutinas (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references gyms(id) on delete cascade,
  nombre          text not null,
  descripcion     text,
  objetivo        objetivo_rutina not null default 'general',
  nivel           nivel_rutina not null default 'principiante',
  tipo            tipo_rutina not null,
  propietario_id  uuid references memberships(id) on delete cascade,
  origen_id       uuid references rutinas(id) on delete set null,
  creado_por      uuid references memberships(id) on delete set null,
  asignada_por    uuid references memberships(id) on delete set null,
  fecha_inicio    date,
  fecha_fin       date,
  estado          estado_rutina not null default 'activa',
  created_at      timestamptz not null default now(),

  constraint rutinas_propietario_segun_tipo check (
    (tipo = 'plantilla' and propietario_id is null) or
    (tipo = 'activa'    and propietario_id is not null)
  ),

  -- Una plantilla no le fue asignada a nadie: no tiene dueño a quien asignársela.
  constraint rutinas_asignada_solo_activas check (
    asignada_por is null or tipo = 'activa'
  )
);

create table rutina_dias (
  id          uuid primary key default gen_random_uuid(),
  rutina_id   uuid not null references rutinas(id) on delete cascade,
  orden       integer not null,
  nombre      text not null,
  notas       text,
  created_at  timestamptz not null default now()
);

create index rutina_dias_rutina_idx on rutina_dias (rutina_id, orden);

create table rutina_ejercicios (
  id                uuid primary key default gen_random_uuid(),
  rutina_dia_id     uuid not null references rutina_dias(id) on delete cascade,
  ejercicio_id      uuid not null references ejercicios(id) on delete restrict,
  orden             integer not null,
  series            integer not null check (series > 0),
  repeticiones      text not null,
  descanso_seg      integer check (descanso_seg >= 0),
  peso_sugerido_kg  numeric(6,2) check (peso_sugerido_kg >= 0),
  notas             text,
  created_at        timestamptz not null default now()
);

create index rutina_ejercicios_dia_idx on rutina_ejercicios (rutina_dia_id, orden);
```

`repeticiones` es texto porque los rangos (`"8-12"`, `"al fallo"`) son la forma
normal de prescribir, como ya fijaba el diseño general.

### Las hijas no llevan `gym_id`

Es una diferencia deliberada con `ejercicios`, que sí lleva la clave foránea
compuesta contra `maquinas` para no poder apuntar a una máquina de otro gimnasio.

Acá el criterio cambia porque la regla de escritura cambió. En `ejercicios`,
"quién puede escribir" es `mi_rol(gym_id)`: una sola condición, barata de repetir.
En rutinas son tres casos distintos según el tipo y el origen de la fila
(sección 3). Copiados a mano en tres tablas por tres operaciones son nueve
lugares donde la regla se puede desincronizar, y el día que se agregue un cuarto
caso hay que acertarle a los nueve.

En su lugar, la regla vive en una función y las hijas llegan al gimnasio a través
de su padre. El aislamiento no se pierde: llamar a la función con el id de una
rutina de otro gimnasio devuelve falso, así que tampoco se puede colgar un día de
una rutina ajena.

### Tomar dos veces la misma plantilla

```sql
create unique index rutinas_una_copia_activa
  on rutinas (propietario_id, origen_id)
  where tipo = 'activa' and estado = 'activa' and origen_id is not null;
```

El socio toca dos veces, o toca con mala señal y reintenta, y no termina con la
misma rutina duplicada en "Mis rutinas". El `where` deja fuera las rutinas que se
armó él (`origen_id` nulo), que no colisionan entre sí, y las archivadas: volver
a tomar el año que viene una plantilla que ya se hizo es legítimo.

Esto **no** limita a una rutina activa por socio. El diseño general es explícito
en que puede tener varias a la vez; lo que el índice impide es tener dos copias
de la *misma* plantilla.

### Columnas inmutables

Un trigger `before update` rechaza cualquier cambio de `gym_id`, `tipo`,
`propietario_id` y `asignada_por`.

RLS decide qué filas se pueden tocar, nunca qué columnas — el mismo hueco que ya
cerraste en `videos`. Sin el trigger, un socio con su propia sesión y la consola
del navegador abierta puede escribir `asignada_por = null` en la rutina que le
asignó el entrenador y sacárselo de encima, o escribir `propietario_id` y meterle
una rutina a otro socio.

Van las cuatro y no solo las dos del ataque, porque ninguna tiene un caso de uso
legítimo de modificación: reasignar es una copia nueva, archivar es `estado`, y
mudar una rutina de gimnasio o de tipo no es una operación que exista. Escrito
como inmutabilidad para todos —no como "el socio no puede"— no hay que revisarlo
cada vez que se agregue un rol.

**`origen_id` lleva una regla propia: solo puede pasar a nulo.** No puede quedar
en la lista de arriba, porque su clave foránea es `on delete set null` y esa
acción se ejecuta como un `update` de la fila que la referencia: un trigger que
rechazara todo cambio de `origen_id` haría fallar el borrado de cualquier
plantilla que alguien haya tomado. Entonces el trigger rechaza repuntarlo a otra
rutina y deja pasar el `null`.

Queda un resto conocido y menor: un socio puede limpiar `origen_id` a mano, salir
del índice único de más abajo y quedarse con dos copias de la misma plantilla en
"Mis rutinas". Se lo hace a sí mismo y el daño es cosmético.

### Dos decisiones de borrado

**Un ejercicio usado en rutinas no se borra** (`on delete restrict`). El panel
avisa "Está en 3 rutinas" en vez de vaciar en silencio un día de la rutina de
alguien.

**Borrar una plantilla no toca las copias**, que para eso son copias. `origen_id`
va `on delete set null`: se pierde de dónde salió, no la rutina. Efecto lateral
que conviene tener presente: al quedar `origen_id` nulo, esa copia sale del índice
único de más arriba, y el socio podría tomar otra plantilla igual. Es aceptable —
la plantilla original ya no existe.

---

## 3. Permisos

### La regla

| Fila | Quién puede escribirla |
|---|---|
| `tipo = 'plantilla'` | entrenador o admin del gimnasio |
| `tipo = 'activa'`, `asignada_por` nulo | solo el propietario |
| `tipo = 'activa'`, `asignada_por` cargado | el propietario, o entrenador/admin del gimnasio |

La rutina que el socio se armó solo es suya y nadie se la toca. La que le asignó
el entrenador la puede corregir el entrenador, que es la razón por la que se la
asignó.

**Leer es más ancho que escribir:** las plantillas las ve todo el gimnasio —es el
catálogo—, y una rutina activa la ven su propietario y los entrenadores y admins.
Eso es lo que habilita "ver las rutinas del socio en el panel" sin una política
nueva, incluidas las que el socio se armó solo: el entrenador las ve, no las
edita.

### Las funciones

Cinco helpers `security definer` con `set search_path = ''`, en la línea de
`mis_gyms()` y `mi_rol()`, más dos que hoy faltan:

| Función | Qué contesta |
|---|---|
| `mi_membresia(gym_id)` | El `memberships.id` del que llama en ese gimnasio |
| `puedo_ver_rutina_fila(gym_id, tipo, propietario_id)` | La regla de lectura de arriba, recibiendo las columnas en vez de un id |
| `puedo_ver_rutina(rutina_id)` | Busca la fila por id y delega en la anterior |
| `puedo_editar_rutina(rutina_id)` | La tabla de arriba |
| `puedo_ver_dia(dia_id)` / `puedo_editar_dia(dia_id)` | Resuelven el día a su rutina y delegan |

`mi_membresia()` es nueva: las políticas de la etapa 0 y 1 nunca necesitaron el id
de la membresía, solo el rol. Acá hace falta porque `propietario_id` apunta a
`memberships`, no a `auth.users`.

**La regla de lectura está partida en dos funciones, y no por prolijidad.** El
diseño natural es un único `puedo_ver_rutina(rutina_id)` que busca la fila por
id, como hacen `puedo_editar_rutina()` y el resto de los helpers de este
documento. Con esa versión, la política `rutinas_leer` funcionaba para
`select` normal pero rompía `insert ... returning`: PostgREST hace ese
`returning` en cada `.insert().select()`, y `tomar_rutina()` lo necesita para
devolver la rutina recién copiada. RETURNING exige que la fila nueva pase la
política de `select`, y esa política corre dentro de la misma sentencia que
inserta la fila —sobre el snapshot de esa sentencia, donde la fila todavía no
existe—. Una función que busca "la rutina con este id" no la encuentra ahí, así
que la política le negaba el RETURNING a su propio INSERT con `42501`. No era
un caso de borde: rompía la copia de rutinas y cualquier `.insert().select()`
del panel o la app sobre `rutinas`.

La solución es `puedo_ver_rutina_fila(gym_id, tipo, propietario_id)`: recibe
las columnas en lugar de salir a buscarlas, así que evalúa la regla igual de
bien sobre una fila vieja que sobre la fila que la sentencia está creando en
este momento. Es la que usa la política `rutinas_leer`. `puedo_ver_rutina(id)`
se mantiene, ahora como una capa fina que busca la fila por id y delega en
`puedo_ver_rutina_fila()`; la siguen usando `puedo_ver_dia()` y, a través de
ella, las políticas de `rutina_dias` y `rutina_ejercicios` —que no tienen el
problema de arriba porque miran a su padre, no a la fila que ellas mismas
insertan, y ese padre ya quedó commiteado dentro de la misma transacción antes
de que la hija se inserte. La regla en sí sigue escrita una sola vez, adentro
de `puedo_ver_rutina_fila()`.

Los dos helpers de día existen para que la política de `rutina_ejercicios` no
tenga que subir dos niveles a mano. Son de una línea y delegan; la regla sigue
escrita una sola vez.

Que sean `security definer` es lo mismo que ya hacen `mis_gyms()` y `mi_rol()`:
leen tablas con RLS desde dentro de una política, y si respetaran RLS la lectura
volvería a disparar la política. No hay recursión entre tablas: la política de
`rutina_dias` lee `rutinas`, y la de `rutinas` no lee a las hijas.

### Las políticas

`rutinas`: `select` con `puedo_ver_rutina_fila(gym_id, tipo, propietario_id)` —no
con `puedo_ver_rutina()`, por el gotcha de RETURNING explicado arriba—, y
`update` con `puedo_editar_rutina()` en `using` **y** en `with check`, explícito,
por el mismo motivo documentado en `maquinas_editar`.

El `insert` no puede usar `puedo_editar_rutina()` —la fila todavía no existe— y
además carga la coherencia de `asignada_por`, que es lo único que impide que un
socio se cree a mano una rutina "asignada" y con eso le abra la puerta al
entrenador, o le cree una rutina a otro socio:

```sql
create policy rutinas_crear on rutinas for insert with check (
  gym_id in (select mis_gyms())
  and case
    -- Plantilla: la crea el personal, y no se le asigna a nadie.
    when tipo = 'plantilla' then
      mi_rol(gym_id) in ('entrenador', 'admin') and asignada_por is null
    -- Activa sin asignar: solo para mí mismo.
    when asignada_por is null then
      propietario_id = mi_membresia(gym_id)
    -- Activa asignada: la asigna el personal, firma con su propia membresía,
    -- y a un socio que sea una membresía activa de este mismo gimnasio.
    else
      mi_rol(gym_id) in ('entrenador', 'admin')
      and asignada_por = mi_membresia(gym_id)
      and exists (
        select 1 from memberships m
        where m.id = propietario_id and m.gym_id = gym_id and m.estado = 'activo'
      )
  end
);
```

El `exists` final falta en las otras dos ramas porque ahí `propietario_id` ya
queda atado a `gym_id` por otro camino: en la plantilla es nulo, y en la
"activa sin asignar" es `mi_membresia(gym_id)`, que por construcción ya es una
membresía activa de ese gimnasio. La rama "activa asignada" es la única donde
quien inserta elige `propietario_id` libremente, sin pasar por
`mi_membresia()` — y sin el `exists`, un entrenador podía poner ahí cualquier
uuid de `memberships`, de otro gimnasio o de un socio dado de baja, y la
política lo dejaba pasar igual. El resultado era una rutina huérfana:
inaccesible para el supuesto dueño —"leer" exige que
`propietario_id = mi_membresia(gym_id)`, y eso nunca es cierto si esa membresía
es de otro gimnasio— y visible solo para el entrenador que la creó. El
`exists` cierra ese hueco exigiendo que `propietario_id` sea, en los hechos,
una membresía activa del mismo `gym_id` que la rutina.

Con esa política escrita, la coherencia de `asignada_por` no depende de que todo
el mundo pase por `tomar_rutina`. Y no puede depender de eso: el armador crea
rutinas activas desde cero con `insert` directo, sin plantilla de origen, así que
la función nunca fue la única puerta.

`rutina_dias` y `rutina_ejercicios`: `select` con el helper de lectura
correspondiente, y `insert`/`update`/`delete` con el de escritura.

Falta cubrir un caso que las tablas de la etapa 1 no tenían: **agregar a una
rutina un ejercicio que no se puede ver**. La política de `insert` de
`rutina_ejercicios` verifica también que el `ejercicio_id` sea visible para quien
llama — global, o del propio gimnasio. Sin eso, un entrenador podría meter en su
rutina un ejercicio privado de otro gimnasio adivinando el UUID, y después leer su
nombre y su video a través del `join` de la rutina.

---

## 4. Operaciones

### La copia

Tomar una plantilla crea **una copia completa** a nombre del socio, con
`origen_id` apuntando a la original. El diseño general ya justifica por qué se
copia en vez de referenciar: si el socio apuntara a la plantilla, el día que el
entrenador la corrige le cambia el entrenamiento por debajo a todos, y el socio no
podría cambiar un ejercicio porque la máquina está ocupada sin modificárselo a los
demás.

Son tres niveles de filas y no puede quedar a medias. Va en una función de
Postgres, `security invoker`:

```
tomar_rutina(p_plantilla_id uuid, p_propietario_id uuid) returns uuid
```

La usan los dos casos de uso, que se diferencian solo en la política:

- Si `p_propietario_id` es la membresía del que llama, sale una rutina con
  `asignada_por` nulo. Es el socio tomando del catálogo.
- Si es la de otro, la función exige que el que llama sea entrenador o admin del
  gimnasio y carga `asignada_por` con su membresía. Es el entrenador asignando.

Un solo camino de código para los dos: la alternativa era una función por caso de
uso, con la regla de quién puede asignarle a quién escrita dos veces. Quien
sostiene la coherencia de `asignada_por` no es esta función sino la política de
`insert` de la sección 3 — la función pasa por ella como cualquier cliente.

`security invoker` significa que el `select` de la plantilla pasa por RLS: no se
puede copiar una plantilla de otro gimnasio ni adivinando el UUID. Y al ser una
función, los `insert` de los tres niveles caen en la misma transacción.

**Itera los días en plpgsql** en vez de resolverlo con `insert … select`. Copiar
los ejercicios necesita el mapa de id viejo a id nuevo de cada día, y `returning`
no devuelve la fila de origen; la alternativa sería aparear por `orden`, que es
frágil justamente porque —a propósito, ver abajo— `orden` no es único. Son unas
pocas filas y la claridad vale más.

### Duplicar una plantilla

```
duplicar_plantilla(p_rutina_id uuid) returns uuid
```

Copia que sigue siendo plantilla, con `origen_id` **nulo**: sale una plantilla
nueva e independiente, no una versión encadenada. `origen_id` significa "de qué
plantilla salió esta rutina de socio", y ensuciarlo con el versionado del
entrenador rompe la única pregunta que esa columna sabe contestar —y de paso el
índice único de la sección 2, que se apoya en ella.

Comparte con `tomar_rutina` la maquinaria de copia; cambian los valores de
`tipo`, `propietario_id` y `origen_id`.

### Reordenar

```
reordenar_dias(p_rutina_id uuid, p_ids uuid[]) returns void
reordenar_ejercicios(p_dia_id uuid, p_ids uuid[]) returns void
```

Reciben el orden final completo y reescriben `orden` según la posición en el
arreglo, en una sola sentencia.

Por eso `orden` **no** tiene índice único: con uno, mover el tercer elemento al
primer lugar obliga a barajar valores intermedios o a hacer la restricción
diferible. Mandando el orden final entero el problema no existe.

Ambas verifican que el arreglo sea una permutación exacta de los hijos actuales.
Si no, se podrían dejar huecos en el orden mandando una lista corta, o colgarse un
día ajeno metiéndolo en la lista.

### Archivar no lleva función

Es `update rutinas set estado = 'archivada'`, y las políticas de la sección 3 ya
dicen quién puede. Una función ahí sería ceremonia.

---

## 5. `packages/core`

Un módulo `rutina.ts` con las dos piezas de lógica pura que comparten el panel y
la app, testeables con vitest sin base de datos:

- **`validarBorrador(borrador)`** — nombre no vacío, al menos un día, cada día con
  al menos un ejercicio, `series > 0`, `repeticiones` no vacía. Devuelve los
  errores en castellano, listos para mostrar.
- **`diaAMostrar(dias, ultimoDiaAbiertoId)`** — cuál de los días abre la pestaña
  Hoy: el último que el socio abrió si sigue existiendo, y si no el primero por
  `orden`.

`diaAMostrar` es la pieza que la etapa 3 va a reemplazar por dentro cuando exista
`sesiones` y "qué toca" se pueda deducir del historial. Está aislada para que ese
cambio sea de una función, no de una pantalla.

---

## 6. Panel

Sección *Rutinas* siguiendo el patrón que ya usan Ejercicios y Máquinas:
`page.tsx`, `formulario.tsx` y `acciones.ts` con server actions.

- **Lista de plantillas** del gimnasio: crear, editar, duplicar, archivar.
- **Editor en dos columnas** — los días a la izquierda, los ejercicios del día
  seleccionado a la derecha. Acá hay ancho de sobra, así que no aplica la
  restricción que manda en el teléfono.
- **Asignar**, desde la plantilla: se elige un socio de la lista de membresías del
  gimnasio y se llama a `tomar_rutina`. No hace falta RLS nueva —`memberships_leer`
  ya deja al entrenador ver las membresías de su gimnasio desde la etapa 0— ni
  adelantar la gestión de socios de la etapa 4.
- **Ficha mínima del socio**: sus rutinas activas, incluidas las que se armó solo.
  Editables si él las asignó, en lectura si no — exactamente lo que dice la RLS de
  la sección 3, sin una segunda copia de la regla en el cliente.

---

## 7. App móvil

### Pestaña Rutinas

Tres solapas:

- **Mis rutinas** — las activas, con nombre, objetivo, nivel, cuántos días y, si
  corresponde, quién se la asignó. Las archivadas detrás de un filtro.
- **Catálogo del gym** — las plantillas, filtrables por objetivo y nivel. Se abre
  una, se ven sus días y ejercicios, y **Tomar esta rutina** llama a
  `tomar_rutina`.
- **Crear** — el armador.

### El armador va en dos niveles

La pantalla de la rutina lista solo los días; tocar un día abre su propia pantalla
con los ejercicios. Se evaluaron también un scroll único con días plegables y
pestañas por día.

Dos listas cortas en vez de una larga: cada una entra en la pantalla y arrastra lo
suyo, sin listas anidadas ni auto-scroll durante el arrastre. Se resigna poder
arrastrar un ejercicio de un día a otro —hay que sacarlo y volver a agregarlo— y
cuesta más toques cargar una rutina de cuatro días. Es el precio aceptado a cambio
de que el arrastre, que es la interacción más frágil de la etapa, opere siempre
sobre una lista plana y corta.

**Agregar ejercicio no es pantalla nueva.** Abre el buscador de ejercicios de la
etapa 1, con sus filtros de grupo muscular, equipamiento y "solo lo que hay en mi
gimnasio", y su video. Se elige el ejercicio, se cargan series, repeticiones y
descanso, y se vuelve.

Editar una rutina activa reusa el mismo armador que crearla: es la misma pantalla
con datos.

### Pestaña Hoy

Muestra la rutina activa más reciente, con el selector de día y los ejercicios en
modo lectura —series, repeticiones, descanso y acceso al video—.

"Más reciente" se resuelve por `coalesce(fecha_inicio, created_at::date)`.
`fecha_inicio` es opcional —en una plantilla no significa nada, y el armador no
va a obligar al socio a poner una fecha para empezar a cargar ejercicios—, así que
ordenar solo por esa columna dejaría a la pestaña sin saber qué mostrar
justamente en el caso más común: la rutina que el socio se acaba de armar.

**El día lo elige el socio**, y el teléfono recuerda el último que abrió. Sin
`sesiones` no hay historial del cual deducir qué toca, y las alternativas eran
inventar una columna `dia_semana` que el diseño general no tiene, o llevar un
contador local que la etapa 3 tendría después que reconciliar con el registro
real. Esperar a tener el dato es más barato que fabricarlo.

**Sin botón *Empezar*.** Prometer ahí un registro que la etapa 3 todavía no tiene
es peor que no ofrecerlo.

Sin modo sin conexión: eso es etapa 3.

---

## 8. Manejo de errores

En el tono de la sección 14 del diseño general: castellano, sin códigos ni stack
traces.

| Situación | Comportamiento |
|---|---|
| Tomar una rutina que ya se tiene activa | "Ya tenés esta rutina", con acceso directo a ella. No es un rojo: el socio hizo algo razonable, y el índice único hizo su trabajo |
| Se corta la conexión al tomar o asignar | La transacción de la función no deja nada a medias. Se reintenta; si la primera sí había entrado, cae en la fila de arriba |
| Un ejercicio del catálogo se borra estando en uso | El panel dice en cuántas rutinas está y no borra |
| El entrenador abre una rutina que el socio se armó solo | El panel ya la muestra en lectura, así que no debería intentarlo. Si lo intenta, RLS la niega y el mensaje lo explica |
| Falla la validación del borrador | Los mensajes de `validarBorrador`, junto al campo que los produjo |

---

## 9. Tests

En el orden de prioridad de la sección 13 del diseño general: por costo del fallo,
no por cobertura.

1. **Aislamiento** — `tests/rls/rutinas.test.ts`: dos gimnasios con datos, y tabla
   por tabla que ninguno lee ni escribe lo del otro. Con atención a las hijas, que
   es donde es fácil que se escape porque no tienen `gym_id` propio.
2. **La tabla de escritura de la sección 3, caso por caso**, desde tres sesiones:
   el socio propietario, otro socio del mismo gimnasio y el entrenador. Tres tipos
   de fila por tres sesiones. Es la regla más fácil de romper sin darse cuenta más
   adelante, y la única defensa contra que un socio le edite la rutina a otro.
3. **Las funciones**, una aserción por invariante:
   - `tomar_rutina` copia los tres niveles completos, con su orden.
   - No copia una plantilla de otro gimnasio.
   - Asignarle a otro exige rol de entrenador o admin.
   - El índice único parcial frena la segunda copia de la misma plantilla.
   - `duplicar_plantilla` deja `origen_id` nulo.
   - `reordenar_*` rechaza un arreglo que no sea permutación exacta.
   - El trigger rechaza el `update` de las cuatro columnas inmutables, deja pasar
     `origen_id` a nulo y rechaza repuntarlo a otra rutina.
   - Borrar una plantilla tomada por un socio no falla y no toca su copia — es la
     otra mitad de la regla anterior, y la que se rompe si alguien "simplifica"
     el trigger más adelante.
   - Un socio no puede insertar una rutina activa con `asignada_por` cargado, ni
     una a nombre de otro socio.
   - No se puede agregar a una rutina un ejercicio de otro gimnasio.
4. **`packages/core`** con vitest: `validarBorrador` y `diaAMostrar`.

**Sin e2e de navegador.** La sección 13 pide como flujo de punta a punta "asignar
una rutina desde el panel hasta que aparece en la app del socio". Se cubre en la
capa de datos —una sesión de entrenador asigna, una sesión de socio lee y ve los
tres niveles—, no con Playwright y Expo. Montar esa infraestructura es un proyecto
en sí mismo y no es lo que hace vendible la demo.

---

## 10. Documentos a corregir al terminar

- **README.md** — la etapa 2 pasa a "Hecha" y el estado deja de decir que solo
  están las etapas 0 y 1.
- **Diseño general, sección 5** — anotar que las hijas no llevan `gym_id` y por
  qué, y que `asignada_por` distingue quién puede editar una rutina activa.
- **Diseño general, sección 12** — la pestaña Hoy de la etapa 2 no tiene botón
  *Empezar*; llega con la etapa 3.
