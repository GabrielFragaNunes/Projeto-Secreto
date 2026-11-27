import { getSupabaseRequestContext } from '@/lib/supabase/request';
import { CURRENT_TERMS_VERSION } from '@/lib/supabase/terms';

export async function GET() {
  const context = await getSupabaseRequestContext();
  if (context.kind === 'unconfigured') {
    return Response.json({ configured: false, policy: null });
  }
  if (context.kind === 'unauthenticated') {
    return Response.json({ error: 'Entre para carregar suas configurações.' }, { status: 401 });
  }

  const { data, error } = await context.supabase
    .from('user_portfolio_policies')
    .select('meta_patrimonial_brl, aporte_mensal_padrao_brl, metas_classe, metas_segmento, gatilhos_semaforo_fii, terms_version, terms_accepted_at')
    .eq('user_id', context.user.id)
    .maybeSingle();
  if (error) {
    console.error('Falha ao carregar as configurações da carteira:', error.message);
    return Response.json({ error: 'Não foi possível carregar as configurações.' }, { status: 500 });
  }
  return Response.json({ configured: true, policy: data });
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
  if (!isRecord(payload)) {
    return Response.json({ error: 'Informe configurações válidas.' }, { status: 422 });
  }

  const aporte = payload.aporte_mensal_padrao_brl;
  const classTargets = isFractionMap(payload.metas_classe, true) ? payload.metas_classe : null;
  const segmentTargets = isFractionMap(payload.metas_segmento, false) ? payload.metas_segmento : null;
  const fiiThresholds = isRecord(payload.gatilhos_semaforo_fii) ? payload.gatilhos_semaforo_fii : null;
  if (
    typeof aporte !== 'number'
    || !Number.isFinite(aporte)
    || aporte < 0
    || !classTargets
    || !segmentTargets
    || !fiiThresholds
  ) {
    return Response.json({ error: 'Revise o aporte, as metas e os limiares informados.' }, { status: 422 });
  }

  const context = await getSupabaseRequestContext();
  if (context.kind === 'unconfigured') {
    return Response.json({ configured: false, saved: false });
  }
  if (context.kind === 'unauthenticated') {
    return Response.json({ error: 'Entre para salvar suas configurações.' }, { status: 401 });
  }

  const { data: existing, error: readError } = await context.supabase
    .from('user_portfolio_policies')
    .select('terms_version, terms_accepted_at')
    .eq('user_id', context.user.id)
    .maybeSingle();
  if (readError) {
    console.error('Falha ao verificar o aceite antes de salvar as configurações:', readError.message);
    return Response.json({ error: 'Não foi possível verificar o aceite regulatório.' }, { status: 500 });
  }
  if (existing?.terms_version !== CURRENT_TERMS_VERSION || !existing.terms_accepted_at) {
    return Response.json({ error: 'Confirme os termos de primeiro acesso antes de salvar.' }, { status: 403 });
  }

  const { data, error } = await context.supabase
    .from('user_portfolio_policies')
    .upsert({
      user_id: context.user.id,
      aporte_mensal_padrao_brl: aporte,
      metas_classe: classTargets,
      metas_segmento: segmentTargets,
      gatilhos_semaforo_fii: fiiThresholds,
      terms_version: existing.terms_version,
      terms_accepted_at: existing.terms_accepted_at,
    }, { onConflict: 'user_id' })
    .select('meta_patrimonial_brl, aporte_mensal_padrao_brl, metas_classe, metas_segmento, gatilhos_semaforo_fii')
    .single();
  if (error) {
    console.error('Falha ao salvar as configurações da carteira:', error.message);
    return Response.json({ error: 'Não foi possível salvar as configurações.' }, { status: 500 });
  }
  return Response.json({ configured: true, saved: true, policy: data });
}

function isFractionMap(value: unknown, requireTotal: boolean): value is Record<string, number> {
  if (!isRecord(value)) return false;
  const values = Object.values(value);
  if (requireTotal && values.length === 0) return false;
  const numbers = values.filter(
    (item): item is number => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 1,
  );
  if (numbers.length !== values.length) return false;
  return !requireTotal || Math.round(numbers.reduce((total, item) => total + item, 0) * 10000) === 10000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
