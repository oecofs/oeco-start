"use client";

import React from "react";
import Link from "next/link";
import { useCompany } from "@/contexts/CompanyContext";

export default function ObrasHomePage() {
  const { selectedCompany } = useCompany();

  const cards = [
    {
      title: "Registrar",
      badge: "Mais Utilizado",
      badgeColor: "bg-amber-100 text-amber-900 border-amber-200",
      description: "Lançamento rápido de despesas e receitas com foto e leitura por IA.",
      icon: "⚡",
      href: "/obras/registrar",
      bgGradient: "from-amber-500/10 via-amber-500/5 to-transparent",
      borderColor: "border-amber-300 hover:border-amber-500",
      iconBg: "bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-md shadow-amber-500/20",
      btnText: "Lançar Agora →",
      btnColor: "bg-amber-600 hover:bg-amber-700 text-white",
    },
    {
      title: "Obras",
      badge: "Visão 360º",
      badgeColor: "bg-blue-100 text-blue-900 border-blue-200",
      description: "Controle de obras, aditivos contratuais, faturamentos e cronograma.",
      icon: "🏗️",
      href: "/obras/lista",
      bgGradient: "from-blue-500/10 via-blue-500/5 to-transparent",
      borderColor: "border-blue-200 hover:border-blue-400",
      iconBg: "bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/20",
      btnText: "Acessar Obras →",
      btnColor: "bg-blue-600 hover:bg-blue-700 text-white",
    },
    {
      title: "Fornecedores",
      badge: "Cadastros",
      badgeColor: "bg-emerald-100 text-emerald-900 border-emerald-200",
      description: "Lista de fornecedores de materiais, prestadores de serviço e histórico.",
      icon: "🏢",
      href: "/obras/fornecedores",
      bgGradient: "from-emerald-500/10 via-emerald-500/5 to-transparent",
      borderColor: "border-emerald-200 hover:border-emerald-400",
      iconBg: "bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-500/20",
      btnText: "Ver Fornecedores →",
      btnColor: "bg-emerald-600 hover:bg-emerald-700 text-white",
    },
    {
      title: "Relatórios & KPIs",
      badge: "Indicadores",
      badgeColor: "bg-purple-100 text-purple-900 border-purple-200",
      description: "DRE por obra, comparativo orçado x realizado, custos e margem real.",
      icon: "📈",
      href: "/obras/relatorios",
      bgGradient: "from-purple-500/10 via-purple-500/5 to-transparent",
      borderColor: "border-purple-200 hover:border-purple-400",
      iconBg: "bg-gradient-to-br from-purple-600 to-fuchsia-700 text-white shadow-md shadow-purple-500/20",
      btnText: "Ver Indicadores →",
      btnColor: "bg-purple-600 hover:bg-purple-700 text-white",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Banner de Boas-vindas / Contexto */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-amber-900/10 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🚜</span>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-gray-900">
              Painel Oeco Obras
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Empresa ativa:{" "}
            <span className="font-bold text-amber-950">
              {selectedCompany?.name || "Carregando..."}
            </span>
          </p>
        </div>

        <Link
          href="/obras/registrar/despesa"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-all active:scale-95"
        >
          <span>📸</span> Nova Despesa com Foto
        </Link>
      </div>

      {/* Grid 2x2: 2 cards por linha tanto no desktop quanto no mobile */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className={`group relative flex flex-col justify-between p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-white border ${card.borderColor} bg-gradient-to-b ${card.bgGradient} shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] min-h-[220px] sm:min-h-[260px]`}
          >
            <div>
              {/* Topo do Card: Ícone e Badge */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div
                  className={`w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl ${card.iconBg}`}
                >
                  {card.icon}
                </div>
                <span
                  className={`text-[9px] sm:text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${card.badgeColor}`}
                >
                  {card.badge}
                </span>
              </div>

              {/* Título e Descrição */}
              <h2 className="text-base sm:text-xl font-black text-gray-900 group-hover:text-amber-900 transition-colors">
                {card.title}
              </h2>
              <p className="text-[11px] sm:text-xs text-gray-600 mt-1.5 line-clamp-3 leading-relaxed font-medium">
                {card.description}
              </p>
            </div>

            {/* Rodapé / Botão de Ação */}
            <div className="pt-4 mt-auto">
              <span
                className={`inline-flex items-center justify-center w-full py-2 px-3 rounded-xl text-xs sm:text-sm font-bold shadow-2xs transition-all ${card.btnColor}`}
              >
                {card.btnText}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
