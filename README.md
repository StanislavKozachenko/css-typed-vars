<h1>css-typed-vars</h1>
<p>Generate TypeScript typed constants from CSS custom properties</p>

<p>
  <a href="https://github.com/StanislavKozachenko/css-typed-vars/actions"><img src="https://github.com/StanislavKozachenko/css-typed-vars/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/css-typed-vars"><img src="https://img.shields.io/npm/v/css-typed-vars" alt="npm version" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/github/license/StanislavKozachenko/css-typed-vars" alt="MIT License" /></a>
</p>

---

`var(--color-primary)` is just a string. Rename the variable — the error shows up only in the browser.

`css-typed-vars` scans your CSS files and generates a typed constants file. Use `cssVars.colorPrimary` instead — TypeScript catches missing variables at compile time.

## Installation

```sh
npm install -D css-typed-vars
```

## Quick start

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

## How it works

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

## Usage

**React:**

```tsx
import { cssVars } from './cssVars';

<div style={{ color: cssVars.colorPrimary, padding: cssVars.spacingMd }} />
```

**styled-components / emotion:**

```ts
import { cssVars } from './cssVars';

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

## CLI

```sh
npx css-typed-vars --input "src/styles/**/*.css" --output src/cssVars.ts
npx css-typed-vars --input "src/styles/**/*.{css,scss}" --output src/cssVars.ts --watch
```

| Flag | Description |
|------|-------------|
| `--input` | Glob pattern for CSS/SCSS/Less files |
| `--output` | Path to the generated TypeScript file |
| `--watch` | Watch for file changes and regenerate |

CLI flags override values from the config file.

## Config file

The CLI looks for a config file in the current working directory (in order):

1. `css-typed-vars.config.js`
2. `css-typed-vars.config.mjs`
3. `css-typed-vars.config.json`

```js
// css-typed-vars.config.js
export default {
  input: 'src/styles/**/*.{css,scss}',
  output: 'src/cssVars.ts',
};
```

## Programmatic API

```ts
import { generate } from 'css-typed-vars';

await generate({
  input: 'src/styles/**/*.{css,scss}',
  output: 'src/cssVars.ts',
});
```

Lower-level exports:

```ts
import { parseVarNames, generateCode, scanVarNames } from 'css-typed-vars';
```

## Supported formats

| Format | Extension | Supported |
|--------|-----------|-----------|
| CSS | `.css` | ✓ |
| SCSS | `.scss` | ✓ |
| Less | `.less` | ✓ |

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
