-- ---------------------------------------------------------------------------
-- Check-in: la única puerta de entrada a la tabla checkins.
--
-- El panel no busca el código con un select: llama a checkin_por_qr. Así un
-- código de otro gimnasio no se distingue de uno inexistente —los dos
-- devuelven { valido: false }—, y la respuesta trae en un solo viaje lo que
-- la tarjeta del escaneo muestra: nombre, foto, si la entrada es nueva y las
-- cuotas para calcular el estado. Ver la sección 1 del diseño de la etapa 4.
--
-- Con la cuota vencida la entrada se registra igual: la asistencia refleja
-- lo que pasó, y la conversación de la plata la maneja una persona.
-- ---------------------------------------------------------------------------

-- Interna. La comparten las dos de abajo para que la respuesta sea idéntica.
-- No se puede llamar desde afuera: no verifica de dónde salió el id.
create or replace function public.registrar_checkin(
  p_membership_id uuid,
  p_metodo        public.metodo_checkin
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m        public.memberships%rowtype;
  v_zona     text;
  v_hoy      date;
  v_hora     timestamptz;
  v_nuevo    boolean;
  v_nombre   text;
  v_apellido text;
begin
  select * into v_m
  from public.memberships
  where id = p_membership_id and estado = 'activo';

  -- El coalesce no es decorativo: mi_rol devuelve null para quien no es del
  -- gimnasio, y `null in (...)` es null, que el if trataría como "no falla".
  if not found
     or not coalesce(public.mi_rol(v_m.gym_id) in ('entrenador', 'admin'), false) then
    return jsonb_build_object('valido', false);
  end if;

  select zona_horaria into v_zona from public.gyms where id = v_m.gym_id;
  v_hoy := (now() at time zone v_zona)::date;

  insert into public.checkins (gym_id, membership_id, registrado_por, metodo, dia)
  values (v_m.gym_id, v_m.id, public.mi_membresia(v_m.gym_id), p_metodo, v_hoy)
  on conflict (membership_id, dia) do nothing
  returning created_at into v_hora;

  v_nuevo := v_hora is not null;
  if not v_nuevo then
    select created_at into v_hora
    from public.checkins
    where membership_id = v_m.id and dia = v_hoy;
  end if;

  select nombre, apellido into v_nombre, v_apellido
  from public.profiles
  where id = v_m.user_id;

  return jsonb_build_object(
    'valido',        true,
    'membership_id', v_m.id,
    'nombre',        v_nombre,
    'apellido',      v_apellido,
    'foto',          v_m.foto,
    'nuevo',         v_nuevo,
    'hora_entrada',  v_hora,
    'hoy',           v_hoy,
    'cuotas',        coalesce(
      (select jsonb_agg(jsonb_build_object(
                'periodo_desde', c.periodo_desde,
                'periodo_hasta', c.periodo_hasta))
       from public.cuotas c
       where c.membership_id = v_m.id),
      '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.registrar_checkin(uuid, public.metodo_checkin)
  from public, anon, authenticated;

create or replace function public.checkin_por_qr(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.memberships where codigo_qr = p_codigo;
  if v_id is null then
    return jsonb_build_object('valido', false);
  end if;
  return public.registrar_checkin(v_id, 'qr');
end;
$$;

create or replace function public.checkin_manual(p_membership_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.registrar_checkin(p_membership_id, 'manual')
$$;

revoke execute on function public.checkin_por_qr(text) from anon;
revoke execute on function public.checkin_manual(uuid) from anon;
