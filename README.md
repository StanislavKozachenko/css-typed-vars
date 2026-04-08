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

## CLI

```sh
npx css-typed-vars --input "src/styles/**/*.css" --output src/cssVars.ts
npx css-typed-vars --input "src/styles/**/*.{css,scss}" --output src/cssVars.ts --watch
```

Given this CSS/SCSS:

```css
:root {
  --color-primary: #3b82f6;
  --spacing-md: 8px;
}
```

Generates:

```ts
// generated — do not edit
export const cssVars = {
  colorPrimary: 'var(--color-primary)',
  spacingMd: 'var(--spacing-md)',
} as const;

export type CssVarName = keyof typeof cssVars;
```

Now in your code:

```ts
import { cssVars } from './cssVars';

element.style.color = cssVars.colorPrimary;  // ✓
element.style.color = cssVars.colorPrimeryy; // ✗ TypeScript error
```

## Supported formats

| Format | Extension | Supported |
|--------|-----------|-----------|
| CSS | `.css` | ✓ |
| SCSS | `.scss` | ✓ |
| Less | `.less` | ✓ |

Variables must be declared inside a `:root {}` block. Attribute selectors are supported (e.g. `:root[data-theme="dark"]`).

## Programmatic API

```ts
import { generate } from 'css-typed-vars';

await generate({
  input: 'src/styles/**/*.{css,scss}',
  output: 'src/cssVars.ts',
});
```

## License

MIT
