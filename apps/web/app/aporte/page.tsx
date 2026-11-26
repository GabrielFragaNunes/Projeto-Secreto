"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const ASSET_CLASSES = ["FIIs", "Ações", "Tesouro", "ETF", "FIAGRO"] as const;
type AssetClass = (typeof ASSET_CLASSES)[number];
type Semaphore = "VERDE" | "AMARELO" | "VERMELHO";

interface PositionItem {
  ticker: string;
  classe: AssetClass;
  segmento: string;
  quantidade: number;
  preco_medio: number;
  preco_atual: number;
  habilitado_aporte: boolean;
  preco_teto_manual: number | null;
}

interface ImportResult {
  positions: PositionItem[];
  total_ativos: number;
  patrimonio_total: number;
  resumo_por_classe: Record<string, number>;
}

interface OrderCalculation {
  ticker: string;
  classe: AssetClass;
  segmento: string;
  preco_atual: number;
  qtd_calculada: number;
  total_estimado: number;
  pm_anterior: number;
  pm_projetado: number;
  semaforo: Semaphore | null;
  gatilhos_disparados: string[];
}

interface ClassAllocationSummary {
  classe: string;
  meta_pct: number;
  atual_pct: number;
  gap_brl: number;
  aportado_brl: number;
  depois_pct: number;
}

interface BlockedAsset {
  ticker: string;
  classe: AssetClass;
  segmento: string;
  semaforo: Semaphore | null;
  motivos: string[];
}

interface SimulationResult {
  patrimonio_atual: number;
  aporte_disponivel: number;
  total_alocado: number;
  troco_residual: number;
  eficiencia_pct: number;
  ordens: OrderCalculation[];
  resumo_classes: ClassAllocationSummary[];
  ativos_bloqueados: BlockedAsset[];
}

interface JsonRecord {
  [key: string]: unknown;
}

function isAssetClass(value: unknown): value is AssetClass {
  return (
    typeof value === "string" &&
    ASSET_CLASSES.some((assetClass) => assetClass === value)
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositionItem(value: unknown): value is PositionItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.ticker === "string" &&
    isAssetClass(value.classe) &&
    typeof value.segmento === "string" &&
    typeof value.quantidade === "number" &&
    typeof value.preco_medio === "number" &&
    typeof value.preco_atual === "number" &&
    typeof value.habilitado_aporte === "boolean" &&
    (value.preco_teto_manual === null ||
      typeof value.preco_teto_manual === "number")
  );
}

function isImportResult(value: unknown): value is ImportResult {
  if (!isRecord(value) || !Array.isArray(value.positions)) return false;
  if (
    !value.positions.every(isPositionItem) ||
    typeof value.total_ativos !== "number" ||
    typeof value.patrimonio_total !== "number" ||
    !isRecord(value.resumo_por_classe)
  ) {
    return false;
  }
  return Object.values(value.resumo_por_classe).every(
    (amount) => typeof amount === "number",
  );
}

function isOrder(value: unknown): value is OrderCalculation {
  if (!isRecord(value)) return false;
  const semaphore = value.semaforo;
  return (
    typeof value.ticker === "string" &&
    isAssetClass(value.classe) &&
    typeof value.segmento === "string" &&
    typeof value.preco_atual === "number" &&
    typeof value.qtd_calculada === "number" &&
    typeof value.total_estimado === "number" &&
    typeof value.pm_anterior === "number" &&
    typeof value.pm_projetado === "number" &&
    (semaphore === null ||
      semaphore === "VERDE" ||
      semaphore === "AMARELO" ||
      semaphore === "VERMELHO") &&
    Array.isArray(value.gatilhos_disparados) &&
    value.gatilhos_disparados.every(
      (trigger) => typeof trigger === "string",
    )
  );
}

function isClassSummary(value: unknown): value is ClassAllocationSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.classe === "string" &&
    typeof value.meta_pct === "number" &&
    typeof value.atual_pct === "number" &&
    typeof value.gap_brl === "number" &&
    typeof value.aportado_brl === "number" &&
    typeof value.depois_pct === "number"
  );
}

function isBlockedAsset(value: unknown): value is BlockedAsset {
  if (!isRecord(value)) return false;
  const semaphore = value.semaforo;
  return (
    typeof value.ticker === "string" &&
    isAssetClass(value.classe) &&
    typeof value.segmento === "string" &&
    (semaphore === null ||
      semaphore === "VERDE" ||
      semaphore === "AMARELO" ||
      semaphore === "VERMELHO") &&
    Array.isArray(value.motivos) &&
    value.motivos.every((reason) => typeof reason === "string")
  );
}

function isSimulationResult(value: unknown): value is SimulationResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.patrimonio_atual === "number" &&
    typeof value.aporte_disponivel === "number" &&
    typeof value.total_alocado === "number" &&
    typeof value.troco_residual === "number" &&
    typeof value.eficiencia_pct === "number" &&
    Array.isArray(value.ordens) &&
    value.ordens.every(isOrder) &&
    Array.isArray(value.resumo_classes) &&
    value.resumo_classes.every(isClassSummary) &&
    Array.isArray(value.ativos_bloqueados) &&
    value.ativos_bloqueados.every(isBlockedAsset)
  );
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  const message =
    typeof payload.error === "string"
      ? payload.error
      : typeof payload.detail === "string"
        ? payload.detail
        : fallback;
  const details =
    typeof payload.details === "string" ? ` ${payload.details}` : "";
  return `${message}${details}`;
}

function optionalNumber(value: string): number | null | undefined {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 6,
  }).format(value);
}

function SemaphoreBadge({ value }: { value: Semaphore | null }) {
  const styles: Record<Semaphore, string> = {
    VERDE: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    AMARELO: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
    VERMELHO: "bg-rose-500/15 text-rose-200 ring-rose-500/30",
  };

  if (value === null) {
    return (
      <span className="rounded-full bg-slate-700/70 px-2.5 py-1 text-xs text-slate-300">
        Sem dados
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles[value]}`}
    >
      {value}
    </span>
  );
}

export default function AportePage() {
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [portfolioSummary, setPortfolioSummary] = useState<{
    totalAssets: number;
    totalValue: number;
  } | null>(null);
  const [monthlyContribution, setMonthlyContribution] = useState("");
  const [classTargets, setClassTargets] = useState<Record<AssetClass, string>>({
    FIIs: "",
    Ações: "",
    Tesouro: "",
    ETF: "",
    FIAGRO: "",
  });
  const [vacancyYellow, setVacancyYellow] = useState("");
  const [vacancyRed, setVacancyRed] = useState("");
  const [physicalVacancy, setPhysicalVacancy] = useState("");
  const [leverageLimit, setLeverageLimit] = useState("");
  const [redAction, setRedAction] = useState<
    "BLOQUEAR_APORTE" | "PERMITIR_APORTE"
  >("BLOQUEAR_APORTE");
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targetTotal = useMemo(
    () =>
      ASSET_CLASSES.reduce((total, assetClass) => {
        const weight = Number(classTargets[assetClass]);
        return total + (Number.isFinite(weight) ? weight : 0);
      }, 0),
    [classTargets],
  );
  const targetsValid =
    ASSET_CLASSES.every((assetClass) => {
      const value = classTargets[assetClass];
      const weight = Number(value);
      return (
        value.trim() !== "" &&
        Number.isFinite(weight) &&
        weight >= 0 &&
        weight <= 100
      );
    }) && Math.abs(targetTotal - 100) <= 0.0001;
  const contributionValue = Number(monthlyContribution);
  const contributionValid =
    monthlyContribution.trim() !== "" &&
    Number.isFinite(contributionValue) &&
    contributionValue >= 0;
  const yellowVacancyValue = optionalNumber(vacancyYellow);
  const redVacancyValue = optionalNumber(vacancyRed);
  const physicalVacancyValue = optionalNumber(physicalVacancy);
  const leverageLimitValue = optionalNumber(leverageLimit);
  const thresholdsValid =
    yellowVacancyValue !== undefined &&
    yellowVacancyValue !== null &&
    yellowVacancyValue >= 0 &&
    yellowVacancyValue <= 100 &&
    redVacancyValue !== undefined &&
    redVacancyValue !== null &&
    redVacancyValue >= 0 &&
    redVacancyValue <= 100 &&
    yellowVacancyValue < redVacancyValue &&
    physicalVacancyValue !== undefined &&
    (physicalVacancyValue === null ||
      (physicalVacancyValue >= 0 && physicalVacancyValue <= 100)) &&
    leverageLimitValue !== undefined &&
    (leverageLimitValue === null || leverageLimitValue >= 0);
  const canCalculate =
    positions.length > 0 &&
    contributionValid &&
    targetsValid &&
    thresholdsValid &&
    !isCalculating;

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const fileInput = event.currentTarget;
    const file = fileInput.files?.[0];
    if (!file) return;

    setError(null);
    setMessage(null);
    setSimulation(null);
    setIsImporting(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/import/xlsx", {
        method: "POST",
        body: formData,
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "Não foi possível importar a planilha."),
        );
      }
      if (!isImportResult(payload)) {
        throw new Error("A resposta do serviço de importação está inválida.");
      }

      setPositions(payload.positions);
      setPortfolioSummary({
        totalAssets: payload.total_ativos,
        totalValue: payload.patrimonio_total,
      });
      setMessage(
        `${payload.total_ativos} ativos carregados. Patrimônio importado: ${formatCurrency(payload.patrimonio_total)}.`,
      );
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível importar a planilha.",
      );
    } finally {
      setIsImporting(false);
      fileInput.value = "";
    }
  }

  async function handleCalculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCalculate) return;

    const metas = Object.fromEntries(
      ASSET_CLASSES.map((assetClass) => [
        assetClass,
        Number(classTargets[assetClass]),
      ]),
    );
    const payload = {
      positions,
      aporte_disponivel: contributionValue,
      policy: {
        metas_classe: metas,
        metas_segmento: {},
        gatilhos_semaforo_fii: {
          vacancia_fisica_max_pct: physicalVacancyValue,
          vacancia_financeira_amarelo_pct: yellowVacancyValue,
          vacancia_financeira_max_pct: redVacancyValue,
          alavancagem_max_pct: leverageLimitValue,
        },
        acao_semaforo_vermelho: redAction,
      },
    };

    setError(null);
    setMessage(null);
    setIsCalculating(true);
    try {
      const response = await fetch("/api/aporte/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          getErrorMessage(result, "Não foi possível calcular o resultado."),
        );
      }
      if (!isSimulationResult(result)) {
        throw new Error("A resposta do motor está em formato inválido.");
      }
      setSimulation(result);
      setMessage("Cálculo concluído com as posições e regras informadas.");
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "O motor de aportes está indisponível. Tente novamente.",
      );
    } finally {
      setIsCalculating(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-36 pt-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Carteira Inteligente
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Motor de Aportes
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-400 md:text-base">
            Importe suas posições, configure suas metas e acompanhe o resultado
            matemático do cálculo de rebalanceamento.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="mb-5 flex items-center gap-3">
              <span className="rounded-xl bg-emerald-500/10 p-2 text-emerald-300">
                <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-semibold text-white">
                  Importar planilha da carteira
                </h2>
                <p className="text-sm text-slate-400">
                  Arquivo XLSX de até 5 MB.
                </p>
              </div>
            </div>
            <label
              htmlFor="portfolio-file"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-950 px-4 py-5 text-sm font-medium text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              {isImporting ? (
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-5 w-5" aria-hidden="true" />
              )}
              {isImporting ? "Importando planilha..." : "Selecionar arquivo XLSX"}
            </label>
            <input
              id="portfolio-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={handleImport}
              disabled={isImporting}
            />
            {portfolioSummary && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-950 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Ativos carregados
                  </p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {portfolioSummary.totalAssets}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-950 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Patrimônio importado
                  </p>
                  <p className="mt-1 text-lg font-semibold text-emerald-300">
                    {formatCurrency(portfolioSummary.totalValue)}
                  </p>
                </div>
              </div>
            )}
            {positions.length === 0 && (
              <p className="mt-4 text-sm text-slate-500">
                Importe uma planilha para habilitar o cálculo.
              </p>
            )}
          </div>

          <form
            onSubmit={handleCalculate}
            className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
          >
            <div>
              <h2 className="text-xl font-semibold text-white">
                Suas Metas e Regras
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Os valores começam vazios. Defina suas metas antes de calcular.
              </p>
            </div>

            <div>
              <label
                htmlFor="monthly-contribution"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Valor do aporte mensal (R$)
              </label>
              <input
                id="monthly-contribution"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={monthlyContribution}
                onChange={(event) => setMonthlyContribution(event.target.value)}
                placeholder="0,00"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>

            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-slate-200">
                Peso-alvo por classe (%)
              </legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ASSET_CLASSES.map((assetClass) => (
                  <label
                    key={assetClass}
                    className="space-y-1.5 text-sm text-slate-400"
                  >
                    <span>{assetClass}</span>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        inputMode="decimal"
                        value={classTargets[assetClass]}
                        onChange={(event) =>
                          setClassTargets((current) => ({
                            ...current,
                            [assetClass]: event.target.value,
                          }))
                        }
                        placeholder="0"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-9 text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                        %
                      </span>
                    </div>
                  </label>
                ))}
              </div>
              <p
                aria-live="polite"
                className={`mt-3 flex items-center gap-2 text-sm ${
                  targetsValid ? "text-emerald-300" : "text-amber-200"
                }`}
              >
                {targetsValid ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                )}
                Soma das metas: {targetTotal.toLocaleString("pt-BR", {
                  maximumFractionDigits: 2,
                })}%
                {targetsValid
                  ? " — total configurado."
                  : " — informe valores que totalizem 100%."}
              </p>
            </fieldset>

            <fieldset className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <legend className="px-2 text-sm font-semibold text-white">
                Limiares do semáforo de FIIs
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <ThresholdInput
                  id="vacancy-yellow"
                  label="Sua regra: vacância financeira — amarelo (%)"
                  value={vacancyYellow}
                  onChange={setVacancyYellow}
                  max="100"
                />
                <ThresholdInput
                  id="vacancy-red"
                  label="Sua regra: vacância financeira — vermelho (%)"
                  value={vacancyRed}
                  onChange={setVacancyRed}
                  max="100"
                />
                <ThresholdInput
                  id="physical-vacancy"
                  label="Sua regra: vacância física máxima (%) — opcional"
                  value={physicalVacancy}
                  onChange={setPhysicalVacancy}
                  max="100"
                />
                <ThresholdInput
                  id="leverage-limit"
                  label="Sua regra: alavancagem máxima (%) — opcional"
                  value={leverageLimit}
                  onChange={setLeverageLimit}
                />
              </div>
              <label
                htmlFor="red-action"
                className="block text-sm font-medium text-slate-300"
              >
                Sua regra: ação no semáforo vermelho
                <select
                  id="red-action"
                  value={redAction}
                  onChange={(event) => {
                    if (
                      event.target.value === "BLOQUEAR_APORTE" ||
                      event.target.value === "PERMITIR_APORTE"
                    ) {
                      setRedAction(event.target.value);
                    }
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                >
                  <option value="BLOQUEAR_APORTE">Bloquear aporte</option>
                  <option value="PERMITIR_APORTE">Apenas alertar</option>
                </select>
              </label>
              {yellowVacancyValue !== null &&
                yellowVacancyValue !== undefined &&
                redVacancyValue !== null &&
                redVacancyValue !== undefined &&
                yellowVacancyValue >= redVacancyValue && (
                  <p className="text-sm text-rose-300" role="alert">
                    O limiar amarelo deve ser menor que o limiar vermelho.
                  </p>
                )}
              {!thresholdsValid && (
                <p className="text-sm text-amber-200" aria-live="polite">
                  Informe os limiares amarelo e vermelho, com o amarelo abaixo
                  do vermelho.
                </p>
              )}
              <p className="text-xs leading-5 text-slate-500">
                Deixe os campos opcionais vazios para não aplicar esses limites.
              </p>
            </fieldset>

            <button
              type="submit"
              disabled={!canCalculate}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {isCalculating ? (
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Calculator className="h-5 w-5" aria-hidden="true" />
              )}
              {isCalculating
                ? "Calculando..."
                : "Calcular Rebalanceamento"}
            </button>
            {!targetsValid && (
              <p className="text-center text-xs text-slate-500">
                O cálculo será habilitado quando as metas somarem 100%.
              </p>
            )}
          </form>
        </section>

        {(message || error) && (
          <div
            role={error ? "alert" : "status"}
            className={`rounded-xl border px-4 py-3 text-sm ${
              error
                ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            {error ?? message}
          </div>
        )}

        {simulation && (
          <section aria-live="polite" className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                Resultado do cálculo
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Resultado calculado com as posições e regras informadas.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Patrimônio Atual"
                value={formatCurrency(simulation.patrimonio_atual)}
              />
              <SummaryCard
                label="Total Alocado"
                value={formatCurrency(simulation.total_alocado)}
                accent
              />
              <SummaryCard
                label="Troco Residual"
                value={formatCurrency(simulation.troco_residual)}
              />
              <SummaryCard
                label="Eficiência do Aporte"
                value={`${simulation.eficiencia_pct.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}%`}
              />
            </div>

            <DataTable title="Antes x Meta x Depois">
              <thead>
                <tr>
                  <TableHeader>Classe</TableHeader>
                  <TableHeader align="right">Antes</TableHeader>
                  <TableHeader align="right">Meta</TableHeader>
                  <TableHeader align="right">Depois</TableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {simulation.resumo_classes.map((item) => (
                  <tr key={item.classe}>
                    <TableCell>{item.classe}</TableCell>
                    <TableCell align="right">{formatPercent(item.atual_pct)}</TableCell>
                    <TableCell align="right">{formatPercent(item.meta_pct)}</TableCell>
                    <TableCell align="right">{formatPercent(item.depois_pct)}</TableCell>
                  </tr>
                ))}
              </tbody>
            </DataTable>

            <DataTable title="Resultados calculados">
              <thead>
                <tr>
                  <TableHeader>Ativo</TableHeader>
                  <TableHeader>Classe / Segmento</TableHeader>
                  <TableHeader align="right">Preço Atual</TableHeader>
                  <TableHeader align="right">Quantidade Calculada</TableHeader>
                  <TableHeader align="right">Total Estimado</TableHeader>
                  <TableHeader>PM Atual → PM Projetado</TableHeader>
                  <TableHeader>Semáforo</TableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {simulation.ordens.length === 0 ? (
                  <tr>
                    <TableCell colSpan={7}>
                      Nenhuma ordem calculada conforme as regras informadas.
                    </TableCell>
                  </tr>
                ) : (
                  simulation.ordens.map((order) => (
                    <tr key={order.ticker} className="align-top">
                      <TableCell className="font-semibold text-white">
                        {order.ticker}
                      </TableCell>
                      <TableCell>
                        <span className="block text-slate-200">{order.classe}</span>
                        <span className="text-xs text-slate-500">
                          {order.segmento}
                        </span>
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(order.preco_atual)}
                      </TableCell>
                      <TableCell align="right">
                        {formatQuantity(order.qtd_calculada)}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(order.total_estimado)}
                      </TableCell>
                      <TableCell>
                        <span className="whitespace-nowrap">
                          {formatCurrency(order.pm_anterior)} →{" "}
                          {formatCurrency(order.pm_projetado)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <SemaphoreBadge value={order.semaforo} />
                          {order.gatilhos_disparados.length > 0 && (
                            <ul className="min-w-48 space-y-1 text-xs text-slate-400">
                              {order.gatilhos_disparados.map((trigger, index) => (
                                <li key={`${order.ticker}-trigger-${index}`}>
                                  {trigger}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </TableCell>
                    </tr>
                  ))
                )}
              </tbody>
            </DataTable>

            <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
              <h3 className="font-semibold text-amber-100">
                Ativos Excluídos pelas Suas Regras
              </h3>
              {simulation.ativos_bloqueados.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">
                  Nenhum ativo foi excluído neste cálculo.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-amber-500/10">
                  {simulation.ativos_bloqueados.map((asset) => (
                    <li
                      key={asset.ticker}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-white">
                          {asset.ticker}{" "}
                          <span className="font-normal text-slate-400">
                            · {asset.classe} · {asset.segmento}
                          </span>
                        </p>
                        <ul className="mt-1 list-inside list-disc text-sm text-slate-400">
                          {asset.motivos.map((reason, index) => (
                            <li key={`${asset.ticker}-reason-${index}`}>
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <SemaphoreBadge value={asset.semaforo} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </section>
        )}
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 px-4 py-3 text-center text-xs leading-5 text-slate-400 backdrop-blur md:px-8">
        <em>
          Cálculo estritamente matemático baseado nas posições, metas e limiares
          configurados por você. Esta ferramenta não constitui recomendação,
          análise ou consultoria de valores mobiliários (Resoluções CVM 19 e 20).
        </em>
      </footer>
    </main>
  );
}

function ThresholdInput({
  id,
  label,
  value,
  onChange,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: string;
}) {
  return (
    <label htmlFor={id} className="space-y-1.5 text-sm text-slate-300">
      <span className="block">{label}</span>
      <div className="relative">
        <input
          id={id}
          type="number"
          min="0"
          max={max}
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Não configurado"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 pr-9 text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
          %
        </span>
      </div>
    </label>
  );
}

function SummaryCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold ${
          accent ? "text-emerald-300" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DataTable({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <h3 className="border-b border-slate-800 px-5 py-4 font-semibold text-white">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          {children}
        </table>
      </div>
    </section>
  );
}

function TableHeader({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
  align = "left",
  colSpan,
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`whitespace-nowrap px-4 py-3 text-slate-300 ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </td>
  );
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}
