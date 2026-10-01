"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export default function NovaObraPage() {
  const router = useRouter();
  const { selectedCompany } = useCompany();
  const supabase = createClient();

  const [nome, setNome] = useState("");
  const [cliente, setCliente] = useState("");
  const [endereco, setEndereco] = useState("");
  const [dataInicio, setDataInicio] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [dataFimPrevisto, setDataFimPrevisto] = useState("");
  const [valorContratado, setValorContratado] = useState("");
  const [status, setStatus] = useState<"ativa" | "pausada" | "concluida">("ativa");
  const [observacoes, setObservacoes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompany?.id) return;

    if (!nome.trim() || !cliente.trim()) {
      setError("Nome da obra e nome do cliente são obrigatórios.");
      return;
    }

    const valorNum = valorContratado
      ? parseFloat(valorContratado.replace(",", "."))
      : 0;

    setSubmitting(true);
    setError("");

    try {
      const { data, error: insertErr } = await supabase
        .from("obras")
        .insert({
          company_id: selectedCompany.id,
          nome: nome.trim(),
          cliente: cliente.trim(),
          endereco: endereco.trim() || null,
          data_inicio: dataInicio,
          data_fim_previsto: dataFimPrevisto || null,
          valor_contratado: isNaN(valorNum) ? 0 : valorNum,
          status: status,
          observacoes: observacoes.trim() || null,
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;

      router.push(`/obras/lista/${data.id}`);
    } catch (err: any) {
      setError(err.message || "Erro ao criar obra.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/obras/lista"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          ←
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900">
            Cadastrar Nova Obra
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Defina o contrato, cliente e prazo para começar a controlar os custos.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 text-red-800 border border-red-200 text-sm font-semibold">
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-200/80 shadow-xs space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Nome da Obra / Projeto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Reforma Apt 402, Residência Alphaville"
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Nome do Cliente <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Ex: Dr. Roberto Silva, Construtora Horizon"
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Endereço / Localização da Obra
          </label>
          <input
            type="text"
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
            placeholder="Ex: Rua das Palmeiras, 120 - Bloco 2"
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Valor Contratado Base (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">
                R$
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={valorContratado}
                onChange={(e) => setValorContratado(e.target.value)}
                placeholder="0,00"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-bold text-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Data de Início <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Previsão de Término
            </label>
            <input
              type="date"
              value={dataFimPrevisto}
              onChange={(e) => setDataFimPrevisto(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Status Inicial
          </label>
          <div className="flex gap-2">
            {[
              { id: "ativa", label: "🟢 Ativa / Em Andamento" },
              { id: "pausada", label: "🟡 Pausada" },
              { id: "concluida", label: "🔵 Concluída" },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatus(st.id as any)}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                  status === st.id
                    ? "bg-amber-800 text-white border-amber-800 shadow-2xs"
                    : "bg-gray-50 text-gray-600 border-gray-200"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Observações / Escopo da Obra
          </label>
          <textarea
            rows={3}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Ex: Escopo inclui demolição, hidráulica, elétrica e pisos porcelanatos."
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 px-4 rounded-2xl bg-amber-700 hover:bg-amber-800 text-white font-extrabold text-sm sm:text-base shadow-md shadow-amber-700/20 active:scale-[0.99] transition-all disabled:opacity-50"
        >
          {submitting ? "Cadastrando Obra..." : "✓ Cadastrar Obra"}
        </button>
      </form>
    </div>
  );
}
