import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

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
  description: "Carteira Snowball e motor de aportes determinístico.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="border-b border-slate-800 bg-slate-950 text-slate-100">
          <nav
            aria-label="Navegação principal"
            className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-8"
          >
            <Link href="/" className="font-semibold tracking-tight text-white">
              Carteira Inteligente
            </Link>
            <div className="flex items-center gap-2 text-sm">
              <Link
                href="/"
                className="rounded-lg px-3 py-2 text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                Carteira Snowball
              </Link>
              <Link
                href="/aporte"
                className="rounded-lg bg-emerald-500/10 px-3 py-2 font-medium text-emerald-300 transition hover:bg-emerald-500/20"
              >
                Motor de Aportes
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
