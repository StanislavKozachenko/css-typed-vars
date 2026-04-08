export function parseVarNames(css: string): string[] {
  const names = new Set<string>();
  const rootRegex = /:root\s*\{([^}]*)}/g;
  for (const match of css.matchAll(rootRegex)) {
    for (const prop of match[1].matchAll(/--[\w-]+(?=\s*:)/g)) {
      names.add(prop[0]);
    }
  }
  return [...names];
}
