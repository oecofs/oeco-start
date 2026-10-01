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

function ObrasRelatoriosContent() {
  const searchParams = useSearchParams();
  const filterObraId = searchParams.get("obraId");

  const { selectedCompany } = useCompany();
  const supabase = createClient();

  const [obras, setObras] = useState<ObraSummary[]>([]);
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

        const { data: aditivosData } = await supabase
          .from("obra_aditivos")
          .select("obra_id, valor")
          .in("obra_id", obraIds);

        const { data: transacoesData } = await supabase
          .from("obra_transacoes")
          .select("obra_id, tipo, valor")
          .in("obra_id", obraIds);

        const list: ObraSummary[] = (obrasData || []).map((o) => {
          const adit = (aditivosData || [])
            .filter((a) => a.obra_id === o.id)
            .reduce((s, a) => s + Number(a.valor || 0), 0);

          const rec = (transacoesData || [])
            .filter((t) => t.obra_id === o.id && t.tipo === "receita")
            .reduce((s, t) => s + Number(t.valor || 0), 0);

          const desp = (transacoesData || [])
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
      } catch (err) {
        console.error("Erro ao carregar relatórios:", err);
      } finally {
        setLoading(false);
      }
    }

    loadReportData();
  }, [selectedCompany, supabase]);

  function formatBRL(val: number) {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  const filteredObras =
    selectedObraFilter === "todas"
      ? obras
      : obras.filter((o) => o.id === selectedObraFilter);

  const totalContratos = filteredObras.reduce(
    (s, o) => s + o.valor_contratado + o.total_aditivos,
    0
  );
  const totalReceitas = filteredObras.reduce((s, o) => s + o.total_receitas, 0);
  const totalDespesas = filteredObras.reduce((s, o) => s + o.total_despesas, 0);
  const saldoGeral = totalReceitas - totalDespesas;
  const saldoAFaturarGeral = Math.max(0, totalContratos - totalReceitas);

  return (
    <div className="space-y-6">
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
              Relatórios & DRE de Obras
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Indicadores de faturamento, custos realizados e margem de lucro por projeto.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gray-900 hover:bg-black text-white font-bold text-xs sm:text-sm shadow-sm transition-all"
        >
          <span>🖨️</span> Imprimir / Salvar PDF
        </button>
      </div>

      {/* Filtro por Obra */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-3">
        <span className="text-xs font-bold text-gray-700 whitespace-nowrap">
          Filtrar Obra:
        </span>
        <select
          value={selectedObraFilter}
          onChange={(e) => setSelectedObraFilter(e.target.value)}
          className="w-full sm:w-80 px-3 py-1.5 rounded-xl border border-gray-300 text-xs sm:text-sm font-medium bg-white"
        >
          <option value="todas">🏗️ Todas as Obras (Consolidado)</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome} ({o.cliente})
            </option>
          ))}
        </select>
      </div>

      {/* Resumo Consolidado (DRE em Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-gray-400 block">
            Contratos + Aditivos
          </span>
          <div className="text-base sm:text-lg font-black text-gray-900 mt-1">
            {formatBRL(totalContratos)}
          </div>
          <span className="text-[10px] text-amber-800 block mt-0.5 font-semibold">
            Saldo a cobrar: {formatBRL(saldoAFaturarGeral)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-emerald-700 block">
            Receitas (Faturado)
          </span>
          <div className="text-base sm:text-lg font-black text-emerald-700 mt-1">
            {formatBRL(totalReceitas)}
          </div>
          <span className="text-[10px] text-emerald-600 block mt-0.5 font-semibold">
            {totalContratos > 0
              ? `${Math.round((totalReceitas / totalContratos) * 100)}% do contrato`
              : "0%"}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-red-200 bg-red-50/30 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-red-700 block">
            Custos (Despesas)
          </span>
          <div className="text-base sm:text-lg font-black text-red-700 mt-1">
            {formatBRL(totalDespesas)}
          </div>
          <span className="text-[10px] text-red-600 block mt-0.5 font-semibold">
            Realizado
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-gray-400 block">
            Lucro / Margem
          </span>
          <div
            className={`text-base sm:text-lg font-black mt-1 ${
              saldoGeral >= 0 ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {formatBRL(saldoGeral)}
          </div>
          <span className="text-[10px] text-gray-500 block mt-0.5 font-semibold">
            {totalReceitas > 0
              ? `${Math.round((saldoGeral / totalReceitas) * 100)}% de margem`
              : "0%"}
          </span>
        </div>
      </div>

      {/* Tabela Comparativa de Obras */}
      <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-bold text-gray-900">
            Detalhamento por Obra / Projeto
          </h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-gray-500 font-semibold animate-pulse">
            Calculando balanços...
          </div>
        ) : filteredObras.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-500">
            Nenhuma obra para exibir no período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[10px]">
                  <th className="p-3.5">Obra / Cliente</th>
                  <th className="p-3.5 text-right">Contrato Total</th>
                  <th className="p-3.5 text-right">Faturado</th>
                  <th className="p-3.5 text-right">% Cobrado</th>
                  <th className="p-3.5 text-right">Despesas</th>
                  <th className="p-3.5 text-right">Saldo Lucro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {filteredObras.map((o) => {
                  const contratoTotal = o.valor_contratado + o.total_aditivos;
                  const pct =
                    contratoTotal > 0
                      ? Math.round((o.total_receitas / contratoTotal) * 100)
                      : 0;
                  const lucro = o.total_receitas - o.total_despesas;

                  return (
                    <tr key={o.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="p-3.5">
                        <Link
                          href={`/obras/lista/${o.id}`}
                          className="font-bold text-gray-900 hover:text-amber-800 underline block"
                        >
                          {o.nome}
                        </Link>
                        <span className="text-[11px] text-gray-500">{o.cliente}</span>
                      </td>
                      <td className="p-3.5 text-right font-bold text-gray-900">
                        {formatBRL(contratoTotal)}
                      </td>
                      <td className="p-3.5 text-right text-emerald-700 font-bold">
                        {formatBRL(o.total_receitas)}
                      </td>
                      <td className="p-3.5 text-right">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            pct >= 100
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {pct}%
                        </span>
                      </td>
                      <td className="p-3.5 text-right text-red-600 font-bold">
                        {formatBRL(o.total_despesas)}
                      </td>
                      <td
                        className={`p-3.5 text-right font-black ${
                          lucro >= 0 ? "text-emerald-700" : "text-red-600"
                        }`}
                      >
                        {formatBRL(lucro)}
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
