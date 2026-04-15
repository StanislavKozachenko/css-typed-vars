import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import { parseVarNames } from './parser.js';

export async function scanVarNames(
  patterns: string | string[],
  exclude?: string | string[],
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
      const css = await readFile(file, 'utf8');
      for (const name of parseVarNames(css)) {
        all.add(name);
      }
    }),
  );
  return [...all];
}
