# Gym — plataforma SaaS para gimnasios

App móvil para socios y panel web para el personal del gimnasio.

**Para el socio (Android e iOS):** ver las rutinas de su gimnasio, armarse rutinas
propias con los ejercicios y máquinas de ese gym, mirar el video de cada ejercicio
y registrar sus entrenamientos serie por serie —también sin señal.

**Para el gimnasio (web):** cargar ejercicios, máquinas y videos, crear rutinas y
asignarlas a socios, gestionar socios y cuotas, y hacer el check-in de asistencia
por QR.

Es multi-gimnasio: cada gym contratante tiene sus datos aislados de los demás.

## Estado

En diseño. Todavía no hay código.

📄 **[Diseño completo](docs/superpowers/specs/2026-08-27-gym-saas-design.md)** — es la
referencia del proyecto: modelo de datos, decisiones de arquitectura y por qué se
tomó cada una, qué queda fuera de alcance y en qué orden se construye.

## Stack previsto

| Pieza | Tecnología |
|---|---|
| App móvil | Expo (React Native, TypeScript) |
| Panel web | Next.js (TypeScript) |
| Base de datos, auth, storage | Supabase (PostgreSQL) |
| Videos | Cloudflare Stream |
| Push | Expo Notifications |

## Etapas

| # | Etapa | Estado |
|---|---|---|
| 0 | Cimientos: esquema, auth, roles y aislamiento entre gimnasios | Pendiente |
| 1 | Ejercicios, máquinas y videos | Pendiente |
| 2 | Rutinas: catálogo, armador propio y asignación | Pendiente |
| 3 | Registro de entrenamiento, modo sin conexión y progreso | Pendiente |
| 4 | Socios, cuotas y check-in con QR | Pendiente |
| 5 | Notificaciones push y publicación en las tiendas | Pendiente |

Al terminar la etapa 2 hay una demo completa para mostrarle a un gimnasio real.
