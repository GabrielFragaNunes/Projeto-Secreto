import type { User } from '@supabase/supabase-js';

const ASSET_CLASSES = new Set(['FIIs', 'Ações', 'Tesouro', 'ETF', 'FIAGRO', 'Renda Fixa']);

export type UserPositionInput = {
  ticker: string;
  classe: string;
  segmento: string;
  quantidade: number;
  preco_medio: number;
  preco_atual: number;
  habilitado_aporte: boolean;
  preco_teto_manual: number | null;
  nota_pessoal: string | null;
};

export function parseUserPosition(value: unknown): UserPositionInput | null {
  if (!isRecord(value)) return null;
  const ticker = typeof value.ticker === 'string' ? value.ticker.trim().toUpperCase() : '';
  const classe = typeof value.classe === 'string' ? value.classe : '';
  const segmento = typeof value.segmento === 'string' ? value.segmento.trim() : 'Outros';
  const quantidade = value.quantidade;
  const precoMedio = value.preco_medio;
  const precoAtual = value.preco_atual;
  const precoTeto = value.preco_teto_manual;
  const habilitado = value.habilitado_aporte;
  const nota = value.nota_pessoal;

  if (
    !ticker
    || !ASSET_CLASSES.has(classe)
    || !isNonNegativeNumber(quantidade)
    || (precoMedio !== null && precoMedio !== undefined && !isNonNegativeNumber(precoMedio))
    || !isNonNegativeNumber(precoAtual)
    || (precoTeto !== null && precoTeto !== undefined && !isNonNegativeNumber(precoTeto))
    || (habilitado !== undefined && typeof habilitado !== 'boolean')
    || (nota !== null && nota !== undefined && typeof nota !== 'string')
  ) {
    return null;
  }

  return {
    ticker,
    classe,
    segmento: segmento || 'Outros',
    quantidade,
    preco_medio: precoMedio ?? 0,
    preco_atual: precoAtual,
    habilitado_aporte: habilitado ?? true,
    preco_teto_manual: precoTeto ?? null,
    nota_pessoal: nota ?? null,
  };
}

export function toPositionRow(position: UserPositionInput, user: User) {
  return { ...position, user_id: user.id };
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
