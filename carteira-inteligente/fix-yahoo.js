const fs = require('fs');
const path = require('path');

const actionsContent = `'use server';

import yahooFinance from 'yahoo-finance2';

export async function fetchStockData(ticker: string) {
  if (!ticker) return { error: 'Ticker vazio' };

  // Normalização para B3
  let symbol = ticker.toUpperCase().trim();
  if (!symbol.endsWith('.SA')) {
    symbol += '.SA';
  }

  try {
    // --- A CORREÇÃO ESTÁ AQUI ---
    // Adicionamos { validateResult: false } para evitar o erro "Call new YahooFinance first"
    // Isso diz para a lib: "Apenas pegue os dados, não valide meu ambiente".
    const quote = await yahooFinance.quote(symbol, { validateResult: false });
    
    if (!quote || !quote.regularMarketPrice) {
      return { error: 'Ativo não encontrado ou sem liquidez.' };
    }

    const currentPrice = quote.regularMarketPrice;

    // Tentativa de pegar dividendo (Logica defensiva)
    let averageDividend = 0;
    
    if (quote.trailingAnnualDividendRate) {
      averageDividend = quote.trailingAnnualDividendRate / 12;
    } 

    return {
      success: true,
      ticker: quote.symbol.replace('.SA', ''), 
      price: currentPrice,
      dividend: averageDividend, 
      name: quote.longName || quote.shortName || symbol
    };

  } catch (error: any) {
    // Log do erro real no terminal para debug se precisar
    console.error("Erro Yahoo Interno:", error.message); 
    
    return { 
      error: 'Não foi possível buscar este ativo. Tente preencher manualmente.' 
    };
  }
}
`;

function applyFix() {
  console.log('\\x1b[36m%s\\x1b[0m', '🔧 Aplicando correção no Yahoo Finance...');
  
  try {
    fs.writeFileSync(path.join('app', 'actions.ts'), actionsContent);
    console.log('✅ Arquivo app/actions.ts corrigido com sucesso.');
    console.log('\\n\\x1b[32m%s\\x1b[0m', 'Pode rodar "npm run dev" novamente!');
  } catch (error) {
    console.error('❌ Erro ao salvar arquivo:', error);
  }
}

applyFix();