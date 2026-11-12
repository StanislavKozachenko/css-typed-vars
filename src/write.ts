import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Writes a generated file, creating its directory first if needed. Leaves a
// file that already has this exact content untouched, so an unchanged
// regeneration doesn't wake up file watchers (tsc --watch, a dev server, an
// IDE) downstream. Resolves to whether the file was written.
export async function writeOutput(path: string, content: string): Promise<boolean> {
  const current = await readFile(path, 'utf8').catch(() => null);
  if (current === content) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
  return true;
}
