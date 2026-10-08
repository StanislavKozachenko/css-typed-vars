import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { scanVarDeclarations } from './scanner.js';
import { generateCode, generateJs, generateDeclaration, warnOnCollisions, type NamingConvention } from './generator.js';

export { parseVarNames, parseVarDeclarations } from './parser.js';
export { generateCode, generateJs, generateDeclaration } from './generator.js';
export { scanVarNames, scanVarDeclarations } from './scanner.js';
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
  const declarations = await scanVarDeclarations(options.input, options.exclude, options.selectors);
  const names = [...declarations.keys()].sort();
  if (names.length === 0) {
    console.warn('css-typed-vars: no CSS custom properties found.');
  }
  warnOnCollisions(names, options.prefix, options.naming);
  const outPath = resolve(options.output);
  await mkdir(dirname(outPath), { recursive: true });

  const jsExtMatch = /\.(m|c)?js$/i.exec(options.output);
  if (jsExtMatch) {
    await writeFile(outPath, generateJs(names, options.prefix, options.naming, declarations), 'utf8');
    const dtsPath = outPath.slice(0, -jsExtMatch[0].length) + '.d.ts';
    await writeFile(dtsPath, generateDeclaration(names, options.prefix, options.naming, declarations), 'utf8');
  } else {
    await writeFile(outPath, generateCode(names, options.prefix, options.naming, declarations), 'utf8');
  }
}
