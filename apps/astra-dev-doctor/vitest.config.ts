/// <reference types='vitest' />

import swc from 'unplugin-swc';
import {defineConfig} from 'vite';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/astra-dev-doctor',
  plugins: [
    swc.vite({
      jsc: {
        parser: {syntax: 'typescript', decorators: true, dynamicImport: true},
        transform: {decoratorMetadata: true, legacyDecorator: true},
        target: 'es2021',
        keepClassNames: true,
      },
    }),
  ],
  test: {
    name: '@ids-ai-skeleton/astra-dev-doctor',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{js,ts}'],
    exclude: ['node_modules', 'dist', 'out-tsc'],
    reporters: ['default'],
  },
});
