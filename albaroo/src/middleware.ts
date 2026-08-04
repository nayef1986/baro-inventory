import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const PUBLIC_PATHS = ['/login'];

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

function stripLocale(pathname: string) {
  const match = routing.locales.find((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  return match ? pathname.slice(`/${match}`.length) || '/' : pathname;
}

export async function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request);

  let response = intlResponse ?? NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const path = stripLocale(request.nextUrl.pathname);
  const isPublic = PUBLIC_PATHS.some((p) => path === p);

  if (!user && !isPublic) {
    const locale = request.nextUrl.pathname.split('/')[1] ?? routing.defaultLocale;
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isPublic) {
    const locale = request.nextUrl.pathname.split('/')[1] ?? routing.defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
