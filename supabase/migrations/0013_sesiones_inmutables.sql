-- ---------------------------------------------------------------------------
-- De una sesión cambian fin y notas, y nada más.
--
-- sesiones_editar (0012) le deja al socio el update de su propia sesión,
-- porque al terminar de entrenar hay que escribir fin. Pero RLS decide filas,
-- no columnas: sin esto podría reescribir inicio y correr su historial, o
-- cambiar id_local y romper la llave con la que la cola reconoce un reintento.
--
-- Se escribe como "todo menos fin y notas" comparando la fila entera, y no
-- como una lista de columnas prohibidas: una columna que se agregue mañana
-- nace inmutable, en vez de nacer editable hasta que alguien se acuerde de
-- sumarla acá. Es el mismo mecanismo que 0008_rutinas_inmutables.sql.
-- ---------------------------------------------------------------------------

create or replace function public.sesiones_columnas_inmutables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'fin' - 'notas' - 'rutina_dia_id')
     is distinct from (to_jsonb(old) - 'fin' - 'notas' - 'rutina_dia_id') then
    raise exception 'Esta columna no se puede modificar'
      using errcode = '42501';
  end if;

  -- rutina_dia_id lleva una regla propia por el mismo motivo que origen_id en
  -- 0008: su clave foránea es `on delete set null`, y esa acción se ejecuta
  -- como un update de esta fila. Se prohíbe repuntarlo y se deja pasar el
  -- null.
  if new.rutina_dia_id is distinct from old.rutina_dia_id
     and new.rutina_dia_id is not null then
    raise exception 'El día de una sesión no se puede cambiar'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger sesiones_columnas_inmutables_trg
  before update on public.sesiones
  for each row execute function public.sesiones_columnas_inmutables();
