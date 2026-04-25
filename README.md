<h1>css-typed-vars</h1>
<p>Generate TypeScript typed constants from CSS custom properties</p>

<p>
  <a href="https://github.com/StanislavKozachenko/css-typed-vars/actions"><img src="https://github.com/StanislavKozachenko/css-typed-vars/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/css-typed-vars"><img src="https://img.shields.io/npm/v/css-typed-vars" alt="npm version" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/github/license/StanislavKozachenko/css-typed-vars" alt="MIT License" /></a>
</p>

---

- [Installation](#installation)
- [Two approaches](#two-approaches)
- [CLI](#cli)
  - [CLI flags](#cli-flags)
  - [Config file](#config-file)
- [Plugin](#plugin)
  - [Vite](#vite)
  - [webpack](#webpack)
  - [Rollup](#rollup)
  - [esbuild](#esbuild)
  - [Next.js (webpack)](#nextjs-webpack)
  - [Turbopack](#turbopack)
  - [Plugin options](#plugin-options)
- [Usage](#usage)
- [Programmatic API](#programmatic-api)
- [Supported formats](#supported-formats)
- [Contributing](#contributing)

---

`var(--color-primary)` is just a string. Rename the variable — the error shows up only in the browser.

`css-typed-vars` scans your CSS files and gives you typed constants. Use `cssVars.colorPrimary` instead — TypeScript catches missing variables at compile time.

## Installation

```sh
npm install -D css-typed-vars
```

## Two approaches

| | CLI | Plugin |
|---|---|---|
| How it works | Generates `cssVars.ts` in your project | Virtual module, no file generated |
| Import | `import { cssVars } from './cssVars'` | `import { cssVars } from 'css-typed-vars/vars'` |
| Watch | `--watch` flag | `vite dev`, browser reloads automatically |
| Works with | Everything | Vite, webpack, Rollup, esbuild (not Turbopack) |

---

## CLI

Create a config file in your project root:

```js
// css-typed-vars.config.js
export default {
  input: 'src/styles/**/*.{css,scss}',
  output: 'src/cssVars.ts',
};
```

Then run:

```sh
npx css-typed-vars         # generate once
npx css-typed-vars --watch # watch for changes
```

Add to your `package.json` scripts:

```json
{
  "scripts": {
    "generate:vars": "css-typed-vars",
    "generate:vars:watch": "css-typed-vars --watch"
  }
}
```

Given this CSS:

```css
:root {
  --color-primary: #3b82f6;
  --spacing-md: 8px;
}
```

Generates `src/cssVars.ts`:

```ts
// generated — do not edit
export const cssVars = {
  colorPrimary: 'var(--color-primary)',
  spacingMd: 'var(--spacing-md)',
} as const;

export type CssVarName = keyof typeof cssVars;
```

### CLI flags

```sh
npx css-typed-vars --input "src/styles/**/*.css" --output src/cssVars.ts
npx css-typed-vars --input "src/styles/**/*.{css,scss}" --output src/cssVars.ts --watch
```

```sh
npx css-typed-vars --input "src/**/*.css" --output src/cssVars.ts --exclude "**/vendor/**"
npx css-typed-vars --input "src/**/*.css" --output src/cssVars.ts --prefix theme --naming snake
npx css-typed-vars --input "src/**/*.css" --output src/cssVars.js  # generates .js + .d.ts
```

| Flag | Description |
|------|-------------|
| `--input` | Glob pattern for CSS/SCSS/Less files |
| `--output` | Output file. `.ts` → TypeScript, `.js` → JavaScript + `.d.ts` alongside |
| `--exclude` | Glob pattern for files to exclude (single value; use config file for multiple) |
| `--prefix` | Prefix for generated keys: `--prefix theme` → `themeColorPrimary` |
| `--naming` | Key naming: `camelCase` (default), `snake`, `kebab` |
| `--watch` | Watch for file changes and regenerate |
| `--version`, `-v` | Print the version number and exit |

CLI flags override values from the config file.

### Config file

The CLI looks for a config file in the current working directory (in order):

1. `css-typed-vars.config.js`
2. `css-typed-vars.config.mjs`
3. `css-typed-vars.config.json`

All options are supported in the config file:

```js
// css-typed-vars.config.js
export default {
  input: 'src/styles/**/*.{css,scss}',
  output: 'src/cssVars.ts',
  exclude: ['**/vendor/**', '**/node_modules/**'],
  prefix: 'theme',
  naming: 'snake', // 'camelCase' | 'snake' | 'kebab'
};
```

---

## Plugin

No file is generated — CSS variables are served as a virtual module directly by your bundler. Import from `css-typed-vars/vars` in your source code.

TypeScript types are written to `node_modules/css-typed-vars/dist/generated.d.ts` automatically on each build or dev server start.

### Vite

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

### webpack

```js
// webpack.config.js
import cssTypedVars from 'css-typed-vars/webpack';

export default {
  plugins: [cssTypedVars({ input: 'src/styles/**/*.{css,scss}' })],
};
```

### Rollup

```js
// rollup.config.js
import cssTypedVars from 'css-typed-vars/rollup';

export default {
  plugins: [cssTypedVars({ input: 'src/styles/**/*.{css,scss}' })],
};
```

### esbuild

```js
import cssTypedVars from 'css-typed-vars/esbuild';

await esbuild.build({
  plugins: [cssTypedVars({ input: 'src/styles/**/*.{css,scss}' })],
});
```

### Next.js (webpack)

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

### Turbopack

Turbopack does not yet have a public plugin API for virtual modules. Use the CLI instead:

```json
{
  "scripts": {
    "dev": "css-typed-vars && next dev --turbo",
    "build": "css-typed-vars && next build"
  }
}
```

### Plugin options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `input` | `string \| string[]` | — | Glob pattern for CSS/SCSS/Less files |
| `exclude` | `string \| string[]` | — | Glob pattern(s) for files to exclude |
| `prefix` | `string` | — | Prefix for generated keys: `'theme'` → `themeColorPrimary` |
| `naming` | `'camelCase' \| 'snake' \| 'kebab'` | `'camelCase'` | Key naming convention |
| `dts` | `string \| false` | inside `node_modules` | Path to write type declarations. `false` to skip |

---

## Usage

**React:**

```tsx
import { cssVars } from './cssVars'; // CLI
// or
import { cssVars } from 'css-typed-vars/vars'; // plugin

<div style={{ color: cssVars.colorPrimary, padding: cssVars.spacingMd }} />
```

**styled-components / emotion:**

```ts
const Button = styled.button`
  color: ${cssVars.colorPrimary};
  padding: ${cssVars.spacingMd};
`;
```

**Vue:**

```vue
<div :style="{ color: cssVars.colorPrimary }" />
```

**Svelte:**

```svelte
<div style:color={cssVars.colorPrimary} />
```

**Tailwind arbitrary values:**

```tsx
<div className={`text-[${cssVars.colorPrimary}]`} />
```

---

## Programmatic API

```ts
import { generate } from 'css-typed-vars';

await generate({
  input: 'src/styles/**/*.{css,scss}',
  output: 'src/cssVars.ts',  // or 'src/cssVars.js' → generates .js + .d.ts
  exclude: ['**/vendor/**'],
  prefix: 'theme',
  naming: 'snake',           // 'camelCase' | 'snake' | 'kebab'
});
```

Lower-level exports:

```ts
import { parseVarNames, generateCode, scanVarNames } from 'css-typed-vars';
```

## Supported formats

| Format | Extension |
|--------|-----------|
| CSS | `.css` |
| SCSS | `.scss` |
| Less | `.less` |

Variables must be declared inside a `:root {}` block. Attribute selectors are supported (e.g. `:root[data-theme="dark"]`).

## Contributing

Contributions are welcome. Please open an issue before submitting a pull request.

```sh
git clone https://github.com/StanislavKozachenko/css-typed-vars.git
cd css-typed-vars
npm install
npm test
```

## License

MIT
