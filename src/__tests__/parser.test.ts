import { describe, it, expect } from 'vitest';
import { parseVarNames, parseVarDeclarations, parsePropertyRules } from '../parser.js';

describe('parseVarNames', () => {
  it('extracts custom properties from :root block', () => {
    const css = `:root {
      --color-primary: #3b82f6;
      --spacing-md: 8px;
    }`;
    expect(parseVarNames(css)).toEqual(['--color-primary', '--spacing-md']);
  });

  it('returns empty array when no :root block', () => {
    const css = `.foo { --color: red; }`;
    expect(parseVarNames(css)).toEqual([]);
  });

  it('ignores variables outside :root', () => {
    const css = `
      :root { --color-primary: red; }
      .foo { --local-var: blue; }
    `;
    expect(parseVarNames(css)).toEqual(['--color-primary']);
  });

  it('deduplicates variables across multiple :root blocks', () => {
    const css = `
      :root { --color: red; }
      :root { --color: blue; --spacing: 8px; }
    `;
    expect(parseVarNames(css)).toEqual(['--color', '--spacing']);
  });

  it('returns empty array for empty css', () => {
    expect(parseVarNames('')).toEqual([]);
  });

  it('ignores variables inside CSS block comments', () => {
    const css = `:root {
      /* --fake-var: #fff; */
      --color-primary: red;
    }`;
    expect(parseVarNames(css)).toEqual(['--color-primary']);
  });

  it('ignores variables inside SCSS single-line comments', () => {
    const css = `:root {
      // --fake-var: #fff;
      --color-primary: red;
    }`;
    expect(parseVarNames(css)).toEqual(['--color-primary']);
  });

  it('does not treat http:// or https:// URLs as comment starts', () => {
    const css = `:root { --logo: url(http://example.com/logo.png); --color-primary: #3b82f6; }`;
    expect(parseVarNames(css)).toEqual(['--logo', '--color-primary']);
  });

  it('handles :root with attribute selector', () => {
    const css = `:root[data-theme="dark"] { --color-primary: #000; }`;
    expect(parseVarNames(css)).toEqual(['--color-primary']);
  });

  it('handles :root inside @media block', () => {
    const css = `
      @media (prefers-color-scheme: dark) {
        :root { --color-primary: #000; }
      }
    `;
    expect(parseVarNames(css)).toEqual(['--color-primary']);
  });

  it('handles variable names with uppercase and underscores', () => {
    const css = `:root { --colorPrimary: red; --color_secondary: blue; }`;
    expect(parseVarNames(css)).toEqual(['--colorPrimary', '--color_secondary']);
  });

  it('picks up variables from additional selectors', () => {
    const css = `
      :root { --color-primary: red; }
      .dark { --color-primary: #000; --color-bg: #111; }
    `;
    const result = parseVarNames(css, ['.dark']);
    expect(result).toContain('--color-primary');
    expect(result).toContain('--color-bg');
  });

  it('without selectors option still ignores non-root blocks', () => {
    const css = `
      :root { --color-primary: red; }
      .dark { --color-bg: #111; }
    `;
    expect(parseVarNames(css)).toEqual(['--color-primary']);
  });

  it('supports attribute selector syntax', () => {
    const css = `[data-theme="dark"] { --color-bg: #111; --color-text: #fff; }`;
    const result = parseVarNames(css, ['[data-theme="dark"]']);
    expect(result).toContain('--color-bg');
    expect(result).toContain('--color-text');
  });

  it('picks up variables from a Tailwind v4 @theme block without selectors option', () => {
    const css = `@theme {
      --color-primary: #3b82f6;
      --spacing-md: 8px;
    }`;
    expect(parseVarNames(css)).toEqual(['--color-primary', '--spacing-md']);
  });

  it('supports @theme block modifiers like "inline"', () => {
    const css = `@theme inline { --color-primary: #3b82f6; }`;
    expect(parseVarNames(css)).toEqual(['--color-primary']);
  });

  it('does not match an at-rule whose name merely starts with "theme"', () => {
    const css = `@themeOverride { --color-primary: #3b82f6; }`;
    expect(parseVarNames(css)).toEqual([]);
  });

  it('combines @theme and :root declarations', () => {
    const css = `
      @theme { --color-primary: #3b82f6; }
      :root { --spacing-md: 8px; }
    `;
    const result = parseVarNames(css);
    expect(result).toContain('--color-primary');
    expect(result).toContain('--spacing-md');
    expect(result).toHaveLength(2);
  });

  it('keeps properties declared after a nested block inside :root', () => {
    const css = `:root {
      --color: red;
      @media (prefers-color-scheme: dark) { --color: blue; }
      --spacing: 8px;
    }`;
    expect(parseVarNames(css)).toEqual(['--color', '--spacing']);
  });

  it('does not lose properties after a string value containing a brace', () => {
    const css = `:root { --content: "a}b"; --after: 1px; }`;
    expect(parseVarNames(css)).toEqual(['--content', '--after']);
  });

  it('does not let a // inside a quoted value break quote tracking', () => {
    const css = `:root {
      --content: "a // b";
    }
    .foo {
      --leak: 1px;
    }`;
    expect(parseVarNames(css)).toEqual(['--content']);
  });

  it('does not treat a protocol-relative url() as a comment start', () => {
    const css = `:root { --bg: url(//cdn.example.com/img.png); --after: 1px; }`;
    expect(parseVarNames(css)).toEqual(['--bg', '--after']);
  });

  it('does not desync on a literal ) inside a quoted url()', () => {
    const css = `:root { --bg: url("weird)name.png"); --after: 1px; }`;
    expect(parseVarNames(css)).toEqual(['--bg', '--after']);
  });

  it('does not treat a declaration-like substring inside a quoted value as a real variable', () => {
    const css = `:root { --desc: "see --brand-color: red for branding"; --after: 1px; }`;
    expect(parseVarNames(css)).toEqual(['--desc', '--after']);
  });

  it('does not match a selector that is a prefix of another selector', () => {
    const css = `.darkMode { --x: 1px; }`;
    expect(parseVarNames(css, ['.dark'])).toEqual([]);
  });

  it('deduplicates variables across :root and extra selectors', () => {
    const css = `
      :root { --color: red; }
      .dark { --color: #000; --extra: 1px; }
    `;
    const result = parseVarNames(css, ['.dark']);
    expect(result.filter(n => n === '--color')).toHaveLength(1);
    expect(result).toContain('--extra');
  });
});

describe('parseVarDeclarations', () => {
  it('captures the declared value alongside the name', () => {
    const css = `:root { --color-primary: red; --spacing-md: 8px; }`;
    const result = parseVarDeclarations(css);
    expect(result.get('--color-primary')).toBe('red');
    expect(result.get('--spacing-md')).toBe('8px');
  });

  it('trims surrounding whitespace from the value', () => {
    const css = `:root {\n  --color-primary:   red  ;\n}`;
    expect(parseVarDeclarations(css).get('--color-primary')).toBe('red');
  });

  it('preserves a quoted value verbatim including its quotes', () => {
    const css = `:root { --content: "hello world"; }`;
    expect(parseVarDeclarations(css).get('--content')).toBe('"hello world"');
  });

  it('does not stop at a semicolon inside a quoted value', () => {
    const css = `:root { --content: "a;b"; --after: 1px; }`;
    expect(parseVarDeclarations(css).get('--content')).toBe('"a;b"');
    expect(parseVarDeclarations(css).get('--after')).toBe('1px');
  });

  it('captures a value containing nested parens like calc() or var()', () => {
    const css = `:root { --double: calc(1px * 2); --fallback: var(--x, blue); }`;
    expect(parseVarDeclarations(css).get('--double')).toBe('calc(1px * 2)');
    expect(parseVarDeclarations(css).get('--fallback')).toBe('var(--x, blue)');
  });

  it('keeps only the last declared value when a name is declared twice', () => {
    const css = `:root { --color: red; } :root { --color: blue; }`;
    expect(parseVarDeclarations(css).get('--color')).toBe('blue');
  });

  it('strips comments from the surrounding block without corrupting the value', () => {
    const css = `:root {\n  /* a comment */\n  --color-primary: red; // trailing SCSS comment\n}`;
    expect(parseVarDeclarations(css).get('--color-primary')).toBe('red');
  });

  it('handles a declaration at the end of a block with no trailing semicolon', () => {
    const css = `:root { --color-primary: red }`;
    expect(parseVarDeclarations(css).get('--color-primary')).toBe('red');
  });
});

describe('parsePropertyRules', () => {
  it('parses syntax, inherits, and initial-value descriptors', () => {
    const css = `@property --color-primary {
      syntax: '<color>';
      inherits: false;
      initial-value: #3b82f6;
    }`;
    const rule = parsePropertyRules(css).get('--color-primary');
    expect(rule?.syntax).toBe("'<color>'");
    expect(rule?.inherits).toBe('false');
    expect(rule?.initialValue).toBe('#3b82f6');
  });

  it('parses an enum-like custom-ident syntax', () => {
    const css = `@property --theme-mode { syntax: "light | dark | system"; inherits: true; initial-value: light; }`;
    expect(parsePropertyRules(css).get('--theme-mode')?.syntax).toBe('"light | dark | system"');
  });

  it('returns an empty map when there are no @property rules', () => {
    const css = `:root { --color-primary: red; }`;
    expect(parsePropertyRules(css).size).toBe(0);
  });

  it('ignores a rule with no recognized descriptors', () => {
    const css = `@property --color-primary { /* empty */ }`;
    expect(parsePropertyRules(css).has('--color-primary')).toBe(false);
  });

  it('keeps only the last rule when the same property is registered twice', () => {
    const css = `
      @property --color-primary { syntax: '<color>'; }
      @property --color-primary { syntax: '<length>'; }
    `;
    expect(parsePropertyRules(css).get('--color-primary')?.syntax).toBe("'<length>'");
  });

  it('strips comments before parsing', () => {
    const css = `@property --color-primary {
      /* a comment */
      syntax: '<color>'; // trailing comment
    }`;
    expect(parsePropertyRules(css).get('--color-primary')?.syntax).toBe("'<color>'");
  });

  it('does not confuse a descriptor name that is a substring of a longer token', () => {
    const css = `@property --x { syntax: '<color>'; -my-inherits: true; }`;
    expect(parsePropertyRules(css).get('--x')?.inherits).toBeUndefined();
  });
});
