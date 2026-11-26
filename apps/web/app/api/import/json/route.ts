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
    return Response.json({ error: 'Selecione um arquivo JSON da Carteira Snowball.' }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith('.json')) {
    return Response.json({ error: 'O arquivo deve ter extensão .json.' }, { status: 415 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: 'O arquivo JSON não pode exceder 5 MB.' }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: 'O arquivo não contém JSON válido.' }, { status: 422 });
    }
    throw error;
  }

  const records = Array.isArray(parsed) ? parsed : [parsed];
  if (records.length === 0) {
    return Response.json({ error: 'O arquivo não contém posições para importar.' }, { status: 422 });
  }
  const parsedPositions = records.map(parseSnowballPosition);
  const invalidIndex = parsedPositions.findIndex((position) => position === null);
  if (invalidIndex !== -1) {
    return Response.json(
      { error: `O registro ${invalidIndex + 1} está incompleto ou usa uma categoria não reconhecida.` },
      { status: 422 },
    );
  }

  const positions = parsedPositions.filter((position): position is UserPositionInput => position !== null);
  if (new Set(positions.map((position) => position.ticker)).size !== positions.length) {
    return Response.json(
      { error: 'O arquivo contém tickers repetidos. Consolide as linhas duplicadas e tente novamente.' },
      { status: 422 },
    );
  }

  const context = await getSupabaseRequestContext();
  if (context.kind === 'unconfigured') {
    return Response.json({ positions, persistence: { enabled: false } });
  }
  if (context.kind === 'unauthenticated') {
    return Response.json({ error: 'Entre para importar e salvar suas posições.' }, { status: 401 });
  }
  const terms = await hasAcceptedCurrentTerms(context.supabase, context.user);
  if (terms.error) {
    console.error('Falha ao verificar os termos antes da importação JSON:', terms.error);
    return Response.json({ error: 'Não foi possível verificar o aceite regulatório.' }, { status: 500 });
  }
  if (!terms.accepted) {
    return Response.json({ error: 'Confirme os termos de primeiro acesso antes de importar posições.' }, { status: 403 });
  }

  const persisted = await persistUserPositions(context.supabase, context.user, positions);
  if (persisted.error) {
    console.error('Falha ao persistir posições do arquivo JSON:', persisted.error);
    return Response.json({ error: 'Não foi possível salvar as posições importadas.' }, { status: 500 });
  }
  return Response.json({ positions: persisted.positions, persistence: { enabled: true } });
}

function parseSnowballPosition(value: unknown): UserPositionInput | null {
  if (!isRecord(value) || typeof value.category !== 'string') return null;
  const classe = mapCategoryToClass(value.category);
  if (!classe) return null;

  return parseUserPosition({
    ticker: value.ticker,
    classe,
    segmento: typeof value.segmento === 'string' ? value.segmento : 'Outros',
    quantidade: value.quantity,
    preco_medio: typeof value.averagePrice === 'number' ? value.averagePrice : 0,
    preco_atual: value.price,
    habilitado_aporte: true,
  });
}

function mapCategoryToClass(category: string): string | null {
  const normalized = category
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const categoryMap: Record<string, string> = {
    acoes: 'Ações',
    fii: 'FIIs',
    fiis: 'FIIs',
    fundosimobiliarios: 'FIIs',
    fiagro: 'FIAGRO',
    etf: 'ETF',
    tesouro: 'Tesouro',
    rendafixa: 'Renda Fixa',
  };
  return categoryMap[normalized] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
