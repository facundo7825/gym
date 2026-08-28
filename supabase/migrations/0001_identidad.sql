-- ---------------------------------------------------------------------------
-- Identidad: gimnasios, personas y la relación entre ambos.
-- ---------------------------------------------------------------------------

create type rol_membresia as enum ('socio', 'entrenador', 'admin');
create type estado_membresia as enum ('activo', 'inactivo');

create table gyms (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  slug          text not null unique,
  logo_url      text,
  zona_horaria  text not null default 'America/Argentina/Buenos_Aires',
  plan          text not null default 'basico',
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- La persona. Existe una vez, independiente de en cuántos gimnasios esté.
create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  nombre            text not null default '',
  apellido          text not null default '',
  telefono          text,
  avatar_url        text,
  fecha_nacimiento  date,
  es_superadmin     boolean not null default false,
  created_at        timestamptz not null default now()
);

-- La relación persona <-> gimnasio, con su rol EN ESE GIMNASIO.
-- Es la tabla sobre la que se apoya todo el aislamiento multi-gimnasio.
create table memberships (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  rol         rol_membresia not null default 'socio',
  estado      estado_membresia not null default 'activo',
  fecha_alta  date not null default current_date,
  -- Valor opaco que va dentro del QR del socio. No es el id: se puede
  -- revocar y regenerar sin tocar ningún otro dato.
  codigo_qr   text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at  timestamptz not null default now(),
  unique (gym_id, user_id)
);

create index memberships_user_id_idx on memberships (user_id);
create index memberships_gym_id_idx  on memberships (gym_id);

-- Al registrarse un usuario en auth.users, crear su fila en profiles.
create function public.crear_profile_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre, apellido)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido', '')
  );
  return new;
end;
$$;

create trigger al_crearse_usuario
  after insert on auth.users
  for each row execute function public.crear_profile_al_registrarse();
