import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Security headers applied to all responses
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // CSP: restrict sources; adjust script/style hashes as the app evolves
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-* needed for Next.js HMR; tighten in production
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://*.upstash.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  const supabase = createMiddlewareClient({ req, res });

  // Refresh session if expired - required for Server Components
  const { data: { session } } = await supabase.auth.getSession();

  const { pathname } = req.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = [
    '/login',
    '/auth/callback',
    '/auth/reset-password',
  ];

  // Public API routes (no session required at middleware level)
  // Auth is enforced inside each handler:
  //   /api/queue/dispatch  → QStash signature verification
  //   /api/jobs/*/process  → x-internal-call secret
  const publicApiRoutes = [
    '/api/auth/create-profile',
    '/api/auth/callback',
    '/api/cron',
    '/api/health',
    '/api/queue/dispatch',  // QStash webhook — no browser session
    '/api/jobs/',           // Internal process calls from dispatcher
  ];

  // Static assets
  const isPublicAsset = pathname.startsWith('/_next') || 
                        pathname.includes('.') ||
                        pathname === '/favicon.ico' ||
                        pathname === '/robots.txt';

  // Check if API route is public
  const isPublicApi = publicApiRoutes.some(route => pathname.startsWith(route));

  // Allow public routes, assets, and public API routes
  if (publicRoutes.includes(pathname) || isPublicAsset || isPublicApi) {
    return res;
  }

  // Redirect to login if no session
  if (!session) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
