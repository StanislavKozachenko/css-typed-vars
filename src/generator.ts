export type NamingConvention = 'camelCase' | 'snake' | 'kebab';

const VALID_NAMINGS: NamingConvention[] = ['camelCase', 'snake', 'kebab'];

function convertCase(value: string, naming: NamingConvention): string {
  if (!VALID_NAMINGS.includes(naming)) {
    throw new Error(`css-typed-vars: invalid naming "${naming}". Valid values: camelCase, snake, kebab`);
  }
  if (naming === 'kebab') return value;
  return naming === 'snake'
    ? value.replace(/-+/g, '_')
    : value.replace(/-+([a-z0-9])/g, (_, c: string) => c.toUpperCase()).replace(/-/g, '');
}

function toKey(cssVarName: string, naming: NamingConvention = 'camelCase'): string {
  const key = convertCase(cssVarName.replace(/^--/, ''), naming);
  return naming !== 'kebab' && /^\d/.test(key) ? `_${key}` : key;
}

function applyPrefix(key: string, prefix: string | undefined, naming: NamingConvention = 'camelCase'): string {
  if (!prefix) return key;
  let normalizedPrefix = convertCase(prefix, naming);
  if (naming === 'kebab') {
    normalizedPrefix = normalizedPrefix.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `${normalizedPrefix}-${key}`;
  }
  normalizedPrefix = normalizedPrefix.replace(/[^A-Za-z0-9_$]/g, '');
  if (/^\d/.test(normalizedPrefix)) normalizedPrefix = `_${normalizedPrefix}`;
  if (naming === 'snake') return `${normalizedPrefix}_${key}`;
  return normalizedPrefix + key.charAt(0).toUpperCase() + key.slice(1);
}

function formatKey(key: string, naming: NamingConvention = 'camelCase'): string {
  if (naming === 'kebab') return `'${key}'`;
  return key;
}

export function findKeyCollisions(
  varNames: string[],
  prefix?: string,
  naming?: NamingConvention,
): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const name of varNames) {
    const key = applyPrefix(toKey(name, naming), prefix, naming);
    const existing = byKey.get(key);
    if (existing) existing.push(name);
    else byKey.set(key, [name]);
  }
  for (const [key, names] of byKey) {
    if (names.length < 2) byKey.delete(key);
  }
  return byKey;
}

function buildEntries(
  varNames: string[],
  prefix: string | undefined,
  naming: NamingConvention | undefined,
): Array<{ key: string; name: string }> {
  const byKey = new Map<string, string>();
  for (const name of varNames) {
    const key = formatKey(applyPrefix(toKey(name, naming), prefix, naming), naming);
    byKey.set(key, name);
  }
  return [...byKey].map(([key, name]) => ({ key, name }));
}

export function generateCode(varNames: string[], prefix?: string, naming?: NamingConvention): string {
  const entries = buildEntries(varNames, prefix, naming).map(({ key, name }) => `  ${key}: 'var(${name})',`);
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
  const entries = buildEntries(varNames, prefix, naming).map(({ key, name }) => `  ${key}: 'var(${name})',`);
  return [
    '// generated — do not edit',
    'export const cssVars = {',
    ...entries,
    '};',
    '',
  ].join('\n');
}

export function generateDeclaration(varNames: string[], prefix?: string, naming?: NamingConvention): string {
  const entries = buildEntries(varNames, prefix, naming).map(({ key, name }) => `  ${key}: 'var(${name})';`);
  return [
    'export declare const cssVars: {',
    ...entries,
    '};',
    'export type CssVarName = keyof typeof cssVars;',
    '',
  ].join('\n');
}
