import { getSupabaseRequestContext } from '@/lib/supabase/request';
import { parseUserPosition, toPositionRow } from '@/lib/supabase/positions';
import { hasAcceptedCurrentTerms } from '@/lib/supabase/terms-server';

const POSITION_COLUMNS = 'id, ticker, classe, segmento, quantidade, preco_medio, preco_atual, habilitado_aporte, preco_teto_manual, nota_pessoal, updated_at';

export async function GET() {
  const context = await getSupabaseRequestContext();
  if (context.kind === 'unconfigured') {
    return Response.json({ configured: false, positions: [] });
  }
  if (context.kind === 'unauthenticated') {
    return Response.json({ error: 'Entre para carregar suas posições.' }, { status: 401 });
  }

  const { data, error } = await context.supabase
    .from('user_positions')
    .select(POSITION_COLUMNS)
    .eq('user_id', context.user.id)
    .order('ticker');
  if (error) {
    console.error('Falha ao carregar posições do usuário:', error.message);
    return Response.json({ error: 'Não foi possível carregar suas posições.' }, { status: 500 });
  }
  return Response.json({ configured: true, positions: data });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: 'O corpo da solicitação deve ser JSON válido.' }, { status: 400 });
    }
    throw error;
  }
  const position = parseUserPosition(payload);
  if (!position) {
    return Response.json({ error: 'Informe ticker, classe, quantidade e preços válidos.' }, { status: 422 });
  }

  const context = await getSupabaseRequestContext();
  if (context.kind === 'unconfigured') {
    return Response.json({ configured: false, persisted: false, position });
  }
  if (context.kind === 'unauthenticated') {
    return Response.json({ error: 'Entre para salvar suas posições.' }, { status: 401 });
  }
  const terms = await hasAcceptedCurrentTerms(context.supabase, context.user);
  if (terms.error) {
    console.error('Falha ao verificar os termos antes de salvar a posição:', terms.error);
    return Response.json({ error: 'Não foi possível verificar o aceite regulatório.' }, { status: 500 });
  }
  if (!terms.accepted) {
    return Response.json({ error: 'Confirme os termos de primeiro acesso antes de salvar posições.' }, { status: 403 });
  }

  const { data, error } = await context.supabase
    .from('user_positions')
    .upsert(toPositionRow(position, context.user), { onConflict: 'user_id,ticker' })
    .select(POSITION_COLUMNS)
    .single();
  if (error) {
    console.error('Falha ao salvar a posição:', error.message);
    return Response.json({ error: 'Não foi possível salvar a posição.' }, { status: 500 });
  }
  return Response.json({ configured: true, persisted: true, position: data });
}
