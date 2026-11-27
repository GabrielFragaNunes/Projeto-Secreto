import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import TermsAcceptanceGate from "@/components/TermsAcceptanceGate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { CURRENT_TERMS_VERSION } from "@/lib/supabase/terms";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Carteira Inteligente",
  description: "Ferramentas matemáticas para acompanhar metas patrimoniais.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabaseConfigured = isSupabaseConfigured();
  let termsRequired = false;
  let termsUnavailable = false;

  if (supabaseConfigured) {
    const supabase = await createSupabaseServerClient({ readOnly: true });
    if (!supabase) {
      termsUnavailable = true;
    } else {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) {
        console.error(
          "Falha ao verificar a sessão para os termos:",
          authError.message
        );
        termsUnavailable = true;
      } else if (user) {
        const { data: policy, error: policyError } = await supabase
          .from("user_portfolio_policies")
          .select("terms_version, terms_accepted_at")
          .eq("user_id", user.id)
          .maybeSingle();
        if (policyError) {
          console.error(
            "Falha ao verificar os termos aceitos:",
            policyError.message
          );
          termsUnavailable = true;
        } else {
          termsRequired =
            policy?.terms_version !== CURRENT_TERMS_VERSION ||
            !policy?.terms_accepted_at;
        }
      }
    }
  }

  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-slate-950">
          <header className="border-b border-slate-800 bg-slate-900">
            <nav
              aria-label="Navegação principal"
              className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 md:px-8"
            >
              <Link
                href="/"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
              >
                Carteira Snowball
              </Link>
              <Link
                href="/aporte"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
              >
                Motor de Aportes
              </Link>
              <Link
                href="/projecao"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
              >
                Projeção Patrimonial
              </Link>
            </nav>
          </header>
          {!supabaseConfigured && (
            <p
              role="status"
              className="border-b border-amber-700 bg-amber-950/50 px-4 py-2 text-center text-sm text-amber-100"
            >
              Supabase não configurado: modo local sem autenticação nem
              persistência remota. Defina NEXT_PUBLIC_SUPABASE_URL e
              NEXT_PUBLIC_SUPABASE_ANON_KEY para habilitar esses recursos.
            </p>
          )}
          {children}
          <TermsAcceptanceGate
            required={termsRequired}
            unavailable={termsUnavailable}
          />
        </div>
      </body>
    </html>
  );
}
