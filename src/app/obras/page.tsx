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
      badgeColor: "bg-amber-50 text-amber-900 border-amber-200",
      description: "Lançamento de despesas e receitas da obra com anexo de comprovante e OCR.",
      icon: "⚡",
      href: "/obras/registrar",
      btnText: "Lançar Agora →",
    },
    {
      title: "Obras",
      badge: "Visão 360º",
      badgeColor: "bg-slate-100 text-slate-800 border-slate-200",
      description: "Controle de obras, aditivos de contrato, medições e status de faturamento.",
      icon: "🏗️",
      href: "/obras/lista",
      btnText: "Acessar Obras →",
    },
    {
      title: "Fornecedores",
      badge: "Cadastros",
      badgeColor: "bg-slate-100 text-slate-800 border-slate-200",
      description: "Lista de lojas de materiais, prestadores de serviço e histórico de compras.",
      icon: "🏢",
      href: "/obras/fornecedores",
      btnText: "Ver Fornecedores →",
    },
    {
      title: "Relatórios & KPIs",
      badge: "Indicadores",
      badgeColor: "bg-slate-100 text-slate-800 border-slate-200",
      description: "Fluxo de caixa detalhado por obra, comparativos e indicadores de margem.",
      icon: "📈",
      href: "/obras/relatorios",
      btnText: "Ver Relatórios →",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Grid 2x2: 2 cards por linha tanto no desktop quanto no mobile */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group relative flex flex-col justify-between p-4 sm:p-6 rounded-2xl bg-white border border-gray-200 hover:border-gray-400 shadow-2xs hover:shadow-xs transition-all duration-150 active:scale-[0.99] min-h-[190px] sm:min-h-[230px]"
          >
            <div>
              {/* Topo do Card: Ícone e Badge */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gray-100 text-gray-800 flex items-center justify-center text-xl sm:text-2xl font-bold group-hover:scale-105 transition-transform">
                  {card.icon}
                </div>
                <span
                  className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${card.badgeColor}`}
                >
                  {card.badge}
                </span>
              </div>

              {/* Título e Descrição */}
              <h2 className="text-base sm:text-lg font-black text-gray-900 group-hover:text-[#2C1810] transition-colors">
                {card.title}
              </h2>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-1 line-clamp-3 leading-relaxed font-medium">
                {card.description}
              </p>
            </div>

            {/* Rodapé / Botão de Ação Sóbrio */}
            <div className="pt-3 mt-auto">
              <span className="inline-flex items-center justify-center w-full py-2 px-3 rounded-xl text-xs font-bold bg-[#2C1810] hover:bg-black text-white shadow-2xs transition-colors">
                {card.btnText}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
