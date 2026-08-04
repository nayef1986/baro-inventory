import { defineRouting } from 'next-intl/routing';

// Phase 1 ships Arabic + English only (Section 8B.4 recommendation — Urdu/Hindi land
// in Phase 2 once the string set has settled). profiles.locale still accepts 'ur'/'hi'
// so Phase 2 doesn't need a migration, but the UI has no translations for them yet.
export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  localePrefix: 'always'
});

export type AppLocale = (typeof routing.locales)[number];
