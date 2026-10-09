# Rediseño visual — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la app del socio y el panel del gimnasio tengan una identidad visual moderna de fitness —"Neón eléctrico": azul noche, degradé violeta→cian, tarjetas tipo vidrio, Sora— sin cambiar ninguna función.

**Architecture:** Los valores del sistema (colores, degradé, radios, espaciado, tamaños) viven en `packages/core/src/tema.ts` y los usan las dos apps. La app arma todas sus pantallas con un puñado de componentes base en `apps/movil/src/ui/`. El panel repite los valores en el `@theme` de Tailwind 4 —que no puede importar TypeScript— y un test de core verifica que coincidan. El rediseño no toca lógica: cambia JSX y estilos.

**Tech Stack:** TypeScript, Expo SDK 57 / React Native 0.86 (`expo-linear-gradient`, `expo-haptics`, `@expo-google-fonts/sora`, `@expo/vector-icons`), Next.js 16 + Tailwind 4 (`next/font`, `lucide-react`), vitest.

**Spec:** [`docs/superpowers/specs/2026-10-09-rediseno-visual-design.md`](../specs/2026-10-09-rediseno-visual-design.md)

## Global Constraints

- **No cambia ninguna función.** Ni lógica, ni consultas, ni navegación, ni flujos: Empezar, tildar, Terminar, retomar, sincronizar, armar rutinas, asignar, subir videos siguen igual. Una tarea que necesite tocar lógica para estilizar algo está mal planteada: parar y avisar. Las dos únicas excepciones las fija el spec: el cronómetro de la sesión y la vibración al tildar (Tarea 4).
- **Ningún color, radio, tamaño de letra ni espaciado escrito a mano en una pantalla.** Todo sale de `@gym/core` (`COLORES`, `RADIOS`, `ESPACIO`, `TAMANOS`) en la app, o de las clases del tema en el panel.
- **El degradé, para una sola acción o dato destacado por pantalla** (spec §2): el botón principal, el tilde hecho, el aviso de récord, la pestaña activa, la tarjeta "Hoy toca".
- **Todo lo que se toca mide al menos 44 px** (`TOQUE_MINIMO`), con `hitSlop` si el elemento visible es más chico.
- **Solo modo oscuro**, en las dos apps.
- **Texto de interfaz, identificadores y comentarios en castellano**, como todo el repo. Los textos que el usuario ya ve no se cambian salvo que el plan lo diga.
- **App móvil:** antes de usar una API de Expo, leer la documentación de la versión 57 (https://docs.expo.dev/versions/v57.0.0/) —lo exige `apps/movil/AGENTS.md`—. Dependencias nativas con `npx expo install`, nunca `npm install`.
- **Verificación de cada tarea de interfaz:** `npx tsc --noEmit` y `npm run lint` en la app correspondiente. En `apps/movil` ya hay un error de lint previo en `src/app/(tabs)/ejercicios/[id].tsx:85` (etapa 1): "sin errores" significa sin errores nuevos. Si una tarea reescribe ese archivo y el error desaparece, mejor. En un checkout fresco: `npx next typegen` en el panel y `CI=1 timeout 120 npx expo start --offline` en la app antes de `tsc`, para generar los tipos de rutas.
- **La revisión visual la hace el controlador**, no el implementador: después de cada tarea de interfaz abre las pantallas —el panel en Chrome; la app en web si `expo-sqlite` lo permite, si no, el usuario manda capturas del teléfono— y las compara contra las maquetas aprobadas.
- **Los tests de la etapa 3 tienen que seguir pasando igual:** `npm run test:core` y `npm run test:rls`. El rediseño no toca nada que testeen, salvo los archivos nuevos de core.
- **Cada tarea termina en un commit**, mensaje en castellano, imperativo, explicando el porqué. Cada mensaje termina con una línea en blanco y esta línea literal, sea cual sea el modelo que commitea: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

---

## Estructura de archivos

**Core**

| Archivo | Responsabilidad |
|---|---|
| `packages/core/src/tema.ts` | Los valores del sistema y `contraste()` |
| `packages/core/src/tiempo.ts` | `formatearCronometro()` |
| `packages/core/tests/tema.test.ts` | Contraste mínimo y coincidencia con `globals.css` del panel |
| `packages/core/tests/tiempo.test.ts` | El formato del cronómetro |

**App**

| Archivo | Responsabilidad |
|---|---|
| `apps/movil/src/ui/fondo.tsx` | Fondo con degradé de cada pantalla |
| `apps/movil/src/ui/texto.tsx` | Texto con Sora y la escala de tamaños |
| `apps/movil/src/ui/tarjeta.tsx` | Superficie de vidrio; variante destacada con degradé |
| `apps/movil/src/ui/boton.tsx` | Principal, secundario, peligro |
| `apps/movil/src/ui/chip.tsx` | Selección |
| `apps/movil/src/ui/campo.tsx` | Entrada de texto con foco violeta |
| `apps/movil/src/ui/fila-serie.tsx` | La fila de la sesión: número, peso, reps, tilde |
| `apps/movil/src/ui/aviso.tsx` | Pendiente, rechazo, récord |
| `apps/movil/src/ui/cronometro.tsx` | Tiempo desde el inicio de la sesión |
| `apps/movil/src/ui/navegacion.ts` | Tema oscuro de React Navigation y opciones de encabezado |
| `apps/movil/src/ui/index.ts` | Reexporta todo lo anterior |
| `apps/movil/src/app/_layout.tsx` | Carga Sora, tema oscuro, barra de estado clara |
| `apps/movil/src/app/(tabs)/_layout.tsx` | Barra de pestañas con íconos |
| El resto de `apps/movil/src/app/**` y `src/components/**` | Pasan a usar `@/ui` |

**Panel**

| Archivo | Responsabilidad |
|---|---|
| `apps/panel/src/app/globals.css` | `@theme` con los valores de `tema.ts` y las clases de componente |
| `apps/panel/src/app/layout.tsx` | Sora con `next/font`, modo oscuro |
| `apps/panel/src/app/(panel)/layout.tsx` | Barra lateral con íconos |
| El resto de `apps/panel/src/app/**` | Pasan a usar las clases del tema |

---

## Tarea 1: Los valores del sistema en `@gym/core`

**Files:**
- Create: `packages/core/src/tema.ts`
- Create: `packages/core/src/tiempo.ts`
- Create: `packages/core/tests/tema.test.ts`
- Create: `packages/core/tests/tiempo.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/panel/src/app/globals.css` (solo el bloque `@theme`; las clases de componente llegan en la Tarea 7)

**Interfaces:**
- Consumes: nada.
- Produces (exportado desde `@gym/core`):
  - `COLORES` con las claves `fondo, fondoAlto, fondoBarra, superficie, superficieBorde, superficieElevada, hundido, texto, textoSecundario, textoTenue, violeta, cian, sobreDegrade, pendiente, pendienteSuave, rechazo, rechazoSuave, record, velo` (strings).
  - `DEGRADE = { desde, hasta }` (strings).
  - `RADIOS = { chico: 10, medio: 14, grande: 18, enorme: 24 }`
  - `ESPACIO = { xs: 4, s: 8, m: 12, l: 16, xl: 24 }`
  - `TAMANOS = { titulo: 28, subtitulo: 22, grande: 17, cuerpo: 15, chico: 13, mini: 11 }`
  - `TOQUE_MINIMO = 44`
  - `VARIABLES_CSS: Record<string, string>` — nombre de variable CSS del panel → valor.
  - `contraste(a: string, b: string): number` — relación de contraste WCAG entre dos colores `#RRGGBB`.
  - `formatearCronometro(segundos: number): string`

- [ ] **Step 1: Escribir los tests**

Crear `packages/core/tests/tema.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COLORES, VARIABLES_CSS, contraste } from '../src/tema'

describe('contraste', () => {
  it('negro sobre blanco es 21', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })

  it('un color contra sí mismo es 1', () => {
    expect(contraste('#7C5CFF', '#7C5CFF')).toBeCloseTo(1, 5)
  })

  it('no depende del orden', () => {
    expect(contraste(COLORES.texto, COLORES.fondo)).toBe(contraste(COLORES.fondo, COLORES.texto))
  })
})

// El mínimo de accesibilidad para texto normal es 4,5:1. El tenue queda para
// datos de apoyo, nunca para algo que haya que leer para avanzar (spec §2).
describe('el texto se lee sobre el fondo', () => {
  it('el principal supera 4,5:1', () => {
    expect(contraste(COLORES.texto, COLORES.fondo)).toBeGreaterThanOrEqual(4.5)
  })

  it('el secundario supera 4,5:1', () => {
    expect(contraste(COLORES.textoSecundario, COLORES.fondo)).toBeGreaterThanOrEqual(4.5)
  })

  it('los avisos de pendiente y rechazo también', () => {
    expect(contraste(COLORES.pendiente, COLORES.fondo)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(COLORES.rechazo, COLORES.fondo)).toBeGreaterThanOrEqual(4.5)
  })
})

// Tailwind 4 define el tema del panel en CSS y no puede importar este archivo:
// los valores se repiten en globals.css. Este test es lo que impide que se
// desincronicen sin que nadie lo note.
describe('el tema del panel coincide con el de core', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../../apps/panel/src/app/globals.css', import.meta.url)),
    'utf8',
  ).toLowerCase()

  for (const [variable, valor] of Object.entries(VARIABLES_CSS)) {
    it(`${variable} vale ${valor}`, () => {
      expect(css).toContain(`${variable}: ${valor.toLowerCase()};`)
    })
  }
})
```

Crear `packages/core/tests/tiempo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatearCronometro } from '../src/tiempo'

describe('formatearCronometro', () => {
  it('arranca en 0:00', () => {
    expect(formatearCronometro(0)).toBe('0:00')
  })

  it('minutos y segundos con dos cifras', () => {
    expect(formatearCronometro(65)).toBe('1:05')
    expect(formatearCronometro(24 * 60 + 10)).toBe('24:10')
  })

  it('pasada la hora, suma las horas', () => {
    expect(formatearCronometro(3725)).toBe('1:02:05')
  })

  // El reloj del teléfono se puede atrasar en el medio de una sesión.
  it('un valor negativo o roto se muestra como 0:00', () => {
    expect(formatearCronometro(-30)).toBe('0:00')
    expect(formatearCronometro(NaN)).toBe('0:00')
  })

  it('redondea hacia abajo los segundos fraccionarios', () => {
    expect(formatearCronometro(59.9)).toBe('0:59')
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:core`
Expected: FAIL — `Failed to resolve import "../src/tema"` y `"../src/tiempo"`.

- [ ] **Step 3: Escribir `tema.ts`**

Crear `packages/core/src/tema.ts`:

```ts
/**
 * Los valores del sistema visual —"Neón eléctrico", ver el diseño del
 * rediseño—. Solo valores: los usan la app (directamente) y el panel (repetidos
 * en el @theme de globals.css, con un test que los compara).
 *
 * Ninguna pantalla escribe un color, un radio o un tamaño a mano. Cambiar la
 * marca es cambiar este archivo.
 */

export const COLORES = {
  /** Fondo de todas las pantallas. */
  fondo: '#0A0F1E',
  /** Hacia dónde va el degradé del fondo, arriba. */
  fondoAlto: '#1E1650',
  /** La barra de pestañas: el fondo casi opaco. */
  fondoBarra: 'rgba(10,15,30,0.96)',
  /** Tarjetas tipo vidrio. */
  superficie: 'rgba(255,255,255,0.05)',
  superficieBorde: 'rgba(255,255,255,0.08)',
  /** Campos, filas abiertas, modales. */
  superficieElevada: 'rgba(255,255,255,0.08)',
  /** El interior de los campos de texto: más oscuro que el fondo. */
  hundido: 'rgba(0,0,0,0.3)',
  texto: '#EEF1FF',
  textoSecundario: '#8C93B8',
  /** Solo para datos de apoyo: no llega a 4,5:1. */
  textoTenue: '#5B6290',
  violeta: '#7C5CFF',
  cian: '#22D3EE',
  /** Píldoras y detalles encima del degradé. */
  sobreDegrade: 'rgba(255,255,255,0.2)',
  /** "N series sin sincronizar". */
  pendiente: '#F59E0B',
  pendienteSuave: 'rgba(245,158,11,0.12)',
  /** "No se pudo guardar", errores. */
  rechazo: '#F87171',
  /** Fondo de los avisos de error y del botón de peligro. */
  rechazoSuave: 'rgba(248,113,113,0.12)',
  /** Puntos de récord en el gráfico. */
  record: '#FACC15',
  /** Lo que oscurece la pantalla detrás de un modal. */
  velo: 'rgba(0,0,0,0.4)',
} as const

/** Violeta → cian, a 135°. Para una sola acción o dato destacado por pantalla. */
export const DEGRADE = { desde: COLORES.violeta, hasta: COLORES.cian } as const

export const RADIOS = { chico: 10, medio: 14, grande: 18, enorme: 24 } as const

export const ESPACIO = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const

export const TAMANOS = { titulo: 28, subtitulo: 22, grande: 17, cuerpo: 15, chico: 13, mini: 11 } as const

/** Lo mínimo que mide algo que se toca: se usa con las manos transpiradas o con guantes. */
export const TOQUE_MINIMO = 44

/**
 * Los mismos valores con el nombre de variable que usa el @theme del panel.
 * El test de tema compara este mapa contra globals.css.
 */
export const VARIABLES_CSS: Record<string, string> = {
  '--color-fondo': COLORES.fondo,
  '--color-fondo-alto': COLORES.fondoAlto,
  '--color-fondo-barra': COLORES.fondoBarra,
  '--color-superficie': COLORES.superficie,
  '--color-superficie-borde': COLORES.superficieBorde,
  '--color-superficie-elevada': COLORES.superficieElevada,
  '--color-hundido': COLORES.hundido,
  '--color-texto': COLORES.texto,
  '--color-texto-secundario': COLORES.textoSecundario,
  '--color-texto-tenue': COLORES.textoTenue,
  '--color-violeta': COLORES.violeta,
  '--color-cian': COLORES.cian,
  '--color-sobre-degrade': COLORES.sobreDegrade,
  '--color-pendiente': COLORES.pendiente,
  '--color-pendiente-suave': COLORES.pendienteSuave,
  '--color-rechazo': COLORES.rechazo,
  '--color-rechazo-suave': COLORES.rechazoSuave,
  '--color-record': COLORES.record,
  '--color-velo': COLORES.velo,
  '--radius-chico': `${RADIOS.chico}px`,
  '--radius-medio': `${RADIOS.medio}px`,
  '--radius-grande': `${RADIOS.grande}px`,
  '--radius-enorme': `${RADIOS.enorme}px`,
}

function luminancia(hex: string): number {
  const canales = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = canales.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** La relación de contraste WCAG entre dos colores `#RRGGBB`, de 1 a 21. */
export function contraste(a: string, b: string): number {
  const [clara, oscura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (clara! + 0.05) / (oscura! + 0.05)
}
```

- [ ] **Step 4: Escribir `tiempo.ts`**

Crear `packages/core/src/tiempo.ts`:

```ts
const dosCifras = (n: number) => String(n).padStart(2, '0')

/**
 * El cronómetro de la sesión: "0:00", "24:10", "1:02:05". Un valor negativo o
 * roto —el reloj del teléfono se atrasó— se muestra como "0:00" en vez de
 * números negativos.
 */
export function formatearCronometro(segundos: number): string {
  const total = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const segs = total % 60
  return horas > 0
    ? `${horas}:${dosCifras(minutos)}:${dosCifras(segs)}`
    : `${minutos}:${dosCifras(segs)}`
}
```

- [ ] **Step 5: Exportar desde el índice**

Agregar al final de `packages/core/src/index.ts`:

```ts
export {
  COLORES, DEGRADE, RADIOS, ESPACIO, TAMANOS, TOQUE_MINIMO, VARIABLES_CSS, contraste,
} from './tema'
export { formatearCronometro } from './tiempo'
```

- [ ] **Step 6: El `@theme` del panel**

Reemplazar el contenido entero de `apps/panel/src/app/globals.css` por:

```css
@import "tailwindcss";

/*
 * Los valores del sistema visual. Son los mismos de packages/core/src/tema.ts:
 * Tailwind no puede importar TypeScript, así que se repiten acá, y
 * packages/core/tests/tema.test.ts verifica que coincidan. Cambiar uno sin el
 * otro rompe ese test.
 */
@theme {
  --color-fondo: #0a0f1e;
  --color-fondo-alto: #1e1650;
  --color-fondo-barra: rgba(10,15,30,0.96);
  --color-superficie: rgba(255,255,255,0.05);
  --color-superficie-borde: rgba(255,255,255,0.08);
  --color-superficie-elevada: rgba(255,255,255,0.08);
  --color-hundido: rgba(0,0,0,0.3);
  --color-texto: #eef1ff;
  --color-texto-secundario: #8c93b8;
  --color-texto-tenue: #5b6290;
  --color-violeta: #7c5cff;
  --color-cian: #22d3ee;
  --color-sobre-degrade: rgba(255,255,255,0.2);
  --color-pendiente: #f59e0b;
  --color-pendiente-suave: rgba(245,158,11,0.12);
  --color-rechazo: #f87171;
  --color-rechazo-suave: rgba(248,113,113,0.12);
  --color-record: #facc15;
  --color-velo: rgba(0,0,0,0.4);
  --radius-chico: 10px;
  --radius-medio: 14px;
  --radius-grande: 18px;
  --radius-enorme: 24px;
  --font-sans: var(--font-sora), ui-sans-serif, system-ui, sans-serif;
}

html {
  color-scheme: dark;
}

body {
  background: radial-gradient(90% 70% at 100% 0%, var(--color-fondo-alto) 0%, var(--color-fondo) 55%) fixed;
  background-color: var(--color-fondo);
  color: var(--color-texto);
  font-family: var(--font-sans);
}
```

`--font-sora` lo define la Tarea 7 con `next/font`. Hasta entonces el panel cae a la fuente del sistema, que es lo esperado en esta tarea.

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `npm run test:core`
Expected: PASS. `tema.test.ts` suma 29 tests (3 de contraste, 3 de lectura, 23 de variables) y `tiempo.test.ts` 5.

Si un test de variables falla, la diferencia está entre `VARIABLES_CSS` y `globals.css`: la comparación es en minúsculas y espera exactamente `nombre: valor;`.

- [ ] **Step 8: Verificar el panel**

Run (desde `apps/panel`): `npx tsc --noEmit && npm run lint`
Expected: sin errores. El panel queda con el fondo oscuro y el texto claro, pero todavía con las clases viejas (`bg-white`, `text-gray-600`...) en las páginas: es esperado hasta la Tarea 8.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/tema.ts packages/core/src/tiempo.ts packages/core/tests/tema.test.ts packages/core/tests/tiempo.test.ts packages/core/src/index.ts apps/panel/src/app/globals.css
git commit -m "Centralizar los valores del sistema visual en core

Colores, degradé, radios, espaciado y tamaños viven en un solo archivo
que usan las dos apps. El panel los repite en su @theme porque Tailwind
no importa TypeScript, y un test los compara para que no se separen.
El contraste mínimo del texto queda probado en vez de confiado.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 2: La base de la app

**Files:**
- Modify: `apps/movil/package.json` (vía `npx expo install`)
- Modify: `apps/movil/app.json`
- Create: `apps/movil/src/ui/fondo.tsx`, `texto.tsx`, `tarjeta.tsx`, `boton.tsx`, `chip.tsx`, `campo.tsx`, `fila-serie.tsx`, `aviso.tsx`, `cronometro.tsx`, `navegacion.ts`, `index.ts`
- Modify: `apps/movil/src/app/_layout.tsx`
- Modify: `apps/movil/src/app/(tabs)/_layout.tsx`
- Modify: `apps/movil/src/components/aviso-sincronizacion.tsx`

**Interfaces:**
- Consumes: de `@gym/core` (Tarea 1): `COLORES`, `DEGRADE`, `RADIOS`, `ESPACIO`, `TAMANOS`, `TOQUE_MINIMO`, `formatearCronometro`.
- Produces (todo importable desde `@/ui`):
  - `<Fondo style? children />` — fondo con degradé; ocupa todo (`flex: 1`).
  - `<Texto variante? tono? peso? numerico? {...TextProps} />` — `variante: 'titulo'|'subtitulo'|'grande'|'cuerpo'|'chico'|'mini'` (default `'cuerpo'`), `tono: 'normal'|'secundario'|'tenue'|'pendiente'|'rechazo'|'cian'` (default `'normal'`), `peso: 'normal'|'semi'|'negrita'`.
  - `<Tarjeta destacada? style? children />`
  - `<Boton titulo onPress variante? deshabilitado? icono? style? />` — `variante: 'principal'|'secundario'|'peligro'|'claro'`; `icono` es un nombre de Ionicons. `claro` es para ir sobre la tarjeta destacada, que ya tiene el degradé.
  - `<Chip texto activo onPress />`
  - `<Campo {...TextInputProps} numerico? />`
  - `<FilaSerie numero peso reps registrada onCambiarPeso onCambiarReps onTildar />`
  - `<Aviso tono texto />` — `tono: 'pendiente'|'rechazo'|'record'`.
  - `<Cronometro inicio />` — `inicio: string | null` (ISO).
  - `TEMA_NAVEGACION` (Theme de React Navigation) y `OPCIONES_ENCABEZADO` (opciones de Stack).
  - `FUENTES = { normal, semi, negrita }` — nombres de familia de Sora.

- [ ] **Step 1: Instalar las dependencias**

Leer antes, en la documentación de la versión 57, las páginas de `expo-linear-gradient`, `expo-haptics`, `expo-font` y la guía de fuentes (`@expo-google-fonts`), y `@expo/vector-icons`.

Run (desde `apps/movil`): `npx expo install expo-linear-gradient expo-haptics @expo-google-fonts/sora @expo/vector-icons`
Expected: las cuatro en `dependencies`.

- [ ] **Step 2: Forzar el modo oscuro**

En `apps/movil/app.json`, cambiar `"userInterfaceStyle": "automatic"` por `"userInterfaceStyle": "dark"`. Si `npx expo install` agregó plugins a `app.json`, se dejan.

- [ ] **Step 3: Los componentes base**

Crear `apps/movil/src/ui/texto.tsx`:

```tsx
import { Text, type TextProps } from 'react-native'
import { COLORES, TAMANOS } from '@gym/core'

/** Los nombres que registra useFonts en el layout raíz. */
export const FUENTES = {
  normal: 'Sora_400Regular',
  semi: 'Sora_600SemiBold',
  negrita: 'Sora_700Bold',
} as const

const TONOS = {
  normal: COLORES.texto,
  secundario: COLORES.textoSecundario,
  tenue: COLORES.textoTenue,
  pendiente: COLORES.pendiente,
  rechazo: COLORES.rechazo,
  cian: COLORES.cian,
} as const

type Variante = keyof typeof TAMANOS
type Tono = keyof typeof TONOS
type Peso = keyof typeof FUENTES

const PESO_POR_VARIANTE: Record<Variante, Peso> = {
  titulo: 'negrita', subtitulo: 'negrita', grande: 'semi', cuerpo: 'normal', chico: 'normal', mini: 'normal',
}

interface Props extends TextProps {
  variante?: Variante
  tono?: Tono
  peso?: Peso
  /** Cifras de ancho fijo: peso, repeticiones, reloj. Que no "bailen" al cambiar. */
  numerico?: boolean
}

/**
 * Todo texto de la app pasa por acá. La familia ya trae el peso —con una fuente
 * cargada, `fontWeight` en Android elige otra familia—, así que nunca se
 * combina con fontWeight.
 */
export function Texto({ variante = 'cuerpo', tono = 'normal', peso, numerico, style, ...resto }: Props) {
  const tamano = TAMANOS[variante]
  return (
    <Text
      {...resto}
      style={[
        {
          fontFamily: FUENTES[peso ?? PESO_POR_VARIANTE[variante]],
          fontSize: tamano,
          lineHeight: Math.round(tamano * 1.3),
          color: TONOS[tono],
        },
        numerico && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  )
}
```

Crear `apps/movil/src/ui/fondo.tsx`:

```tsx
import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORES } from '@gym/core'

/** El fondo de cada pantalla: azul noche, con un resplandor violeta arriba a la derecha. */
export function Fondo({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      colors={[COLORES.fondoAlto, COLORES.fondo, COLORES.fondo]}
      locations={[0, 0.45, 1]}
      start={{ x: 1, y: 0 }}
      end={{ x: 0.3, y: 1 }}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </LinearGradient>
  )
}
```

Crear `apps/movil/src/ui/tarjeta.tsx`:

```tsx
import type { ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORES, DEGRADE, ESPACIO, RADIOS } from '@gym/core'

/**
 * Superficie de vidrio. `destacada` la pinta con el degradé de la marca: es
 * para una sola tarjeta por pantalla —"Hoy toca"—.
 */
export function Tarjeta({ children, destacada, style }: {
  children?: ReactNode
  destacada?: boolean
  style?: StyleProp<ViewStyle>
}) {
  if (destacada) {
    return (
      <LinearGradient
        colors={[DEGRADE.desde, DEGRADE.hasta]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[estilos.base, style]}
      >
        {children}
      </LinearGradient>
    )
  }
  return <View style={[estilos.base, estilos.vidrio, style]}>{children}</View>
}

const estilos = StyleSheet.create({
  base: { borderRadius: RADIOS.grande, padding: ESPACIO.l, overflow: 'hidden' },
  vidrio: { backgroundColor: COLORES.superficie, borderWidth: 1, borderColor: COLORES.superficieBorde },
})
```

Crear `apps/movil/src/ui/boton.tsx`:

```tsx
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { COLORES, DEGRADE, ESPACIO, RADIOS, TOQUE_MINIMO } from '@gym/core'
import { Texto } from './texto'

type Variante = 'principal' | 'secundario' | 'peligro' | 'claro'

interface Props {
  titulo: string
  onPress: () => void
  variante?: Variante
  deshabilitado?: boolean
  icono?: keyof typeof Ionicons.glyphMap
  style?: StyleProp<ViewStyle>
}

/**
 * El principal lleva el degradé y es UNA acción por pantalla. El secundario es
 * de vidrio; el de peligro, coral —cerrar sesión—. El claro va sobre la tarjeta
 * destacada: un degradé encima de otro no se distingue.
 */
export function Boton({ titulo, onPress, variante = 'principal', deshabilitado, icono, style }: Props) {
  const colorTexto = variante === 'peligro' ? COLORES.rechazo : variante === 'claro' ? COLORES.fondo : COLORES.texto
  const contenido = (
    <View style={estilos.contenido}>
      {icono && <Ionicons name={icono} size={18} color={colorTexto} />}
      <Texto variante="cuerpo" peso="negrita" style={{ color: colorTexto }}>{titulo}</Texto>
    </View>
  )

  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!deshabilitado }}
      style={({ pressed }) => [estilos.base, deshabilitado && estilos.deshabilitado, pressed && estilos.apretado, style]}
    >
      {variante === 'principal' ? (
        <LinearGradient
          colors={[DEGRADE.desde, DEGRADE.hasta]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[estilos.relleno, estilos.sombra]}
        >
          {contenido}
        </LinearGradient>
      ) : (
        <View style={[estilos.relleno, estilos[variante]]}>
          {contenido}
        </View>
      )}
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  base: { borderRadius: RADIOS.medio },
  relleno: {
    minHeight: TOQUE_MINIMO + 8, borderRadius: RADIOS.medio,
    paddingHorizontal: ESPACIO.xl, justifyContent: 'center',
  },
  contenido: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ESPACIO.s },
  secundario: { backgroundColor: COLORES.superficieElevada, borderWidth: 1, borderColor: COLORES.superficieBorde },
  peligro: { backgroundColor: COLORES.rechazoSuave },
  claro: { backgroundColor: COLORES.texto },
  sombra: { shadowColor: COLORES.violeta, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  deshabilitado: { opacity: 0.4 },
  apretado: { opacity: 0.85, transform: [{ scale: 0.98 }] },
})
```

Crear `apps/movil/src/ui/chip.tsx`:

```tsx
import { Pressable, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORES, DEGRADE, ESPACIO, TOQUE_MINIMO } from '@gym/core'
import { Texto } from './texto'

const ALTO = 36

/** Selección: días de la rutina, filtros, el selector de Progreso. */
export function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  const etiqueta = (
    <Texto variante="chico" peso={activo ? 'semi' : 'normal'} tono={activo ? 'normal' : 'secundario'}>
      {texto}
    </Texto>
  )
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      // El chip mide 36: el hitSlop completa los 44 que pide TOQUE_MINIMO.
      hitSlop={(TOQUE_MINIMO - ALTO) / 2}
    >
      {activo ? (
        <LinearGradient colors={[DEGRADE.desde, DEGRADE.hasta]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={estilos.base}>
          {etiqueta}
        </LinearGradient>
      ) : (
        <View style={[estilos.base, estilos.inactivo]}>{etiqueta}</View>
      )}
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  base: { height: ALTO, borderRadius: ALTO / 2, paddingHorizontal: ESPACIO.l, justifyContent: 'center' },
  inactivo: { backgroundColor: COLORES.superficie, borderWidth: 1, borderColor: COLORES.superficieBorde },
})
```

Crear `apps/movil/src/ui/campo.tsx`:

```tsx
import { useState } from 'react'
import { StyleSheet, TextInput, type TextInputProps } from 'react-native'
import { COLORES, ESPACIO, RADIOS, TAMANOS, TOQUE_MINIMO } from '@gym/core'
import { FUENTES } from './texto'

/** Entrada de texto. El foco se marca en violeta. */
export function Campo({ numerico, style, onFocus, onBlur, ...resto }: TextInputProps & { numerico?: boolean }) {
  const [foco, setFoco] = useState(false)
  return (
    <TextInput
      placeholderTextColor={COLORES.textoTenue}
      selectionColor={COLORES.cian}
      {...resto}
      onFocus={(e) => { setFoco(true); onFocus?.(e) }}
      onBlur={(e) => { setFoco(false); onBlur?.(e) }}
      style={[estilos.base, numerico && estilos.numerico, foco && estilos.foco, style]}
    />
  )
}

const estilos = StyleSheet.create({
  base: {
    minHeight: TOQUE_MINIMO, borderRadius: RADIOS.medio,
    paddingHorizontal: ESPACIO.l, paddingVertical: ESPACIO.m,
    backgroundColor: COLORES.hundido, borderWidth: 1, borderColor: COLORES.superficieBorde,
    color: COLORES.texto, fontFamily: FUENTES.normal, fontSize: TAMANOS.cuerpo,
  },
  numerico: { textAlign: 'center', fontFamily: FUENTES.negrita, fontSize: TAMANOS.grande, fontVariant: ['tabular-nums'] },
  foco: { borderColor: COLORES.violeta },
})
```

Crear `apps/movil/src/ui/fila-serie.tsx`:

```tsx
import { Pressable, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { COLORES, DEGRADE, ESPACIO, RADIOS, TOQUE_MINIMO } from '@gym/core'
import { Campo } from './campo'
import { Texto } from './texto'

interface Props {
  numero: number
  peso: string
  reps: string
  registrada: boolean
  onCambiarPeso: (valor: string) => void
  onCambiarReps: (valor: string) => void
  onTildar: () => void
}

/**
 * La pieza más tocada de la app. El tilde mide 44 y se llena con el degradé al
 * marcarlo; una serie ya registrada se atenúa y no se puede editar —registrar es
 * agregar, nunca editar—.
 */
export function FilaSerie({ numero, peso, reps, registrada, onCambiarPeso, onCambiarReps, onTildar }: Props) {
  return (
    <View style={[estilos.fila, registrada && estilos.hecha]}>
      <Texto variante="chico" tono="tenue" peso="semi" style={estilos.numero}>{numero}</Texto>
      <Campo
        numerico style={estilos.campo} value={peso} placeholder="kg"
        editable={!registrada} keyboardType="decimal-pad" onChangeText={onCambiarPeso}
        accessibilityLabel={`Peso de la serie ${numero}`}
      />
      <Texto tono="tenue">×</Texto>
      <Campo
        numerico style={estilos.campo} value={reps} placeholder="reps"
        editable={!registrada} keyboardType="number-pad" onChangeText={onCambiarReps}
        accessibilityLabel={`Repeticiones de la serie ${numero}`}
      />
      <Pressable
        onPress={onTildar}
        disabled={registrada}
        hitSlop={4}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: registrada }}
        accessibilityLabel={`Registrar la serie ${numero}`}
      >
        {registrada ? (
          <LinearGradient colors={[DEGRADE.desde, DEGRADE.hasta]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={estilos.tilde}>
            <Ionicons name="checkmark" size={22} color={COLORES.texto} />
          </LinearGradient>
        ) : (
          <View style={[estilos.tilde, estilos.tildeVacio]}>
            <Ionicons name="checkmark" size={22} color={COLORES.textoTenue} />
          </View>
        )}
      </Pressable>
    </View>
  )
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: ESPACIO.s },
  hecha: { opacity: 0.55 },
  numero: { width: 18, textAlign: 'center' },
  campo: { flex: 1, paddingHorizontal: ESPACIO.s },
  tilde: {
    width: TOQUE_MINIMO, height: TOQUE_MINIMO, borderRadius: RADIOS.chico,
    alignItems: 'center', justifyContent: 'center',
  },
  tildeVacio: { backgroundColor: COLORES.superficieElevada },
})
```

Crear `apps/movil/src/ui/aviso.tsx`:

```tsx
import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORES, DEGRADE, ESPACIO, RADIOS } from '@gym/core'
import { Texto } from './texto'

type Tono = 'pendiente' | 'rechazo' | 'record'

/** Pendiente en ámbar, rechazo en coral, récord con el degradé de la marca. */
export function Aviso({ tono, texto }: { tono: Tono; texto: string }) {
  if (tono === 'record') {
    return (
      <LinearGradient
        colors={[DEGRADE.desde, DEGRADE.hasta]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[estilos.base, estilos.record]}
        accessibilityLiveRegion="polite"
      >
        <Texto peso="semi">{texto}</Texto>
      </LinearGradient>
    )
  }
  return (
    <View style={[estilos.base, estilos.pildora, tono === 'rechazo' ? estilos.rechazo : estilos.pendiente]}>
      <Texto variante="mini" tono={tono}>● {texto}</Texto>
    </View>
  )
}

const estilos = StyleSheet.create({
  base: { borderRadius: RADIOS.medio },
  pildora: { alignSelf: 'flex-start', paddingHorizontal: ESPACIO.m, paddingVertical: ESPACIO.xs + 2, borderRadius: 999 },
  pendiente: { backgroundColor: COLORES.pendienteSuave },
  rechazo: { backgroundColor: COLORES.rechazoSuave },
  record: {
    padding: ESPACIO.m, alignItems: 'center',
    shadowColor: COLORES.violeta, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
})
```

Crear `apps/movil/src/ui/cronometro.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { formatearCronometro } from '@gym/core'
import { Texto } from './texto'

/**
 * El tiempo desde el inicio de la sesión. No es un dato nuevo: `inicio` ya se
 * guarda. Sin sesión —todavía no se tildó nada— muestra 0:00.
 */
export function Cronometro({ inicio }: { inicio: string | null }) {
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    if (!inicio) return
    const intervalo = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(intervalo)
  }, [inicio])

  const segundos = inicio ? (ahora - Date.parse(inicio)) / 1000 : 0
  return (
    <Texto variante="grande" peso="negrita" tono="cian" numerico accessibilityLabel="Tiempo de la sesión">
      {formatearCronometro(segundos)}
    </Texto>
  )
}
```

Crear `apps/movil/src/ui/navegacion.ts`:

```ts
import { DarkTheme, type Theme } from 'expo-router'
import { COLORES, TAMANOS } from '@gym/core'
import { FUENTES } from './texto'

/** El tema oscuro de React Navigation con los colores de la marca. */
export const TEMA_NAVEGACION: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: COLORES.cian,
    background: COLORES.fondo,
    card: COLORES.fondo,
    text: COLORES.texto,
    border: COLORES.superficieBorde,
    notification: COLORES.violeta,
  },
}

/** Encabezados de los Stack: sin sombra, título en Sora. */
export const OPCIONES_ENCABEZADO = {
  headerStyle: { backgroundColor: COLORES.fondo },
  headerShadowVisible: false,
  headerTintColor: COLORES.texto,
  headerTitleStyle: { fontFamily: FUENTES.semi, fontSize: TAMANOS.grande },
  contentStyle: { backgroundColor: COLORES.fondo },
} as const
```

Si `expo-router` no reexporta `DarkTheme` ni `Theme` en la versión 57 (hoy `_layout.tsx` ya importa `DarkTheme` y `ThemeProvider` de `expo-router`, así que debería), importarlos de donde los importa hoy `_layout.tsx`.

Crear `apps/movil/src/ui/index.ts`:

```ts
export { Fondo } from './fondo'
export { Texto, FUENTES } from './texto'
export { Tarjeta } from './tarjeta'
export { Boton } from './boton'
export { Chip } from './chip'
export { Campo } from './campo'
export { FilaSerie } from './fila-serie'
export { Aviso } from './aviso'
export { Cronometro } from './cronometro'
export { TEMA_NAVEGACION, OPCIONES_ENCABEZADO } from './navegacion'
```

- [ ] **Step 4: El layout raíz**

En `apps/movil/src/app/_layout.tsx`:

1. Agregar los imports:

```tsx
import { StatusBar } from 'expo-status-bar'
import { useFonts, Sora_400Regular, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora'
import { COLORES } from '@gym/core'
import { OPCIONES_ENCABEZADO, TEMA_NAVEGACION } from '@/ui'
```

y quitar del import de `expo-router` `DarkTheme` y `DefaultTheme` (sigue `ThemeProvider`, `Stack`, `router`, `useSegments`), y quitar `useColorScheme` del import de `react-native`.

2. Borrar `const esquema = useColorScheme()` y agregar, junto a los otros hooks (antes de cualquier `return`):

```tsx
  // Sin la fuente cargada la primera pantalla se pinta con la del sistema y
  // "salta" al cargar: se espera, igual que se espera la sesión.
  const [fuentesListas] = useFonts({ Sora_400Regular, Sora_600SemiBold, Sora_700Bold })
```

3. Reemplazar el bloque de carga:

```tsx
  if (cargando) {
```

por

```tsx
  if (cargando || !fuentesListas) {
```

y en ese mismo bloque cambiar el `View` a `style={{ flex: 1, justifyContent: 'center', backgroundColor: COLORES.fondo }}` y el `ActivityIndicator` a `<ActivityIndicator color={COLORES.cian} />`.

4. Reemplazar el `return` final por:

```tsx
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORES.fondo }}>
      <ThemeProvider value={TEMA_NAVEGACION}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, ...OPCIONES_ENCABEZADO }} />
      </ThemeProvider>
    </GestureHandlerRootView>
  )
```

Mantener el comentario existente sobre `GestureHandlerRootView`.

- [ ] **Step 5: La barra de pestañas**

Reemplazar el contenido entero de `apps/movil/src/app/(tabs)/_layout.tsx` por:

```tsx
import { Tabs } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { COLORES, TAMANOS } from '@gym/core'
import { FUENTES, OPCIONES_ENCABEZADO } from '@/ui'

type Icono = keyof typeof Ionicons.glyphMap

// Ícono lleno cuando la pestaña está activa, contorno cuando no.
const icono = (lleno: Icono, contorno: Icono) =>
  ({ focused, color, size }: { focused: boolean; color: string; size: number }) =>
    <Ionicons name={focused ? lleno : contorno} color={color} size={size} />

export default function LayoutPestanas() {
  return (
    <Tabs
      screenOptions={{
        ...OPCIONES_ENCABEZADO,
        tabBarActiveTintColor: COLORES.cian,
        tabBarInactiveTintColor: COLORES.textoTenue,
        tabBarStyle: {
          backgroundColor: COLORES.fondoBarra,
          borderTopColor: COLORES.superficieBorde,
        },
        tabBarLabelStyle: { fontFamily: FUENTES.semi, fontSize: TAMANOS.mini },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoy', tabBarIcon: icono('flash', 'flash-outline') }} />
      <Tabs.Screen name="rutinas" options={{ title: 'Rutinas', headerShown: false, tabBarIcon: icono('list', 'list-outline') }} />
      <Tabs.Screen name="ejercicios" options={{ title: 'Ejercicios', headerShown: false, tabBarIcon: icono('barbell', 'barbell-outline') }} />
      <Tabs.Screen name="progreso" options={{ title: 'Progreso', headerShown: false, tabBarIcon: icono('trending-up', 'trending-up-outline') }} />
    </Tabs>
  )
}
```

Los `_layout.tsx` de `rutinas`, `ejercicios` y `progreso` son `<Stack />` a secas: pasarles `screenOptions={OPCIONES_ENCABEZADO}` para que sus encabezados tomen el tema (`import { OPCIONES_ENCABEZADO } from '@/ui'`).

- [ ] **Step 6: El aviso de sincronización**

Reemplazar el contenido entero de `apps/movil/src/components/aviso-sincronizacion.tsx` por:

```tsx
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ESPACIO } from '@gym/core'
import { Aviso } from '@/ui'
import { escucharEstado, type EstadoVisible } from '@/lib/sincronizar'

/** "3 series sin sincronizar". El socio nunca queda con la duda de si se guardó. */
export function AvisoSincronizacion() {
  const [estado, setEstado] = useState<EstadoVisible>({ texto: null, hayRechazadas: false })

  useEffect(() => escucharEstado(setEstado), [])

  if (!estado.texto) return null

  return (
    <View style={{ paddingHorizontal: ESPACIO.l, paddingVertical: ESPACIO.xs }}>
      <Aviso tono={estado.hayRechazadas ? 'rechazo' : 'pendiente'} texto={estado.texto} />
    </View>
  )
}
```

- [ ] **Step 7: Verificar tipos y lint**

Run (desde `apps/movil`): `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos. Las pantallas todavía tienen sus estilos viejos —fondos blancos sobre el tema oscuro—: es esperado hasta las tareas 3 a 6.

- [ ] **Step 8: Commit**

```bash
git add apps/movil/package.json package-lock.json apps/movil/app.json apps/movil/src/ui "apps/movil/src/app/_layout.tsx" "apps/movil/src/app/(tabs)/_layout.tsx" "apps/movil/src/app/(tabs)/rutinas/_layout.tsx" "apps/movil/src/app/(tabs)/ejercicios/_layout.tsx" "apps/movil/src/app/(tabs)/progreso/_layout.tsx" apps/movil/src/components/aviso-sincronizacion.tsx
git commit -m "Armar la base visual de la app

Sora cargada antes de la primera pantalla, tema oscuro de navegación,
barra de pestañas con íconos y los componentes con los que se arman
todas las pantallas. Ningún componente escribe un color a mano: salen
de core.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---
## Tarea 3: App — login y Hoy

**Files:**
- Modify (se reescribe): `apps/movil/src/app/login.tsx`
- Modify (se reescribe): `apps/movil/src/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: de `@/ui` (Tarea 2): `Fondo`, `Texto`, `Tarjeta`, `Boton`, `Chip`, `Campo`. De `@gym/core`: `COLORES`, `ESPACIO`, `TOQUE_MINIMO`, `diaAMostrar`, `sesionAbierta`, `SesionEnCola`. Sin cambios en la lógica: las mismas funciones de `@/lib/*` que usa hoy cada pantalla.
- Produces: nada que otra tarea use.

- [ ] **Step 1: El login**

Reemplazar el contenido entero de `apps/movil/src/app/login.tsx` por:

```tsx
import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { COLORES, DEGRADE, ESPACIO, RADIOS } from '@gym/core'
import { Boton, Campo, Fondo, Texto } from '@/ui'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)

  async function entrar() {
    setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setCargando(false)
    // Mensaje genérico a propósito, igual que en el panel: distinguir "no
    // existe el usuario" de "contraseña incorrecta" le confirma a un atacante
    // qué correos están registrados.
    if (error) Alert.alert('No pudimos entrar', 'Correo o contraseña incorrectos')
  }

  return (
    <Fondo>
      <KeyboardAvoidingView
        style={estilos.contenedor}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <LinearGradient
          colors={[DEGRADE.desde, DEGRADE.hasta]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={estilos.logo}
        >
          <Ionicons name="flash" size={30} color={COLORES.texto} />
        </LinearGradient>

        <View style={{ gap: ESPACIO.xs }}>
          <Texto variante="titulo">Entrá a tu gimnasio</Texto>
          <Texto tono="secundario">Registrá cada serie y mirá cómo progresás.</Texto>
        </View>

        <View style={{ gap: ESPACIO.m }}>
          <Campo
            placeholder="Correo" value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" autoComplete="email"
          />
          <Campo
            placeholder="Contraseña" value={password} onChangeText={setPassword}
            secureTextEntry autoComplete="password"
          />
        </View>

        <Boton titulo={cargando ? 'Entrando…' : 'Entrar'} onPress={() => void entrar()} deshabilitado={cargando} />
      </KeyboardAvoidingView>
    </Fondo>
  )
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, justifyContent: 'center', padding: ESPACIO.xl, gap: ESPACIO.xl },
  logo: { width: 60, height: 60, borderRadius: RADIOS.grande, alignItems: 'center', justifyContent: 'center' },
})
```

- [ ] **Step 2: Hoy**

Reemplazar el contenido entero de `apps/movil/src/app/(tabs)/index.tsx` por el de abajo. **La lógica es la misma de hoy, línea por línea** —carga con `useFocusEffect`, `cargarRutinaActiva`, `buscarSesionAbierta`, `elegirDia`, `terminarAbierta`, `entrarLibre`—; cambian el JSX y los estilos. Antes de reemplazar, leer el archivo actual y confirmar que esa lógica no cambió desde la etapa 3; si cambió, conservar la versión actual de la lógica y aplicar solo el JSX de abajo.

```tsx
import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Link, Tabs, useFocusEffect, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Ionicons from '@expo/vector-icons/Ionicons'
import { COLORES, ESPACIO, TOQUE_MINIMO, diaAMostrar, sesionAbierta, type SesionEnCola } from '@gym/core'
import { AvisoSincronizacion } from '@/components/aviso-sincronizacion'
import { Boton, Chip, Fondo, Tarjeta, Texto } from '@/ui'
import { cerrarSesion } from '@/lib/cerrar-sesion'
import { leerCola } from '@/lib/local/cola'
import { membresiasGuardadas } from '@/lib/membresia'
import { cargarRutinaActiva, type EjercicioDelDia, type RutinaActiva } from '@/lib/rutina-activa'
import { terminarSesion } from '@/lib/terminar-sesion'

const CLAVE_ULTIMO_DIA = 'hoy.ultimoDia'

async function buscarSesionAbierta(): Promise<SesionEnCola | null> {
  const { sesiones } = await leerCola()
  return sesionAbierta(sesiones, (await membresiasGuardadas()).map((m) => m.id))
}

export default function Hoy() {
  const router = useRouter()
  const [rutina, setRutina] = useState<RutinaActiva | null>(null)
  const [guardada, setGuardada] = useState(false)
  const [diaId, setDiaId] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<SesionEnCola | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // useFocusEffect y no useEffect: al volver de entrenar, o del armador, tiene
  // que verse el cambio.
  useFocusEffect(
    useCallback(() => {
      let vivo = true
      setCargando(true)

      Promise.all([
        cargarRutinaActiva(),
        AsyncStorage.getItem(CLAVE_ULTIMO_DIA),
        buscarSesionAbierta(),
      ]).then(([resultado, ultimoId, sinTerminar]) => {
        if (!vivo) return
        setAbierta(sinTerminar)

        if (!resultado) {
          setError('No pudimos cargar tu rutina')
          setCargando(false)
          return
        }

        setError(null)
        setRutina(resultado.rutina)
        setGuardada(resultado.guardada)
        setDiaId(resultado.rutina
          ? (diaAMostrar(resultado.rutina.rutina_dias, ultimoId)?.id ?? null)
          : null)
        setCargando(false)
      }).catch(() => {
        // Cubre también un AsyncStorage o un SQLite que fallan: sin esto, el
        // socio queda en la pantalla de carga sin ningún botón para salir.
        if (!vivo) return
        setError('No pudimos cargar tu rutina')
        setCargando(false)
      })

      return () => { vivo = false }
    }, []),
  )

  const elegirDia = (id: string) => {
    setDiaId(id)
    AsyncStorage.setItem(CLAVE_ULTIMO_DIA, id)
  }

  const terminarAbierta = async () => {
    if (!abierta) return
    try {
      await terminarSesion(abierta)
      setAbierta(null)
    } catch {
      Alert.alert('No pudimos terminar el entrenamiento', 'Probá de nuevo.')
    }
  }

  const entrenarLibre = () => router.push('/entrenar')

  // Cerrar sesión pasa al encabezado: era un botón suelto al pie de cada estado.
  const encabezado = (
    <Tabs.Screen
      options={{
        headerRight: () => (
          <Pressable
            onPress={() => void cerrarSesion()} hitSlop={8} style={estilos.salir}
            accessibilityRole="button" accessibilityLabel="Cerrar sesión"
          >
            <Ionicons name="log-out-outline" size={22} color={COLORES.textoSecundario} />
          </Pressable>
        ),
      }}
    />
  )

  // Lo que va arriba en todos los casos: el estado de la cola y la sesión que
  // quedó abierta. Una sesión abierta no depende de tener rutina ni señal.
  const avisos = (
    <>
      <AvisoSincronizacion />
      {abierta && (
        <Tarjeta style={estilos.abierta}>
          <View style={estilos.filaAbierta}>
            <Ionicons name="time-outline" size={20} color={COLORES.cian} />
            <Texto peso="semi" style={{ flex: 1 }}>Tenés un entrenamiento sin terminar.</Texto>
          </View>
          <View style={estilos.accionesAbierta}>
            <Boton
              titulo="Seguir" style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/entrenar', params: { retomar: '1' } })}
            />
            <Boton titulo="Terminar" variante="secundario" style={{ flex: 1 }} onPress={() => void terminarAbierta()} />
          </View>
        </Tarjeta>
      )}
    </>
  )

  if (cargando) {
    return (
      <Fondo style={estilos.centrado}>
        {encabezado}
        <ActivityIndicator color={COLORES.cian} />
      </Fondo>
    )
  }

  if (error || !rutina) {
    return (
      <Fondo>
        {encabezado}
        <ScrollView contentContainerStyle={estilos.contenido}>
          {avisos}
          <Tarjeta style={estilos.vacia}>
            <Ionicons
              name={error ? 'cloud-offline-outline' : 'barbell-outline'}
              size={32} color={error ? COLORES.rechazo : COLORES.cian}
            />
            <Texto variante="grande" style={estilos.centradoTexto}>
              {error ?? 'Todavía no tenés una rutina.'}
            </Texto>
            {!error && (
              <Link href="/(tabs)/rutinas" asChild>
                <Pressable hitSlop={8}>
                  <Texto peso="semi" tono="cian">Mirá el catálogo de tu gimnasio</Texto>
                </Pressable>
              </Link>
            )}
          </Tarjeta>
          <Boton titulo="Entrenar libre" variante="secundario" icono="add" onPress={entrenarLibre} />
        </ScrollView>
      </Fondo>
    )
  }

  const dias = [...rutina.rutina_dias].sort((a, b) => a.orden - b.orden)
  const dia = dias.find((d) => d.id === diaId) ?? null
  const ejercicios = dia
    ? [...dia.rutina_ejercicios].sort((a, b) => a.orden - b.orden)
    : []

  return (
    <Fondo>
      {encabezado}
      <ScrollView contentContainerStyle={estilos.contenido}>
        {avisos}
        {guardada && (
          <Texto variante="chico" tono="secundario">Sin conexión: es tu rutina guardada en el teléfono.</Texto>
        )}

        <Tarjeta destacada>
          <View style={estilos.etiquetaHoy}>
            <Texto variante="mini" peso="semi">HOY TOCA</Texto>
          </View>
          <Texto variante="subtitulo" style={{ marginTop: ESPACIO.m }}>{dia?.nombre ?? rutina.nombre}</Texto>
          <Texto variante="chico" style={{ opacity: 0.85 }}>
            {rutina.nombre} · {ejercicios.length} {ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'}
          </Texto>
          {dia && ejercicios.length > 0 && (
            <Boton
              titulo="Empezar" variante="claro" icono="play" style={{ marginTop: ESPACIO.l }}
              onPress={() => router.push({ pathname: '/entrenar', params: { diaId: dia.id } })}
            />
          )}
        </Tarjeta>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.chips}>
          {dias.map((d) => (
            <Chip key={d.id} activo={d.id === diaId} texto={d.nombre} onPress={() => elegirDia(d.id)} />
          ))}
        </ScrollView>

        {ejercicios.length === 0 ? (
          <Texto tono="secundario" style={estilos.centradoTexto}>Este día todavía no tiene ejercicios.</Texto>
        ) : (
          <View style={{ gap: ESPACIO.s }}>
            {ejercicios.map((e) => <FilaEjercicio key={e.id} ejercicio={e} />)}
          </View>
        )}

        <Boton titulo="Entrenar libre" variante="secundario" icono="add" onPress={entrenarLibre} />
      </ScrollView>
    </Fondo>
  )
}

// Modo lectura: sin agarre de reordenar ni acceso al armador, a diferencia de
// la pantalla equivalente dentro de Rutinas.
function FilaEjercicio({ ejercicio }: { ejercicio: EjercicioDelDia }) {
  return (
    <Tarjeta style={estilos.fila}>
      <View style={{ flex: 1 }}>
        <Texto peso="semi">{ejercicio.ejercicios?.nombre}</Texto>
        <Texto variante="chico" tono="secundario" numerico>
          {ejercicio.series}×{ejercicio.repeticiones}
          {ejercicio.descanso_seg ? ` · ${ejercicio.descanso_seg}s de descanso` : ''}
        </Texto>
      </View>
      {ejercicio.ejercicios?.video_id && (
        <Link href={`/(tabs)/ejercicios/${ejercicio.ejercicios.id}`} asChild>
          <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel="Ver el video">
            <Ionicons name="play-circle" size={30} color={COLORES.cian} />
          </Pressable>
        </Link>
      )}
    </Tarjeta>
  )
}

const estilos = StyleSheet.create({
  centrado: { alignItems: 'center', justifyContent: 'center' },
  centradoTexto: { textAlign: 'center' },
  contenido: { padding: ESPACIO.l, gap: ESPACIO.l, paddingBottom: ESPACIO.xl * 2 },
  salir: { minWidth: TOQUE_MINIMO, minHeight: TOQUE_MINIMO, alignItems: 'center', justifyContent: 'center', marginRight: ESPACIO.s },
  abierta: { gap: ESPACIO.m },
  filaAbierta: { flexDirection: 'row', alignItems: 'center', gap: ESPACIO.s },
  accionesAbierta: { flexDirection: 'row', gap: ESPACIO.s },
  vacia: { alignItems: 'center', gap: ESPACIO.m, paddingVertical: ESPACIO.xl },
  etiquetaHoy: {
    alignSelf: 'flex-start', paddingHorizontal: ESPACIO.s + 2, paddingVertical: ESPACIO.xs,
    borderRadius: 999, backgroundColor: COLORES.sobreDegrade,
  },
  chips: { gap: ESPACIO.s },
  fila: { flexDirection: 'row', alignItems: 'center', gap: ESPACIO.m, paddingVertical: ESPACIO.m },
})
```

- [ ] **Step 3: Verificar tipos y lint**

Run (desde `apps/movil`): `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos. Si `tsc` rechaza `<Tabs.Screen options>` adentro de la pantalla, usar `useNavigation().setOptions({ headerRight })` dentro de un `useLayoutEffect` —es el mecanismo de React Navigation detrás— y anotarlo en el reporte.

- [ ] **Step 4: Commit**

```bash
git add apps/movil/src/app/login.tsx "apps/movil/src/app/(tabs)/index.tsx"
git commit -m "Rediseñar el login y la pestaña Hoy

Hoy abre con una tarjeta Hoy toca y un Empezar que no se puede pasar
por alto, los días como chips y la sesión sin terminar como una
tarjeta con sus dos acciones. Cerrar sesión pasa al encabezado: era un
botón suelto al pie de cada estado. La lógica no cambia.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

## Tarea 4: App — la pantalla de sesión, con cronómetro y vibración

**Files:**
- Modify: `apps/movil/src/app/entrenar.tsx` (imports, dos líneas de lógica nuevas, el JSX desde `if (cargando)` y los estilos)

**Interfaces:**
- Consumes: de `@/ui`: `Fondo`, `Texto`, `Tarjeta`, `Boton`, `FilaSerie`, `Aviso`, `Cronometro`, `OPCIONES_ENCABEZADO`. De `@gym/core`: `COLORES`, `ESPACIO`, `TOQUE_MINIMO`. `expo-haptics` (Tarea 2).
- Produces: nada.

Esta pantalla tiene la lógica más delicada de la app —la cola, las marcas de antes de la sesión, la guardia de Terminar—. **No se toca nada arriba de `if (cargando)` salvo lo que dicen los pasos 1 y 2.**

- [ ] **Step 1: Imports**

En `apps/movil/src/app/entrenar.tsx`:
- Reemplazar el import de `react-native` por: `import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'` (salen `Text` y `TextInput`).
- Agregar:

```tsx
import * as Haptics from 'expo-haptics'
import Ionicons from '@expo/vector-icons/Ionicons'
import { COLORES, ESPACIO, TOQUE_MINIMO } from '@gym/core'
import { Aviso, Boton, Cronometro, FilaSerie, Fondo, Tarjeta, Texto } from '@/ui'
```

(sumar `COLORES, ESPACIO, TOQUE_MINIMO` al import existente de `@gym/core` en vez de un segundo import).

- [ ] **Step 2: El inicio para el cronómetro y la vibración**

Las dos únicas líneas de lógica nuevas de todo el rediseño.

1. Junto a los otros `useState`, agregar:

```tsx
  // Para el cronómetro del encabezado. La sesión nace con la primera serie:
  // hasta entonces no hay inicio y el cronómetro muestra 0:00.
  const [inicio, setInicio] = useState<string | null>(null)
```

2. En `preparar()`, en la rama `if (abierta) {`, debajo de `sesion.current = abierta`, agregar `setInicio(abierta.inicio)`.

3. En `registrar()`, dentro del `if (!sesion.current) { … }`, debajo de la llamada a `local.guardarCache(...)`, agregar `setInicio(sesion.current.inicio)`.

4. En `registrar()`, inmediatamente después del `await local.agregarSerieLocal({ … })`, agregar:

```tsx
      // Confirma el toque sin tener que mirar. Si el teléfono no vibra —o en
      // web—, no pasa nada.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
```

- [ ] **Step 3: El JSX y los estilos**

Reemplazar desde `if (cargando) {` hasta el final del archivo (incluidos `const VERDE` y `const estilos`) por:

```tsx
  if (cargando) {
    return (
      <Fondo style={estilos.centrado}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <ActivityIndicator color={COLORES.cian} />
      </Fondo>
    )
  }

  return (
    <Fondo>
      <Stack.Screen
        options={{
          headerShown: true,
          title: titulo,
          headerRight: () => <View style={estilos.reloj}><Cronometro inicio={inicio} /></View>,
        }}
      />
      <AvisoSincronizacion />
      {record && <View style={estilos.record}><Aviso tono="record" texto={record} /></View>}

      <ScrollView contentContainerStyle={estilos.lista} keyboardShouldPersistTaps="handled">
        {ejercicios.length === 0 && (
          <Tarjeta style={estilos.vacia}>
            <Ionicons name="barbell-outline" size={30} color={COLORES.cian} />
            <Texto tono="secundario">Agregá el primer ejercicio para empezar.</Texto>
          </Tarjeta>
        )}

        {ejercicios.map((ej, iEj) => {
          const hechas = ej.filas.filter((f) => f.registrada).length
          const completo = hechas === ej.filas.length && hechas > 0
          const estaAbierto = iEj === abierto
          return (
            <Tarjeta key={ej.ejercicio_id} style={estilos.ejercicio}>
              <Pressable
                style={estilos.cabecera}
                onPress={() => setAbierto(estaAbierto ? -1 : iEj)}
                accessibilityRole="button"
                accessibilityState={{ expanded: estaAbierto }}
              >
                <Texto variante="grande" style={{ flex: 1 }}>{ej.nombre}</Texto>
                <Texto variante="chico" tono={completo ? 'cian' : 'secundario'} peso="semi" numerico>
                  {hechas}/{ej.filas.length}
                </Texto>
                <Ionicons
                  name={estaAbierto ? 'chevron-up' : 'chevron-down'}
                  size={18} color={COLORES.textoTenue}
                />
              </Pressable>

              {estaAbierto && (
                <View style={estilos.cuerpo}>
                  {ej.vezPasada && (
                    <Texto variante="chico" tono="secundario" numerico>{ej.vezPasada}</Texto>
                  )}

                  {ej.filas.map((f, iFila) => (
                    <FilaSerie
                      key={iFila}
                      numero={iFila + 1}
                      peso={f.peso}
                      reps={f.reps}
                      registrada={f.registrada}
                      onCambiarPeso={(v) => editar(iEj, iFila, 'peso', v)}
                      onCambiarReps={(v) => editar(iEj, iFila, 'reps', v)}
                      onTildar={() => void registrar(iEj, iFila)}
                    />
                  ))}

                  <Pressable onPress={() => agregarFila(iEj)} hitSlop={8} style={estilos.agregarSerie}>
                    <Ionicons name="add" size={18} color={COLORES.cian} />
                    <Texto peso="semi" tono="cian">Serie</Texto>
                  </Pressable>
                </View>
              )}
            </Tarjeta>
          )
        })}

        <Boton titulo="Agregar ejercicio" variante="secundario" icono="add" onPress={() => setEligiendo(true)} />
        <Boton titulo="Terminar" icono="checkmark-done" onPress={terminar} />
      </ScrollView>

      <Modal visible={eligiendo} animationType="slide" onRequestClose={() => setEligiendo(false)}>
        <Fondo>
          <SafeAreaView style={{ flex: 1 }}>
            <Pressable style={estilos.cancelar} onPress={() => setEligiendo(false)} hitSlop={8}>
              <Texto peso="semi" tono="cian">Cancelar</Texto>
            </Pressable>
            <BuscadorEjercicios onElegir={(e) => void agregarEjercicio(e)} />
          </SafeAreaView>
        </Fondo>
      </Modal>
    </Fondo>
  )
}

const estilos = StyleSheet.create({
  centrado: { alignItems: 'center', justifyContent: 'center' },
  reloj: { marginRight: ESPACIO.l },
  record: { paddingHorizontal: ESPACIO.l, paddingTop: ESPACIO.s },
  lista: { padding: ESPACIO.l, gap: ESPACIO.m, paddingBottom: ESPACIO.xl * 2 },
  vacia: { alignItems: 'center', gap: ESPACIO.s, paddingVertical: ESPACIO.xl },
  ejercicio: { padding: 0 },
  cabecera: {
    flexDirection: 'row', alignItems: 'center', gap: ESPACIO.s,
    minHeight: TOQUE_MINIMO + 12, paddingHorizontal: ESPACIO.l,
  },
  cuerpo: { paddingHorizontal: ESPACIO.l, paddingBottom: ESPACIO.l, gap: ESPACIO.s },
  agregarSerie: {
    flexDirection: 'row', alignItems: 'center', gap: ESPACIO.xs,
    alignSelf: 'flex-start', minHeight: TOQUE_MINIMO,
  },
  cancelar: { padding: ESPACIO.l, minHeight: TOQUE_MINIMO },
})
```

Conservar los textos visibles de antes salvo dos que cambian a propósito: "+ Serie" → ícono más "Serie", y "+ Agregar ejercicio" → botón con ícono "Agregar ejercicio".

- [ ] **Step 4: Verificar tipos y lint**

Run (desde `apps/movil`): `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos. Las llamadas a `setInicio` corren dentro de funciones async, no en el cuerpo de un efecto: la regla `react-hooks/set-state-in-effect` no las tiene que marcar. Si las marca, reportarlo antes de cambiar nada.

- [ ] **Step 5: Commit**

```bash
git add apps/movil/src/app/entrenar.tsx
git commit -m "Rediseñar la pantalla de sesión y sumar cronómetro y vibración

La fila de serie es la pieza más tocada de la app: tilde de 44 que se
llena con el degradé y series hechas atenuadas. El récord aparece como
banner con el degradé. El cronómetro sale del inicio que ya se guarda,
y la vibración al tildar confirma el toque sin tener que mirar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 5: App — Rutinas, Ejercicios y el buscador

**Files:**
- Modify: `apps/movil/src/components/buscador-ejercicios.tsx`
- Modify: `apps/movil/src/app/(tabs)/ejercicios/index.tsx`
- Modify: `apps/movil/src/app/(tabs)/ejercicios/[id].tsx`
- Modify: `apps/movil/src/app/(tabs)/rutinas/index.tsx`
- Modify: `apps/movil/src/app/(tabs)/rutinas/[id].tsx`
- Modify: `apps/movil/src/app/(tabs)/rutinas/dia/[diaId].tsx`
- Modify: `apps/movil/src/app/(tabs)/rutinas/nueva.tsx`
- Modify: `apps/movil/src/app/(tabs)/rutinas/elegir-ejercicio.tsx`

**Interfaces:**
- Consumes: todo `@/ui` y los valores de `@gym/core`.
- Produces: nada. `BuscadorEjercicios` mantiene exactamente su interfaz (`onElegir`, `EjercicioDelCatalogo`).

Estas siete pantallas son de la etapa 2 y no tienen código nuevo en este plan: se pasan a los componentes base con las reglas de abajo. **Solo cambian JSX e imports de estilo; la lógica, las consultas, el arrastre para reordenar (`react-native-reorderable-list`) y los textos visibles quedan iguales.**

- [ ] **Step 1: El buscador**

En `apps/movil/src/components/buscador-ejercicios.tsx`, conservando la lógica entera, reemplazar el JSX y los estilos por:
- La raíz: `<View style={{ flex: 1 }}>` sin fondo propio (lo pone la pantalla que lo contiene).
- El `TextInput` de búsqueda → `<Campo placeholder="Buscar ejercicio" value={busqueda} onChangeText={setBusqueda} style={{ margin: ESPACIO.l, marginBottom: ESPACIO.s }} />`, con un `Ionicons name="search"` de `size={18}` `color={COLORES.textoTenue}` adentro de un `View` con `position: 'absolute'` a la derecha del campo, o sin ícono si complica el layout.
- Las dos filas de filtros: mismo `ScrollView` horizontal, con `contentContainerStyle={{ gap: ESPACIO.s, paddingHorizontal: ESPACIO.l, paddingVertical: ESPACIO.xs }}` y el `Chip` de `@/ui` en lugar del `Chip` local (borrar el local y sus estilos).
- La `FlatList`: `contentContainerStyle={{ padding: ESPACIO.l, gap: ESPACIO.s }}`; cada fila es un `Pressable` que envuelve una `Tarjeta` con `flexDirection: 'row'`, `alignItems: 'center'`, `gap: ESPACIO.m`: `<Texto peso="semi">` el nombre, `<Texto variante="chico" tono="secundario">` el grupo y el origen, y si hay video `Ionicons name="play-circle"` `size={26}` `color={COLORES.cian}`.
- Vacío: `<Texto tono="secundario" style={{ textAlign: 'center', marginTop: ESPACIO.xl }}>`.
- Cargando: `ActivityIndicator color={COLORES.cian}`; error: `<Texto tono="rechazo">`.

- [ ] **Step 2: Las otras pantallas, con estas reglas**

Leer cada archivo entero antes de editarlo. Aplicar:

| Antes | Después |
|---|---|
| La raíz de la pantalla (`<View style={{ flex: 1 }}>` o similar) | `<Fondo>` (importado de `@/ui`) |
| `ScrollView`/`FlatList` de contenido | `contentContainerStyle` con `padding: ESPACIO.l, gap: ESPACIO.s` (o `ESPACIO.m` si son tarjetas grandes) |
| Filas de lista con `borderBottomWidth` | Cada fila es una `<Tarjeta>` con `flexDirection: 'row'`, `alignItems: 'center'`, `gap: ESPACIO.m` |
| Títulos de 20 px o más | `<Texto variante="subtitulo">` |
| Texto de 16–17 px con peso | `<Texto variante="grande">` o `<Texto peso="semi">` |
| Texto común | `<Texto>` |
| Texto gris (`#777`, `#666`, `#999`) | `<Texto tono="secundario">`; los muy tenues (`#aaa`, `#bbb`, `#ccc`) `tono="tenue"` |
| Texto rojo (`#b00`, `red`) | `<Texto tono="rechazo">` |
| Números (series, repeticiones, peso, descanso) | Agregar `numerico` al `Texto` |
| `<Button>` de React Native o un `Pressable` con fondo negro | `<Boton>`: `variante` por defecto (principal) para LA acción principal de la pantalla —"Tomar esta rutina", "Guardar", "Agregar"—; `variante="secundario"` para el resto; `variante="peligro"` para borrar o archivar |
| `TextInput` | `<Campo>`; los numéricos con `numerico` |
| El `Chip` local de cada archivo | `Chip` de `@/ui`; borrar el local y sus estilos |
| Enlaces subrayados | `<Texto peso="semi" tono="cian">` dentro del `Pressable`/`Link`, sin subrayado |
| `▶` | `Ionicons name="play-circle"` con `color={COLORES.cian}` |
| El agarre de reordenar (`≡` u otro símbolo) | `Ionicons name="reorder-three"` con `color={COLORES.textoTenue}`, `size={22}` |
| Íconos de borrar (`✕`, `🗑`) | `Ionicons name="trash-outline"` con `color={COLORES.rechazo}` |
| Modales tipo hoja (`fondoModal` + `hoja` blanca) | El fondo semitransparente pasa a `COLORES.velo`; la hoja pasa a `backgroundColor: COLORES.fondo`, `borderTopLeftRadius`/`borderTopRightRadius: RADIOS.enorme`, `borderTopWidth: 1`, `borderColor: COLORES.superficieBorde`, `padding: ESPACIO.xl` |
| `ActivityIndicator` | `color={COLORES.cian}` |
| `backgroundColor: '#fff'` en filas | Se borra: la tarjeta pone su superficie |
| `Alert.alert(...)` | Sin cambios |

Cualquier color, radio o tamaño que quede escrito a mano después de aplicar la tabla es un error: tiene que salir de `@gym/core`.

Atención especial:
- `rutinas/[id].tsx` y `rutinas/dia/[diaId].tsx` usan `react-native-reorderable-list`. El ítem que se arrastra tiene que seguir siendo el mismo componente con el mismo `onLongPress`/`drag`; envolver su contenido en `Tarjeta` sin mover los handlers. Si el arrastre dejara de funcionar, revertir ese archivo a la estructura anterior y solo cambiar colores y textos.
- `ejercicios/[id].tsx` reproduce el video con `expo-video` y tiene el error de lint previo en la línea 85. No tocar la lógica del video ni intentar arreglar ese error.
- `ejercicios/index.tsx` solo tiene el `Stack.Screen` y el buscador: envolver en `<Fondo>`.
- `rutinas/elegir-ejercicio.tsx`: la raíz en `<Fondo>`; `AltaEjercicio` pasa a la hoja oscura de la tabla con `Campo` y `Boton` (Cancelar secundario, Agregar principal).

- [ ] **Step 3: Verificar tipos y lint**

Run (desde `apps/movil`): `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos. Verificar con `git grep -n -E "#[0-9a-fA-F]{3,6}\b|rgba\(" -- "apps/movil/src/app/(tabs)/rutinas" "apps/movil/src/app/(tabs)/ejercicios" apps/movil/src/components/buscador-ejercicios.tsx` que no quedan colores escritos a mano.

- [ ] **Step 4: Commit**

```bash
git add apps/movil/src/components/buscador-ejercicios.tsx "apps/movil/src/app/(tabs)/ejercicios" "apps/movil/src/app/(tabs)/rutinas"
git commit -m "Pasar Rutinas, Ejercicios y el buscador al sistema visual

Las pantallas de la etapa 2 usan ahora las mismas tarjetas, chips,
campos y botones que el resto, con una sola acción principal por
pantalla. La lógica y el arrastre para reordenar no cambian.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 6: App — Progreso y el gráfico

**Files:**
- Modify (se reescribe): `apps/movil/src/components/grafico-evolucion.tsx`
- Modify: `apps/movil/src/app/(tabs)/progreso/index.tsx`
- Modify: `apps/movil/src/app/(tabs)/progreso/sesion/[id].tsx`
- Modify: `apps/movil/src/app/(tabs)/progreso/ejercicio/[id].tsx`

**Interfaces:**
- Consumes: `@/ui`, `@gym/core` (`geometriaGrafico`, `marcarRecords`, `MARGENES_GRAFICO`, `formatearKg`, `COLORES`, `ESPACIO`, `RADIOS`, `TAMANOS`), `FUENTES` de `@/ui`, `fechaCorta` de `@/lib/fechas`.
- Produces: **`<GraficoEvolucion valores fechas />` pierde la prop `color`**: la línea siempre lleva el degradé de la marca. El único consumidor es `progreso/ejercicio/[id].tsx`, que se actualiza en esta misma tarea.

- [ ] **Step 1: El gráfico**

Reemplazar el contenido entero de `apps/movil/src/components/grafico-evolucion.tsx` por:

```tsx
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
            <LinearGradient id="trazo" x1="0" y1="0" x2="1" y2="0">
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
```

- [ ] **Step 2: Las tres pantallas de Progreso**

Leer cada archivo entero antes de editarlo. Conservar toda la lógica (`cargar`, paginación, filtros por membresía, `vivo`), y aplicar la tabla de la Tarea 5 más esto:

- **`progreso/index.tsx`:**
  - Raíz `<Fondo>`.
  - Los títulos de sección ("Récords personales", "Historial") como `<Texto variante="mini" tono="tenue" peso="semi">` en mayúsculas, con `marginTop: ESPACIO.l`.
  - Cada récord es una `Tarjeta` con el nombre (`<Texto peso="semi">`) a la izquierda y, a la derecha, el mejor peso grande (`<Texto variante="subtitulo" numerico>` con "kg" en `variante="chico" tono="secundario"`) y debajo `volumen …kg` en `variante="mini" tono="secundario" numerico`.
  - Cada sesión del historial es una `Tarjeta` con la fecha (`<Texto peso="semi">`), el detalle en `variante="chico" tono="secundario"`, y "sin terminar" en `tono="pendiente"` cuando corresponde.
  - El estado sin conexión: una `Tarjeta` centrada con `Ionicons name="cloud-offline-outline"` coral y los dos textos.
- **`progreso/sesion/[id].tsx`:** raíz `<Fondo>`; encabezado con el día en `variante="subtitulo"` y la duración en `tono="secundario"`; cada ejercicio una `Tarjeta` con el nombre y el detalle `numerico`.
- **`progreso/ejercicio/[id].tsx`:**
  - Raíz `<Fondo>`.
  - Las dos marcas del resumen, cada una en una `Tarjeta`: el valor en `variante="subtitulo" numerico` y la etiqueta en `variante="mini" tono="secundario"`.
  - El selector: dos `Chip` de `@/ui` (borrar el componente local `Opcion`).
  - El gráfico dentro de una `Tarjeta`.
  - Sacar la prop `color` del `<GraficoEvolucion>` y las constantes `VERDE` y `AZUL`.
  - La leyenda en `variante="mini" tono="tenue"`.

- [ ] **Step 3: Verificar tipos y lint**

Run (desde `apps/movil`): `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos. `git grep -n -E "#[0-9a-fA-F]{3,6}\b|rgba\(" -- "apps/movil/src/app/(tabs)/progreso" apps/movil/src/components/grafico-evolucion.tsx` no tiene que devolver nada.

- [ ] **Step 4: Commit**

```bash
git add apps/movil/src/components/grafico-evolucion.tsx "apps/movil/src/app/(tabs)/progreso"
git commit -m "Rediseñar Progreso y el gráfico de evolución

Los récords se leen de un vistazo, con el número grande. La línea del
gráfico lleva el degradé de la marca y los récords el dorado, así que
el componente deja de recibir un color: era lo único que lo hacía
distinto entre peso y volumen.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Tarea 7: Panel — la base: fuente, clases, barra lateral y login

**Files:**
- Modify: `apps/panel/package.json` (`lucide-react`)
- Modify: `apps/panel/src/app/globals.css` (se agregan las clases de componente; el `@theme` de la Tarea 1 no se toca)
- Modify (se reescribe): `apps/panel/src/app/layout.tsx`
- Modify (se reescribe): `apps/panel/src/app/(panel)/layout.tsx`
- Create: `apps/panel/src/app/(panel)/nav-lateral.tsx`
- Modify (se reescribe): `apps/panel/src/app/login/page.tsx`

**Interfaces:**
- Consumes: el `@theme` de `globals.css` (Tarea 1).
- Produces: clases CSS que usa la Tarea 8: `tarjeta`, `boton`, `boton-principal`, `boton-secundario`, `boton-peligro`, `campo`, `chip`, `chip-activo`, `titulo-pagina`, `etiqueta`, `enlace`, `texto-degrade`, `fondo-degrade`. Y los utilitarios de Tailwind que genera el `@theme`: `bg-superficie`, `text-texto-secundario`, `border-superficie-borde`, `rounded-grande`, etc.

`apps/panel/AGENTS.md` avisa que esta versión de Next tiene cambios: **leer antes la guía de fuentes y la de layouts en `node_modules/next/dist/docs/`.** Si `next/font/google` o `usePathname` cambiaron de forma, seguir la guía y anotarlo en el reporte.

- [ ] **Step 1: Instalar los íconos**

Run (desde la raíz del worktree): `npm install lucide-react --workspace panel`
Expected: `lucide-react` en `dependencies` de `apps/panel/package.json`.

- [ ] **Step 2: Las clases de componente**

Agregar al final de `apps/panel/src/app/globals.css`:

```css
/*
 * Las piezas del panel, el equivalente de apps/movil/src/ui. Solo usan las
 * variables del @theme: ningún color escrito a mano. Las sombras y los halos
 * mezclan la variable con transparente en vez de repetir el valor.
 */
@layer components {
  .tarjeta {
    background: var(--color-superficie);
    border: 1px solid var(--color-superficie-borde);
    border-radius: var(--radius-grande);
    padding: 1rem;
  }

  .titulo-pagina { font-size: 1.5rem; line-height: 2rem; font-weight: 700; letter-spacing: -0.01em; }

  .etiqueta {
    font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--color-texto-tenue);
  }

  .enlace { color: var(--color-cian); font-weight: 600; }
  .enlace:hover { text-decoration: underline; }

  .fondo-degrade { background-image: linear-gradient(135deg, var(--color-violeta), var(--color-cian)); }

  .texto-degrade {
    background-image: linear-gradient(90deg, var(--color-violeta), var(--color-cian));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }

  .boton {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
    min-height: 44px; padding: 0 1.25rem; border-radius: var(--radius-medio);
    font-size: 0.875rem; font-weight: 600; cursor: pointer;
    transition: opacity 150ms, transform 150ms;
  }
  .boton:active { transform: scale(0.98); }
  .boton:disabled { opacity: 0.4; cursor: default; }

  .boton-principal {
    color: var(--color-texto);
    background-image: linear-gradient(135deg, var(--color-violeta), var(--color-cian));
    box-shadow: 0 6px 18px color-mix(in srgb, var(--color-violeta) 35%, transparent);
  }
  .boton-secundario {
    color: var(--color-texto);
    background: var(--color-superficie-elevada);
    border: 1px solid var(--color-superficie-borde);
  }
  .boton-peligro { color: var(--color-rechazo); background: var(--color-rechazo-suave); }

  .campo {
    width: 100%; min-height: 44px; padding: 0.625rem 1rem;
    border-radius: var(--radius-medio);
    background: var(--color-hundido); color: var(--color-texto);
    border: 1px solid var(--color-superficie-borde);
  }
  .campo::placeholder { color: var(--color-texto-tenue); }
  .campo:focus {
    outline: none; border-color: var(--color-violeta);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-violeta) 25%, transparent);
  }
  select.campo option { background: var(--color-fondo); color: var(--color-texto); }

  .chip {
    display: inline-flex; align-items: center; min-height: 36px; padding: 0 0.875rem;
    border-radius: 999px; font-size: 0.8125rem;
    color: var(--color-texto-secundario);
    background: var(--color-superficie); border: 1px solid var(--color-superficie-borde);
  }
  .chip-activo {
    color: var(--color-texto); border-color: transparent;
    background-image: linear-gradient(135deg, var(--color-violeta), var(--color-cian));
  }
}
```

- [ ] **Step 3: El layout raíz con Sora**

Reemplazar el contenido entero de `apps/panel/src/app/layout.tsx` por:

```tsx
import type { Metadata } from 'next'
import { Sora } from 'next/font/google'
import './globals.css'

// La misma fuente que la app. --font-sora lo toma el @theme de globals.css.
const sora = Sora({
  variable: '--font-sora',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Panel del gimnasio',
  description: 'Gestión de ejercicios, máquinas y socios',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${sora.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: La barra lateral**

Crear `apps/panel/src/app/(panel)/nav-lateral.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, Dumbbell, House, Users, Wrench, type LucideIcon } from 'lucide-react'

const SECCIONES: { href: string; texto: string; icono: LucideIcon }[] = [
  { href: '/', texto: 'Inicio', icono: House },
  { href: '/socios', texto: 'Socios', icono: Users },
  { href: '/rutinas', texto: 'Rutinas', icono: ClipboardList },
  { href: '/ejercicios', texto: 'Ejercicios', icono: Dumbbell },
  { href: '/maquinas', texto: 'Máquinas', icono: Wrench },
]

/**
 * Cliente solo para saber en qué sección se está: el layout que la contiene
 * sigue siendo de servidor y hace la consulta de la membresía.
 */
export function NavLateral() {
  const ruta = usePathname()
  return (
    <nav className="mt-8 flex flex-col gap-1 text-sm">
      {SECCIONES.map(({ href, texto, icono: Icono }) => {
        const activa = href === '/' ? ruta === '/' : ruta.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={activa ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-medio px-3 transition ${
              activa
                ? 'bg-superficie-elevada text-texto'
                : 'text-texto-secundario hover:bg-superficie hover:text-texto'
            }`}
          >
            <Icono size={18} className={activa ? 'text-cian' : undefined} />
            {texto}
          </Link>
        )
      })}
    </nav>
  )
}
```

El orden de las secciones cambia a Inicio, Socios, Rutinas, Ejercicios, Máquinas: es el orden de uso del personal que fija el spec. Las cinco rutas son las mismas de hoy.

Reemplazar el contenido entero de `apps/panel/src/app/(panel)/layout.tsx` por:

```tsx
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { NavLateral } from './nav-lateral'

export default async function LayoutPanel({
  children,
}: { children: React.ReactNode }) {
  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS ya limita esta consulta a las membresías de quien pregunta.
  //
  // limit(1) y NO single(): una persona puede tener membresía en más de un
  // gimnasio (un entrenador que trabaja en dos), y single() tira error si
  // vuelve más de una fila. Por ahora se usa la más antigua; el selector de
  // gimnasio llega en una etapa posterior.
  const { data: membresia } = await supabase
    .from('memberships')
    .select('rol, gyms(nombre), profiles(nombre, apellido)')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  if (!membresia) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="tarjeta max-w-md space-y-2 p-6">
          <h1 className="text-xl font-semibold">Tu cuenta no está asociada a ningún gimnasio</h1>
          <p className="text-texto-secundario">Pedile a un administrador que te dé de alta.</p>
        </div>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-superficie-borde bg-hundido p-5">
        <div className="flex items-center gap-3">
          <span className="fondo-degrade size-9 shrink-0 rounded-medio" aria-hidden />
          <div className="min-w-0">
            <p className="truncate font-semibold">{membresia.gyms?.nombre}</p>
            <p className="truncate text-xs text-texto-secundario">
              {membresia.profiles?.nombre} · {membresia.rol}
            </p>
          </div>
        </div>
        <NavLateral />
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 5: El login**

Reemplazar el contenido entero de `apps/panel/src/app/login/page.tsx` por el de abajo. La lógica es la misma de hoy; cambian el JSX y las clases.

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap } from 'lucide-react'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setCargando(true)
    setError(null)

    const supabase = crearClienteNavegador()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Mensaje genérico a propósito: distinguir "no existe el usuario" de
      // "la contraseña es incorrecta" le confirma a un atacante qué correos
      // están registrados.
      setError('Correo o contraseña incorrectos')
      setCargando(false)
      return
    }
    router.replace('/')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={enviar} className="tarjeta w-full max-w-sm space-y-5 p-8">
        <span className="fondo-degrade flex size-12 items-center justify-center rounded-grande" aria-hidden>
          <Zap size={24} />
        </span>
        <div className="space-y-1">
          <h1 className="titulo-pagina">Panel del gimnasio</h1>
          <p className="text-sm text-texto-secundario">Entrá con tu cuenta del personal.</p>
        </div>

        <input
          type="email" required value={email} placeholder="Correo" autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          className="campo"
        />
        <input
          type="password" required value={password} placeholder="Contraseña" autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          className="campo"
        />

        {error && <p role="alert" className="text-sm text-rechazo">{error}</p>}

        <button type="submit" disabled={cargando} className="boton boton-principal w-full">
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 6: Verificar**

Run (desde `apps/panel`): `npx next typegen && npx tsc --noEmit && npm run lint`
Expected: sin errores.
Run (desde la raíz): `npm run test:core`
Expected: PASS (las clases nuevas no tocan las variables que compara el test).

- [ ] **Step 7: Commit**

```bash
git add apps/panel/package.json package-lock.json apps/panel/src/app/globals.css apps/panel/src/app/layout.tsx "apps/panel/src/app/(panel)/layout.tsx" "apps/panel/src/app/(panel)/nav-lateral.tsx" apps/panel/src/app/login/page.tsx
git commit -m "Armar la base visual del panel

Sora, las clases de componente equivalentes a las de la app y una
barra lateral con íconos que marca la sección actual. Las clases solo
leen variables del tema: ningún color escrito a mano.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarea 8: Panel — las páginas

**Files:**
- Modify (se reescribe el JSX): `apps/panel/src/app/(panel)/socios/page.tsx`
- Modify: `apps/panel/src/app/(panel)/socios/asignar.tsx`
- Modify: `apps/panel/src/app/(panel)/page.tsx`
- Modify: `apps/panel/src/app/(panel)/rutinas/page.tsx`, `rutinas/formulario.tsx`, `rutinas/formulario-acciones.tsx`, `rutinas/[id]/editor.tsx`
- Modify: `apps/panel/src/app/(panel)/ejercicios/page.tsx`, `ejercicios/formulario.tsx`, `ejercicios/subir-video.tsx`
- Modify: `apps/panel/src/app/(panel)/maquinas/page.tsx`, `maquinas/formulario.tsx`
- Modify: `docs/superpowers/specs/2026-10-09-rediseno-visual-design.md` (estado)

**Interfaces:**
- Consumes: las clases de la Tarea 7 y los utilitarios del `@theme`.
- Produces: nada.

**Solo cambian `className` y la estructura de marcado necesaria para las tarjetas. Las consultas, las server actions, el arrastre del editor de rutinas y los textos visibles quedan iguales.**

- [ ] **Step 1: Socios**

En `apps/panel/src/app/(panel)/socios/page.tsx`, conservar todo lo que está antes del `return` —las tres consultas, la paginación de `ultimas_sesiones`, `plantillas`, `activas` y el formateador `fecha`— y reemplazar el `return (…)` por:

```tsx
  return (
    <div className="space-y-6">
      <h1 className="titulo-pagina">Socios</h1>

      {(socios ?? []).length === 0 && (
        <p className="tarjeta text-texto-secundario">Todavía no hay socios en el gimnasio.</p>
      )}

      <ul className="grid gap-4 lg:grid-cols-2">
        {(socios ?? []).map((s) => {
          const suyas = activas.filter((r) => r.propietario_id === s.id)
          const nombre = `${s.profiles?.nombre ?? ''} ${s.profiles?.apellido ?? ''}`.trim()
          const iniciales = (nombre || '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
          const ultimas = sesiones.filter((x) => x.membership_id === s.id)

          return (
            <li key={s.id} className="tarjeta space-y-4">
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    suyas.length ? 'fondo-degrade' : 'bg-superficie-elevada text-texto-secundario'
                  }`}
                  aria-hidden
                >
                  {iniciales}
                </span>
                <div>
                  <p className="font-semibold">{nombre || 'Sin nombre'}</p>
                  <p className="text-xs text-texto-secundario">
                    {suyas.length ? `${suyas.length} ${suyas.length === 1 ? 'rutina activa' : 'rutinas activas'}` : 'Sin rutinas activas.'}
                  </p>
                </div>
              </div>

              {suyas.length > 0 && (
                <ul className="space-y-2">
                  {suyas.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-medio bg-hundido px-3 py-2 text-sm">
                      <span>{r.nombre}</span>
                      {/* La que se armó solo el socio no se edita: la RLS ya lo
                          decide, acá solo se refleja para no ofrecer un botón
                          que va a fallar. */}
                      {r.asignada_por ? (
                        <Link href={`/rutinas/${r.id}`} className="enlace">editar</Link>
                      ) : (
                        <span className="text-texto-tenue">(se la armó el socio)</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-1 text-sm">
                <p className="etiqueta">Últimas sesiones</p>
                {ultimas.length ? (
                  <ul className="space-y-0.5 tabular-nums text-texto">
                    {ultimas.map((x) => (
                      <li key={x.id!}>
                        {fecha.format(new Date(x.inicio!))}
                        {' · '}{x.dia_nombre ?? 'Entrenamiento libre'}
                        {' · '}{x.series} series
                        {!x.fin && <span className="text-pendiente"> · sin terminar</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-texto-tenue">Todavía no registró entrenamientos.</p>
                )}
              </div>

              <Asignar socioId={s.id} plantillas={plantillas} />
            </li>
          )
        })}
      </ul>
    </div>
  )
```

"Todavía no hay socios en el gimnasio." es el único texto nuevo: hoy, sin socios, la página mostraba una lista vacía.

- [ ] **Step 2: El resto de las páginas, con estas reglas**

Leer cada archivo entero antes de editarlo. Reemplazar las clases así:

| Antes | Después |
|---|---|
| `text-2xl font-semibold` (el `h1` de cada página) | `titulo-pagina` |
| `space-y-8` del contenedor de la página | `space-y-6` |
| Listas `divide-y rounded border` | `space-y-2` en el `ul`, y cada `li` con `tarjeta` + su distribución (`flex items-center justify-between gap-3`, etc.). El `px-4 py-3` del `li` sale: lo pone la tarjeta |
| Contenedores `rounded border p-4` (formularios en caja) | `tarjeta` |
| Títulos de sección `mb-2 font-semibold` | `etiqueta mb-2` |
| `text-gray-700` | `text-texto` |
| `text-gray-600`, `text-gray-500` | `text-texto-secundario` |
| `text-gray-400` | `text-texto-tenue` |
| `text-red-600`, `hover:text-red-600` | `text-rechazo`, `hover:text-rechazo` |
| `text-green-700` | `text-cian` |
| `text-blue-700 underline`, `underline`, `hover:underline` en links | `enlace` |
| `<input>`/`<select>`/`<textarea>` con `rounded border px-… py-…` | `campo`, conservando los anchos (`w-16`, `w-24`, `sm:col-span-2`…) |
| El botón de enviar de cada formulario (`rounded bg-black … text-white`) | `boton boton-principal`, conservando anchos y `sm:col-span-2` |
| Botones secundarios (`rounded border px-… py-…`) | `boton boton-secundario`; los que borran o archivan, `boton boton-peligro` |
| `disabled:opacity-50` | Se borra: `.boton:disabled` ya lo hace |
| `hover:bg-gray-100` | `hover:bg-superficie` |
| `cursor-grab` en filas arrastrables | Se queda |

Atención especial:
- `rutinas/[id]/editor.tsx` arrastra días y ejercicios. Cambiar solo `className`; no mover ni envolver los elementos que tienen los handlers de arrastre.
- `ejercicios/subir-video.tsx` tiene estados de subida (subiendo, listo, error): mapear sus colores con la tabla; la lógica de la subida no se toca.
- `(panel)/page.tsx` (Inicio) es solo el título: `titulo-pagina`.

Cuando termines, `git grep -n -E "gray-|red-|green-|blue-|bg-black|bg-white|text-white" -- apps/panel/src` no tiene que devolver nada.

- [ ] **Step 3: El estado del spec**

En `docs/superpowers/specs/2026-10-09-rediseno-visual-design.md`, reemplazar `**Estado:** Aprobado en conversación.` por `**Estado:** Implementado. Plan: [\`2026-10-09-rediseno-visual.md\`](../plans/2026-10-09-rediseno-visual.md).`

- [ ] **Step 4: Verificar**

Run (desde `apps/panel`): `npx next typegen && npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add "apps/panel/src/app/(panel)" docs/superpowers/specs/2026-10-09-rediseno-visual-design.md
git commit -m "Pasar las páginas del panel al sistema visual

Socios pasa a tarjetas con iniciales, rutina y últimas sesiones; el
resto de las páginas usa las mismas clases que la app. Las consultas,
las server actions y el arrastre del editor no cambian.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Verificación final de la rama

- [ ] `npm run test:core` — PASS, con `tema.test.ts` (29) y `tiempo.test.ts` (5) además de los de la etapa 3.
- [ ] `npm run test:rls` — PASS, igual que antes: el rediseño no toca la base.
- [ ] `apps/movil`: `npx tsc --noEmit && npm run lint` — sin errores nuevos.
- [ ] `apps/panel`: `npx tsc --noEmit && npm run lint` — sin errores.
- [ ] `git grep -n -E "#[0-9a-fA-F]{3,6}\b|rgba\(" -- apps/movil/src/app apps/movil/src/components` — vacío: los colores salen de core.
- [ ] `git grep -n -E "gray-|red-|green-|blue-|bg-black|bg-white|text-white" -- apps/panel/src` — vacío.

**Revisión visual, del controlador**, contra las maquetas aprobadas en `.superpowers/brainstorm/` (dirección C y la hoja de componentes y panel):
- Panel en Chrome: login, Inicio, Socios, Rutinas, el editor de una rutina, Ejercicios, Máquinas.
- App: login, Hoy (con y sin rutina, con sesión abierta), la sesión con un récord, Rutinas y su armador, Ejercicios y un detalle con video, Progreso, una sesión del historial y la evolución de un ejercicio. En web si `expo-sqlite` lo permite; si no, con capturas del teléfono del usuario.

**Recorrido a mano, para el usuario:** el de la etapa 3 —que quedó pendiente justamente por el diseño— con la app nueva.
