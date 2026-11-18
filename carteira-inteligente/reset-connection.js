const fs = require('fs');
const path = require('path');

const actionsContent = `'use server';

// ESTRATÉGIA: BRAPI NATIVA (SEM .SA FORÇADO)
// O usuário digita exatamente o que quer (ex: "PETR4", "HGLG11").
// A Brapi entende tickers brasileiros sem sufixo.

export async function fetchStockData(ticker: string) {
  if (!ticker) return { error: 'Ticker vazio' };

  // REMOVIDO: A lógica que forçava .SA
  // Agora enviamos o ticker "cru", apenas maiúsculo e sem espaços.
  const cleanTicker = ticker.toUpperCase().trim();

  try {
    console.log(\`📡 Buscando na Brapi: \${cleanTicker}\`);

    // Usamos revalidate: 0 para não fazer cache e evitar dados velhos em dev
    const response = await fetch(
      \`https://brapi.dev/api/quote/\${cleanTicker}?range=1d&interval=1d&fundamental=true&token=public\`,
      { next: { revalidate: 0 } } 
    );

    if (!response.ok) {
      // Se a Brapi der erro, retornamos msg amigável
      return { error: 'Ativo não encontrado. Verifique o código.' };
    }

    const data = await response.json();

    // Validação de segurança
    if (!data.results || data.results.length === 0) {
      return { error: 'Código inválido ou não encontrado.' };
    }

    const stock = data.results[0];

    // Fallback de Preço: Tenta preço atual -> Fechamento anterior -> 0
    const price = stock.regularMarketPrice || stock.regularMarketPreviousClose || 0;

    console.log(\`✅ Sucesso: \${stock.symbol} - R$ \${price}\`);

    return {
      success: true,
      ticker: stock.symbol,
      price: price,
      dividend: 0, // Mantemos zero para preenchimento manual seguro
      name: stock.longName || stock.shortName || stock.symbol
    };

  } catch (error: any) {
    console.error("❌ Erro de Conexão:", error.message);
    return { 
      error: 'Erro de comunicação. Tente novamente.' 
    };
  }
}
`;

function resetConnection() {
  console.log('\\x1b[36m%s\\x1b[0m', '♻️ Removendo lógica do Yahoo e sufixo .SA...');
  
  try {
    fs.writeFileSync(path.join('app', 'actions.ts'), actionsContent);
    console.log('✅ app/actions.ts limpo e restaurado para Brapi.');
    console.log('\\n\\x1b[32m%s\\x1b[0m', 'Teste agora com "VISC11" ou "MXRF11".');
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

resetConnection();