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

// Cloudflare Web Analytics beacon token (cookieless). Set CF_BEACON_TOKEN in the build environment
// (GitHub Actions variable); with no token no analytics script is added.
const beacon = process.env.CF_BEACON_TOKEN;
const SITE = 'https://straatwijsheid.nl';
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Straatwijsheid',
  url: SITE + '/',
  description: 'What are Dutch streets named after? A person, a place or a thing: an open map and dataset.',
  inLanguage: 'en',
  license: 'https://creativecommons.org/licenses/by/4.0/',
};

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
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: SITE + '/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { property: 'og:site_name', content: 'Straatwijsheid' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: SITE + '/og.png' } },
        { tag: 'script', attrs: { type: 'application/ld+json' }, content: JSON.stringify(jsonLd) },
        ...(beacon
          ? [{ tag: 'script', attrs: { defer: true, src: 'https://static.cloudflareinsights.com/beacon.min.js', 'data-cf-beacon': JSON.stringify({ token: beacon }) } }]
          : []),
      ],
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
        { label: 'Privacy', slug: 'privacy' },
      ],
    }),
  ],
});
