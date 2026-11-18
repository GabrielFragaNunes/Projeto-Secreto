const fs = require('fs');
const path = require('path');

// --- 1. Novos Tipos (types/index.ts) ---
const typesContent = `export interface PortfolioItem {
  id: string;
  ticker: string;
  price: number;
  dividend: number;
  quantity: number;
  // Campos Calculados
  magicNumber: number;
  missingShares: number;
  investmentNeeded: number;
  finalPatrimony: number;
  isSelfSustain: boolean;
}
`;

// --- 2. Nova Lógica da Página (app/page.tsx) ---
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
  ArrowRight
} from 'lucide-react';
import { PortfolioItem } from '@/types';

export default function PortfolioManager() {
  // Estado do Formulário
  const [form, setForm] = useState({
    ticker: '',
    price: '',
    dividend: '',
    quantity: ''
  });

  // Estado da Carteira (Lista de Ativos)
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);

  // Handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAddAsset = () => {
    // 1. Validação simples
    if (!form.price || !form.dividend || !form.quantity) return;

    const price = parseFloat(form.price.replace(',', '.'));
    const dividend = parseFloat(form.dividend.replace(',', '.'));
    const quantity = parseInt(form.quantity);
    const ticker = form.ticker.toUpperCase() || 'ATIVO ' + (portfolio.length + 1);

    if (isNaN(price) || isNaN(dividend) || isNaN(quantity)) return;

    // 2. Cálculos do Número Mágico (Regra de Negócio)
    const magicNumber = Math.ceil(price / dividend);
    const missingShares = Math.max(0, magicNumber - quantity);
    const investmentNeeded = missingShares * price;
    const finalPatrimony = magicNumber * price;
    const isSelfSustain = quantity >= magicNumber;

    // 3. Criar objeto do ativo
    const newItem: PortfolioItem = {
      id: crypto.randomUUID(), // ID único para o React
      ticker,
      price,
      dividend,
      quantity,
      magicNumber,
      missingShares,
      investmentNeeded,
      finalPatrimony,
      isSelfSustain
    };

    // 4. Atualizar estado e limpar form
    setPortfolio([...portfolio, newItem]);
    setForm({ ticker: '', price: '', dividend: '', quantity: '' });
  };

  const handleRemove = (id: string) => {
    setPortfolio(portfolio.filter(item => item.id !== id));
  };

  // Totais (Rodapé da Tabela)
  const totalInvestmentNeeded = portfolio.reduce((acc, item) => acc + item.investmentNeeded, 0);
  const totalIncome = portfolio.reduce((acc, item) => acc + (item.quantity * item.dividend), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-emerald-400 flex items-center gap-2">
            <TrendingUp className="w-8 h-8" /> Carteira Inteligente
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Gerenciador de Ativos e Efeito Bola de Neve</p>
        </div>
        
        <div className="mt-4 md:mt-0 bg-slate-900 p-3 rounded-lg border border-slate-800 flex gap-6">
           <div className="text-right">
             <p className="text-xs text-slate-500 uppercase">Renda Mensal Atual</p>
             <p className="text-emerald-400 font-bold text-lg">{formatCurrency(totalIncome)}</p>
           </div>
           <div className="text-right border-l border-slate-700 pl-6">
             <p className="text-xs text-slate-500 uppercase">Falta para Meta Global</p>
             <p className="text-amber-400 font-bold text-lg">{formatCurrency(totalInvestmentNeeded)}</p>
           </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* --- FORMULÁRIO LATERAL (Esquerda) --- */}
        <section className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900/80 p-6 rounded-xl border border-slate-800 shadow-xl backdrop-blur-sm">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-white">
              <PlusCircle className="w-5 h-5 text-blue-500" /> Novo Aporte
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase">Código (Ticker)</label>
                <input 
                  name="ticker" value={form.ticker} onChange={handleChange}
                  placeholder="Ex: MXRF11" 
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase">Preço Atual</label>
                  <input 
                    name="price" type="number" step="0.01" value={form.price} onChange={handleChange}
                    placeholder="R$ 0,00" 
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase">Dividendo (Mês)</label>
                  <input 
                    name="dividend" type="number" step="0.01" value={form.dividend} onChange={handleChange}
                    placeholder="R$ 0,00" 
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
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 mt-4 shadow-lg shadow-emerald-900/20"
              >
                <Wallet className="w-4 h-4" /> Adicionar à Carteira
              </button>
            </div>
          </div>
        </section>

        {/* --- TABELA DE ATIVOS (Direita) --- */}
        <section className="lg:col-span-8">
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-400">
                <thead className="bg-slate-950 text-slate-200 uppercase text-xs font-bold tracking-wider">
                  <tr>
                    <th className="p-4">Ativo</th>
                    <th className="p-4">Preço Médio</th>
                    <th className="p-4">Div. Yield</th>
                    <th className="p-4 text-center">Cotas Atuais</th>
                    <th className="p-4 text-center text-emerald-400">Nº Mágico</th>
                    <th className="p-4 text-right">Falta Investir</th>
                    <th className="p-4 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {portfolio.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-600">
                        Nenhum ativo cadastrado. Adicione ao lado para começar.
                      </td>
                    </tr>
                  ) : (
                    portfolio.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="p-4 font-bold text-white">{item.ticker}</td>
                        <td className="p-4">{formatCurrency(item.price)}</td>
                        <td className="p-4 text-emerald-400 font-medium">
                          {formatCurrency(item.dividend)}
                        </td>
                        <td className="p-4 text-center text-white">{item.quantity}</td>
                        <td className="p-4 text-center">
                          <span className={\`px-2 py-1 rounded font-bold text-xs \${item.isSelfSustain ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-white'}\`}>
                            {item.magicNumber}
                          </span>
                        </td>
                        <td className="p-4 text-right font-mono">
                          {item.isSelfSustain ? (
                            <span className="text-emerald-500 flex items-center justify-end gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Atingido
                            </span>
                          ) : (
                            <span className="text-amber-400 font-semibold">
                              {formatCurrency(item.investmentNeeded)}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <button 
                            onClick={() => handleRemove(item.id)}
                            className="text-slate-600 hover:text-red-400 transition-colors p-2"
                            title="Remover"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Footer da Tabela - Resumo Rápido */}
            {portfolio.length > 0 && (
              <div className="bg-slate-950 p-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center">
                <span>{portfolio.length} ativos listados</span>
                <div className="flex gap-4">
                   <span className="flex items-center gap-1">
                     <AlertCircle className="w-3 h-3 text-amber-500" /> Faltam aportes em {portfolio.filter(i => !i.isSelfSustain).length} ativos
                   </span>
                </div>
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
`;

// --- 3. Executar a Sobrescrita ---
function updateProject() {
  console.log('\\x1b[36m%s\\x1b[0m', '🚀 Atualizando para o Gerenciador de Portfólio...');

  try {
    // Atualizar Types
    fs.writeFileSync(path.join('types', 'index.ts'), typesContent);
    console.log('✅ Tipos atualizados.');

    // Atualizar Page
    fs.writeFileSync(path.join('app', 'page.tsx'), pageContent);
    console.log('✅ Página principal atualizada com tabela.');

    console.log('\\n\\x1b[32m%s\\x1b[0m', 'Sucesso! A tabela está pronta.');
    console.log('Rode "npm run dev" se o servidor não estiver ligado.');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

updateProject();