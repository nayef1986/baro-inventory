import { getRequestConfig } from 'next-intl/server';
import { routing, type AppLocale } from './routing';

function isSupportedLocale(value: string | undefined): value is AppLocale {
  return !!value && (routing.locales as readonly string[]).includes(value);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isSupportedLocale(requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../locales/${locale}.json`)).default
  };
});
