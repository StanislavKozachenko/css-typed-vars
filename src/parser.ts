interface QuoteStep {
  consumed: number;
  closed: boolean;
}

// Decides how many characters the current position consumes while inside a
// quoted string, and whether that consumption closes the quote. Shared by
// stripComments and maskQuotedContent, which each decide separately what to
// do with the consumed characters (keep verbatim vs. mask).
function stepQuote(text: string, i: number, quote: string): QuoteStep {
  const char = text[i];
  if (char === '\\' && i + 1 < text.length) return { consumed: 2, closed: false };
  if (char === quote) return { consumed: 1, closed: true };
  return { consumed: 1, closed: false };
}

function stripComments(text: string): string {
  let result = '';
  let quote: string | null = null;
  let urlDepth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quote) {
      const step = stepQuote(text, i, quote);
      result += text.slice(i, i + step.consumed);
      if (step.closed) quote = null;
      i += step.consumed - 1;
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

function maskQuotedContent(text: string): string {
  let result = '';
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      const step = stepQuote(text, i, quote);
      if (step.closed) {
        result += char;
        quote = null;
      } else {
        result += ' '.repeat(step.consumed);
      }
      i += step.consumed - 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    }
    result += char;
  }
  return result;
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
      for (const prop of maskQuotedContent(block).matchAll(/--[\w-]+(?=\s*:)/g)) {
        names.add(prop[0]);
      }
      openRegex.lastIndex = start + block.length + 1;
    }
  }
  return [...names];
}
