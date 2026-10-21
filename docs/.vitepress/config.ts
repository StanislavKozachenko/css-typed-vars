import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitepress';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export default defineConfig({
  title: 'css-typed-vars',
  description: 'Generate TypeScript typed constants from CSS custom properties',
  base: '/css-typed-vars/',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/css-typed-vars/logo.svg' }]],

  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'CLI', link: '/guide/cli' },
      { text: 'Plugin', link: '/guide/plugin' },
      {
        text: `v${version}`,
        items: [
          { text: 'Changelog', link: 'https://github.com/StanislavKozachenko/css-typed-vars/blob/main/CHANGELOG.md' },
          { text: 'npm', link: 'https://www.npmjs.com/package/css-typed-vars' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Naming conventions', link: '/guide/naming-conventions' },
          { text: 'Supported formats', link: '/guide/supported-formats' },
          { text: 'Design tokens', link: '/guide/design-tokens' },
        ],
      },
      {
        text: 'CLI',
        items: [
          { text: 'Flags & config file', link: '/guide/cli' },
        ],
      },
      {
        text: 'Plugin',
        items: [
          { text: 'Vite, webpack, Rollup, esbuild', link: '/guide/plugin' },
        ],
      },
      {
        text: 'API',
        items: [
          { text: 'Usage examples', link: '/guide/usage' },
          { text: 'Programmatic API', link: '/guide/programmatic-api' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/StanislavKozachenko/css-typed-vars' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/css-typed-vars' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Stanislav Kozachenko',
    },

    editLink: {
      pattern: 'https://github.com/StanislavKozachenko/css-typed-vars/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
});
