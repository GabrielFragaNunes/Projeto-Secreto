import {
  isOpenFinanceEnabled,
  openFinanceDisabledResponse,
  pluggyConnectionRepository,
  pluggyFailureResponse,
  type PluggyConnectionRecord,
} from '@/lib/pluggy/server';

export async function GET() {
  if (!isOpenFinanceEnabled()) return openFinanceDisabledResponse();
  try {
    const connections = await pluggyConnectionRepository.list();
    return Response.json({
      connected: connections.length > 0,
      count: connections.length,
      connections,
    });
  } catch (error) {
    return pluggyFailureResponse(error, 'status');
  }
}

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

  const itemId = isRecord(payload) && typeof payload.itemId === 'string' ? payload.itemId.trim() : '';
  if (!itemId) return Response.json({ error: 'itemId é obrigatório.' }, { status: 422 });
  const institutionName = isRecord(payload) && typeof payload.institutionName === 'string'
    ? payload.institutionName.trim()
    : null;
  const connection: PluggyConnectionRecord = {
    itemId,
    institutionName: institutionName || null,
    connectedAt: new Date().toISOString(),
  };

  try {
    return Response.json(await pluggyConnectionRepository.upsert(connection));
  } catch (error) {
    return pluggyFailureResponse(error, 'status');
  }
}

export async function DELETE(request: Request) {
  if (!isOpenFinanceEnabled()) return openFinanceDisabledResponse();
  const itemId = new URL(request.url).searchParams.get('itemId')?.trim() || undefined;
  try {
    const connections = await pluggyConnectionRepository.remove(itemId);
    return Response.json({ connected: connections.length > 0, count: connections.length, connections });
  } catch (error) {
    return pluggyFailureResponse(error, 'status');
  }
}
