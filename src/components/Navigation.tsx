"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getWhiteLabelConfig } from "@/lib/whitelabel";
import CompanySwitcher from "@/components/CompanySwitcher";

import { useCompany } from "@/contexts/CompanyContext";

const defaultNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/transactions", label: "Transações", icon: "📋" },
  { href: "/receivables", label: "Recebíveis", icon: "💰" },
  { href: "/payables", label: "A Pagar", icon: "💳" },
  { href: "/settings", label: "Config", icon: "⚙️" },
];

export default function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wl = getWhiteLabelConfig();
  const { selectedCompany } = useCompany();

  const isLegal = selectedCompany?.segment === "legal";

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/transactions", label: "Transações", icon: "📋" },
    { href: "/receivables", label: "Recebíveis", icon: "💰" },
    { href: "/payables", label: "A Pagar", icon: "💳" },
    ...(isLegal ? [{ href: "/legal-cases", label: "Processos", icon: "⚖️" }] : []),
    { href: "/settings", label: "Config", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar no Mobile */}
      <header className="md:hidden sticky top-0 left-0 right-0 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between gap-3 z-40 print:hidden">
        <div className="flex items-center gap-2">
          {wl.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wl.logoUrl} alt={wl.appName} className="h-6 object-contain" />
          ) : (
            <span className="text-base font-bold text-primary">{wl.appName}</span>
          )}
        </div>
        <div className="w-56 max-w-[65%]">
          <CompanySwitcher />
        </div>
      </header>

      {/* Sidebar (desktop) */}
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

        <nav className="flex-1 py-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-3 px-5 py-2.5 mx-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "text-primary bg-[#2C1810]/8 font-semibold"
                    : "text-gray-500 hover:text-gray-900 hover:bg-[#2C1810]/5"
                }`}
              >
                {/* Barra lateral ativa */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                )}
                <span className={`transition-all duration-150 ${isActive ? "text-xl" : "text-lg opacity-80"}`}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {/* Ponto indicador direito */}
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary/60" />
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Conteúdo principal */}
      <main className="md:ml-64 pb-20 md:pb-8 min-h-screen print:ml-0 print:pb-0 print:min-h-0">
        {children}
      </main>

      {/* Bottom Navigation (mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-50 print:hidden">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all duration-150 ${
                isActive ? "text-primary" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {isActive && (
                <span className="absolute top-1 w-8 h-0.5 rounded-full bg-primary" />
              )}
              <span className={`transition-all duration-150 ${isActive ? "text-2xl" : "text-xl"}`}>
                {item.icon}
              </span>
              <span className={`text-[10px] font-medium ${isActive ? "font-bold" : ""}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
