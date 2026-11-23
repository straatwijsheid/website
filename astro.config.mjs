import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

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
        { label: 'Documentation', items: [{ autogenerate: { directory: 'docs' } }] },
      ],
    }),
  ],
});
