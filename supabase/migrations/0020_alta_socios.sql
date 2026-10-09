-- ---------------------------------------------------------------------------
-- Para la Edge Function socio-alta: saber si un email ya tiene cuenta.
--
-- La API de administración de Auth no busca por email —solo lista de a
-- páginas—, y recorrer todos los usuarios en cada alta no escala. Esta
-- función lee auth.users, así que NADIE más que service_role la puede
-- ejecutar: con ella cualquiera podría averiguar qué emails están
-- registrados en la plataforma.
-- ---------------------------------------------------------------------------
create or replace function public.usuario_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1
$$;

revoke execute on function public.usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.usuario_por_email(text) to service_role;
