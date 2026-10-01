"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

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
  tipo: "despesa" | "receita";
  descricao: string;
  valor: number;
  data_movimentacao: string;
  forma_pagamento?: string;
  status_pagamento: "pago" | "pendente" | "cancelado";
  fornecedor_nome?: string;
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
          <div className="flex items-center gap-2">
            <Link
              href="/obras/lista"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              ←
            </Link>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900">
              {obra.nome}
            </h1>
            <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full bg-amber-100 text-amber-900 border border-amber-200">
              {obra.status}
            </span>
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
          {transacoes.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-gray-200 p-6 space-y-2">
              <span className="text-3xl">📝</span>
              <p className="text-xs text-gray-500">
                Nenhuma movimentação registrada para esta obra ainda.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-xs divide-y divide-gray-100">
              {transacoes.map((t) => (
                <div
                  key={t.id}
                  className="p-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                        t.tipo === "despesa"
                          ? "bg-red-100 text-red-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {t.tipo === "despesa" ? "💸" : "💰"}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        {t.descricao}
                        {t.foto_url && (
                          <button
                            type="button"
                            onClick={() => setPreviewPhotoUrl(t.foto_url!)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold hover:underline"
                          >
                            📸 Ver Nota
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {new Date(t.data_movimentacao).toLocaleDateString("pt-BR")}
                        {t.fornecedor_nome && ` • 🏢 ${t.fornecedor_nome}`}
                        {t.categoria_nome && ` • 🏷️ ${t.categoria_nome}`}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-sm sm:text-base font-black ${
                        t.tipo === "despesa" ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {t.tipo === "despesa" ? "-" : "+"} {formatBRL(Number(t.valor))}
                    </span>
                    <span
                      className={`text-[10px] block font-bold uppercase ${
                        t.status_pagamento === "pago"
                          ? "text-emerald-700"
                          : "text-amber-700"
                      }`}
                    >
                      {t.status_pagamento === "pago" ? "✓ Pago" : "⏳ Pendente"}
                    </span>
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
                  onClick={() => setPreviewPhotoUrl(item.foto_url!)}
                  className="group relative bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs hover:shadow-md cursor-pointer transition-all"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.foto_url}
                    alt={item.descricao}
                    className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="p-2.5 bg-white">
                    <p className="text-xs font-bold text-gray-900 truncate">
                      {item.descricao}
                    </p>
                    <span className="text-[10px] text-gray-500">
                      {formatBRL(Number(item.valor))}
                    </span>
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
                className="text-gray-400 hover:text-gray-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto flex items-center justify-center bg-black/5 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewPhotoUrl}
                alt="Comprovante"
                className="max-h-[70vh] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
