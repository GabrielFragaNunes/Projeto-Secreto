import 'server-only';

import { createSupabaseServerClient } from './server';

export async function getSupabaseRequestContext() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { kind: 'unconfigured' } as const;

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Falha ao validar a sessão Supabase na API:', error.message);
    return { kind: 'unauthenticated' } as const;
  }
  if (!user) return { kind: 'unauthenticated' } as const;
  return { kind: 'authenticated', supabase, user } as const;
}
