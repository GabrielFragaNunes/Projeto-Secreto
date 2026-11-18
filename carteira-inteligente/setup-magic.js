const fs = require('fs');
const path = require('path');

// --- 1. Definição do Conteúdo dos Arquivos ---

const typesContent = `export interface AssetData {
  ticker: string;
  dividendYield: number;
  quantityOwned: number;
  currentPrice: number;
}

export interface MagicResult {
  magicNumber: number;
  missingShares: number;
  investmentNeeded: number;
  finalPatrimony: number;
  isSelfSustain: boolean;
}
`;

const utilsContent = `export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export const parseCurrencyInput = (value: string) => {
  return parseFloat(value.replace(/[^\\d,]/g, '').replace(',', '.')) || 0;
};
`;

const pageContent = `'use client';

import React, { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, DollarSign, PieChart, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function MagicNumberCalculator() {
  const [formData, setFormData] = useState({
    ticker: '',
    dividend: '',
    quantity: '',
    price: ''
  });

  const [result, setResult] = useState<null | {
    magicNumber: number;
    missingShares: number;
    investmentNeeded: number;
    finalPatrimony: number;
    isSelfSustain: boolean;
  }>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    const dividend = parseFloat(formData.dividend.replace(',', '.'));
    const quantity = parseInt(formData.quantity) || 0;
    const price = parseFloat(formData.price.replace(',', '.'));

    if (dividend > 0 && price > 0) {
      const magicNumber = Math.ceil(price / dividend);
      const missingShares = Math.max(0, magicNumber - quantity);
      const investmentNeeded = missingShares * price;
      const finalPatrimony = magicNumber * price;
      const isSelfSustain = quantity >= magicNumber;

      setResult({
        magicNumber,
        missingShares,
        investmentNeeded,
        finalPatrimony,
        isSelfSustain
      });
    } else {
      setResult(null);
    }
  }, [formData]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 flex flex-col items-center font-sans">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-emerald-400 flex items-center justify-center gap-2">
          <TrendingUp className="w-8 h-8" /> Calculadora do Número Mágico
        </h1>
        <p className="text-slate-400 mt-2">Descubra quando seus ativos trabalharão por você.</p>
      </header>

      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* --- CARD DE INPUTS --- */}
        <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <PieChart className="text-blue-400" /> Dados do Ativo
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Nome do Ativo (Opcional)</label>
              <input
                type="text"
                name="ticker"
                placeholder="Ex: MXRF11"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition"
                value={formData.ticker}
                onChange={handleChange}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Valor da Cota Atual (R$)</label>
                <input
                  type="number"
                  name="price"
                  step="0.01"
                  placeholder="0,00"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={formData.price}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Dividendo Mensal (R$)</label>
                <input
                  type="number"
                  name="dividend"
                  step="0.01"
                  placeholder="0,00"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={formData.dividend}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Quantidade em Carteira</label>
              <input
                type="number"
                name="quantity"
                placeholder="0"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={formData.quantity}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        {/* --- CARD DE RESULTADOS --- */}
        <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700 flex flex-col justify-center relative overflow-hidden">
          
          {!result ? (
            <div className="text-center text-slate-500 py-10">
              <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p>Preencha os dados ao lado para calcular seu Número Mágico.</p>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-500">
              
              {/* Indicador de Status */}
              {result.isSelfSustain ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-lg flex items-center gap-3 text-emerald-400">
                  <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
                  <div>
                    <p className="font-bold">Parabéns!</p>
                    <p className="text-sm">Você atingiu o Número Mágico. Este ativo já se paga sozinho.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg flex items-center gap-3 text-amber-400">
                  <AlertCircle className="w-6 h-6 flex-shrink-0" />
                  <div>
                    <p className="font-bold">Continue Aportando!</p>
                    <p className="text-sm">Faltam <strong>{result.missingShares} cotas</strong> para o efeito bola de neve.</p>
                  </div>
                </div>
              )}

              {/* Número Mágico Principal */}
              <div className="text-center py-4 border-b border-slate-700">
                <p className="text-slate-400 uppercase text-xs tracking-widest font-semibold mb-1">Número Mágico</p>
                <div className="text-6xl font-bold text-white tracking-tighter">
                  {result.magicNumber}
                  <span className="text-lg text-slate-500 ml-2 font-normal">cotas</span>
                </div>
              </div>

              {/* Grid de Detalhes */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-slate-400 text-xs mb-1">Aporte Necessário</p>
                  <p className="text-xl font-semibold text-white">
                    {formatCurrency(result.investmentNeeded)}
                  </p>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-slate-400 text-xs mb-1">Patrimônio na Meta</p>
                  <p className="text-xl font-semibold text-white">
                    {formatCurrency(result.finalPatrimony)}
                  </p>
                </div>
              </div>
              
            </div>
          )}
        </div>
      </div>

      <footer className="mt-12 text-slate-600 text-xs text-center max-w-2xl">
        <p>Cálculo baseado no Yield On Cost atual. O mercado é variável e dividendos passados não garantem retornos futuros.</p>
      </footer>
    </div>
  );
}
`;

// --- 2. Mapeamento de Arquivos e Estrutura ---

const filesToCreate = [
  {
    path: path.join('types', 'index.ts'),
    content: typesContent,
  },
  {
    path: path.join('lib', 'utils.ts'),
    content: utilsContent,
  },
  {
    path: path.join('app', 'page.tsx'),
    content: pageContent,
  },
];

// --- 3. Função de Execução ---

function createProjectStructure() {
  console.log('\\x1b[36m%s\\x1b[0m', '🚀 Iniciando configuração da Calculadora de Número Mágico...');

  filesToCreate.forEach((file) => {
    const dirName = path.dirname(file.path);

    // Criar diretório se não existir (recursivo para criar pastas aninhadas)
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
      console.log(`📁 Pasta criada: \\x1b[33m${dirName}\\x1b[0m`);
    }

    // Escrever o arquivo
    try {
      fs.writeFileSync(file.path, file.content);
      console.log(`✅ Arquivo criado: \\x1b[32m${file.path}\\x1b[0m`);
    } catch (error) {
      console.error(`❌ Erro ao criar ${file.path}:`, error.message);
    }
  });

  console.log('\\n\\x1b[36m%s\\x1b[0m', '🎉 Configuração concluída com sucesso!');
  console.log('\\x1b[90m%s\\x1b[0m', 'Lembre-se de instalar os ícones se ainda não o fez:');
  console.log('\\x1b[37m%s\\x1b[0m', 'npm install lucide-react');
}

createProjectStructure();