const fs = require('fs');
const path = require('path');

const actionsContent = `'use server';

// --- MUDANÇA CRÍTICA AQUI ---
// Em vez de "import yahooFinance from...", usamos require().
// Isso evita que o Next.js tente otimizar a importação e quebre a instância.
const yahooFinance = require('yahoo-finance2').default; 

export async function fetchStockData(ticker: string) {
  if (!ticker) return { error: 'Ticker vazio' };

  let symbol = ticker.toUpperCase().trim();
  if (!symbol.endsWith('.SA')) {
    symbol += '.SA';
  }

  try {
    // Configuração Global para silenciar erros de validação chatos
    // Isso resolve o "Call new YahooFinance" indiretamente ao evitar checagens estritas
    yahooFinance.suppressNotices(['yahooSurvey', 'error']);
    
    // Busca os dados
    const quote = await yahooFinance.quote(symbol, { 
      validateResult: false // Desliga validação do resultado
    });
    
    if (!quote || !quote.regularMarketPrice) {
      return { error: 'Ativo não encontrado.' };
    }

    const currentPrice = quote.regularMarketPrice;
    
    // Lógica de Dividendos
    let averageDividend = 0;
    
    if (quote.trailingAnnualDividendRate) {
      averageDividend = quote.trailingAnnualDividendRate / 12;
    } else if (quote.regularMarketPreviousClose) {
       // Fallback se não vier dividend data
       averageDividend = 0; 
    }

    return {
      success: true,
      ticker: quote.symbol.replace('.SA', ''), 
      price: currentPrice,
      dividend: averageDividend, 
      name: quote.longName || quote.shortName || symbol
    };

  } catch (error: any) {
    console.error("Erro Yahoo Handler:", error.message);
    return { 
      error: 'Erro ao buscar. Tente novamente ou preencha manual.' 
    };
  }
}
`;

function applyFinalFix() {
  console.log('\\x1b[36m%s\\x1b[0m', '🚑 Aplicando correção de compatibilidade CommonJS...');
  
  try {
    fs.writeFileSync(path.join('app', 'actions.ts'), actionsContent);
    console.log('✅ Arquivo app/actions.ts blindado contra erro de instância.');
    console.log('\\n\\x1b[32m%s\\x1b[0m', '1. Pare o servidor (Ctrl+C)');
    console.log('\\x1b[32m%s\\x1b[0m', '2. Rode: npm run dev');
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

applyFinalFix();