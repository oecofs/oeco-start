"use client";

import React from "react";
import Link from "next/link";
import { useCompany } from "@/contexts/CompanyContext";

export default function ObrasHomePage() {
  const { selectedCompany } = useCompany();

  const cards = [
    {
      title: "Registrar",
      description: "Lançamento rápido de despesas e receitas com leitura inteligente por IA.",
      icon: "⚡",
      href: "/obras/registrar",
      btnText: "Lançar Agora",
    },
    {
      title: "Obras",
      description: "Controle de obras, aditivos contratuais, faturamentos e cronograma.",
      icon: "🏗️",
      href: "/obras/lista",
      btnText: "Acessar Obras",
    },
    {
      title: "Fornecedores",
      description: "Lista de fornecedores de materiais, prestadores de serviço e histórico.",
      icon: "🏢",
      href: "/obras/fornecedores",
      btnText: "Ver Fornecedores",
    },
    {
      title: "Relatórios & KPIs",
      description: "Fluxo de caixa detalhado por obra, comparativos orçados e margem real.",
      icon: "📈",
      href: "/obras/relatorios",
      btnText: "Ver Relatórios",
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
            className="group relative flex flex-col justify-between items-center text-center p-4 sm:p-6 rounded-2xl bg-white border border-gray-200 hover:border-gray-400 shadow-2xs hover:shadow-xs transition-all duration-150 active:scale-[0.99] min-h-[190px] sm:min-h-[220px]"
          >
            <div className="flex flex-col items-center">
              {/* Ícone Centralizado */}
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gray-100 text-gray-800 flex items-center justify-center text-2xl sm:text-3xl font-bold group-hover:scale-105 transition-transform mb-3">
                {card.icon}
              </div>

              {/* Título e Descrição Centralizados */}
              <h2 className="text-base sm:text-lg font-black text-gray-900 group-hover:text-[#2C1810] transition-colors">
                {card.title}
              </h2>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-1 line-clamp-3 leading-relaxed font-medium">
                {card.description}
              </p>
            </div>

            {/* Rodapé / Botão de Ação Sóbrio Centralizado sem seta */}
            <div className="pt-3 mt-auto w-full">
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
