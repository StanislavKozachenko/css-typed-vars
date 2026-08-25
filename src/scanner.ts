import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import { parseVarNames } from './parser.js';

export async function scanVarNames(
  patterns: string | string[],
  exclude?: string | string[],
  selectors?: string[],
): Promise<string[]> {
  const normalized = (Array.isArray(patterns) ? patterns : [patterns]).map((p) =>
    p.replace(/\\/g, '/'),
  );
  const normalizedExclude = exclude
    ? (Array.isArray(exclude) ? exclude : [exclude]).map((p) => p.replace(/\\/g, '/'))
    : [];
  const files = await fg(normalized, { absolute: true, ignore: normalizedExclude });
  const all = new Set<string>();
  await Promise.all(
    files.map(async (file) => {
      let css: string;
      try {
        css = await readFile(file, 'utf8');
      } catch (err) {
        console.warn(`css-typed-vars: skipping "${file}": ${(err as Error).message}`);
        return;
      }
      for (const name of parseVarNames(css, selectors)) {
        all.add(name);
      }
    }),
  );
  return [...all].sort();
}
