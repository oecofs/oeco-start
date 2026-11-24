"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import ObrasBackButton from "@/components/obras/ObrasBackButton";

interface ObraDetails {
  id: string;
  nome: string;
  cliente: string;
  endereco?: string;
  data_inicio: string;
  data_fim_previsto?: string;
  valor_contratado: number;
  status: "ativa" | "pausada" | "concluida" | "cancelada";
  observacoes?: string;
}

interface AditivoItem {
  id: string;
  numero_aditivo: number;
  descricao: string;
  valor: number;
  dias_adicionais: number;
  data_aprovacao: string;
  observacoes?: string;
}

interface TransacaoItem {
  id: string;
  obra_id?: string;
  tipo: "despesa" | "receita";
  descricao: string;
  valor: number;
  data_movimentacao: string;
  forma_pagamento?: string;
  status_pagamento: "pago" | "pendente" | "cancelado";
  fornecedor_id?: string;
  fornecedor_nome?: string;
  categoria_id?: string;
  categoria_nome?: string;
  foto_url?: string;
  observacoes?: string;
}

export default function ObraDetalhesPage() {
  const params = useParams();
  const router = useRouter();
  const obraId = params.id as string;

  const { selectedCompany } = useCompany();
  const supabase = createClient();

  const [obra, setObra] = useState<ObraDetails | null>(null);
  const [aditivos, setAditivos] = useState<AditivoItem[]>([]);
  const [transacoes, setTransacoes] = useState<TransacaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"extrato" | "aditivos" | "fotos">("extrato");

  // Fornecedores e Categorias da Empresa para suporte na edição
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  // Modal de Aditivo
  const [showAditivoModal, setShowAditivoModal] = useState(false);
  const [aditivoDescricao, setAditivoDescricao] = useState("");
  const [aditivoValor, setAditivoValor] = useState("");
  const [aditivoDias, setAditivoDias] = useState("0");
  const [aditivoData, setAditivoData] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [savingAditivo, setSavingAditivo] = useState(false);

  // Modal de Foto/Comprovante ampliado
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Modal de Edição de Transação
  const [editingTransacao, setEditingTransacao] = useState<TransacaoItem | null>(null);
  const [editTipo, setEditTipo] = useState<"despesa" | "receita">("despesa");
  const [editDescricao, setEditDescricao] = useState("");
  const [editValor, setEditValor] = useState("");
  const [editData, setEditData] = useState("");
  const [editFormaPagamento, setEditFormaPagamento] = useState("PIX");
  const [editStatus, setEditStatus] = useState<"pago" | "pendente" | "cancelado">("pago");
  const [editFornecedorNome, setEditFornecedorNome] = useState("");
  const [editCategoriaNome, setEditCategoriaNome] = useState("");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Modal de Confirmação de Exclusão de Transação
  const [deletingTransacao, setDeletingTransacao] = useState<TransacaoItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Modal de Edição da Obra
  const [showEditObraModal, setShowEditObraModal] = useState(false);
  const [editObraNome, setEditObraNome] = useState("");
  const [editObraCliente, setEditObraCliente] = useState("");
  const [editObraEndereco, setEditObraEndereco] = useState("");
  const [editObraStatus, setEditObraStatus] = useState<"ativa" | "pausada" | "concluida" | "cancelada">("ativa");
  const [editObraValor, setEditObraValor] = useState("");
  const [editObraDataInicio, setEditObraDataInicio] = useState("");
  const [editObraDataFim, setEditObraDataFim] = useState("");
  const [editObraObservacoes, setEditObraObservacoes] = useState("");
  const [savingObra, setSavingObra] = useState(false);

  // Modal de Exclusão da Obra
  const [showDeleteObraModal, setShowDeleteObraModal] = useState(false);
  const [isDeletingObra, setIsDeletingObra] = useState(false);

  // Busca e Filtros no Extrato da Obra
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTipo, setFilterTipo] = useState<"todos" | "despesa" | "receita">("todos");
  const [filterStatus, setFilterStatus] = useState<"todos" | "pago" | "pendente">("todos");

  // Transações filtradas pela busca e filtros rápidos (Hook antes de qualquer retorno antecipado)
  const filteredTransacoes = useMemo(() => {
    return transacoes.filter((t) => {
      if (filterTipo !== "todos" && t.tipo !== filterTipo) return false;
      if (filterStatus !== "todos" && t.status_pagamento !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchDesc = t.descricao?.toLowerCase().includes(q);
        const matchFornecedor = t.fornecedor_nome?.toLowerCase().includes(q);
        const matchCategoria = t.categoria_nome?.toLowerCase().includes(q);
        const matchForma = t.forma_pagamento?.toLowerCase().includes(q);
        const matchObs = t.observacoes?.toLowerCase().includes(q);
        const matchData = t.data_movimentacao?.includes(q);
        const matchValor =
          String(t.valor).includes(q) ||
          t.valor.toLocaleString("pt-BR").includes(q);
        if (
          !matchDesc &&
          !matchFornecedor &&
          !matchCategoria &&
          !matchForma &&
          !matchObs &&
          !matchData &&
          !matchValor
        ) {
          return false;
        }
      }
      return true;
    });
  }, [transacoes, searchQuery, filterTipo, filterStatus]);

  // Carregar dados da Obra
  async function loadObraData() {
    if (!selectedCompany?.id || !obraId) return;
    const currentCompanyId = selectedCompany.id;
    setLoading(true);
    try {
      // 1. Dados da Obra
      const { data: obraData, error: obraErr } = await supabase
        .from("obras")
        .select("*")
        .eq("id", obraId)
        .eq("company_id", currentCompanyId)
        .single();

      if (obraErr) throw obraErr;
      setObra(obraData);

      // 2. Aditivos
      const { data: aditData } = await supabase
        .from("obra_aditivos")
        .select("*")
        .eq("obra_id", obraId)
        .order("numero_aditivo", { ascending: true });
      setAditivos(aditData || []);

      // 3. Transações
      const { data: transData } = await supabase
        .from("obra_transacoes")
        .select("*")
        .eq("obra_id", obraId)
        .order("data_movimentacao", { ascending: false });
      setTransacoes(transData || []);
    } catch (err) {
      console.error("Erro ao carregar detalhes da obra:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadObraData();
  }, [selectedCompany, obraId]);

  useEffect(() => {
    if (!selectedCompany?.id) return;
    const cid = selectedCompany.id;
    // Carregar fornecedores e categorias para suporte na edição rápida
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("company_id", cid)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setSuppliers(data || []));

    supabase
      .from("categories")
      .select("id, name")
      .eq("company_id", cid)
      .order("name")
      .then(({ data }) => setCategories(data || []));
  }, [selectedCompany]);

  // Abrir modal de edição de transação
  function handleOpenEdit(t: TransacaoItem) {
    setEditingTransacao(t);
    setEditTipo(t.tipo);
    setEditDescricao(t.descricao || "");
    setEditValor(String(t.valor || ""));
    setEditData(t.data_movimentacao || new Date().toISOString().split("T")[0]);
    setEditFormaPagamento(t.forma_pagamento || "PIX");
    setEditStatus(t.status_pagamento || "pago");
    setEditFornecedorNome(t.fornecedor_nome || "");
    setEditCategoriaNome(t.categoria_nome || "");
    setEditObservacoes(t.observacoes || "");
  }

  // Salvar alterações de transação
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTransacao || !selectedCompany?.id) return;

    const valorNum = parseFloat(editValor.replace(",", "."));
    if (isNaN(valorNum) || valorNum <= 0) {
      alert("Informe um valor numérico válido maior que zero.");
      return;
    }
    if (!editDescricao.trim()) {
      alert("Informe a descrição do lançamento.");
      return;
    }

    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("obra_transacoes")
        .update({
          tipo: editTipo,
          descricao: editDescricao.trim(),
          valor: valorNum,
          data_movimentacao: editData,
          forma_pagamento: editFormaPagamento.trim() || null,
          status_pagamento: editStatus,
          fornecedor_nome: editFornecedorNome.trim() || null,
          categoria_nome: editCategoriaNome.trim() || null,
          observacoes: editObservacoes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingTransacao.id);

      if (error) throw error;

      setEditingTransacao(null);
      await loadObraData();
    } catch (err: any) {
      alert(err.message || "Erro ao atualizar lançamento.");
    } finally {
      setSavingEdit(false);
    }
  }

  // Confirmar exclusão de transação
  async function handleConfirmDelete() {
    if (!deletingTransacao || !selectedCompany?.id) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("obra_transacoes")
        .delete()
        .eq("id", deletingTransacao.id);

      if (error) throw error;

      if (previewPhotoUrl && previewPhotoUrl === deletingTransacao.foto_url) {
        setPreviewPhotoUrl(null);
      }
      setDeletingTransacao(null);
      await loadObraData();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir lançamento.");
    } finally {
      setIsDeleting(false);
    }
  }

  // Abrir modal de edição dos dados da obra
  function handleOpenEditObra() {
    if (!obra) return;
    setEditObraNome(obra.nome || "");
    setEditObraCliente(obra.cliente || "");
    setEditObraEndereco(obra.endereco || "");
    setEditObraStatus(obra.status || "ativa");
    setEditObraValor(String(obra.valor_contratado || ""));
    setEditObraDataInicio(obra.data_inicio || "");
    setEditObraDataFim(obra.data_fim_previsto || "");
    setEditObraObservacoes(obra.observacoes || "");
    setShowEditObraModal(true);
  }

  // Salvar alterações da obra (incluindo status)
  async function handleSaveEditObra(e: React.FormEvent) {
    e.preventDefault();
    if (!obra || !selectedCompany?.id) return;

    if (!editObraNome.trim()) {
      alert("Informe o nome da obra.");
      return;
    }
    if (!editObraCliente.trim()) {
      alert("Informe o nome do cliente.");
      return;
    }

    const valorNum = parseFloat(editObraValor.replace(",", ".")) || 0;

    setSavingObra(true);
    try {
      const { data: updated, error } = await supabase
        .from("obras")
        .update({
          nome: editObraNome.trim(),
          cliente: editObraCliente.trim(),
          endereco: editObraEndereco.trim() || null,
          status: editObraStatus,
          valor_contratado: valorNum,
          data_inicio: editObraDataInicio || new Date().toISOString().split("T")[0],
          data_fim_previsto: editObraDataFim || null,
          observacoes: editObraObservacoes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", obra.id)
        .eq("company_id", selectedCompany.id)
        .select()
        .single();

      if (error) throw error;

      setObra(updated);
      setShowEditObraModal(false);
    } catch (err: any) {
      alert(err.message || "Erro ao salvar alterações da obra.");
    } finally {
      setSavingObra(false);
    }
  }

  // Excluir a obra inteira (em cascata)
  async function handleConfirmDeleteObra() {
    if (!obra || !selectedCompany?.id) return;
    setIsDeletingObra(true);
    try {
      const { error } = await supabase
        .from("obras")
        .delete()
        .eq("id", obra.id)
        .eq("company_id", selectedCompany.id);

      if (error) throw error;

      setShowDeleteObraModal(false);
      router.push("/obras/lista");
    } catch (err: any) {
      alert(err.message || "Erro ao excluir obra.");
      setIsDeletingObra(false);
    }
  }

  // Salvar Aditivo Contratual
  async function handleAddAditivo(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompany?.id || !obraId || !aditivoDescricao.trim()) return;

    const valorNum = parseFloat(aditivoValor.replace(",", "."));
    if (isNaN(valorNum)) {
      alert("Informe um valor numérico válido para o aditivo.");
      return;
    }

    setSavingAditivo(true);
    try {
      const nextNumero = aditivos.length + 1;
      const { error } = await supabase.from("obra_aditivos").insert({
        company_id: selectedCompany.id,
        obra_id: obraId,
        numero_aditivo: nextNumero,
        descricao: aditivoDescricao.trim(),
        valor: valorNum,
        dias_adicionais: parseInt(aditivoDias) || 0,
        data_aprovacao: aditivoData,
      });

      if (error) throw error;

      setShowAditivoModal(false);
      setAditivoDescricao("");
      setAditivoValor("");
      setAditivoDias("0");
      loadObraData();
    } catch (err: any) {
      alert(err.message || "Erro ao salvar aditivo.");
    } finally {
      setSavingAditivo(false);
    }
  }

  function formatBRL(val: number) {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-gray-500 font-semibold animate-pulse">
        Carregando visão 360º da obra...
      </div>
    );
  }

  if (!obra) {
    return (
      <div className="text-center py-16 bg-white rounded-3xl border border-gray-200 p-6 space-y-3">
        <h2 className="text-lg font-bold text-gray-900">Obra não encontrada</h2>
        <Link
          href="/obras/lista"
          className="inline-block px-4 py-2 bg-amber-700 text-white font-bold text-xs rounded-xl"
        >
          Voltar para Lista de Obras
        </Link>
      </div>
    );
  }

  // Cálculos consolidados
  const totalAditivos = aditivos.reduce((sum, a) => sum + Number(a.valor || 0), 0);
  const valorTotalContrato = Number(obra.valor_contratado || 0) + totalAditivos;

  const totalDespesas = transacoes
    .filter((t) => t.tipo === "despesa")
    .reduce((sum, t) => sum + Number(t.valor || 0), 0);

  const totalReceitas = transacoes
    .filter((t) => t.tipo === "receita")
    .reduce((sum, t) => sum + Number(t.valor || 0), 0);

  const percentualFaturado =
    valorTotalContrato > 0
      ? Math.min(100, Math.round((totalReceitas / valorTotalContrato) * 100))
      : 0;

  const saldoAFaturar = Math.max(0, valorTotalContrato - totalReceitas);
  const lucroObra = totalReceitas - totalDespesas;
  const fotosComprovantes = transacoes.filter((t) => !!t.foto_url);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <ObrasBackButton href="/obras/lista" />
            <h1 className="text-xl sm:text-2xl font-black text-gray-900">
              {obra.nome}
            </h1>
            <span
              className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full border ${
                obra.status === "ativa"
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : obra.status === "pausada"
                  ? "bg-amber-100 text-amber-800 border-amber-200"
                  : obra.status === "concluida"
                  ? "bg-blue-100 text-blue-800 border-blue-200"
                  : "bg-gray-100 text-gray-700 border-gray-200"
              }`}
            >
              {obra.status === "ativa"
                ? "🟢 Ativa"
                : obra.status === "pausada"
                ? "🟡 Pausada"
                : obra.status === "concluida"
                ? "🔵 Concluída"
                : "⚪ Cancelada"}
            </span>

            {/* Ações da Obra: Editar e Excluir */}
            <div className="flex items-center gap-1.5 ml-1">
              <button
                type="button"
                onClick={handleOpenEditObra}
                title="Editar dados e status da obra"
                className="px-2.5 py-1 rounded-xl bg-gray-100 hover:bg-amber-100 text-gray-700 hover:text-amber-900 text-xs font-bold transition-all inline-flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <span>✏️</span> Editar Obra
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteObraModal(true)}
                title="Excluir obra permanentemente"
                className="px-2.5 py-1 rounded-xl bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-700 text-xs font-bold transition-all inline-flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <span>🗑️</span> Excluir
              </button>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Cliente: <strong className="text-gray-800">{obra.cliente}</strong>
            {obra.endereco && ` • 📍 ${obra.endereco}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/obras/registrar/despesa?obraId=${obra.id}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs sm:text-sm shadow-2xs transition-all active:scale-95"
          >
            <span>💸</span> + Despesa
          </Link>
          <Link
            href={`/obras/registrar/receita?obraId=${obra.id}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-2xs transition-all active:scale-95"
          >
            <span>💰</span> + Faturamento
          </Link>
        </div>
      </div>

      {/* Barra de Faturamento / Cobrança 360 */}
      <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 block">
              Faturamento do Contrato
            </span>
            <div className="text-lg sm:text-xl font-black text-gray-900 mt-0.5">
              {percentualFaturado}% Faturado
              <span className="text-xs font-semibold text-gray-500 ml-2">
                ({formatBRL(totalReceitas)} de {formatBRL(valorTotalContrato)})
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
              Saldo a Cobrar
            </span>
            <span className="text-sm sm:text-base font-black text-amber-800">
              {formatBRL(saldoAFaturar)}
            </span>
          </div>
        </div>

        {/* Barra Visual de Progresso */}
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
          <div
            className={`h-full transition-all duration-500 ${
              percentualFaturado >= 100 ? "bg-emerald-600" : "bg-amber-600"
            }`}
            style={{ width: `${percentualFaturado}%` }}
          />
        </div>
      </div>

      {/* Grid de 4 Cards de Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-gray-500 block">
            Contrato Total
          </span>
          <div className="text-base sm:text-lg font-black text-gray-900 mt-1">
            {formatBRL(valorTotalContrato)}
          </div>
          <span className="text-[10px] text-gray-400 block mt-0.5">
            Base: {formatBRL(Number(obra.valor_contratado || 0))}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-red-200 bg-red-50/20 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-red-700 block">
            Total Despesas
          </span>
          <div className="text-base sm:text-lg font-black text-red-700 mt-1">
            {formatBRL(totalDespesas)}
          </div>
          <span className="text-[10px] text-gray-500 block mt-0.5">
            {transacoes.filter((t) => t.tipo === "despesa").length} lançamentos
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-emerald-700 block">
            Total Receitas
          </span>
          <div className="text-base sm:text-lg font-black text-emerald-700 mt-1">
            {formatBRL(totalReceitas)}
          </div>
          <span className="text-[10px] text-gray-500 block mt-0.5">
            {transacoes.filter((t) => t.tipo === "receita").length} faturamentos
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-gray-500 block">
            Resultado / Saldo
          </span>
          <div
            className={`text-base sm:text-lg font-black mt-1 ${
              lucroObra >= 0 ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {formatBRL(lucroObra)}
          </div>
          <span className="text-[10px] text-gray-400 block mt-0.5">
            Margem Real da Obra
          </span>
        </div>
      </div>

      {/* Tabs de Navegação da Obra */}
      <div className="flex border-b border-gray-200 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("extrato")}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
            activeTab === "extrato"
              ? "border-amber-700 text-amber-900"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          📋 Extrato Financeiro ({transacoes.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("aditivos")}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
            activeTab === "aditivos"
              ? "border-amber-700 text-amber-900"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          📑 Aditivos de Contrato ({aditivos.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("fotos")}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
            activeTab === "fotos"
              ? "border-amber-700 text-amber-900"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          🖼️ Comprovantes & Notas ({fotosComprovantes.length})
        </button>
      </div>

      {/* Conteúdo da Tab Selecionada */}
      {activeTab === "extrato" && (
        <div className="space-y-3">
          {/* Barra de Pesquisa e Filtros Rápidos */}
          <div className="bg-white p-3.5 sm:p-4 rounded-3xl border border-gray-200 shadow-xs space-y-3">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 text-sm">
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar por descrição, fornecedor, categoria, valor..."
                className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-xs sm:text-sm font-medium focus:bg-white focus:ring-2 focus:ring-amber-600 focus:border-amber-600 transition-all outline-hidden text-gray-900 placeholder:text-gray-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 text-xs font-bold"
                  title="Limpar busca"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filtros Rápidos */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-gray-500 mr-1">Tipo:</span>
                <button
                  type="button"
                  onClick={() => setFilterTipo("todos")}
                  className={`px-2.5 py-1 rounded-xl font-bold transition-all ${
                    filterTipo === "todos"
                      ? "bg-amber-700 text-white shadow-2xs"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Todos ({transacoes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTipo("despesa")}
                  className={`px-2.5 py-1 rounded-xl font-bold transition-all ${
                    filterTipo === "despesa"
                      ? "bg-red-600 text-white shadow-2xs"
                      : "bg-red-50 text-red-700 hover:bg-red-100"
                  }`}
                >
                  💸 Despesas ({transacoes.filter((t) => t.tipo === "despesa").length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTipo("receita")}
                  className={`px-2.5 py-1 rounded-xl font-bold transition-all ${
                    filterTipo === "receita"
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  💰 Receitas ({transacoes.filter((t) => t.tipo === "receita").length})
                </button>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-gray-500 mr-1">Status:</span>
                <button
                  type="button"
                  onClick={() => setFilterStatus("todos")}
                  className={`px-2 py-1 rounded-xl font-bold transition-all ${
                    filterStatus === "todos"
                      ? "bg-gray-800 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus("pago")}
                  className={`px-2 py-1 rounded-xl font-bold transition-all ${
                    filterStatus === "pago"
                      ? "bg-emerald-700 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  ✓ Pago
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus("pendente")}
                  className={`px-2 py-1 rounded-xl font-bold transition-all ${
                    filterStatus === "pendente"
                      ? "bg-amber-700 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  ⏳ Pendente
                </button>
              </div>
            </div>

            {(searchQuery || filterTipo !== "todos" || filterStatus !== "todos") && (
              <div className="flex items-center justify-between text-[11px] text-gray-500 pt-2 border-t border-gray-100">
                <span>
                  Mostrando <strong>{filteredTransacoes.length}</strong> de{" "}
                  <strong>{transacoes.length}</strong> lançamentos
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterTipo("todos");
                    setFilterStatus("todos");
                  }}
                  className="text-amber-800 hover:underline font-bold"
                >
                  Limpar busca e filtros
                </button>
              </div>
            )}
          </div>

          {transacoes.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-gray-200 p-6 space-y-2">
              <span className="text-3xl">📝</span>
              <p className="text-xs text-gray-500">
                Nenhuma movimentação registrada para esta obra ainda.
              </p>
            </div>
          ) : filteredTransacoes.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-gray-200 p-6 space-y-2">
              <span className="text-3xl">🔍</span>
              <p className="text-sm font-bold text-gray-800">
                Nenhum lançamento encontrado
              </p>
              <p className="text-xs text-gray-500">
                Nenhum resultado corresponde à sua pesquisa &quot;{searchQuery}&quot;.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setFilterTipo("todos");
                  setFilterStatus("todos");
                }}
                className="mt-2 inline-block px-3 py-1.5 bg-amber-100 text-amber-900 font-bold text-xs rounded-xl hover:bg-amber-200 transition-colors"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-xs divide-y divide-gray-100">
              {filteredTransacoes.map((t) => (
                <div
                  key={t.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/80 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 mt-0.5 sm:mt-0 ${
                        t.tipo === "despesa"
                          ? "bg-red-100 text-red-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {t.tipo === "despesa" ? "💸" : "💰"}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                        <span>{t.descricao}</span>
                        {t.foto_url && (
                          <button
                            type="button"
                            onClick={() => setPreviewPhotoUrl(t.foto_url!)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold hover:underline inline-flex items-center gap-1"
                          >
                            📸 Ver Nota
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>📅 {new Date(t.data_movimentacao).toLocaleDateString("pt-BR")}</span>
                        {t.fornecedor_nome && <span>• 🏢 {t.fornecedor_nome}</span>}
                        {t.categoria_nome && <span>• 🏷️ {t.categoria_nome}</span>}
                        {t.forma_pagamento && <span>• 💳 {t.forma_pagamento}</span>}
                      </div>
                      {t.observacoes && (
                        <p className="text-[11px] text-gray-400 italic mt-0.5 line-clamp-1">
                          {t.observacoes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                    <div className="text-left sm:text-right">
                      <span
                        className={`text-sm sm:text-base font-black block ${
                          t.tipo === "despesa" ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {t.tipo === "despesa" ? "-" : "+"} {formatBRL(Number(t.valor))}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase inline-block ${
                          t.status_pagamento === "pago"
                            ? "text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded"
                            : t.status_pagamento === "cancelado"
                            ? "text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded"
                            : "text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded"
                        }`}
                      >
                        {t.status_pagamento === "pago"
                          ? (t.tipo === "despesa" ? "✓ Pago" : "✓ Recebido")
                          : t.status_pagamento === "cancelado"
                          ? "✕ Cancelado"
                          : "⏳ Pendente"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 border-l border-gray-200 pl-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(t)}
                        title="Editar lançamento"
                        className="p-1.5 text-gray-400 hover:text-amber-800 hover:bg-amber-100/70 rounded-lg transition-colors text-xs font-bold"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingTransacao(t)}
                        title="Excluir lançamento"
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-100/70 rounded-lg transition-colors text-xs font-bold"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "aditivos" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Aditivos contratuais ampliam o valor e prazo oficial acordado com o cliente.
            </p>
            <button
              type="button"
              onClick={() => setShowAditivoModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs transition-all shadow-2xs"
            >
              <span>➕</span> Adicionar Aditivo
            </button>
          </div>

          {aditivos.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-gray-200 p-6 space-y-2">
              <span className="text-3xl">📑</span>
              <p className="text-xs text-gray-500">
                Nenhum aditivo contratual registrado.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-xs divide-y divide-gray-100">
              {aditivos.map((aditivo) => (
                <div
                  key={aditivo.id}
                  className="p-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <div className="text-sm font-bold text-gray-900">
                      Aditivo #{aditivo.numero_aditivo} — {aditivo.descricao}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Aprovado em:{" "}
                      {new Date(aditivo.data_aprovacao).toLocaleDateString("pt-BR")}
                      {aditivo.dias_adicionais > 0 &&
                        ` • +${aditivo.dias_adicionais} dias no prazo`}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-black text-amber-900">
                      +{formatBRL(Number(aditivo.valor))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "fotos" && (
        <div className="space-y-4">
          {fotosComprovantes.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-gray-200 p-6 space-y-2">
              <span className="text-3xl">📷</span>
              <p className="text-xs text-gray-500">
                Nenhum comprovante com foto foi anexado nesta obra ainda.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {fotosComprovantes.map((item) => (
                <div
                  key={item.id}
                  className="group relative bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div
                    onClick={() => setPreviewPhotoUrl(item.foto_url!)}
                    className="cursor-pointer overflow-hidden relative"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.foto_url}
                      alt={item.descricao}
                      className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                      {item.tipo === "despesa" ? "💸 Despesa" : "💰 Receita"}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white space-y-2">
                    <div>
                      <p className="text-xs font-bold text-gray-900 truncate">
                        {item.descricao}
                      </p>
                      <span className="text-[11px] font-extrabold text-gray-700 block">
                        {formatBRL(Number(item.valor))}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(item.data_movimentacao).toLocaleDateString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-1 pt-1.5 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        title="Editar lançamento"
                        className="px-2 py-1 text-gray-600 hover:text-amber-800 hover:bg-amber-100/70 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                      >
                        <span>✏️</span> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingTransacao(item)}
                        title="Excluir lançamento"
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-100/70 rounded-lg text-[11px] font-bold transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de Adicionar Aditivo de Contrato */}
      {showAditivoModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>📑</span> Novo Aditivo Contratual
              </h3>
              <button
                type="button"
                onClick={() => setShowAditivoModal(false)}
                className="text-gray-400 hover:text-gray-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAditivo} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Descrição do Aditivo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={aditivoDescricao}
                  onChange={(e) => setAditivoDescricao(e.target.value)}
                  placeholder="Ex: Instalação de piscina e deck de madeira"
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Valor do Aditivo (R$) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={aditivoValor}
                    onChange={(e) => setAditivoValor(e.target.value)}
                    placeholder="0,00"
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-bold text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Dias Adicionais
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={aditivoDias}
                    onChange={(e) => setAditivoDias(e.target.value)}
                    placeholder="0"
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Data de Aprovação
                </label>
                <input
                  type="date"
                  value={aditivoData}
                  onChange={(e) => setAditivoData(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={savingAditivo}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs sm:text-sm shadow-sm transition-all disabled:opacity-50"
              >
                {savingAditivo ? "Salvando..." : "✓ Salvar Aditivo na Obra"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Visualização da Foto */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div
            className="max-w-xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 flex items-center justify-between border-b border-gray-100">
              <span className="text-xs font-bold text-gray-800">
                Visualização do Comprovante / Nota Fiscal
              </span>
              <button
                type="button"
                onClick={() => setPreviewPhotoUrl(null)}
                className="text-gray-400 hover:text-gray-700 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[65vh] overflow-auto flex items-center justify-center bg-black/5 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewPhotoUrl}
                alt="Comprovante"
                className="max-h-[60vh] object-contain rounded-xl"
              />
            </div>

            {(() => {
              const matched = transacoes.find((t) => t.foto_url === previewPhotoUrl);
              if (!matched) return null;
              return (
                <div className="p-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <span className="font-bold text-gray-900 block truncate">
                      {matched.descricao}
                    </span>
                    <span className="text-gray-500 text-[11px] block mt-0.5">
                      {matched.tipo === "despesa" ? "💸 Despesa: " : "💰 Receita: "}
                      <strong>{formatBRL(Number(matched.valor))}</strong> • {new Date(matched.data_movimentacao).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewPhotoUrl(null);
                        handleOpenEdit(matched);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-100 text-amber-900 font-bold hover:bg-amber-200 text-xs transition-colors"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewPhotoUrl(null);
                        setDeletingTransacao(matched);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-red-100 text-red-700 font-bold hover:bg-red-200 text-xs transition-colors"
                    >
                      🗑️ Excluir
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal de Edição de Transação */}
      {editingTransacao && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>✏️</span> Editar {editingTransacao.tipo === "despesa" ? "Despesa" : "Receita"}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTransacao(null)}
                className="text-gray-400 hover:text-gray-700 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Tipo de Lançamento */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Tipo de Lançamento
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditTipo("despesa")}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
                      editTipo === "despesa"
                        ? "bg-red-50 border-red-300 text-red-700 shadow-2xs"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <span>💸</span> Despesa
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTipo("receita")}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
                      editTipo === "receita"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700 shadow-2xs"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <span>💰</span> Receita / Faturamento
                  </button>
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Descrição <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editDescricao}
                  onChange={(e) => setEditDescricao(e.target.value)}
                  placeholder="Ex: Cimento, Areia, Mão de obra, etc."
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                />
              </div>

              {/* Valor e Data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Valor (R$) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={editValor}
                    onChange={(e) => setEditValor(e.target.value)}
                    placeholder="0,00"
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Data da Movimentação <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={editData}
                    onChange={(e) => setEditData(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Status de Pagamento em Caixas Clicáveis */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Status de Pagamento
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditStatus("pago")}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      editStatus === "pago"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs ring-2 ring-emerald-500/20 font-black"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    }`}
                  >
                    <span className="text-sm">✓</span>
                    <span className="truncate">{editTipo === "despesa" ? "Pago" : "Recebido"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditStatus("pendente")}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      editStatus === "pendente"
                        ? "bg-amber-50 border-amber-500 text-amber-800 shadow-xs ring-2 ring-amber-500/20 font-black"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    }`}
                  >
                    <span className="text-sm">⏳</span>
                    <span className="truncate">{editTipo === "despesa" ? "Pendente" : "A Receber"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditStatus("cancelado")}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      editStatus === "cancelado"
                        ? "bg-rose-50 border-rose-500 text-rose-800 shadow-xs ring-2 ring-rose-500/20 font-black"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    }`}
                  >
                    <span className="text-sm">✕</span>
                    <span className="truncate">Cancelado</span>
                  </button>
                </div>
              </div>

              {/* Forma de Pagamento e Fornecedor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Forma de Pagamento
                  </label>
                  <input
                    type="text"
                    list="formas-pagamento-obra-list"
                    value={editFormaPagamento}
                    onChange={(e) => setEditFormaPagamento(e.target.value)}
                    placeholder="Ex: PIX, Cartão..."
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                  />
                  <datalist id="formas-pagamento-obra-list">
                    <option value="PIX" />
                    <option value="Boleto" />
                    <option value="Cartão de Crédito" />
                    <option value="Cartão de Débito" />
                    <option value="Transferência Bancária" />
                    <option value="Dinheiro" />
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Fornecedor / Favorecido
                  </label>
                  <input
                    type="text"
                    list="fornecedores-obra-list"
                    value={editFornecedorNome}
                    onChange={(e) => setEditFornecedorNome(e.target.value)}
                    placeholder="Nome do fornecedor"
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                  />
                  <datalist id="fornecedores-obra-list">
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Categoria
                </label>
                <input
                  type="text"
                  list="categorias-obra-list"
                  value={editCategoriaNome}
                  onChange={(e) => setEditCategoriaNome(e.target.value)}
                  placeholder="Ex: Materiais, Mão de Obra..."
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                />
                <datalist id="categorias-obra-list">
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
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
                  placeholder="Informações adicionais..."
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingTransacao(null)}
                  className="py-2.5 px-4 rounded-xl text-gray-600 hover:bg-gray-100 font-bold text-xs transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="py-2.5 px-5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50"
                >
                  {savingEdit ? "Salvando..." : "✓ Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {deletingTransacao && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 mx-auto flex items-center justify-center text-2xl">
                🗑️
              </div>
              <h3 className="text-base font-bold text-gray-900">
                Excluir Lançamento?
              </h3>
              <p className="text-xs text-gray-500">
                Tem certeza que deseja excluir{" "}
                <strong className="text-gray-800">{deletingTransacao.descricao}</strong> no valor de{" "}
                <strong className="text-gray-900">{formatBRL(Number(deletingTransacao.valor))}</strong>?
              </p>
              <p className="text-[11px] text-red-500 font-medium">
                Esta ação recalculará os totais da obra e não pode ser desfeita.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTransacao(null)}
                disabled={isDeleting}
                className="w-full py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50"
              >
                {isDeleting ? "Excluindo..." : "Sim, Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição da Obra */}
      {showEditObraModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>🏗️</span> Editar Obra / Projeto
              </h3>
              <button
                type="button"
                onClick={() => setShowEditObraModal(false)}
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
                    onClick={() => setEditObraStatus("ativa")}
                    className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                      editObraStatus === "ativa"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs ring-2 ring-emerald-500/20 font-black"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    <span>🟢</span>
                    <span>Ativa</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditObraStatus("pausada")}
                    className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                      editObraStatus === "pausada"
                        ? "bg-amber-50 border-amber-500 text-amber-800 shadow-xs ring-2 ring-amber-500/20 font-black"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    <span>🟡</span>
                    <span>Pausada</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditObraStatus("concluida")}
                    className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                      editObraStatus === "concluida"
                        ? "bg-blue-50 border-blue-500 text-blue-800 shadow-xs ring-2 ring-blue-500/20 font-black"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    <span>🔵</span>
                    <span>Concluída</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditObraStatus("cancelada")}
                    className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                      editObraStatus === "cancelada"
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
                    value={editObraNome}
                    onChange={(e) => setEditObraNome(e.target.value)}
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
                    value={editObraCliente}
                    onChange={(e) => setEditObraCliente(e.target.value)}
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
                    value={editObraValor}
                    onChange={(e) => setEditObraValor(e.target.value)}
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
                    value={editObraEndereco}
                    onChange={(e) => setEditObraEndereco(e.target.value)}
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
                    value={editObraDataInicio}
                    onChange={(e) => setEditObraDataInicio(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Previsão de Conclusão
                  </label>
                  <input
                    type="date"
                    value={editObraDataFim}
                    onChange={(e) => setEditObraDataFim(e.target.value)}
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
                  value={editObraObservacoes}
                  onChange={(e) => setEditObraObservacoes(e.target.value)}
                  placeholder="Informações adicionais do contrato ou escopo..."
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowEditObraModal(false)}
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
      {showDeleteObraModal && (
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
                Você está prestes a excluir a obra <strong className="text-gray-900">{obra.nome}</strong> (Cliente: {obra.cliente}).
              </p>
              
              <div className="bg-red-50 p-3 rounded-2xl border border-red-200 text-left space-y-1">
                <span className="text-[11px] font-bold text-red-800 uppercase block">
                  Atenção ao impacto:
                </span>
                <p className="text-xs text-red-700">
                  • <strong>{transacoes.length}</strong> despesas/receitas vinculadas.
                </p>
                <p className="text-xs text-red-700">
                  • <strong>{aditivos.length}</strong> aditivos contratuais registrados.
                </p>
                <p className="text-[11px] text-red-600 font-semibold mt-1">
                  Todos os lançamentos financeiros vinculados serão apagados do sistema. Essa ação NÃO pode ser desfeita.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteObraModal(false)}
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
