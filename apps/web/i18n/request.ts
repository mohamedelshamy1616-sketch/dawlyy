import { hasLocale, type AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

const loaders = {
  ar: {
    common: () => import('../messages/ar/common.json'),
    nav: () => import('../messages/ar/nav.json'),
    auth: () => import('../messages/ar/auth.json'),
    status: () => import('../messages/ar/status.json'),
    landing: () => import('../messages/ar/landing.json'),
    coach: () => import('../messages/ar/coach.json'),
    client: () => import('../messages/ar/client.json'),
    notFound: () => import('../messages/ar/notFound.json'),
    api: () => import('../messages/ar/api.json'),
  },
  en: {
    common: () => import('../messages/en/common.json'),
    nav: () => import('../messages/en/nav.json'),
    auth: () => import('../messages/en/auth.json'),
    status: () => import('../messages/en/status.json'),
    landing: () => import('../messages/en/landing.json'),
    coach: () => import('../messages/en/coach.json'),
    client: () => import('../messages/en/client.json'),
    notFound: () => import('../messages/en/notFound.json'),
    api: () => import('../messages/en/api.json'),
  },
} satisfies Record<(typeof routing.locales)[number], Record<string, () => Promise<{ default: AbstractIntlMessages }>>>;

/** doc §14 / P2B namespaces: assemble the selected locale's independent namespace files. */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: Object.fromEntries<AbstractIntlMessages>(await Promise.all(
      Object.entries(loaders[locale]).map(async ([namespace, load]) => [namespace, (await load()).default] as const),
    )),
  };
});
