import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'ApiSpy',
      fileName: 'api-spy',
    },
    rollupOptions: {
      output: [
        // ESM / CJS: 保留懒加载分包
        {
          format: 'es',
          exports: 'named',
          entryFileNames: 'api-spy.js',
        },
        {
          format: 'cjs',
          exports: 'named',
          entryFileNames: 'api-spy.cjs',
        },
        // IIFE: 动态 import 内联，保证单文件可用
        {
          format: 'iife',
          name: 'ApiSpy',
          exports: 'named',
          entryFileNames: 'api-spy.iife.js',
          inlineDynamicImports: true,
        },
      ],
    },
    sourcemap: true,
    minify: 'esbuild',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
})
