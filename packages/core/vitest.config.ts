import { defineConfig } from 'vitest/config'

// Sin esta config propia, vitest sube buscando una y termina heredando la de
// la raíz, que es la de los tests de RLS: su `setupFiles: ['./tests/setup.ts']`
// resuelve contra este paquete y falla con "Cannot find module". Los tests de
// `core` son puros: no necesitan base ni setup.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
