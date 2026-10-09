-- ---------------------------------------------------------------------------
-- Permisos del registro de entrenamiento.
--
-- Leer es más ancho que escribir, al revés de lo usual: el socio lee lo suyo y
-- el personal lo de cualquier socio de su gimnasio, pero escribir lo escribe
-- solo el propio socio. Un entrenador que pudiera registrar series a nombre de
-- otro ensucia el único dato que la app promete que es verdad.
--
-- series_registradas NO TIENE política de update ni de delete. No están
-- restringidas: no existen. Todo el argumento de por qué sincronizar es fácil
-- —sección 7 del diseño general— se apoya en que los registros solo se
-- agregan, y eso tiene que sostenerlo la base, no la disciplina. Antes de
-- agregar una, leer la sección 1 del diseño de la etapa 3.
--
-- Las funciones son SECURITY DEFINER por el mismo motivo que las de 0002: se
-- llaman desde una política y leen las tablas que esa política protege.
-- ---------------------------------------------------------------------------

-- Recibe las columnas y no el id, por la misma razón que
-- puedo_ver_rutina_fila en 0007: así la política de select puede evaluarse
-- sobre la fila que un INSERT ... RETURNING acaba de crear. La app inserta
-- sesiones y necesita el id de vuelta para colgarles las series.
create or replace function public.puedo_ver_sesion_fila(
  p_gym_id        uuid,
  p_membership_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_gym_id in (select public.mis_gyms())
     and (
       p_membership_id = public.mi_membresia(p_gym_id)
       or public.mi_rol(p_gym_id) in ('entrenador', 'admin')
     )
$$;

-- Para la política de series_registradas, que mira al padre. El padre lo
-- insertó una sentencia anterior, así que buscarlo por id no tiene el problema
-- de arriba.
create or replace function public.puedo_ver_sesion(p_sesion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.puedo_ver_sesion_fila(s.gym_id, s.membership_id)
  from public.sesiones s
  where s.id = p_sesion_id
$$;

-- Escribir: solo el dueño. Una membresía dada de baja deja de ser "mía"
-- —mi_membresia() exige estado activo—, y su rechazo es uno de los
-- permanentes que la cola de la app marca como rechazados.
create or replace function public.es_mi_sesion(p_sesion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select s.membership_id = public.mi_membresia(s.gym_id)
  from public.sesiones s
  where s.id = p_sesion_id
$$;

alter table sesiones           enable row level security;
alter table series_registradas enable row level security;

create policy sesiones_leer on sesiones for select
  using (puedo_ver_sesion_fila(gym_id, membership_id));

-- El exists contra rutina_dias corre con RLS, así que exige a la vez que el día
-- sea visible y que su rutina sea de ESTE gimnasio. Sin él, alguien con
-- membresía en dos gimnasios podía registrar una sesión del A colgada de un día
-- de rutina del B.
--
-- `sesiones.gym_id` va calificado a propósito: adentro del exists, un gym_id
-- suelto se resolvería contra rutinas, que también tiene esa columna, y la
-- comparación sería siempre verdadera.
create policy sesiones_crear on sesiones for insert with check (
  membership_id = mi_membresia(gym_id)
  and (
    rutina_dia_id is null
    or exists (
      select 1
      from rutina_dias d
      join rutinas r on r.id = d.rutina_id
      where d.id = rutina_dia_id
        and r.gym_id = sesiones.gym_id
    )
  )
);

-- La política deja pasar la fila entera; qué columnas se pueden cambiar lo
-- decide el trigger de 0013. RLS decide filas, nunca columnas.
create policy sesiones_editar on sesiones for update
  using (membership_id = mi_membresia(gym_id))
  with check (membership_id = mi_membresia(gym_id));

-- Sin política de delete en sesiones: el historial no se borra a mano.

create policy series_registradas_leer on series_registradas for select
  using (puedo_ver_sesion(sesion_id));

-- El exists contra ejercicios, por el mismo motivo que en
-- rutina_ejercicios_crear (0007): sin él se podía registrar una serie
-- apuntando a un ejercicio privado de otro gimnasio adivinando el uuid, y por
-- el restrict de 0011 eso le impediría al otro gimnasio borrar su ejercicio.
create policy series_registradas_crear on series_registradas for insert
  with check (
    es_mi_sesion(sesion_id)
    and exists (select 1 from ejercicios e where e.id = ejercicio_id)
  );
