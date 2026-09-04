create type grupo_muscular as enum (
  'pecho', 'espalda', 'hombros', 'biceps', 'triceps', 'cuadriceps',
  'isquiotibiales', 'gluteos', 'gemelos', 'abdominales', 'antebrazo',
  'cuerpo_completo'
);

create type tipo_equipamiento as enum (
  'barra', 'mancuerna', 'maquina', 'polea', 'kettlebell', 'banda',
  'peso_corporal', 'otro'
);

-- procesando = la fila existe, el archivo todavía no
-- listo      = el objeto está en el bucket y se puede reproducir
-- error      = la subida se abandonó o falló
create type estado_video as enum ('procesando', 'listo', 'error');

-- Las máquinas que tiene físicamente cada gimnasio. Existen como tabla
-- propia porque habilitan el filtro "solo lo que hay acá" al armar rutinas.
create table maquinas (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  nombre      text not null,
  marca       text,
  foto_url    text,
  cantidad    integer not null default 1 check (cantidad > 0),
  notas       text,
  created_at  timestamptz not null default now(),
  -- Redundante con la clave primaria, pero necesaria: es el destino de la
  -- clave foránea compuesta de `ejercicios` de más abajo.
  unique (id, gym_id)
);

create index maquinas_gym_id_idx on maquinas (gym_id);

-- gym_id nulo = video del catálogo global.
-- Tabla propia y no un campo `video_url` en ejercicios porque un video NO
-- está disponible al terminar la subida: entre que se emite la URL de subida
-- y que la subida se confirma hay una ventana en la que la fila existe y el
-- archivo no. `estado` es lo que representa esa ventana.
create table videos (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid references gyms(id) on delete cascade,
  -- Ruta del objeto en el bucket `videos`, con la forma {gym_id}/{id}.mp4.
  ruta           text not null unique,
  estado         estado_video not null default 'procesando',
  duracion_seg   integer,
  thumbnail_url  text,
  subido_por     uuid references memberships(id) on delete set null,
  error_detalle  text,
  created_at     timestamptz not null default now()
);

create index videos_gym_id_idx on videos (gym_id);

-- gym_id nulo = ejercicio del catálogo global, visible para todos los
-- gimnasios y editable por ninguno.
create table ejercicios (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid references gyms(id) on delete cascade,
  nombre          text not null,
  descripcion     text,
  instrucciones   text,
  grupo_muscular  grupo_muscular not null,
  equipamiento    tipo_equipamiento not null,
  maquina_id      uuid,
  video_id        uuid references videos(id) on delete set null,
  creado_por      uuid references memberships(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index ejercicios_gym_id_idx  on ejercicios (gym_id);
create index ejercicios_grupo_idx   on ejercicios (grupo_muscular);

-- Un ejercicio global no puede apuntar a una máquina, que siempre es de
-- algún gimnasio concreto.
alter table ejercicios add constraint ejercicio_global_sin_maquina
  check (gym_id is not null or maquina_id is null);

-- La máquina tiene que ser del MISMO gimnasio que el ejercicio. Una FK a
-- maquinas(id) a secas dejaría que un ejercicio del gimnasio A apunte a una
-- máquina del B: RLS no lo impide, porque es un problema de integridad y no
-- de visibilidad. Al incluir gym_id en la FK, lo garantiza la base.
--
-- Con maquina_id nulo la restricción no se evalúa (MATCH SIMPLE), que es
-- justo lo que hace falta para los ejercicios globales.
--
-- `set null (maquina_id)` nombra la columna a propósito: sin esa lista,
-- borrar una máquina intentaría anular también gym_id, que es NOT NULL en
-- los ejercicios de un gimnasio. Requiere PostgreSQL 15+.
alter table ejercicios add constraint ejercicio_maquina_del_mismo_gym
  foreign key (maquina_id, gym_id) references maquinas (id, gym_id)
  on delete set null (maquina_id);
