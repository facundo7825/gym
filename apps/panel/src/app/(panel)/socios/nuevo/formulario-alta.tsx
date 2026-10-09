'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { generarContrasena } from '@gym/core'
import { darDeAlta, type EstadoAlta } from '../acciones'

const INICIAL: EstadoAlta = {}

export function FormularioAlta({ contrasenaInicial }: { contrasenaInicial: string }) {
  const [estado, accion, pendiente] = useActionState(darDeAlta, INICIAL)
  // Controlada: es la única que cambia sin que la escriba nadie (botón "Otra").
  const [password, setPassword] = useState(contrasenaInicial)
  const [copiado, setCopiado] = useState(false)

  if (estado.hecho) {
    const { hecho } = estado
    const datosDeEntrada = `Email: ${hecho.email}\nContraseña: ${hecho.password}`

    return (
      <div className="tarjeta space-y-4">
        {hecho.resultado === 'creado' ? (
          <>
            <p className="font-semibold">Cuenta creada. Pasale estos datos al socio:</p>
            <pre className="whitespace-pre-wrap rounded-medio bg-hundido p-3 text-sm">{datosDeEntrada}</pre>
            <p className="text-sm text-texto-secundario">
              La contraseña no se vuelve a mostrar. El socio la puede cambiar desde la app, en Perfil.
            </p>
            <button
              type="button" className="boton boton-principal"
              onClick={async () => {
                await navigator.clipboard.writeText(datosDeEntrada)
                setCopiado(true)
              }}
            >
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </>
        ) : (
          <p>
            Esta persona ya tenía cuenta en la app: quedó como socio de este gimnasio y entra con su
            contraseña de siempre.
          </p>
        )}
        <Link href={`/socios/${hecho.membershipId}`} className="boton boton-secundario">
          Ir a su ficha para sacarle la foto
        </Link>
      </div>
    )
  }

  const v = estado.valores

  return (
    <form action={accion} className="tarjeta space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="etiqueta">Nombre</span>
          <input name="nombre" defaultValue={v?.nombre} required autoComplete="off" className="campo" />
        </label>
        <label className="block space-y-1">
          <span className="etiqueta">Apellido</span>
          <input name="apellido" defaultValue={v?.apellido} required autoComplete="off" className="campo" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="etiqueta">Email</span>
        <input name="email" type="email" defaultValue={v?.email} required autoComplete="off" className="campo" />
      </label>
      <label className="block space-y-1">
        <span className="etiqueta">Teléfono (opcional)</span>
        <input name="telefono" type="tel" defaultValue={v?.telefono} autoComplete="off" className="campo" />
      </label>
      <label className="block space-y-1">
        <span className="etiqueta">Contraseña inicial</span>
        <div className="flex gap-2">
          <input
            name="password" value={password} onChange={(ev) => setPassword(ev.target.value)}
            required minLength={8} autoComplete="off" className="campo font-mono"
          />
          <button type="button" className="boton boton-secundario" onClick={() => setPassword(generarContrasena())}>
            Otra
          </button>
        </div>
      </label>

      {estado.error && <p role="alert" className="text-sm text-rechazo">{estado.error}</p>}

      <button type="submit" disabled={pendiente} className="boton boton-principal">
        {pendiente ? 'Creando…' : 'Crear cuenta'}
      </button>
    </form>
  )
}
