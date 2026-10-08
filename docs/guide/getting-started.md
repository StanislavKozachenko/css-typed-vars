# Getting started

`var(--color-primary)` is just a string. Rename the variable — the error shows up only in the browser.

`css-typed-vars` scans your CSS files and gives you typed constants. Use `cssVars.colorPrimary` instead — TypeScript catches missing variables at compile time.

Each generated key also carries a `/** @default ... */` comment with the property's declared CSS value, so your editor shows it on hover and autocomplete.

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

See [CLI](/guide/cli) and [Plugin](/guide/plugin) for the full setup of each.

## Quick example

Given this CSS:

```css
:root {
  --color-primary: #3b82f6;
  --spacing-md: 8px;
}
```

`css-typed-vars` generates:

```ts
// generated — do not edit
export const cssVars = {
  /** @default #3b82f6 */
  colorPrimary: 'var(--color-primary)',
  /** @default 8px */
  spacingMd: 'var(--spacing-md)',
} as const;

export type CssVarName = keyof typeof cssVars;
```

Use it anywhere you'd normally write a `var(...)` string — see [Usage examples](/guide/usage).
