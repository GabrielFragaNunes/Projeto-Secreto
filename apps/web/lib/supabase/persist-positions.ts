import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { UserPositionInput } from './positions';
import { toPositionRow } from './positions';

export async function persistUserPositions(
  supabase: SupabaseClient,
  user: User,
  positions: UserPositionInput[],
): Promise<{ positions: UserPositionInput[]; error: null } | { positions: null; error: string }> {
  const { data: existingPositions, error: existingError } = await supabase
    .from('user_positions')
    .select('ticker, habilitado_aporte, preco_teto_manual, nota_pessoal')
    .eq('user_id', user.id)
    .in('ticker', positions.map((position) => position.ticker));
  if (existingError) return { positions: null, error: existingError.message };

  const existingByTicker = new Map((existingPositions ?? []).map((position) => [position.ticker, position]));
  const positionsWithMetadata = positions.map((position) => {
    const previous = existingByTicker.get(position.ticker);
    return {
      ...position,
      habilitado_aporte: previous?.habilitado_aporte ?? position.habilitado_aporte,
      preco_teto_manual: previous?.preco_teto_manual ?? position.preco_teto_manual,
      nota_pessoal: previous?.nota_pessoal ?? position.nota_pessoal,
    };
  });
  const rows = positionsWithMetadata.map((position) => toPositionRow(position, user));
  const { error: saveError } = await supabase
    .from('user_positions')
    .upsert(rows, { onConflict: 'user_id,ticker' });
  if (saveError) return { positions: null, error: saveError.message };

  return { positions: positionsWithMetadata, error: null };
}
