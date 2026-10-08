-- ---------------------------------------------------------------------------
-- Registro de entrenamiento: una fila por sesión y una fila por serie.
--
-- Una fila por serie y no un resumen: la realidad de una serie de cuatro es
-- 60, 60, 57.5, 55 —el peso baja con la fatiga— y ese detalle es el dato que
-- hace que los gráficos digan algo.
--
-- id_local es un uuid que genera el teléfono antes de sincronizar. Es la llave
-- de idempotencia: un reintento que llega dos veces choca contra el índice
-- único, y la app trata ese choque como éxito. Ver la sección 2 del diseño de
-- la etapa 3.
-- ---------------------------------------------------------------------------

create table sesiones (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id) on delete cascade,
  -- cascade como rutinas.propietario_id: el historial es del socio y se va
  -- con su membresía.
  membership_id  uuid not null references memberships(id) on delete cascade,
  -- Nulo = entrenó libre, sin rutina. set null y no restrict: borrar un día de
  -- la rutina no puede impedirse por haberlo entrenado, ni llevarse el
  -- historial. El trigger de 0013 deja pasar este null a propósito.
  rutina_dia_id  uuid references rutina_dias(id) on delete set null,
  -- La hora del teléfono, no la del servidor: la sesión puede llegar horas
  -- después, cuando vuelva la señal.
  inicio         timestamptz not null,
  fin            timestamptz,
  notas          text,
  id_local       uuid not null,
  created_at     timestamptz not null default now(),

  constraint sesiones_id_local_unico unique (id_local),
  constraint sesiones_fin_despues_de_inicio check (fin is null or fin >= inicio)
);

create index sesiones_membresia_inicio_idx on sesiones (membership_id, inicio desc);
create index sesiones_gym_idx on sesiones (gym_id);

-- Sin gym_id: llega al gimnasio a través de su sesión, igual que rutina_dias
-- llega a través de su rutina.
create table series_registradas (
  id            uuid primary key default gen_random_uuid(),
  -- cascade solo corre cuando la cascada viene de arriba (membresía o
  -- gimnasio): ningún rol puede borrar una sesión.
  sesion_id     uuid not null references sesiones(id) on delete cascade,
  -- restrict: un ejercicio con historial no se borra del catálogo, como en
  -- rutina_ejercicios.
  ejercicio_id  uuid not null references ejercicios(id) on delete restrict,
  numero_serie  integer not null check (numero_serie > 0),
  -- Cero es válido: dominadas, fondos, plancha.
  peso_kg       numeric(6,2) not null check (peso_kg >= 0),
  repeticiones  integer not null check (repeticiones > 0),
  rpe           numeric(3,1) check (rpe between 1 and 10),
  -- Esta etapa solo escribe true: tildar una serie es registrarla. Queda la
  -- columna tal como la fija el diseño general, y toda lectura de Progreso
  -- filtra por ella.
  completada    boolean not null default true,
  id_local      uuid not null,
  created_at    timestamptz not null default now(),

  constraint series_registradas_id_local_unico unique (id_local)
);

create index series_registradas_sesion_idx on series_registradas (sesion_id);
create index series_registradas_ejercicio_idx on series_registradas (ejercicio_id);
