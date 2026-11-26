'use client';

import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type ProjectionPoint,
  type ProjectionScenario,
} from '@/lib/projection';
import { PORTFOLIO_STORAGE_KEY } from '@/lib/portfolio-storage-key';

const currentYear = new Date().getFullYear();
const defaultRates: Record<ProjectionScenario, string> = {
  conservador: '6.17',
  base: '8.73',
  otimista: '11.35',
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

type ProjectionResponse = { points: ProjectionPoint[] };
type PortfolioValueResponse = { patrimonio_atual_brl: number };

export default function ProjectionPage() {
  const [initialWealth, setInitialWealth] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [target, setTarget] = useState('');
  const [horizonYear, setHorizonYear] = useState(String(currentYear + 14));
  const [rates, setRates] = useState(defaultRates);
  const [points, setPoints] = useState<ProjectionPoint[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);

  const updateRate = (scenario: ProjectionScenario, value: string) => {
    setRates((current) => ({ ...current, [scenario]: value }));
  };

  const useCurrentPortfolio = async () => {
    setErrorMessage('');
    setIsLoadingPortfolio(true);
    try {
      const savedPortfolio = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
      if (savedPortfolio === null) {
        throw new Error('Ainda não há uma carteira Snowball salva neste navegador.');
      }

      const positions: unknown = JSON.parse(savedPortfolio);
      const response = await fetch('/api/projection/portfolio-value', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !isPortfolioValueResponse(result)) {
        const message = isRecord(result) && typeof result.error === 'string'
          ? result.error
          : 'Não foi possível carregar o patrimônio da Carteira Snowball.';
        throw new Error(message);
      }
      setInitialWealth(result.patrimonio_atual_brl.toFixed(2));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao carregar a carteira atual.');
    } finally {
      setIsLoadingPortfolio(false);
    }
  };

  const calculate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    const input = {
      initialWealthBrl: Number(initialWealth),
      monthlyContributionBrl: Number(monthlyContribution),
      targetBrl: Number(target),
      startYear: currentYear,
      horizonYear: Number(horizonYear),
      annualRatesPercent: {
        conservador: Number(rates.conservador),
        base: Number(rates.base),
        otimista: Number(rates.otimista),
      },
    };

    try {
      const response = await fetch('/api/projection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result: unknown = await response.json();
      if (!response.ok || !isProjectionResponse(result)) {
        const message = isRecord(result) && typeof result.error === 'string'
          ? result.error
          : 'Não foi possível calcular a projeção com os valores informados.';
        throw new Error(message);
      }
      setPoints(result.points);
    } catch (error) {
      setPoints([]);
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao calcular a projeção.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-8 px-4 py-8 text-slate-100 md:px-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-sky-300">
          Patrimônio ao longo do tempo
        </p>
        <h1 className="mt-2 text-3xl font-bold">Projeção Patrimonial</h1>
        <p className="mt-2 max-w-3xl text-slate-300">
          Simulação matemática por cenários, usando apenas os valores e as taxas anuais informados nesta tela.
        </p>
      </header>

      <form onSubmit={calculate} className="grid gap-6 rounded-2xl border border-slate-700 bg-slate-900 p-6 lg:grid-cols-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 text-sm">
            <label htmlFor="initial-wealth" className="block">Patrimônio inicial (R$)</label>
            <input
              id="initial-wealth"
              required
              min="0"
              step="0.01"
              type="number"
              value={initialWealth}
              onChange={(event) => setInitialWealth(event.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
            />
            <button
              type="button"
              onClick={useCurrentPortfolio}
              disabled={isLoadingPortfolio}
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-60"
            >
              {isLoadingPortfolio ? 'Carregando carteira…' : 'Usar patrimônio da Carteira Snowball'}
            </button>
          </div>
          <label className="space-y-2 text-sm">
            <span>Aporte mensal (R$)</span>
            <input
              required
              min="0"
              step="0.01"
              type="number"
              value={monthlyContribution}
              onChange={(event) => setMonthlyContribution(event.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Meta patrimonial (R$)</span>
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Horizonte final (ano)</span>
            <input
              required
              min={currentYear}
              step="1"
              type="number"
              value={horizonYear}
              onChange={(event) => setHorizonYear(event.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
            />
          </label>
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-semibold">Taxa anual por cenário (%)</legend>
          {([
            ['conservador', 'Conservador'],
            ['base', 'Base'],
            ['otimista', 'Otimista'],
          ] as const).map(([scenario, label]) => (
            <label key={scenario} className="flex items-center justify-between gap-4 text-sm">
              <span>{label}</span>
              <input
                required
                step="0.01"
                type="number"
                value={rates[scenario]}
                onChange={(event) => updateRate(scenario, event.target.value)}
                className="w-36 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-right"
              />
            </label>
          ))}
          <p className="text-xs text-slate-400">
            Premissas iniciais equivalentes às taxas mensais legadas; edite-as conforme seus parâmetros.
          </p>
        </fieldset>

        <div className="lg:col-span-2">
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-sky-600 px-5 py-3 font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {isLoading ? 'Calculando…' : 'Calcular projeção'}
          </button>
          {errorMessage && (
            <p role="alert" className="mt-3 text-sm text-rose-300">{errorMessage}</p>
          )}
        </div>
      </form>

      {points.length > 0 && (
        <>
          <section aria-label="Gráfico de projeção" className="rounded-2xl border border-slate-700 bg-slate-900 p-4 md:p-6">
            <h2 className="mb-4 text-lg font-semibold">Cenários projetados</h2>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="year" stroke="#cbd5e1" />
                  <YAxis
                    stroke="#cbd5e1"
                    tickFormatter={(value: number) => currency.format(value)}
                    width={110}
                  />
                  <Tooltip
                    formatter={(value) => currency.format(Number(value))}
                    labelFormatter={(label) => `Ano ${label}`}
                  />
                  <Legend />
                  <ReferenceLine y={points[0].meta} stroke="#fbbf24" strokeDasharray="5 5" label="Meta" />
                  <Line type="monotone" dataKey="conservador" name="Conservador" stroke="#38bdf8" dot={false} />
                  <Line type="monotone" dataKey="base" name="Base" stroke="#34d399" dot={false} />
                  <Line type="monotone" dataKey="otimista" name="Otimista" stroke="#fbbf24" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 md:p-6">
            <h2 className="mb-4 text-lg font-semibold">Tabela anual</h2>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-slate-300">
                <tr>
                  <th className="p-3">Ano</th>
                  <th className="p-3 text-right">Conservador</th>
                  <th className="p-3 text-right">Base</th>
                  <th className="p-3 text-right">Otimista</th>
                  <th className="p-3 text-right">Meta configurada</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.year} className="border-t border-slate-800">
                    <td className="p-3">{point.year}</td>
                    <td className="p-3 text-right">{currency.format(point.conservador)}</td>
                    <td className="p-3 text-right">{currency.format(point.base)}</td>
                    <td className="p-3 text-right">{currency.format(point.otimista)}</td>
                    <td className="p-3 text-right">{currency.format(point.meta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-400">
              As projeções são cenários matemáticos e não representam garantia de resultado.
            </p>
          </section>
        </>
      )}
    </main>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProjectionResponse(value: unknown): value is ProjectionResponse {
  return isRecord(value)
    && Array.isArray(value.points)
    && value.points.every((point) => isRecord(point)
      && Number.isInteger(point.year)
      && typeof point.conservador === 'number'
      && typeof point.base === 'number'
      && typeof point.otimista === 'number'
      && typeof point.meta === 'number');
}

function isPortfolioValueResponse(value: unknown): value is PortfolioValueResponse {
  return isRecord(value)
    && typeof value.patrimonio_atual_brl === 'number'
    && Number.isFinite(value.patrimonio_atual_brl)
    && value.patrimonio_atual_brl >= 0;
}
