const fs = require('fs');
const path = require('path');

// --- 1. CRIAR O LOGGER NO SERVER (actions.ts) ---
// Adicionamos uma função logToTerminal para enviar dados do front pro cmd
const actionsContent = `'use server';
import * as cheerio from 'cheerio';

// --- LOGGER PARA DEBUG (NOVO) ---
export async function logToTerminal(message: any) {
  console.log('\\x1b[33m[CLIENT LOG]\\x1b[0m', message);
}

// ... (MANTENDO O RESTO DA LÓGICA DE SCRAPER/BRAPI ABAIXO) ...

// --- SCRAPER E BRAPI (Lógica existente) ---
async function scrapeStatusInvest(ticker: string, type: 'acoes' | 'fundos-imobiliarios') {
  try {
    const url = \`https://statusinvest.com.br/\${type}/\${ticker.toLowerCase()}\`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      next: { revalidate: 30 }
    });
    if (!response.ok) throw new Error(\`Status \${response.status}\`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const priceStr = $('div[title="Valor atual do ativo"] strong.value').text();
    const dyStr = $('div[title="Dividend Yield com base nos últimos 12 meses"] strong.value').text();

    if (!priceStr) throw new Error('Não conseguiu ler o preço.');
    const price = parseFloat(priceStr.replace('.', '').replace(',', '.'));
    const dyPercent = parseFloat(dyStr.replace('.', '').replace(',', '').replace('%', '')) || 0;
    const estimatedMonthlyDividend = (price * (dyPercent / 100)) / 12;
    const name = $('h1.title small').first().text() || ticker;

    return { success: true, ticker: ticker.toUpperCase(), price, dividend: estimatedMonthlyDividend, name, source: 'Status Invest' };
  } catch (error) {
    return { error: error.message };
  }
}

export async function fetchStockData(ticker: string) {
  if (!ticker) return { error: 'Ticker vazio' };
  const cleanTicker = ticker.trim();
  
  // Tenta Scraper
  let result = null;
  if (cleanTicker.endsWith('11') || cleanTicker.endsWith('11B')) {
    result = await scrapeStatusInvest(cleanTicker, 'fundos-imobiliarios');
    if (result.error) result = await scrapeStatusInvest(cleanTicker, 'acoes');
  } else {
    result = await scrapeStatusInvest(cleanTicker, 'acoes');
  }
  if (result && result.success) return result;

  // Fallback Brapi
  try {
    const response = await fetch(
      \`https://brapi.dev/api/quote/\${cleanTicker.toUpperCase()}?range=1d&interval=1d&fundamental=true&token=public\`,
      { next: { revalidate: 0 } }
    );
    const data = await response.json();
    const stock = data.results?.[0];
    if(!stock) return { error: 'Não encontrado' };
    
    const price = stock.regularMarketPrice || stock.regularMarketPreviousClose || 0;
    return {
      success: true, ticker: stock.symbol, price: price, dividend: 0,
      name: stock.longName, source: 'Brapi (Fallback)'
    };
  } catch (err) {
    return { error: 'Erro geral.' };
  }
}
`;

// --- 2. ATUALIZAR O PAGE.TSX COM LOGS ---
const pageContent = `'use client';

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { formatCurrency } from '@/lib/utils';
import { fetchStockData, logToTerminal } from '@/app/actions'; // Importa o logger
import { 
  TrendingUp, PlusCircle, Trash2, Wallet, CheckCircle2, 
  Coins, Search, Loader2, Info, Upload, FileSpreadsheet 
} from 'lucide-react';
import { PortfolioItem } from '@/types';

export default function PortfolioManager() {
  const [form, setForm] = useState({ ticker: '', price: '', dividend: '', quantity: '' });
  const [assetName, setAssetName] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'ticker') {
      setForm({ ...form, [name]: value });
      return;
    }
    const cleanValue = value.replace(/[^0-9,.]/g, '');
    setForm({ ...form, [name]: cleanValue });
  };

  const handleSearchTicker = async () => {
    if (!form.ticker) return;
    setIsLoadingData(true);
    setAssetName('');
    const result = await fetchStockData(form.ticker);
    setIsLoadingData(false);
    if (result.error) {
      alert(result.error);
    } else if (result.success) {
      setAssetName(result.name || '');
      const formattedPrice = result.price ? result.price.toFixed(2).replace('.', ',') : '';
      const formattedDividend = result.dividend > 0 ? result.dividend.toFixed(2).replace('.', ',') : '';
      setForm(prev => ({
        ...prev,
        ticker: result.ticker,
        price: formattedPrice,
        dividend: formattedDividend || prev.dividend
      }));
    }
  };

  const handleAddAsset = () => {
    const price = parseFloat(form.price.replace(',', '.'));
    const dividend = parseFloat(form.dividend.replace(',', '.'));
    const quantity = parseInt(form.quantity);
    const ticker = form.ticker.toUpperCase().trim() || 'ATIVO ' + (portfolio.length + 1);

    if (isNaN(price) || isNaN(dividend) || isNaN(quantity) || price <= 0) {
      alert('Preencha valores válidos.');
      return;
    }
    const magicNumber = Math.ceil(price / dividend);
    const missingShares = Math.max(0, magicNumber - quantity);
    const investmentNeeded = missingShares * price;
    const finalPatrimony = magicNumber * price;
    const isSelfSustain = quantity >= magicNumber;
    const monthlyIncome = quantity * dividend;

    const newItem: PortfolioItem = {
      id: crypto.randomUUID(), ticker, price, dividend, quantity,
      magicNumber, missingShares, investmentNeeded, finalPatrimony, isSelfSustain, monthlyIncome
    };
    setPortfolio([...portfolio, newItem]);
    setForm({ ticker: '', price: '', dividend: '', quantity: '' });
    setAssetName('');
  };

  const handleRemove = (id: string) => {
    setPortfolio(portfolio.filter(item => item.id !== id));
  };

  // --- LÓGICA DE IMPORTAÇÃO COM DEBUG ---
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    // LOG INICIAL
    await logToTerminal(\`📂 Arquivo Recebido: \${file.name} (\${file.size} bytes)\`);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      
      const firstSheetName = workbook.SheetNames[0];
      await logToTerminal(\`📑 Aba Selecionada: \${firstSheetName}\`);
      
      const worksheet = workbook.Sheets[firstSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

      await logToTerminal(\`📊 Total de linhas cruas: \${rows.length}\`);
      if (rows.length > 0) {
        await logToTerminal(\`🔍 Exemplo da Linha 1 (HEADERS):\`);
        await logToTerminal(JSON.stringify(rows[0])); // Mostra as chaves exatas
      }

      setImportProgress({ current: 0, total: rows.length });
      const newItems: PortfolioItem[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        setImportProgress({ current: i + 1, total: rows.length });

        const keys = Object.keys(row);
        
        // Tenta achar as chaves
        const tickerKey = keys.find(k => /ativo|código|ticker|papel|negociação|produto/i.test(k));
        const qtyKey = keys.find(k => /quantidade|qtde|posi|total|disponível/i.test(k));

        if (!tickerKey || !qtyKey) {
          // LOG DE ERRO POR LINHA (Amostragem das 3 primeiras falhas)
          if (i < 3) await logToTerminal(\`⚠️ Linha \${i+1} Pulada: Não achei colunas. Chaves encontradas: \${keys.join(', ')}\`);
          continue;
        }

        const tickerRaw = row[tickerKey];
        const qtyRaw = row[qtyKey];

        if (!tickerRaw) {
          await logToTerminal(\`⚠️ Linha \${i+1}: Ticker vazio.\`);
          continue;
        }

        const ticker = tickerRaw.toString().split(' ')[0].toUpperCase().trim();
        const quantity = parseInt(qtyRaw.toString().replace('.', '').replace(',', '')) || 0;

        if (quantity <= 0) continue;

        // await logToTerminal(\`✅ Processando: \${ticker} - Qtd: \${quantity}\`);

        await new Promise(r => setTimeout(r, 300)); 
        const marketData = await fetchStockData(ticker);

        let price = 0;
        let dividend = 0;

        if (marketData.success) {
          price = marketData.price;
          dividend = marketData.dividend;
        }

        const safePrice = price || 0; 
        const safeDividend = dividend || 0.01; 
        const magicNumber = safePrice > 0 ? Math.ceil(safePrice / safeDividend) : 0;
        const missingShares = Math.max(0, magicNumber - quantity);
        const investmentNeeded = missingShares * safePrice;
        const finalPatrimony = magicNumber * safePrice;
        const isSelfSustain = quantity >= magicNumber && magicNumber > 0;
        const monthlyIncome = quantity * safeDividend;

        newItems.push({
          id: crypto.randomUUID(), ticker, price: safePrice, dividend: safeDividend, quantity,
          magicNumber, missingShares, investmentNeeded, finalPatrimony, isSelfSustain, monthlyIncome
        });
      }

      setPortfolio(prev => [...prev, ...newItems]);
      await logToTerminal(\`🚀 Importação Finalizada: \${newItems.length} ativos importados.\`);
      alert(\`Importação Excel concluída! \${newItems.length} ativos processados.\`);

    } catch (error: any) {
      await logToTerminal(\`❌ Erro Fatal: \${error.message}\`);
      alert('Erro ao ler o arquivo Excel.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const totalInvestmentNeeded = portfolio.reduce((acc, item) => acc + item.investmentNeeded, 0);
  const totalMonthlyIncome = portfolio.reduce((acc, item) => acc + item.monthlyIncome, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10 backdrop-blur-md bg-opacity-80">
        <div className="max-w-7xl mx-auto p-4 md:p-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
              <TrendingUp className="w-6 h-6" /> Carteira Snowball
            </h1>
            <p className="text-slate-500 text-xs mt-1">Debug Mode Ativado</p>
          </div>
          <div className="flex gap-6 text-sm">
             <div className="text-right">
               <p className="text-slate-500 uppercase text-[10px]">Renda Mensal</p>
               <p className="text-emerald-400 font-bold text-lg">{formatCurrency(totalMonthlyIncome)}</p>
             </div>
             <div className="text-right border-l border-slate-700 pl-6">
               <p className="text-slate-500 uppercase text-[10px]">Falta Investir</p>
               <p className="text-amber-400 font-bold text-lg">{formatCurrency(totalInvestmentNeeded)}</p>
             </div>
          </div>
        </div>
      </header>

      {isImporting && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
          <h3 className="text-xl font-bold text-white">Analisando Arquivo...</h3>
          <p className="text-slate-400 mt-2">Veja o seu Terminal (CMD) para os logs!</p>
        </div>
      )}

      <main className="max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <section className="lg:col-span-4 space-y-6">
          <div className="bg-gradient-to-br from-amber-900/20 to-slate-900 border border-amber-500/30 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
               <FileSpreadsheet className="w-24 h-24 text-amber-500" />
            </div>
            <h2 className="text-sm font-semibold mb-3 text-amber-300 flex items-center gap-2 relative z-10">
              <FileSpreadsheet className="w-4 h-4" /> Importar (Debug Mode)
            </h2>
            <p className="text-xs text-slate-400 mb-4 relative z-10">
              Os logs aparecerão no terminal onde você rodou 'npm run dev'.
            </p>
            <input type="file" accept=".xlsx, .xls, .csv" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
            <button onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="w-full bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 relative z-10">
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Selecionar Arquivo
            </button>
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-xl sticky top-32">
            <h2 className="text-lg font-semibold mb-5 flex items-center gap-2 text-white">
              <PlusCircle className="w-5 h-5 text-emerald-500" /> Adicionar Manual
            </h2>
            <div className="space-y-4">
              <div className="group">
                <label className="text-xs font-medium text-slate-400 uppercase">Ticker</label>
                <div className="flex gap-2 mt-1">
                  <input name="ticker" value={form.ticker} onChange={handleChange} placeholder="PETR4" className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 outline-none uppercase" onKeyDown={(e) => e.key === 'Enter' && handleSearchTicker()}/>
                  <button onClick={handleSearchTicker} disabled={isLoadingData || !form.ticker} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white p-3 rounded-lg transition-colors disabled:opacity-50">
                    {isLoadingData ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  </button>
                </div>
                {assetName && <p className="text-xs text-emerald-500/80 mt-2 truncate">{assetName}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-medium text-slate-400 uppercase">Preço (R$)</label><input name="price" type="text" inputMode="decimal" value={form.price} onChange={handleChange} placeholder="0,00" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"/></div>
                <div><label className="text-xs font-medium text-slate-400 uppercase">Div. Mensal</label><input name="dividend" type="text" inputMode="decimal" value={form.dividend} onChange={handleChange} placeholder="0,00" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"/></div>
              </div>
              <div><label className="text-xs font-medium text-slate-400 uppercase">Minhas Cotas</label><input name="quantity" type="number" value={form.quantity} onChange={handleChange} placeholder="0" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"/></div>
              <button onClick={handleAddAsset} className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 mt-4 shadow-lg shadow-emerald-900/20 active:scale-95">
                <Wallet className="w-4 h-4" /> Adicionar
              </button>
            </div>
          </div>
        </section>

        <section className="lg:col-span-8 space-y-6">
          {portfolio.length === 0 ? (
            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-12 text-center flex flex-col items-center justify-center text-slate-500 h-96">
              <FileSpreadsheet className="w-16 h-16 mb-4 opacity-20" />
              <h3 className="text-lg font-medium text-slate-400">Carteira Vazia</h3>
              <p className="text-sm mt-2 mb-6 max-w-xs mx-auto">Importe seu Excel ou use o modo manual.</p>
            </div>
          ) : (
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                    <tr><th className="p-4 pl-6">Ativo</th><th className="p-4">Preço / Div</th><th className="p-4 text-center">Posição</th><th className="p-4 text-center text-emerald-400">Meta</th><th className="p-4 text-right">Falta</th><th className="p-4"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {portfolio.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors group">
                        <td className="p-4 pl-6 font-bold text-white">{item.ticker}</td>
                        <td className="p-4">{item.price === 0 ? <span className="text-amber-500 text-xs font-bold bg-amber-500/10 px-2 py-1 rounded">Sem Preço</span> : <><div className="text-slate-300">{formatCurrency(item.price)}</div><div className="text-xs text-emerald-500/80">Div: {formatCurrency(item.dividend)}</div></>}</td>
                        <td className="p-4 text-center text-white">{item.quantity}</td>
                        <td className="p-4 text-center">{item.price > 0 && item.dividend > 0 ? <span className={\`px-2 py-1 rounded text-xs font-bold \${item.isSelfSustain ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-300'}\`}>{item.magicNumber}</span> : <span className="text-slate-600 text-xs">-</span>}</td>
                        <td className="p-4 text-right font-mono text-amber-400">{item.isSelfSustain ? <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" /> : formatCurrency(item.investmentNeeded)}</td>
                        <td className="p-4 text-center"><button onClick={() => handleRemove(item.id)} className="text-slate-600 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
`;

function setupDebug() {
  console.log('\\x1b[36m%s\\x1b[0m', '🐞 Ativando Modo Debug: Logs serão enviados para o Terminal!');
  try {
    fs.writeFileSync(path.join('app', 'actions.ts'), actionsContent);
    console.log('✅ app/actions.ts atualizado com Logger.');
    fs.writeFileSync(path.join('app', 'page.tsx'), pageContent);
    console.log('✅ app/page.tsx atualizado para enviar logs.');
    console.log('\\n\\x1b[32m%s\\x1b[0m', 'Reinicie o servidor e tente importar novamente!');
    console.log('Fique de olho AQUI no terminal.');
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

setupDebug();