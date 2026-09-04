-- El bucket va por migración y no por supabase/config.toml porque los buckets
-- declarados en el config solo existen en el entorno local. Una migración
-- corre igual en local y en la nube, y queda versionada.
--
-- public = false y NINGUNA política sobre storage.objects: sin políticas, RLS
-- deniega todo. Ni siquiera un admin del gimnasio dueño puede bajar el objeto
-- directamente. El único acceso es a través de las Edge Functions, que usan
-- service_role y firman URLs que vencen en 5 minutos. Es deny by default, y
-- es lo que hace cumplible la sección 6 del diseño general: el contenido del
-- gimnasio no puede circular por mensajería.
--
-- file_size_limit es la segunda línea de defensa. El panel valida antes de
-- subir, pero si esa validación falla o alguien llama a la API directo,
-- Storage rechaza igual. 52428800 = 50 MiB, el tope del plan Free.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 52428800, array['video/mp4']);
