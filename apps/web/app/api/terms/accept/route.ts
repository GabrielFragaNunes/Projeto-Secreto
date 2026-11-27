import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CURRENT_TERMS_VERSION } from '@/lib/supabase/terms';

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: 'A persistência Supabase não está configurada neste ambiente.' }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Entre novamente para confirmar os termos.' }, { status: 401 });
  }

  const { data: existingPolicy, error: readError } = await supabase
    .from('user_portfolio_policies')
    .select('metas_classe, metas_segmento, gatilhos_semaforo_fii')
    .eq('user_id', user.id)
    .maybeSingle();
  if (readError) {
    console.error('Falha ao carregar a política antes do aceite:', readError.message);
    return Response.json({ error: 'Não foi possível carregar as configurações da conta.' }, { status: 500 });
  }

  const acceptedAt = new Date().toISOString();
  const { error: saveError } = await supabase
    .from('user_portfolio_policies')
    .upsert({
      user_id: user.id,
      metas_classe: existingPolicy?.metas_classe ?? {},
      metas_segmento: existingPolicy?.metas_segmento ?? {},
      gatilhos_semaforo_fii: existingPolicy?.gatilhos_semaforo_fii ?? {},
      terms_version: CURRENT_TERMS_VERSION,
      terms_accepted_at: acceptedAt,
    }, { onConflict: 'user_id' });
  if (saveError) {
    console.error('Falha ao gravar o aceite regulatório:', saveError.message);
    return Response.json({ error: 'Não foi possível registrar o aceite. Tente novamente.' }, { status: 500 });
  }

  return Response.json({ terms_version: CURRENT_TERMS_VERSION, terms_accepted_at: acceptedAt });
}
