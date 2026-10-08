---
layout: home

hero:
  name: css-typed-vars
  text: Typed CSS custom properties
  tagline: Generate TypeScript typed constants from your CSS custom properties — rename or remove a variable and TypeScript catches it at compile time instead of the browser.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/StanislavKozachenko/css-typed-vars

features:
  - title: CLI or plugin
    details: Generate a cssVars.ts file with the CLI, or import a virtual module directly from Vite, webpack, Rollup, or esbuild — no file written to disk.
  - title: JSDoc @default comments
    details: Every generated key carries the property's declared CSS value as a JSDoc comment, so your editor shows it on hover and autocomplete.
  - title: Five naming conventions
    details: camelCase, snake_case, kebab-case, CONSTANT_CASE, and PascalCase — pick whichever fits your codebase.
  - title: CSS, SCSS, and Less
    details: Scans :root blocks (and any extra selectors you add, like .dark) across all three formats.
  - title: --check for CI
    details: Catch a stale committed cssVars.ts before it ships — checkGenerated()/--check compares in-memory without writing.
  - title: Watch mode
    details: Regenerate on file change via --watch on the CLI, or automatically through the bundler's own dev server with the plugin.
---
