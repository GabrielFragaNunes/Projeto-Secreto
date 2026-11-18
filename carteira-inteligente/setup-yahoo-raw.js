const fs = require('fs');
const path = require('path');

const actionsContent = `'use server';

// ESTRATÉGIA: RAW FETCH NO YAHOO FINANCE
// Bate direto no endpoint JSON público, sem bibliotecas, sem scrapers pesados.

export async function fetchStockData(ticker: string) {
  if (!ticker) return { error: 'Ticker vazio' };

  // Normalização: Yahoo precisa do sufixo .SA para Brasil
  let cleanTicker = ticker.toUpperCase().trim();
  if (!cleanTicker.endsWith('.SA')) {
    cleanTicker += '.SA';
  }

  try {
    console.log(\`📡 Buscando dados brutos para: \${cleanTicker}\`);

    // URL mágica do Yahoo v8 (endpoint de charts que contém o preço atual)
    const url = \`https://query1.finance.yahoo.com/v8/finance/chart/\${cleanTicker}?interval=1d&range=1d\`;

    // User-Agent é essencial para o Yahoo não achar que somos um robô malicioso
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      next: { revalidate: 30 } // Cache de 30s
    });

    if (!response.ok) {
      console.error('Status Yahoo:', response.status);
      return { error: 'Ativo não encontrado na base do Yahoo.' };
    }

    const data = await response.json();

    // Navegação no JSON complexo do Yahoo
    const result = data.chart?.result?.[0];

    if (!result || !result.meta) {
      return { error: 'Dados inválidos retornados pelo Yahoo.' };
    }

    const meta = result.meta;
    
    // Tenta pegar o preço atual, ou o de fechamento
    const price = meta.regularMarketPrice || meta.chartPreviousClose || 0;
    const symbol = meta.symbol.replace('.SA', ''); // Remove o .SA para o usuário
    
    // Nome do ativo (às vezes vem curto, às vezes longo)
    // O Yahoo raw nem sempre manda o nome completo da empresa no chart,
    // então usamos o symbol como fallback.
    const name = symbol; 

    console.log(\`✅ Sucesso: \${symbol} - R$ \${price}\`);

    return {
      success: true,
      ticker: symbol,
      price: price,
      dividend: 0, // Yahoo Chart não traz dividendos detalhados, user preenche.
      name: name
    };

  } catch (error: any) {
    console.error("❌ Erro Yahoo Raw:", error.message);
    return { 
      error: 'Falha de conexão. Tente novamente em instantes.' 
    };
  }
}
`;

function fixYahooRaw() {
  console.log('\\x1b[36m%s\\x1b[0m', '🌐 Configurando acesso direto à API Yahoo (Raw JSON)...');
  
  try {
    fs.writeFileSync(path.join('app', 'actions.ts'), actionsContent);
    console.log('✅ app/actions.ts atualizado.');
    console.log('\\n\\x1b[32m%s\\x1b[0m', 'Pronto! Teste buscar "VISC11" ou "PETR4" novamente.');
    console.log('Dessa forma evitamos bloqueios de scraping e instabilidade da Brapi.');
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

fixYahooRaw();