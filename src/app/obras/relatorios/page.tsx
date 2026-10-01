"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

interface ObraSummary {
  id: string;
  nome: string;
  cliente: string;
  valor_contratado: number;
  total_aditivos: number;
  total_receitas: number;
  total_despesas: number;
}

interface TransacaoItem {
  id: string;
  obra_id: string;
  obra_nome?: string;
  tipo: "receita" | "despesa";
  descricao: string;
  valor: number;
  data_movimentacao: string;
  forma_pagamento?: string;
  categoria_nome?: string;
  fornecedor_nome?: string;
}

function ObrasRelatoriosContent() {
  const searchParams = useSearchParams();
  const filterObraId = searchParams.get("obraId");

  const { selectedCompany } = useCompany();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"relatorios" | "kpis">("relatorios");
  const [obras, setObras] = useState<ObraSummary[]>([]);
  const [transacoes, setTransacoes] = useState<TransacaoItem[]>([]);
  const [selectedObraFilter, setSelectedObraFilter] = useState(filterObraId || "todas");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedCompany?.id) return;
    const currentCompanyId = selectedCompany.id;

    async function loadReportData() {
      setLoading(true);
      try {
        const { data: obrasData } = await supabase
          .from("obras")
          .select("id, nome, cliente, valor_contratado")
          .eq("company_id", currentCompanyId);

        const obraIds = (obrasData || []).map((o) => o.id);

        let aditivosData: any[] = [];
        let transacoesData: any[] = [];

        if (obraIds.length > 0) {
          const { data: adit } = await supabase
            .from("obra_aditivos")
            .select("obra_id, valor")
            .in("obra_id", obraIds);
          aditivosData = adit || [];

          const { data: trans } = await supabase
            .from("obra_transacoes")
            .select("id, obra_id, tipo, descricao, valor, data_movimentacao, forma_pagamento, categoria_nome, fornecedor_nome")
            .in("obra_id", obraIds)
            .order("data_movimentacao", { ascending: false });
          transacoesData = trans || [];
        }

        const obrasMap = new Map((obrasData || []).map((o) => [o.id, o.nome]));

        const list: ObraSummary[] = (obrasData || []).map((o) => {
          const adit = aditivosData
            .filter((a) => a.obra_id === o.id)
            .reduce((s, a) => s + Number(a.valor || 0), 0);

          const rec = transacoesData
            .filter((t) => t.obra_id === o.id && t.tipo === "receita")
            .reduce((s, t) => s + Number(t.valor || 0), 0);

          const desp = transacoesData
            .filter((t) => t.obra_id === o.id && t.tipo === "despesa")
            .reduce((s, t) => s + Number(t.valor || 0), 0);

          return {
            id: o.id,
            nome: o.nome,
            cliente: o.cliente,
            valor_contratado: Number(o.valor_contratado || 0),
            total_aditivos: adit,
            total_receitas: rec,
            total_despesas: desp,
          };
        });

        setObras(list);
        setTransacoes(
          transacoesData.map((t) => ({
            ...t,
            valor: Number(t.valor || 0),
            obra_nome: obrasMap.get(t.obra_id) || "Obra",
          }))
        );
      } catch (err) {
        console.error("Erro ao carregar dados dos relatórios:", err);
      } finally {
        setLoading(false);
      }
    }

    loadReportData();
  }, [selectedCompany, supabase]);

  function formatBRL(val: number) {
    return (val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  // Filtragem de Obras
  const filteredObras =
    selectedObraFilter === "todas"
      ? obras
      : obras.filter((o) => o.id === selectedObraFilter);

  // Filtragem de Transações para o Fluxo de Caixa
  const filteredTransacoes =
    selectedObraFilter === "todas"
      ? transacoes
      : transacoes.filter((t) => t.obra_id === selectedObraFilter);

  const receitasList = filteredTransacoes.filter((t) => t.tipo === "receita");
  const despesasList = filteredTransacoes.filter((t) => t.tipo === "despesa");

  // Métricas Globais ou Filtradas
  const totalContratos = filteredObras.reduce(
    (s, o) => s + o.valor_contratado + o.total_aditivos,
    0
  );
  const totalReceitas = filteredTransacoes
    .filter((t) => t.tipo === "receita")
    .reduce((s, t) => s + t.valor, 0);

  const totalDespesas = filteredTransacoes
    .filter((t) => t.tipo === "despesa")
    .reduce((s, t) => s + t.valor, 0);

  const lucroLiquido = totalReceitas - totalDespesas;
  const saldoAFaturar = Math.max(0, totalContratos - totalReceitas);

  // KPIs
  const margemLiquidaPct =
    totalReceitas > 0 ? ((lucroLiquido / totalReceitas) * 100).toFixed(1) : "0.0";
  const margemBrutaPct =
    totalContratos > 0
      ? (((totalContratos - totalDespesas) / totalContratos) * 100).toFixed(1)
      : "0.0";
  const execucaoOrcamentoPct =
    totalContratos > 0 ? ((totalDespesas / totalContratos) * 100).toFixed(1) : "0.0";
  const faturamentoPct =
    totalContratos > 0 ? ((totalReceitas / totalContratos) * 100).toFixed(1) : "0.0";

  // Agrupamento de Despesas por Categoria para KPIs
  const despesasPorCategoria = despesasList.reduce((acc, t) => {
    const cat = t.categoria_nome || "Outros / Não categorizado";
    acc[cat] = (acc[cat] || 0) + t.valor;
    return acc;
  }, {} as Record<string, number>);

  const categoriasOrdenadas = Object.entries(despesasPorCategoria).sort(
    (a, b) => b[1] - a[1]
  );

  // Agrupamento por Fornecedor para KPIs
  const despesasPorFornecedor = despesasList.reduce((acc, t) => {
    const forn = t.fornecedor_nome || "Sem Fornecedor Informado";
    acc[forn] = (acc[forn] || 0) + t.valor;
    return acc;
  }, {} as Record<string, number>);

  const fornecedoresOrdenados = Object.entries(despesasPorFornecedor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Header */}
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
              Relatórios & KPIs de Obras
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Fluxo de caixa estruturado, acompanhamento de custos e indicadores financeiros de projetos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gray-900 hover:bg-black text-white font-bold text-xs sm:text-sm shadow-2xs transition-all"
        >
          <span>🖨️</span> Imprimir / PDF
        </button>
      </div>

      {/* Sub-abas: Relatórios vs KPIs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("relatorios")}
          className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-all ${
            activeTab === "relatorios"
              ? "border-[#2C1810] text-[#2C1810] bg-white shadow-2xs"
              : "border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50"
          }`}
        >
          📊 Relatórios (Fluxo de Caixa)
        </button>
        <button
          onClick={() => setActiveTab("kpis")}
          className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-all ${
            activeTab === "kpis"
              ? "border-[#2C1810] text-[#2C1810] bg-white shadow-2xs"
              : "border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50"
          }`}
        >
          📈 Indicadores & KPIs
        </button>
      </div>

      {/* Filtro por Obra */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-700 whitespace-nowrap">
            Filtrar Obra:
          </span>
          <select
            value={selectedObraFilter}
            onChange={(e) => setSelectedObraFilter(e.target.value)}
            className="w-full sm:w-80 px-3 py-1.5 rounded-xl border border-gray-300 text-xs sm:text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="todas">🏗️ Todas as Obras (Visão Consolidada)</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome} ({o.cliente})
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-gray-500 font-medium">
          {filteredObras.length} {filteredObras.length === 1 ? "obra selecionada" : "obras selecionadas"}
        </div>
      </div>

      {/* ABA 1: RELATÓRIOS (FLUXO DE CAIXA PADRÃO) */}
      {activeTab === "relatorios" && (
        <div className="space-y-6">
          {/* Resumo Rápido */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-gray-400 block">
                Total Contratado
              </span>
              <div className="text-base sm:text-lg font-black text-gray-900 mt-1">
                {formatBRL(totalContratos)}
              </div>
              <span className="text-[10px] text-amber-800 block mt-0.5 font-semibold">
                A faturar: {formatBRL(saldoAFaturar)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/30 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                (+) Receitas Realizadas
              </span>
              <div className="text-base sm:text-lg font-black text-emerald-700 mt-1">
                {formatBRL(totalReceitas)}
              </div>
              <span className="text-[10px] text-emerald-600 block mt-0.5 font-semibold">
                {faturamentoPct}% do contrato faturado
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-red-200 bg-red-50/30 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-red-700 block">
                (-) Despesas Realizadas
              </span>
              <div className="text-base sm:text-lg font-black text-red-700 mt-1">
                {formatBRL(totalDespesas)}
              </div>
              <span className="text-[10px] text-red-600 block mt-0.5 font-semibold">
                {execucaoOrcamentoPct}% do contrato gasto
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-gray-400 block">
                (=) Saldo Operacional
              </span>
              <div
                className={`text-base sm:text-lg font-black mt-1 ${
                  lucroLiquido >= 0 ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {formatBRL(lucroLiquido)}
              </div>
              <span className="text-[10px] text-gray-500 block mt-0.5 font-semibold">
                Margem líquida: {margemLiquidaPct}%
              </span>
            </div>
          </div>

          {/* FLUXO DE CAIXA ESTRUTURADO: RECEITAS NO TOPO, DESPESAS ABAIXO */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-gray-900">
                  Fluxo de Caixa Estruturado da Obra
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Receitas de faturamento no topo e despesas operacionais detalhadas abaixo.
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-gray-200 text-gray-800">
                {filteredTransacoes.length} lançamentos
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-gray-500 font-semibold animate-pulse">
                Carregando fluxo de caixa...
              </div>
            ) : filteredTransacoes.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">
                Nenhuma receita ou despesa registrada para o filtro selecionado.
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {/* 1. SEÇÃO DE RECEITAS (NO TOPO) */}
                <div className="bg-emerald-50/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                      <h3 className="text-xs font-black uppercase tracking-wider text-emerald-900">
                        1. Entradas / Receitas de Faturamento
                      </h3>
                    </div>
                    <span className="text-sm font-black text-emerald-700">
                      Total: {formatBRL(totalReceitas)}
                    </span>
                  </div>

                  {receitasList.length === 0 ? (
                    <p className="text-xs text-emerald-800/70 italic py-1">
                      Nenhum faturamento registrado nesta obra ainda.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs bg-white rounded-xl border border-emerald-100 overflow-hidden">
                        <thead>
                          <tr className="bg-emerald-100/60 text-emerald-900 font-bold uppercase text-[10px]">
                            <th className="p-2.5">Data</th>
                            <th className="p-2.5">Obra</th>
                            <th className="p-2.5">Descrição</th>
                            <th className="p-2.5">Forma</th>
                            <th className="p-2.5 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-50 font-medium text-gray-700">
                          {receitasList.map((r) => (
                            <tr key={r.id} className="hover:bg-emerald-50/50">
                              <td className="p-2.5 whitespace-nowrap">
                                {new Date(r.data_movimentacao + "T00:00:00").toLocaleDateString("pt-BR")}
                              </td>
                              <td className="p-2.5 font-semibold text-gray-900">{r.obra_nome}</td>
                              <td className="p-2.5 font-bold text-gray-900">{r.descricao}</td>
                              <td className="p-2.5 uppercase text-[10px] text-gray-500">
                                {r.forma_pagamento || "PIX"}
                              </td>
                              <td className="p-2.5 text-right font-black text-emerald-700">
                                + {formatBRL(r.valor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 2. SEÇÃO DE DESPESAS (DESCENDO NAS LINHAS) */}
                <div className="bg-red-50/20 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                      <h3 className="text-xs font-black uppercase tracking-wider text-red-900">
                        2. Saídas / Despesas e Custos Operacionais
                      </h3>
                    </div>
                    <span className="text-sm font-black text-red-700">
                      Total: {formatBRL(totalDespesas)}
                    </span>
                  </div>

                  {despesasList.length === 0 ? (
                    <p className="text-xs text-red-800/70 italic py-1">
                      Nenhuma despesa registrada nesta obra ainda.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs bg-white rounded-xl border border-red-100 overflow-hidden">
                        <thead>
                          <tr className="bg-red-50 text-red-900 font-bold uppercase text-[10px]">
                            <th className="p-2.5">Data</th>
                            <th className="p-2.5">Obra</th>
                            <th className="p-2.5">Categoria</th>
                            <th className="p-2.5">Descrição</th>
                            <th className="p-2.5">Fornecedor</th>
                            <th className="p-2.5">Pagamento</th>
                            <th className="p-2.5 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-red-50 font-medium text-gray-700">
                          {despesasList.map((d) => (
                            <tr key={d.id} className="hover:bg-red-50/40">
                              <td className="p-2.5 whitespace-nowrap">
                                {new Date(d.data_movimentacao + "T00:00:00").toLocaleDateString("pt-BR")}
                              </td>
                              <td className="p-2.5 font-semibold text-gray-900">{d.obra_nome}</td>
                              <td className="p-2.5">
                                <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-800 text-[10px] font-bold">
                                  {d.categoria_nome || "Geral"}
                                </span>
                              </td>
                              <td className="p-2.5 font-bold text-gray-900">{d.descricao}</td>
                              <td className="p-2.5 text-gray-600">{d.fornecedor_nome || "—"}</td>
                              <td className="p-2.5 uppercase text-[10px] text-gray-500">
                                {d.forma_pagamento || "PIX"}
                              </td>
                              <td className="p-2.5 text-right font-black text-red-600">
                                - {formatBRL(d.valor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 3. RESUMO LÍQUIDO NO RODAPÉ */}
                <div className="p-4 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <span className="text-xs font-bold text-gray-700 uppercase">
                    Resultado Líquido do Fluxo de Caixa:
                  </span>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-lg font-black ${
                        lucroLiquido >= 0 ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {formatBRL(lucroLiquido)}
                    </span>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-md font-bold ${
                        lucroLiquido >= 0
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {margemLiquidaPct}% de Margem
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tabela Comparativa de Obras (Quando várias obras selecionadas) */}
          {selectedObraFilter === "todas" && obras.length > 1 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xs">
              <div className="p-4 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-black text-gray-900">
                  Comparativo de Gastos e Margens por Obra
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] border-b border-gray-100">
                      <th className="p-3">Obra / Cliente</th>
                      <th className="p-3 text-right">Contrato Total</th>
                      <th className="p-3 text-right">Receitas</th>
                      <th className="p-3 text-right">Despesas</th>
                      <th className="p-3 text-right">Lucro</th>
                      <th className="p-3 text-right">Margem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                    {obras.map((o) => {
                      const contratoTotal = o.valor_contratado + o.total_aditivos;
                      const lucro = o.total_receitas - o.total_despesas;
                      const margem =
                        o.total_receitas > 0
                          ? Math.round((lucro / o.total_receitas) * 100)
                          : 0;

                      return (
                        <tr key={o.id} className="hover:bg-amber-50/30">
                          <td className="p-3">
                            <Link
                              href={`/obras/lista/${o.id}`}
                              className="font-bold text-gray-900 hover:text-amber-800 underline block"
                            >
                              {o.nome}
                            </Link>
                            <span className="text-[11px] text-gray-500">{o.cliente}</span>
                          </td>
                          <td className="p-3 text-right font-bold text-gray-900">
                            {formatBRL(contratoTotal)}
                          </td>
                          <td className="p-3 text-right text-emerald-700 font-bold">
                            {formatBRL(o.total_receitas)}
                          </td>
                          <td className="p-3 text-right text-red-600 font-bold">
                            {formatBRL(o.total_despesas)}
                          </td>
                          <td
                            className={`p-3 text-right font-black ${
                              lucro >= 0 ? "text-emerald-700" : "text-red-600"
                            }`}
                          >
                            {formatBRL(lucro)}
                          </td>
                          <td className="p-3 text-right">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                margem >= 20
                                  ? "bg-emerald-100 text-emerald-800"
                                  : margem > 0
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {margem}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 2: KPIS & INDICADORES DE DESPESAS */}
      {activeTab === "kpis" && (
        <div className="space-y-6">
          {/* Grid de Principais KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* KPI 1: Lucro Líquido */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
                Lucro Líquido Realizado
              </span>
              <div
                className={`text-2xl font-black mt-1 ${
                  lucroLiquido >= 0 ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {formatBRL(lucroLiquido)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Receitas faturadas menos total de despesas gastas no período.
              </p>
            </div>

            {/* KPI 2: Margem Líquida */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
                Margem Líquida
              </span>
              <div className="text-2xl font-black text-gray-900 mt-1">
                {margemLiquidaPct}%
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Percentual do faturamento convertido em resultado líquido.
              </p>
            </div>

            {/* KPI 3: Margem Bruta Contratual */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
                Margem Bruta (Contrato)
              </span>
              <div className="text-2xl font-black text-gray-900 mt-1">
                {margemBrutaPct}%
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Saldo restante do valor total contratado após os custos realizados.
              </p>
            </div>
          </div>

          {/* Gráfico/Barras: Composição de Custos por Categoria */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
            <h2 className="text-sm font-black text-gray-900 mb-1">
              Distribuição de Gastos por Categoria
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Onde o dinheiro da obra está sendo aplicado (Materiais, Mão de Obra, etc.)
            </p>

            {categoriasOrdenadas.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-4 text-center">
                Nenhuma despesa para calcular indicadores.
              </p>
            ) : (
              <div className="space-y-3">
                {categoriasOrdenadas.map(([catName, val]) => {
                  const pct =
                    totalDespesas > 0 ? Math.round((val / totalDespesas) * 100) : 0;
                  return (
                    <div key={catName} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-gray-800">{catName}</span>
                        <span className="text-gray-900">
                          {formatBRL(val)}{" "}
                          <span className="text-gray-400 font-normal">({pct}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-[#2C1810] h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(3, pct)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top 5 Fornecedores com Maior Volume de Compras */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
            <h2 className="text-sm font-black text-gray-900 mb-1">
              Top Fornecedores (Concentração de Compras)
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Lojas de materiais e prestadores de serviço com maior volume financeiro.
            </p>

            {fornecedoresOrdenados.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-4 text-center">
                Nenhum fornecedor registrado nas despesas.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] border-b border-gray-100">
                      <th className="p-2.5">Fornecedor</th>
                      <th className="p-2.5 text-right">Total Comprado</th>
                      <th className="p-2.5 text-right">% das Despesas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                    {fornecedoresOrdenados.map(([fornName, val]) => {
                      const pct =
                        totalDespesas > 0 ? Math.round((val / totalDespesas) * 100) : 0;
                      return (
                        <tr key={fornName} className="hover:bg-gray-50/60">
                          <td className="p-2.5 font-bold text-gray-900">{fornName}</td>
                          <td className="p-2.5 text-right font-black text-red-600">
                            {formatBRL(val)}
                          </td>
                          <td className="p-2.5 text-right font-semibold text-gray-600">
                            {pct}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ObrasRelatoriosPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-20 text-gray-500 font-semibold animate-pulse">
          Carregando relatórios de obras...
        </div>
      }
    >
      <ObrasRelatoriosContent />
    </Suspense>
  );
}
