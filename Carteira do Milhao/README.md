# Dashboard Financeiro - Patrimonio e Meta 2040

Dashboard em HTML, CSS e JavaScript (vanilla) para acompanhar patrimonio, alocacao e projecao de crescimento ate 2040.

## Arquivos

- `index.html`: dashboard completo com CSS e JS embutidos

## Deploy no GitHub Pages

1. Crie um repositorio no GitHub (exemplo: `dashboard-financeiro`).
2. Envie o arquivo `index.html` para a branch `main`.
3. Abra o repositorio em **Settings -> Pages**.
4. Em **Source**, selecione **Deploy from a branch**.
5. Escolha `main` e pasta `/ (root)`.
6. Salve e aguarde 1 a 2 minutos.
7. Acesse a URL publicada pelo GitHub Pages.

## Como atualizar os dados

Todos os dados ficam no bloco `<script>` do `index.html`.

1. Edite os arrays:
   - `stocks` para acoes
   - `fiis` para fundos imobiliarios
   - `otherAssets` para ETF, renda fixa, liquidez, cripto e outros
2. Se necessario, ajuste os metadados em `METADATA`:
   - `initialPatrimony`
   - `monthlyContribution`
   - `startAge`, `startYear`, `endYear`
3. Salve e recarregue a pagina no navegador.

## Como adicionar novos cenarios de projecao

A lista de cenarios fica no array `scenarios` dentro do `index.html`.

Exemplo:

```js
scenarios.push({
  nome: "Super Otimista",
  taxa: 0.011,
  aporte: 2600,
  cor: "#f43f5e"
});
```

Campos obrigatorios:

- `nome`: nome exibido no grafico
- `taxa`: taxa mensal em decimal (ex.: 0.007 = 0,7% a.m.)
- `aporte`: valor do aporte mensal
- `cor`: cor da linha no grafico

A tabela anual e o grafico de linhas sao recalculados automaticamente quando o dashboard inicia.

## Integração com Pluggy MCP

Conecte seu agente de IA à documentação viva e à referência de API da Pluggy para obter respostas fundamentadas com citações, sem precisar adivinhar ou consultar a documentação manualmente.

- URL do servidor: `https://mcp.pluggy.ai/mcp`
- Documentação: `https://docs.pluggy.ai/pt/docs/developer-tools/mcp`
- Conectar seu agente: `https://docs.pluggy.ai/pt/mcp#connect`

### VS Code

```bash
code --add-mcp '{"name":"pluggy-docs","type":"http","url":"https://mcp.pluggy.ai/mcp"}'
```

### Modo agente do GitHub Copilot

Adicione um arquivo `.vscode/mcp.json` no workspace com o seguinte conteúdo:

```json
{
  "servers": {
    "pluggy-docs": {
      "type": "http",
      "url": "https://mcp.pluggy.ai/mcp"
    }
  }
}
```

### Exemplos de perguntas

- "Por que o item abc-123 está falhando e o que o usuário deve fazer?"
- "Como está a saúde das minhas conexões neste mês vs. o mês passado?"
- "Quais instituições têm mais erros nas últimas 7 dias?"

Isso permite que o agente leia a documentação atualizada, consulte a API e responda com contexto técnico confiável, sem depender de memória ou suposições.

## Observacoes

- O dashboard usa Chart.js via CDN, sem necessidade de servidor local.
- Basta abrir `index.html` no navegador para visualizar os graficos.
- O botao **Exportar CSV** gera um arquivo com os ativos e resumo da carteira.
