"use client";

import { useEffect, useMemo, useState } from "react";

const CLASSES = ["FIIs", "Ações", "Tesouro", "ETF", "FIAGRO"] as const;
const POSITION_CLASSES = [...CLASSES, "Renda Fixa"] as const;
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
  nota_pessoal?: string | null;
};
type ImportedPortfolio = {
  positions: PortfolioPosition[];
  patrimonio_total: number;
  resumo_por_classe: Record<string, number>;
  persistence?: { enabled: boolean };
};
type PositionImportResult = {
  positions: unknown[];
  persistence: { enabled: boolean };
};
type SimulationHistoryItem = {
  id: string;
  created_at: string;
  aporte_disponivel: number;
  total_alocado: number;
  troco_residual: number;
};
type ManualPositionForm = {
  ticker: string;
  classe: string;
  segmento: string;
  quantidade: string;
  preco_medio: string;
  preco_atual: string;
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
  semaforo: "VERDE" | "AMARELO" | "VERMELHO" | null;
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

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const EMPTY_MANUAL_POSITION: ManualPositionForm = {
  ticker: "",
  classe: "",
  segmento: "Outros",
  quantidade: "",
  preco_medio: "",
  preco_atual: "",
};

export default function ContributionsPage() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [loadedPortfolio, setLoadedPortfolio] =
    useState<ImportedPortfolio | null>(null);
  const [aporte, setAporte] = useState("");
  const [weights, setWeights] = useState<Record<AssetClass, string>>({
    FIIs: "0",
    Ações: "0",
    Tesouro: "0",
    ETF: "0",
    FIAGRO: "0",
  });
  const [yellowVacancy, setYellowVacancy] = useState("20");
  const [redVacancy, setRedVacancy] = useState("25");
  const [maximumLeverage, setMaximumLeverage] = useState("");
  const [redAction, setRedAction] = useState<"bloquear" | "alertar">(
    "bloquear"
  );
  const [fileBusy, setFileBusy] = useState(false);
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [segmentWeights, setSegmentWeights] = useState<Record<string, string>>(
    {}
  );
  const [manualPosition, setManualPosition] = useState(EMPTY_MANUAL_POSITION);
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [positionBusy, setPositionBusy] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [persistenceEnabled, setPersistenceEnabled] = useState<boolean | null>(
    null
  );
  const [history, setHistory] = useState<SimulationHistoryItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadSavedData = async () => {
      try {
        const responses = await Promise.all([
          fetch("/api/policy"),
          fetch("/api/positions"),
          fetch("/api/simulations"),
        ]);
        const payloads: unknown[] = await Promise.all(
          responses.map((response) => response.json())
        );
        if (responses.some((response) => !response.ok)) {
          const failedIndex = responses.findIndex((response) => !response.ok);
          throw new Error(
            readError(
              payloads[failedIndex],
              "Não foi possível carregar os dados salvos."
            )
          );
        }
        if (cancelled) return;

        const policyResult = payloads[0];
        const positionsResult = payloads[1];
        const historyResult = payloads[2];
        if (
          !isRecord(policyResult) ||
          typeof policyResult.configured !== "boolean"
        ) {
          throw new Error("Resposta inválida ao carregar as configurações.");
        }
        setPersistenceEnabled(policyResult.configured);

        if (isRecord(policyResult.policy)) {
          const savedPolicy = policyResult.policy;
          const savedClassTargets = savedPolicy.metas_classe;
          if (isRecord(savedClassTargets)) {
            setWeights(
              Object.fromEntries(
                CLASSES.map((assetClass) => [
                  assetClass,
                  String(toNumber(savedClassTargets[assetClass], 0) * 100),
                ])
              ) as Record<AssetClass, string>
            );
          }
          if (isRecord(savedPolicy.metas_segmento)) {
            setSegmentWeights(
              Object.fromEntries(
                Object.entries(savedPolicy.metas_segmento).map(
                  ([segment, value]) => [
                    segment,
                    String(toNumber(value, 0) * 100),
                  ]
                )
              )
            );
          }
          if (typeof savedPolicy.aporte_mensal_padrao_brl === "number") {
            setAporte(String(savedPolicy.aporte_mensal_padrao_brl));
          }
          if (isRecord(savedPolicy.gatilhos_semaforo_fii)) {
            const thresholds = savedPolicy.gatilhos_semaforo_fii;
            if (
              typeof thresholds.vacancia_financeira_amarelo_pct === "number"
            ) {
              setYellowVacancy(
                String(thresholds.vacancia_financeira_amarelo_pct)
              );
            }
            if (typeof thresholds.vacancia_financeira_max_pct === "number") {
              setRedVacancy(String(thresholds.vacancia_financeira_max_pct));
            }
            if (typeof thresholds.alavancagem_max_pct === "number") {
              setMaximumLeverage(String(thresholds.alavancagem_max_pct));
            }
            if (
              thresholds.acao_semaforo_vermelho === "bloquear" ||
              thresholds.acao_semaforo_vermelho === "alertar"
            ) {
              setRedAction(thresholds.acao_semaforo_vermelho);
            }
          }
        }

        if (
          !isRecord(positionsResult) ||
          !Array.isArray(positionsResult.positions)
        ) {
          throw new Error("Resposta inválida ao carregar as posições.");
        }
        const parsedPositions = positionsResult.positions.map(
          parsePortfolioPosition
        );
        if (parsedPositions.some((position) => position === null)) {
          throw new Error("Uma posição salva tem formato inválido.");
        }
        setPositions(
          parsedPositions.filter(
            (position): position is PortfolioPosition => position !== null
          )
        );

        if (
          !isRecord(historyResult) ||
          !Array.isArray(historyResult.simulations)
        ) {
          throw new Error("Resposta inválida ao carregar o histórico.");
        }
        setHistory(
          historyResult.simulations
            .map(parseSimulationHistoryItem)
            .filter((item): item is SimulationHistoryItem => item !== null)
        );
      } catch (error) {
        if (!cancelled)
          setMessage(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os dados salvos."
          );
      }
    };
    void loadSavedData();
    return () => {
      cancelled = true;
    };
  }, []);

  const weightTotal = useMemo(
    () =>
      Object.values(weights).reduce(
        (total, value) => total + (Number(value) || 0),
        0
      ),
    [weights]
  );
  const weightsAreValid = Math.round(weightTotal * 100) === 10000;
  const segmentNames = Array.from(
    new Set(positions.map((position) => position.segmento).filter(Boolean))
  ).sort();

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    setResult(null);
    setFileBusy(true);

    try {
      const isSnowballJson = file.name.toLowerCase().endsWith(".json");
      const data = new FormData();
      data.append("file", file);
      const response = await fetch(
        isSnowballJson ? "/api/import/json" : "/api/import/xlsx",
        { method: "POST", body: data }
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          readError(payload, "Não foi possível importar a planilha.")
        );
      }
      if (isSnowballJson) {
        if (!isPositionImportResult(payload)) {
          throw new Error(
            "O arquivo JSON não tem o formato exportado pela Carteira Snowball."
          );
        }
        const parsedPositions = payload.positions.map(parsePortfolioPosition);
        if (parsedPositions.some((position) => position === null)) {
          throw new Error("O arquivo JSON contém uma posição inválida.");
        }
        const importedPositions = parsedPositions.filter(
          (position): position is PortfolioPosition => position !== null
        );
        setLoadedPortfolio(null);
        setPositions(importedPositions);
        setPersistenceEnabled(payload.persistence.enabled);
        setMessage(
          payload.persistence.enabled
            ? `${importedPositions.length} ativos JSON carregados e salvos na sua conta.`
            : `${importedPositions.length} ativos JSON carregados apenas nesta sessão; Supabase não está configurado.`
        );
      } else {
        if (!isImportedPortfolio(payload)) {
          throw new Error(
            "O motor retornou um formato inesperado para a planilha."
          );
        }
        setLoadedPortfolio(payload);
        setPositions(payload.positions);
        const persisted =
          isRecord(payload.persistence) && payload.persistence.enabled === true;
        setPersistenceEnabled(persisted);
        setMessage(
          persisted
            ? `${payload.positions.length} ativos carregados e salvos na sua conta.`
            : `${payload.positions.length} ativos carregados apenas nesta sessão; Supabase não está configurado.`
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao importar a planilha."
      );
    } finally {
      setFileBusy(false);
      event.target.value = "";
    }
  };

  const saveManualPosition = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setMessage("");
    setPositionBusy(true);
    const previousPosition = positions.find(
      (position) => position.ticker === editingTicker
    );
    const payload = {
      ticker: manualPosition.ticker.trim().toUpperCase(),
      classe: manualPosition.classe,
      segmento: manualPosition.segmento.trim() || "Outros",
      quantidade: Number(manualPosition.quantidade),
      preco_medio:
        manualPosition.preco_medio === ""
          ? 0
          : Number(manualPosition.preco_medio),
      preco_atual: Number(manualPosition.preco_atual),
      habilitado_aporte: previousPosition?.habilitado_aporte ?? true,
      preco_teto_manual: previousPosition?.preco_teto_manual ?? null,
      nota_pessoal: previousPosition?.nota_pessoal ?? null,
    };

    try {
      const response = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: unknown = await response.json();
      if (!response.ok || !isRecord(result) || !isRecord(result.position)) {
        throw new Error(
          readError(result, "Não foi possível salvar a posição.")
        );
      }
      const savedPosition = parsePortfolioPosition(result.position);
      if (!savedPosition)
        throw new Error("O servidor retornou uma posição inválida.");
      setPositions((current) => {
        const found = current.some(
          (position) => position.ticker === savedPosition.ticker
        );
        return found
          ? current.map((position) =>
              position.ticker === savedPosition.ticker
                ? savedPosition
                : position
            )
          : [...current, savedPosition];
      });
      setPersistenceEnabled(result.persisted === true);
      setManualPosition(EMPTY_MANUAL_POSITION);
      setEditingTicker(null);
      setMessage(
        result.persisted === true
          ? "Posição salva na sua conta."
          : "Posição atualizada apenas nesta sessão; Supabase não está configurado."
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao salvar a posição."
      );
    } finally {
      setPositionBusy(false);
    }
  };

  const startEditingPosition = (position: PortfolioPosition) => {
    setEditingTicker(position.ticker);
    setManualPosition({
      ticker: position.ticker,
      classe: position.classe,
      segmento: position.segmento,
      quantidade: String(position.quantidade),
      preco_medio:
        position.preco_medio === null ? "" : String(position.preco_medio),
      preco_atual: String(position.preco_atual),
    });
  };

  const savePolicy = async () => {
    setMessage("");
    setPolicyBusy(true);
    const segmentTargets = Object.fromEntries(
      Object.entries(segmentWeights)
        .filter(([, value]) => value.trim() !== "")
        .map(([segment, value]) => [segment, Number(value) / 100])
    );
    try {
      const response = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aporte_mensal_padrao_brl: Number(aporte),
          metas_classe: Object.fromEntries(
            CLASSES.map((assetClass) => [
              assetClass,
              Number(weights[assetClass]) / 100,
            ])
          ),
          metas_segmento: segmentTargets,
          gatilhos_semaforo_fii: {
            vacancia_financeira_amarelo_pct: Number(yellowVacancy),
            vacancia_financeira_max_pct: Number(redVacancy),
            vacancia_fisica_max_pct: 25,
            alavancagem_max_pct:
              maximumLeverage === "" ? null : Number(maximumLeverage),
            acao_semaforo_vermelho: redAction,
            reducao_semaforo_amarelo_pct: 50,
          },
        }),
      });
      const saved: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          readError(saved, "Não foi possível salvar metas e regras.")
        );
      setPersistenceEnabled(isRecord(saved) && saved.configured === true);
      setMessage(
        isRecord(saved) && saved.saved === true
          ? "Metas e regras salvas na sua conta."
          : "Modo local: metas e regras não foram persistidas no Supabase."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Falha ao salvar metas e regras."
      );
    } finally {
      setPolicyBusy(false);
    }
  };

  const refreshHistory = async () => {
    const response = await fetch("/api/simulations");
    const payload: unknown = await response.json();
    if (
      !response.ok ||
      !isRecord(payload) ||
      !Array.isArray(payload.simulations)
    ) {
      throw new Error(
        readError(payload, "Não foi possível atualizar o histórico.")
      );
    }
    setHistory(
      payload.simulations
        .map(parseSimulationHistoryItem)
        .filter((item): item is SimulationHistoryItem => item !== null)
    );
  };

  const simulate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setSimulationBusy(true);
    const numericWeights = Object.fromEntries(
      CLASSES.map((assetClass) => [
        assetClass,
        Number(weights[assetClass]) / 100,
      ])
    );

    try {
      const response = await fetch("/api/aporte/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positions,
          aporte_disponivel: Number(aporte),
          policy: {
            metas_classe: numericWeights,
            metas_segmento: Object.fromEntries(
              Object.entries(segmentWeights)
                .filter(([, value]) => value.trim() !== "")
                .map(([segment, value]) => [segment, Number(value) / 100])
            ),
            gatilhos_semaforo_fii: {
              vacancia_financeira_amarelo_pct: Number(yellowVacancy),
              vacancia_financeira_max_pct: Number(redVacancy),
              vacancia_fisica_max_pct: 25,
              alavancagem_max_pct:
                maximumLeverage === "" ? null : Number(maximumLeverage),
            },
            acao_semaforo_vermelho: redAction,
            reducao_semaforo_amarelo_pct: 50,
          },
          fii_facts: {},
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isSimulationResult(payload)) {
        throw new Error(
          readError(payload, "Não foi possível calcular o rebalanceamento.")
        );
      }
      setResult(payload);
      const persisted = response.headers.get("X-Supabase-Persisted") === "true";
      setMessage(
        persisted
          ? "Resultado calculado e registrado no histórico imutável."
          : "Resultado calculado em modo local; o histórico não foi persistido."
      );
      if (persisted) {
        try {
          await refreshHistory();
        } catch (error) {
          setMessage(
            error instanceof Error
              ? `Resultado registrado; ${error.message}`
              : "Resultado registrado, mas o histórico não foi atualizado."
          );
        }
      }
    } catch (error) {
      setResult(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Falha ao calcular o rebalanceamento."
      );
    } finally {
      setSimulationBusy(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-8 px-4 py-8 text-slate-100 md:px-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
          Motor de Aportes
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          Metas e regras da sua carteira
        </h1>
      </header>

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">Importar posições</h2>
        <p className="mt-2 text-sm text-slate-300">
          Selecione uma planilha XLSX da B3 ou um JSON exportado pela Carteira
          Snowball, com até 5 MB.
        </p>
        <label className="mt-4 inline-flex cursor-pointer items-center rounded-lg bg-slate-700 px-4 py-2 font-medium hover:bg-slate-600">
          {fileBusy ? "Importando…" : "Selecionar XLSX ou JSON"}
          <input
            type="file"
            accept=".xlsx,.json,application/json"
            onChange={importFile}
            disabled={fileBusy}
            className="sr-only"
          />
        </label>
        {loadedPortfolio && (
          <p className="mt-4 text-sm text-emerald-300">
            {loadedPortfolio.positions.length} ativos · Patrimônio carregado:{" "}
            {currency.format(loadedPortfolio.patrimonio_total)}
          </p>
        )}
      </section>

      <section className="space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <div>
          <h2 className="text-xl font-semibold">
            {editingTicker ? "Editar posição" : "Adicionar posição manualmente"}
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            As posições são salvas por ticker na sua conta quando o Supabase
            está configurado.
          </p>
        </div>
        <form
          onSubmit={saveManualPosition}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <label className="space-y-2 text-sm">
            <span>Ticker</span>
            <input
              required
              value={manualPosition.ticker}
              disabled={editingTicker !== null}
              onChange={(event) =>
                setManualPosition((current) => ({
                  ...current,
                  ticker: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 disabled:opacity-60"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Classe</span>
            <select
              required
              value={manualPosition.classe}
              onChange={(event) =>
                setManualPosition((current) => ({
                  ...current,
                  classe: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
            >
              <option value="">Selecione uma classe</option>
              {POSITION_CLASSES.map((assetClass) => (
                <option key={assetClass} value={assetClass}>
                  {assetClass}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span>Segmento</span>
            <input
              value={manualPosition.segmento}
              onChange={(event) =>
                setManualPosition((current) => ({
                  ...current,
                  segmento: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Quantidade</span>
            <input
              required
              type="number"
              min="0"
              step="0.000001"
              value={manualPosition.quantidade}
              onChange={(event) =>
                setManualPosition((current) => ({
                  ...current,
                  quantidade: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Preço médio (R$)</span>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={manualPosition.preco_medio}
              onChange={(event) =>
                setManualPosition((current) => ({
                  ...current,
                  preco_medio: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Preço atual (R$)</span>
            <input
              required
              type="number"
              min="0"
              step="0.0001"
              value={manualPosition.preco_atual}
              onChange={(event) =>
                setManualPosition((current) => ({
                  ...current,
                  preco_atual: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={positionBusy}
              className="rounded-lg bg-slate-700 px-4 py-2 font-semibold hover:bg-slate-600 disabled:opacity-60"
            >
              {positionBusy
                ? "Salvando…"
                : editingTicker
                ? "Salvar alterações"
                : "Adicionar posição"}
            </button>
            {editingTicker && (
              <button
                type="button"
                onClick={() => {
                  setEditingTicker(null);
                  setManualPosition(EMPTY_MANUAL_POSITION);
                }}
                className="rounded-lg border border-slate-600 px-4 py-2 hover:bg-slate-800"
              >
                Cancelar edição
              </button>
            )}
          </div>
        </form>

        {positions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="text-left text-slate-300">
                <tr>
                  <th className="p-3">Ticker</th>
                  <th className="p-3">Classe</th>
                  <th className="p-3">Segmento</th>
                  <th className="p-3 text-right">Quantidade</th>
                  <th className="p-3 text-right">Preço atual</th>
                  <th className="p-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => (
                  <tr
                    key={position.ticker}
                    className="border-t border-slate-800"
                  >
                    <td className="p-3 font-semibold">{position.ticker}</td>
                    <td className="p-3">{position.classe}</td>
                    <td className="p-3">{position.segmento}</td>
                    <td className="p-3 text-right">
                      {decimal.format(position.quantidade)}
                    </td>
                    <td className="p-3 text-right">
                      {currency.format(position.preco_atual)}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => startEditingPosition(position)}
                        className="rounded border border-slate-600 px-3 py-1 hover:bg-slate-800"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form
        onSubmit={simulate}
        className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-6"
      >
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
          <legend className="text-base font-semibold">
            Metas por classe (%)
          </legend>
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
                  onChange={(event) =>
                    setWeights((current) => ({
                      ...current,
                      [assetClass]: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
                />
              </label>
            ))}
          </div>
          <p
            className={`mt-3 text-sm ${
              weightsAreValid ? "text-emerald-300" : "text-amber-300"
            }`}
          >
            Soma configurada: {weightTotal.toFixed(2)}%{" "}
            {weightsAreValid ? "· válida" : "· informe exatamente 100%"}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Dentro de cada classe, a distribuição segue os pesos atuais das
            posições elegíveis; valores sem unidade compatível permanecem como
            troco.
          </p>
        </fieldset>

        {segmentNames.length > 0 && (
          <fieldset>
            <legend className="text-base font-semibold">
              Metas por segmento (%) — opcionais
            </legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {segmentNames.map((segment) => (
                <label key={segment} className="space-y-2 text-sm">
                  <span>{segment}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={segmentWeights[segment] ?? ""}
                    onChange={(event) =>
                      setSegmentWeights((current) => ({
                        ...current,
                        [segment]: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
                  />
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="rounded-xl border border-slate-700 p-4">
          <legend className="px-2 text-base font-semibold">
            Semáforo de FIIs — Sua regra
          </legend>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-2 text-sm">
              <span>Sua regra: vacância financeira amarela (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={yellowVacancy}
                onChange={(event) => setYellowVacancy(event.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>Sua regra: vacância financeira vermelha (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={redVacancy}
                onChange={(event) => setRedVacancy(event.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>Sua regra: alavancagem máxima (%)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={maximumLeverage}
                onChange={(event) => setMaximumLeverage(event.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>Sua regra: ativo no vermelho</span>
              <select
                value={redAction}
                onChange={(event) =>
                  setRedAction(event.target.value as "bloquear" | "alertar")
                }
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
              >
                <option value="bloquear">Bloquear aporte</option>
                <option value="alertar">Apenas alertar</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Ativos amarelos recebem redução de 50% na parcela calculada. Ativos
            sem dados do relatório aparecem com os gatilhos ausentes.
          </p>
        </fieldset>

        <button
          type="button"
          onClick={savePolicy}
          disabled={policyBusy || !weightsAreValid || aporte === ""}
          className="rounded-lg border border-slate-500 px-5 py-3 font-semibold hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {policyBusy ? "Salvando…" : "Salvar metas e regras"}
        </button>
        <button
          type="submit"
          disabled={
            simulationBusy || positions.length === 0 || !weightsAreValid
          }
          className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {simulationBusy ? "Calculando…" : "Calcular Rebalanceamento"}
        </button>
        {message && (
          <p role="status" className="text-sm text-slate-300">
            {message}
          </p>
        )}
      </form>

      {result && (
        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Patrimônio Atual"
              value={currency.format(result.patrimonio_atual_brl)}
            />
            <SummaryCard
              label="Total Alocado"
              value={currency.format(result.total_alocado)}
            />
            <SummaryCard
              label="Troco Residual"
              value={currency.format(result.troco_residual)}
            />
            <SummaryCard
              label="Eficiência do Aporte"
              value={`${decimal.format(result.eficiencia_aporte_pct)}%`}
            />
          </div>

          <section className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">
              Antes x Meta x Depois por classe
            </h2>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-slate-300">
                <tr>
                  <th className="p-3">Classe</th>
                  <th className="p-3 text-right">Antes</th>
                  <th className="p-3 text-right">Meta</th>
                  <th className="p-3 text-right">Depois</th>
                </tr>
              </thead>
              <tbody>
                {result.comparativo_classes.map((item) => (
                  <tr key={item.classe} className="border-t border-slate-800">
                    <td className="p-3">{item.classe}</td>
                    <td className="p-3 text-right">
                      {decimal.format(item.percentual_atual)}%
                    </td>
                    <td className="p-3 text-right">
                      {decimal.format(item.meta_pct)}%
                    </td>
                    <td className="p-3 text-right">
                      {decimal.format(item.percentual_depois)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">
              Resultados calculados
            </h2>
            {result.ordens.length === 0 ? (
              <p className="text-sm text-slate-300">
                Nenhuma ordem calculada para as posições e regras informadas.
              </p>
            ) : (
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="text-left text-slate-300">
                  <tr>
                    <th className="p-3">Ativo</th>
                    <th className="p-3">Classe</th>
                    <th className="p-3">Segmento</th>
                    <th className="p-3 text-right">Preço Atual</th>
                    <th className="p-3 text-right">Quantidade Calculada</th>
                    <th className="p-3 text-right">Total Estimado</th>
                    <th className="p-3">PM Atual → PM Projetado</th>
                    <th className="p-3">Semáforo</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ordens.map((order) => (
                    <tr
                      key={order.ticker}
                      className="border-t border-slate-800 align-top"
                    >
                      <td className="p-3 font-semibold">{order.ticker}</td>
                      <td className="p-3">{order.classe}</td>
                      <td className="p-3">{order.segmento}</td>
                      <td className="p-3 text-right">
                        {currency.format(order.preco_atual)}
                      </td>
                      <td className="p-3 text-right">
                        {decimal.format(order.quantidade_calculada)}
                      </td>
                      <td className="p-3 text-right">
                        {currency.format(order.total_estimado)}
                      </td>
                      <td className="p-3">
                        {order.preco_medio_atual === null ||
                        order.preco_medio_projetado === null
                          ? "Não informado"
                          : `${currency.format(
                              order.preco_medio_atual
                            )} → ${currency.format(
                              order.preco_medio_projetado
                            )}`}
                      </td>
                      <td className="p-3">
                        {order.semaforo ? (
                          <SemaphoreBadge value={order.semaforo} />
                        ) : (
                          "Não se aplica"
                        )}
                        {order.regras_acionadas.length > 0 && (
                          <p className="mt-1 max-w-xs text-xs text-slate-400">
                            {order.regras_acionadas.join("; ")}
                            {order.pagina_fonte
                              ? ` (p. ${order.pagina_fonte})`
                              : ""}
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
            <h2 className="mb-4 text-lg font-semibold">
              Ativos Excluídos pelas Suas Regras
            </h2>
            {result.ativos_excluidos.length === 0 ? (
              <p className="text-sm text-slate-300">
                Nenhum ativo excluído pelas regras informadas.
              </p>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-slate-300">
                  <tr>
                    <th className="p-3">Ativo</th>
                    <th className="p-3">Classe</th>
                    <th className="p-3">Motivo objetivo</th>
                    <th className="p-3">Semáforo e fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ativos_excluidos.map((asset, index) => (
                    <tr
                      key={`${asset.ticker}-${index}`}
                      className="border-t border-slate-800 align-top"
                    >
                      <td className="p-3 font-semibold">{asset.ticker}</td>
                      <td className="p-3">{asset.classe}</td>
                      <td className="p-3">{asset.motivo}</td>
                      <td className="p-3">
                        {asset.semaforo ? (
                          <SemaphoreBadge value={asset.semaforo} />
                        ) : (
                          "—"
                        )}
                        {asset.regras_acionadas.map((rule) => (
                          <p key={rule} className="mt-1 text-xs text-slate-400">
                            {rule}
                            {asset.pagina_fonte
                              ? ` (p. ${asset.pagina_fonte})`
                              : ""}
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

      <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">Histórico de Simulações</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-300">
            {persistenceEnabled === false
              ? "O histórico remoto aparece quando o Supabase está configurado e conectado."
              : "Nenhuma simulação registrada nesta conta."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-slate-300">
                <tr>
                  <th className="p-3">Data</th>
                  <th className="p-3 text-right">Aporte</th>
                  <th className="p-3 text-right">Total alocado</th>
                  <th className="p-3 text-right">Troco residual</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 5).map((simulation) => (
                  <tr key={simulation.id} className="border-t border-slate-800">
                    <td className="p-3">
                      {new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(simulation.created_at))}
                    </td>
                    <td className="p-3 text-right">
                      {currency.format(simulation.aporte_disponivel)}
                    </td>
                    <td className="p-3 text-right">
                      {currency.format(simulation.total_alocado)}
                    </td>
                    <td className="p-3 text-right">
                      {currency.format(simulation.troco_residual)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-700 bg-slate-950/95 px-4 py-3 text-center text-xs text-slate-300 backdrop-blur">
        Cálculo estritamente matemático baseado nas posições, metas e limiares
        configurados por você. Esta ferramenta não constitui recomendação,
        análise ou consultoria de valores mobiliários (Resoluções CVM 19 e 20).
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

function SemaphoreBadge({
  value,
}: {
  value: "VERDE" | "AMARELO" | "VERMELHO" | string;
}) {
  const style =
    value === "VERDE"
      ? "bg-emerald-900 text-emerald-200"
      : value === "AMARELO"
      ? "bg-amber-900 text-amber-200"
      : "bg-rose-900 text-rose-200";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${style}`}
    >
      {value}
    </span>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readError(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : fallback;
}

function isImportedPortfolio(value: unknown): value is ImportedPortfolio {
  return (
    isRecord(value) &&
    Array.isArray(value.positions) &&
    typeof value.patrimonio_total === "number" &&
    isRecord(value.resumo_por_classe)
  );
}

function isPositionImportResult(value: unknown): value is PositionImportResult {
  return (
    isRecord(value) &&
    Array.isArray(value.positions) &&
    isRecord(value.persistence) &&
    typeof value.persistence.enabled === "boolean"
  );
}

function parsePortfolioPosition(value: unknown): PortfolioPosition | null {
  if (
    !isRecord(value) ||
    typeof value.ticker !== "string" ||
    typeof value.classe !== "string"
  ) {
    return null;
  }
  const quantidade = toNumber(value.quantidade, Number.NaN);
  const precoAtual = toNumber(value.preco_atual, Number.NaN);
  const precoMedio =
    value.preco_medio === null ? null : toNumber(value.preco_medio, Number.NaN);
  if (
    !Number.isFinite(quantidade) ||
    quantidade < 0 ||
    !Number.isFinite(precoAtual) ||
    precoAtual < 0 ||
    (precoMedio !== null && (!Number.isFinite(precoMedio) || precoMedio < 0))
  ) {
    return null;
  }
  return {
    ticker: value.ticker,
    classe: value.classe,
    segmento: typeof value.segmento === "string" ? value.segmento : "Outros",
    quantidade,
    preco_medio: precoMedio,
    preco_atual: precoAtual,
    ...(typeof value.habilitado_aporte === "boolean"
      ? { habilitado_aporte: value.habilitado_aporte }
      : {}),
    ...(typeof value.preco_teto_manual === "number" ||
    value.preco_teto_manual === null
      ? { preco_teto_manual: value.preco_teto_manual }
      : {}),
    ...(typeof value.nota_pessoal === "string" || value.nota_pessoal === null
      ? { nota_pessoal: value.nota_pessoal }
      : {}),
  };
}

function parseSimulationHistoryItem(
  value: unknown
): SimulationHistoryItem | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.created_at !== "string" ||
    !Number.isFinite(Date.parse(value.created_at))
  ) {
    return null;
  }
  const aporteDisponivel = toNumber(value.aporte_disponivel, Number.NaN);
  const totalAlocado = toNumber(value.total_alocado, Number.NaN);
  const trocoResidual = toNumber(value.troco_residual, Number.NaN);
  if (![aporteDisponivel, totalAlocado, trocoResidual].every(Number.isFinite))
    return null;
  return {
    id: value.id,
    created_at: value.created_at,
    aporte_disponivel: aporteDisponivel,
    total_alocado: totalAlocado,
    troco_residual: trocoResidual,
  };
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" && typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isSimulationResult(value: unknown): value is SimulationResult {
  return (
    isRecord(value) &&
    typeof value.patrimonio_atual_brl === "number" &&
    typeof value.total_alocado === "number" &&
    typeof value.troco_residual === "number" &&
    typeof value.eficiencia_aporte_pct === "number" &&
    Array.isArray(value.comparativo_classes) &&
    Array.isArray(value.ordens) &&
    Array.isArray(value.ativos_excluidos)
  );
}
