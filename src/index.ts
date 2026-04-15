import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { scanVarNames } from './scanner.js';
import { generateCode } from './generator.js';

export { parseVarNames } from './parser.js';
export { generateCode } from './generator.js';
export { scanVarNames } from './scanner.js';

export interface GenerateOptions {
  input: string | string[];
  output: string;
  exclude?: string | string[];
  prefix?: string;
}

export async function generate(options: GenerateOptions): Promise<void> {
  const names = await scanVarNames(options.input, options.exclude);
  const code = generateCode(names, options.prefix);
  await mkdir(dirname(resolve(options.output)), { recursive: true });
  await writeFile(options.output, code, 'utf8');
}
