import {resolve} from 'node:path';
import {defineConfig} from 'vite';

export default defineConfig({
  root: __dirname,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'IdsDoctor',
      fileName: () => 'doctor.js',
      formats: ['iife'],
    },
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    minify: false,
  },
});
