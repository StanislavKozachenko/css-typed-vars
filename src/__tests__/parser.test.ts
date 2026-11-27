import { describe, it, expect } from 'vitest';
import { parseVarNames, parseVarDeclarations, parsePropertyRules, parseThemedDeclarations, parseVarReferences, parseDeclaredNames, parseSourceVarReferences, parseSourceDeclaredNames } from '../parser.js';

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

  it('does not stop at a semicolon inside brackets, such as an unquoted data URI', () => {
    const css = `:root { --bg: url(data:image/png;base64,iVBOR); --list: [a;b]; --after: 1px; }`;
    const result = parseVarDeclarations(css);
    expect(result.get('--bg')).toBe('url(data:image/png;base64,iVBOR)');
    expect(result.get('--list')).toBe('[a;b]');
    expect(result.get('--after')).toBe('1px');
  });

  it('keeps SCSS interpolation in a value whole', () => {
    const css = `:root { --color: #{$primary}; --shadow: 0 0 #{$s} rgba(#{$c}, .5); --after: 1px; }`;
    const result = parseVarDeclarations(css);
    expect(result.get('--color')).toBe('#{$primary}');
    expect(result.get('--shadow')).toBe('0 0 #{$s} rgba(#{$c}, .5)');
    expect(result.get('--after')).toBe('1px');
  });

  it('drops a trailing !important from the value', () => {
    const css = `:root { --a: red !important; --b: 1px ! IMPORTANT; --c: "x !important"; }`;
    const result = parseVarDeclarations(css);
    expect(result.get('--a')).toBe('red');
    expect(result.get('--b')).toBe('1px');
    expect(result.get('--c')).toBe('"x !important"');
  });

  it('ends a value at an unmatched closing brace even inside an open paren', () => {
    const css = `:root { --broken: calc(1px }`;
    expect(parseVarDeclarations(css).get('--broken')).toBe('calc(1px');
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

describe('parseThemedDeclarations', () => {
  const css = `
    :root { --color-bg: #fff; --color-text: #111; }
    [data-theme="dark"] { --color-bg: #000; --dark-only: 1px; }
    :root[data-theme="dim"] { --color-bg: #333; }
    @media (prefers-color-scheme: dark) {
      :root { --color-text: #eee; }
    }
    @media (min-width: 600px) { :root { --gutter: 24px; } }
  `;

  it('collects selector theme values separately from the base values', () => {
    const { declarations, themes } = parseThemedDeclarations(css, undefined, { dark: '[data-theme="dark"]', dim: '[data-theme="dim"]' });
    expect(declarations.get('--color-bg')).toBe('#fff');
    expect(themes.get('dark')).toEqual(new Map([['--color-bg', '#000'], ['--dark-only', '1px']]));
  });

  it('drops a trailing !important from theme values', () => {
    const { themes } = parseThemedDeclarations('.dark { --color-bg: #000 !important; }', undefined, { dark: '.dark' });
    expect(themes.get('dark')?.get('--color-bg')).toBe('#000');
  });

  it('keeps a :root[...] theme block out of the base values', () => {
    // Without themes, the default :root scan picks up :root[data-theme="dim"] and it wins.
    expect(parseVarDeclarations(css).get('--color-bg')).toBe('#333');
    const { declarations, themes } = parseThemedDeclarations(css, undefined, { dim: '[data-theme="dim"]' });
    expect(declarations.get('--color-bg')).toBe('#fff');
    expect(themes.get('dim')?.get('--color-bg')).toBe('#333');
  });

  it('reads :root inside a matching @media theme, ignoring whitespace and case', () => {
    const { declarations, themes } = parseThemedDeclarations(css, undefined, { dark: '@MEDIA (prefers-color-scheme:dark)' });
    expect(declarations.get('--color-text')).toBe('#111');
    expect(themes.get('dark')).toEqual(new Map([['--color-text', '#eee']]));
  });

  it('leaves non-theme @media blocks in the base values', () => {
    const { declarations } = parseThemedDeclarations(css, undefined, { dark: '@media (prefers-color-scheme: dark)' });
    expect(declarations.get('--gutter')).toBe('24px');
  });

  it('finds a theme @media block nested inside another @media block', () => {
    const nested = '@media screen { @media (prefers-color-scheme: dark) { :root { --x: 1; } } }';
    const { themes } = parseThemedDeclarations(nested, undefined, { dark: '@media (prefers-color-scheme: dark)' });
    expect(themes.get('dark')?.get('--x')).toBe('1');
  });

  it('returns an empty map for a theme with no matching blocks', () => {
    const { themes } = parseThemedDeclarations(css, undefined, { sepia: '.sepia' });
    expect(themes.get('sepia')?.size).toBe(0);
  });

  it('matches parseVarDeclarations when no themes are given', () => {
    expect(parseThemedDeclarations(css, ['.x'], {}).declarations).toEqual(parseVarDeclarations(css, ['.x']));
  });
});

describe('doc comments (parseThemedDeclarations)', () => {
  const css = `
    /* Colors — a section header, not a doc comment */
    :root {
      /** Primary brand color. */
      --color-primary: #3b82f6;
      /**
       * Old link color.
       * Kept for v1 consumers.
       * @deprecated use --color-primary
       */
      --color-link: blue;
      --a: 1px /* inline */ solid; /** Doc for b. */ --b: 2;
      /** @deprecated */
      --c: 3;
      /** Not attached — a declaration sits in between. */
      --d: 4;
      --e: 5;
      /**/ --f: 6;
    }
    [data-theme="dark"] { /** Dark-only glow. */ --glow: 2px; /** Theme doc, base wins. */ --color-primary: #000; }
  `;
  const { docs, declarations } = parseThemedDeclarations(css, undefined, { dark: '[data-theme="dark"]' });

  it('reads a /** */ comment directly before a declaration as its description', () => {
    expect(docs.get('--color-primary')).toEqual({ description: 'Primary brand color.' });
    expect(docs.get('--b')).toEqual({ description: 'Doc for b.' });
  });

  it('reads multi-line descriptions and @deprecated reasons, dropping * gutters', () => {
    expect(docs.get('--color-link')).toEqual({ description: 'Old link color.\nKept for v1 consumers.', deprecated: 'use --color-primary' });
    expect(docs.get('--c')).toEqual({ deprecated: true });
  });

  it('ignores plain comments, empty /**/ and comments not directly before the declaration', () => {
    expect(docs.has('--d')).toBe(true);
    expect(docs.has('--e')).toBe(false);
    expect(docs.has('--f')).toBe(false);
    expect([...docs.keys()]).not.toContain('--a');
  });

  it('falls back to a theme block doc, preferring the base one', () => {
    expect(docs.get('--glow')).toEqual({ description: 'Dark-only glow.' });
    expect(docs.get('--color-primary')?.description).toBe('Primary brand color.');
  });

  it('leaves declared values unchanged', () => {
    expect(declarations.get('--a')).toBe(parseVarDeclarations(css).get('--a'));
    expect(declarations.get('--color-link')).toBe('blue');
  });

  it('finds doc comments inside an @media theme block', () => {
    const media = '@media (prefers-color-scheme: dark) { :root { /** In media. */ --m: 1; } }';
    expect(parseThemedDeclarations(media, undefined, { dark: '@media (prefers-color-scheme: dark)' }).docs.get('--m'))
      .toEqual({ description: 'In media.' });
  });

  it('is not fooled by /* inside a string or an earlier comment', () => {
    const tricky = ":root { --s: '/* not a comment */'; /* see a/*b */ /** Real doc. */ --t: 1; }";
    const result = parseThemedDeclarations(tricky, undefined, {});
    expect(result.docs.get('--t')).toEqual({ description: 'Real doc.' });
    expect(result.declarations.get('--s')).toBe("'/* not a comment */'");
  });
});

describe('parseVarReferences', () => {
  it('finds references with their line, column and fallback flag', () => {
    const css = '.a {\n  color: var(--color-primary);\n  margin: var( --gap , 4px) var(--x,var(--y));\n}';
    expect(parseVarReferences(css)).toEqual([
      { name: '--color-primary', hasFallback: false, line: 2, column: 10 },
      { name: '--gap', hasFallback: true, line: 3, column: 11 },
      { name: '--x', hasFallback: true, line: 3, column: 29 },
      { name: '--y', hasFallback: false, line: 3, column: 37 },
    ]);
  });

  it('skips references inside comments and strings, keeping original positions', () => {
    const css = "/* var(--in-comment) */\n.a { content: 'var(--in-string)'; /* x */ color: VAR(--real); }";
    expect(parseVarReferences(css)).toEqual([{ name: '--real', hasFallback: false, line: 2, column: 50 }]);
  });

  it('ignores SCSS/Less interpolated names', () => {
    expect(parseVarReferences('.a { color: var(--#{$name}); b: var(--@{name}); }')).toEqual([]);
  });
});

describe('parseDeclaredNames', () => {
  it('collects declarations in any block plus @property names', () => {
    const css = ':root { --a: 1; } .card { --b: var(--a); } @property --c { syntax: "<color>"; inherits: false; initial-value: red; } @media (x) { .d { --e:2 } }';
    expect([...parseDeclaredNames(css)].sort()).toEqual(['--a', '--b', '--c', '--e']);
  });

  it('ignores names inside comments and strings', () => {
    expect([...parseDeclaredNames(":root { /* --a: 1; */ content: '--b: 2'; --c: 3; }")]).toEqual(['--c']);
  });

  it('ignores a selector with -- before a pseudo-class', () => {
    const css = '.card { --a: 1; &--active:hover { --b: 2 } } .btn--primary:focus { color: red } .x { @apply [--c:3]; }';
    expect([...parseDeclaredNames(css)].sort()).toEqual(['--a', '--b', '--c']);
  });
});

describe('a nested selector with -- before a pseudo-class', () => {
  it('is not read as a declaration, with & or a full selector', () => {
    const css = `.card {
      --gap: 4px;
      &--active:hover { color: red; }
      .btn--primary:focus { --inner: 1 }
      &--wide : not(.x) { --wide: 2; }
      --last: 3
    }`;
    expect([...parseVarDeclarations(css, ['.card'])]).toEqual([
      ['--gap', '4px'],
      ['--inner', '1'],
      ['--wide', '2'],
      ['--last', '3'],
    ]);
  });

  it('is skipped inside :root and theme blocks too', () => {
    const css = ':root { --a: 1; .btn--primary:hover { color: red } } .dark { .btn--primary:hover { --b: 2 } }';
    const { declarations, themes } = parseThemedDeclarations(css, undefined, { dark: '.dark' });
    expect([...declarations]).toEqual([['--a', '1']]);
    expect([...themes.get('dark')!]).toEqual([['--b', '2']]);
  });

  it('still reads declarations with no ; or whitespace around them', () => {
    expect(parseVarNames(':root{--a:1;--b:2}:root{ .x{}--c:3 }')).toEqual(['--a', '--b', '--c']);
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

describe('parseSourceVarReferences', () => {
  const names = (text: string) => parseSourceVarReferences(text).map((ref) => ref.name);

  it('finds var() references inside strings, template literals and class names', () => {
    expect(names(`<div style={{ color: 'var(--a)', margin: \`var(--b)\` }} className="bg-[var(--c)]" />`)).toEqual(['--a', '--b', '--c']);
  });

  it('finds the Tailwind v4 shorthand, with or without a type hint', () => {
    expect(names('<p class="bg-(--brand) hover:text-(length:--size)">')).toEqual(['--brand', '--size']);
  });

  it("doesn't mistake a decrement for the shorthand", () => {
    expect(names('const y = a -(--i); const z = f(--j);')).toEqual([]);
  });

  it('flags fallbacks and reports 1-based positions', () => {
    expect(parseSourceVarReferences("const a = 1;\nconst s = { gap: 'var( --gap , 4px)' };")).toEqual([
      { name: '--gap', hasFallback: true, line: 2, column: 19 },
    ]);
  });
});

describe('parseSourceDeclaredNames', () => {
  it('finds object keys, style attributes, setProperty calls and Tailwind arbitrary properties', () => {
    const text = `const s = { '--a': 1, "--b": 2 };
<div style="--c: 4px; color: var(--x)" class="[--d:4px]" />
el.style.setProperty('--e', '1px');`;
    expect([...parseSourceDeclaredNames(text)].sort()).toEqual(['--a', '--b', '--c', '--d', '--e']);
  });

  it("doesn't count a reference as a declaration", () => {
    expect([...parseSourceDeclaredNames("const s = { color: 'var(--x)', gap: 'var(--y, 1px)' };")]).toEqual([]);
  });
});
