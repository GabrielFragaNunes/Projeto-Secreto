import { engineApiUrl, readEngineError } from '@/lib/engine-api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  try {
    const response = await fetch(engineApiUrl('/v1/aporte/simular'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    if (!response.ok) {
      const fallback = response.status === 422
        ? 'Os dados da simulação não passaram pela validação do motor.'
        : 'O motor não conseguiu concluir a simulação.';
      return Response.json({ error: await readEngineError(response, fallback) }, { status: response.status });
    }
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
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
}
