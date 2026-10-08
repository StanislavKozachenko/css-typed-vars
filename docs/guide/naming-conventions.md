# Naming conventions

Pass `naming` (CLI: `--naming`) to control how a CSS custom property name becomes a generated key. The default is `camelCase`.

Given `--color-primary` and, with a prefix, `--prefix theme`:

| `naming` | Key | With `prefix: 'theme'` |
|----------|-----|-------------------------|
| `camelCase` (default) | `colorPrimary` | `themeColorPrimary` |
| `snake` | `color_primary` | `theme_color_primary` |
| `kebab` | `'color-primary'` (quoted) | `'theme-color-primary'` |
| `constant` | `COLOR_PRIMARY` | `THEME_COLOR_PRIMARY` |
| `pascal` | `ColorPrimary` | `ThemeColorPrimary` |

## Edge cases handled automatically

- **Digit-leading names** get an underscore prefix so the key stays a valid identifier: `--1st-breakpoint` → `_1stBreakpoint` (camelCase), `_1ST_BREAKPOINT` (constant). `kebab` doesn't need this — its keys are quoted strings, not bare identifiers.
- **Consecutive dashes** collapse to a single boundary: `--my--var` and `--my-var` both become `myVar` (and are flagged via the key-collision warning, since only the last one is kept).
- **A prefix with characters invalid in the target naming** gets sanitized — stripped for camelCase/snake/constant/pascal (bare identifiers), escaped for kebab (since its keys are embedded in a quoted string literal).

## Which one should I use?

- `camelCase` if you're consuming the constants from JS/TS object property access (`cssVars.colorPrimary`) — the common case.
- `constant` if you want the generated file to read like traditional constant declarations, or to visually distinguish generated keys from other object properties in your codebase.
- `kebab` if you want the generated key to match the CSS custom property name as closely as possible (useful if you're generating a lookup object you'll index with a dynamic string).
- `pascal` or `snake` to match an existing naming convention already used elsewhere in your codebase.
