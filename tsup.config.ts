import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    unplugin: 'src/unplugin.ts',
    vite: 'src/vite.ts',
    rollup: 'src/rollup.ts',
    webpack: 'src/webpack.ts',
    esbuild: 'src/esbuild.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  shims: true,
});
