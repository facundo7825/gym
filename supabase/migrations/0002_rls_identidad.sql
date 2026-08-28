-- ---------------------------------------------------------------------------
-- Aislamiento entre gimnasios.
--
-- Las funciones son SECURITY DEFINER a propósito: corren con los permisos de
-- quien las creó y por lo tanto NO les aplica RLS. Eso es lo que evita la
-- recursión infinita: la política de `memberships` llama a mis_gyms(), que
-- lee `memberships`. Si la función respetara RLS, esa lectura volvería a
-- disparar la política, que volvería a llamar a la función, sin fin.
--
-- `set search_path = ''` obliga a escribir los nombres completos
-- (public.memberships, auth.uid()). Sin eso, alguien podría crear un esquema
-- propio y hacer que la función lea de otra tabla.
-- ---------------------------------------------------------------------------

create or replace function public.mis_gyms()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select gym_id
  from public.memberships
  where user_id = (select auth.uid())
    and estado = 'activo'
$$;

create or replace function public.mi_rol(p_gym_id uuid)
returns public.rol_membresia
language sql
stable
security definer
set search_path = ''
as $$
  select rol
  from public.memberships
  where user_id = (select auth.uid())
    and gym_id = p_gym_id
    and estado = 'activo'
$$;

create or replace function public.soy_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select es_superadmin from public.profiles where id = (select auth.uid())),
    false
  )
$$;

alter table gyms        enable row level security;
alter table profiles    enable row level security;
alter table memberships enable row level security;

-- gyms: solo los gimnasios a los que pertenezco.
create policy gyms_leer on gyms for select
  using (id in (select mis_gyms()) or soy_superadmin());

create policy gyms_editar on gyms for update
  using (mi_rol(id) = 'admin' or soy_superadmin());

-- profiles: mi propio perfil, y el de quienes comparten gimnasio conmigo
-- (el entrenador necesita ver el nombre y la foto de sus socios).
create policy profiles_leer on profiles for select
  using (
    id = (select auth.uid())
    or exists (
      select 1 from memberships m
      where m.user_id = profiles.id
        and m.gym_id in (select mis_gyms())
    )
    or soy_superadmin()
  );

create policy profiles_editar_el_mio on profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- memberships: las de mi gimnasio. Solo un admin da de alta.
create policy memberships_leer on memberships for select
  using (gym_id in (select mis_gyms()) or soy_superadmin());

create policy memberships_crear on memberships for insert
  with check (mi_rol(gym_id) = 'admin' or soy_superadmin());

create policy memberships_editar on memberships for update
  using (mi_rol(gym_id) = 'admin' or soy_superadmin());
