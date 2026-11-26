import { getSupabaseRequestContext } from '@/lib/supabase/request';

export async function GET() {
  const context = await getSupabaseRequestContext();
  if (context.kind === 'unconfigured') {
    return Response.json({ configured: false, simulations: [] });
  }
  if (context.kind === 'unauthenticated') {
    return Response.json({ error: 'Entre para consultar o histórico.' }, { status: 401 });
  }

  const { data, error } = await context.supabase
    .from('audit_aporte_simulations')
    .select('id, aporte_disponivel, total_alocado, troco_residual, result_payload, created_at')
    .eq('user_id', context.user.id)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) {
    console.error('Falha ao carregar o histórico de simulações:', error.message);
    return Response.json({ error: 'Não foi possível carregar o histórico.' }, { status: 500 });
  }
  return Response.json({ configured: true, simulations: data });
}
