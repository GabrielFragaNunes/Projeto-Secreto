import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublicConfig } from '@/lib/supabase/config';

const PUBLIC_PATHS = new Set(['/login', '/auth/callback', '/api/pluggy/webhook']);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const config = getSupabasePublicConfig();
  if (!config || PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Não foi possível validar a sessão Supabase:', error.message);
  }
  if (user) return response;

  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'Sua sessão expirou. Entre novamente para continuar.' }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
