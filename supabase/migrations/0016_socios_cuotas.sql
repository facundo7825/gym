-- ---------------------------------------------------------------------------
-- Socios, cuotas y asistencia (etapa 4).
--
-- No hay ninguna columna "al día". El estado de la cuota se calcula —¿hay una
-- cuota cuyo período cubre hoy?— con estadoCuota de @gym/core. Guardarlo
-- obligaría a que algo lo actualice con el paso del tiempo, y el tiempo pasa
-- sin que nadie ejecute nada. Ver la sección 5 del diseño general.
-- ---------------------------------------------------------------------------

create type metodo_pago as enum ('efectivo', 'transferencia', 'otro');
create type metodo_checkin as enum ('qr', 'manual');

-- Para que cuotas y checkins apunten a (membresía, gimnasio) juntos: así la
-- base rechaza una cuota del gimnasio A colgada de un socio del B, sin
-- depender de que la política se acuerde de chequearlo.
alter table memberships add constraint memberships_id_gym_unico unique (id, gym_id);

-- La foto de verificación: ruta del objeto en el bucket fotos-socios (0019).
-- Va en la membresía y no en profiles.avatar_url porque el perfil es de la
-- persona y lo comparten todos sus gimnasios, y además el socio puede editar
-- su propio avatar_url. Esta foto es del gimnasio que la sacó, y solo la
-- cambia su admin. Ver la sección 1 del diseño de la etapa 4.
alter table memberships add column foto text;

create table cuotas (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references gyms(id) on delete cascade,
  membership_id   uuid not null,
  periodo_desde   date not null,
  -- El primer día SIN cobertura: una cuota del 15/10 al 15/11 cubre hasta el
  -- 14/11 inclusive. Así dos cuotas seguidas se tocan sin superponerse.
  periodo_hasta   date not null,
  monto           numeric(12,2) not null,
  moneda          text not null default 'ARS',
  metodo          metodo_pago not null,
  fecha_pago      date not null,
  -- set null: si el empleado que cobró se va, el pago queda. La FK lleva el
  -- gym_id para que el registrador sea del mismo gimnasio que la cuota.
  registrado_por  uuid,
  notas           text,
  created_at      timestamptz not null default now(),

  constraint cuotas_membresia_fk foreign key (membership_id, gym_id)
    references memberships (id, gym_id) on delete cascade,
  constraint cuotas_registrador_fk foreign key (registrado_por, gym_id)
    references memberships (id, gym_id) on delete set null (registrado_por),
  constraint cuotas_periodo_valido check (periodo_hasta > periodo_desde),
  constraint cuotas_monto_no_negativo check (monto >= 0)
);

create index cuotas_membresia_idx on cuotas (membership_id, periodo_hasta desc);
create index cuotas_gym_idx on cuotas (gym_id);

create table checkins (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references gyms(id) on delete cascade,
  membership_id   uuid not null,
  -- set null: si el empleado se va, la entrada queda. La FK lleva el gym_id.
  registrado_por  uuid,
  metodo          metodo_checkin not null,
  -- La fecha local del gimnasio en el momento de la entrada. La calcula
  -- registrar_checkin (0018) con gyms.zona_horaria; nunca la manda el
  -- cliente. Es lo que hace cumplir "una entrada por día" con un índice.
  dia             date not null,
  created_at      timestamptz not null default now(),

  constraint checkins_membresia_fk foreign key (membership_id, gym_id)
    references memberships (id, gym_id) on delete cascade,
  constraint checkins_registrador_fk foreign key (registrado_por, gym_id)
    references memberships (id, gym_id) on delete set null (registrado_por),
  constraint checkins_uno_por_dia unique (membership_id, dia)
);

create index checkins_gym_dia_idx on checkins (gym_id, dia desc);
