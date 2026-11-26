'use client';

import { useMemo, useState } from 'react';

const CLASSES = ['FIIs', 'Ações', 'Tesouro', 'ETF', 'FIAGRO'] as const;
type AssetClass = (typeof CLASSES)[number];
type PortfolioPosition = {
  ticker: string;
  classe: string;
  segmento: string;
  quantidade: number;
  preco_medio: number | null;
  preco_atual: number;
  habilitado_aporte?: boolean;
  preco_teto_manual?: number | null;
};
type ImportedPortfolio = {
  positions: PortfolioPosition[];
  patrimonio_total: number;
  resumo_por_classe: Record<string, number>;
};
type Order = {
  ticker: string;
  classe: string;
  segmento: string;
  preco_atual: number;
  quantidade_calculada: number;
  total_estimado: number;
  preco_medio_atual: number | null;
  preco_medio_projetado: number | null;
  semaforo: 'VERDE' | 'AMARELO' | 'VERMELHO' | null;
  regras_acionadas: string[];
  pagina_fonte: number | null;
};
type SimulationResult = {
  patrimonio_atual_brl: number;
  total_alocado: number;
  troco_residual: number;
  eficiencia_aporte_pct: number;
  comparativo_classes: {
    classe: string;
    patrimonio_atual_brl: number;
    meta_pct: number;
    percentual_atual: number;
    percentual_depois: number;
  }[];
  ordens: Order[];
  ativos_excluidos: {
    ticker: string;
    classe: string;
    motivo: string;
    semaforo: string | null;
    regras_acionadas: string[];
    pagina_fonte: number | null;
  }[];
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });

export default function ContributionsPage() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [loadedPortfolio, setLoadedPortfolio] = useState<ImportedPortfolio | null>(null);
  const [aporte, setAporte] = useState('');
  const [weights, setWeights] = useState<Record<AssetClass, string>>({
    FIIs: '0',
    Ações: '0',
    Tesouro: '0',
    ETF: '0',
    FIAGRO: '0',
  });
  const [yellowVacancy, setYellowVacancy] = useState('20');
  const [redVacancy, setRedVacancy] = useState('25');
  const [maximumLeverage, setMaximumLeverage] = useState('');
  const [redAction, setRedAction] = useState<'bloquear' | 'alertar'>('bloquear');
  const [fileBusy, setFileBusy] = useState(false);
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<SimulationResult | null>(null);

  const weightTotal = useMemo(
    () => Object.values(weights).reduce((total, value) => total + (Number(value) || 0), 0),
    [weights],
  );
  const weightsAreValid = Math.round(weightTotal * 100) === 10000;

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage('');
    setResult(null);
    setFileBusy(true);

    try {
      const data = new FormData();
      data.append('file', file);
      const response = await fetch('/api/import/xlsx', { method: 'POST', body: data });
      const payload: unknown = await response.json();
      if (!response.ok || !isImportedPortfolio(payload)) {
        throw new Error(readError(payload, 'Não foi possível importar a planilha.'));
      }
      setLoadedPortfolio(payload);
      setPositions(payload.positions);
      setMessage(`${payload.positions.length} ativos carregados da planilha.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao importar a planilha.');
    } finally {
      setFileBusy(false);
      event.target.value = '';
    }
  };

  const simulate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setSimulationBusy(true);
    const numericWeights = Object.fromEntries(
      CLASSES.map((assetClass) => [assetClass, Number(weights[assetClass]) / 100]),
    );

    try {
      const response = await fetch('/api/aporte/simular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions,
          aporte_disponivel: Number(aporte),
          policy: {
            metas_classe: numericWeights,
            gatilhos_semaforo_fii: {
              vacancia_financeira_amarelo_pct: Number(yellowVacancy),
              vacancia_financeira_max_pct: Number(redVacancy),
              vacancia_fisica_max_pct: 25,
              alavancagem_max_pct: maximumLeverage === '' ? null : Number(maximumLeverage),
            },
            acao_semaforo_vermelho: redAction,
            reducao_semaforo_amarelo_pct: 50,
          },
          fii_facts: {},
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isSimulationResult(payload)) {
        throw new Error(readError(payload, 'Não foi possível calcular o rebalanceamento.'));
      }
      setResult(payload);
    } catch (error) {
      setResult(null);
      setMessage(error instanceof Error ? error.message : 'Falha ao calcular o rebalanceamento.');
    } finally {
      setSimulationBusy(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-8 px-4 py-8 text-slate-100 md:px-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">Motor de Aportes</p>
        <h1 className="mt-2 text-3xl font-bold">Metas e regras da sua carteira</h1>
      </header>

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">Importar planilha B3</h2>
        <p className="mt-2 text-sm text-slate-300">Selecione uma planilha XLSX de até 5 MB para carregar posições.</p>
        <label className="mt-4 inline-flex cursor-pointer items-center rounded-lg bg-slate-700 px-4 py-2 font-medium hover:bg-slate-600">
          {fileBusy ? 'Importando…' : 'Selecionar arquivo XLSX'}
          <input
            type="file"
            accept=".xlsx"
            onChange={importFile}
            disabled={fileBusy}
            className="sr-only"
          />
        </label>
        {loadedPortfolio && (
          <p className="mt-4 text-sm text-emerald-300">
            {loadedPortfolio.positions.length} ativos · Patrimônio carregado: {currency.format(loadedPortfolio.patrimonio_total)}
          </p>
        )}
      </section>

      <form onSubmit={simulate} className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <section>
          <h2 className="text-xl font-semibold">Suas Metas e Regras</h2>
          <label className="mt-4 block max-w-sm space-y-2 text-sm">
            <span>Valor do aporte mensal (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={aporte}
              onChange={(event) => setAporte(event.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
            />
          </label>
        </section>

        <fieldset>
          <legend className="text-base font-semibold">Metas por classe (%)</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {CLASSES.map((assetClass) => (
              <label key={assetClass} className="space-y-2 text-sm">
                <span>{assetClass}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={weights[assetClass]}
                  onChange={(event) => setWeights((current) => ({
                    ...current,
                    [assetClass]: event.target.value,
                  }))}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
                />
              </label>
            ))}
          </div>
          <p className={`mt-3 text-sm ${weightsAreValid ? 'text-emerald-300' : 'text-amber-300'}`}>
            Soma configurada: {weightTotal.toFixed(2)}% {weightsAreValid ? '· válida' : '· informe exatamente 100%'}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Dentro de cada classe, a distribuição segue os pesos atuais das posições elegíveis; valores sem unidade compatível permanecem como troco.
          </p>
        </fieldset>

        <fieldset className="rounded-xl border border-slate-700 p-4">
          <legend className="px-2 text-base font-semibold">Semáforo de FIIs — Sua regra</legend>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-2 text-sm">
              <span>Sua regra: vacância financeira amarela (%)</span>
              <input type="number" min="0" max="100" step="0.1" value={yellowVacancy} onChange={(event) => setYellowVacancy(event.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
            </label>
            <label className="space-y-2 text-sm">
              <span>Sua regra: vacância financeira vermelha (%)</span>
              <input type="number" min="0" max="100" step="0.1" value={redVacancy} onChange={(event) => setRedVacancy(event.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
            </label>
            <label className="space-y-2 text-sm">
              <span>Sua regra: alavancagem máxima (%)</span>
              <input type="number" min="0" step="0.1" value={maximumLeverage} onChange={(event) => setMaximumLeverage(event.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
            </label>
            <label className="space-y-2 text-sm">
              <span>Sua regra: ativo no vermelho</span>
              <select value={redAction} onChange={(event) => setRedAction(event.target.value as 'bloquear' | 'alertar')} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2">
                <option value="bloquear">Bloquear aporte</option>
                <option value="alertar">Apenas alertar</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Ativos amarelos recebem redução de 50% na parcela calculada. Ativos sem dados do relatório aparecem com os gatilhos ausentes.
          </p>
        </fieldset>

        <button
          type="submit"
          disabled={simulationBusy || positions.length === 0 || !weightsAreValid}
          className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {simulationBusy ? 'Calculando…' : 'Calcular Rebalanceamento'}
        </button>
        {message && <p role="status" className="text-sm text-slate-300">{message}</p>}
      </form>

      {result && (
        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Patrimônio Atual" value={currency.format(result.patrimonio_atual_brl)} />
            <SummaryCard label="Total Alocado" value={currency.format(result.total_alocado)} />
            <SummaryCard label="Troco Residual" value={currency.format(result.troco_residual)} />
            <SummaryCard label="Eficiência do Aporte" value={`${decimal.format(result.eficiencia_aporte_pct)}%`} />
          </div>

          <section className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">Antes x Meta x Depois por classe</h2>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-slate-300">
                <tr><th className="p-3">Classe</th><th className="p-3 text-right">Antes</th><th className="p-3 text-right">Meta</th><th className="p-3 text-right">Depois</th></tr>
              </thead>
              <tbody>
                {result.comparativo_classes.map((item) => (
                  <tr key={item.classe} className="border-t border-slate-800">
                    <td className="p-3">{item.classe}</td>
                    <td className="p-3 text-right">{decimal.format(item.percentual_atual)}%</td>
                    <td className="p-3 text-right">{decimal.format(item.meta_pct)}%</td>
                    <td className="p-3 text-right">{decimal.format(item.percentual_depois)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">Resultados calculados</h2>
            {result.ordens.length === 0 ? (
              <p className="text-sm text-slate-300">Nenhuma ordem calculada para as posições e regras informadas.</p>
            ) : (
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="text-left text-slate-300">
                  <tr>
                    <th className="p-3">Ativo</th><th className="p-3">Classe</th><th className="p-3">Segmento</th>
                    <th className="p-3 text-right">Preço Atual</th><th className="p-3 text-right">Quantidade Calculada</th>
                    <th className="p-3 text-right">Total Estimado</th><th className="p-3">PM Atual → PM Projetado</th><th className="p-3">Semáforo</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ordens.map((order) => (
                    <tr key={order.ticker} className="border-t border-slate-800 align-top">
                      <td className="p-3 font-semibold">{order.ticker}</td>
                      <td className="p-3">{order.classe}</td>
                      <td className="p-3">{order.segmento}</td>
                      <td className="p-3 text-right">{currency.format(order.preco_atual)}</td>
                      <td className="p-3 text-right">{decimal.format(order.quantidade_calculada)}</td>
                      <td className="p-3 text-right">{currency.format(order.total_estimado)}</td>
                      <td className="p-3">
                        {order.preco_medio_atual === null || order.preco_medio_projetado === null
                          ? 'Não informado'
                          : `${currency.format(order.preco_medio_atual)} → ${currency.format(order.preco_medio_projetado)}`}
                      </td>
                      <td className="p-3">
                        {order.semaforo ? <SemaphoreBadge value={order.semaforo} /> : 'Não se aplica'}
                        {order.regras_acionadas.length > 0 && (
                          <p className="mt-1 max-w-xs text-xs text-slate-400">
                            {order.regras_acionadas.join('; ')}
                            {order.pagina_fonte ? ` (p. ${order.pagina_fonte})` : ''}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">Ativos Excluídos pelas Suas Regras</h2>
            {result.ativos_excluidos.length === 0 ? (
              <p className="text-sm text-slate-300">Nenhum ativo excluído pelas regras informadas.</p>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-slate-300">
                  <tr><th className="p-3">Ativo</th><th className="p-3">Classe</th><th className="p-3">Motivo objetivo</th><th className="p-3">Semáforo e fonte</th></tr>
                </thead>
                <tbody>
                  {result.ativos_excluidos.map((asset, index) => (
                    <tr key={`${asset.ticker}-${index}`} className="border-t border-slate-800 align-top">
                      <td className="p-3 font-semibold">{asset.ticker}</td>
                      <td className="p-3">{asset.classe}</td>
                      <td className="p-3">{asset.motivo}</td>
                      <td className="p-3">
                        {asset.semaforo ? <SemaphoreBadge value={asset.semaforo} /> : '—'}
                        {asset.regras_acionadas.map((rule) => (
                          <p key={rule} className="mt-1 text-xs text-slate-400">
                            {rule}{asset.pagina_fonte ? ` (p. ${asset.pagina_fonte})` : ''}
                          </p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </section>
      )}

      <p className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-700 bg-slate-950/95 px-4 py-3 text-center text-xs text-slate-300 backdrop-blur">
        Cálculo estritamente matemático baseado nas posições, metas e limiares configurados por você. Esta ferramenta não constitui recomendação, análise ou consultoria de valores mobiliários (Resoluções CVM 19 e 20).
      </p>
      <div className="h-12" aria-hidden="true" />
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-700 bg-slate-900 p-5">
      <h2 className="text-sm text-slate-400">{label}</h2>
      <p className="mt-2 text-xl font-bold text-emerald-300">{value}</p>
    </article>
  );
}

function SemaphoreBadge({ value }: { value: 'VERDE' | 'AMARELO' | 'VERMELHO' | string }) {
  const style = value === 'VERDE'
    ? 'bg-emerald-900 text-emerald-200'
    : value === 'AMARELO'
      ? 'bg-amber-900 text-amber-200'
      : 'bg-rose-900 text-rose-200';
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${style}`}>{value}</span>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readError(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === 'string' ? value.error : fallback;
}

function isImportedPortfolio(value: unknown): value is ImportedPortfolio {
  return isRecord(value)
    && Array.isArray(value.positions)
    && typeof value.patrimonio_total === 'number'
    && isRecord(value.resumo_por_classe);
}

function isSimulationResult(value: unknown): value is SimulationResult {
  return isRecord(value)
    && typeof value.patrimonio_atual_brl === 'number'
    && typeof value.total_alocado === 'number'
    && typeof value.troco_residual === 'number'
    && typeof value.eficiencia_aporte_pct === 'number'
    && Array.isArray(value.comparativo_classes)
    && Array.isArray(value.ordens)
    && Array.isArray(value.ativos_excluidos);
}
