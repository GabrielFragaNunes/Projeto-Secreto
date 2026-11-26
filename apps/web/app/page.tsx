'use client';

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { formatCurrency } from '@/lib/utils';
import { fetchStockData, logToTerminal } from '@/app/actions'; // Importa o logger
import { 
  TrendingUp, PlusCircle, Trash2, Wallet, CheckCircle2, 
  Search, Loader2, Upload, FileSpreadsheet, Pencil, Check, X, Download
} from 'lucide-react';
import { PortfolioItem } from '@/types';

export default function PortfolioManager() {
  const [form, setForm] = useState({ ticker: '', price: '', dividend: '', quantity: '' });
  const [assetName, setAssetName] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState({ ticker: '', price: '', dividend: '', quantity: '' });
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

  const parseNumber = (value: string) => {
    const normalized = value.includes(',')
      ? value.replace(/\./g, '').replace(',', '.')
      : value;
    return Number(normalized);
  };

  const normalizeHeader = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  const handleSearchTicker = async () => {
    const ticker = form.ticker.trim();
    if (!ticker) return;
    setIsLoadingData(true);
    setAssetName('');
    try {
      const result = await fetchStockData(ticker);
      if (result.error) {
        alert(result.error);
      } else if (result.success) {
        setAssetName(result.name || '');
        setForm(prev => ({
          ...prev,
          ticker: result.ticker,
          price: Number.isFinite(result.price) && result.price > 0 ? result.price.toFixed(2).replace('.', ',') : prev.price,
          dividend: Number.isFinite(result.dividend) && result.dividend > 0 ? result.dividend.toFixed(2).replace('.', ',') : prev.dividend
        }));
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível buscar o ticker.');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleAddAsset = () => {
    const price = parseNumber(form.price);
    const dividend = parseNumber(form.dividend);
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

  const handleStartItemEdit = (item: PortfolioItem) => {
    setEditingItemId(item.id);
    setEditingItem({
      ticker: item.ticker,
      price: item.price.toFixed(2).replace('.', ','),
      dividend: item.dividend.toFixed(2).replace('.', ','),
      quantity: item.quantity.toString()
    });
  };

  const handleCancelItemEdit = () => {
    setEditingItemId(null);
    setEditingItem({ ticker: '', price: '', dividend: '', quantity: '' });
  };

  const handleSaveItem = (item: PortfolioItem) => {
    const ticker = editingItem.ticker.trim().toUpperCase();
    const price = parseNumber(editingItem.price);
    const dividend = parseNumber(editingItem.dividend);
    const quantity = Number(editingItem.quantity);

    if (!ticker || !Number.isFinite(price) || price <= 0 || !Number.isFinite(dividend) || dividend <= 0 || !Number.isInteger(quantity) || quantity < 0) {
      alert('Informe ticker, preço, dividendo e quantidade válidos.');
      return;
    }

    const magicNumber = Math.ceil(price / dividend);
    const missingShares = Math.max(0, magicNumber - quantity);
    const investmentNeeded = missingShares * price;
    const finalPatrimony = magicNumber * price;
    const isSelfSustain = quantity >= magicNumber;
    const monthlyIncome = quantity * dividend;

    setPortfolio(currentPortfolio => currentPortfolio.map(currentItem => (
      currentItem.id !== item.id
        ? currentItem
        : {
            ...currentItem,
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
          }
    )));
    handleCancelItemEdit();
  };

  const handleExportJson = () => {
    if (portfolio.length === 0) {
      alert('Adicione pelo menos um ativo antes de exportar.');
      return;
    }

    const json = JSON.stringify(portfolio, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `carteira-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // --- LÓGICA DE IMPORTAÇÃO COM DEBUG ---
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    // LOG INICIAL
    await logToTerminal(`📂 Arquivo Recebido: ${file.name} (${file.size} bytes)`);

    try {
      const isJson = file.name.toLowerCase().endsWith('.json');
      let rows: unknown[];

      if (isJson) {
        const text = await file.text();
        const parsed: unknown = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : [parsed];
        await logToTerminal('📄 Arquivo JSON carregado.');
      } else {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        for (const sheetName of workbook.SheetNames) {
          await logToTerminal(`📑 Aba Selecionada: ${sheetName}`);
        }
        rows = workbook.SheetNames.flatMap(sheetName => XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]));
      }

      await logToTerminal(`📊 Total de linhas cruas: ${rows.length}`);
      if (rows.length > 0) {
        await logToTerminal(`🔍 Exemplo da Linha 1 (HEADERS):`);
        await logToTerminal(JSON.stringify(rows[0])); // Mostra as chaves exatas
      }

      const newItems: PortfolioItem[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        if (!isRecord(row)) continue;

        const keys = Object.keys(row);
        const fields = new Map<string, unknown>();
        for (const key of keys) {
          fields.set(normalizeHeader(key), row[key]);
        }
        const getField = (...names: string[]) => names
          .map(name => fields.get(normalizeHeader(name)))
          .find(value => value !== undefined && value !== null && value !== '');
        const tickerRaw = getField('ativo', 'ticker', 'código', 'codigo', 'papel', 'negociação', 'produto');
        const qtyRaw = getField('quantidade', 'qtde', 'posição', 'posicao', 'total', 'disponível', 'disponivel');

        if (tickerRaw === undefined || tickerRaw === null || qtyRaw === undefined || qtyRaw === null) {
          if (i < 3) await logToTerminal(`⚠️ Linha ${i+1} Pulada: Não achei colunas. Chaves encontradas: ${keys.join(', ')}`);
          continue;
        }

        if (!tickerRaw) {
          await logToTerminal(`⚠️ Linha ${i+1}: Ticker vazio.`);
          continue;
        }

        const ticker = tickerRaw.toString().split(' ')[0].toUpperCase().trim();
        const quantity = Math.floor(parseNumber(qtyRaw.toString())) || 0;

        if (quantity <= 0) continue;

        const price = parseNumber(String(getField('preço atual', 'preco atual', 'price') ?? '0')) || 0;
        const dividend = parseNumber(String(getField('último dividendo', 'ultimo dividendo', 'dividend') ?? '0')) || 0;
        const averagePrice = parseNumber(String(getField('preço médio', 'preco medio', 'averagePrice') ?? '0')) || 0;
        const currentPatrimony = parseNumber(String(getField('patrimônio atual', 'patrimonio atual', 'currentPatrimony') ?? '0')) || 0;
        const category = String(getField('categoria', 'category') ?? '');

        let resolvedPrice = price;
        let resolvedDividend = dividend;
        if (resolvedPrice <= 0 || resolvedDividend <= 0) {
          await new Promise(r => setTimeout(r, 300));
          const marketData = await fetchStockData(ticker);
          if (marketData.success) {
            resolvedPrice = resolvedPrice || marketData.price;
            resolvedDividend = resolvedDividend || marketData.dividend;
          }
        }

        const safePrice = resolvedPrice || 0; 
        const safeDividend = resolvedDividend || 0.01; 
        const magicNumber = safePrice > 0 ? Math.ceil(safePrice / safeDividend) : 0;
        const missingShares = Math.max(0, magicNumber - quantity);
        const investmentNeeded = missingShares * safePrice;
        const finalPatrimony = magicNumber * safePrice;
        const isSelfSustain = quantity >= magicNumber && magicNumber > 0;
        const monthlyIncome = quantity * safeDividend;

        newItems.push({
          id: crypto.randomUUID(), ticker, price: safePrice, dividend: safeDividend, quantity,
          category, averagePrice, currentPatrimony,
          magicNumber, missingShares, investmentNeeded, finalPatrimony, isSelfSustain, monthlyIncome
        });
      }

      setPortfolio(prev => [...prev, ...newItems]);
      await logToTerminal(`🚀 Importação Finalizada: ${newItems.length} ativos importados.`);
      alert(`Importação ${isJson ? 'JSON' : 'Excel'} concluída! ${newItems.length} ativos processados.`);

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido.';
      await logToTerminal(`❌ Erro Fatal: ${message}`);
      alert(`Erro ao ler o arquivo ${file.name.toLowerCase().endsWith('.json') ? 'JSON' : 'Excel'}.`);
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
              Os logs aparecerão no terminal onde você rodou &apos;npm run dev&apos;.
            </p>
            <input type="file" accept=".xlsx, .xls, .csv, .json" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
            <button onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="w-full bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 relative z-10">
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Selecionar Arquivo
            </button>
            <button onClick={handleExportJson} disabled={portfolio.length === 0 || isImporting} className="w-full mt-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 relative z-10">
              <Download className="w-4 h-4" /> Salvar carteira em JSON
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
                        <td className="p-4 pl-6 font-bold text-white">
                          {editingItemId === item.id ? (
                            <input value={editingItem.ticker} onChange={(event) => setEditingItem({ ...editingItem, ticker: event.target.value })} className="w-24 bg-slate-950 border border-emerald-500 rounded px-2 py-1 uppercase outline-none" />
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>{item.ticker}</span>
                              <button onClick={() => handleStartItemEdit(item)} aria-label={`Editar ativo ${item.ticker}`} className="text-slate-600 hover:text-emerald-400 transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          {editingItemId === item.id ? (
                            <div className="flex gap-2">
                              <input value={editingItem.price} onChange={(event) => setEditingItem({ ...editingItem, price: event.target.value })} aria-label="Preço" className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1" />
                              <input value={editingItem.dividend} onChange={(event) => setEditingItem({ ...editingItem, dividend: event.target.value })} aria-label="Dividendo mensal" className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1" />
                            </div>
                          ) : item.price === 0 ? <span className="text-amber-500 text-xs font-bold bg-amber-500/10 px-2 py-1 rounded">Sem Preço</span> : <><div className="text-slate-300">{formatCurrency(item.price)}</div><div className="text-xs text-emerald-500/80">Div: {formatCurrency(item.dividend)}</div></>}
                        </td>
                        <td className="p-4 text-center text-white">
                          {editingItemId === item.id ? (
                            <input value={editingItem.quantity} onChange={(event) => setEditingItem({ ...editingItem, quantity: event.target.value })} aria-label="Quantidade" type="number" min="0" className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center" />
                          ) : item.quantity}
                        </td>
                        <td className="p-4 text-center">{item.price > 0 && item.dividend > 0 ? <span className={`px-2 py-1 rounded text-xs font-bold ${item.isSelfSustain ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-300'}`}>{item.magicNumber}</span> : <span className="text-slate-600 text-xs">-</span>}</td>
                        <td className="p-4 text-right font-mono text-amber-400">{item.isSelfSustain ? <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" /> : formatCurrency(item.investmentNeeded)}</td>
                        <td className="p-4 text-center">
                          {editingItemId === item.id ? (
                            <div className="flex justify-center gap-2">
                              <button onClick={() => handleSaveItem(item)} aria-label="Salvar linha" className="text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4" /></button>
                              <button onClick={handleCancelItemEdit} aria-label="Cancelar edição" className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
                            </div>
                          ) : <button onClick={() => handleRemove(item.id)} className="text-slate-600 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>}
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
