# Plugin

No file is generated — CSS variables are served as a virtual module directly by your bundler. Import from `css-typed-vars/vars` in your source code.

TypeScript types are written to `node_modules/css-typed-vars/dist/generated.d.ts` automatically on each build or dev server start.

## Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import cssTypedVars from 'css-typed-vars/vite';

export default defineConfig({
  plugins: [
    cssTypedVars({ input: 'src/styles/**/*.{css,scss}' }),
  ],
});
```

```ts
// src/index.ts
import { cssVars } from 'css-typed-vars/vars';
```

In dev mode, editing a watched CSS/SCSS/Less file triggers a rescan and a full page reload automatically.

## webpack

```js
// webpack.config.js
import cssTypedVars from 'css-typed-vars/webpack';

export default {
  plugins: [cssTypedVars({ input: 'src/styles/**/*.{css,scss}' })],
};
```

## Rollup

```js
// rollup.config.js
import cssTypedVars from 'css-typed-vars/rollup';

export default {
  plugins: [cssTypedVars({ input: 'src/styles/**/*.{css,scss}' })],
};
```

## esbuild

```js
import cssTypedVars from 'css-typed-vars/esbuild';

await esbuild.build({
  plugins: [cssTypedVars({ input: 'src/styles/**/*.{css,scss}' })],
});
```

## Next.js (webpack)

```js
// next.config.js
const cssTypedVars = require('css-typed-vars/webpack');

module.exports = {
  webpack(config) {
    config.plugins.push(cssTypedVars({ input: 'styles/**/*.{css,scss}' }));
    return config;
  },
};
```

## Turbopack

Turbopack does not yet have a public plugin API for virtual modules. Use the [CLI](/guide/cli) instead:

```json
{
  "scripts": {
    "dev": "css-typed-vars && next dev --turbo",
    "build": "css-typed-vars && next build"
  }
}
```

## Plugin options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `input` | `string \| string[]` | — | Glob pattern for CSS/SCSS/Less files |
| `exclude` | `string \| string[]` | — | Glob pattern(s) for files to exclude |
| `prefix` | `string` | — | Prefix for generated keys: `'theme'` → `themeColorPrimary` |
| `naming` | `'camelCase' \| 'snake' \| 'kebab' \| 'constant' \| 'pascal'` | `'camelCase'` | Key naming convention — see [Naming conventions](/guide/naming-conventions) |
| `selectors` | `string[]` | — | Extra CSS selectors to scan, e.g. `['.dark', '[data-theme="dark"]']` |
| `group` | `boolean` | `false` | Nest keys by each variable's first hyphen segment, e.g. `cssVars.color.primary` — see [Grouped output](/guide/cli#grouped-output). Can't be combined with `prefix` |
| `prune` | `boolean` | `false` | Drop vars with no detected `cssVars.<key>` usage — see [Pruning unused variables](/guide/cli#pruning-unused-variables). Requires `usage`. Can't be combined with `group` |
| `usage` | `string \| string[]` | — | Glob(s) of source files to scan for `cssVars` usage, for `prune` |
| `usageExclude` | `string \| string[]` | — | Glob(s) of source files to exclude from the usage scan |
| `dts` | `string \| false` | inside `node_modules` | Path to write type declarations. `false` to skip |
