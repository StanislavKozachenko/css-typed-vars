function extractBlock(text: string, start: number): string {
  let depth = 1;
  let quote: string | null = null;
  let i = start;
  for (; i < text.length && depth > 0; i++) {
    const char = text[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
    }
  }
  return text.slice(start, depth === 0 ? i - 1 : i);
}

export function parseVarNames(css: string, selectors?: string[]): string[] {
  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?<!:)\/\/.*$/gm, '');
  const names = new Set<string>();
  const allSelectors = [':root', ...(selectors ?? [])];
  for (const sel of allSelectors) {
    const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const openRegex = new RegExp(`${escaped}[^{]*\\{`, 'g');
    let match: RegExpExecArray | null;
    while ((match = openRegex.exec(stripped))) {
      const start = match.index + match[0].length;
      const block = extractBlock(stripped, start);
      for (const prop of block.matchAll(/--[\w-]+(?=\s*:)/g)) {
        names.add(prop[0]);
      }
      openRegex.lastIndex = start + block.length + 1;
    }
  }
  return [...names];
}
