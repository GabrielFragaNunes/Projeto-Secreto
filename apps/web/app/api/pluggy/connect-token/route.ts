import {
  createPluggyClient,
  isOpenFinanceEnabled,
  openFinanceDisabledResponse,
  pluggyFailureResponse,
} from '@/lib/pluggy/server';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  if (!isOpenFinanceEnabled()) return openFinanceDisabledResponse();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: 'O corpo da solicitação deve ser JSON válido.' }, { status: 400 });
    }
    throw error;
  }

  const clientUserId = isRecord(payload) && typeof payload.clientUserId === 'string'
    ? payload.clientUserId.trim()
    : '';
  if (!clientUserId) {
    return Response.json({ error: 'clientUserId é obrigatório.' }, { status: 422 });
  }

  try {
    const token = await createPluggyClient().createConnectToken(undefined, { clientUserId });
    return Response.json({ accessToken: token.accessToken });
  } catch (error) {
    return pluggyFailureResponse(error, 'connect-token');
  }
}
