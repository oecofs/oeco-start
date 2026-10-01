"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import CompanySwitcher from "@/components/CompanySwitcher";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export default function ObrasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { selectedCompany, isMaster, loading: companyLoading } = useCompany();

  const isObrasOnly = selectedCompany?.segment === "obras_only";
  const isCompanyObrasEnabled =
    selectedCompany?.segment === "obras_only" ||
    selectedCompany?.segment === "obras_financial";

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

  // Se a empresa não tem o módulo de obras habilitado, exibe tela informativa idêntica ao módulo jurídico
  if (!companyLoading && selectedCompany && !isCompanyObrasEnabled) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="p-4 md:p-8 max-w-3xl mx-auto text-center py-16 space-y-4">
          <div className="text-5xl">🏗️</div>
          <h2 className="text-2xl font-bold text-gray-900">Módulo Obras Desativado</h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            A empresa ativa <strong>{selectedCompany.name}</strong> está configurada no segmento padrão (Comércio/Serviços Gerais).
          </p>
          {isMaster ? (
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/settings"
                className="bg-[#2C1810] text-white text-xs font-semibold px-5 py-2.5 rounded-xl hover:bg-black transition-colors inline-block"
              >
                Ativar Módulo Obras em Configurações (Master) →
              </Link>
              <Link
                href="/dashboard"
                className="bg-white border border-gray-300 text-gray-700 text-xs font-semibold px-5 py-2.5 rounded-xl hover:bg-gray-100 transition-colors inline-block"
              >
                Ir para o Financeiro Geral
              </Link>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <p className="text-xs text-gray-400">
                Solicite ao administrador Master a ativação do módulo de obras para este cliente.
              </p>
              <Link
                href="/dashboard"
                className="bg-[#2C1810] text-white text-xs font-semibold px-5 py-2.5 rounded-xl hover:bg-black transition-colors inline-block"
              >
                Ir para o Financeiro Geral
              </Link>
            </div>
          )}
        </div>
      </div>
    );
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

            {/* Link para voltar ao Oeco Start Principal no Desktop (Apenas se não for Obras Only) */}
            {!isObrasOnly && (
              <Link
                href="/dashboard"
                title="Ir para o Financeiro Geral (Oeco Start)"
                className="hidden sm:flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <span>💼</span> Financeiro Geral
              </Link>
            )}

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
