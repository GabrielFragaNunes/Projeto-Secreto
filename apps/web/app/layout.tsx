import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
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
  description: "Ferramentas matemáticas para acompanhar metas patrimoniais.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-screen bg-slate-950">
          <header className="border-b border-slate-800 bg-slate-900">
            <nav
              aria-label="Navegação principal"
              className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 md:px-8"
            >
              <Link href="/" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800">
                Carteira Snowball
              </Link>
              <Link href="/aporte" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800">
                Motor de Aportes
              </Link>
              <Link href="/projecao" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800">
                Projeção Patrimonial
              </Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
