-- ---------------------------------------------------------------------------
-- RLS decide QUÉ FILAS se pueden tocar, nunca qué columnas. rutinas_editar le
-- habilita al socio el update de cualquier columna de su propia rutina, y eso
-- alcanza para que desde la consola del navegador escriba asignada_por = null
-- y se saque al entrenador de encima, o escriba propietario_id y le meta una
-- rutina a otro socio.
--
-- Se prohíben las cuatro y no solo las dos del ataque: ninguna tiene un caso
-- de uso legítimo de modificación. Reasignar es una copia nueva, archivar es
-- `estado`, y mudar una rutina de gimnasio o de tipo no es una operación que
-- exista. Escrito como inmutabilidad para todos —no como "el socio no
-- puede"— no hay que revisarlo cada vez que se agregue un rol.
-- ---------------------------------------------------------------------------

create or replace function public.rutinas_columnas_inmutables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.gym_id is distinct from old.gym_id
     or new.tipo is distinct from old.tipo
     or new.propietario_id is distinct from old.propietario_id
     or new.asignada_por is distinct from old.asignada_por then
    raise exception 'Esta columna no se puede modificar'
      using errcode = '42501';
  end if;

  -- origen_id lleva una regla propia y NO puede estar en el if de arriba: su
  -- clave foránea es `on delete set null`, y esa acción se ejecuta como un
  -- update de esta fila. Prohibirle todo cambio haría fallar el borrado de
  -- cualquier plantilla que alguien haya tomado. Entonces: se le prohíbe
  -- repuntar a otra rutina y se deja pasar el null.
  if new.origen_id is distinct from old.origen_id
     and new.origen_id is not null then
    raise exception 'El origen de una rutina no se puede cambiar'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger rutinas_columnas_inmutables_trg
  before update on public.rutinas
  for each row execute function public.rutinas_columnas_inmutables();
