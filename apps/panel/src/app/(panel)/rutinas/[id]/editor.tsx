'use client'

import { useState, useTransition } from 'react'
import {
  agregarDia, agregarEjercicio, borrarDia, borrarEjercicio,
  reordenarDias, reordenarEjercicios,
} from './acciones'

interface EjercicioEnDia {
  id: string
  orden: number
  series: number
  repeticiones: string
  descanso_seg: number | null
  ejercicios: { id: string; nombre: string } | null
}

interface Dia {
  id: string
  orden: number
  nombre: string
  rutina_ejercicios: EjercicioEnDia[]
}

interface Rutina {
  id: string
  nombre: string
  rutina_dias: Dia[]
}

export function Editor({
  rutina,
  ejercicios,
}: {
  rutina: Rutina
  ejercicios: { id: string; nombre: string }[]
}) {
  const dias = [...rutina.rutina_dias].sort((a, b) => a.orden - b.orden)
  // Arranca en null y NO en dias[0]: el estado se calcula una sola vez, así
  // que fijarlo al montar dejaba el panel derecho vacío después de agregarle
  // el primer día a una rutina que no tenía ninguno.
  const [diaActivoId, setDiaActivoId] = useState<string | null>(null)
  const [nombreDia, setNombreDia] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const [arrastrado, setArrastrado] = useState<string | null>(null)

  // El ?? dias[0] cubre los dos casos en que diaActivoId no apunta a nada:
  // todavía no se eligió ninguno, y se borró el que estaba activo habiendo
  // otros. Sin él, el panel derecho decía "Agregá un día para empezar" con
  // días en la lista.
  const diaActivo = dias.find((d) => d.id === diaActivoId) ?? dias[0] ?? null
  const ejerciciosDelDia = diaActivo
    ? [...diaActivo.rutina_ejercicios].sort((a, b) => a.orden - b.orden)
    : []

  const correr = (fn: () => Promise<{ error?: string }>) =>
    iniciar(async () => setError((await fn()).error ?? null))

  // Mueve `arrastrado` a la posición de `destinoId` y manda la lista completa:
  // las funciones reordenar_* exigen una permutación exacta.
  const soltarEn = (
    lista: { id: string }[],
    destinoId: string,
    guardar: (ids: string[]) => Promise<{ error?: string }>,
  ) => {
    if (!arrastrado || arrastrado === destinoId) return
    const ids = lista.map((x) => x.id).filter((x) => x !== arrastrado)
    ids.splice(ids.indexOf(destinoId), 0, arrastrado)
    setArrastrado(null)
    correr(() => guardar(ids))
  }

  return (
    <div className="space-y-4">
      <h1 className="titulo-pagina">{rutina.nombre}</h1>
      {error && <p className="text-rechazo">{error}</p>}

      <div className="grid grid-cols-[260px_1fr] gap-6">
        <section>
          <h2 className="etiqueta mb-2">Días</h2>
          <ul className="space-y-2">
            {dias.map((d) => (
              <li
                key={d.id}
                draggable
                onDragStart={() => setArrastrado(d.id)}
                onDragOver={(ev) => ev.preventDefault()}
                onDrop={() => soltarEn(dias, d.id, (ids) => reordenarDias(rutina.id, ids))}
                onClick={() => setDiaActivoId(d.id)}
                className={`tarjeta flex cursor-grab items-center gap-2 ${
                  d.id === diaActivo?.id ? 'bg-superficie-elevada font-semibold' : ''
                }`}
              >
                <span className="text-texto-tenue">⣿</span>
                <span className="flex-1">{d.nombre}</span>
                <span className="text-sm text-texto-secundario">
                  {d.rutina_ejercicios.length}
                </span>
                <button
                  onClick={(ev) => {
                    ev.stopPropagation()
                    correr(() => borrarDia(d.id, rutina.id))
                  }}
                  className="text-sm text-texto-secundario hover:text-rechazo"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex gap-2">
            <input
              value={nombreDia}
              onChange={(ev) => setNombreDia(ev.target.value)}
              placeholder="Día 4 — Hombros"
              className="campo"
            />
            <button
              disabled={pendiente}
              onClick={() =>
                correr(async () => {
                  const r = await agregarDia(rutina.id, nombreDia)
                  if (!r.error) setNombreDia('')
                  return r
                })
              }
              className="boton boton-secundario"
            >
              +
            </button>
          </div>
        </section>

        <section>
          <h2 className="etiqueta mb-2">
            {diaActivo ? diaActivo.nombre : 'Agregá un día para empezar'}
          </h2>

          {diaActivo && (
            <>
              <ul className="space-y-2">
                {ejerciciosDelDia.map((x) => (
                  <li
                    key={x.id}
                    draggable
                    onDragStart={() => setArrastrado(x.id)}
                    onDragOver={(ev) => ev.preventDefault()}
                    onDrop={() =>
                      soltarEn(ejerciciosDelDia, x.id, (ids) =>
                        reordenarEjercicios(diaActivo.id, rutina.id, ids),
                      )
                    }
                    className="tarjeta flex cursor-grab items-center gap-3"
                  >
                    <span className="text-texto-tenue">⣿</span>
                    <span className="flex-1">{x.ejercicios?.nombre}</span>
                    <span className="text-texto-secundario">
                      {x.series}×{x.repeticiones}
                      {x.descanso_seg ? ` · ${x.descanso_seg}s` : ''}
                    </span>
                    <button
                      onClick={() => correr(() => borrarEjercicio(x.id, rutina.id))}
                      className="text-sm text-texto-secundario hover:text-rechazo"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              <AltaEjercicio
                ejercicios={ejercicios}
                pendiente={pendiente}
                onAgregar={(datos) =>
                  correr(() =>
                    agregarEjercicio({
                      rutinaId: rutina.id,
                      diaId: diaActivo.id,
                      ...datos,
                    }),
                  )
                }
              />
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function AltaEjercicio({
  ejercicios,
  pendiente,
  onAgregar,
}: {
  ejercicios: { id: string; nombre: string }[]
  pendiente: boolean
  onAgregar: (datos: {
    ejercicioId: string
    series: number
    repeticiones: string
    descansoSeg: number | null
  }) => void
}) {
  const [ejercicioId, setEjercicioId] = useState(ejercicios[0]?.id ?? '')
  const [series, setSeries] = useState('4')
  const [repeticiones, setRepeticiones] = useState('8-12')
  const [descanso, setDescanso] = useState('90')

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select value={ejercicioId} onChange={(ev) => setEjercicioId(ev.target.value)}
        className="campo w-auto">
        {ejercicios.map((e) => (
          <option key={e.id} value={e.id}>{e.nombre}</option>
        ))}
      </select>
      <input value={series} onChange={(ev) => setSeries(ev.target.value)}
        className="campo w-16" placeholder="Series" />
      <input value={repeticiones} onChange={(ev) => setRepeticiones(ev.target.value)}
        className="campo w-24" placeholder="Reps" />
      <input value={descanso} onChange={(ev) => setDescanso(ev.target.value)}
        className="campo w-20" placeholder="Descanso" />
      <button
        disabled={pendiente || !ejercicioId}
        onClick={() =>
          onAgregar({
            ejercicioId,
            series: Number(series) || 0,
            repeticiones,
            descansoSeg: descanso ? Number(descanso) : null,
          })
        }
        className="boton boton-secundario"
      >
        Agregar
      </button>
    </div>
  )
}
