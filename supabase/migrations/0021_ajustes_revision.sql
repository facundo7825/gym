-- ---------------------------------------------------------------------------
-- Ajustes de la revisión final de la etapa 4.
-- ---------------------------------------------------------------------------

-- 1. editar_datos_socio: el perfil es global, así que no se toca el de quien
-- también pertenece a otro gimnasio. Un admin de A puede sumar por alta a
-- alguien que es admin o entrenador de B; esa persona queda como socio en A,
-- y sin esta guarda el admin de A le cambiaría el perfil en B también.
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
    and m.rol = 'socio'
    and public.mi_rol(m.gym_id) = 'admin'
    and not exists (
      select 1
      from public.memberships otra
      where otra.user_id = m.user_id
        and otra.gym_id <> m.gym_id
    );

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

-- 3. Las fotos: la ruta es <gym_id>/<membership_id>.jpg. Se saca el id de la
-- membresía de la ruta y se busca por clave primaria, en vez de armar un texto
-- por cada membresía y compararlo. Una ruta mal formada da false: la regex se
-- verifica antes de castear a uuid, así que un id inválido nunca tira error.
create or replace function public.puedo_ver_foto(p_ruta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.id = case
            when p_ruta ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
            then substring(p_ruta from '/([0-9a-f-]{36})\.jpg$')::uuid
          end
      and p_ruta = m.gym_id::text || '/' || m.id::text || '.jpg'
      and (
        public.mi_rol(m.gym_id) in ('entrenador', 'admin')
        or m.id = public.mi_membresia(m.gym_id)
      )
  )
$$;

create or replace function public.puedo_subir_foto(p_ruta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.id = case
            when p_ruta ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
            then substring(p_ruta from '/([0-9a-f-]{36})\.jpg$')::uuid
          end
      and p_ruta = m.gym_id::text || '/' || m.id::text || '.jpg'
      and public.mi_rol(m.gym_id) = 'admin'
  )
$$;

-- 2. Permisos de ejecución. "revoke ... from anon" no alcanza: PUBLIC conserva
-- el execute (ver la nota en 0009), y Supabase además otorga a anon por
-- defecto. Se saca de todos y se da solo a authenticated. Las políticas de
-- storage corren como authenticated, así que también necesitan el grant.
-- registrar_checkin (0018) y usuario_por_email (0020) no se tocan: ya quedaron
-- sin execute para authenticated.
revoke execute on function public.mi_codigo_qr(uuid)                         from public, anon, authenticated;
revoke execute on function public.editar_datos_socio(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.checkin_por_qr(text)                       from public, anon, authenticated;
revoke execute on function public.checkin_manual(uuid)                       from public, anon, authenticated;
revoke execute on function public.puedo_ver_foto(text)                       from public, anon, authenticated;
revoke execute on function public.puedo_subir_foto(text)                     from public, anon, authenticated;

grant execute on function public.mi_codigo_qr(uuid)                         to authenticated;
grant execute on function public.editar_datos_socio(uuid, text, text, text) to authenticated;
grant execute on function public.checkin_por_qr(text)                       to authenticated;
grant execute on function public.checkin_manual(uuid)                       to authenticated;
grant execute on function public.puedo_ver_foto(text)                       to authenticated;
grant execute on function public.puedo_subir_foto(text)                     to authenticated;
