import { calculatePortfolioValue } from '@/lib/projection';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  if (!isRecord(body) || !Array.isArray(body.positions)) {
    return Response.json({ error: 'Informe as posições da carteira atual.' }, { status: 422 });
  }

  try {
    return Response.json({ patrimonio_atual_brl: calculatePortfolioValue(body.positions) });
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
