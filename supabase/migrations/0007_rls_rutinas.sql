-- ---------------------------------------------------------------------------
-- Permisos de rutinas.
--
-- Las funciones son SECURITY DEFINER por el mismo motivo que las de
-- 0002_rls_identidad.sql: se llaman DESDE una política y leen las mismas
-- tablas que esa política protege. Si respetaran RLS, la lectura volvería a
-- disparar la política, sin fin.
-- ---------------------------------------------------------------------------

-- Nueva: las políticas de las etapas 0 y 1 nunca necesitaron el id de la
-- membresía, solo el rol. Acá hace falta porque propietario_id apunta a
-- memberships.
create or replace function public.mi_membresia(p_gym_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.memberships
  where user_id = (select auth.uid())
    and gym_id = p_gym_id
    and estado = 'activo'
$$;

-- Las plantillas las ve todo el gimnasio: son el catálogo. Una rutina activa
-- la ven su propietario y el personal — eso es lo que habilita "ver las
-- rutinas del socio" en el panel sin una política aparte.
create or replace function public.puedo_ver_rutina(p_rutina_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select r.gym_id in (select public.mis_gyms())
     and (
       r.tipo = 'plantilla'
       or r.propietario_id = public.mi_membresia(r.gym_id)
       or public.mi_rol(r.gym_id) in ('entrenador', 'admin')
     )
  from public.rutinas r
  where r.id = p_rutina_id
$$;

-- La regla de escritura, escrita una sola vez para las tres tablas.
create or replace function public.puedo_editar_rutina(p_rutina_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Plantilla: es del gimnasio, la maneja el personal.
    when r.tipo = 'plantilla' then
      public.mi_rol(r.gym_id) in ('entrenador', 'admin')
    -- Activa que el socio se armó solo: es suya y nadie se la toca.
    when r.asignada_por is null then
      r.propietario_id = public.mi_membresia(r.gym_id)
    -- Activa asignada: la corrige el que se la asignó, que es para lo que
    -- se la asignó.
    else
      r.propietario_id = public.mi_membresia(r.gym_id)
      or public.mi_rol(r.gym_id) in ('entrenador', 'admin')
  end
  from public.rutinas r
  where r.id = p_rutina_id
$$;

-- Existen para que la política de rutina_ejercicios no tenga que subir dos
-- niveles a mano. Delegan: la regla sigue escrita una sola vez.
create or replace function public.puedo_ver_dia(p_dia_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.puedo_ver_rutina(d.rutina_id)
  from public.rutina_dias d
  where d.id = p_dia_id
$$;

create or replace function public.puedo_editar_dia(p_dia_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.puedo_editar_rutina(d.rutina_id)
  from public.rutina_dias d
  where d.id = p_dia_id
$$;

alter table rutinas           enable row level security;
alter table rutina_dias       enable row level security;
alter table rutina_ejercicios enable row level security;

create policy rutinas_leer on rutinas for select
  using (puedo_ver_rutina(id));

-- El insert no puede usar puedo_editar_rutina(): la fila todavía no existe.
-- Además carga la coherencia de asignada_por, que es lo único que impide que
-- un socio se cree a mano una rutina "asignada" —y con eso le abra la puerta
-- al entrenador— o le cree una rutina a otro socio.
create policy rutinas_crear on rutinas for insert with check (
  gym_id in (select mis_gyms())
  and case
    when tipo = 'plantilla' then
      mi_rol(gym_id) in ('entrenador', 'admin') and asignada_por is null
    when asignada_por is null then
      propietario_id = mi_membresia(gym_id)
    else
      mi_rol(gym_id) in ('entrenador', 'admin')
      and asignada_por = mi_membresia(gym_id)
  end
);

-- El with check explícito, por el motivo documentado en maquinas_editar.
create policy rutinas_editar on rutinas for update
  using (puedo_editar_rutina(id))
  with check (puedo_editar_rutina(id));

create policy rutinas_borrar on rutinas for delete
  using (puedo_editar_rutina(id));

create policy rutina_dias_leer on rutina_dias for select
  using (puedo_ver_rutina(rutina_id));

create policy rutina_dias_crear on rutina_dias for insert
  with check (puedo_editar_rutina(rutina_id));

create policy rutina_dias_editar on rutina_dias for update
  using (puedo_editar_rutina(rutina_id))
  with check (puedo_editar_rutina(rutina_id));

create policy rutina_dias_borrar on rutina_dias for delete
  using (puedo_editar_rutina(rutina_id));

create policy rutina_ejercicios_leer on rutina_ejercicios for select
  using (puedo_ver_dia(rutina_dia_id));

-- El exists contra ejercicios cierra un hueco que las tablas de la etapa 1 no
-- tenían: sin él, alguien podría meter en su propia rutina un ejercicio
-- privado de otro gimnasio adivinando el UUID, y después leerle el nombre y
-- el video a través del join de la rutina.
create policy rutina_ejercicios_crear on rutina_ejercicios for insert
  with check (
    puedo_editar_dia(rutina_dia_id)
    and exists (select 1 from ejercicios e where e.id = ejercicio_id)
  );

create policy rutina_ejercicios_editar on rutina_ejercicios for update
  using (puedo_editar_dia(rutina_dia_id))
  with check (puedo_editar_dia(rutina_dia_id));

create policy rutina_ejercicios_borrar on rutina_ejercicios for delete
  using (puedo_editar_dia(rutina_dia_id));
