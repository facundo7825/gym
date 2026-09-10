-- ---------------------------------------------------------------------------
-- Reordenar días y ejercicios.
--
-- Reciben el orden FINAL COMPLETO y reescriben `orden` según la posición en el
-- arreglo, en una sentencia. Por eso `orden` no tiene índice único (ver 0006):
-- con uno, mover el tercer elemento al primer lugar obliga a barajar valores
-- intermedios o a hacer la restricción diferible. Mandando la lista entera el
-- problema no existe.
-- ---------------------------------------------------------------------------

create or replace function public.reordenar_dias(
  p_rutina_id uuid,
  p_ids       uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total    integer;
  v_recibido integer := coalesce(array_length(p_ids, 1), 0);
begin
  if not coalesce(public.puedo_editar_rutina(p_rutina_id), false) then
    raise exception 'No podés editar esta rutina' using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.rutina_dias
  where rutina_id = p_rutina_id;

  -- El arreglo tiene que ser una permutación EXACTA de los hijos actuales. Sin
  -- esto se podrían dejar huecos en el orden mandando una lista corta, o
  -- colgarse un día ajeno metiéndolo en la lista.
  if v_recibido <> v_total
     or (select count(distinct x) from unnest(p_ids) as x) <> v_total
     or exists (
          select 1
          from unnest(p_ids) as x
          where not exists (
            select 1 from public.rutina_dias d
            where d.id = x and d.rutina_id = p_rutina_id
          )
        )
  then
    raise exception 'El orden recibido no corresponde a esta rutina'
      using errcode = '22023';
  end if;

  update public.rutina_dias d
  set orden = p.pos
  from unnest(p_ids) with ordinality as p(id, pos)
  where d.id = p.id;
end;
$$;

create or replace function public.reordenar_ejercicios(
  p_dia_id uuid,
  p_ids    uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total    integer;
  v_recibido integer := coalesce(array_length(p_ids, 1), 0);
begin
  if not coalesce(public.puedo_editar_dia(p_dia_id), false) then
    raise exception 'No podés editar esta rutina' using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.rutina_ejercicios
  where rutina_dia_id = p_dia_id;

  if v_recibido <> v_total
     or (select count(distinct x) from unnest(p_ids) as x) <> v_total
     or exists (
          select 1
          from unnest(p_ids) as x
          where not exists (
            select 1 from public.rutina_ejercicios e
            where e.id = x and e.rutina_dia_id = p_dia_id
          )
        )
  then
    raise exception 'El orden recibido no corresponde a este día'
      using errcode = '22023';
  end if;

  update public.rutina_ejercicios e
  set orden = p.pos
  from unnest(p_ids) with ordinality as p(id, pos)
  where e.id = p.id;
end;
$$;
