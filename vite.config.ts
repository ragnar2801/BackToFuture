import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const isSingleFile = process.env.SINGLE_FILE === '1';

export default defineConfig({
  plugins: isSingleFile ? [viteSingleFile()] : [],
  base: './',
  build: {
    outDir: isSingleFile ? 'dist-single' : 'dist',
    target: 'es2022',
  },
});
