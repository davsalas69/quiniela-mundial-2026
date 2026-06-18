import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'quiniela_session';

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get(COOKIE_NAME)?.value;

  const publicRoutes = ['/', '/login', '/login/admin', '/register', '/setup', '/predictions'];
  const isPublicRoute = publicRoutes.some(route => pathname === route);

  // Excluir recursos estáticos y assets internos
  const isAsset = pathname.startsWith('/_next') ||
                  pathname.startsWith('/api/cron') ||
                  pathname.includes('.') ||
                  pathname === '/favicon.ico';

  if (isAsset) {
    return NextResponse.next();
  }

  // Si no hay cookie y se intenta acceder a una ruta protegida -> redirigir al home con showAuth=true
  if (!sessionToken && !isPublicRoute) {
    const homeUrl = new URL('/', request.url);
    homeUrl.searchParams.set('showAuth', 'true');
    return NextResponse.redirect(homeUrl);
  }

  // Si hay cookie y se intenta acceder a /login, /login/admin o /register -> redirigir al home
  if (sessionToken && (pathname === '/login' || pathname === '/login/admin' || pathname === '/register')) {
    const homeUrl = new URL('/', request.url);
    return NextResponse.redirect(homeUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
