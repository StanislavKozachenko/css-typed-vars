import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { scanVarNames } from './scanner.js';
import { generateCode, generateJs, generateDeclaration, findKeyCollisions, type NamingConvention } from './generator.js';

export { parseVarNames } from './parser.js';
export { generateCode, generateJs, generateDeclaration } from './generator.js';
export { scanVarNames } from './scanner.js';
export type { NamingConvention } from './generator.js';

export interface GenerateOptions {
  input: string | string[];
  output: string;
  exclude?: string | string[];
  prefix?: string;
  naming?: NamingConvention;
  selectors?: string[];
}

export async function generate(options: GenerateOptions): Promise<void> {
  const names = await scanVarNames(options.input, options.exclude, options.selectors);
  if (names.length === 0) {
    console.warn('css-typed-vars: no CSS custom properties found.');
  }
  for (const [key, vars] of findKeyCollisions(names, options.prefix, options.naming)) {
    console.warn(`css-typed-vars: multiple CSS variables map to the same key "${key}" (${vars.join(', ')}) — only the last one will be kept.`);
  }
  const outPath = resolve(options.output);
  await mkdir(dirname(outPath), { recursive: true });

  const jsExtMatch = /\.(m|c)?js$/.exec(options.output);
  if (jsExtMatch) {
    await writeFile(outPath, generateJs(names, options.prefix, options.naming), 'utf8');
    const dtsPath = outPath.slice(0, -jsExtMatch[0].length) + '.d.ts';
    await writeFile(dtsPath, generateDeclaration(names, options.prefix, options.naming), 'utf8');
  } else {
    await writeFile(outPath, generateCode(names, options.prefix, options.naming), 'utf8');
  }
}
