import { auth } from '@/auth';
import { NextResponse } from 'next/server';

// E2E bypass — only honoured when NODE_ENV !== 'production'. Lets Playwright
// hit pages without going through the credentials provider. Hard-fails in prod
// so a stray env var can't disable auth on a deployed environment.
const E2E_BYPASS =
  process.env.NODE_ENV !== 'production' && process.env.E2E_BYPASS_AUTH === '1';

// Gate every page on a valid session except auth flows + Next internals.
// Brief §12. JWT strategy means no per-request DB call.
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  if (!req.auth && !E2E_BYPASS) {
    const signIn = new URL('/api/auth/signin', req.nextUrl.origin);
    signIn.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
