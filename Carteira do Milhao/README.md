# Carteira do Milhão

Dashboard financeiro para acompanhar uma carteira de investimentos e visualizar uma projeção de patrimônio em direção à meta de R$ 1 milhão até 2040. A interface é feita em HTML, CSS e JavaScript; o projeto também inclui um servidor Node.js/Express que disponibiliza dados e integrações.

## O que o projeto oferece

- Resumo do patrimônio, da meta e dos aportes mensais.
- Gráficos de alocação por classe de ativo e de distribuição de FIIs por segmento.
- Projeções de crescimento em diferentes cenários, com gráfico e tabela anual.
- Lista dos principais ativos e exportação dos dados da carteira em CSV.
- Integração opcional com Pluggy para conectar instituições financeiras, consultar contas e carregar transações.

## Tecnologias

- HTML, CSS e JavaScript no dashboard (`index.html`), com Chart.js para os gráficos.
- Node.js e Express em `server.js`, para servir a aplicação e fornecer endpoints de API.
- SDK da Pluggy para criar tokens de conexão e consultar dados das conexões.

## Executar localmente

Requer Node.js e npm. Na pasta `Carteira do Milhao`:

```bash
npm install
npm start
```

Abra [http://localhost:3001](http://localhost:3001). A porta padrão é `3001` e pode ser alterada pela variável `PORT`.

Para habilitar a integração com Pluggy, configure `CLIENT_ID` e `CLIENT_SECRET` no ambiente do servidor (por exemplo, em um arquivo `.env` local, que não deve ser compartilhado nem enviado ao repositório). Mantenha essas credenciais exclusivamente no servidor. Sem elas, os recursos que dependem da API da Pluggy não estarão disponíveis.

## Dados e projeções

Os ativos, valores e parâmetros da carteira usados no dashboard estão definidos no código de `index.html` e nos dados servidos por `server.js`. Atualize esses valores conforme necessário e recarregue a página. Os resultados projetados dependem das premissas configuradas no projeto e não representam garantia de rendimento nem recomendação de investimento.

O dashboard pode ser publicado como conteúdo estático, mas os recursos de conexão bancária da Pluggy precisam de um servidor Node.js acessível, com as credenciais configuradas com segurança.

## Endpoints principais

- `GET /api/patrimonio`: dados da carteira e parâmetros do dashboard.
- `POST /api/connect-token`: cria um token temporário do Pluggy Connect.
- `/api/pluggy-status`: consulta e atualiza o estado das conexões.
- `GET /api/pluggy-accounts` e `GET /api/pluggy-transactions`: consulta contas e transações.
- `POST /api/webhooks/pluggy`: recebe eventos de webhook da Pluggy.
- `GET /api/pluggy-item`: consulta os detalhes de uma conexão.