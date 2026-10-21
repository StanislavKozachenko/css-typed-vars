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

The helpers take a `cssVars` value (typed as `CssVarRef`, the union of every generated `'var(--name)'`), so they work the same with any `naming`, `prefix` or `group`. They use `getComputedStyle`/`style.setProperty`, so call them in the browser only, and the TS output needs the `DOM` lib in your `tsconfig`.
