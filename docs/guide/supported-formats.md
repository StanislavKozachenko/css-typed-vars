# Supported formats

| Format | Extension |
|--------|-----------|
| CSS | `.css` |
| SCSS | `.scss` |
| Less | `.less` |

By default, variables are scanned from `:root {}` blocks (including attribute selectors like `:root[data-theme="dark"]`) and Tailwind CSS v4's `@theme {}` blocks. Use the `selectors` option to also pick up variables from other selectors such as `.dark` or `[data-theme="dark"]` — see [Naming conventions](/guide/naming-conventions) and the [CLI](/guide/cli)/[Plugin](/guide/plugin) option tables for how to pass it.
