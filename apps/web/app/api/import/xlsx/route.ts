import { engineApiUrl, readEngineError } from '@/lib/engine-api';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    if (error instanceof TypeError) {
      return Response.json({ error: 'Envie o arquivo como multipart/form-data.' }, { status: 400 });
    }
    throw error;
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'Selecione uma planilha XLSX para importar.' }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return Response.json({ error: 'O arquivo deve ter extensão .xlsx.' }, { status: 415 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: 'A planilha não pode exceder 5 MB.' }, { status: 413 });
  }

  const forwarded = new FormData();
  forwarded.append('file', file, file.name);
  try {
    const response = await fetch(engineApiUrl('/v1/import/xlsx'), {
      method: 'POST',
      body: forwarded,
      cache: 'no-store',
    });
    if (!response.ok) {
      const message = await readEngineError(response, 'Não foi possível importar a planilha.');
      return Response.json({ error: message }, { status: response.status });
    }
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return Response.json(
        { error: 'O motor de importação está indisponível. Verifique se a API está em execução.' },
        { status: 503 },
      );
    }
    throw error;
  }
}
