# Programmatic API

```ts
import { generate } from 'css-typed-vars';

await generate({
  input: 'src/styles/**/*.{css,scss}',
  output: 'src/cssVars.ts',  // or 'src/cssVars.js' → .js + .d.ts, or 'tokens.json' → design tokens
  exclude: ['**/vendor/**'],
  prefix: 'theme',
  naming: 'snake',           // 'camelCase' | 'snake' | 'kebab' | 'constant' | 'pascal'
  selectors: ['.dark', '[data-theme="dark"]'],
  themes: { dark: '[data-theme="dark"]' }, // per-theme values as @theme JSDoc tags — see Supported formats
  group: false,              // nest keys by first hyphen segment, e.g. cssVars.color.primary — see CLI docs
  helpers: false,            // also emit getCssVar/setCssVar runtime helpers
  prune: false,              // drop vars with no detected cssVars.<key> usage — see CLI docs
  usage: 'src/**/*.{ts,tsx}',
});
```

## checkGenerated

`checkGenerated(options)` takes the same options and returns `Promise<boolean>` — `true` if the existing output already matches what would be generated, without writing anything. This is what `--check` does on the CLI.

```ts
import { checkGenerated } from 'css-typed-vars';

const upToDate = await checkGenerated({
  input: 'src/styles/**/*.{css,scss}',
  output: 'src/cssVars.ts',
});

if (!upToDate) {
  throw new Error('cssVars.ts is out of date — run the generator.');
}
```

## findUnusedVars

`findUnusedVars(options)` takes `input`/`exclude`/`selectors`/`prefix`/`naming`/`group`/`usage`/`usageExclude` and returns `Promise<string[]>` — the CSS variable names with no detected `cssVars.<key>` usage, without writing or pruning anything. This is what `--prune-check` does on the CLI — see [Pruning unused variables](/guide/cli#pruning-unused-variables) for how the usage scan works and its limitations.

```ts
import { findUnusedVars } from 'css-typed-vars';

const unused = await findUnusedVars({
  input: 'src/styles/**/*.{css,scss}',
  usage: 'src/**/*.{ts,tsx}',
});

if (unused.length > 0) {
  throw new Error(`Unused CSS variables: ${unused.join(', ')}`);
}
```

## Lower-level exports

```ts
import {
  parseVarNames,         // (css: string, selectors?: string[]) => string[]
  parseVarDeclarations,  // (css: string, selectors?: string[]) => Map<string, string>
  parsePropertyRules,    // (css: string) => Map<string, PropertyRule>
  parseThemedDeclarations, // (css, selectors, themes) => { declarations, themes }
  scanVarNames,          // (patterns, exclude?, selectors?) => Promise<string[]>
  scanVarDeclarations,   // (patterns, exclude?, selectors?) => Promise<Map<string, string>>
  scanCss,               // (patterns, exclude?, selectors?, themes?) => Promise<{ declarations, properties, themes }>
  scanUsedKeys,          // (patterns, exclude?) => Promise<Set<string>>
  generateCode,          // (varNames, options?: GeneratorOptions) => string
  generateJs,
  generateDeclaration,
  generateTokens,        // (varNames, options?) => string — DTCG JSON, see Design tokens
} from 'css-typed-vars';
```

`generateCode`/`generateJs`/`generateDeclaration` take an options object as the second argument — `{ prefix?, naming?, declarations?, group?, properties?, helpers?, themes? }` (exported as the `GeneratorOptions` type):

```ts
const { declarations, properties } = await scanCss('src/**/*.css');
const code = generateCode([...declarations.keys()].sort(), { naming: 'snake', declarations, properties });
```

The older positional form `generateCode(varNames, prefix?, naming?, declarations?, group?, properties?)` still works, but is deprecated.

`parseVarDeclarations`/`scanVarDeclarations` return a `Map` from CSS variable name to its declared value — the same data `generate()` uses internally to emit the `@default` JSDoc comments. Useful if you want to build your own tooling on top of the scan.

`parsePropertyRules`/`scanCss` return `@property` rule data (`{ syntax?, inherits?, initialValue? }` per variable) — the same data `generate()` uses to emit `@syntax` comments and enum union types. `scanCss` reads each matched file once and returns both declarations and property rules together, so you don't pay for the file scan twice if you need both.
