# Supported formats

| Format | Extension |
|--------|-----------|
| CSS | `.css` |
| SCSS | `.scss` |
| Less | `.less` |

By default, variables are scanned from `:root {}` blocks (including attribute selectors like `:root[data-theme="dark"]`) and Tailwind CSS v4's `@theme {}` blocks. Use the `selectors` option to also pick up variables from other selectors such as `.dark` or `[data-theme="dark"]` — see [Naming conventions](/guide/naming-conventions) and the [CLI](/guide/cli)/[Plugin](/guide/plugin) option tables for how to pass it.

## @property syntax typing

If a variable is registered via the [CSS Properties and Values API](https://developer.mozilla.org/en-US/docs/Web/CSS/@property), its `syntax` descriptor is picked up automatically — no config needed:

```css
@property --theme-mode {
  syntax: "light | dark | system";
  inherits: true;
  initial-value: light;
}
:root {
  --theme-mode: light;
}
```

```ts
export const cssVars = {
  /** @default light */
  /** @syntax light | dark | system */
  themeMode: 'var(--theme-mode)',
} as const;

export type CssVarName = keyof typeof cssVars;

export type ThemeModeSyntax = 'light' | 'dark' | 'system';
```

Every `syntax` shows up as a `@syntax` JSDoc comment. When it's a pipe-separated list of custom idents (an enum, like above) — as opposed to a generic data type like `<color>` or `<length>` — it also gets its own exported union type, named `<PascalCaseVarName>Syntax`. Useful when setting the property from JS: `el.style.setProperty('--theme-mode', mode satisfies ThemeModeSyntax)`.

Note this doesn't change the type of `cssVars.themeMode` itself — that's always the literal string `'var(--theme-mode)'`, regardless of `@property`, since that's what you actually get at runtime. The union type is a separate, additional export for validating what you *assign* to the variable.
