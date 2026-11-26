import { NextResponse } from "next/server";

const ENGINE_API_URL = (
  process.env.ENGINE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Selecione um arquivo .xlsx para importar." },
      { status: 400 },
    );
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json(
      { error: "O arquivo enviado deve ter extensão .xlsx." },
      { status: 415 },
    );
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "A planilha deve ter no máximo 5 MB." },
      { status: 413 },
    );
  }

  const engineFormData = new FormData();
  engineFormData.append("file", file, file.name);

  try {
    const response = await fetch(`${ENGINE_API_URL}/v1/import/xlsx`, {
      method: "POST",
      body: engineFormData,
      cache: "no-store",
    });
    const payload = await readJsonResponse(response);

    if (response.status === 422) {
      return NextResponse.json(
        {
          error: "A planilha não corresponde ao formato esperado.",
          details: upstreamDetail(payload),
        },
        { status: 422 },
      );
    }
    if (response.status >= 500) {
      return NextResponse.json(
        { error: "O motor de carteira está indisponível. Tente novamente." },
        { status: 503 },
      );
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: "O motor não conseguiu processar a planilha." },
        { status: 502 },
      );
    }
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: "O motor de carteira está indisponível. Tente novamente." },
      { status: 503 },
    );
  }
}
