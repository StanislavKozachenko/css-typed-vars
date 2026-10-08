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
