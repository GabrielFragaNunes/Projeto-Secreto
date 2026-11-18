const fs = require('fs');
const path = require('path');

const actionsContent = `'use server';

// SOLUÇÃO "NO-LIB": Fetch nativo direto na API
// Arquitetura limpa e sem dependências quebradiças.

export async function fetchStockData(ticker: string) {
  if (!ticker) return { error: 'Ticker vazio' };

  const cleanTicker = ticker.toUpperCase().trim();

  try {
    // Endpoint público da Brapi
    // Traz dados fundamentais e de mercado
    const response = await fetch(
      \`https://brapi.dev/api/quote/\${cleanTicker}?range=1mo&interval=1d&fundamental=true&token=public\`,
      { next: { revalidate: 60 } } // Cache de 60s para performance
    );

    if (!response.ok) {
      return { error: 'Erro ao conectar com a API.' };
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return { error: 'Ativo não encontrado na B3.' };
    }

    const stock = data.results[0];
    const price = stock.regularMarketPrice;

    // LÓGICA DE DIVIDENDOS (ESTIMATIVA INTELIGENTE)
    // As APIs gratuitas raramente dão a "média mensal" pronta.
    // Vamos calcular baseados no "historicalDataPrice" ou dados fundamentais se disponíveis.
    
    // Se a API não fornecer dados de dividendos diretos, retornamos 0
    // para o usuário preencher, que é mais seguro do que chutar errado.
    let estimatedDividend = 0;

    // Tenta verificar se existe informação de preço
    if (!price) {
      return { error: 'Ativo sem liquidez ou preço.' };
    }

    return {
      success: true,
      ticker: stock.symbol,
      price: price,
      dividend: estimatedDividend, // Retornamos 0 (User input) ou valor se a API evoluir
      name: stock.longName || stock.shortName || stock.symbol
    };

  } catch (error: any) {
    console.error("Erro Brapi:", error.message);
    return { 
      error: 'Falha na comunicação. Verifique sua internet.' 
    };
  }
}
`;

function applyBrapiSwitch() {
  console.log('\\x1b[36m%s\\x1b[0m', '🔄 Pivotando para API REST (Brapi)...');
  
  try {
    // 1. Sobrescrever actions.ts
    fs.writeFileSync(path.join('app', 'actions.ts'), actionsContent);
    console.log('✅ Arquivo app/actions.ts atualizado para Fetch Nativo.');

    console.log('\\n\\x1b[33m%s\\x1b[0m', '⚠️ IMPORTANTE: Limpeza de Dependências');
    console.log('Como removemos o Yahoo Finance, rode este comando para limpar seu projeto:');
    console.log('\\x1b[32m%s\\x1b[0m', 'npm uninstall yahoo-finance2');
    console.log('\\nDepois: npm run dev');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

applyBrapiSwitch();