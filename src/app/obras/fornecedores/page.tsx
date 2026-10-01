"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import ObrasBackButton from "@/components/obras/ObrasBackButton";

interface SupplierItem {
  id: string;
  name: string;
  cnpj?: string;
  default_pix_or_barcode?: string;
  is_active: boolean;
  total_compras?: number;
  qtd_compras?: number;
}

export default function ObrasFornecedoresPage() {
  const { selectedCompany } = useCompany();
  const supabase = createClient();

  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modal Novo Fornecedor
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [pix, setPix] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadSuppliers() {
    if (!selectedCompany?.id) return;
    const currentCompanyId = selectedCompany.id;
    setLoading(true);
    try {
      // 1. Fornecedores
      const { data: supData, error: supErr } = await supabase
        .from("suppliers")
        .select("*")
        .eq("company_id", currentCompanyId)
        .order("name");

      if (supErr) throw supErr;

      // 2. Gastos por fornecedor em obras
      const { data: gastosData } = await supabase
        .from("obra_transacoes")
        .select("fornecedor_id, valor")
        .eq("company_id", currentCompanyId)
        .eq("tipo", "despesa");

      const listWithTotals: SupplierItem[] = (supData || []).map((s) => {
        const compras = (gastosData || []).filter((g) => g.fornecedor_id === s.id);
        const total = compras.reduce((sum, c) => sum + Number(c.valor || 0), 0);
        return {
          ...s,
          total_compras: total,
          qtd_compras: compras.length,
        };
      });

      setSuppliers(listWithTotals);
    } catch (err) {
      console.error("Erro ao carregar fornecedores:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSuppliers();
  }, [selectedCompany]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompany?.id || !name.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase.from("suppliers").insert({
        company_id: selectedCompany.id,
        name: name.trim(),
        cnpj: cnpj.trim() || null,
        default_pix_or_barcode: pix.trim() || null,
        is_active: true,
      });

      if (error) throw error;

      setShowModal(false);
      setName("");
      setCnpj("");
      setPix("");
      loadSuppliers();
    } catch (err: any) {
      alert(err.message || "Erro ao cadastrar fornecedor.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.cnpj && s.cnpj.includes(search))
    );
  }, [suppliers, search]);

  function formatBRL(val: number) {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <ObrasBackButton />
            <h1 className="text-xl sm:text-2xl font-black text-gray-900">
              Fornecedores de Obras
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Lojas de materiais, locadores de máquinas e prestadores de serviço.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs sm:text-sm shadow-sm transition-all active:scale-95"
        >
          <span>➕</span> Novo Fornecedor
        </button>
      </div>

      <div className="bg-white rounded-2xl p-3 border border-gray-200 shadow-xs">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou CNPJ..."
          className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-amber-500 font-medium"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-gray-200 text-gray-500 font-semibold animate-pulse">
          Carregando fornecedores...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-gray-200 p-6 space-y-3">
          <span className="text-3xl">🏢</span>
          <p className="text-xs text-gray-500">Nenhum fornecedor cadastrado.</p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-amber-700 text-white text-xs font-bold rounded-xl"
          >
            + Cadastrar Fornecedor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-3xl border border-gray-200 p-5 shadow-xs flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-gray-900">{s.name}</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Ativo
                  </span>
                </div>
                {s.cnpj && (
                  <p className="text-xs text-gray-500 mt-0.5">CNPJ: {s.cnpj}</p>
                )}
                {s.default_pix_or_barcode && (
                  <p className="text-xs text-gray-500 mt-0.5">Chave Pix: {s.default_pix_or_barcode}</p>
                )}
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="text-gray-500 font-medium">
                  {s.qtd_compras || 0} compras em obras
                </span>
                <span className="font-extrabold text-amber-900">
                  Total: {formatBRL(s.total_compras || 0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Novo Fornecedor */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>🏢</span> Cadastrar Fornecedor
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Nome / Razão Social <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Comercial Esperança Materiais"
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  CNPJ / CPF
                </label>
                <input
                  type="text"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Chave Pix (Opcional)
                </label>
                <input
                  type="text"
                  value={pix}
                  onChange={(e) => setPix(e.target.value)}
                  placeholder="E-mail, CNPJ, Celular ou Aleatória"
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs sm:text-sm shadow-sm transition-all disabled:opacity-50"
              >
                {saving ? "Salvando..." : "✓ Salvar Fornecedor"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
