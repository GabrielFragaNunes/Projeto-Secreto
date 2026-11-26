import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CURRENT_TERMS_VERSION } from './terms';

export async function hasAcceptedCurrentTerms(
  supabase: SupabaseClient,
  user: User,
): Promise<{ accepted: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('user_portfolio_policies')
    .select('terms_version, terms_accepted_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return { accepted: false, error: error.message };
  return {
    accepted: data?.terms_version === CURRENT_TERMS_VERSION && Boolean(data.terms_accepted_at),
  };
}
