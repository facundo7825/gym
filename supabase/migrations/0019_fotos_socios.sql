-- ---------------------------------------------------------------------------
-- Las fotos de verificación de los socios.
--
-- Privado, como el de videos, pero a diferencia de él SÍ tiene políticas: el
-- panel sube directo desde el navegador del admin y pide URLs firmadas con la
-- sesión de quien mira. No hace falta una Edge Function en el medio.
--
-- La ruta es <gym_id>/<membership_id>.jpg, y las políticas exigen que
-- corresponda a una membresía real: no se puede subir un archivo cualquiera
-- en la carpeta del gimnasio, ni en la de otro.
--
-- Solo JPEG y hasta 5 MiB: el panel reduce la foto antes de subirla, y esto
-- es la segunda línea de defensa si esa reducción no corre.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-socios', 'fotos-socios', false, 5242880, array['image/jpeg']);

-- La ve el personal del gimnasio, para el escaneo, y el propio socio.
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
    where p_ruta = m.gym_id::text || '/' || m.id::text || '.jpg'
      and (
        public.mi_rol(m.gym_id) in ('entrenador', 'admin')
        or m.id = public.mi_membresia(m.gym_id)
      )
  )
$$;

-- La sube, la reemplaza o la borra solo el admin: es lo que el check-in
-- compara contra la cara.
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
    where p_ruta = m.gym_id::text || '/' || m.id::text || '.jpg'
      and public.mi_rol(m.gym_id) = 'admin'
  )
$$;

create policy fotos_socios_leer on storage.objects for select to authenticated
  using (bucket_id = 'fotos-socios' and public.puedo_ver_foto(name));

create policy fotos_socios_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-socios' and public.puedo_subir_foto(name));

-- upsert: true reemplaza el objeto, y eso es un update.
create policy fotos_socios_reemplazar on storage.objects for update to authenticated
  using (bucket_id = 'fotos-socios' and public.puedo_subir_foto(name))
  with check (bucket_id = 'fotos-socios' and public.puedo_subir_foto(name));

create policy fotos_socios_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-socios' and public.puedo_subir_foto(name));
