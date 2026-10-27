type Range = [start: number, end: number];

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

interface StrippedCss {
  text: string;
  /** Removed spans, by the stripped position they were removed at, in order. */
  removed: Array<{ at: number; length: number }>;
  /** \`[start, end)\` of every block comment in the original text. */
  comments: Range[];
}

function stripComments(text: string): string {
  return stripCommentsWithMap(text).text;
}

function stripCommentsWithMap(text: string): StrippedCss {
  const removed: StrippedCss['removed'] = [];
  const comments: Range[] = [];
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
      comments.push([i, end + 2]);
      removed.push({ at: result.length, length: end + 2 - i });
      i = end + 1;
      continue;
    }

    if (char === '/' && text[i + 1] === '/' && text[i - 1] !== ':') {
      const nl = text.indexOf('\n', i);
      removed.push({ at: result.length, length: (nl === -1 ? text.length : nl) - i });
      i = nl === -1 ? text.length - 1 : nl - 1;
      continue;
    }

    result += char;
  }
  return { text: result, removed, comments };
}

function extractBlock(text: string, start: number): string {
  let depth = 1;
  let quote: string | null = null;
  let i = start;
  for (; i < text.length && depth > 0; i++) {
    const char = text[i];
    if (quote) {
      const step = stepQuote(text, i, quote);
      if (step.closed) quote = null;
      i += step.consumed - 1;
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

// Scans a property's declared value starting right after its colon, honoring
// quoted content (a `;` or `}` inside a quoted value doesn't end the value).
function extractValue(text: string, start: number): string {
  let i = start;
  let quote: string | null = null;
  for (; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      const step = stepQuote(text, i, quote);
      if (step.closed) quote = null;
      i += step.consumed - 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ';' || char === '}') break;
  }
  return text.slice(start, i).trim();
}

type OnProperty = (name: string, value: string, position: number) => void;

// Calls onProperty for each custom-property declaration in block, with its
// position in the enclosing text (\`offset\` is where the block starts).
function forEachProperty(block: string, onProperty: OnProperty, offset = 0): void {
  const masked = maskQuotedContent(block);
  for (const prop of masked.matchAll(/--[\w-]+(?=\s*:)/g)) {
    const name = prop[0];
    const colonIndex = block.indexOf(':', prop.index + name.length);
    onProperty(name, extractValue(block, colonIndex + 1), offset + prop.index);
  }
}

// Walks every block opened by one of `selectors` in already comment-stripped
// css, calling onBlock with the block's body and its [start, end) range
// (from just after the opening brace to just after the closing one).
function forEachSelectorBlock(
  stripped: string,
  selectors: string[],
  onBlock: (block: string, range: Range) => void,
): void {
  for (const sel of selectors) {
    const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const openRegex = new RegExp(`${escaped}(?![\\w-])[^{]*\\{`, 'g');
    let match: RegExpExecArray | null;
    while ((match = openRegex.exec(stripped))) {
      const start = match.index + match[0].length;
      const block = extractBlock(stripped, start);
      const end = start + block.length + 1;
      onBlock(block, [start, end]);
      openRegex.lastIndex = end;
    }
  }
}

// '@theme' covers Tailwind CSS v4's design-token block, which declares
// custom properties outside :root (e.g. `@theme { --color-primary: ... }`).
const BASE_SELECTORS = [':root', '@theme'];

// Walks every `:root`/custom-selector block in css, calling onProperty for
// each custom-property declaration found. Shared by parseVarNames (which
// only needs the name) and parseVarDeclarations (which also needs the value).
// Blocks whose body starts inside one of `skip` (theme blocks) are left out —
// comparing body positions, a theme match like `[data-theme="dark"]` and the
// base `:root` match on `:root[data-theme="dark"] {` resolve to the same block.
function scanDeclarations(
  css: string,
  selectors: string[] | undefined,
  onProperty: OnProperty,
  skip: Range[] = [],
  stripped = stripComments(css),
): void {
  forEachSelectorBlock(stripped, [...BASE_SELECTORS, ...(selectors ?? [])], (block, [bodyStart]) => {
    if (skip.some(([s, e]) => bodyStart >= s && bodyStart < e)) return;
    forEachProperty(block, onProperty, bodyStart);
  });
}

export function parseVarNames(css: string, selectors?: string[]): string[] {
  const names = new Set<string>();
  scanDeclarations(css, selectors, (name) => names.add(name));
  return [...names];
}

// Last declaration for a given name wins, matching the project's existing
// "last one wins" convention for naming collisions.
export function parseVarDeclarations(css: string, selectors?: string[]): Map<string, string> {
  const declarations = new Map<string, string>();
  scanDeclarations(css, selectors, (name, value) => declarations.set(name, value));
  return declarations;
}

const normalizePrelude = (prelude: string) => prelude.replace(/\s+/g, '').toLowerCase();

// Walks every `@media <prelude> { ... }` block whose prelude matches `media`
// (ignoring whitespace and case), calling onBlock with its body and range.
function forEachMediaBlock(stripped: string, media: string, onBlock: (block: string, range: Range) => void): void {
  const wanted = normalizePrelude(media.replace(/^@media/i, ''));
  const openRegex = /@media([^{;]*)\{/gi;
  let match: RegExpExecArray | null;
  while ((match = openRegex.exec(stripped))) {
    const start = match.index + match[0].length;
    const block = extractBlock(stripped, start);
    const end = start + block.length + 1;
    if (normalizePrelude(match[1]) === wanted) {
      onBlock(block, [start, end]);
      openRegex.lastIndex = end;
    } else {
      // Not this theme's media block: keep searching inside it.
      openRegex.lastIndex = start;
    }
  }
}

export interface VarDoc {
  /** Free text of the comment, before any tag. */
  description?: string;
  /** `true` for a bare `@deprecated`, or its reason text. */
  deprecated?: string | true;
}

// Parses the body of a `/** ... */` comment: leading `*` gutters are dropped,
// text before the first tag becomes the description, and `@deprecated [reason]`
// is picked up. Other tags are ignored.
function parseDocComment(body: string): VarDoc | undefined {
  const lines = body.split('\n').map((line) => line.replace(/^\s*\*?\s?/, '').trimEnd());
  const doc: VarDoc = {};
  const description: string[] = [];
  let inTags = false;
  for (const line of lines) {
    const tag = /^@(\w+)\s*(.*)$/.exec(line.trim());
    if (tag) {
      inTags = true;
      if (tag[1] === 'deprecated') doc.deprecated = tag[2].trim() || true;
    } else if (!inTags) {
      description.push(line);
    }
  }
  const text = description.join('\n').trim();
  if (text) doc.description = text;
  return doc.description !== undefined || doc.deprecated !== undefined ? doc : undefined;
}

// Returns a lookup from a position in the comment-stripped text to the
// `/** ... */` doc comment directly before it in the original css (only
// whitespace in between), if any.
function makeDocReader(css: string, stripped: StrippedCss): (strippedPos: number) => VarDoc | undefined {
  const commentStartByEnd = new Map(stripped.comments.map(([start, end]) => [end, start]));
  return (strippedPos) => {
    let rawPos = strippedPos;
    for (const { at, length } of stripped.removed) {
      if (at > strippedPos) break;
      rawPos += length;
    }
    let end = rawPos;
    while (end > 0 && /\s/.test(css[end - 1])) end--;
    const start = commentStartByEnd.get(end);
    if (start === undefined || !css.startsWith('/**', start) || end - start <= 4) return undefined;
    return parseDocComment(css.slice(start + 3, end - 2));
  };
}

export interface ThemedDeclarations {
  /** Base values, from `:root`/`@theme`/`selectors` blocks outside any theme block. */
  declarations: Map<string, string>;
  /** Per theme name, the values declared inside that theme's blocks. */
  themes: Map<string, Map<string, string>>;
  /** `/** ... *\/` doc comments placed directly before a declaration — from a base block, else from a theme block. */
  docs: Map<string, VarDoc>;
}

// Like parseVarDeclarations, but also collects values per theme. A theme is a
// selector (`[data-theme="dark"]`, `.dark`) or an `@media` prelude
// (`@media (prefers-color-scheme: dark)`, whose `:root`/`@theme` blocks are
// read). Theme blocks are excluded from the base values, so a theme can't
// overwrite the default value. Last declaration wins, per theme.
export function parseThemedDeclarations(
  css: string,
  selectors: string[] | undefined,
  themes: Record<string, string>,
): ThemedDeclarations {
  const strippedCss = stripCommentsWithMap(css);
  const stripped = strippedCss.text;
  const docAt = makeDocReader(css, strippedCss);
  const themeDocs = new Map<string, VarDoc>();
  const themeValues = new Map<string, Map<string, string>>();
  const skip: Range[] = [];
  for (const [themeName, themeSelector] of Object.entries(themes)) {
    const values = new Map<string, string>();
    themeValues.set(themeName, values);
    const collect = (block: string, offset: number) =>
      forEachProperty(block, (name, value, position) => {
        values.set(name, value);
        const doc = docAt(position);
        if (doc) themeDocs.set(name, doc);
      }, offset);
    const selector = themeSelector.trim();
    if (/^@media\b/i.test(selector)) {
      forEachMediaBlock(stripped, selector, (mediaBlock, range) => {
        skip.push(range);
        forEachSelectorBlock(mediaBlock, BASE_SELECTORS, (block, [innerStart]) => collect(block, range[0] + innerStart));
      });
    } else {
      forEachSelectorBlock(stripped, [selector], (block, range) => {
        skip.push(range);
        collect(block, range[0]);
      });
    }
  }
  const declarations = new Map<string, string>();
  const docs = new Map<string, VarDoc>();
  scanDeclarations(css, selectors, (name, value, position) => {
    declarations.set(name, value);
    const doc = docAt(position);
    if (doc) docs.set(name, doc);
  }, skip, stripped);
  for (const [name, doc] of themeDocs) {
    if (!docs.has(name)) docs.set(name, doc);
  }
  return { declarations, themes: themeValues, docs };
}

export interface PropertyRule {
  syntax?: string;
  inherits?: string;
  initialValue?: string;
}

const PROPERTY_DESCRIPTORS = [
  ['syntax', 'syntax'],
  ['inherits', 'inherits'],
  ['initial-value', 'initialValue'],
] as const;

// Parses `@property --name { syntax: '...'; inherits: ...; initial-value: ...; }`
// rules, as registered via the CSS Properties and Values API. Last rule for a
// given name wins, matching parseVarDeclarations' convention.
export function parsePropertyRules(css: string): Map<string, PropertyRule> {
  const stripped = stripComments(css);
  const rules = new Map<string, PropertyRule>();
  const openRegex = /@property\s+(--[\w-]+)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = openRegex.exec(stripped))) {
    const name = match[1];
    const start = match.index + match[0].length;
    const block = extractBlock(stripped, start);
    const masked = maskQuotedContent(block);
    const rule: PropertyRule = {};
    for (const [descriptor, key] of PROPERTY_DESCRIPTORS) {
      const descRegex = new RegExp(`(?:^|[;{\\s])${descriptor}(?=\\s*:)`);
      const descMatch = descRegex.exec(masked);
      if (!descMatch) continue;
      const nameEnd = descMatch.index + descMatch[0].length;
      const colonIndex = block.indexOf(':', nameEnd);
      rule[key] = extractValue(block, colonIndex + 1);
    }
    if (Object.keys(rule).length > 0) rules.set(name, rule);
    openRegex.lastIndex = start + block.length + 1;
  }
  return rules;
}
