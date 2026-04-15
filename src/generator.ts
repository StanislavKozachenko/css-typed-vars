export type NamingConvention = 'camelCase' | 'snake' | 'kebab';

function toKey(cssVarName: string, naming: NamingConvention = 'camelCase'): string {
  const stripped = cssVarName.replace(/^--/, '');
  if (naming === 'snake') return stripped.replace(/-/g, '_');
  if (naming === 'kebab') return stripped;
  return stripped.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function applyPrefix(key: string, prefix: string | undefined, naming: NamingConvention = 'camelCase'): string {
  if (!prefix) return key;
  if (naming === 'snake') return `${prefix}_${key}`;
  if (naming === 'kebab') return `${prefix}-${key}`;
  return prefix + key.charAt(0).toUpperCase() + key.slice(1);
}

function formatKey(key: string, naming: NamingConvention = 'camelCase'): string {
  if (naming === 'kebab') return `'${key}'`;
  return key;
}

export function generateCode(varNames: string[], prefix?: string, naming?: NamingConvention): string {
  const entries = varNames.map(name => {
    const key = formatKey(applyPrefix(toKey(name, naming), prefix, naming), naming);
    return `  ${key}: 'var(${name})',`;
  });
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

export function generateJs(varNames: string[], prefix?: string, naming?: NamingConvention): string {
  const entries = varNames.map(name => {
    const key = formatKey(applyPrefix(toKey(name, naming), prefix, naming), naming);
    return `  ${key}: 'var(${name})',`;
  });
  return [
    '// generated — do not edit',
    'export const cssVars = {',
    ...entries,
    '};',
    '',
  ].join('\n');
}

export function generateDeclaration(varNames: string[], prefix?: string, naming?: NamingConvention): string {
  const entries = varNames.map(name => {
    const key = formatKey(applyPrefix(toKey(name, naming), prefix, naming), naming);
    return `  ${key}: 'var(${name})';`;
  });
  return [
    'export declare const cssVars: {',
    ...entries,
    '};',
    'export type CssVarName = keyof typeof cssVars;',
    '',
  ].join('\n');
}
