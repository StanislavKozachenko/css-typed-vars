export function parseVarNames(css: string, selectors?: string[]): string[] {
  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const names = new Set<string>();
  const allSelectors = [':root', ...(selectors ?? [])];
  for (const sel of allSelectors) {
    const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escaped}[^{]*\\{([^}]*)\\}`, 'g');
    for (const match of stripped.matchAll(regex)) {
      for (const prop of match[1].matchAll(/--[\w-]+(?=\s*:)/g)) {
        names.add(prop[0]);
      }
    }
  }
  return [...names];
}
