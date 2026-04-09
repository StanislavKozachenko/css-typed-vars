import { writeFileSync } from 'node:fs';

// Fallback types for css-typed-vars/vars — overwritten by the plugin on first build/dev
writeFileSync('dist/generated.d.ts', [
  'export declare const cssVars: Record<string, string>;',
  'export type CssVarName = string;',
  '',
].join('\n'));

// Runtime stub for css-typed-vars/vars (the plugin intercepts this at build time)
writeFileSync('dist/vars.js', 'export const cssVars = {};\n');
writeFileSync('dist/vars.cjs', "'use strict';\nexports.cssVars = {};\n");
