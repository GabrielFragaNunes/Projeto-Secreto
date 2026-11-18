const fs = require('fs');
const path = require('path');

const actionsContent = `'use server';

export async function fetchStockData(ticker: string) {
  if (!ticker) return { error: 'Ticker vazio' };

  const cleanTicker = ticker.toUpperCase().trim();

  try {
    console.log(\`🔍 Buscando dados para: \${cleanTicker}\`); // Log para debug no terminal

    const response = await fetch(
      \`https://brapi.dev/api/quote/\${cleanTicker}?range=1d&interval=1d&fundamental=true&token=public\`,
      { next: { revalidate: 10 } } // Cache curto (10s) para tentar pegar dados frescos
    );

    if (!response.ok) {
      return { error: 'Erro de conexão com a API.' };
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return { error: 'Ativo não encontrado.' };
    }

    const stock = data.results[0];

    // --- LÓGICA DE FALLBACK INTELIGENTE ---
    // 1. Tenta o preço atual de mercado
    // 2. Se for null/undefined, tenta o fechamento anterior (Ontem)
    // 3. Se tudo falhar, retorna 0
    const price = stock.regularMarketPrice || stock.regularMarketPreviousClose || 0;

    console.log(\`✅ Dados encontrados. Preço: \${price}\`);

    return {
      success: true,
      ticker: stock.symbol,
      price: price,
      dividend: 0, // Mantemos 0 para o usuário preencher (segurança)
      name: stock.longName || stock.shortName || stock.symbol
    };

  } catch (error: any) {
    console.error("❌ Erro no Server Action:", error.message);
    return { 
      error: 'Falha ao processar dados do ativo.' 
    };
  }
}
`;

function fixPriceLogic() {
  console.log('\\x1b[36m%s\\x1b[0m', '🔧 Refinando lógica de preço (Fallback System)...');
  
  try {
    fs.writeFileSync(path.join('app', 'actions.ts'), actionsContent);
    console.log('✅ app/actions.ts atualizado.');
    console.log('\\n\\x1b[32m%s\\x1b[0m', 'Teste novamente com PETR4.');
    console.log('Agora, se o preço atual estiver zerado, ele pega o de ontem!');
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

fixPriceLogic();