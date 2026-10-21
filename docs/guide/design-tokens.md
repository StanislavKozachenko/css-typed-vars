# Design tokens

Point `output` at a `.json` file to get your CSS variables as a [W3C Design Tokens (DTCG)](https://www.designtokens.org/tr/drafts/format/) document instead of TypeScript, ready for Style Dictionary, Tokens Studio or anything else that reads the format:

```sh
npx css-typed-vars --input "src/**/*.css" --output tokens/tokens.json --group
```

```css
@property --color-primary {
  syntax: "<color>";
  inherits: true;
  initial-value: #3b82f6;
}
:root {
  --color-primary: #3b82f6;
  --color-link: var(--color-primary);
  --spacing-md: 8px;
}
[data-theme="dark"] {
  --color-primary: #60a5fa;
}
```

With `themes: { dark: '[data-theme="dark"]' }`, this produces:

```json
{
  "color": {
    "link": {
      "$value": "{color.primary}"
    },
    "primary": {
      "$value": "#3b82f6",
      "$type": "color",
      "$extensions": {
        "css-typed-vars": {
          "themes": {
            "dark": "#60a5fa"
          }
        }
      }
    }
  },
  "spacing": {
    "md": {
      "$value": "8px"
    }
  }
}
```

## How tokens are built

- **Keys** follow the same rules as the generated object: `naming`, `prefix`, and `group` (nested groups) all apply.
- **`$value`** is the variable's declared value, falling back to its `@property` `initial-value`. A variable declared only inside a theme has no default, so it's left out.
- **`$type`** is inferred from the `@property` syntax where DTCG has a direct counterpart: `<color>` → `color`, `<length>`/`<length-percentage>` → `dimension`, `<number>`/`<integer>` → `number`, `<time>` → `duration`. Otherwise it's omitted.
- **Aliases**: a value that's exactly `var(--other)` becomes `{path.to.other}` when `--other` is a token in the same file. Any other value, including `var()` references to variables outside the file, is kept as the raw CSS string.
- **Themes**: values from the [`themes`](/guide/supported-formats#theme-values) option go under `$extensions["css-typed-vars"].themes`, with the same alias handling.

Values are written as they appear in CSS. DTCG's structured value formats (e.g. color objects) aren't produced, so `$value` stays a string like `#3b82f6` or `8px`, which most tools accept.

## With the plugin

The plugin can write the tokens file alongside its type declarations on every build (and on CSS changes in Vite dev):

```ts
cssTypedVars({
  input: 'src/**/*.css',
  tokens: 'tokens/tokens.json',
});
```

## Programmatic

```ts
import { scanCss, generateTokens } from 'css-typed-vars';

const { declarations, properties } = await scanCss('src/**/*.css');
const json = generateTokens([...declarations.keys()].sort(), { declarations, properties, group: true });
```

`--check` and `checkGenerated` work with a `.json` output too.
