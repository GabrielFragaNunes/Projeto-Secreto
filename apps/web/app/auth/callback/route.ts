import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const nextPath = requestUrl.searchParams.get('next');
  const safePath = nextPath?.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/';
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.redirect(new URL('/login?error=supabase_unavailable', requestUrl.origin));
  }
  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', requestUrl.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('Falha ao validar o link de acesso:', error.message);
    return NextResponse.redirect(new URL('/login?error=invalid_link', requestUrl.origin));
  }
  return NextResponse.redirect(new URL(safePath, requestUrl.origin));
}
