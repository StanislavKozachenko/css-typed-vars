import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import { parseVarDeclarations, parsePropertyRules, type PropertyRule } from './parser.js';

function normalizePatterns(patterns: string | string[]): string[] {
  return (Array.isArray(patterns) ? patterns : [patterns]).map((p) => p.replace(/\\/g, '/'));
}

export interface ScannedCss {
  declarations: Map<string, string>;
  properties: Map<string, PropertyRule>;
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
        return { declarations: new Map<string, string>(), properties: new Map<string, PropertyRule>() };
      }
      return { declarations: parseVarDeclarations(css, selectors), properties: parsePropertyRules(css) };
    }),
  );
  const declarations = new Map<string, string>();
  const properties = new Map<string, PropertyRule>();
  for (const result of perFile) {
    for (const [name, value] of result.declarations) declarations.set(name, value);
    for (const [name, rule] of result.properties) properties.set(name, rule);
  }
  return { declarations, properties };
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
const USAGE_RE = /\bcssVars\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*(['"`])((?:(?!\2).)*)\2\s*\])/g;

function extractUsedKeys(text: string, into: Set<string>): void {
  for (const match of text.matchAll(USAGE_RE)) {
    into.add(match[1] ?? match[3]);
  }
}

// Scans source files (not CSS) for references to the generated `cssVars` object,
// returning the set of keys found to be in use. Backs the `prune`/`pruneCheck`
// unused-variable features.
export async function scanUsedKeys(patterns: string | string[], exclude?: string | string[]): Promise<Set<string>> {
  const normalized = normalizePatterns(patterns);
  const normalizedExclude = exclude ? normalizePatterns(exclude) : [];
  const files = await fg(normalized, { absolute: true, ignore: normalizedExclude });
  const perFile = await Promise.all(
    files.map(async (file) => {
      const used = new Set<string>();
      let text: string;
      try {
        text = await readFile(file, 'utf8');
      } catch (err) {
        console.warn(`css-typed-vars: skipping "${file}": ${(err as Error).message}`);
        return used;
      }
      extractUsedKeys(text, used);
      return used;
    }),
  );
  const all = new Set<string>();
  for (const used of perFile) {
    for (const key of used) all.add(key);
  }
  return all;
}
