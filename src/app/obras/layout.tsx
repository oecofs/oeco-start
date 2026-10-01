"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import CompanySwitcher from "@/components/CompanySwitcher";
import { createClient } from "@/lib/supabase/client";

export default function ObrasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const navItems = [
    { href: "/obras", label: "Início", icon: "🏠" },
    { href: "/obras/registrar", label: "Registrar", icon: "⚡" },
    { href: "/obras/lista", label: "Obras", icon: "🏗️" },
    { href: "/obras/fornecedores", label: "Fornecedores", icon: "🏢" },
    { href: "/obras/relatorios", label: "Relatórios", icon: "📈" },
  ];

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/obras/login");
  }

  // Se for a página de login dedicada de obras, renderiza sem a casca do app
  if (pathname === "/obras/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-gray-800 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-amber-900/10 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Logo / Marca Oeco Obras */}
          <Link href="/obras" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-600 to-amber-800 text-white flex items-center justify-center text-lg shadow-sm group-hover:scale-105 transition-transform">
              🏗️
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-gray-900">Óeco</span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-100 text-amber-900">
                  Obras
                </span>
              </div>
              <p className="text-[10px] text-gray-600 font-medium -mt-0.5">Gestão Financeira de Obras</p>
            </div>
          </Link>

          {/* Seleção de Empresa & Ações */}
          <div className="flex items-center gap-2">
            <div className="w-44 sm:w-60">
              <CompanySwitcher />
            </div>

            {/* Link para voltar ao Oeco Start Principal no Desktop */}
            <Link
              href="/dashboard"
              title="Ir para o Financeiro Geral (Óeco Start)"
              className="hidden sm:flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <span>💼</span> Financeiro Geral
            </Link>

            <button
              onClick={handleLogout}
              title="Sair"
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
            >
              🚪
            </button>
          </div>
        </div>
      </header>

      {/* Navegação Desktop (Sub-header elegante) */}
      <div className="hidden md:block bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/obras"
                ? pathname === "/obras"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
                  isActive
                    ? "border-amber-700 text-amber-950 font-bold bg-amber-50/60"
                    : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 pb-24 md:pb-12">
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar (Fixo na base para uso ágil no canteiro de obras) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/98 backdrop-blur-md border-t border-gray-200 shadow-lg px-2 py-1 flex items-center justify-around">
        {navItems.map((item) => {
          const isActive =
            item.href === "/obras"
              ? pathname === "/obras"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all ${
                isActive
                  ? "text-amber-900 font-extrabold scale-105"
                  : "text-gray-600 font-medium hover:text-gray-800"
              }`}
            >
              <span className={`text-xl ${isActive ? "drop-shadow-sm" : "opacity-80"}`}>
                {item.icon}
              </span>
              <span className="text-[10px] leading-tight mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
