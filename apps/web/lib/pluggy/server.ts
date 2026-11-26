import 'server-only';
import { PluggyClient } from 'pluggy-sdk';

export class PluggyConfigurationError extends Error {}

export class PluggyPersistenceUnavailableError extends Error {}

export interface PluggyConnectionRecord {
  itemId: string;
  institutionName: string | null;
  connectedAt: string;
}

export interface PluggyConnectionRepository {
  list(): Promise<PluggyConnectionRecord[]>;
  upsert(connection: PluggyConnectionRecord): Promise<PluggyConnectionRecord>;
  remove(itemId?: string): Promise<PluggyConnectionRecord[]>;
}

export const pluggyConnectionRepository: PluggyConnectionRepository = {
  async list() {
    throw new PluggyPersistenceUnavailableError('Repositório de conexões não configurado.');
  },
  async upsert() {
    throw new PluggyPersistenceUnavailableError('Repositório de conexões não configurado.');
  },
  async remove() {
    throw new PluggyPersistenceUnavailableError('Repositório de conexões não configurado.');
  },
};

export function isOpenFinanceEnabled(): boolean {
  return process.env.ENABLE_OPEN_FINANCE === 'true';
}

export function openFinanceDisabledResponse(): Response {
  return Response.json(
    { error: 'Recurso disponível no plano Pro Sync / Add-on. Open Finance está desativado.' },
    { status: 501 },
  );
}

export function createPluggyClient(): PluggyClient {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new PluggyConfigurationError('Credenciais do Pluggy não configuradas no servidor.');
  }
  return new PluggyClient({ clientId, clientSecret });
}

export function pluggyFailureResponse(
  error: unknown,
  operation: string,
): Response {
  if (error instanceof PluggyConfigurationError) {
    return Response.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof PluggyPersistenceUnavailableError) {
    return Response.json(
      { error: 'Persistência de conexões ainda não está configurada para banco de dados.' },
      { status: 503 },
    );
  }
  console.error(`Falha no endpoint Pluggy (${operation}):`, error instanceof Error ? error.name : 'erro desconhecido');
  return Response.json(
    { error: 'Não foi possível concluir a solicitação ao Pluggy.' },
    { status: 502 },
  );
}
