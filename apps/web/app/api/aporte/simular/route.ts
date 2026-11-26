import { engineApiUrl, readEngineError } from '@/lib/engine-api';
import { getSupabaseRequestContext } from '@/lib/supabase/request';
import { parseUserPosition, toPositionRow, type UserPositionInput } from '@/lib/supabase/positions';
import { hasAcceptedCurrentTerms } from '@/lib/supabase/terms-server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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

  if (!isRecord(payload) || !isRecord(payload.policy) || !isRecord(payload.policy.metas_classe)) {
    return Response.json({ error: 'Informe posições e metas de classe válidas.' }, { status: 422 });
  }
  if (
    !Array.isArray(payload.positions)
    || typeof payload.aporte_disponivel !== 'number'
    || !Number.isFinite(payload.aporte_disponivel)
    || payload.aporte_disponivel < 0
  ) {
    return Response.json({ error: 'O aporte deve ser um valor numérico igual ou maior que zero.' }, { status: 422 });
  }

  const weights = Object.values(payload.policy.metas_classe);
  if (
    weights.length === 0
    || weights.some((weight) => typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0)
    || Math.round(weights.reduce<number>((total, weight) => total + Number(weight), 0) * 10000) !== 10000
  ) {
    return Response.json({ error: 'A soma das metas de classe deve ser exatamente 100%.' }, { status: 422 });
  }

  const context = await getSupabaseRequestContext();
  if (context.kind === 'unauthenticated') {
    return Response.json({ error: 'Entre para executar e registrar a simulação.' }, { status: 401 });
  }
  if (context.kind === 'authenticated') {
    const terms = await hasAcceptedCurrentTerms(context.supabase, context.user);
    if (terms.error) {
      console.error('Falha ao verificar os termos antes da simulação:', terms.error);
      return Response.json({ error: 'Não foi possível verificar o aceite regulatório.' }, { status: 500 });
    }
    if (!terms.accepted) {
      return Response.json({ error: 'Confirme os termos de primeiro acesso antes de simular.' }, { status: 403 });
    }
  }

  let response: Response;
  try {
    response = await fetch(engineApiUrl('/v1/aporte/simular'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return Response.json(
        { error: 'O motor de aportes está indisponível. Verifique se a API está em execução.' },
        { status: 503 },
      );
    }
    throw error;
  }

  if (!response.ok) {
    const fallback = response.status === 422
      ? 'Os dados da simulação não passaram pela validação do motor.'
      : 'O motor não conseguiu concluir a simulação.';
    return Response.json({ error: await readEngineError(response, fallback) }, { status: response.status });
  }

  const result: unknown = await response.json();
  if (
    !isRecord(result)
    || !isFiniteNumber(result.total_alocado)
    || !isFiniteNumber(result.troco_residual)
  ) {
    return Response.json({ error: 'O motor retornou um resultado de simulação inválido.' }, { status: 502 });
  }
  if (context.kind === 'unconfigured') {
    return Response.json(result, {
      headers: { 'X-Supabase-Persisted': 'false' },
    });
  }

  const parsedPositions = payload.positions.map(parseUserPosition);
  if (parsedPositions.some((position) => position === null)) {
    return Response.json({ error: 'Uma ou mais posições não podem ser salvas no histórico.' }, { status: 422 });
  }
  const positions = parsedPositions.filter((position): position is UserPositionInput => position !== null);
  const positionRows = positions.map((position) => toPositionRow(position, context.user));
  if (positionRows.length > 0) {
    const { error: positionsError } = await context.supabase
      .from('user_positions')
      .upsert(positionRows, { onConflict: 'user_id,ticker' });
    if (positionsError) {
      console.error('Falha ao persistir posições da simulação:', positionsError.message);
      return Response.json({ error: 'O cálculo foi concluído, mas não foi possível salvar as posições.' }, { status: 500 });
    }
  }

  const { data: existingPolicy, error: policyReadError } = await context.supabase
    .from('user_portfolio_policies')
    .select('terms_version, terms_accepted_at')
    .eq('user_id', context.user.id)
    .maybeSingle();
  if (policyReadError || !existingPolicy) {
    console.error('Falha ao carregar os termos para a auditoria:', policyReadError?.message ?? 'política ausente');
    return Response.json({ error: 'Não foi possível carregar as configurações para registrar a simulação.' }, { status: 500 });
  }

  const policy = isRecord(payload.policy) ? payload.policy : {};
  const thresholds = isRecord(policy.gatilhos_semaforo_fii) ? policy.gatilhos_semaforo_fii : {};
  const storedThresholds = {
    ...thresholds,
    acao_semaforo_vermelho: policy.acao_semaforo_vermelho ?? 'bloquear',
    reducao_semaforo_amarelo_pct: policy.reducao_semaforo_amarelo_pct ?? 50,
  };
  const segmentTargets = isRecord(policy.metas_segmento) ? policy.metas_segmento : {};
  const { error: policyError } = await context.supabase
    .from('user_portfolio_policies')
    .upsert({
      user_id: context.user.id,
      aporte_mensal_padrao_brl: payload.aporte_disponivel,
      metas_classe: policy.metas_classe,
      metas_segmento: segmentTargets,
      gatilhos_semaforo_fii: storedThresholds,
      terms_version: existingPolicy.terms_version,
      terms_accepted_at: existingPolicy.terms_accepted_at,
    }, { onConflict: 'user_id' });
  if (policyError) {
    console.error('Falha ao persistir as configurações da simulação:', policyError.message);
    return Response.json({ error: 'O cálculo foi concluído, mas não foi possível salvar as configurações.' }, { status: 500 });
  }

  const { error: auditError } = await context.supabase
    .from('audit_aporte_simulations')
    .insert({
      user_id: context.user.id,
      aporte_disponivel: payload.aporte_disponivel,
      total_alocado: result.total_alocado,
      troco_residual: result.troco_residual,
      policy_snapshot: policy,
      positions_snapshot: payload.positions,
      result_payload: result,
    });
  if (auditError) {
    console.error('Falha ao gravar a auditoria da simulação:', auditError.message);
    return Response.json({ error: 'O cálculo foi concluído, mas não foi possível gravar o histórico imutável.' }, { status: 500 });
  }

  return Response.json(result, { headers: { 'X-Supabase-Persisted': 'true' } });
}
