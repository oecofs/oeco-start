"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

interface ObraItem {
  id: string;
  nome: string;
  cliente: string;
  endereco?: string;
  data_inicio: string;
  data_fim_previsto?: string;
  valor_contratado: number;
  status: "ativa" | "pausada" | "concluida" | "cancelada";
  observacoes?: string;
  total_aditivos: number;
  total_receitas: number;
  total_despesas: number;
}

export default function ListaObrasPage() {
  const { selectedCompany } = useCompany();
  const supabase = createClient();

  const [obras, setObras] = useState<ObraItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ativa");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!selectedCompany?.id) return;
    const currentCompanyId = selectedCompany.id;

    async function loadObrasAndFinances() {
      setLoading(true);
      try {
        // 1. Busca todas as obras da empresa
        const { data: obrasData, error: obrasErr } = await supabase
          .from("obras")
          .select("*")
          .eq("company_id", currentCompanyId)
          .order("created_at", { ascending: false });

        if (obrasErr) throw obrasErr;

        if (!obrasData || obrasData.length === 0) {
          setObras([]);
          setLoading(false);
          return;
        }

        const obraIds = obrasData.map((o) => o.id);

        // 2. Busca aditivos de todas as obras
        const { data: aditivosData } = await supabase
          .from("obra_aditivos")
          .select("obra_id, valor")
          .in("obra_id", obraIds);

        // 3. Busca transações de todas as obras
        const { data: transacoesData } = await supabase
          .from("obra_transacoes")
          .select("obra_id, tipo, valor, status_pagamento")
          .in("obra_id", obraIds);

        // Consolida métricas 360 por obra
        const obrasComMetricas: ObraItem[] = obrasData.map((obra) => {
          const aditivosTotal = (aditivosData || [])
            .filter((a) => a.obra_id === obra.id)
            .reduce((sum, a) => sum + Number(a.valor || 0), 0);

          const despesasTotal = (transacoesData || [])
            .filter((t) => t.obra_id === obra.id && t.tipo === "despesa")
            .reduce((sum, t) => sum + Number(t.valor || 0), 0);

          const receitasTotal = (transacoesData || [])
            .filter((t) => t.obra_id === obra.id && t.tipo === "receita")
            .reduce((sum, t) => sum + Number(t.valor || 0), 0);

          return {
            ...obra,
            valor_contratado: Number(obra.valor_contratado || 0),
            total_aditivos: aditivosTotal,
            total_despesas: despesasTotal,
            total_receitas: receitasTotal,
          };
        });

        setObras(obrasComMetricas);
      } catch (err) {
        console.error("Erro ao carregar lista de obras:", err);
      } finally {
        setLoading(false);
      }
    }

    loadObrasAndFinances();
  }, [selectedCompany, supabase]);

  const filteredObras = useMemo(() => {
    return obras.filter((obra) => {
      const matchStatus =
        statusFilter === "todas" ? true : obra.status === statusFilter;
      const matchSearch =
        obra.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        obra.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (obra.endereco && obra.endereco.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchStatus && matchSearch;
    });
  }, [obras, statusFilter, searchTerm]);

  function formatBRL(val: number) {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  const statusBadges = {
    ativa: { label: "Ativa", class: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    pausada: { label: "Pausada", class: "bg-amber-100 text-amber-800 border-amber-200" },
    concluida: { label: "Concluída", class: "bg-blue-100 text-blue-800 border-blue-200" },
    cancelada: { label: "Cancelada", class: "bg-gray-100 text-gray-700 border-gray-200" },
  };

  return (
    <div className="space-y-6">
      {/* Header com Ação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/obras"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              ←
            </Link>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900">
              Obras & Projetos
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Acompanhamento 360º de faturamento ao cliente, custos e aditivos.
          </p>
        </div>

        <Link
          href="/obras/lista/nova"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs sm:text-sm shadow-sm transition-all active:scale-95"
        >
          <span>➕</span> Cadastrar Nova Obra
        </Link>
      </div>

      {/* Barra de Filtros & Pesquisa */}
      <div className="bg-white rounded-2xl p-3 border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        {/* Filtros de Status em Pills */}
        <div className="flex gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "ativa", label: "Ativas" },
            { id: "pausada", label: "Pausadas" },
            { id: "concluida", label: "Concluídas" },
            { id: "todas", label: "Todas" },
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setStatusFilter(pill.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === pill.id
                  ? "bg-amber-800 text-white shadow-2xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Input de Busca */}
        <div className="w-full sm:flex-1 relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome da obra, cliente ou endereço..."
            className="w-full px-3.5 py-1.5 text-xs sm:text-sm rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-amber-500 font-medium"
          />
        </div>
      </div>

      {/* Lista de Obras com Visão 360 */}
      {loading ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-gray-200 text-gray-500 font-semibold animate-pulse">
          Carregando obras e balanços...
        </div>
      ) : filteredObras.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-gray-200 p-6 space-y-3">
          <span className="text-4xl">🏗️</span>
          <h3 className="text-base font-bold text-gray-800">Nenhuma obra encontrada</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {searchTerm
              ? "Tente ajustar os filtros ou a busca digitada."
              : "Cadastre sua primeira obra para começar a acompanhar custos e faturamento."}
          </p>
          <Link
            href="/obras/lista/nova"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-700 text-white font-bold text-xs"
          >
            + Cadastrar Primeira Obra
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {filteredObras.map((obra) => {
            const valorTotalContrato = obra.valor_contratado + obra.total_aditivos;
            const percentualFaturado =
              valorTotalContrato > 0
                ? Math.min(100, Math.round((obra.total_receitas / valorTotalContrato) * 100))
                : 0;
            const saldoAFaturar = Math.max(0, valorTotalContrato - obra.total_receitas);
            const saldoLucroObra = obra.total_receitas - obra.total_despesas;

            return (
              <div
                key={obra.id}
                className="bg-white rounded-3xl border border-gray-200 hover:border-amber-400 p-5 sm:p-6 shadow-xs hover:shadow-md transition-all space-y-4"
              >
                {/* Topo do Card */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg sm:text-xl font-black text-gray-900">
                        {obra.nome}
                      </h2>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                          statusBadges[obra.status]?.class || "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {statusBadges[obra.status]?.label || obra.status}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5 font-medium">
                      Cliente: <strong className="text-gray-800">{obra.cliente}</strong>
                      {obra.endereco && ` • 📍 ${obra.endereco}`}
                    </p>
                  </div>

                  <Link
                    href={`/obras/lista/${obra.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl transition-colors self-start"
                  >
                    Ver Visão 360º & Aditivos →
                  </Link>
                </div>

                {/* Barra de Faturamento do Cliente (% Cobrado vs Saldo a Cobrar) */}
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-gray-700 flex items-center gap-1.5">
                      <span>🧾</span> Cobrança do Cliente (Faturamento)
                    </span>
                    <span
                      className={
                        percentualFaturado >= 100
                          ? "text-emerald-700 font-black"
                          : "text-amber-700 font-bold"
                      }
                    >
                      {percentualFaturado >= 100
                        ? "✓ 100% Cobrado"
                        : `${percentualFaturado}% Faturado`}
                    </span>
                  </div>

                  {/* Barra de Progresso */}
                  <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        percentualFaturado >= 100 ? "bg-emerald-600" : "bg-amber-600"
                      }`}
                      style={{ width: `${percentualFaturado}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-gray-500 font-medium">
                    <span>
                      Faturado: <strong className="text-emerald-700">{formatBRL(obra.total_receitas)}</strong>
                    </span>
                    <span>
                      Saldo a Cobrar: <strong className="text-amber-800">{formatBRL(saldoAFaturar)}</strong>
                    </span>
                  </div>
                </div>

                {/* Painel Financeiro 360 (Cards de Métricas) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-gray-500 block text-[10px] font-bold uppercase">
                      Contrato Total
                    </span>
                    <span className="font-extrabold text-gray-900 text-sm">
                      {formatBRL(valorTotalContrato)}
                    </span>
                    {obra.total_aditivos > 0 && (
                      <span className="text-[10px] text-amber-700 block font-semibold">
                        +{formatBRL(obra.total_aditivos)} em aditivos
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-xl bg-red-50/60 border border-red-100">
                    <span className="text-red-700 block text-[10px] font-bold uppercase">
                      Despesas (Custos)
                    </span>
                    <span className="font-extrabold text-red-700 text-sm">
                      {formatBRL(obra.total_despesas)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
                    <span className="text-emerald-700 block text-[10px] font-bold uppercase">
                      Receitas (Entradas)
                    </span>
                    <span className="font-extrabold text-emerald-700 text-sm">
                      {formatBRL(obra.total_receitas)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-gray-500 block text-[10px] font-bold uppercase">
                      Resultado / Saldo
                    </span>
                    <span
                      className={`font-black text-sm ${
                        saldoLucroObra >= 0 ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {formatBRL(saldoLucroObra)}
                    </span>
                  </div>
                </div>

                {/* Ações Rápidas de Lançamento */}
                <div className="pt-2 flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/obras/registrar/despesa?obraId=${obra.id}`}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs transition-colors"
                  >
                    <span>💸</span> + Despesa com Foto
                  </Link>

                  <Link
                    href={`/obras/registrar/receita?obraId=${obra.id}`}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs transition-colors"
                  >
                    <span>💰</span> + Faturamento / Receita
                  </Link>

                  <Link
                    href={`/obras/relatorios?obraId=${obra.id}`}
                    className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors ml-auto"
                  >
                    <span>📊</span> Relatório
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
