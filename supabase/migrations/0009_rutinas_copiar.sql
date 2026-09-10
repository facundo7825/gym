-- ---------------------------------------------------------------------------
-- Copiar una rutina.
--
-- Tomar una plantilla crea una COPIA completa a nombre del socio, no una
-- referencia. Si el socio apuntara a la plantilla, el día que el entrenador la
-- corrige le cambiaría el entrenamiento por debajo a todos los socios que la
-- están usando; y el socio no podría cambiar un ejercicio porque la máquina
-- está ocupada sin modificársela a los demás.
--
-- Son tres niveles de filas y no puede quedar a medias: va en una función, que
-- es una transacción. SECURITY INVOKER a propósito — el select de la plantilla
-- pasa por RLS, así que no se puede copiar una de otro gimnasio ni adivinando
-- el UUID, y los insert pasan por rutinas_crear, que es lo que sostiene la
-- coherencia de asignada_por.
-- ---------------------------------------------------------------------------

create or replace function public.copiar_rutina(
  p_origen_id uuid,
  p_nueva_id  uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d record;
  v_dia_nuevo uuid;
begin
  -- Itera los días en vez de resolverlo con un insert … select: copiar los
  -- ejercicios necesita el mapa de id viejo a id nuevo de cada día, y
  -- `returning` no devuelve la fila de origen. La alternativa sería aparear
  -- por `orden`, que es frágil justamente porque —a propósito, ver 0006—
  -- `orden` no es único. Son unas pocas filas.
  for d in
    select id, orden, nombre, notas
    from public.rutina_dias
    where rutina_id = p_origen_id
    order by orden
  loop
    insert into public.rutina_dias (rutina_id, orden, nombre, notas)
    values (p_nueva_id, d.orden, d.nombre, d.notas)
    returning id into v_dia_nuevo;

    insert into public.rutina_ejercicios (
      rutina_dia_id, ejercicio_id, orden, series, repeticiones,
      descanso_seg, peso_sugerido_kg, notas
    )
    select v_dia_nuevo, e.ejercicio_id, e.orden, e.series, e.repeticiones,
           e.descanso_seg, e.peso_sugerido_kg, e.notas
    from public.rutina_ejercicios e
    where e.rutina_dia_id = d.id;
  end loop;
end;
$$;

-- copiar_rutina es interna: la llaman tomar_rutina y duplicar_plantilla, y
-- nadie más. Queda igual expuesta como RPC por PostgREST, y así se deja a
-- propósito.
--
-- Revocarle el execute a anon y authenticated no serviría de nada: al crearla,
-- Postgres le da execute a PUBLIC, y revocarle a un rol puntual no descuenta
-- ese grant (proacl queda con `=X/postgres`, y has_function_privilege sigue
-- diciendo que sí). Y revocárselo también a PUBLIC —que sí sería efectivo—
-- rompe a las dos que la llaman: son security invoker, así que el permiso se
-- chequea contra el usuario final, que quedaría sin execute.
--
-- Que quede expuesta no abre nada: es security invoker, así que el select de
-- los días de origen y los insert en la rutina destino pasan por RLS igual que
-- si los hiciera el cliente a mano. Lo más que puede hacer quien la llame
-- directo es copiarse días que ya puede leer dentro de una rutina que ya puede
-- editar — que es exactamente lo que puede hacer sin ella.

-- Una sola función para los dos casos de uso —el socio tomando del catálogo y
-- el entrenador asignando—, que se diferencian solo en la política. La
-- alternativa era una función por caso, con la regla de quién puede asignarle
-- a quién escrita dos veces.
create or replace function public.tomar_rutina(
  p_plantilla_id   uuid,
  p_propietario_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plantilla    public.rutinas;
  v_mi_membresia uuid;
  v_asignada_por uuid;
  v_nueva_id     uuid;
begin
  select * into v_plantilla
  from public.rutinas
  where id = p_plantilla_id and tipo = 'plantilla';

  if not found then
    raise exception 'No encontramos esa rutina' using errcode = 'P0002';
  end if;

  v_mi_membresia := public.mi_membresia(v_plantilla.gym_id);
  if v_mi_membresia is null then
    raise exception 'No pertenecés a ese gimnasio' using errcode = '42501';
  end if;

  -- Si es para mí, no me la asignó nadie. Si es para otro, la firmo — y que
  -- yo pueda firmarla lo verifica rutinas_crear, no esta función.
  if p_propietario_id = v_mi_membresia then
    v_asignada_por := null;
  else
    v_asignada_por := v_mi_membresia;
  end if;

  insert into public.rutinas (
    gym_id, nombre, descripcion, objetivo, nivel, tipo,
    propietario_id, origen_id, creado_por, asignada_por, fecha_inicio
  ) values (
    v_plantilla.gym_id, v_plantilla.nombre, v_plantilla.descripcion,
    v_plantilla.objetivo, v_plantilla.nivel, 'activa',
    p_propietario_id, v_plantilla.id, v_mi_membresia, v_asignada_por,
    current_date
  )
  returning id into v_nueva_id;

  perform public.copiar_rutina(v_plantilla.id, v_nueva_id);
  return v_nueva_id;
end;
$$;

-- Sale una plantilla nueva e INDEPENDIENTE, con origen_id nulo, no una
-- versión encadenada. origen_id significa "de qué plantilla salió esta rutina
-- de socio", y ensuciarlo con el versionado del entrenador rompe la única
-- pregunta que esa columna sabe contestar — y de paso el índice único
-- rutinas_una_copia_activa, que se apoya en ella.
create or replace function public.duplicar_plantilla(p_rutina_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_origen   public.rutinas;
  v_nueva_id uuid;
begin
  select * into v_origen
  from public.rutinas
  where id = p_rutina_id and tipo = 'plantilla';

  if not found then
    raise exception 'No encontramos esa rutina' using errcode = 'P0002';
  end if;

  insert into public.rutinas (
    gym_id, nombre, descripcion, objetivo, nivel, tipo, creado_por
  ) values (
    v_origen.gym_id, v_origen.nombre || ' (copia)', v_origen.descripcion,
    v_origen.objetivo, v_origen.nivel, 'plantilla',
    public.mi_membresia(v_origen.gym_id)
  )
  returning id into v_nueva_id;

  perform public.copiar_rutina(v_origen.id, v_nueva_id);
  return v_nueva_id;
end;
$$;
