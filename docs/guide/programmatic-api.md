# Programmatic API

```ts
import { generate } from 'css-typed-vars';

await generate({
  input: 'src/styles/**/*.{css,scss}',
  output: 'src/cssVars.ts',  // or 'src/cssVars.js' → generates .js + .d.ts
  exclude: ['**/vendor/**'],
  prefix: 'theme',
  naming: 'snake',           // 'camelCase' | 'snake' | 'kebab' | 'constant' | 'pascal'
  selectors: ['.dark', '[data-theme="dark"]'],
  group: false,              // nest keys by first hyphen segment, e.g. cssVars.color.primary — see CLI docs
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

`findUnusedVars(options)` takes `input`/`exclude`/`selectors`/`prefix`/`naming`/`usage`/`usageExclude` and returns `Promise<string[]>` — the CSS variable names with no detected `cssVars.<key>` usage, without writing or pruning anything. This is what `--prune-check` does on the CLI — see [Pruning unused variables](/guide/cli#pruning-unused-variables) for how the usage scan works and its limitations.

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
  scanVarNames,          // (patterns, exclude?, selectors?) => Promise<string[]>
  scanVarDeclarations,   // (patterns, exclude?, selectors?) => Promise<Map<string, string>>
  scanCss,               // (patterns, exclude?, selectors?) => Promise<{ declarations, properties }>
  scanUsedKeys,          // (patterns, exclude?) => Promise<Set<string>>
  generateCode,          // (varNames, prefix?, naming?, declarations?, group?, properties?) => string
  generateJs,
  generateDeclaration,
} from 'css-typed-vars';
```

`parseVarDeclarations`/`scanVarDeclarations` return a `Map` from CSS variable name to its declared value — the same data `generate()` uses internally to emit the `@default` JSDoc comments. Useful if you want to build your own tooling on top of the scan.

`parsePropertyRules`/`scanCss` return `@property` rule data (`{ syntax?, inherits?, initialValue? }` per variable) — the same data `generate()` uses to emit `@syntax` comments and enum union types. `scanCss` reads each matched file once and returns both declarations and property rules together, so you don't pay for the file scan twice if you need both.
