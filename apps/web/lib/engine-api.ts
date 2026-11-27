export function engineApiUrl(path: string): string {
  const baseUrl = (process.env.ENGINE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function readEngineError(response: Response, fallback: string): Promise<string> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return fallback;
  }

  if (isRecord(payload)) {
    if (typeof payload.detail === 'string') return payload.detail;
    if (typeof payload.error === 'string') return payload.error;
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
