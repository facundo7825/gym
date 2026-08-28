import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Los tests de RLS comparten una única base local. Si corrieran en
    // paralelo se pisarían los datos entre sí.
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ['./tests/setup.ts'],
    poolOptions: {
      forks: {
        // supabase-js construye un cliente de Realtime al importarse, y eso
        // exige WebSocket global. Node 20 solo lo expone detrás de este flag.
        // Va acá y no en NODE_OPTIONS del script para que funcione igual en
        // Windows, Linux y CI: `set VAR=x&&` es sintaxis solo de cmd.exe.
        execArgv: ['--experimental-websocket'],
      },
    },
  },
})
