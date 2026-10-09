# Diseño — Rediseño visual de la app y el panel

**Fecha:** 2026-10-09
**Estado:** Implementado. Plan: [`2026-10-09-rediseno-visual.md`](../plans/2026-10-09-rediseno-visual.md).
**Parte de:** la etapa 3 terminada (rama `etapa-3`). No agrega funciones: cambia cómo se ven y se usan las pantallas que ya existen.

---

## 0. Por qué y alcance

La interfaz actual es la de un prototipo: cada pantalla define sus propios colores y estilos sueltos, sin un sistema común, y el resultado no transmite nada del mundo fitness. El rediseño crea ese sistema y pasa a él **todas las pantallas de la app del socio y del panel del gimnasio**.

| Entra | Queda fuera |
|---|---|
| Sistema visual compartido: colores, degradé, tipografía, radios, espaciado | Funciones nuevas: rachas, contadores de sesiones, tiempo estimado (aparecían en la maqueta y se dejan para otra etapa) |
| Componentes base de la app | Colores por gimnasio (ver sección 1) |
| Todas las pantallas de la app y del panel | Modo claro |
| Dos agregados chicos de experiencia: cronómetro de la sesión y vibración al tildar (sección 4) | Cambios de navegación o de flujos |

---

## 1. Decisiones de dirección

**Dirección elegida: "Neón eléctrico".** Se evaluaron tres con maquetas —energía oscura (negro + lima), luz atlética (claro + naranja) y neón eléctrico (azul noche + degradé violeta→cian con tarjetas tipo vidrio)— y se eligió la tercera.

**Identidad fija para todos los gimnasios.** Se descartó, por ahora, que cada gimnasio elija su color: cada acento tendría que validarse contra el fondo oscuro, guardarse en la base y leerse antes de pintar la primera pantalla. Con los valores centralizados en un solo archivo (sección 2), pasar a colores por gimnasio más adelante es cambiar de dónde salen esos valores, no rehacer pantallas.

**Enfoque: sistema propio, sin librería de UI.** Se descartaron Tamagui/gluestack —dependencia grande que impone su forma de trabajar y con compatibilidad dudosa con Expo 57 / React Native 0.86— y NativeWind —depende de que funcione con Tailwind 4 sobre esta versión, y si falla toda la app depende de eso—.

**Solo modo oscuro.** La app hoy sigue el modo del sistema; con este fondo no tiene sentido una versión clara, y forzarlo evita pantallas mezcladas en un teléfono en modo claro.

---

## 2. El sistema visual

### Los valores viven en `packages/core/src/tema.ts`

Solo valores, sin nada de interfaz, para que los usen las dos apps.

| Rol | Valor | Uso |
|---|---|---|
| Fondo | `#0A0F1E`, con degradé hacia `#1E1650` arriba | Fondo de todas las pantallas |
| Superficie | blanco al 5 % con borde blanco al 8 % | Tarjetas tipo vidrio |
| Superficie elevada | blanco al 8 % | Campos, filas abiertas, modales |
| Texto | `#EEF1FF` · secundario `#8C93B8` · tenue `#5B6290` | Jerarquía |
| Marca | violeta `#7C5CFF` → cian `#22D3EE`, a 135° | Una acción o dato destacado por pantalla |
| Pendiente | ámbar `#F59E0B` | "N series sin sincronizar" |
| Rechazo / error | coral `#F87171` | "No se pudo guardar", errores |
| Récord | dorado `#FACC15` | Puntos de récord en el gráfico |

**El degradé se reserva para una sola acción o dato por pantalla** —el botón principal, el tilde hecho, el aviso de récord, la pestaña activa—. Usado en todos lados deja de señalar algo.

**Tipografía:** Sora 400, 600 y 700. Escala de seis tamaños: 28, 22, 17, 15, 13, 11. Los números —peso, repeticiones, reloj— van con cifras de ancho fijo para que no "bailen".

**Forma:** radios 10, 14, 18, 24. Espaciado en pasos de 4: 4, 8, 12, 16, 24. **Todo lo que se toca mide al menos 44 px**: se usa con las manos transpiradas o con guantes.

**Contraste:** el texto principal y el secundario superan 4,5:1 sobre el fondo. El tenue queda para datos de apoyo, nunca para algo que haya que leer para avanzar.

### Cómo llega a cada app

- **App:** importa los valores de `@gym/core` directamente.
- **Panel:** Tailwind 4 define su tema en CSS (`@theme` en `globals.css`) y no puede importar TypeScript, así que los valores se repiten ahí. Un test de core lee `globals.css` y verifica que coincidan con `tema.ts`, para que no se desincronicen sin que nadie lo note.

---

## 3. Componentes

### App: `apps/movil/src/ui/`

| Componente | Qué es |
|---|---|
| `Fondo` | El fondo con degradé, envuelve cada pantalla |
| `Texto` | Texto con Sora y la escala de tamaños; variante numérica con cifras fijas |
| `Tarjeta` | Superficie de vidrio |
| `Boton` | Principal (degradé), secundario (vidrio), peligro (coral), deshabilitado |
| `Chip` | Selección: días de la rutina, filtros, selector de Progreso |
| `Campo` | Entrada de texto; el foco se marca en violeta |
| `FilaSerie` | Número, peso, repeticiones y tilde de 44 px que se llena con el degradé; las hechas se atenúan |
| `Aviso` | Pendiente (ámbar), rechazo (coral), récord (degradé) |

La fuente se carga en el layout raíz con `useFonts` antes de mostrar la primera pantalla. Encabezados y barra de pestañas usan un tema de navegación oscuro propio. Íconos: `@expo/vector-icons` (Ionicons). No viene incluido en este proyecto —el template de Expo 57 trae `expo-symbols`, que usa nombres distintos por plataforma—, así que se instala; funciona igual en iOS, Android y web.

Dependencias nuevas de la app: `@expo-google-fonts/sora`, `expo-linear-gradient`, `expo-haptics`, `@expo/vector-icons`.

### Panel

Sora con `next/font`, el tema de Tailwind con los valores de la sección 2, y un layout nuevo con **barra lateral** —nombre del gimnasio y las cuatro secciones: Socios, Rutinas, Ejercicios, Máquinas—. Cada página: título con acciones a la derecha y contenido en tarjetas. Íconos: `lucide-react`.

---

## 4. Pantallas

Todas pasan a usar los componentes de la sección 3. Cambios de experiencia, sin funciones nuevas:

**App**

- **Login:** pantalla de marca con el degradé y los campos nuevos.
- **Hoy:** tarjeta principal "Hoy toca" con el día y un **Empezar** grande con degradé; los días como chips; el aviso de sesión sin terminar como tarjeta destacada; cerrar sesión pasa al encabezado en vez de un botón suelto al pie.
- **Sesión:** la fila de serie nueva, el aviso de récord como banner con degradé, el acordeón con tarjetas de vidrio.
  - **Cronómetro** en el encabezado con el tiempo desde el inicio de la sesión. No es un dato nuevo: `inicio` ya se guarda. Mientras no se tildó la primera serie —la sesión todavía no existe— muestra `0:00`.
  - **Vibración corta al tildar una serie** (`expo-haptics`): confirma el toque sin mirar. Si el teléfono no vibra, no pasa nada.
- **Rutinas, Ejercicios, buscador:** tarjetas, chips y campos nuevos. El reordenamiento con arrastre no cambia.
- **Progreso:** récords como tarjetas con el número grande; el gráfico con la línea en degradé y los récords en dorado; el selector con chips.

**Panel**

- **Socios:** cada socio es una tarjeta con sus iniciales, su rutina activa con editar o asignar, y sus últimas sesiones.
- **Rutinas, editor de días, Ejercicios, Máquinas, login:** la misma estructura de barra lateral, título con acciones y tarjetas.

---

## 5. Orden del trabajo

1. `tema.ts` con sus tests.
2. Base de la app: fuente, fondo, componentes y tema de navegación.
3. Pantallas de la app, por grupos: login y Hoy; sesión; Rutinas y Ejercicios; Progreso.
4. Panel: tema, layout y cada página.

---

## 6. Verificación

- **Tests de core** para el tema: contraste mínimo del texto principal y secundario, y coincidencia de `globals.css` con `tema.ts`.
- **`tsc` y lint** en las dos apps, sin errores nuevos.
- **Revisión visual con capturas:** la app también corre en web, así que cada pantalla se abre en el navegador y se compara contra las maquetas aprobadas antes de dar el grupo por terminado. La confirmación final, en el teléfono, es del usuario.
- **Sin regresiones de comportamiento:** el rediseño no toca lógica. Los tests de base y de core de la etapa 3 tienen que seguir pasando igual, y las pantallas mantienen sus flujos: Empezar, tildar, Terminar, retomar, sincronizar.
