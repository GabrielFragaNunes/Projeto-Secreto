const fs = require('fs');
const path = require('path');

// --- 1. Definição da Interface (types/index.ts) ---
// Aqui definimos o "shape" dos dados para o TypeScript não reclamar e para termos intellisense.
const typesContent = `export interface PortfolioItem {
  id: string;
  ticker: string;
  price: number;
  dividend: number;
  quantity: number;
  // Campos Calculados (Regra de Negócio)
  magicNumber: number;
  missingShares: number;
  investmentNeeded: number;
  finalPatrimony: number;
  isSelfSustain: boolean;
  monthlyIncome: number;
}
`;

// --- 2. Definição da Interface Visual (app/page.tsx) ---
// Lógica completa: State, Cálculos Financeiros e UI com Tailwind.
const pageContent = `'use client';

import React, { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { 
  TrendingUp, 
  PlusCircle, 
  Trash2, 
  Wallet, 
  AlertCircle, 
  CheckCircle2,
  Coins,
  Target
} from 'lucide-react';
import { PortfolioItem } from '@/types';

export default function PortfolioManager() {
  // --- STATE MANAGEMENT ---
  const [form, setForm] = useState({
    ticker: '',
    price: '',
    dividend: '',
    quantity: ''
  });

  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);

  // --- HANDLERS & LOGIC ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAddAsset = () => {
    // Normalização de input (troca vírgula por ponto para cálculo)
    const price = parseFloat(form.price.replace(',', '.'));
    const dividend = parseFloat(form.dividend.replace(',', '.'));
    const quantity = parseInt(form.quantity);
    const ticker = form.ticker.toUpperCase().trim() || 'ATIVO ' + (portfolio.length + 1);

    // Validação básica
    if (isNaN(price) || isNaN(dividend) || isNaN(quantity) || price <= 0) {
      alert('Por favor, preencha valores válidos.');
      return;
    }

    // CÁLCULO DO NÚMERO MÁGICO (Core Business Logic)
    const magicNumber = Math.ceil(price / dividend);
    const missingShares = Math.max(0, magicNumber - quantity);
    const investmentNeeded = missingShares * price;
    const finalPatrimony = magicNumber * price;
    const isSelfSustain = quantity >= magicNumber;
    const monthlyIncome = quantity * dividend;

    const newItem: PortfolioItem = {
      id: crypto.randomUUID(),
      ticker,
      price,
      dividend,
      quantity,
      magicNumber,
      missingShares,
      investmentNeeded,
      finalPatrimony,
      isSelfSustain,
      monthlyIncome
    };

    setPortfolio([...portfolio, newItem]);
    setForm({ ticker: '', price: '', dividend: '', quantity: '' }); // Reset form
  };

  const handleRemove = (id: string) => {
    setPortfolio(portfolio.filter(item => item.id !== id));
  };

  // --- TOTAIS DO DASHBOARD ---
  const totalInvestmentNeeded = portfolio.reduce((acc, item) => acc + item.investmentNeeded, 0);
  const totalMonthlyIncome = portfolio.reduce((acc, item) => acc + item.monthlyIncome, 0);
  const totalInvested = portfolio.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
      
      {/* HEADER / DASHBOARD SUPERIOR */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10 backdrop-blur-md bg-opacity-80">
        <div className="max-w-7xl mx-auto p-4 md:p-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
              <TrendingUp className="w-6 h-6" /> Carteira Snowball
            </h1>
            <p className="text-slate-500 text-xs mt-1">Sistema de Gestão de Proventos</p>
          </div>
          
          <div className="flex gap-6 text-sm">
             <div className="text-right">
               <p className="text-slate-500 uppercase text-[10px] tracking-wider">Renda Mensal Estimada</p>
               <p className="text-emerald-400 font-bold text-lg">{formatCurrency(totalMonthlyIncome)}</p>
             </div>
             <div className="text-right border-l border-slate-700 pl-6">
               <p className="text-slate-500 uppercase text-[10px] tracking-wider">Falta para a Liberdade</p>
               <p className="text-amber-400 font-bold text-lg">{formatCurrency(totalInvestmentNeeded)}</p>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* --- COLUNA DA ESQUERDA: FORMULÁRIO --- */}
        <section className="lg:col-span-4">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-xl sticky top-32">
            <h2 className="text-lg font-semibold mb-5 flex items-center gap-2 text-white">
              <PlusCircle className="w-5 h-5 text-emerald-500" /> Novo Ativo
            </h2>
            
            <div className="space-y-4">
              <div className="group">
                <label className="text-xs font-medium text-slate-400 uppercase group-focus-within:text-emerald-500 transition-colors">Ticker</label>
                <input 
                  name="ticker" value={form.ticker} onChange={handleChange}
                  placeholder="Ex: HGLG11" 
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none uppercase transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="group">
                  <label className="text-xs font-medium text-slate-400 uppercase group-focus-within:text-emerald-500 transition-colors">Preço (R$)</label>
                  <input 
                    name="price" type="number" step="0.01" value={form.price} onChange={handleChange}
                    placeholder="0,00" 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="group">
                  <label className="text-xs font-medium text-slate-400 uppercase group-focus-within:text-emerald-500 transition-colors">Dividendo (R$)</label>
                  <input 
                    name="dividend" type="number" step="0.01" value={form.dividend} onChange={handleChange}
                    placeholder="0,00" 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="group">
                <label className="text-xs font-medium text-slate-400 uppercase group-focus-within:text-emerald-500 transition-colors">Minhas Cotas</label>
                <input 
                  name="quantity" type="number" value={form.quantity} onChange={handleChange}
                  placeholder="0" 
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>

              <button 
                onClick={handleAddAsset}
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 mt-4 shadow-lg shadow-emerald-900/20 active:scale-95"
              >
                <Wallet className="w-4 h-4" /> Calcular & Adicionar
              </button>
            </div>
          </div>
        </section>

        {/* --- COLUNA DA DIREITA: TABELA DE ATIVOS --- */}
        <section className="lg:col-span-8 space-y-6">
          
          {portfolio.length === 0 ? (
            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-12 text-center flex flex-col items-center justify-center text-slate-500">
              <Coins className="w-16 h-16 mb-4 opacity-20" />
              <h3 className="text-lg font-medium text-slate-400">Sua carteira está vazia</h3>
              <p className="text-sm max-w-xs mx-auto mt-2">Adicione seus ativos imobiliários ou ações ao lado para calcular o efeito bola de neve.</p>
            </div>
          ) : (
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                    <tr>
                      <th className="p-4 pl-6">Ativo</th>
                      <th className="p-4">Preço / Div</th>
                      <th className="p-4 text-center">Minha Posição</th>
                      <th className="p-4 text-center text-emerald-400">Meta (Magic #)</th>
                      <th className="p-4 text-right">Falta Investir</th>
                      <th className="p-4 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {portfolio.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors group">
                        <td className="p-4 pl-6">
                          <div className="font-bold text-white text-base">{item.ticker}</div>
                          <div className="text-xs text-slate-500">YOC: {((item.dividend / item.price) * 100).toFixed(2)}%</div>
                        </td>
                        
                        <td className="p-4">
                          <div className="text-slate-300">{formatCurrency(item.price)}</div>
                          <div className="text-xs text-emerald-500/80">Div: {formatCurrency(item.dividend)}</div>
                        </td>

                        <td className="p-4 text-center">
                           <div className="font-medium text-white">{item.quantity} cotas</div>
                           <div className="text-xs text-slate-500">{formatCurrency(item.monthlyIncome)}/mês</div>
                        </td>

                        <td className="p-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={\`px-2 py-1 rounded-md font-bold text-xs border \${
                              item.isSelfSustain 
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                                : 'bg-slate-800 border-slate-700 text-slate-300'
                            }\`}>
                              {item.magicNumber}
                            </span>
                            {item.isSelfSustain && <span className="text-[10px] text-emerald-500">Auto-sustentável</span>}
                          </div>
                        </td>

                        <td className="p-4 text-right font-mono">
                          {item.isSelfSustain ? (
                            <span className="inline-flex items-center gap-1 text-emerald-500 bg-emerald-500/5 px-2 py-1 rounded-full text-xs font-medium">
                              <CheckCircle2 className="w-3 h-3" /> Conquistado
                            </span>
                          ) : (
                            <div className="flex flex-col items-end">
                              <span className="text-amber-400 font-bold">{formatCurrency(item.investmentNeeded)}</span>
                              <span className="text-xs text-slate-500">Faltam {item.missingShares} cotas</span>
                            </div>
                          )}
                        </td>

                        <td className="p-4 text-center">
                          <button 
                            onClick={() => handleRemove(item.id)}
                            className="text-slate-600 hover:text-red-400 hover:bg-red-400/10 p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            title="Remover Ativo"
                          >
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

// --- 3. Função de Execução ---
function applyChanges() {
  console.log('\\x1b[36m%s\\x1b[0m', '⚡ Desenvolvedor Sênior atuando: Reescrevendo arquitetura...');

  try {
    // Garantir que a pasta types existe
    const typesDir = path.join('types');
    if (!fs.existsSync(typesDir)) {
      fs.mkdirSync(typesDir);
    }

    // Escrever Types
    fs.writeFileSync(path.join('types', 'index.ts'), typesContent);
    console.log('✅ Interface de Tipos (TypeScript) atualizada.');

    // Escrever Page
    fs.writeFileSync(path.join('app', 'page.tsx'), pageContent);
    console.log('✅ Front-end (Page.tsx) reescrito com sucesso.');

    console.log('\\n\\x1b[32m%s\\x1b[0m', 'Tudo pronto! O código está limpo e atualizado.');
    console.log('Pode verificar o navegador.');

  } catch (error) {
    console.error('❌ Erro ao escrever arquivos:', error.message);
  }
}

applyChanges();