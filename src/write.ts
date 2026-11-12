import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Writes a generated file, creating its directory first if needed.
export async function writeOutput(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}
