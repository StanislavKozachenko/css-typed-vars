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

## Lower-level exports

```ts
import {
  parseVarNames,         // (css: string, selectors?: string[]) => string[]
  parseVarDeclarations,  // (css: string, selectors?: string[]) => Map<string, string>
  scanVarNames,          // (patterns, exclude?, selectors?) => Promise<string[]>
  scanVarDeclarations,   // (patterns, exclude?, selectors?) => Promise<Map<string, string>>
  generateCode,          // (varNames, prefix?, naming?, declarations?) => string
  generateJs,
  generateDeclaration,
} from 'css-typed-vars';
```

`parseVarDeclarations`/`scanVarDeclarations` return a `Map` from CSS variable name to its declared value — the same data `generate()` uses internally to emit the `@default` JSDoc comments. Useful if you want to build your own tooling on top of the scan.
