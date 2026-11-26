'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const isConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const signIn = async (method: 'password' | 'magic-link') => {
    setMessage('');
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para habilitar o acesso.');
      return;
    }

    setBusy(true);
    try {
      const result = method === 'password'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signInWithOtp({
            email,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
            },
          });
      if (result.error) throw result.error;
      if (method === 'password') {
        window.location.assign(nextPath);
      } else {
        setMessage('Se o endereço estiver cadastrado, você receberá um link de acesso por e-mail.');
      }
    } catch (error) {
      console.error('Falha ao iniciar a sessão:', error instanceof Error ? error.message : 'erro desconhecido');
      setMessage('Não foi possível iniciar a sessão. Verifique os dados ou solicite um novo Magic Link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="w-full space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100">
      <header>
        <h1 className="text-2xl font-bold">Entrar na Carteira Inteligente</h1>
        <p className="mt-2 text-sm text-slate-300">Acesse sua conta para carregar suas posições e configurações salvas.</p>
      </header>
      {!isConfigured && (
        <p role="status" className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
          Supabase não configurado. O aplicativo permanece em modo local; autenticação e persistência não estarão disponíveis.
        </p>
      )}
      <label className="block space-y-2 text-sm">
        <span>E-mail</span>
        <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
      </label>
      <label className="block space-y-2 text-sm">
        <span>Senha</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy || !isConfigured || !password} onClick={() => signIn('password')} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-50">
          {busy ? 'Aguarde…' : 'Entrar com senha'}
        </button>
        <button type="button" disabled={busy || !isConfigured || !email} onClick={() => signIn('magic-link')} className="rounded-lg border border-slate-600 px-4 py-2 font-semibold hover:bg-slate-800 disabled:opacity-50">
          Enviar Magic Link
        </button>
      </div>
      {message && <p role="status" className="text-sm text-slate-200">{message}</p>}
    </section>
  );
}
