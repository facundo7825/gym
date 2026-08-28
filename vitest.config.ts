import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Los tests de RLS comparten una única base local. Si corrieran en
    // paralelo se pisarían los datos entre sí.
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ['./tests/setup.ts'],
  },
})
