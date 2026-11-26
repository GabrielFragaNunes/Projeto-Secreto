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
