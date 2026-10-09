import { defineConfig } from 'vitest/config'

// Los tests de las Edge Functions. Necesitan, además de `npx supabase start`,
// `npx supabase functions serve` corriendo en otra terminal: sin él, cada
// llamada falla con un error de conexión.
export default defineConfig({
  test: {
    include: ['tests/funciones/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ['./tests/setup.ts'],
  },
})
