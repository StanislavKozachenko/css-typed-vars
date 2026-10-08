import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import { parseVarDeclarations } from './parser.js';

function normalizePatterns(patterns: string | string[]): string[] {
  return (Array.isArray(patterns) ? patterns : [patterns]).map((p) => p.replace(/\\/g, '/'));
}

// Reads are run concurrently for speed, but merged sequentially in fast-glob's
// (deterministic) file order, so a name declared in multiple files always
// resolves to the same "last file wins" value regardless of I/O timing.
export async function scanVarDeclarations(
  patterns: string | string[],
  exclude?: string | string[],
  selectors?: string[],
): Promise<Map<string, string>> {
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
        return new Map<string, string>();
      }
      return parseVarDeclarations(css, selectors);
    }),
  );
  const all = new Map<string, string>();
  for (const declarations of perFile) {
    for (const [name, value] of declarations) {
      all.set(name, value);
    }
  }
  return all;
}

export async function scanVarNames(
  patterns: string | string[],
  exclude?: string | string[],
  selectors?: string[],
): Promise<string[]> {
  const declarations = await scanVarDeclarations(patterns, exclude, selectors);
  return [...declarations.keys()].sort();
}
