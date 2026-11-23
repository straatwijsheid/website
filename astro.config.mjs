import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import manifest from './scripts/docs-manifest.json' with { type: 'json' };

// Documentation sidebar: groups and order come from the same manifest the sync script uses.
const docGroups = manifest.groups.map((label) => ({
  label,
  items: [
    ...(label === manifest.groups[0] ? [{ slug: 'docs' }] : []),
    ...manifest.pages
      .filter((p) => p.group === label)
      .sort((x, y) => x.order - y.order)
      .map((p) => ({ slug: `docs/${p.slug}` })),
  ],
}));

// English is the primary language. Dutch is a future translation: add
// `nl: { label: 'Nederlands', lang: 'nl' }` under `locales` and put pages in src/content/docs/nl/.
export default defineConfig({
  site: 'https://straatwijsheid.nl',
  integrations: [
    starlight({
      title: 'Straatwijsheid',
      description: 'What are Dutch streets named after? A person, a place or a thing: an open map and dataset.',
      logo: { src: './branding/logo/mark.svg', alt: 'Straatwijsheid' },
      favicon: '/favicon.svg',
      defaultLocale: 'root',
      locales: { root: { label: 'English', lang: 'en' } },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/straatwijsheid' },
      ],
      customCss: [
        './branding/fonts.css',
        './branding/tokens.css',
        './src/styles/theme.css',
      ],
      sidebar: [
        { label: 'Map', slug: 'map' },
        { label: 'Take part', slug: 'meedoen' },
        { label: 'Documentation', items: docGroups },
      ],
    }),
  ],
});
