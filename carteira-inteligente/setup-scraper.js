const fs = require('fs');
const path = require('path');

const actionsContent = `'use server';

import * as cheerio from 'cheerio';

// --- FUNÇÃO AUXILIAR: SCRAPER STATUS INVEST ---
async function scrapeStatusInvest(ticker: string, type: 'acoes' | 'fundos-imobiliarios') {
  try {
    const url = \`https://statusinvest.com.br/\${type}/\${ticker.toLowerCase()}\`;
    
    // Headers para tentar enganar o bloqueio (User-Agent de Chrome real)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      next: { revalidate: 30 }
    });

    if (!response.ok) throw new Error(\`Status \${response.status}\`);

    const html = await response.text();
    const $ = cheerio.load(html);

    // SELETORES (Baseados no layout do Status Invest)
    // Preço: div com title="Valor atual do ativo" -> strong com class "value"
    const priceStr = $('div[title="Valor atual do ativo"] strong.value').text();
    
    // Dividend Yield (Anual): div com title="Dividend Yield..." -> strong with class "value"
    const dyStr = $('div[title="Dividend Yield com base nos últimos 12 meses"] strong.value').text();

    if (!priceStr) throw new Error('Não conseguiu ler o preço (Layout mudou ou bloqueio).');

    // Conversão de String "10,50" para Number 10.50
    const price = parseFloat(priceStr.replace('.', '').replace(',', '.'));
    const dyPercent = parseFloat(dyStr.replace('.', '').replace(',', '').replace('%', ''));

    // Cálculo estimado do dividendo MENSAL (DY Anual / 12 meses * Preço)
    // Ex: 12% ao ano = 1% ao mês aprox.
    // Isso é mais preciso que pegar o último provento isolado que pode ser atípico.
    const estimatedMonthlyDividend = (price * (dyPercent / 100)) / 12;

    // Nome da Empresa
    const name = $('h1.title small').first().text() || ticker;

    return {
      success: true,
      ticker: ticker.toUpperCase(),
      price,
      dividend: estimatedMonthlyDividend,
      name,
      source: 'Status Invest'
    };

  } catch (error) {
    return { error: error.message };
  }
}

// --- FUNÇÃO PRINCIPAL ---
export async function fetchStockData(ticker: string) {
  if (!ticker) return { error: 'Ticker vazio' };

  const cleanTicker = ticker.trim();
  
  // --- ESTRATÉGIA DE ROTEAMENTO (Ações vs FIIs) ---
  // Tenta adivinhar se é FII ou Ação.
  // Geralmente FII termina em 11, mas algumas Ações (Units) também (ex: TAEE11).
  // Vamos tentar FII primeiro se terminar em 11, se falhar tenta Ação.
  // Para outros finais (3, 4), tenta Ação direto.

  let result = null;

  if (cleanTicker.endsWith('11') || cleanTicker.endsWith('11B')) {
    console.log(\`🕷️ Tentando Status Invest (FII): \${cleanTicker}\`);
    result = await scrapeStatusInvest(cleanTicker, 'fundos-imobiliarios');
    
    // Se falhar no FII (pode ser uma Unit tipo ALUP11), tenta como Ação
    if (result.error) {
       console.log(\`🕷️ Tentando Status Invest (Ação): \${cleanTicker}\`);
       result = await scrapeStatusInvest(cleanTicker, 'acoes');
    }
  } else {
    console.log(\`🕷️ Tentando Status Invest (Ação): \${cleanTicker}\`);
    result = await scrapeStatusInvest(cleanTicker, 'acoes');
  }

  // --- SUCESSO NO SCRAPING? ---
  if (result && result.success) {
    console.log('✅ Dados via Status Invest!');
    return result;
  }

  // --- FALLBACK PARA BRAPI (Se o Status Invest bloquear) ---
  console.log('⚠️ Falha no Scraping (Provável Bloqueio). Usando Fallback (Brapi)...');
  
  try {
    const response = await fetch(
      \`https://brapi.dev/api/quote/\${cleanTicker.toUpperCase()}?range=1d&interval=1d&fundamental=true&token=public\`,
      { next: { revalidate: 0 } }
    );
    const data = await response.json();
    const stock = data.results[0];
    const price = stock.regularMarketPrice || stock.regularMarketPreviousClose || 0;

    return {
      success: true,
      ticker: stock.symbol,
      price: price,
      dividend: 0, // Brapi Free não dá DY fácil, user preenche
      name: stock.longName,
      source: 'Brapi (Fallback)'
    };
  } catch (err) {
    return { error: 'Não foi possível obter dados em nenhuma fonte.' };
  }
}
`;

function setupScraper() {
  console.log('\\x1b[36m%s\\x1b[0m', '🕵️ Configurando Web Scraper do Status Invest...');
  
  try {
    fs.writeFileSync(path.join('app', 'actions.ts'), actionsContent);
    console.log('✅ app/actions.ts atualizado com lógica Scraper + Fallback.');
    console.log('\\n\\x1b[33m%s\\x1b[0m', '⚠️ ATENÇÃO:');
    console.log('O Status Invest bloqueia muitos IPs. Se der erro, o sistema usará a Brapi automaticamente.');
    console.log('Não esqueça de rodar: npm install cheerio');
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

setupScraper();