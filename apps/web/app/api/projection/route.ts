import { calculateProjection, type ProjectionInput, type ProjectionScenario } from '@/lib/projection';

const SCENARIOS: ProjectionScenario[] = ['conservador', 'base', 'otimista'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseProjectionInput(value: unknown): ProjectionInput | null {
  if (!isRecord(value) || !isRecord(value.annualRatesPercent)) return null;

  const annualRatesPercent = {} as Record<ProjectionScenario, number>;
  for (const scenario of SCENARIOS) {
    const rate = value.annualRatesPercent[scenario];
    if (!isFiniteNumber(rate)) return null;
    annualRatesPercent[scenario] = rate;
  }

  if (
    !isFiniteNumber(value.initialWealthBrl)
    || !isFiniteNumber(value.monthlyContributionBrl)
    || !isFiniteNumber(value.targetBrl)
    || !isFiniteNumber(value.startYear)
    || !Number.isInteger(value.startYear)
    || !isFiniteNumber(value.horizonYear)
    || !Number.isInteger(value.horizonYear)
  ) {
    return null;
  }

  return {
    initialWealthBrl: value.initialWealthBrl,
    monthlyContributionBrl: value.monthlyContributionBrl,
    targetBrl: value.targetBrl,
    startYear: value.startYear,
    horizonYear: value.horizonYear,
    annualRatesPercent,
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: 'O corpo da solicitação deve ser JSON válido.' }, { status: 400 });
    }
    throw error;
  }

  const input = parseProjectionInput(body);
  if (!input) {
    return Response.json({ error: 'Informe valores numéricos válidos para a projeção.' }, { status: 422 });
  }

  try {
    return Response.json({ points: calculateProjection(input) });
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
