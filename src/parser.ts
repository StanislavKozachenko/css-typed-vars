function stripComments(text: string): string {
  let result = '';
  let quote: string | null = null;
  let urlDepth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quote) {
      result += char;
      if (char === '\\' && i + 1 < text.length) {
        result += text[++i];
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      result += char;
      continue;
    }

    if (urlDepth > 0) {
      if (char === '(') urlDepth++;
      else if (char === ')') urlDepth--;
      result += char;
      continue;
    }

    if (char === '(' && result.slice(-3).toLowerCase() === 'url') {
      urlDepth = 1;
      result += char;
      continue;
    }

    if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) {
        result += char;
        continue;
      }
      i = end + 1;
      continue;
    }

    if (char === '/' && text[i + 1] === '/' && text[i - 1] !== ':') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? text.length - 1 : nl - 1;
      continue;
    }

    result += char;
  }
  return result;
}

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
  const stripped = stripComments(css);
  const names = new Set<string>();
  const allSelectors = [':root', ...(selectors ?? [])];
  for (const sel of allSelectors) {
    const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const openRegex = new RegExp(`${escaped}(?![\\w-])[^{]*\\{`, 'g');
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
