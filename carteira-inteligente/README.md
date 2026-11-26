# Carteira Inteligente

Aplicação web para organizar ativos de uma carteira e estimar a quantidade necessária para que os dividendos mensais de cada ativo cubram o valor de uma cota. A tela principal, chamada **Carteira Snowball**, também resume a renda mensal estimada e o valor que ainda falta investir para alcançar essa meta por ativo.

## O que o projeto oferece

- Cadastro manual de ativos por ticker, preço, dividendo mensal e quantidade.
- Consulta de preço e dividendo para tickers compatíveis, usando fontes externas conforme disponibilidade.
- Cálculo do número-meta de cotas (`preço ÷ dividendo mensal`, arredondado para cima), das cotas que faltam e do investimento estimado necessário.
- Edição e remoção de ativos da lista.
- Importação de planilhas Excel/CSV e arquivos JSON, e exportação da carteira para JSON.
- Resumo da renda mensal estimada e do investimento necessário para atingir as metas calculadas.

## Tecnologias

- Next.js 16 e React 19 com TypeScript.
- Tailwind CSS para estilos.
- `xlsx` para leitura de planilhas e `cheerio` para extração de dados de páginas externas.
- Consultas de dados de ativos ao Status Invest, Google Finance e Brapi, conforme disponibilidade.

## Executar localmente

Requer Node.js e npm. Na pasta `carteira-inteligente`:

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Para validar o projeto, também estão disponíveis:

```bash
npm run lint
npm run build
```

## Importação e persistência

Os dados importados ou cadastrados ficam no estado da aplicação em memória no navegador e não são gravados automaticamente em um banco de dados. Exporte a carteira para JSON para guardar uma cópia e importe esse arquivo novamente quando necessário. A importação de planilhas procura colunas de ativo/ticker e quantidade; preços e dividendos podem vir do arquivo ou ser consultados durante o processo.

## Observações

Os preços e dividendos consultados dependem de serviços externos e podem estar indisponíveis ou desatualizados. O cálculo usa o dividendo mensal informado e é apenas uma estimativa matemática; não constitui recomendação financeira nem garantia de rendimento.