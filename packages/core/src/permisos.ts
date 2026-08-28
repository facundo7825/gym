export type Rol = 'socio' | 'entrenador' | 'admin'

export type Accion =
  | 'ver_ejercicios'
  | 'crear_ejercicio'
  | 'subir_video'
  | 'gestionar_maquinas'
  | 'crear_rutina_plantilla'
  | 'asignar_rutina'
  | 'gestionar_socios'
  | 'registrar_cuota'
  | 'escanear_checkin'

const DE_SOCIO: Accion[] = ['ver_ejercicios']

const DE_ENTRENADOR: Accion[] = [
  ...DE_SOCIO,
  'crear_ejercicio',
  'subir_video',
  'gestionar_maquinas',
  'crear_rutina_plantilla',
  'asignar_rutina',
  'escanear_checkin',
]

const DE_ADMIN: Accion[] = [...DE_ENTRENADOR, 'gestionar_socios', 'registrar_cuota']

const PERMISOS: Record<Rol, readonly Accion[]> = {
  socio: DE_SOCIO,
  entrenador: DE_ENTRENADOR,
  admin: DE_ADMIN,
}

/**
 * Ayuda para la interfaz: decide si se muestra un botón o una sección.
 * NO es un control de seguridad. La seguridad real la aplica RLS en la base
 * de datos; esto solo evita mostrarle a alguien una opción que le va a fallar.
 */
export function puede(rol: Rol, accion: Accion): boolean {
  return PERMISOS[rol].includes(accion)
}
