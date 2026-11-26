import { NextResponse } from "next/server";

const ENGINE_API_URL = (
  process.env.ENGINE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");
const CLASSES = ["FIIs", "Ações", "Tesouro", "ETF", "FIAGRO"] as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text };
  }
}

function upstreamDetail(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  if (typeof payload.detail === "string") return payload.detail;
  if (Array.isArray(payload.detail)) {
    const messages = payload.detail.flatMap((item) =>
      isRecord(item) && typeof item.msg === "string" ? [item.msg] : [],
    );
    return messages.length > 0 ? messages.join("; ") : undefined;
  }
  return undefined;
}

function validatePayload(payload: unknown): string | undefined {
  if (!isRecord(payload)) return "O conteúdo enviado deve ser um objeto JSON.";
  if (
    !Array.isArray(payload.positions) ||
    !payload.positions.every(isRecord)
  ) {
    return "A carteira deve conter uma lista de posições importadas.";
  }
  if (!isFiniteNumber(payload.aporte_disponivel) || payload.aporte_disponivel < 0) {
    return "Informe um aporte mensal igual ou maior que zero.";
  }
  if (!isRecord(payload.policy) || !isRecord(payload.policy.metas_classe)) {
    return "Configure as metas por classe antes de calcular.";
  }

  const metas = payload.policy.metas_classe;
  if (Object.keys(metas).length !== CLASSES.length) {
    return "Informe uma meta para cada uma das cinco classes.";
  }

  let totalMetas = 0;
  for (const assetClass of CLASSES) {
    const weight = metas[assetClass];
    if (!isFiniteNumber(weight) || weight < 0 || weight > 100) {
      return `A meta de ${assetClass} deve estar entre 0% e 100%.`;
    }
    totalMetas += weight;
  }
  if (Math.abs(totalMetas - 100) > 0.0001) {
    return "A soma das metas por classe deve ser exatamente 100%.";
  }

  if (!isRecord(payload.policy.gatilhos_semaforo_fii)) {
    return "Configure os limiares do semáforo de FIIs.";
  }
  const thresholds = payload.policy.gatilhos_semaforo_fii;
  const yellowVacancy = thresholds.vacancia_financeira_amarelo_pct;
  const redVacancy = thresholds.vacancia_financeira_max_pct;
  if (
    !isFiniteNumber(yellowVacancy) ||
    yellowVacancy < 0 ||
    yellowVacancy > 100 ||
    !isFiniteNumber(redVacancy) ||
    redVacancy < 0 ||
    redVacancy > 100 ||
    yellowVacancy >= redVacancy
  ) {
    return "O limiar amarelo de vacância financeira deve ser menor que o vermelho.";
  }

  const physicalVacancy = thresholds.vacancia_fisica_max_pct;
  if (
    physicalVacancy !== undefined &&
    physicalVacancy !== null &&
    (!isFiniteNumber(physicalVacancy) ||
      physicalVacancy < 0 ||
      physicalVacancy > 100)
  ) {
    return "O limite de vacância física deve estar entre 0% e 100%, ou ficar vazio.";
  }

  const leverage = thresholds.alavancagem_max_pct;
  if (
    leverage !== undefined &&
    leverage !== null &&
    (!isFiniteNumber(leverage) || leverage < 0)
  ) {
    return "O limite de alavancagem deve ser igual ou maior que zero, ou ficar vazio.";
  }

  const redAction = payload.policy.acao_semaforo_vermelho;
  if (redAction !== "BLOQUEAR_APORTE" && redAction !== "PERMITIR_APORTE") {
    return "Selecione como tratar ativos com semáforo vermelho.";
  }
  return undefined;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "O conteúdo enviado não é um JSON válido." },
      { status: 400 },
    );
  }

  const validationMessage = validatePayload(payload);
  if (validationMessage) {
    return NextResponse.json({ error: validationMessage }, { status: 422 });
  }

  if (!isRecord(payload) || !isRecord(payload.policy)) {
    return NextResponse.json(
      { error: "Configure as metas e regras antes de calcular." },
      { status: 422 },
    );
  }
  const metas = payload.policy.metas_classe;
  if (!isRecord(metas)) {
    return NextResponse.json(
      { error: "Configure as metas por classe antes de calcular." },
      { status: 422 },
    );
  }

  const normalizedWeights: JsonRecord = {};
  for (const assetClass of CLASSES) {
    const weight = metas[assetClass];
    if (!isFiniteNumber(weight)) {
      return NextResponse.json(
        { error: `A meta de ${assetClass} não é válida.` },
        { status: 422 },
      );
    }
    normalizedWeights[assetClass] = weight / 100;
  }

  const enginePayload = {
    ...payload,
    policy: {
      ...payload.policy,
      metas_classe: normalizedWeights,
    },
  };

  try {
    const response = await fetch(`${ENGINE_API_URL}/v1/aporte/simular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enginePayload),
      cache: "no-store",
    });
    const result = await readJsonResponse(response);

    if (response.status === 422) {
      return NextResponse.json(
        {
          error: "Os dados não passaram pela validação do motor.",
          details: upstreamDetail(result),
        },
        { status: 422 },
      );
    }
    if (response.status >= 500) {
      return NextResponse.json(
        { error: "O motor de aportes está indisponível. Tente novamente." },
        { status: 503 },
      );
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: "O motor não conseguiu concluir a simulação." },
        { status: 502 },
      );
    }
    return NextResponse.json(result, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: "O motor de aportes está indisponível. Tente novamente." },
      { status: 503 },
    );
  }
}
