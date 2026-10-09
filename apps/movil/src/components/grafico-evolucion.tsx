import { useState } from 'react'
import { View } from 'react-native'
import Svg, { Circle, Defs, G, Line, LinearGradient, Polyline, Stop, Text as TextoSvg } from 'react-native-svg'
import { COLORES, DEGRADE, MARGENES_GRAFICO, TAMANOS, formatearKg, geometriaGrafico, marcarRecords } from '@gym/core'
import { FUENTES } from '@/ui'
import { fechaCorta } from '@/lib/fechas'

const ALTO = 240

/**
 * Traduce la geometría de @gym/core a react-native-svg y nada más: las escalas,
 * los récords y las fechas a mostrar se calculan allá, con tests. Un dibujo
 * quieto, sin gestos —ver la sección 4 del diseño de la etapa 3—. La línea lleva
 * el degradé de la marca; los récords, el dorado.
 */
export function GraficoEvolucion({ valores, fechas }: { valores: number[]; fechas: string[] }) {
  // El ancho se conoce recién al dibujarse: hasta entonces no hay gráfico.
  const [ancho, setAncho] = useState(0)
  const g = geometriaGrafico(valores, ancho, ALTO)
  const records = marcarRecords(valores)

  return (
    <View style={{ height: ALTO }} onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
      {ancho > 0 && (
        <Svg width={ancho} height={ALTO}>
          <Defs>
            {/* En unidades del usuario: con las del cuadro, una línea horizontal
                (todos los valores iguales) tiene alto cero y el degradé no se pinta. */}
            <LinearGradient
              id="trazo" gradientUnits="userSpaceOnUse"
              x1={MARGENES_GRAFICO.izq} x2={ancho - MARGENES_GRAFICO.der} y1={0} y2={0}
            >
              <Stop offset="0" stopColor={DEGRADE.desde} />
              <Stop offset="1" stopColor={DEGRADE.hasta} />
            </LinearGradient>
          </Defs>

          {g.guias.map((guia, i) => (
            <G key={i}>
              <Line
                x1={MARGENES_GRAFICO.izq} x2={ancho - MARGENES_GRAFICO.der}
                y1={guia.y} y2={guia.y} stroke={COLORES.superficieBorde} strokeWidth={1}
              />
              <TextoSvg
                x={MARGENES_GRAFICO.izq - 6} y={guia.y + 4}
                fontSize={TAMANOS.mini} fontFamily={FUENTES.normal}
                fill={COLORES.textoTenue} textAnchor="end"
              >
                {formatearKg(guia.valor)}
              </TextoSvg>
            </G>
          ))}

          {g.puntos.length > 1 && (
            <Polyline
              points={g.puntos.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke="url(#trazo)" strokeWidth={3}
              strokeLinejoin="round" strokeLinecap="round"
            />
          )}

          {g.puntos.map((p, i) => (
            <Circle
              key={i} cx={p.x} cy={p.y}
              r={records[i] ? 6 : 3.5}
              fill={records[i] ? COLORES.record : COLORES.texto}
              stroke={COLORES.fondo} strokeWidth={records[i] ? 2 : 0}
            />
          ))}

          {g.etiquetasX.map((etiqueta) => (
            <TextoSvg
              key={etiqueta.indice} x={etiqueta.x} y={ALTO - 6}
              fontSize={TAMANOS.mini} fontFamily={FUENTES.normal}
              fill={COLORES.textoTenue} textAnchor="middle"
            >
              {fechaCorta(fechas[etiqueta.indice] ?? '')}
            </TextoSvg>
          ))}
        </Svg>
      )}
    </View>
  )
}
