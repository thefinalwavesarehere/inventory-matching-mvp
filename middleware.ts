import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
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

  // Public API routes
  const publicApiRoutes = [
    '/api/auth/create-profile',
    '/api/auth/callback',
    '/api/cron',
    '/api/jobs',
    '/api/progress',
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
