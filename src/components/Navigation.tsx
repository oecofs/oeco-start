"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getWhiteLabelConfig } from "@/lib/whitelabel";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/transactions", label: "Transações", icon: "📋" },
  { href: "/receivables", label: "Recebíveis", icon: "💰" },
  { href: "/settings", label: "Config", icon: "⚙️" },
];

export default function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wl = getWhiteLabelConfig();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 flex-col">
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

        <nav className="flex-1 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-primary bg-primary/10 border-r-2 border-primary"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Conteúdo principal */}
      <main className="md:ml-64 pb-20 md:pb-8 min-h-screen">
        {children}
      </main>

      {/* Bottom Navigation (mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-50">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
                isActive ? "text-primary" : "text-gray-400"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
