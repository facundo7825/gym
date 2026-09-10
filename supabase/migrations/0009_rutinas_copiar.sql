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
--
-- Ninguno de los insert de acá abajo usa `returning id`. No es estilo: con
-- RLS, `insert ... returning` le suma al with check un chequeo automático de
-- la política de select sobre la fila recién creada, y puedo_ver_rutina() es
-- security definer —a propósito, ver 0007— así que Postgres no puede
-- incrustarla en el plan del insert: corre como una subconsulta aparte, con
-- el snapshot de ANTES de que este insert escribiera nada. Esa subconsulta
-- nunca ve la fila que el propio insert acaba de crear, así que el returning
-- falla siempre con "viola la política de seguridad", pase lo que pase en el
-- with check. La salida es no depender de returning: se genera el id acá y se
-- inserta explícito.
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
    v_dia_nuevo := gen_random_uuid();

    insert into public.rutina_dias (id, rutina_id, orden, nombre, notas)
    values (v_dia_nuevo, p_nueva_id, d.orden, d.nombre, d.notas);

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

  v_nueva_id := gen_random_uuid();

  insert into public.rutinas (
    id, gym_id, nombre, descripcion, objetivo, nivel, tipo,
    propietario_id, origen_id, creado_por, asignada_por, fecha_inicio
  ) values (
    v_nueva_id, v_plantilla.gym_id, v_plantilla.nombre, v_plantilla.descripcion,
    v_plantilla.objetivo, v_plantilla.nivel, 'activa',
    p_propietario_id, v_plantilla.id, v_mi_membresia, v_asignada_por,
    current_date
  );

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

  v_nueva_id := gen_random_uuid();

  insert into public.rutinas (
    id, gym_id, nombre, descripcion, objetivo, nivel, tipo, creado_por
  ) values (
    v_nueva_id, v_origen.gym_id, v_origen.nombre || ' (copia)', v_origen.descripcion,
    v_origen.objetivo, v_origen.nivel, 'plantilla',
    public.mi_membresia(v_origen.gym_id)
  );

  perform public.copiar_rutina(v_origen.id, v_nueva_id);
  return v_nueva_id;
end;
$$;
