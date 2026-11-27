'use client';

import { useState } from 'react';

export default function TermsAcceptanceGate({
  required,
  unavailable,
}: {
  required: boolean;
  unavailable: boolean;
}) {
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!required && !unavailable) return null;

  const acceptTerms = async () => {
    setMessage('');
    setIsSaving(true);
    try {
      const response = await fetch('/api/terms/accept', { method: 'POST' });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === 'string'
          ? payload.error
          : 'Não foi possível registrar o aceite.');
      }
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao registrar o aceite.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/95 p-4" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <section className="w-full max-w-xl space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl">
        <h1 id="terms-title" className="text-2xl font-bold">
          {unavailable ? 'Verificação temporariamente indisponível' : 'Confirmação de primeiro acesso'}
        </h1>
        {unavailable ? (
          <p role="alert" className="text-sm text-amber-200">
            Não foi possível verificar o aceite regulatório. Recarregue a página quando a conexão com o Supabase estiver disponível.
          </p>
        ) : (
          <>
            <p className="text-sm leading-6 text-slate-200">
              Esta ferramenta oferece apoio matemático baseado exclusivamente nas posições, metas e regras configuradas por você. Os resultados são descritivos e não constituem recomendação ou consultoria de valores mobiliários, conforme as Resoluções CVM 19 e 20.
            </p>
            <p className="text-xs text-slate-400">Versão dos termos: 2026-11-v1</p>
          </>
        )}
        {message && <p role="alert" className="text-sm text-rose-300">{message}</p>}
        {unavailable ? (
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-slate-700 px-4 py-2 font-semibold hover:bg-slate-600">
            Recarregar
          </button>
        ) : (
          <button type="button" onClick={acceptTerms} disabled={isSaving} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-60">
            {isSaving ? 'Registrando…' : 'Li e aceito'}
          </button>
        )}
      </section>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
