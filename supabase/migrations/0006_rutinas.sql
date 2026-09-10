-- ---------------------------------------------------------------------------
-- Rutinas: plantillas del gimnasio y rutinas activas de cada socio.
--
-- Una rutina es un árbol de tres niveles: rutina -> días -> ejercicios.
-- Cuando un socio toma una plantilla se copia el árbol entero a su nombre;
-- el porqué está en la sección 4 del diseño de la etapa 2.
-- ---------------------------------------------------------------------------

create type objetivo_rutina as enum
  ('fuerza', 'hipertrofia', 'resistencia', 'perdida_grasa', 'general');

create type nivel_rutina as enum
  ('principiante', 'intermedio', 'avanzado');

-- plantilla = del gimnasio, sin dueño, es lo que se ofrece en el catálogo.
-- activa    = la copia que entrena un socio concreto.
create type tipo_rutina as enum ('plantilla', 'activa');

create type estado_rutina as enum ('activa', 'archivada');

create table rutinas (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references gyms(id) on delete cascade,
  nombre          text not null,
  descripcion     text,
  objetivo        objetivo_rutina not null default 'general',
  nivel           nivel_rutina not null default 'principiante',
  tipo            tipo_rutina not null,
  -- La membresía del socio que la entrena. Apunta a memberships y no a
  -- profiles porque una persona puede estar en varios gimnasios, y la rutina
  -- es de su relación con ESTE gimnasio.
  propietario_id  uuid references memberships(id) on delete cascade,
  -- De qué plantilla salió esta copia. Nulo si el socio se la armó solo.
  origen_id       uuid references rutinas(id) on delete set null,
  creado_por      uuid references memberships(id) on delete set null,
  -- Cargado solo si se la asignó el personal. Es lo que decide, en
  -- puedo_editar_rutina(), si el entrenador puede seguir corrigiéndola.
  asignada_por    uuid references memberships(id) on delete set null,
  fecha_inicio    date,
  fecha_fin       date,
  estado          estado_rutina not null default 'activa',
  created_at      timestamptz not null default now(),

  constraint rutinas_propietario_segun_tipo check (
    (tipo = 'plantilla' and propietario_id is null) or
    (tipo = 'activa'    and propietario_id is not null)
  ),

  -- Una plantilla no le fue asignada a nadie: no tiene dueño a quien
  -- asignársela.
  constraint rutinas_asignada_solo_activas check (
    asignada_por is null or tipo = 'activa'
  )
);

create index rutinas_gym_id_idx on rutinas (gym_id);
create index rutinas_propietario_idx on rutinas (propietario_id);

-- El socio toca dos veces "Tomar esta rutina", o toca con mala señal y
-- reintenta, y no termina con la misma rutina duplicada en Mis rutinas.
-- Deja fuera a las que se armó él (origen_id nulo, no colisionan entre sí) y
-- a las archivadas: volver a hacer el año que viene una plantilla que ya se
-- hizo es legítimo. NO limita a una rutina activa por socio: puede tener
-- varias, lo que no puede tener es dos copias de la MISMA plantilla.
create unique index rutinas_una_copia_activa
  on rutinas (propietario_id, origen_id)
  where tipo = 'activa' and estado = 'activa' and origen_id is not null;

-- Las hijas NO llevan gym_id. A diferencia de `ejercicios`, que sí lleva la
-- clave foránea compuesta contra `maquinas`, acá la regla de escritura tiene
-- tres casos según el tipo y el origen de la fila: repetirla por tabla y por
-- operación son nueve lugares que se desincronizan. Vive en
-- puedo_editar_rutina() (0007) y las hijas llegan al gimnasio por su padre.
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
  -- restrict y no cascade: borrar un ejercicio del catálogo no puede vaciar
  -- en silencio un día de la rutina de alguien. El panel avisa en cuántas
  -- rutinas está y no borra.
  ejercicio_id      uuid not null references ejercicios(id) on delete restrict,
  orden             integer not null,
  series            integer not null check (series > 0),
  -- Texto y no número: los rangos ("8-12", "al fallo") son la forma normal
  -- de prescribir.
  repeticiones      text not null,
  descanso_seg      integer check (descanso_seg >= 0),
  peso_sugerido_kg  numeric(6,2) check (peso_sugerido_kg >= 0),
  notas             text,
  created_at        timestamptz not null default now()
);

create index rutina_ejercicios_dia_idx on rutina_ejercicios (rutina_dia_id, orden);
