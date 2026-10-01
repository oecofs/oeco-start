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
    { href: "/obras/configuracoes", label: "Configurações", icon: "⚙️" },
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
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Logo / Marca Oeco Obras */}
          <Link href="/obras" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-[#2C1810] text-white flex items-center justify-center text-sm font-black shadow-xs">
              🏗️
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-gray-900">Oeco</span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-100 text-amber-900">
                  Obras
                </span>
              </div>
              <p className="text-[10px] text-gray-500 font-medium -mt-0.5">Gestão Financeira de Obras</p>
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
              title="Ir para o Financeiro Geral (Oeco Start)"
              className="hidden sm:flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <span>💼</span> Financeiro Geral
            </Link>

            <button
              onClick={handleLogout}
              title="Sair"
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
            >
              🚪
            </button>
          </div>
        </div>
      </header>

      {/* Navegação Desktop (Sub-header com Início e Configurações) */}
      <div className="hidden md:block bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/obras"
                ? pathname === "/obras"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
                  isActive
                    ? "border-[#2C1810] text-[#2C1810] bg-gray-50"
                    : "border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50"
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
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 pb-20 md:pb-12">
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg px-6 py-2 flex items-center justify-around">
        {navItems.map((item) => {
          const isActive =
            item.href === "/obras"
              ? pathname === "/obras"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 px-4 rounded-xl transition-all ${
                isActive
                  ? "text-[#2C1810] font-black scale-105"
                  : "text-gray-500 font-medium hover:text-gray-800"
              }`}
            >
              <span className={`text-xl ${isActive ? "drop-shadow-xs" : "opacity-70"}`}>
                {item.icon}
              </span>
              <span className="text-[11px] leading-tight mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
