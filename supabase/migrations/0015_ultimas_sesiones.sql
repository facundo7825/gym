-- ---------------------------------------------------------------------------
-- Las últimas sesiones de cada socio, para su ficha en el panel.
--
-- Una vista y no un `limit` sobre la tabla: "las tres últimas de CADA socio"
-- no se puede pedir así. Con un gimnasio de 300 socios, las 200 sesiones más
-- recientes cubren un día y medio, y la ficha de quien entrenó el lunes
-- quedaría vacía.
--
-- security_invoker: no agrega permisos. Corre con la RLS de quien consulta
-- —el personal ve las de su gimnasio, un socio las suyas—, igual que
-- mejores_marcas en 0014.
-- ---------------------------------------------------------------------------

create view public.ultimas_sesiones
with (security_invoker = true)
as
select id, membership_id, inicio, fin, dia_nombre, series
from (
  select
    s.id,
    s.membership_id,
    s.inicio,
    s.fin,
    d.nombre as dia_nombre,
    (
      select count(*)::int
      from public.series_registradas sr
      where sr.sesion_id = s.id and sr.completada
    ) as series,
    row_number() over (partition by s.membership_id order by s.inicio desc) as posicion
  from public.sesiones s
  left join public.rutina_dias d on d.id = s.rutina_dia_id
) recientes
where posicion <= 3;
