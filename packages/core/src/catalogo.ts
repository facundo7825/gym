import { Constants } from './tipos-db'

// Derivadas del enum de PostgreSQL, no copiadas a mano: `npm run db:tipos`
// regenera tipos-db.ts desde la base, así que estas listas no pueden quedar
// desincronizadas con ella. Una lista escrita a mano sí puede, y en silencio.
export const GRUPOS_MUSCULARES = Constants.public.Enums.grupo_muscular
export const EQUIPAMIENTOS = Constants.public.Enums.tipo_equipamiento
export const OBJETIVOS_RUTINA = Constants.public.Enums.objetivo_rutina
export const NIVELES_RUTINA = Constants.public.Enums.nivel_rutina

export type GrupoMuscular = (typeof GRUPOS_MUSCULARES)[number]
export type Equipamiento = (typeof EQUIPAMIENTOS)[number]
export type ObjetivoRutina = (typeof OBJETIVOS_RUTINA)[number]
export type NivelRutina = (typeof NIVELES_RUTINA)[number]

// El Record exige una clave por cada valor posible. Si mañana se agrega un
// grupo muscular al enum y se regeneran los tipos, esto deja de compilar
// hasta que alguien escriba su etiqueta. Es a propósito: mejor un error de
// compilación que una pantalla mostrando "isquiotibiales_posteriores".
const ETIQUETAS: Record<GrupoMuscular | Equipamiento | ObjetivoRutina | NivelRutina, string> = {
  pecho: 'Pecho', espalda: 'Espalda', hombros: 'Hombros', biceps: 'Bíceps',
  triceps: 'Tríceps', cuadriceps: 'Cuádriceps', isquiotibiales: 'Isquiotibiales',
  gluteos: 'Glúteos', gemelos: 'Gemelos', abdominales: 'Abdominales',
  antebrazo: 'Antebrazo', cuerpo_completo: 'Cuerpo completo',
  barra: 'Barra', mancuerna: 'Mancuerna', maquina: 'Máquina', polea: 'Polea',
  kettlebell: 'Kettlebell', banda: 'Banda', peso_corporal: 'Peso corporal',
  otro: 'Otro',
  fuerza: 'Fuerza', hipertrofia: 'Hipertrofia', resistencia: 'Resistencia',
  perdida_grasa: 'Pérdida de grasa', general: 'General',
  principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado',
}

/** Convierte el valor de la base al texto que ve el usuario. */
export function etiqueta(
  valor: GrupoMuscular | Equipamiento | ObjetivoRutina | NivelRutina,
): string {
  return ETIQUETAS[valor]
}
