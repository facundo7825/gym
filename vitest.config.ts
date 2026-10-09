import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Solo la base. Los de tests/funciones necesitan además
    // `npx supabase functions serve`, y van con su propia configuración.
    include: ['tests/rls/**/*.test.ts'],
    // Los tests de RLS comparten una única base local. Si corrieran en
    // paralelo se pisarían los datos entre sí.
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ['./tests/setup.ts'],
    // Acá vivía un pool 'forks' con execArgv: ['--experimental-websocket'].
    // supabase-js arma un cliente de Realtime al construirse y eso exige un
    // WebSocket global, que Node 20 solo exponía detrás de ese flag. Desde
    // Node 22 es nativo, y el motor mínimo está fijado en package.json.
  },
})
