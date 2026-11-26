import { engineApiUrl, readEngineError } from '@/lib/engine-api';
import { getSupabaseRequestContext } from '@/lib/supabase/request';
import { parseUserPosition, type UserPositionInput } from '@/lib/supabase/positions';
import { persistUserPositions } from '@/lib/supabase/persist-positions';
import { hasAcceptedCurrentTerms } from '@/lib/supabase/terms-server';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    if (error instanceof TypeError) {
      return Response.json({ error: 'Envie o arquivo como multipart/form-data.' }, { status: 400 });
    }
    throw error;
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'Selecione uma planilha XLSX para importar.' }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return Response.json({ error: 'O arquivo deve ter extensão .xlsx.' }, { status: 415 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: 'A planilha não pode exceder 5 MB.' }, { status: 413 });
  }

  const forwarded = new FormData();
  forwarded.append('file', file, file.name);
  let response: Response;
  try {
    response = await fetch(engineApiUrl('/v1/import/xlsx'), {
      method: 'POST',
      body: forwarded,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return Response.json(
        { error: 'O motor de importação está indisponível. Verifique se a API está em execução.' },
        { status: 503 },
      );
    }
    throw error;
  }

  if (!response.ok) {
    const message = await readEngineError(response, 'Não foi possível importar a planilha.');
    return Response.json({ error: message }, { status: response.status });
  }

  let imported: unknown;
  try {
    imported = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: 'O motor retornou uma resposta inválida para a planilha.' }, { status: 502 });
    }
    throw error;
  }
  if (!isRecord(imported) || !Array.isArray(imported.positions)) {
    return Response.json({ error: 'O motor retornou dados inválidos para a planilha.' }, { status: 502 });
  }

  const parsedPositions = imported.positions.map(parseUserPosition);
  if (parsedPositions.some((position) => position === null)) {
    return Response.json({ error: 'A planilha contém posições incompatíveis com o cadastro.' }, { status: 422 });
  }
  const positions = parsedPositions.filter((position): position is UserPositionInput => position !== null);
  const tickerSet = new Set(positions.map((position) => position.ticker));
  if (tickerSet.size !== positions.length) {
    return Response.json(
      { error: 'A planilha contém tickers repetidos. Consolide as linhas duplicadas e tente novamente.' },
      { status: 422 },
    );
  }

  const context = await getSupabaseRequestContext();
  if (context.kind === 'unconfigured') {
    return Response.json({ ...imported, persistence: { enabled: false } });
  }
  if (context.kind === 'unauthenticated') {
    return Response.json({ error: 'Entre para importar e salvar suas posições.' }, { status: 401 });
  }
  const terms = await hasAcceptedCurrentTerms(context.supabase, context.user);
  if (terms.error) {
    console.error('Falha ao verificar os termos antes da importação:', terms.error);
    return Response.json({ error: 'Não foi possível verificar o aceite regulatório.' }, { status: 500 });
  }
  if (!terms.accepted) {
    return Response.json({ error: 'Confirme os termos de primeiro acesso antes de importar posições.' }, { status: 403 });
  }

  const persisted = await persistUserPositions(context.supabase, context.user, positions);
  if (persisted.error) {
    console.error('Falha ao persistir posições importadas:', persisted.error);
    return Response.json({ error: 'Não foi possível salvar as posições importadas.' }, { status: 500 });
  }
  return Response.json({ ...imported, positions: persisted.positions, persistence: { enabled: true } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
