import {
  createPluggyClient,
  isOpenFinanceEnabled,
  openFinanceDisabledResponse,
  pluggyFailureResponse,
} from '@/lib/pluggy/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isOpenFinanceEnabled()) return openFinanceDisabledResponse();
  const itemId = new URL(request.url).searchParams.get('itemId')?.trim();
  if (!itemId) {
    return Response.json({ error: 'itemId é obrigatório.' }, { status: 422 });
  }

  try {
    const page = await createPluggyClient().fetchAccounts(itemId);
    return Response.json({ itemId, accounts: page.results });
  } catch (error) {
    return pluggyFailureResponse(error, 'accounts');
  }
}
