# Projeto Secreto

Monorepo para a aplicação web e o motor Python determinístico. Os contratos JSON compartilhados ficam em `packages/contracts`.

## Desenvolvimento local

Requer Node.js/npm para a aplicação web e Docker com Docker Compose para executar o motor Python.

1. No terminal 1, inicie o serviço web:

   ```powershell
   Set-Location apps/web
   npm ci
   npm run dev
   ```

   A aplicação fica disponível em <http://localhost:3000>.

2. No terminal 2, na raiz do monorepo, inicie o motor:

   ```powershell
   docker compose up --build engine-py
   ```

   O serviço fica disponível em <http://localhost:8000>; alterações locais em `services/engine-py` são recarregadas automaticamente. A rota de saúde é <http://localhost:8000/health>.

Para encerrar o serviço Python, use `Ctrl+C` e execute `docker compose down` na raiz.

## Supabase

Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` em `apps/web/.env.local` com os dados públicos do projeto Supabase. Sem essas variáveis, a aplicação exibe um aviso e funciona em modo local, sem autenticação nem persistência remota.

Para aplicar o schema, execute o conteúdo de `supabase/migrations/202611250001_initial_schema.sql` no SQL Editor do projeto Supabase. Se preferir o CLI, inicialize e vincule o projeto antes de executar `supabase db push`. A migration ativa RLS; as operações autenticadas ficam limitadas ao usuário da sessão, e o histórico de simulações não permite atualização nem exclusão.
