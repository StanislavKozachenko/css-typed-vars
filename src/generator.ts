function toCamelCase(cssVarName: string): string {
  return cssVarName
    .replace(/^--/, '')
    .replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function applyPrefix(key: string, prefix: string | undefined): string {
  if (!prefix) return key;
  return prefix + key.charAt(0).toUpperCase() + key.slice(1);
}

export function generateCode(varNames: string[], prefix?: string): string {
  const entries = varNames.map(name => `  ${applyPrefix(toCamelCase(name), prefix)}: 'var(${name})',`);
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

export function generateJs(varNames: string[], prefix?: string): string {
  const entries = varNames.map(name => `  ${applyPrefix(toCamelCase(name), prefix)}: 'var(${name})',`);
  return [
    'export const cssVars = {',
    ...entries,
    '};',
    '',
  ].join('\n');
}

export function generateDeclaration(varNames: string[], prefix?: string): string {
  const entries = varNames.map(name => `  ${applyPrefix(toCamelCase(name), prefix)}: 'var(${name})';`);
  return [
    'export declare const cssVars: {',
    ...entries,
    '};',
    'export type CssVarName = keyof typeof cssVars;',
    '',
  ].join('\n');
}
