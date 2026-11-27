import {
  createPluggyClient,
  isOpenFinanceEnabled,
  openFinanceDisabledResponse,
  pluggyFailureResponse,
} from '@/lib/pluggy/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isOpenFinanceEnabled()) return openFinanceDisabledResponse();
  const query = new URL(request.url).searchParams;
  const accountId = query.get('accountId')?.trim();
  if (!accountId) {
    return Response.json({ error: 'accountId é obrigatório.' }, { status: 422 });
  }

  const dateFrom = query.get('dateFrom')?.trim();
  if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    return Response.json({ error: 'dateFrom deve usar o formato AAAA-MM-DD.' }, { status: 422 });
  }

  try {
    const transactions = await createPluggyClient().fetchAllTransactions(
      accountId,
      dateFrom ? { dateFrom } : undefined,
    );
    return Response.json({ accountId, transactions, total: transactions.length });
  } catch (error) {
    return pluggyFailureResponse(error, 'transactions');
  }
}
