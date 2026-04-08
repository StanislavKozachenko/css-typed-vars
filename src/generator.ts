function toCamelCase(cssVarName: string): string {
  return cssVarName
    .replace(/^--/, '')
    .replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function generateCode(varNames: string[]): string {
  const entries = varNames.map(name => `  ${toCamelCase(name)}: 'var(${name})',`);
  return [
    '// generated — do not edit',
    'export const cssVars = {',
    ...entries,
    '} as const;',
    '',
    'export type CssVarName = keyof typeof cssVars;',
    '',
  ].join('\n');
}
