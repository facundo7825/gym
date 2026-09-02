import type { Equipamiento, GrupoMuscular } from './catalogo'

/** Lo mínimo que necesita el filtro. La pantalla trae más columnas. */
export interface EjercicioFiltrable {
  id: string
  nombre: string
  grupo_muscular: GrupoMuscular
  equipamiento: Equipamiento
  gym_id: string | null
}

export interface Filtros {
  busqueda: string
  grupo: GrupoMuscular | null
  equipo: Equipamiento | null
  soloMiGym: boolean
}

/**
 * Vive acá y no dentro de la pantalla para poder probarlo: en un componente
 * de React Native esta lógica solo se verifica a mano, tocando la app.
 */
export function filtrarEjercicios(
  ejercicios: EjercicioFiltrable[],
  { busqueda, grupo, equipo, soloMiGym }: Filtros,
): EjercicioFiltrable[] {
  const texto = busqueda.trim().toLowerCase()

  return ejercicios.filter((x) => {
    if (grupo && x.grupo_muscular !== grupo) return false
    if (equipo && x.equipamiento !== equipo) return false
    // "Solo lo que hay acá" = ejercicios propios del gimnasio, que son
    // los que se cargaron sobre máquinas que existen físicamente.
    if (soloMiGym && x.gym_id === null) return false
    // includes() y no una expresión regular: el texto lo escribe el usuario,
    // y un paréntesis suelto rompería un RegExp armado con él.
    if (texto && !x.nombre.toLowerCase().includes(texto)) return false
    return true
  })
}
