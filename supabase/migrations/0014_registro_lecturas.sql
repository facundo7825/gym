-- ---------------------------------------------------------------------------
-- Las dos lecturas que alimentan el teléfono. Ver la sección 2 del diseño de la
-- etapa 3.
--
-- Las dos son security invoker: corren con los permisos de quien consulta, así
-- que la RLS de sesiones y series_registradas sigue decidiendo qué filas
-- entran. Una vista security definer —el default de una vista en Postgres—
-- saltearía la RLS y le mostraría a cualquiera las marcas de todo el mundo.
-- ---------------------------------------------------------------------------

-- Por membresía y ejercicio: el mayor peso de una serie, y el mayor volumen de
-- UNA sesión (no el total histórico). Es lo que el teléfono cachea para
-- detectar un récord sin señal, y la lista de récords de Progreso.
create view public.mejores_marcas
with (security_invoker = true)
as
with por_sesion as (
  select
    s.membership_id,
    sr.ejercicio_id,
    max(sr.peso_kg)                   as peso_max,
    sum(sr.peso_kg * sr.repeticiones) as volumen
  from public.series_registradas sr
  join public.sesiones s on s.id = sr.sesion_id
  where sr.completada
  group by s.membership_id, sr.ejercicio_id, s.id
)
select
  membership_id,
  ejercicio_id,
  max(peso_max)  as mejor_peso_kg,
  max(volumen)   as mejor_volumen_kg,
  count(*)::int  as sesiones
from por_sesion
group by membership_id, ejercicio_id;

-- "La vez pasada: 60kg × 10, 10, 9, 8". Una llamada por pantalla, con todos los
-- ejercicios del día, en vez de una consulta por ejercicio.
--
-- Filtra por las membresías de quien llama y no se apoya solo en la RLS: un
-- entrenador puede LEER las sesiones de sus socios, pero su "vez pasada" es la
-- suya.
create or replace function public.ultima_vez(p_ejercicio_ids uuid[])
returns table (
  ejercicio_id  uuid,
  numero_serie  integer,
  peso_kg       numeric,
  repeticiones  integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mias as (
    select s.id, s.inicio
    from public.sesiones s
    join public.memberships m on m.id = s.membership_id
    where m.user_id = (select auth.uid())
  ),
  ultima as (
    select distinct on (sr.ejercicio_id) sr.ejercicio_id, sr.sesion_id
    from public.series_registradas sr
    join mias on mias.id = sr.sesion_id
    where sr.ejercicio_id = any (p_ejercicio_ids)
      and sr.completada
    order by sr.ejercicio_id, mias.inicio desc
  )
  select sr.ejercicio_id, sr.numero_serie, sr.peso_kg, sr.repeticiones
  from public.series_registradas sr
  join ultima u on u.sesion_id = sr.sesion_id and u.ejercicio_id = sr.ejercicio_id
  where sr.completada
  order by sr.ejercicio_id, sr.numero_serie
$$;
