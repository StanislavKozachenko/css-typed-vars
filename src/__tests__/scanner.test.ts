import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanVarNames, scanVarDeclarations, scanUsedKeys, scanCss } from '../scanner.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(async (path: string, encoding: BufferEncoding) => {
      if (path.toString().includes('vanished')) {
        throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
      }
      return actual.readFile(path, encoding);
    }),
  };
});

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'css-typed-vars-'));
  await writeFile(join(dir, 'a.css'), ':root { --color-primary: red; --spacing-md: 8px; }');
  await writeFile(join(dir, 'b.css'), ':root { --color-secondary: blue; --spacing-md: 8px; }');
  await writeFile(join(dir, 'other.txt'), ':root { --ignored: 1px; }');
  await writeFile(join(dir, 'theme.css'), ':root { --color-primary: red; } .dark { --color-primary: #000; --dark-bg: #111; }');
  await mkdir(join(dir, 'vendor'));
  await writeFile(join(dir, 'vendor', 'lib.css'), ':root { --vendor-color: #fff; }');
  await writeFile(join(dir, 'override-a.css'), ':root { --shared-value: fromA; }');
  await writeFile(join(dir, 'override-b.css'), ':root { --shared-value: fromB; }');
});

afterAll(async () => {
  await rm(dir, { recursive: true });
});

describe('scanVarNames', () => {
  it('finds all custom properties across multiple CSS files', async () => {
    const result = await scanVarNames(`${dir}/*.css`);
    expect(result).toContain('--color-primary');
    expect(result).toContain('--color-secondary');
    expect(result).toContain('--spacing-md');
  });

  it('deduplicates variables found in multiple files', async () => {
    const result = await scanVarNames(`${dir}/*.css`);
    expect(result.filter(n => n === '--spacing-md')).toHaveLength(1);
  });

  it('ignores non-CSS files', async () => {
    const result = await scanVarNames(`${dir}/*.css`);
    expect(result).not.toContain('--ignored');
  });

  it('returns empty array when no files match', async () => {
    const result = await scanVarNames(`${dir}/*.scss`);
    expect(result).toEqual([]);
  });

  it('accepts array of patterns', async () => {
    const result = await scanVarNames([`${dir}/a.css`, `${dir}/b.css`]);
    expect(result).toContain('--color-primary');
    expect(result).toContain('--color-secondary');
  });

  it('excludes files matching exclude pattern', async () => {
    const result = await scanVarNames(`${dir}/**/*.css`, `${dir}/vendor/**`);
    expect(result).not.toContain('--vendor-color');
    expect(result).toContain('--color-primary');
  });

  it('excludes files matching array of exclude patterns', async () => {
    const result = await scanVarNames(`${dir}/**/*.css`, [`${dir}/vendor/**`]);
    expect(result).not.toContain('--vendor-color');
  });

  it('returns all files when exclude is undefined', async () => {
    const result = await scanVarNames(`${dir}/**/*.css`);
    expect(result).toContain('--vendor-color');
    expect(result).toContain('--color-primary');
  });

  it('picks up variables from additional selectors', async () => {
    const result = await scanVarNames(`${dir}/theme.css`, undefined, ['.dark']);
    expect(result).toContain('--color-primary');
    expect(result).toContain('--dark-bg');
  });

  it('without selectors option ignores non-root blocks', async () => {
    const result = await scanVarNames(`${dir}/theme.css`);
    expect(result).not.toContain('--dark-bg');
    expect(result).toContain('--color-primary');
  });

  it('skips a file that fails to read instead of aborting the whole scan', async () => {
    await writeFile(join(dir, 'vanished.css'), ':root { --should-not-appear: 1px; }');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await scanVarNames(`${dir}/*.css`);
    expect(result).not.toContain('--should-not-appear');
    expect(result).toContain('--color-primary');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('vanished.css'));
    warn.mockRestore();
    await rm(join(dir, 'vanished.css'));
  });

  it('returns variables in stable sorted order across multiple runs', async () => {
    const first = await scanVarNames(`${dir}/*.css`);
    const second = await scanVarNames(`${dir}/*.css`);
    expect(first).toEqual(second);
    expect(first).toEqual([...first].sort());
  });
});

describe('scanVarDeclarations', () => {
  it('captures declared values alongside names', async () => {
    const result = await scanVarDeclarations(`${dir}/a.css`);
    expect(result.get('--color-primary')).toBe('red');
    expect(result.get('--spacing-md')).toBe('8px');
  });

  it('resolves a name declared differently in multiple files by file order, not read-completion timing', async () => {
    const aThenB = await scanVarDeclarations([`${dir}/override-a.css`, `${dir}/override-b.css`]);
    expect(aThenB.get('--shared-value')).toBe('fromB');

    const bThenA = await scanVarDeclarations([`${dir}/override-b.css`, `${dir}/override-a.css`]);
    expect(bThenA.get('--shared-value')).toBe('fromA');
  });

  it('skips a file that fails to read instead of aborting the whole scan', async () => {
    await writeFile(join(dir, 'vanished2.css'), ':root { --should-not-appear: 1px; }');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await scanVarDeclarations(`${dir}/vanished2.css`);
    expect(result.has('--should-not-appear')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('vanished2.css'));
    warn.mockRestore();
    await rm(join(dir, 'vanished2.css'));
  });
});

describe('scanUsedKeys', () => {
  let usageDir: string;

  beforeAll(async () => {
    usageDir = await mkdtemp(join(tmpdir(), 'css-typed-vars-usage-'));
    await writeFile(join(usageDir, 'a.tsx'), `
      import { cssVars } from './cssVars';
      const style = { color: cssVars.colorPrimary };
    `);
    await writeFile(join(usageDir, 'b.ts'), `
      const key = cssVars['color-secondary'];
      const other = cssVars["spacing_md"];
      const templ = cssVars\`not-a-match\`;
    `);
    await writeFile(join(usageDir, 'c.ts'), `cssVars.spacingLg /* dup across files */`);
  });

  afterAll(async () => {
    await rm(usageDir, { recursive: true });
  });

  it('finds dot-access usage', async () => {
    const result = await scanUsedKeys(`${usageDir}/*.{ts,tsx}`);
    expect(result.has('colorPrimary')).toBe(true);
  });

  it('finds single- and double-quoted bracket-access usage', async () => {
    const result = await scanUsedKeys(`${usageDir}/*.{ts,tsx}`);
    expect(result.has('color-secondary')).toBe(true);
    expect(result.has('spacing_md')).toBe(true);
  });

  it('unions usage across multiple files', async () => {
    const result = await scanUsedKeys(`${usageDir}/*.{ts,tsx}`);
    expect(result.has('spacingLg')).toBe(true);
  });

  it('does not match a template-literal call on cssVars', async () => {
    const result = await scanUsedKeys(`${usageDir}/*.{ts,tsx}`);
    expect(result.has('not-a-match')).toBe(false);
  });

  it('returns an empty set when no files match', async () => {
    const result = await scanUsedKeys(`${usageDir}/*.vue`);
    expect(result.size).toBe(0);
  });

  it('excludes files matching exclude pattern', async () => {
    const result = await scanUsedKeys(`${usageDir}/*.{ts,tsx}`, `${usageDir}/c.ts`);
    expect(result.has('spacingLg')).toBe(false);
    expect(result.has('colorPrimary')).toBe(true);
  });
});

describe('scanCss', () => {
  let propsDir: string;

  beforeAll(async () => {
    propsDir = await mkdtemp(join(tmpdir(), 'css-typed-vars-props-'));
    await writeFile(join(propsDir, 'a.css'), `
      @property --color-primary { syntax: '<color>'; inherits: false; initial-value: #3b82f6; }
      :root { --color-primary: #3b82f6; --spacing-md: 8px; }
    `);
    await writeFile(join(propsDir, 'b.css'), `@property --color-primary { syntax: '<length>'; }`);
  });

  afterAll(async () => {
    await rm(propsDir, { recursive: true });
  });

  it('returns both declarations and property rules from a single scan', async () => {
    const result = await scanCss(`${propsDir}/a.css`);
    expect(result.declarations.get('--color-primary')).toBe('#3b82f6');
    expect(result.declarations.get('--spacing-md')).toBe('8px');
    expect(result.properties.get('--color-primary')?.syntax).toBe("'<color>'");
  });

  it('resolves conflicting property rules by file order, not read-completion timing', async () => {
    const aThenB = await scanCss([`${propsDir}/a.css`, `${propsDir}/b.css`]);
    expect(aThenB.properties.get('--color-primary')?.syntax).toBe("'<length>'");

    const bThenA = await scanCss([`${propsDir}/b.css`, `${propsDir}/a.css`]);
    expect(bThenA.properties.get('--color-primary')?.syntax).toBe("'<color>'");
  });

  it('returns an empty properties map when there are no @property rules', async () => {
    const result = await scanCss(`${dir}/a.css`);
    expect(result.properties.size).toBe(0);
  });
});
