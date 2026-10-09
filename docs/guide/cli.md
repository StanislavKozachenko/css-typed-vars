# CLI

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

## Flags

```sh
npx css-typed-vars --input "src/styles/**/*.css" --output src/cssVars.ts
npx css-typed-vars --input "src/styles/**/*.{css,scss}" --output src/cssVars.ts --watch
npx css-typed-vars --input "src/**/*.css" --output src/cssVars.ts --exclude "**/vendor/**"
npx css-typed-vars --input "src/**/*.css" --output src/cssVars.ts --prefix theme --naming snake
npx css-typed-vars --input "src/**/*.css" --output src/cssVars.js  # generates .js + .d.ts
npx css-typed-vars --input "src/**/*.css" --output src/cssVars.ts --selector ".dark" --selector "[data-theme='dark']"
npx css-typed-vars --input "src/**/*.css" --output src/cssVars.ts --check  # for CI: exits 1 if out of date
npx css-typed-vars --input "src/**/*.css" --output src/cssVars.ts --group  # nest keys by first name segment
```

| Flag | Description |
|------|-------------|
| `--input` | Glob pattern for CSS/SCSS/Less files (repeatable: `--input "src/**/*.css" --input "lib/**/*.css"`) |
| `--output` | Output file. `.ts` → TypeScript, `.js` → JavaScript + `.d.ts` alongside |
| `--exclude` | Glob pattern for files to exclude (repeatable: `--exclude "**/a/**" --exclude "**/b/**"`) |
| `--prefix` | Prefix for generated keys: `--prefix theme` → `themeColorPrimary` |
| `--naming` | Key naming — see [Naming conventions](/guide/naming-conventions) |
| `--selector` | Extra CSS selector to scan for variables (repeatable: `--selector ".dark" --selector "[data-theme='dark']"`) |
| `--group` | Nest keys by each variable's first hyphen segment — see [Grouped output](#grouped-output) |
| `--watch` | Watch for file changes and regenerate |
| `--check` | Check whether the output is up to date without writing; exits 1 if it would differ. Useful in CI. Can't be combined with `--watch`. |
| `--version`, `-v` | Print the version number and exit |

CLI flags override values from the config file.

## Config file

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
  naming: 'snake', // 'camelCase' | 'snake' | 'kebab' | 'constant' | 'pascal'
  selectors: ['.dark', '[data-theme="dark"]'],
  group: false,
};
```

## Grouped output

Passing `--group` (or `group: true`) nests keys under an object named after each variable's first hyphen segment, instead of a flat object:

```css
:root {
  --color-primary: #3b82f6;
  --color-secondary: #64748b;
  --spacing-md: 8px;
  --radius: 4px;
}
```

```ts
export const cssVars = {
  color: {
    primary: 'var(--color-primary)',
    secondary: 'var(--color-secondary)',
  },
  spacing: {
    md: 'var(--spacing-md)',
  },
  radius: 'var(--radius)', // no hyphen — stays top-level
} as const;
```

Notes:
- A variable with no hyphen in its name (e.g. `--radius`) has nothing to group by and stays top-level.
- If a standalone variable's key collides with a group (e.g. both `--color` and `--color-primary` exist), the group wins and the standalone entry is dropped.
- `group` can't be combined with `prefix`.
- The `CssVarName` type export is omitted in grouped mode, since `keyof typeof cssVars` would only cover group/top-level names, not individual variables.

## Using --check in CI

`--check` computes the output in memory and compares it against what's already on disk, without writing anything. Add it to CI to catch a `cssVars.ts` that's out of sync with its CSS source (someone forgot to regenerate before committing):

```yaml
# .github/workflows/ci.yml
- run: npx css-typed-vars --check
```

It exits `1` if the file would differ (or doesn't exist yet), and `0` if it's up to date.
