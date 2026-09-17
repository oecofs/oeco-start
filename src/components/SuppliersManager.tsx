"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export type Supplier = {
  id: string;
  company_id: string;
  name: string;
  cnpj?: string | null;
  default_category_id?: string | null;
  default_cost_center?: string | null;
  default_pix_or_barcode?: string | null;
  is_active: boolean;
  created_at?: string;
};

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
};

export default function SuppliersManager({ onUpdated }: { onUpdated?: () => void }) {
  const supabase = createClient();
  const { selectedCompany } = useCompany();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [costCenters, setCostCenters] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal de Criação / Edição
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchData = useCallback(async () => {
    if (!selectedCompany) {
      setSuppliers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [supRes, catRes, ccRes] = await Promise.all([
        supabase
          .from("suppliers")
          .select("*")
          .eq("company_id", selectedCompany.id)
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("categories")
          .select("id, name, parent_id")
          .eq("type", "expense")
          .order("sort_order", { ascending: true }),
        supabase
          .from("cost_centers")
          .select("id, name")
          .eq("company_id", selectedCompany.id)
          .order("name", { ascending: true }),
      ]);

      if (supRes.data) setSuppliers(supRes.data);
      if (catRes.data) setCategories(catRes.data);
      if (ccRes.data) setCostCenters(ccRes.data);
    } catch (err: any) {
      console.error("Erro ao carregar dados de fornecedores:", err);
      setError("Erro ao carregar fornecedores.");
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedCompany]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Categorias em cascata
  const parentCategories = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories]
  );

  const availableSubcategories = useMemo(() => {
    if (!parentCategoryId) return [];
    return categories.filter((c) => c.parent_id === parentCategoryId);
  }, [categories, parentCategoryId]);

  const filteredSuppliers = useMemo(() => {
    if (!searchTerm.trim()) return suppliers;
    const term = searchTerm.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        (s.cnpj && s.cnpj.includes(term)) ||
        (s.default_pix_or_barcode && s.default_pix_or_barcode.toLowerCase().includes(term))
    );
  }, [suppliers, searchTerm]);

  const handleOpenModal = (supplier?: Supplier) => {
    setError("");
    setSuccess("");
    if (supplier) {
      setEditingSupplier(supplier);
      setName(supplier.name);
      setCnpj(supplier.cnpj || "");
      setCostCenter(supplier.default_cost_center || "");
      setPixKey(supplier.default_pix_or_barcode || "");

      if (supplier.default_category_id) {
        const cat = categories.find((c) => c.id === supplier.default_category_id);
        if (cat) {
          if (cat.parent_id) {
            setParentCategoryId(cat.parent_id);
            setSubCategoryId(cat.id);
          } else {
            setParentCategoryId(cat.id);
            setSubCategoryId("");
          }
        } else {
          setParentCategoryId(supplier.default_category_id);
          setSubCategoryId("");
        }
      } else {
        setParentCategoryId("");
        setSubCategoryId("");
      }
    } else {
      setEditingSupplier(null);
      setName("");
      setCnpj("");
      setParentCategoryId("");
      setSubCategoryId("");
      setCostCenter("");
      setPixKey("");
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !name.trim()) return;

    setSaving(true);
    setError("");

    try {
      const effectiveCategoryId = subCategoryId || parentCategoryId || null;
      const payload = {
        company_id: selectedCompany.id,
        name: name.trim(),
        cnpj: cnpj.trim() || null,
        default_category_id: effectiveCategoryId,
        default_cost_center: costCenter || null,
        default_pix_or_barcode: pixKey.trim() || null,
      };

      if (editingSupplier) {
        const { error: updErr } = await supabase
          .from("suppliers")
          .update(payload)
          .eq("id", editingSupplier.id);

        if (updErr) throw updErr;
        setSuccess(`Fornecedor "${name.trim()}" atualizado com sucesso!`);
      } else {
        const { error: insErr } = await supabase.from("suppliers").insert(payload);
        if (insErr) throw insErr;
        setSuccess(`Fornecedor "${name.trim()}" cadastrado com sucesso!`);
      }

      setShowModal(false);
      await fetchData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      console.error("Erro ao salvar fornecedor:", err);
      setError(err.message || "Erro ao salvar fornecedor.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    if (!confirm(`Deseja realmente remover o fornecedor "${supplier.name}"?`)) return;

    try {
      const { error } = await supabase
        .from("suppliers")
        .update({ is_active: false })
        .eq("id", supplier.id);

      if (error) throw error;
      await fetchData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(`Erro ao remover: ${err.message}`);
    }
  };

  const handleCopyPix = (key: string) => {
    navigator.clipboard.writeText(key);
    alert("Chave Pix copiada!");
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Busca */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="🔍 Buscar por nome, CNPJ ou chave Pix..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="bg-primary hover:bg-primary-hover text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 self-start sm:self-auto"
        >
          <span>+</span>
          <span>Novo Fornecedor</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-xl border border-emerald-200">
          {success}
        </div>
      )}

      {/* Lista de Fornecedores */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-gray-400">Carregando fornecedores...</div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400 space-y-1">
            <p className="text-2xl mb-1">🏢</p>
            <p className="font-semibold text-gray-700">Nenhum fornecedor encontrado.</p>
            <p className="text-gray-400">
              Fornecedores são cadastrados automaticamente ao lançar contas a pagar, ou você pode cadastrar pelo botão acima.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50/80 text-gray-500 font-semibold border-b border-gray-100 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Fornecedor / Favorecido</th>
                  <th className="py-3 px-4">CNPJ</th>
                  <th className="py-3 px-4">Categoria Memorizada</th>
                  <th className="py-3 px-4">Chave Pix Padrão</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {filteredSuppliers.map((s) => {
                  const cat = categories.find((c) => c.id === s.default_category_id);
                  return (
                    <tr key={s.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-4 font-semibold text-gray-900">{s.name}</td>
                      <td className="py-3 px-4 text-gray-500 font-mono text-[11px]">
                        {s.cnpj || "—"}
                      </td>
                      <td className="py-3 px-4">
                        {cat ? (
                          <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium text-[11px]">
                            {cat.name}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-gray-600">
                        {s.default_pix_or_barcode ? (
                          <div className="flex items-center gap-1.5">
                            <span className="truncate max-w-[180px]">{s.default_pix_or_barcode}</span>
                            <button
                              onClick={() => handleCopyPix(s.default_pix_or_barcode!)}
                              className="text-[10px] text-primary hover:underline"
                              title="Copiar Pix"
                            >
                              Copiar
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenModal(s)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                            title="Editar Fornecedor"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(s)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="Remover Fornecedor"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Cadastro / Edição de Fornecedor */}
      {showModal && (
        <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">
                {editingSupplier ? "Editar Fornecedor" : "Novo Fornecedor"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-gray-700 mb-1">
                  Nome do Fornecedor / Favorecido *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Imobiliária Central Ltda"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1">CNPJ / CPF (Opcional)</label>
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>

              {/* Categorias em Cascata */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Categoria Padrão</label>
                  <select
                    value={parentCategoryId}
                    onChange={(e) => {
                      setParentCategoryId(e.target.value);
                      setSubCategoryId("");
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none bg-white"
                  >
                    <option value="">Selecione...</option>
                    {parentCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-gray-700 mb-1">Subcategoria Padrão</label>
                  <select
                    value={subCategoryId}
                    onChange={(e) => setSubCategoryId(e.target.value)}
                    disabled={!parentCategoryId || availableSubcategories.length === 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none bg-white disabled:opacity-50"
                  >
                    <option value="">
                      {!parentCategoryId
                        ? "Selecione a principal"
                        : availableSubcategories.length === 0
                        ? "Sem subcategorias"
                        : "Selecione..."}
                    </option>
                    {availableSubcategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Centro de Custo Padrão */}
              <div>
                <label className="block font-medium text-gray-700 mb-1">Centro de Custo Padrão</label>
                <select
                  value={costCenter}
                  onChange={(e) => setCostCenter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none bg-white"
                >
                  <option value="">Selecione... (Opcional)</option>
                  {costCenters.map((cc) => (
                    <option key={cc.id} value={cc.name}>
                      {cc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Chave Pix Padrão Fixa */}
              <div className="bg-amber-50/50 border border-amber-200/70 rounded-xl p-3 space-y-1">
                <label className="block font-semibold text-amber-900">
                  ⚡ Chave Pix Fixa do Fornecedor
                </label>
                <input
                  type="text"
                  placeholder="CNPJ, E-mail, Telefone ou Chave Aleatória..."
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  className="w-full px-3 py-2 border border-amber-300 rounded-lg font-mono text-xs outline-none bg-white"
                />
                <p className="text-[10px] text-amber-700">
                  Esta chave será carregada automaticamente sempre que você lançar uma conta deste fornecedor.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-xl font-semibold shadow-xs disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Salvar Fornecedor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
