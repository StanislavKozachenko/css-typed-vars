export function parseVarNames(css: string): string[] {
  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const names = new Set<string>();
  const rootRegex = /:root[^{]*\{([^}]*)}/g;
  for (const match of stripped.matchAll(rootRegex)) {
    for (const prop of match[1].matchAll(/--[\w-]+(?=\s*:)/g)) {
      names.add(prop[0]);
    }
  }
  return [...names];
}
