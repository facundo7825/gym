import Link from 'next/link'
import { generarContrasena, puede } from '@gym/core'
import { miMembresia } from '@/lib/membresia'
import { FormularioAlta } from './formulario-alta'

export default async function NuevoSocio() {
  const yo = await miMembresia()
  if (!yo || !puede(yo.rol, 'gestionar_socios')) {
    return <p className="tarjeta text-texto-secundario">Solo un administrador puede dar de alta socios.</p>
  }

  return (
    <div className="max-w-lg space-y-6">
      <Link href="/socios" className="enlace text-sm">← Socios</Link>
      <h1 className="titulo-pagina">Nuevo socio</h1>
      {/* Se genera en el servidor en cada visita: la página no se cachea
          porque lee la sesión. */}
      <FormularioAlta contrasenaInicial={generarContrasena()} />
    </div>
  )
}
