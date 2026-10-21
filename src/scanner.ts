import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import { parseThemedDeclarations, parsePropertyRules, type PropertyRule } from './parser.js';

function normalizePatterns(patterns: string | string[]): string[] {
  return (Array.isArray(patterns) ? patterns : [patterns]).map((p) => p.replace(/\\/g, '/'));
}

export interface ScannedCss {
  declarations: Map<string, string>;
  properties: Map<string, PropertyRule>;
  /** Per theme name (from the `themes` option), the values declared for it. Empty without `themes`. */
  themes: Map<string, Map<string, string>>;
}

// Every var name found, sorted — base declarations plus any declared only
// inside a theme block.
export function collectVarNames(scanned: ScannedCss): string[] {
  const names = new Set(scanned.declarations.keys());
  for (const values of scanned.themes.values()) {
    for (const name of values.keys()) names.add(name);
  }
  return [...names].sort();
}

// Reads are run concurrently for speed, but merged sequentially in fast-glob's
// (deterministic) file order, so a name declared in multiple files always
// resolves to the same "last file wins" value regardless of I/O timing. Each
// matched file is read exactly once and parsed for both declarations and
// @property rules, so callers needing both never double up on file I/O.
export async function scanCss(
  patterns: string | string[],
  exclude?: string | string[],
  selectors?: string[],
  themes: Record<string, string> = {},
): Promise<ScannedCss> {
  const normalized = normalizePatterns(patterns);
  const normalizedExclude = exclude ? normalizePatterns(exclude) : [];
  const files = await fg(normalized, { absolute: true, ignore: normalizedExclude });
  const perFile = await Promise.all(
    files.map(async (file) => {
      let css: string;
      try {
        css = await readFile(file, 'utf8');
      } catch (err) {
        console.warn(`css-typed-vars: skipping "${file}": ${(err as Error).message}`);
        return null;
      }
      return { ...parseThemedDeclarations(css, selectors, themes), properties: parsePropertyRules(css) };
    }),
  );
  const declarations = new Map<string, string>();
  const properties = new Map<string, PropertyRule>();
  const themeValues = new Map(Object.keys(themes).map((theme) => [theme, new Map<string, string>()]));
  for (const result of perFile) {
    if (!result) continue;
    for (const [name, value] of result.declarations) declarations.set(name, value);
    for (const [name, rule] of result.properties) properties.set(name, rule);
    for (const [theme, values] of result.themes) {
      for (const [name, value] of values) themeValues.get(theme)!.set(name, value);
    }
  }
  return { declarations, properties, themes: themeValues };
}

export async function scanVarDeclarations(
  patterns: string | string[],
  exclude?: string | string[],
  selectors?: string[],
): Promise<Map<string, string>> {
  return (await scanCss(patterns, exclude, selectors)).declarations;
}

export async function scanVarNames(
  patterns: string | string[],
  exclude?: string | string[],
  selectors?: string[],
): Promise<string[]> {
  const declarations = await scanVarDeclarations(patterns, exclude, selectors);
  return [...declarations.keys()].sort();
}

// Matches `cssVars.foo` (dot access) and `cssVars['foo']`/`cssVars["foo"]` (bracket
// access) in source text. Textual, not AST-based — like the rest of this scanner —
// so it can't see through a renamed import (`import { cssVars as vars } ...`) and
// doesn't distinguish a real reference from one inside a comment or string.
const ROOT_RE = /\bcssVars\b/g;
const ACCESS_RE = /\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*(['"`])((?:(?!\2).)*)\2\s*\])/y;

function readAccess(text: string, from: number): { key: string; end: number } | null {
  ACCESS_RE.lastIndex = from;
  const match = ACCESS_RE.exec(text);
  return match ? { key: match[1] ?? match[3], end: ACCESS_RE.lastIndex } : null;
}

export interface CssVarsUsage {
  /** Every first-level key accessed (`cssVars.<key>`), with or without further access. */
  keys: Set<string>;
  /** First-level keys referenced as a whole, with no second-level access after them. */
  wholeKeys: Set<string>;
  /** Second-level accesses (`cssVars.<key>.<leaf>`), as `[key, leaf]` joined with `\0`. */
  paths: Set<string>;
}

function extractUsage(text: string, into: CssVarsUsage): void {
  for (const root of text.matchAll(ROOT_RE)) {
    const first = readAccess(text, root.index + root[0].length);
    if (!first) continue;
    into.keys.add(first.key);
    const second = readAccess(text, first.end);
    if (second) into.paths.add(`${first.key}\0${second.key}`);
    else into.wholeKeys.add(first.key);
  }
}

// Scans source files (not CSS) for references to the generated `cssVars` object,
// one and two levels deep (the latter for grouped output). Backs the
// `prune`/`pruneCheck` unused-variable features.
export async function scanUsage(patterns: string | string[], exclude?: string | string[]): Promise<CssVarsUsage> {
  const normalized = normalizePatterns(patterns);
  const normalizedExclude = exclude ? normalizePatterns(exclude) : [];
  const files = await fg(normalized, { absolute: true, ignore: normalizedExclude });
  const usage: CssVarsUsage = { keys: new Set(), wholeKeys: new Set(), paths: new Set() };
  const texts = await Promise.all(
    files.map(async (file) => {
      try {
        return await readFile(file, 'utf8');
      } catch (err) {
        console.warn(`css-typed-vars: skipping "${file}": ${(err as Error).message}`);
        return '';
      }
    }),
  );
  for (const text of texts) extractUsage(text, usage);
  return usage;
}

// The set of first-level keys found to be in use.
export async function scanUsedKeys(patterns: string | string[], exclude?: string | string[]): Promise<Set<string>> {
  return (await scanUsage(patterns, exclude)).keys;
}
