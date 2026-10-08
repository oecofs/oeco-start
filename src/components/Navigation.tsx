"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getWhiteLabelConfig } from "@/lib/whitelabel";
import CompanySwitcher from "@/components/CompanySwitcher";
import { useCompany } from "@/contexts/CompanyContext";

export default function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const wl = getWhiteLabelConfig();
  const { selectedCompany, isModuleAccessible, isMaster } = useCompany();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isObrasOnly = selectedCompany?.segment === "obras_only";

  // Se a empresa ativa for estritamente "Obras Only", bloqueia e redireciona qualquer tentativa de acessar o financeiro geral
  useEffect(() => {
    if (isObrasOnly && !pathname.startsWith("/obras")) {
      router.replace("/obras");
    }
  }, [isObrasOnly, pathname, router]);

  // Fecha o menu mobile automaticamente ao trocar de rota
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    ...(isModuleAccessible("transactions")
      ? [{ href: "/transactions", label: "Transações", icon: "📋" }]
      : []),
    ...(isModuleAccessible("payables")
      ? [{ href: "/payables", label: "A Pagar", icon: "💸" }]
      : []),
    ...(isModuleAccessible("receivables")
      ? [{ href: "/receivables", label: "Recebíveis", icon: "💰" }]
      : []),
    ...(isModuleAccessible("cards")
      ? [{ href: "/cards", label: "Cartões", icon: "💳" }]
      : []),
    ...(isModuleAccessible("obras")
      ? [{ href: "/obras", label: "Obras", icon: "🏗️" }]
      : []),
    ...(isModuleAccessible("legal_cases")
      ? [{ href: "/legal-cases", label: "Processos", icon: "⚖️" }]
      : []),
    ...(isModuleAccessible("reports")
      ? [{ href: "/reports", label: "Relatórios", icon: "📑" }]
      : []),
    ...(isModuleAccessible("kpis")
      ? [{ href: "/kpis", label: "KPIs", icon: "🎯" }]
      : []),
    { href: "/settings", label: "Configurações", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* TOP BAR NO MOBILE COM BOTÃO HAMBÚRGUER */}
      <header className="md:hidden sticky top-0 left-0 right-0 bg-white border-b border-gray-200 px-3 py-2.5 flex items-center justify-between gap-2.5 z-40 print:hidden shadow-xs">
        <div className="flex items-center gap-2">
          {/* Botão Hambúrguer para abrir a Gaveta Lateral */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Abrir menu de navegação"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-700 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all text-lg cursor-pointer"
          >
            ☰
          </button>

          {wl.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wl.logoUrl} alt={wl.appName} className="h-6 object-contain" />
          ) : (
            <span className="text-base font-bold text-primary truncate max-w-[110px]">{wl.appName}</span>
          )}
        </div>

        <div className="w-48 max-w-[55%]">
          <CompanySwitcher />
        </div>
      </header>

      {/* DRAWER / BARRA LATERAL DESLIZANTE NO MOBILE */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="fixed inset-y-0 left-0 w-72 max-w-[82vw] bg-white z-50 flex flex-col shadow-2xl animate-in slide-in-from-left duration-250"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Topo do Drawer */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                {wl.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={wl.logoUrl} alt={wl.appName} className="h-7 object-contain" />
                ) : (
                  <span className="text-lg font-bold text-primary">{wl.appName}</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-900 bg-white border border-gray-200 font-bold text-sm cursor-pointer"
                aria-label="Fechar menu"
              >
                ✕
              </button>
            </div>

            {/* Empresa Ativa no Topo da Gaveta */}
            <div className="p-3 border-b border-gray-100 bg-slate-50/40">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                Empresa Ativa
              </span>
              <div className="text-xs font-bold text-gray-800 truncate">
                🏢 {selectedCompany?.name || "Nenhuma empresa"}
              </div>
            </div>

            {/* Lista Vertical com Todos os Módulos Habilitados */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-1 overscroll-contain">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-3 py-1.5 block">
                Módulos do Sistema
              </span>

              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${
                      isActive
                        ? "bg-primary text-white shadow-xs"
                        : "text-gray-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="text-xl">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {isActive && <span className="text-xs">●</span>}
                  </Link>
                );
              })}
            </nav>

            {/* Rodapé da Gaveta */}
            <div className="p-3.5 border-t border-gray-100 bg-slate-50/80 flex items-center justify-between text-xs text-gray-500">
              <span className="text-[11px]">OECO Sistema Financeiro</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                v1.2 Online
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR DESKTOP */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 flex-col z-40 print:hidden">
        {/* Logo / Nome no topo da sidebar */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          {wl.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={wl.logoUrl}
              alt={wl.appName}
              className="h-8 object-contain"
            />
          ) : (
            <span className="text-lg font-bold text-primary">{wl.appName}</span>
          )}
        </div>

        {/* Seletor de Empresa (Multi-Tenancy) */}
        <div className="p-3 border-b border-gray-100 bg-slate-50/50">
          <CompanySwitcher />
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-3 px-5 py-2.5 mx-2 rounded-xl text-sm transition-all duration-150 ${
                  isActive
                    ? "text-primary font-bold bg-[#2C1810]/[0.12]"
                    : "text-gray-500 font-medium hover:text-[#2C1810] hover:bg-[#2C1810]/[0.06]"
                }`}
              >
                {/* Barra lateral ativa */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                )}
                <span className={`transition-all duration-150 ${isActive ? "text-xl" : "text-lg opacity-70"}`}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {/* Ponto indicador direito */}
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary/50" />
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Conteúdo Principal */}
      <main className="md:ml-64 pb-20 md:pb-8 min-h-screen print:ml-0 print:pb-0 print:min-h-0">
        {children}
      </main>

      {/* BOTTOM NAVIGATION MINIMALISTA NO MOBILE (3 ATALHOS ESSENCIAIS) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-30 print:hidden shadow-lg">
        {/* 1. Dashboard */}
        <Link
          href="/dashboard"
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all ${
            pathname === "/dashboard" ? "text-primary font-bold" : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <span className="text-xl">📊</span>
          <span className="text-[10px]">Dashboard</span>
        </Link>

        {/* 2. Transações / Extrato */}
        <Link
          href="/transactions"
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all ${
            pathname === "/transactions" ? "text-primary font-bold" : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <span className="text-xl">📋</span>
          <span className="text-[10px]">Transações</span>
        </Link>

        {/* 3. Configurações */}
        <Link
          href="/settings"
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all ${
            pathname === "/settings" ? "text-primary font-bold" : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <span className="text-xl">⚙️</span>
          <span className="text-[10px]">Configurações</span>
        </Link>
      </nav>
    </div>
  );
}

