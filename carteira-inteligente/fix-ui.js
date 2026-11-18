const fs = require('fs');
const path = require('path');

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
  const [form, setForm] = useState({
    ticker: '',
    price: '',
    dividend: '',
    quantity: ''
  });
  const [assetName, setAssetName] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);

  // --- HANDLER INTELIGENTE PARA MOEDA ---
  // Permite digitar números e vírgulas, bloqueia letras
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Se for campo de texto normal (Ticker)
    if (name === 'ticker') {
      setForm({ ...form, [name]: value });
      return;
    }

    // Para campos numéricos (Price, Dividend, Quantity), permitimos vírgula e ponto
    // Regex: Aceita apenas números, vírgula e ponto
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
      
      // AQUI ESTÁ O SEGREDO:
      // O input agora é TEXT, então podemos passar a vírgula tranquilamente.
      const formattedPrice = result.price ? result.price.toFixed(2).replace('.', ',') : '';
      const formattedDividend = result.dividend > 0 ? result.dividend.toFixed(2).replace('.', ',') : '';

      setForm(prev => ({
        ...prev,
        ticker: result.ticker,
        price: formattedPrice,
        dividend: formattedDividend || prev.dividend // Mantém o que estava se vier vazio
      }));
    }
  };

  const handleAddAsset = () => {
    // Normaliza: troca vírgula por ponto para cálculo matemático
    const price = parseFloat(form.price.replace(',', '.'));
    const dividend = parseFloat(form.dividend.replace(',', '.'));
    const quantity = parseInt(form.quantity);
    const ticker = form.ticker.toUpperCase().trim() || 'ATIVO ' + (portfolio.length + 1);

    if (isNaN(price) || isNaN(dividend) || isNaN(quantity) || price <= 0) {
      alert('Por favor, preencha valores válidos.');
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
            <p className="text-slate-500 text-xs mt-1">Powered by Brapi.dev</p>
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
                    placeholder="PETR4" 
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
                  {/* MUDANÇA: type="text" e inputMode="decimal" */}
                  <input 
                    name="price" 
                    type="text" 
                    inputMode="decimal"
                    value={form.price} 
                    onChange={handleChange}
                    placeholder="0,00" 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase flex items-center justify-between">
                     Média Div. (Mensal)
                     <span title="Estimativa baseada em histórico" className="cursor-help"><Info className="w-3 h-3" /></span>
                  </label>
                  <input 
                    name="dividend" 
                    type="text" 
                    inputMode="decimal"
                    value={form.dividend} 
                    onChange={handleChange}
                    placeholder="0,00" 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 uppercase">Minhas Cotas</label>
                <input 
                  name="quantity" 
                  type="number" 
                  value={form.quantity} 
                  onChange={handleChange}
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

        <section className="lg:col-span-8 space-y-6">
          {portfolio.length === 0 ? (
            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-12 text-center flex flex-col items-center justify-center text-slate-500">
              <Coins className="w-16 h-16 mb-4 opacity-20" />
              <h3 className="text-lg font-medium text-slate-400">Comece sua Bola de Neve</h3>
              <p className="text-sm mt-2">Digite o ticker ao lado (ex: TAEE11, BBAS3) e clique na lupa.</p>
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

function fixUI() {
  console.log('\\x1b[36m%s\\x1b[0m', '🎨 Ajustando Inputs para aceitar vírgulas brasileiras...');
  
  try {
    fs.writeFileSync(path.join('app', 'page.tsx'), pageContent);
    console.log('✅ app/page.tsx atualizado.');
    console.log('\\n\\x1b[32m%s\\x1b[0m', 'Agora o campo "Preço" aceita vírgulas e será preenchido automaticamente!');
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

fixUI();