-- ---------------------------------------------------------------------------
-- Permisos de cuotas, asistencia y membresías (etapa 4).
--
-- Leer es como en el registro de entrenamiento: el socio lo suyo, el personal
-- lo de todo su gimnasio. El entrenador necesita leer cuotas para ver el
-- estado al escanear, aunque no pueda cobrar.
--
-- Escribir: las cuotas solo el admin. Los check-in NO tienen política de
-- insert: entran únicamente por checkin_por_qr y checkin_manual (0018), que
-- son las que calculan el día en la zona del gimnasio. Ninguna de las dos
-- tablas tiene política de update: un pago mal cargado se borra y se carga
-- de nuevo, y eso solo lo hace el admin.
-- ---------------------------------------------------------------------------

alter table cuotas   enable row level security;
alter table checkins enable row level security;

-- puedo_ver_sesion_fila (0012) es exactamente la regla de lectura que hace
-- falta acá: del propio gimnasio, y o es mío o soy personal. Se reusa en vez
-- de copiarla.
create policy cuotas_leer on cuotas for select
  using (puedo_ver_sesion_fila(gym_id, membership_id));

-- registrado_por = la membresía de quien carga: nadie registra un pago a
-- nombre de otro empleado.
create policy cuotas_crear on cuotas for insert
  with check (
    mi_rol(gym_id) = 'admin'
    and registrado_por = mi_membresia(gym_id)
  );

create policy cuotas_borrar on cuotas for delete
  using (mi_rol(gym_id) = 'admin');

create policy checkins_leer on checkins for select
  using (puedo_ver_sesion_fila(gym_id, membership_id));

create policy checkins_borrar on checkins for delete
  using (mi_rol(gym_id) = 'admin');

-- ---------------------------------------------------------------------------
-- El código QR solo lo lee su dueño.
--
-- memberships_leer (0002) deja ver todas las membresías del propio gimnasio:
-- el entrenador necesita la lista de socios. Pero con el código adentro,
-- cualquier socio podía leer el de otro y generarse su QR. RLS decide filas,
-- nunca columnas: la columna se cierra con grants, como es_superadmin en 0002.
-- Se revoca el grant de tabla primero, porque Postgres suma privilegios.
--
-- Una columna nueva en memberships NO se puede leer hasta agregarla acá.
-- ---------------------------------------------------------------------------
revoke select on public.memberships from anon, authenticated;
grant select (id, gym_id, user_id, rol, estado, fecha_alta, foto, created_at)
  on public.memberships to authenticated;

create or replace function public.mi_codigo_qr(p_gym_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select codigo_qr
  from public.memberships
  where user_id = (select auth.uid())
    and gym_id = p_gym_id
    and estado = 'activo'
$$;

-- ---------------------------------------------------------------------------
-- El admin edita nombre, apellido y teléfono de un socio de su gimnasio.
--
-- profiles_editar_el_mio (0002) solo deja editar el propio perfil, y abrirlo
-- con una política nueva dejaría al admin editar cualquier columna permitida
-- —avatar_url, fecha_nacimiento— de cualquiera que comparta gimnasio con él,
-- entrenadores incluidos. Una función acota exactamente qué cambia.
--
-- El perfil es uno por persona: el cambio se ve en todos sus gimnasios. Se
-- acepta, porque es la misma persona en todos lados.
-- ---------------------------------------------------------------------------
create or replace function public.editar_datos_socio(
  p_membership_id uuid,
  p_nombre        text,
  p_apellido      text,
  p_telefono      text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select m.user_id into v_user
  from public.memberships m
  where m.id = p_membership_id
    and public.mi_rol(m.gym_id) = 'admin';

  if v_user is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre' using errcode = '22023';
  end if;

  update public.profiles
  set nombre   = trim(p_nombre),
      apellido = trim(coalesce(p_apellido, '')),
      telefono = nullif(trim(coalesce(p_telefono, '')), '')
  where id = v_user;
end;
$$;

revoke execute on function public.mi_codigo_qr(uuid) from anon;
revoke execute on function public.editar_datos_socio(uuid, text, text, text) from anon;
