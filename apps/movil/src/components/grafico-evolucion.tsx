import { useState } from 'react'
import { View } from 'react-native'
import Svg, { Circle, G, Line, Polyline, Text as TextoSvg } from 'react-native-svg'
import { MARGENES_GRAFICO, formatearKg, geometriaGrafico, marcarRecords } from '@gym/core'
import { fechaCorta } from '@/lib/fechas'

const ALTO = 240
const DORADO = '#d69e2e'
const GRIS = '#999'

/**
 * Traduce la geometría de @gym/core a react-native-svg y nada más: las escalas,
 * los récords y las fechas a mostrar se calculan allá, con tests. Un dibujo
 * quieto, sin gestos —ver la sección 4 del diseño de la etapa 3—.
 */
export function GraficoEvolucion({ valores, fechas, color }: {
  valores: number[]
  fechas: string[]
  color: string
}) {
  // El ancho se conoce recién al dibujarse: hasta entonces no hay gráfico.
  const [ancho, setAncho] = useState(0)
  const g = geometriaGrafico(valores, ancho, ALTO)
  const records = marcarRecords(valores)

  return (
    <View style={{ height: ALTO }} onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
      {ancho > 0 && (
        <Svg width={ancho} height={ALTO}>
          {g.guias.map((guia, i) => (
            <G key={i}>
              <Line
                x1={MARGENES_GRAFICO.izq} x2={ancho - MARGENES_GRAFICO.der}
                y1={guia.y} y2={guia.y} stroke={GRIS} strokeOpacity={0.3} strokeWidth={1}
              />
              <TextoSvg
                x={MARGENES_GRAFICO.izq - 6} y={guia.y + 4}
                fontSize={11} fill={GRIS} textAnchor="end"
              >
                {formatearKg(guia.valor)}
              </TextoSvg>
            </G>
          ))}

          {g.puntos.length > 1 && (
            <Polyline
              points={g.puntos.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round"
            />
          )}

          {g.puntos.map((p, i) => (
            <Circle
              key={i} cx={p.x} cy={p.y}
              r={records[i] ? 5 : 3} fill={records[i] ? DORADO : color}
            />
          ))}

          {g.etiquetasX.map((etiqueta) => (
            <TextoSvg
              key={etiqueta.indice} x={etiqueta.x} y={ALTO - 6}
              fontSize={11} fill={GRIS} textAnchor="middle"
            >
              {fechaCorta(fechas[etiqueta.indice] ?? '')}
            </TextoSvg>
          ))}
        </Svg>
      )}
    </View>
  )
}
