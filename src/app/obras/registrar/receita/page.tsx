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

function RegistrarReceitaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preSelectedObraId = searchParams.get("obraId");

  const { selectedCompany } = useCompany();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [obras, setObras] = useState<ObraOption[]>([]);
  const [obraId, setObraId] = useState(preSelectedObraId || "");
  const [dataMovimentacao, setDataMovimentacao] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [statusPagamento, setStatusPagamento] = useState("recebido");
  const [observacoes, setObservacoes] = useState("");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!selectedCompany?.id) return;
    const currentCompanyId = selectedCompany.id;
    async function loadObras() {
      const { data } = await supabase
        .from("obras")
        .select("id, nome, cliente")
        .eq("company_id", currentCompanyId)
        .eq("status", "ativa")
        .order("nome");
      setObras(data || []);
      if (!preSelectedObraId && data && data.length === 1) {
        setObraId(data[0].id);
      }
    }
    loadObras();
  }, [selectedCompany, supabase, preSelectedObraId]);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    try {
      const { blob, base64 } = await compressImage(file, 1600, 1600, 0.8);
      setCompressedBlob(blob);
      setPhotoPreview(base64);
    } catch (err) {
      console.error("Erro na compressão:", err);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompany?.id) return;

    if (!obraId) {
      setFeedback({ type: "error", message: "Selecione a obra correspondente." });
      return;
    }

    const valorNum = parseFloat(valor.replace(",", "."));
    if (isNaN(valorNum) || valorNum <= 0) {
      setFeedback({ type: "error", message: "Informe um valor válido maior que zero." });
      return;
    }

    if (!descricao.trim()) {
      setFeedback({ type: "error", message: "Informe a descrição do faturamento/recebimento." });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      let uploadedPhotoUrl = null;
      if (compressedBlob) {
        const fileName = `${selectedCompany.id}/${Date.now()}_rec_${Math.random()
          .toString(36)
          .substring(2, 9)}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from("comprovantes_obras")
          .upload(fileName, compressedBlob, { contentType: "image/jpeg" });

        if (!uploadError) {
          const { data: publicData } = supabase.storage
            .from("comprovantes_obras")
            .getPublicUrl(fileName);
          uploadedPhotoUrl = publicData?.publicUrl;
        }
      }

      const { error: insertError } = await supabase.from("obra_transacoes").insert({
        company_id: selectedCompany.id,
        obra_id: obraId,
        tipo: "receita",
        descricao: descricao.trim(),
        valor: valorNum,
        data_movimentacao: dataMovimentacao,
        forma_pagamento: formaPagamento,
        status_pagamento: statusPagamento === "recebido" ? "pago" : "pendente",
        foto_url: uploadedPhotoUrl,
        observacoes: observacoes.trim() || null,
      });

      if (insertError) throw insertError;

      setFeedback({
        type: "success",
        message: "Receita registrada com sucesso na obra!",
      });

      setTimeout(() => {
        setDescricao("");
        setValor("");
        setObservacoes("");
        setPhotoFile(null);
        setPhotoPreview(null);
        setCompressedBlob(null);
        setFeedback(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 1500);
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Erro ao registrar receita.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
              Registrar Receita da Obra
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Lance pagamentos de clientes, medições ou aportes da obra.
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhoto}
        className="hidden"
      />

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

      {photoPreview && (
        <div className="bg-white rounded-3xl p-4 border border-emerald-200 shadow-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoPreview}
              alt="Comprovante"
              className="w-16 h-16 object-cover rounded-xl border border-gray-200"
            />
            <span className="text-xs text-emerald-800 font-bold">
              ✓ Comprovante anexado
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setPhotoFile(null);
              setPhotoPreview(null);
              setCompressedBlob(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="text-xs font-semibold text-red-600 hover:underline"
          >
            Remover
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-200/80 shadow-xs space-y-5">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Obra de Destino <span className="text-red-500">*</span>
          </label>
          <select
            value={obraId}
            onChange={(e) => setObraId(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-medium bg-white"
          >
            <option value="">Selecione a Obra...</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                🏗️ {o.nome} ({o.cliente})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Valor Recebido / Faturado (R$) <span className="text-red-500">*</span>
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
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-base font-black text-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Data da Receita <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={dataMovimentacao}
              onChange={(e) => setDataMovimentacao(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-medium"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Descrição do Recebimento <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Medição 01 - Alvenaria e Cobertura, Sinal do Contrato"
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-medium"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Forma de Recebimento
            </label>
            <select
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-medium bg-white"
            >
              <option value="pix">PIX</option>
              <option value="transferencia">Transferência Bancária</option>
              <option value="boleto">Boleto Bancário</option>
              <option value="cartao">Cartão de Crédito/Débito</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="outro">Outro</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Status do Recebimento
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStatusPagamento("recebido")}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                  statusPagamento === "recebido"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                    : "bg-gray-50 text-gray-600 border-gray-200"
                }`}
              >
                ✓ Já Recebido
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
                ⏳ A Receber (Futuro)
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Comprovante Bancário (Opcional)
          </label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2 px-3 rounded-xl border border-dashed border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-900 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <span>📎</span> {photoFile ? "Substituir Comprovante" : "Anexar Comprovante / Depósito"}
          </button>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Observações (Opcional)
          </label>
          <textarea
            rows={2}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Ex: Pago via TED na conta Itaú da construtora"
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-medium resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm sm:text-base shadow-md shadow-emerald-600/20 active:scale-[0.99] transition-all disabled:opacity-50"
        >
          {submitting ? "Salvando Receita..." : "✓ Salvar Receita na Obra"}
        </button>
      </form>
    </div>
  );
}

export default function RegistrarReceitaPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-20 text-gray-500 font-semibold animate-pulse">
          Carregando formulário de receita...
        </div>
      }
    >
      <RegistrarReceitaContent />
    </Suspense>
  );
}
