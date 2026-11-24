"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

import ObrasBackButton from "@/components/obras/ObrasBackButton";

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

  // Modal de Edição de Obra na Lista
  const [editingObra, setEditingObra] = useState<ObraItem | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCliente, setEditCliente] = useState("");
  const [editEndereco, setEditEndereco] = useState("");
  const [editStatus, setEditStatus] = useState<"ativa" | "pausada" | "concluida" | "cancelada">("ativa");
  const [editValor, setEditValor] = useState("");
  const [editDataInicio, setEditDataInicio] = useState("");
  const [editDataFim, setEditDataFim] = useState("");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [savingObra, setSavingObra] = useState(false);

  // Modal de Exclusão de Obra na Lista
  const [deletingObra, setDeletingObra] = useState<ObraItem | null>(null);
  const [isDeletingObra, setIsDeletingObra] = useState(false);

  async function loadObrasAndFinances() {
    if (!selectedCompany?.id) return;
    const currentCompanyId = selectedCompany.id;
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

  useEffect(() => {
    loadObrasAndFinances();
  }, [selectedCompany]);

  function handleOpenEditObra(obra: ObraItem) {
    setEditingObra(obra);
    setEditNome(obra.nome || "");
    setEditCliente(obra.cliente || "");
    setEditEndereco(obra.endereco || "");
    setEditStatus(obra.status || "ativa");
    setEditValor(String(obra.valor_contratado || ""));
    setEditDataInicio(obra.data_inicio || "");
    setEditDataFim(obra.data_fim_previsto || "");
    setEditObservacoes(obra.observacoes || "");
  }

  async function handleSaveEditObra(e: React.FormEvent) {
    e.preventDefault();
    if (!editingObra || !selectedCompany?.id) return;

    if (!editNome.trim()) {
      alert("Informe o nome da obra.");
      return;
    }
    if (!editCliente.trim()) {
      alert("Informe o nome do cliente.");
      return;
    }

    const valorNum = parseFloat(editValor.replace(",", ".")) || 0;

    setSavingObra(true);
    try {
      const { error } = await supabase
        .from("obras")
        .update({
          nome: editNome.trim(),
          cliente: editCliente.trim(),
          endereco: editEndereco.trim() || null,
          status: editStatus,
          valor_contratado: valorNum,
          data_inicio: editDataInicio || new Date().toISOString().split("T")[0],
          data_fim_previsto: editDataFim || null,
          observacoes: editObservacoes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingObra.id)
        .eq("company_id", selectedCompany.id);

      if (error) throw error;

      setEditingObra(null);
      await loadObrasAndFinances();
    } catch (err: any) {
      alert(err.message || "Erro ao salvar alterações da obra.");
    } finally {
      setSavingObra(false);
    }
  }

  async function handleConfirmDeleteObra() {
    if (!deletingObra || !selectedCompany?.id) return;
    setIsDeletingObra(true);
    try {
      const { error } = await supabase
        .from("obras")
        .delete()
        .eq("id", deletingObra.id)
        .eq("company_id", selectedCompany.id);

      if (error) throw error;

      setDeletingObra(null);
      await loadObrasAndFinances();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir obra.");
    } finally {
      setIsDeletingObra(false);
    }
  }

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
          <div className="flex items-center gap-3">
            <ObrasBackButton />
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

                  <div className="flex items-center gap-1.5 self-start flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleOpenEditObra(obra)}
                      title="Editar dados e status da obra"
                      className="p-1.5 text-gray-500 hover:text-amber-800 hover:bg-amber-100 rounded-xl transition-all text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>✏️</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingObra(obra)}
                      title="Excluir obra permanentemente"
                      className="p-1.5 text-gray-400 hover:text-red-700 hover:bg-red-100 rounded-xl transition-all text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>🗑️</span>
                    </button>
                    <Link
                      href={`/obras/lista/${obra.id}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl transition-colors"
                    >
                      Ver Visão 360º & Aditivos →
                    </Link>
                  </div>
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
                    <span>💸</span> + Nova Despesa
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

      {/* Modal de Edição de Obra */}
      {editingObra && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>🏗️</span> Editar Obra / Projeto
              </h3>
              <button
                type="button"
                onClick={() => setEditingObra(null)}
                className="text-gray-400 hover:text-gray-700 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditObra} className="space-y-4">
              {/* Status da Obra em 4 Caixas Clicáveis */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Status da Obra
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditStatus("ativa")}
                    className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                      editStatus === "ativa"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs ring-2 ring-emerald-500/20 font-black"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    <span>🟢</span>
                    <span>Ativa</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditStatus("pausada")}
                    className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                      editStatus === "pausada"
                        ? "bg-amber-50 border-amber-500 text-amber-800 shadow-xs ring-2 ring-amber-500/20 font-black"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    <span>🟡</span>
                    <span>Pausada</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditStatus("concluida")}
                    className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                      editStatus === "concluida"
                        ? "bg-blue-50 border-blue-500 text-blue-800 shadow-xs ring-2 ring-blue-500/20 font-black"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    <span>🔵</span>
                    <span>Concluída</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditStatus("cancelada")}
                    className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                      editStatus === "cancelada"
                        ? "bg-rose-50 border-rose-500 text-rose-800 shadow-xs ring-2 ring-rose-500/20 font-black"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    <span>⚪</span>
                    <span>Cancelada</span>
                  </button>
                </div>
              </div>

              {/* Nome e Cliente */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Nome da Obra <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    placeholder="Ex: Reforma Cobertura Jardins"
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Cliente <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editCliente}
                    onChange={(e) => setEditCliente(e.target.value)}
                    placeholder="Ex: Roberto Mendes"
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Valor Contratado Base e Endereço */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Valor Contratado Base (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editValor}
                    onChange={(e) => setEditValor(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Endereço
                  </label>
                  <input
                    type="text"
                    value={editEndereco}
                    onChange={(e) => setEditEndereco(e.target.value)}
                    placeholder="Ex: Av. Paulista, 1000 - Apto 51"
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Data Início e Previsão Término */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Data de Início
                  </label>
                  <input
                    type="date"
                    value={editDataInicio}
                    onChange={(e) => setEditDataInicio(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Previsão de Conclusão
                  </label>
                  <input
                    type="date"
                    value={editDataFim}
                    onChange={(e) => setEditDataFim(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Observações
                </label>
                <textarea
                  rows={2}
                  value={editObservacoes}
                  onChange={(e) => setEditObservacoes(e.target.value)}
                  placeholder="Informações adicionais do contrato ou escopo..."
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingObra(null)}
                  className="py-2.5 px-4 rounded-xl text-gray-600 hover:bg-gray-100 font-bold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingObra}
                  className="py-2.5 px-5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {savingObra ? "Salvando..." : "✓ Salvar Dados da Obra"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Exclusão da Obra */}
      {deletingObra && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 mx-auto flex items-center justify-center text-2xl">
                ⚠️
              </div>
              <h3 className="text-base font-bold text-gray-900">
                Excluir Obra Permanentemente?
              </h3>
              <p className="text-xs text-gray-600">
                Você está prestes a excluir a obra <strong className="text-gray-900">{deletingObra.nome}</strong> (Cliente: {deletingObra.cliente}).
              </p>
              
              <div className="bg-red-50 p-3 rounded-2xl border border-red-200 text-left space-y-1">
                <span className="text-[11px] font-bold text-red-800 uppercase block">
                  Atenção ao impacto:
                </span>
                <p className="text-xs text-red-700">
                  • <strong>{deletingObra.total_despesas > 0 || deletingObra.total_receitas > 0 ? "Histórico financeiro ativo" : "Sem movimentações"}</strong> (Despesas: {formatBRL(deletingObra.total_despesas)} / Faturado: {formatBRL(deletingObra.total_receitas)}).
                </p>
                {deletingObra.total_aditivos > 0 && (
                  <p className="text-xs text-red-700">
                    • Contém aditivos contratuais registrados ({formatBRL(deletingObra.total_aditivos)}).
                  </p>
                )}
                <p className="text-[11px] text-red-600 font-semibold mt-1">
                  Todos os lançamentos vinculados serão apagados do banco. Essa ação NÃO pode ser desfeita.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingObra(null)}
                disabled={isDeletingObra}
                className="w-full py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteObra}
                disabled={isDeletingObra}
                className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                {isDeletingObra ? "Excluindo Obra..." : "Sim, Excluir Obra"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
