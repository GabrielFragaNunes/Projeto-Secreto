import {
  isOpenFinanceEnabled,
  openFinanceDisabledResponse,
} from '@/lib/pluggy/server';

export async function POST() {
  if (!isOpenFinanceEnabled()) return openFinanceDisabledResponse();
  return Response.json({ received: true, persisted: false }, { status: 200 });
}
