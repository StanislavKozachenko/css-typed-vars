# Usage examples

**React:**

```tsx
import { cssVars } from './cssVars'; // CLI
// or
import { cssVars } from 'css-typed-vars/vars'; // plugin

<div style={{ color: cssVars.colorPrimary, padding: cssVars.spacingMd }} />
```

**styled-components / emotion:**

```ts
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

## Reading and writing at runtime

Enable with `helpers: true` / `--helpers`.

```ts
import { cssVars, getCssVar, setCssVar } from './cssVars';

getCssVar(cssVars.colorPrimary);                 // computed value on <html>, e.g. '#3b82f6'
setCssVar(cssVars.colorPrimary, '#ef4444');      // inline style on <html>
setCssVar(cssVars.spacingMd, '12px', cardEl);    // or on a specific element
```

The helpers take a `cssVars` value (typed as `CssVarRef`, the union of every generated `'var(--name)'`), so they work the same with any `naming`, `prefix` or `group`. `getCssVar`/`setCssVar` use `getComputedStyle`/`style.setProperty`, so call them in the browser only, and the TS output needs the `DOM` lib in your `tsconfig`.

`withFallback` builds a `var()` with a fallback value, typed as the exact resulting string — handy in style objects and CSS-in-JS. Unlike the two above, it's a pure string helper and works anywhere, including on the server:

```ts
import { cssVars, withFallback } from './cssVars';

withFallback(cssVars.colorPrimary, '#3b82f6');      // 'var(--color-primary, #3b82f6)'
withFallback(cssVars.spacingMd, 0);                 // 'var(--spacing-md, 0)'
withFallback(cssVars.colorLink, cssVars.colorPrimary); // 'var(--color-link, var(--color-primary))'
```
