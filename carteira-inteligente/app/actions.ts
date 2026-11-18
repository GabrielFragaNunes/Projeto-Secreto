'use server';

import * as cheerio from 'cheerio';

// --- LOGGER ---
export async function logToTerminal(message: any) {
  console.log('\x1b[33m[CLIENT LOG]\x1b[0m', message);
}

// --- SCRAPER STATUS INVEST (Atualizado com seu HTML) ---
async function scrapeStatusInvest(ticker: string, type: 'acoes' | 'fundos-imobiliarios') {
  try {
    const url = `https://statusinvest.com.br/${type}/${ticker.toLowerCase()}`;
    
    console.log(`🕷️ Acessando: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      next: { revalidate: 10 } // Cache curto
    });

    if (!response.ok) throw new Error(`Status ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);

    // 1. PEGAR O PREÇO ATUAL
    // Geralmente fica na div principal do topo
    const priceStr = $('div[title="Valor atual do ativo"] strong.value').text();

    // 2. PEGAR O DIVIDENDO MENSAL (Seu pedido específico)
    // Alvo: <div id="dy-info"> ... <strong class="value">1,1000</strong>
    let dividendStr = $('#dy-info strong.value').first().text();

    // Log para debug no terminal do servidor
    if (dividendStr) {
      console.log(`🎯 Achei dividendo via #dy-info: ${dividendStr}`);
    } else {
      // Fallback: Se não achar no #dy-info (comum em Ações), tenta pegar pelo DY anual
      // Mas a prioridade é o seu seletor.
      console.log('⚠️ Não achei #dy-info (pode ser Ação), tentando DY anual...');
      const dyAnnualStr = $('div[title="Dividend Yield com base nos últimos 12 meses"] strong.value').text();
      if (dyAnnualStr) {
        // Se pegou DY anual (ex: 12,00%), vamos calcular.
        // Mas se conseguirmos o valor direto é melhor.
        // Vamos retornar null aqui para a lógica abaixo decidir ou tratar diferentemente.
      }
    }

    if (!priceStr) throw new Error('Layout mudou ou bloqueio de IP.');

    // CONVERSÃO DE DADOS (PT-BR -> JS Number)
    const price = parseFloat(priceStr.replace('.', '').replace(',', '.'));
    
    let finalDividend = 0;

    if (dividendStr) {
      // Se achamos o "Último Rendimento" (Ex: "1,1000")
      finalDividend = parseFloat(dividendStr.replace('.', '').replace(',', '.'));
    } else {
       // Fallback para ações que não tem #dy-info: Calcula via DY Anual / 12
       const dyStr = $('div[title="Dividend Yield com base nos últimos 12 meses"] strong.value').text();
       const dyPercent = parseFloat(dyStr.replace('.', '').replace(',', '').replace('%', '')) || 0;
       finalDividend = (price * (dyPercent / 100)) / 12;
    }

    const name = $('h1.title small').first().text() || ticker;

    return {
      success: true,
      ticker: ticker.toUpperCase(),
      price,
      dividend: finalDividend,
      name,
      source: 'Status Invest'
    };

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar dados do ticker.';
    console.error(`❌ Erro Scraper (${ticker}):`, message);
    return { error: message };
  }
}

// --- FALLBACK: GOOGLE FINANCE ---
async function scrapeGoogleFinance(ticker: string) {
  try {
    const url = `https://www.google.com/finance/quote/${encodeURIComponent(ticker.toUpperCase())}:BVMF`;
    console.log(`🔎 Acessando Google Finance: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      },
      next: { revalidate: 10 }
    });

    if (!response.ok) throw new Error(`Status ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    const priceCandidates = [
      $('div[data-last-price]').attr('data-last-price'),
      $('meta[itemprop="price"]').attr('content'),
      $('div.YMlKec.fxKbKc').first().text(),
      $('div[data-value]').first().attr('data-value')
    ];
    const price = priceCandidates
      .map(value => value ? Number(value.replace(/[^\d,.-]/g, '').replace(',', '.')) : 0)
      .find(value => Number.isFinite(value) && value > 0) || 0;

    if (price <= 0) throw new Error('Preço não encontrado na página do Google Finance.');

    const name = $('div.zzDege').first().text().trim() || ticker.toUpperCase();
    return {
      success: true,
      ticker: ticker.toUpperCase(),
      price,
      dividend: 0,
      name,
      source: 'Google Finance'
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar no Google Finance.';
    console.error(`❌ Erro Google Finance (${ticker}):`, message);
    return { error: message };
  }
}

// --- FUNÇÃO PRINCIPAL ---
export async function fetchStockData(ticker: string) {
  if (!ticker) return { error: 'Ticker vazio' };
  const cleanTicker = ticker.trim();

  // Lógica de Roteamento
  // Se terminar em 11 ou 11B, assumimos FII primeiro (onde o #dy-info existe)
  if (cleanTicker.endsWith('11') || cleanTicker.endsWith('11B')) {
    let result = await scrapeStatusInvest(cleanTicker, 'fundos-imobiliarios');
    if (result.success) return result;
    
    // Se falhar, tenta como ação (Units)
    result = await scrapeStatusInvest(cleanTicker, 'acoes');
    if (result.success) return result;
  } else {
    // Ações (PETR4, VALE3)
    let result = await scrapeStatusInvest(cleanTicker, 'acoes');
    if (result.success) return result;
  }

  const googleResult = await scrapeGoogleFinance(cleanTicker);
  if (googleResult.success) return googleResult;

  // --- FALLBACK: BRAPI ---
  console.log('🔄 Usando Fallback (Brapi)...');
  try {
    const response = await fetch(
      `https://brapi.dev/api/quote/${cleanTicker.toUpperCase()}?range=1d&interval=1d&fundamental=true&token=public`,
      { next: { revalidate: 0 } }
    );
    const data = await response.json();
    const stock = data.results?.[0];
    
    if (!stock) return { error: 'Não encontrado' };

    const price = stock.regularMarketPrice || stock.regularMarketPreviousClose || 0;
    
    return {
      success: true,
      ticker: stock.symbol,
      price: price,
      dividend: 0, // Brapi free não dá o último dividendo fácil, user preenche
      name: stock.longName,
      source: 'Brapi (Fallback)'
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar dados.';
    console.error('❌ Erro no fallback do Brapi:', message);
    return { error: message };
  }
}
