-- Catálogo global: ejercicios que ve todo gimnasio desde el día uno, sin
-- tener que filmar nada. Corre con service_role, así que no pasa por RLS.
-- Todavía sin video: los videos globales se graban aparte y se asocian
-- cuando existan.
insert into ejercicios (gym_id, nombre, grupo_muscular, equipamiento, descripcion) values
  (null, 'Press de banca con barra',    'pecho',          'barra',         'Acostado en banco plano, barra a la altura del pecho.'),
  (null, 'Press inclinado con mancuernas', 'pecho',       'mancuerna',     'Banco a 30-45 grados.'),
  (null, 'Dominadas',                   'espalda',        'peso_corporal', 'Agarre prono, más ancho que los hombros.'),
  (null, 'Remo con barra',              'espalda',        'barra',         'Torso inclinado a 45 grados, espalda recta.'),
  (null, 'Jalón al pecho en polea',     'espalda',        'polea',         'Llevar la barra al pecho, no a la nuca.'),
  (null, 'Press militar con barra',     'hombros',        'barra',         'De pie, barra desde los hombros hasta arriba.'),
  (null, 'Elevaciones laterales',       'hombros',        'mancuerna',     'Subir hasta la altura de los hombros.'),
  (null, 'Curl de bíceps con barra',    'biceps',         'barra',         'Codos pegados al cuerpo.'),
  (null, 'Fondos en paralelas',         'triceps',        'peso_corporal', 'Torso vertical para cargar tríceps.'),
  (null, 'Sentadilla con barra',        'cuadriceps',     'barra',         'Barra en la espalda alta, bajar hasta paralelo.'),
  (null, 'Peso muerto',                 'isquiotibiales', 'barra',         'Espalda neutra, barra pegada a las piernas.'),
  (null, 'Plancha abdominal',           'abdominales',    'peso_corporal', 'Cuerpo alineado, sin hundir la cadera.');
