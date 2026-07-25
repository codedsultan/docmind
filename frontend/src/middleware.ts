import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_ROUTES = ['/documents', '/chat', '/notes', '/tasks', '/admin'];
const AUTH_ROUTES = ['/auth/login', '/auth/register'];

/** Decode the JWT payload (without verifying the signature) and check expiry. */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = parts[1];
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    );
    // Standard JWT exp is in seconds since epoch
    return decoded.exp * 1000 < Date.now();
  } catch {
    return true; // unparseable → treat as expired
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const rawToken = request.cookies.get('auth_token')?.value;
  const token = rawToken && !isTokenExpired(rawToken) ? rawToken : null;

  const isProtected = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route),
  );
  const isAuth = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  // If the cookie held an expired token, delete it from the response
  const response = NextResponse.next();
  if (rawToken && !token) {
    response.cookies.set('auth_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  if (isProtected && !token) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuth && token) {
    return NextResponse.redirect(new URL('/documents', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};