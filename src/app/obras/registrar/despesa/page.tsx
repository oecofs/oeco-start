"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { compressImage } from "@/lib/imageCompression";

interface ObraOption {
  id: string;
  nome: string;
  cliente: string;
}

interface SupplierOption {
  id: string;
  name: string;
  cnpj?: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

function RegistrarDespesaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preSelectedObraId = searchParams.get("obraId");

  const { selectedCompany } = useCompany();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados de dados
  const [obras, setObras] = useState<ObraOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  // Formulário
  const [obraId, setObraId] = useState(preSelectedObraId || "");
  const [dataMovimentacao, setDataMovimentacao] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [statusPagamento, setStatusPagamento] = useState("pago");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Foto & OCR
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrSuccessMsg, setOcrSuccessMsg] = useState<string | null>(null);
  const [ocrRaw, setOcrRaw] = useState<any>(null);

  // Modal de Fornecedor
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierCnpj, setNewSupplierCnpj] = useState("");
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  // Status de envio
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Carregar Obras, Fornecedores e Categorias da Empresa
  useEffect(() => {
    if (!selectedCompany?.id) return;
    const currentCompanyId = selectedCompany.id;

    async function loadInitialData() {
      try {
        // 1. Obras Ativas
        const { data: obrasData } = await supabase
          .from("obras")
          .select("id, nome, cliente")
          .eq("company_id", currentCompanyId)
          .eq("status", "ativa")
          .order("nome");
        setObras(obrasData || []);

        if (!preSelectedObraId && obrasData && obrasData.length === 1) {
          setObraId(obrasData[0].id);
        }

        // 2. Fornecedores
        const { data: supData } = await supabase
          .from("suppliers")
          .select("id, name, cnpj")
          .eq("company_id", currentCompanyId)
          .eq("is_active", true)
          .order("name");
        setSuppliers(supData || []);

        // 3. Categorias
        const { data: catData } = await supabase
          .from("categories")
          .select("id, name")
          .eq("company_id", currentCompanyId)
          .order("name");
        setCategories(catData || []);
      } catch (err) {
        console.error("Erro ao carregar dados iniciais:", err);
      }
    }

    loadInitialData();
  }, [selectedCompany, supabase, preSelectedObraId]);

  // Manipular upload de foto e disparar IA OCR
  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);
    setOcrLoading(true);
    setOcrSuccessMsg(null);
    setFeedback(null);

    try {
      // 1. Comprime a imagem no navegador
      const { blob, base64 } = await compressImage(file, 1600, 1600, 0.8);
      setCompressedBlob(blob);
      setPhotoPreview(base64);

      // 2. Chama API de OCR com IA Vision
      const res = await fetch("/api/obras/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });

      const resData = await res.json();

      if (res.ok && resData.data) {
        const ocr = resData.data;
        setOcrRaw(ocr);

        // Preenchimento automático inteligente dos campos
        if (ocr.valor && Number(ocr.valor) > 0) {
          setValor(String(ocr.valor));
        }
        if (ocr.data) {
          setDataMovimentacao(ocr.data);
        }
        if (ocr.descricao) {
          setDescricao(ocr.descricao);
        }
        if (ocr.forma_pagamento) {
          setFormaPagamento(ocr.forma_pagamento);
        }

        // Trata fornecedor extraído pelo OCR
        if (ocr.fornecedor) {
          setSupplierName(ocr.fornecedor);

          // Verifica se já existe fornecedor com nome similar
          const matched = suppliers.find(
            (s) =>
              s.name.toLowerCase().includes(ocr.fornecedor.toLowerCase()) ||
              ocr.fornecedor.toLowerCase().includes(s.name.toLowerCase())
          );
          if (matched) {
            setSelectedSupplierId(matched.id);
            setSupplierName(matched.name);
          }
        }

        // Tenta achar categoria similar
        if (ocr.categoria_sugerida) {
          const matchedCat = categories.find((c) =>
            c.name.toLowerCase().includes(ocr.categoria_sugerida.toLowerCase())
          );
          if (matchedCat) {
            setCategoriaId(matchedCat.id);
          }
        }

        setOcrSuccessMsg("✨ Dados da nota lidos com sucesso pela IA!");
      }
    } catch (err: any) {
      console.error("Erro no processamento OCR:", err);
    } finally {
      setOcrLoading(false);
    }
  }

  // Criar novo fornecedor inline
  async function handleCreateSupplierInline(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompany || !newSupplierName.trim()) return;

    setCreatingSupplier(true);
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          company_id: selectedCompany.id,
          name: newSupplierName.trim(),
          cnpj: newSupplierCnpj.trim() || null,
          is_active: true,
        })
        .select("id, name, cnpj")
        .single();

      if (error) throw error;

      if (data) {
        setSuppliers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedSupplierId(data.id);
        setSupplierName(data.name);
        setShowSupplierModal(false);
        setNewSupplierName("");
        setNewSupplierCnpj("");
      }
    } catch (err: any) {
      alert(err.message || "Erro ao criar fornecedor.");
    } finally {
      setCreatingSupplier(false);
    }
  }

  // Submissão do formulário
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompany?.id) return;

    if (!obraId) {
      setFeedback({ type: "error", message: "Selecione a obra de destino." });
      return;
    }

    const valorNum = parseFloat(valor.replace(",", "."));
    if (isNaN(valorNum) || valorNum <= 0) {
      setFeedback({ type: "error", message: "Informe um valor válido maior que zero." });
      return;
    }

    if (!descricao.trim()) {
      setFeedback({ type: "error", message: "Informe a descrição do gasto." });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      let uploadedPhotoUrl = null;

      // 1. Upload do comprovante comprimido para o Storage
      if (compressedBlob) {
        const fileExt = "jpg";
        const fileName = `${selectedCompany.id}/${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 9)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("comprovantes_obras")
          .upload(fileName, compressedBlob, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (uploadError) {
          console.warn("Aviso upload:", uploadError.message);
        } else {
          const { data: publicUrlData } = supabase.storage
            .from("comprovantes_obras")
            .getPublicUrl(fileName);
          uploadedPhotoUrl = publicUrlData?.publicUrl;
        }
      }

      // 2. Salva a movimentação na tabela obra_transacoes
      const categoriaObj = categories.find((c) => c.id === categoriaId);

      const { error: insertError } = await supabase.from("obra_transacoes").insert({
        company_id: selectedCompany.id,
        obra_id: obraId,
        tipo: "despesa",
        descricao: descricao.trim(),
        valor: valorNum,
        data_movimentacao: dataMovimentacao,
        forma_pagamento: formaPagamento,
        status_pagamento: statusPagamento,
        fornecedor_id: selectedSupplierId || null,
        fornecedor_nome: supplierName.trim() || null,
        categoria_id: categoriaId || null,
        categoria_nome: categoriaObj?.name || null,
        foto_url: uploadedPhotoUrl,
        ocr_raw: ocrRaw,
        observacoes: observacoes.trim() || null,
      });

      if (insertError) throw insertError;

      setFeedback({
        type: "success",
        message: "Despesa registrada com sucesso na obra!",
      });

      // Limpar campos para o próximo lançamento
      setTimeout(() => {
        setDescricao("");
        setValor("");
        setSupplierName("");
        setSelectedSupplierId("");
        setObservacoes("");
        setPhotoFile(null);
        setPhotoPreview(null);
        setCompressedBlob(null);
        setOcrRaw(null);
        setOcrSuccessMsg(null);
        setFeedback(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 1500);
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Erro ao registrar despesa.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const filteredSuppliers = suppliers.filter((s) =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.cnpj && s.cnpj.includes(supplierSearch))
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/obras/registrar"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              ←
            </Link>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900">
              Registrar Despesa
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Tire uma foto do cupom/recibo ou preencha os dados manualmente.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs sm:text-sm transition-all shadow-2xs"
        >
          <span>📸</span> Tirar Foto / OCR
        </button>
      </div>

      {/* Input de Câmera/Arquivo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoCapture}
        className="hidden"
      />

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl text-sm font-semibold flex items-center justify-between gap-3 shadow-xs ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <span>{feedback.message}</span>
          {feedback.type === "success" && (
            <button
              type="button"
              onClick={() => router.push(`/obras/lista/${obraId}`)}
              className="underline text-xs font-bold"
            >
              Ver Extrato da Obra →
            </button>
          )}
        </div>
      )}

      {/* Card da Foto & Status OCR */}
      {photoPreview && (
        <div className="bg-white rounded-3xl p-4 border border-amber-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <span>🖼️</span> Foto do Comprovante / Nota
            </span>
            <button
              type="button"
              onClick={() => {
                setPhotoFile(null);
                setPhotoPreview(null);
                setCompressedBlob(null);
                setOcrRaw(null);
                setOcrSuccessMsg(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              Remover Foto
            </button>
          </div>

          <div className="flex gap-4 items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoPreview}
              alt="Comprovante"
              className="w-20 h-20 object-cover rounded-2xl border border-gray-200 shadow-2xs"
            />
            <div className="flex-1 text-xs text-gray-600">
              {ocrLoading ? (
                <div className="flex items-center gap-2 text-amber-700 font-semibold animate-pulse">
                  <span className="animate-spin">🔄</span> Lendo dados da nota fiscal com IA...
                </div>
              ) : ocrSuccessMsg ? (
                <div className="text-emerald-700 font-semibold bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                  {ocrSuccessMsg}
                </div>
              ) : (
                <p>Foto anexada e pronta para envio.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Formulário Principal */}
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-200/80 shadow-xs space-y-5">
        {/* Seleção da Obra */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Obra de Destino <span className="text-red-500">*</span>
          </label>
          <select
            value={obraId}
            onChange={(e) => setObraId(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium bg-white"
          >
            <option value="">Selecione a Obra...</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                🏗️ {o.nome} ({o.cliente})
              </option>
            ))}
          </select>
        </div>

        {/* Linha: Valor e Data */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Valor do Gasto (R$) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">
                R$
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                required
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-base font-black text-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Data do Pagamento/Compra <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={dataMovimentacao}
              onChange={(e) => setDataMovimentacao(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
            />
          </div>
        </div>

        {/* Descrição do Gasto */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Descrição do Item / Serviço <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: 50 sacos de cimento, Areia lavada, Diária encanador"
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
          />
        </div>

        {/* Fornecedor com Modal de Seleção/Cadastro Rápido */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Fornecedor / Loja
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowSupplierModal(true)}
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-300 text-left text-sm font-medium bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
            >
              <span className={supplierName ? "text-gray-900 font-bold" : "text-gray-400"}>
                {supplierName ? `🏢 ${supplierName}` : "Selecionar ou Cadastrar Fornecedor..."}
              </span>
              <span className="text-xs text-gray-400">Buscar 🔍</span>
            </button>

            {supplierName && (
              <button
                type="button"
                onClick={() => {
                  setSelectedSupplierId("");
                  setSupplierName("");
                }}
                className="px-3 py-2 text-xs font-bold text-gray-500 hover:text-red-600 bg-gray-100 rounded-xl"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Linha: Categoria e Forma de Pagamento */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Categoria do Gasto
            </label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium bg-white"
            >
              <option value="">Selecione a Categoria...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Forma de Pagamento
            </label>
            <select
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium bg-white"
            >
              <option value="pix">PIX</option>
              <option value="boleto">Boleto Bancário</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="cartao_debito">Cartão de Débito</option>
              <option value="transferencia">Transferência Bancária</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="cheque">Cheque</option>
              <option value="outro">Outro</option>
            </select>
          </div>
        </div>

        {/* Linha: Status do Pagamento e Botão Foto */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Status do Pagamento
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStatusPagamento("pago")}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                  statusPagamento === "pago"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                    : "bg-gray-50 text-gray-600 border-gray-200"
                }`}
              >
                ✓ Já Pago
              </button>
              <button
                type="button"
                onClick={() => setStatusPagamento("pendente")}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                  statusPagamento === "pendente"
                    ? "bg-amber-600 text-white border-amber-600 shadow-2xs"
                    : "bg-gray-50 text-gray-600 border-gray-200"
                }`}
              >
                ⏳ A Pagar (Pendente)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Foto do Comprovante
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 px-3 rounded-xl border border-dashed border-amber-400 bg-amber-50/50 hover:bg-amber-50 text-amber-900 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <span>📷</span> {photoFile ? "Substituir Foto" : "Anexar Comprovante / Foto"}
            </button>
          </div>
        </div>

        {/* Observações */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Observações Adicionais (Opcional)
          </label>
          <textarea
            rows={2}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Ex: Entregue no bloco B, nota fiscal número 4920"
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium resize-none"
          />
        </div>

        {/* Botão Salvar */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-sm sm:text-base shadow-md shadow-amber-600/20 active:scale-[0.99] transition-all disabled:opacity-50"
        >
          {submitting ? "Salvando Despesa..." : "✓ Salvar Despesa na Obra"}
        </button>
      </form>

      {/* Modal de Busca / Cadastro Rápido de Fornecedor */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>🏢</span> Selecionar Fornecedor
              </h3>
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="text-gray-400 hover:text-gray-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Campo de Busca */}
            <input
              type="text"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="Buscar por nome ou CNPJ..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm font-medium"
            />

            {/* Lista de Fornecedores */}
            <div className="max-h-44 overflow-y-auto space-y-1 divide-y divide-gray-100">
              {filteredSuppliers.length > 0 ? (
                filteredSuppliers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedSupplierId(s.id);
                      setSupplierName(s.name);
                      setShowSupplierModal(false);
                    }}
                    className="w-full text-left p-2.5 hover:bg-amber-50 rounded-xl flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="text-sm font-bold text-gray-900">{s.name}</div>
                      {s.cnpj && <div className="text-[11px] text-gray-500">{s.cnpj}</div>}
                    </div>
                    <span className="text-xs text-amber-700 font-bold">Selecionar →</span>
                  </button>
                ))
              ) : (
                <div className="p-3 text-center text-xs text-gray-500">
                  Nenhum fornecedor encontrado com este termo.
                </div>
              )}
            </div>

            {/* Cadastro Rápido Inline de Novo Fornecedor */}
            <div className="pt-3 border-t border-gray-200">
              <span className="text-xs font-bold text-gray-700 block mb-2">
                + Novo Fornecedor Rápido
              </span>
              <div className="space-y-2">
                <input
                  type="text"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  placeholder="Nome do Novo Fornecedor"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-medium"
                />
                <input
                  type="text"
                  value={newSupplierCnpj}
                  onChange={(e) => setNewSupplierCnpj(e.target.value)}
                  placeholder="CNPJ (opcional)"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-medium"
                />
                <button
                  type="button"
                  disabled={creatingSupplier || !newSupplierName.trim()}
                  onClick={handleCreateSupplierInline}
                  className="w-full py-2 px-3 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs transition-all disabled:opacity-50"
                >
                  {creatingSupplier ? "Cadastrando..." : "Cadastrar e Selecionar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RegistrarDespesaPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-20 text-gray-500 font-semibold animate-pulse">
          Carregando formulário de despesa...
        </div>
      }
    >
      <RegistrarDespesaContent />
    </Suspense>
  );
}
