import type { PropertyRule } from './parser.js';

export type NamingConvention = 'camelCase' | 'snake' | 'kebab' | 'constant' | 'pascal';

export const VALID_NAMINGS: NamingConvention[] = ['camelCase', 'snake', 'kebab', 'constant', 'pascal'];

function convertCase(value: string, naming: NamingConvention): string {
  if (!VALID_NAMINGS.includes(naming)) {
    throw new Error(`css-typed-vars: invalid naming "${naming}". Valid values: ${VALID_NAMINGS.join(', ')}`);
  }
  if (naming === 'kebab') return value;
  if (naming === 'snake') return value.replace(/-+/g, '_');
  if (naming === 'constant') return value.replace(/-+/g, '_').toUpperCase();
  if (naming === 'pascal') return value.replace(/(^|-+)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase()).replace(/-/g, '');
  return value.replace(/-+([a-z0-9])/g, (_, c: string) => c.toUpperCase()).replace(/-/g, '');
}

function toKeyFragment(fragment: string, naming: NamingConvention = 'camelCase'): string {
  const key = convertCase(fragment, naming);
  return naming !== 'kebab' && /^\d/.test(key) ? `_${key}` : key;
}

function toKey(cssVarName: string, naming: NamingConvention = 'camelCase'): string {
  return toKeyFragment(cssVarName.replace(/^--/, ''), naming);
}

// A var name splits into a group (its first hyphen-delimited segment) and the
// rest, e.g. `--color-primary` -> group "color", rest "primary". A name with
// no hyphen (e.g. `--color`) has nothing to group by.
function splitGroupKey(cssVarName: string): { group: string; rest: string } | null {
  const stripped = cssVarName.replace(/^--/, '');
  const dashIndex = stripped.indexOf('-');
  if (dashIndex === -1) return null;
  return { group: stripped.slice(0, dashIndex), rest: stripped.slice(dashIndex + 1) };
}

const LINE_SEPARATOR_CHAR = String.fromCharCode(8232);
const PARAGRAPH_SEPARATOR_CHAR = String.fromCharCode(8233);

const SINGLE_QUOTE_ESCAPES: Record<string, string> = {};
SINGLE_QUOTE_ESCAPES['\\'] = '\\\\';
SINGLE_QUOTE_ESCAPES["'"] = "\\'";
SINGLE_QUOTE_ESCAPES['\n'] = '\\n';
SINGLE_QUOTE_ESCAPES['\r'] = '\\r';
SINGLE_QUOTE_ESCAPES[LINE_SEPARATOR_CHAR] = '\\u2028';
SINGLE_QUOTE_ESCAPES[PARAGRAPH_SEPARATOR_CHAR] = '\\u2029';

function escapeSingleQuoted(value: string): string {
  let result = '';
  for (const char of value) {
    result += SINGLE_QUOTE_ESCAPES[char] ?? char;
  }
  return result;
}

function applyPrefix(key: string, prefix: string | undefined, naming: NamingConvention = 'camelCase'): string {
  if (!prefix) return key;
  let normalizedPrefix = convertCase(prefix, naming);
  if (naming === 'kebab') {
    normalizedPrefix = escapeSingleQuoted(normalizedPrefix);
    return `${normalizedPrefix}-${key}`;
  }
  normalizedPrefix = normalizedPrefix.replace(/[^A-Za-z0-9_$]/g, '');
  if (/^\d/.test(normalizedPrefix)) normalizedPrefix = `_${normalizedPrefix}`;
  if (naming === 'snake' || naming === 'constant') return `${normalizedPrefix}_${key}`;
  return normalizedPrefix + key.charAt(0).toUpperCase() + key.slice(1);
}

function formatKey(key: string, naming: NamingConvention = 'camelCase'): string {
  if (naming === 'kebab') return `'${key}'`;
  return key;
}

// The unquoted object key a CSS var name would get in flat (non-grouped) output —
// what a consumer actually writes as `cssVars.<key>` or `cssVars['<key>']`. Used by
// the unused-variable scan to match a declared var against its usage in source.
export function computeKey(cssVarName: string, prefix?: string, naming?: NamingConvention): string {
  return applyPrefix(toKey(cssVarName, naming), prefix, naming);
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

export function warnOnCollisions(varNames: string[], prefix?: string, naming?: NamingConvention): void {
  for (const [key, vars] of findKeyCollisions(varNames, prefix, naming)) {
    console.warn(`css-typed-vars: multiple CSS variables map to the same key "${key}" (${vars.join(', ')}) — only the last one will be kept.`);
  }
}

type Entry = { key: string; name: string; value?: string; syntax?: string };

function buildEntries(
  varNames: string[],
  prefix: string | undefined,
  naming: NamingConvention | undefined,
  declarations: Map<string, string> | undefined,
  properties: Map<string, PropertyRule> | undefined,
): Entry[] {
  const byKey = new Map<string, { name: string; value?: string; syntax?: string }>();
  for (const name of varNames) {
    const key = formatKey(applyPrefix(toKey(name, naming), prefix, naming), naming);
    byKey.set(key, { name, value: declarations?.get(name), syntax: properties?.get(name)?.syntax });
  }
  return [...byKey].map(([key, entry]) => ({ key, ...entry }));
}

function buildGroupedEntries(
  varNames: string[],
  naming: NamingConvention | undefined,
  declarations: Map<string, string> | undefined,
  properties: Map<string, PropertyRule> | undefined,
): { groups: Array<{ key: string; entries: Entry[] }>; ungrouped: Entry[] } {
  const groupMap = new Map<string, Map<string, { name: string; value?: string; syntax?: string }>>();
  const ungroupedMap = new Map<string, { name: string; value?: string; syntax?: string }>();
  for (const name of varNames) {
    const value = declarations?.get(name);
    const syntax = properties?.get(name)?.syntax;
    const split = splitGroupKey(name);
    if (!split) {
      ungroupedMap.set(formatKey(toKey(name, naming), naming), { name, value, syntax });
      continue;
    }
    const groupKey = formatKey(toKeyFragment(split.group, naming), naming);
    const leafKey = formatKey(toKeyFragment(split.rest, naming), naming);
    let leafMap = groupMap.get(groupKey);
    if (!leafMap) {
      leafMap = new Map();
      groupMap.set(groupKey, leafMap);
    }
    leafMap.set(leafKey, { name, value, syntax });
  }
  // A standalone variable (e.g. `--color`) whose key collides with a group's
  // key (e.g. from `--color-primary`) can't coexist with that group as a
  // sibling property — the group wins and the standalone entry is dropped.
  for (const groupKey of groupMap.keys()) ungroupedMap.delete(groupKey);
  const groups = [...groupMap].map(([key, leafMap]) => ({
    key,
    entries: [...leafMap].map(([key, entry]) => ({ key, ...entry })),
  }));
  const ungrouped = [...ungroupedMap].map(([key, entry]) => ({ key, ...entry }));
  return { groups, ungrouped };
}

// A value containing `*/` would otherwise prematurely close the block comment
// it's embedded in.
function formatDefaultComment(value: string, indent = '  '): string {
  return `${indent}/** @default ${value.replace(/\*\//g, '*\\/')} */`;
}

// `@property`'s `syntax` descriptor is always a quoted string, e.g. "'<color>'"
// or '"small | medium | large"' — strip the outer quotes for display.
function unquoteCssString(value: string): string {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
    return value.slice(1, -1);
  }
  return value;
}

function formatSyntaxComment(syntax: string, indent = '  '): string {
  return `${indent}/** @syntax ${unquoteCssString(syntax).replace(/\*\//g, '*\\/')} */`;
}

// Matches a `syntax` descriptor that's a pipe-separated list of custom idents,
// e.g. "small | medium | large" — the one case where `@property` constrains a
// variable to a closed set of values we can turn into a TS union type. Generic
// data types like `<color>` or `<length>+` (and the universal `*`) don't match.
const ENUM_SYNTAX_RE = /^[\w-]+(?:\s*\|\s*[\w-]+)+$/;

function parseEnumSyntax(syntax: string): string[] | null {
  const unquoted = unquoteCssString(syntax).trim();
  if (!ENUM_SYNTAX_RE.test(unquoted)) return null;
  return unquoted.split('|').map((v) => v.trim());
}

function syntaxTypeName(cssVarName: string): string {
  const pascal = convertCase(cssVarName.replace(/^--/, ''), 'pascal');
  return (/^\d/.test(pascal) ? `_${pascal}` : pascal) + 'Syntax';
}

// One exported union type per variable whose @property syntax is an enum-like
// custom-ident list, e.g. `export type ThemeModeSyntax = 'light' | 'dark';`.
// Not grouped/prefixed — these are TS type names, not object keys.
function buildSyntaxTypes(
  varNames: string[],
  properties: Map<string, PropertyRule> | undefined,
): Array<{ name: string; values: string[] }> {
  if (!properties) return [];
  const byName = new Map<string, string[]>();
  for (const name of varNames) {
    const values = parseEnumSyntax(properties.get(name)?.syntax ?? '');
    if (values) byName.set(syntaxTypeName(name), values);
  }
  return [...byName].map(([name, values]) => ({ name, values }));
}

function renderSyntaxTypeLines(types: Array<{ name: string; values: string[] }>): string[] {
  return types.map(({ name, values }) => `export type ${name} = ${values.map((v) => `'${escapeSingleQuoted(v)}'`).join(' | ')};`);
}

// Builds the trailing `export type` blocks (CssVarName, then syntax enum
// types) as separate blocks, so callers can join them with the blank-line
// convention that fits their output (generateCode vs generateDeclaration).
function buildTailBlocks(
  varNames: string[],
  group: boolean | undefined,
  properties: Map<string, PropertyRule> | undefined,
): string[][] {
  const blocks: string[][] = [];
  if (!group) blocks.push(['export type CssVarName = keyof typeof cssVars;']);
  const syntaxLines = renderSyntaxTypeLines(buildSyntaxTypes(varNames, properties));
  if (syntaxLines.length > 0) blocks.push(syntaxLines);
  return blocks;
}

function renderEntryLines(
  entries: Entry[],
  indent: string,
  lineFor: (key: string, name: string) => string,
): string[] {
  return entries.flatMap(({ key, name, value, syntax }) => [
    ...(value ? [formatDefaultComment(value, indent)] : []),
    ...(syntax ? [formatSyntaxComment(syntax, indent)] : []),
    `${indent}${lineFor(key, name)}`,
  ]);
}

function renderGroupedBlock(
  varNames: string[],
  naming: NamingConvention | undefined,
  declarations: Map<string, string> | undefined,
  properties: Map<string, PropertyRule> | undefined,
  indent: string,
  closeSuffix: string,
  lineFor: (key: string, name: string) => string,
): string[] {
  const { groups, ungrouped } = buildGroupedEntries(varNames, naming, declarations, properties);
  const lines: string[] = [];
  for (const group of groups) {
    lines.push(`${indent}${group.key}: {`);
    lines.push(...renderEntryLines(group.entries, indent + '  ', lineFor));
    lines.push(`${indent}}${closeSuffix}`);
  }
  lines.push(...renderEntryLines(ungrouped, indent, lineFor));
  return lines;
}

function assertGroupPrefixCompatible(prefix: string | undefined, group: boolean | undefined): void {
  if (group && prefix) {
    throw new Error('css-typed-vars: the "group" option cannot be combined with "prefix".');
  }
}

const codeLineFor = (key: string, name: string) => `${key}: 'var(${name})',`;
const declarationLineFor = (key: string, name: string) => `${key}: 'var(${name})';`;

export function generateCode(
  varNames: string[],
  prefix?: string,
  naming?: NamingConvention,
  declarations?: Map<string, string>,
  group?: boolean,
  properties?: Map<string, PropertyRule>,
): string {
  assertGroupPrefixCompatible(prefix, group);
  const entries = group
    ? renderGroupedBlock(varNames, naming, declarations, properties, '  ', ',', codeLineFor)
    : renderEntryLines(buildEntries(varNames, prefix, naming, declarations, properties), '  ', codeLineFor);
  const blocks = buildTailBlocks(varNames, group, properties);
  const tailBody = blocks.flatMap((block, i) => (i === 0 ? block : ['', ...block]));
  return [
    '// generated — do not edit',
    'export const cssVars = {',
    ...entries,
    '} as const;',
    ...(tailBody.length > 0 ? ['', ...tailBody] : []),
    '',
  ].join('\n');
}

export function generateJs(
  varNames: string[],
  prefix?: string,
  naming?: NamingConvention,
  declarations?: Map<string, string>,
  group?: boolean,
  properties?: Map<string, PropertyRule>,
): string {
  assertGroupPrefixCompatible(prefix, group);
  const entries = group
    ? renderGroupedBlock(varNames, naming, declarations, properties, '  ', ',', codeLineFor)
    : renderEntryLines(buildEntries(varNames, prefix, naming, declarations, properties), '  ', codeLineFor);
  return [
    '// generated — do not edit',
    'export const cssVars = {',
    ...entries,
    '};',
    '',
  ].join('\n');
}

export function generateDeclaration(
  varNames: string[],
  prefix?: string,
  naming?: NamingConvention,
  declarations?: Map<string, string>,
  group?: boolean,
  properties?: Map<string, PropertyRule>,
): string {
  assertGroupPrefixCompatible(prefix, group);
  const entries = group
    ? renderGroupedBlock(varNames, naming, declarations, properties, '  ', ';', declarationLineFor)
    : renderEntryLines(buildEntries(varNames, prefix, naming, declarations, properties), '  ', declarationLineFor);
  const blocks = buildTailBlocks(varNames, group, properties);
  const tailBody = blocks.flatMap((block, i) => (i === 0 ? block : ['', ...block]));
  return [
    'export declare const cssVars: {',
    ...entries,
    '};',
    ...tailBody,
    '',
  ].join('\n');
}
