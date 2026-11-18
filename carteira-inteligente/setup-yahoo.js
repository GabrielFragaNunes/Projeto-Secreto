const fs = require('fs');
const path = require('path');

// --- 1. LÓGICA DE SERVIDOR ROBUSTA (Yahoo Finance) ---
const actionsContent = `'use server';

import yahooFinance from 'yahoo-finance2';

export async function fetchStockData(ticker: string) {
  if (!ticker) return { error: 'Ticker vazio' };

  // Normalização para B3 (Yahoo exige .SA no final para ativos brasileiros)
  let symbol = ticker.toUpperCase().trim();
  if (!symbol.endsWith('.SA')) {
    symbol += '.SA';
  }

  try {
    // 1. Buscar Cotação Atual e Dados Básicos
    const quote = await yahooFinance.quote(symbol);
    
    if (!quote || !quote.regularMarketPrice) {
      return { error: 'Ativo não encontrado ou sem liquidez.' };
    }

    const currentPrice = quote.regularMarketPrice;

    // 2. Buscar Histórico para Calcular Dividendos (Últimos 12 meses)
    // Definimos um intervalo de 1 ano atrás até hoje
    const today = new Date();
    const lastYear = new Date();
    lastYear.setFullYear(today.getFullYear() - 1);

    const queryOptions = {
      period1: lastYear.toISOString().split('T')[0], // Data inicial (YYYY-MM-DD)
      period2: today.toISOString().split('T')[0],    // Data final
      interval: '1d',
      events: 'div' // Apenas dividendos
    };

    // O yahoo-finance2 tem métodos específicos para chart/historical
    // Às vezes o Yahoo falha em entregar dividendos de FIIs via API histórica.
    // Vamos tentar uma abordagem segura: Tentar pegar o 'trailingAnnualDividendRate' do quote primeiro.
    
    let averageDividend = 0;
    let method = '';

    // TENTATIVA 1: Dados consolidados do Quote (Mais rápido e confiável para Ações)
    if (quote.trailingAnnualDividendRate) {
      // Se o ativo informa quanto pagou no último ano, dividimos por 12
      averageDividend = quote.trailingAnnualDividendRate / 12;
      method = 'Baseado no DY Anual';
    } 
    // TENTATIVA 2: Se for FII, as vezes o trailing vem zerado, tentamos pegar o último provento conhecido
    else if (quote.regularMarketPreviousClose && quote.regularMarketPrice) {
       // Fallback: Se não temos dados de dividendos, retornamos 0 para o usuário preencher.
       // Infelizmente APIs gratuitas sofrem com dados de FIIs brasileiros específicos.
       averageDividend = 0;
    }

    return {
      success: true,
      ticker: quote.symbol.replace('.SA', ''), // Remove o .SA para mostrar bonito
      price: currentPrice,
      dividend: averageDividend, // Pode vir zero se a API não informar
      name: quote.longName || quote.shortName
    };

  } catch (error) {
    console.error("Erro Yahoo Finance:", error);
    return { error: 'Erro ao buscar dados. Verifique se o ticker está correto.' };
  }
}
`;

// --- 2. ATUALIZAÇÃO DO FRONTEND (app/page.tsx) ---
// Atualizamos para preencher o dividendo automaticamente se vier da API
const pageContent = `'use client';

import React, { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { fetchStockData } from '@/app/actions';
import { 
  TrendingUp, 
  PlusCircle, 
  Trash2, 
  Wallet, 
  CheckCircle2,
  Coins,
  Search,
  Loader2,
  Info
} from 'lucide-react';
import { PortfolioItem } from '@/types';

export default function PortfolioManager() {
  // --- STATE ---
  const [form, setForm] = useState({
    ticker: '',
    price: '',
    dividend: '',
    quantity: ''
  });
  const [assetName, setAssetName] = useState(''); // Novo: Nome da empresa
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);

  // --- HANDLERS ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSearchTicker = async () => {
    if (!form.ticker) return;
    
    setIsLoadingData(true);
    setAssetName(''); // Limpa nome anterior
    
    const result = await fetchStockData(form.ticker);
    setIsLoadingData(false);

    if (result.error) {
      alert(result.error);
    } else if (result.success) {
      setAssetName(result.name || '');
      setForm(prev => ({
        ...prev,
        ticker: result.ticker,
        price: result.price?.toFixed(2).replace('.', ',') || prev.price,
        // Se vier dividendo (maior que 0), preenche. Se não, mantém vazio para o user.
        dividend: result.dividend > 0 ? result.dividend.toFixed(2).replace('.', ',') : prev.dividend
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
      id: crypto.randomUUID(),
      ticker, price, dividend, quantity,
      magicNumber, missingShares, investmentNeeded, finalPatrimony, isSelfSustain, monthlyIncome
    };

    setPortfolio([...portfolio, newItem]);
    // Reset parcial (mantém ticker vazio)
    setForm({ ticker: '', price: '', dividend: '', quantity: '' });
    setAssetName('');
  };

  const handleRemove = (id: string) => {
    setPortfolio(portfolio.filter(item => item.id !== id));
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
            <p className="text-slate-500 text-xs mt-1">Market Data by Yahoo Finance™</p>
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

      <main className="max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* FORMULÁRIO */}
        <section className="lg:col-span-4">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-xl sticky top-32">
            <h2 className="text-lg font-semibold mb-5 flex items-center gap-2 text-white">
              <PlusCircle className="w-5 h-5 text-emerald-500" /> Novo Ativo
            </h2>
            
            <div className="space-y-4">
              <div className="group">
                <label className="text-xs font-medium text-slate-400 uppercase">Ticker</label>
                <div className="flex gap-2 mt-1">
                  <input 
                    name="ticker" value={form.ticker} onChange={handleChange}
                    placeholder="PETR4 / MXRF11" 
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 outline-none uppercase"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchTicker()}
                  />
                  <button 
                    onClick={handleSearchTicker}
                    disabled={isLoadingData || !form.ticker}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white p-3 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isLoadingData ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  </button>
                </div>
                {assetName && <p className="text-xs text-emerald-500/80 mt-2 truncate">{assetName}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase">Preço (R$)</label>
                  <input 
                    name="price" type="number" step="0.01" value={form.price} onChange={handleChange}
                    placeholder="0,00" 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase flex items-center justify-between">
                     Média Div. (Mensal)
                     <span title="Estimativa baseada no DY anual / 12" className="cursor-help"><Info className="w-3 h-3" /></span>
                  </label>
                  <input 
                    name="dividend" type="number" step="0.01" value={form.dividend} onChange={handleChange}
                    placeholder="0,00" 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 uppercase">Minhas Cotas</label>
                <input 
                  name="quantity" type="number" value={form.quantity} onChange={handleChange}
                  placeholder="0" 
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <button 
                onClick={handleAddAsset}
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 mt-4 shadow-lg shadow-emerald-900/20 active:scale-95"
              >
                <Wallet className="w-4 h-4" /> Calcular
              </button>
            </div>
          </div>
        </section>

        {/* TABELA */}
        <section className="lg:col-span-8 space-y-6">
          {portfolio.length === 0 ? (
            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-12 text-center flex flex-col items-center justify-center text-slate-500">
              <Coins className="w-16 h-16 mb-4 opacity-20" />
              <h3 className="text-lg font-medium text-slate-400">Comece sua Bola de Neve</h3>
              <p className="text-sm mt-2">Busque um ativo (ex: BBAZ11, ITUB4) para iniciar.</p>
            </div>
          ) : (
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                    <tr>
                      <th className="p-4 pl-6">Ativo</th>
                      <th className="p-4">Preço / Div Médio</th>
                      <th className="p-4 text-center">Posição</th>
                      <th className="p-4 text-center text-emerald-400">Meta</th>
                      <th className="p-4 text-right">Falta</th>
                      <th className="p-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {portfolio.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors group">
                        <td className="p-4 pl-6 font-bold text-white">{item.ticker}</td>
                        <td className="p-4">
                          <div className="text-slate-300">{formatCurrency(item.price)}</div>
                          <div className="text-xs text-emerald-500/80">Div: {formatCurrency(item.dividend)}</div>
                        </td>
                        <td className="p-4 text-center text-white">{item.quantity}</td>
                        <td className="p-4 text-center">
                           <span className={\`px-2 py-1 rounded text-xs font-bold \${item.isSelfSustain ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-300'}\`}>
                             {item.magicNumber}
                           </span>
                        </td>
                        <td className="p-4 text-right font-mono text-amber-400">
                          {item.isSelfSustain ? <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" /> : formatCurrency(item.investmentNeeded)}
                        </td>
                        <td className="p-4 text-center">
                          <button onClick={() => handleRemove(item.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
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

function setupYahooIntegration() {
  console.log('\\x1b[36m%s\\x1b[0m', '📈 Configurando Yahoo Finance API...');

  try {
    fs.writeFileSync(path.join('app', 'actions.ts'), actionsContent);
    console.log('✅ Backend (actions.ts) configurado para Yahoo.');

    fs.writeFileSync(path.join('app', 'page.tsx'), pageContent);
    console.log('✅ Frontend (page.tsx) atualizado.');

    console.log('\\n\\x1b[32m%s\\x1b[0m', 'Sucesso!');
    console.log('Lembre-se de rodar: npm install yahoo-finance2');
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

setupYahooIntegration();