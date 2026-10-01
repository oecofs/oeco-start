"use client";

import React from "react";
import Link from "next/link";
import ObrasBackButton from "@/components/obras/ObrasBackButton";

export default function ObrasRegistrarHubPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <ObrasBackButton href="/obras" />
          <h1 className="text-xl sm:text-2xl font-black text-gray-900">
            Registrar Movimentação
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Selecione o tipo de lançamento que deseja realizar para a obra.
        </p>
      </div>

      {/* Opções de Lançamento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Nova Despesa (Destaque Principal) */}
        <Link
          href="/obras/registrar/despesa"
          className="group flex flex-col justify-between p-6 rounded-3xl bg-white border border-gray-200 hover:border-gray-400 shadow-2xs hover:shadow-xs transition-all active:scale-98"
        >
          <div>
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center text-2xl mb-4 group-hover:scale-105 transition-transform">
              💸
            </div>
            <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-red-100 text-red-700">
              Saída de Caixa
            </span>
            <h2 className="text-lg sm:text-xl font-black text-gray-900 mt-2 group-hover:text-red-700 transition-colors">
              Nova Despesa
            </h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Compra de material, pagamento de diária, combustível ou frete com leitura rápida via OCR.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-red-600 transition-transform">
              Lançar Despesa
            </span>
            <span className="text-lg">🧾</span>
          </div>
        </Link>

        {/* Nova Receita */}
        <Link
          href="/obras/registrar/receita"
          className="group flex flex-col justify-between p-6 rounded-3xl bg-white border border-gray-200 hover:border-gray-400 shadow-2xs hover:shadow-xs transition-all active:scale-98"
        >
          <div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-2xl mb-4 group-hover:scale-105 transition-transform">
              💰
            </div>
            <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-emerald-100 text-emerald-700">
              Entrada de Caixa
            </span>
            <h2 className="text-lg sm:text-xl font-black text-gray-900 mt-2 group-hover:text-emerald-700 transition-colors">
              Nova Receita
            </h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Medição paga pelo cliente, sinal de entrada, faturamento de etapa ou aditivo financeiro.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 transition-transform">
              Lançar Receita
            </span>
            <span className="text-lg">📈</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
