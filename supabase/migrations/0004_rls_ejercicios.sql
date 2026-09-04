alter table maquinas   enable row level security;
alter table videos     enable row level security;
alter table ejercicios enable row level security;

-- Máquinas: son del gimnasio. Las gestionan entrenadores y admins.
create policy maquinas_leer on maquinas for select
  using (gym_id in (select mis_gyms()));

create policy maquinas_crear on maquinas for insert
  with check (mi_rol(gym_id) in ('entrenador', 'admin'));

-- El `with check` va explícito en las tres políticas de UPDATE de abajo.
-- Si se omite, PostgreSQL reutiliza el `using` para la fila nueva y el
-- resultado es el mismo, pero esa equivalencia es implícita: alcanza con que
-- alguien agregue un `with check` distinto por otro motivo para abrir, sin
-- darse cuenta, la posibilidad de mudar una fila a otro gimnasio. Escrito,
-- no se pierde.
create policy maquinas_editar on maquinas for update
  using (mi_rol(gym_id) in ('entrenador', 'admin'))
  with check (mi_rol(gym_id) in ('entrenador', 'admin'));

-- Videos: los globales los ve todo el mundo; los del gimnasio, solo su gente.
create policy videos_leer on videos for select
  using (gym_id is null or gym_id in (select mis_gyms()));

create policy videos_crear on videos for insert
  with check (gym_id is not null and mi_rol(gym_id) in ('entrenador', 'admin'));

create policy videos_editar on videos for update
  using (gym_id is not null and mi_rol(gym_id) in ('entrenador', 'admin'))
  with check (gym_id is not null and mi_rol(gym_id) in ('entrenador', 'admin'));

-- RLS decide QUÉ FILAS se pueden tocar, nunca qué columnas. videos_editar de
-- arriba habilita el UPDATE de cualquier columna al entrenador/admin del
-- gimnasio, y eso alcanza para que, desde la consola del navegador con su
-- propia sesión, escriba `estado = 'listo'` sin que el archivo exista en el
-- bucket — sorteando la verificación contra Storage que hace
-- video-confirmar. El check videos_ruta_formato de 0003_ejercicios.sql ya le
-- ancla la `ruta` al formato que arma video-subir; esto cierra el resto:
-- la única forma de tocar `videos` por UPDATE desde una sesión normal queda
-- en las dos columnas que video-confirmar necesita escribir. Mismo patrón
-- que profiles.es_superadmin en 0002_rls_identidad.sql, revocando primero el
-- grant de tabla porque Postgres SUMA privilegios: revocar solo la columna
-- no descuenta un grant de tabla preexistente. `service_role` no pasa por
-- acá — conserva su grant de tabla completo, y de todos modos nunca toca
-- `videos` por esta vía (ver supabase/functions/_compartido/peticion.ts).
revoke update on public.videos from anon, authenticated;
grant update (estado, error_detalle) on public.videos to authenticated;

-- Ejercicios: idéntico criterio.
-- Ojo con el `gym_id is not null` del insert: impide que un gimnasio se
-- cuele contenido en el catálogo global. Los ejercicios globales los carga
-- el seed, que corre con service_role y no pasa por RLS.
create policy ejercicios_leer on ejercicios for select
  using (gym_id is null or gym_id in (select mis_gyms()));

create policy ejercicios_crear on ejercicios for insert
  with check (gym_id is not null and mi_rol(gym_id) in ('entrenador', 'admin'));

create policy ejercicios_editar on ejercicios for update
  using (gym_id is not null and mi_rol(gym_id) in ('entrenador', 'admin'))
  with check (gym_id is not null and mi_rol(gym_id) in ('entrenador', 'admin'));

-- Ninguna de las tres tablas define política de DELETE, así que con RLS
-- activa el borrado queda denegado para todos. Es deliberado: el historial
-- de un socio apunta a estos ejercicios, y borrarlos dejaría huecos. Si más
-- adelante hace falta dar de baja algo, va por una columna `archivado`, no
-- por un delete. `service_role` sigue pudiendo borrar para tareas de
-- mantenimiento.
--
-- Tampoco hay rama `or soy_superadmin()` en ninguna: el superadmin
-- administra la plataforma —gimnasios y membresías—, no el contenido de
-- cada gimnasio. Que no pueda leer los ejercicios ajenos es la intención.
