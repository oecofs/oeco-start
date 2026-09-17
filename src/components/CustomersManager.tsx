"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export type Customer = {
  id: string;
  company_id: string;
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  default_category_id?: string | null;
  default_cost_center?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at?: string;
};

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
};

export default function CustomersManager({ onUpdated }: { onUpdated?: () => void }) {
  const supabase = createClient();
  const { selectedCompany } = useCompany();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [costCenters, setCostCenters] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal de Criação / Edição
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchData = useCallback(async () => {
    if (!selectedCompany) {
      setCustomers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [custRes, catRes, ccRes] = await Promise.all([
        supabase
          .from("customers")
          .select("*")
          .eq("company_id", selectedCompany.id)
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("categories")
          .select("id, name, parent_id")
          .eq("type", "income")
          .order("sort_order", { ascending: true }),
        supabase
          .from("cost_centers")
          .select("id, name")
          .eq("company_id", selectedCompany.id)
          .order("name", { ascending: true }),
      ]);

      if (custRes.data) setCustomers(custRes.data);
      if (catRes.data) setCategories(catRes.data);
      if (ccRes.data) setCostCenters(ccRes.data);
    } catch (err: any) {
      console.error("Erro ao carregar clientes:", err);
      setError("Erro ao carregar dados de clientes.");
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedCompany]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Categorias em cascata (Receitas)
  const parentCategories = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories]
  );

  const availableSubcategories = useMemo(() => {
    if (!parentCategoryId) return [];
    return categories.filter((c) => c.parent_id === parentCategoryId);
  }, [categories, parentCategoryId]);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers;
    const term = searchTerm.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.document && c.document.includes(term)) ||
        (c.phone && c.phone.includes(term)) ||
        (c.email && c.email.toLowerCase().includes(term))
    );
  }, [customers, searchTerm]);

  const handleOpenModal = (customer?: Customer) => {
    setError("");
    setSuccess("");
    if (customer) {
      setEditingCustomer(customer);
      setName(customer.name);
      setDocument(customer.document || "");
      setPhone(customer.phone || "");
      setEmail(customer.email || "");
      setCostCenter(customer.default_cost_center || "");
      setNotes(customer.notes || "");

      if (customer.default_category_id) {
        const cat = categories.find((c) => c.id === customer.default_category_id);
        if (cat) {
          if (cat.parent_id) {
            setParentCategoryId(cat.parent_id);
            setSubCategoryId(cat.id);
          } else {
            setParentCategoryId(cat.id);
            setSubCategoryId("");
          }
        } else {
          setParentCategoryId(customer.default_category_id);
          setSubCategoryId("");
        }
      } else {
        setParentCategoryId("");
        setSubCategoryId("");
      }
    } else {
      setEditingCustomer(null);
      setName("");
      setDocument("");
      setPhone("");
      setEmail("");
      setParentCategoryId("");
      setSubCategoryId("");
      setCostCenter("");
      setNotes("");
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
        document: document.trim() || null,
        phone: phone.trim() || null,
        email: email.trim().toLowerCase() || null,
        default_category_id: effectiveCategoryId,
        default_cost_center: costCenter || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (editingCustomer) {
        const { error: updErr } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", editingCustomer.id);

        if (updErr) throw updErr;
        setSuccess(`Cliente "${name.trim()}" atualizado com sucesso!`);
      } else {
        const { error: insErr } = await supabase.from("customers").insert(payload);
        if (insErr) throw insErr;
        setSuccess(`Cliente "${name.trim()}" cadastrado com sucesso!`);
      }

      setShowModal(false);
      await fetchData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      console.error("Erro ao salvar cliente:", err);
      setError(err.message || "Erro ao salvar cliente.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`Deseja realmente remover o cliente "${customer.name}"?`)) return;

    try {
      const { error } = await supabase
        .from("customers")
        .update({ is_active: false })
        .eq("id", customer.id);

      if (error) throw error;
      await fetchData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(`Erro ao remover: ${err.message}`);
    }
  };

  // Helper para abrir conversa no WhatsApp
  const handleOpenWhatsApp = (phoneStr: string) => {
    const cleanPhone = phoneStr.replace(/\D/g, "");
    if (!cleanPhone) return;
    const finalPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    window.open(`https://wa.me/${finalPhone}`, "_blank");
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Busca */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="🔍 Buscar por nome, CPF/CNPJ, WhatsApp ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs"
          />
        </div>

        <button
          type="button"
          onClick={() => handleOpenModal()}
          className="bg-primary hover:bg-primary-hover text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <span>+</span>
          <span>Novo Cliente</span>
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

      {/* Lista de Clientes */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-gray-400">Carregando clientes...</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <span className="text-3xl">👥</span>
            <p className="text-xs font-semibold text-gray-700">Nenhum cliente encontrado</p>
            <p className="text-[11px] text-gray-400">
              {searchTerm ? "Tente buscar com outros termos." : "Cadastre seus clientes para agilizar faturamentos e contratos."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredCustomers.map((customer) => {
              const cat = categories.find((c) => c.id === customer.default_category_id);

              return (
                <div
                  key={customer.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/70 transition-colors"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-sm">{customer.name}</span>

                      {customer.document && (
                        <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                          {customer.document}
                        </span>
                      )}

                      {customer.phone && (
                        <button
                          type="button"
                          onClick={() => handleOpenWhatsApp(customer.phone!)}
                          className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1 transition-colors cursor-pointer"
                          title="Abrir WhatsApp"
                        >
                          <span>💬</span>
                          <span>{customer.phone}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      {customer.email && (
                        <span className="flex items-center gap-1 text-slate-600">
                          <span>✉️</span> {customer.email}
                        </span>
                      )}

                      {cat && (
                        <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50/60 px-2 py-0.5 rounded text-[11px] font-medium border border-emerald-100">
                          <span>📈</span> {cat.name}
                        </span>
                      )}

                      {customer.default_cost_center && (
                        <span className="flex items-center gap-1 text-blue-700 bg-blue-50/60 px-2 py-0.5 rounded text-[11px] font-medium border border-blue-100">
                          <span>🏢</span> {customer.default_cost_center}
                        </span>
                      )}

                      {customer.notes && (
                        <span className="text-[11px] text-gray-400 italic max-w-xs truncate">
                          "{customer.notes}"
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {customer.phone && (
                      <button
                        type="button"
                        onClick={() => handleOpenWhatsApp(customer.phone!)}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-1"
                        title="Conversar no WhatsApp"
                      >
                        <span>📲</span>
                        <span className="hidden md:inline">WhatsApp</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenModal(customer)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(customer)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">👤</span>
                <h3 className="font-bold text-gray-900 text-base">
                  {editingCustomer ? "Editar Cliente" : "Novo Cliente"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1 uppercase tracking-wider text-[10px]">
                  Nome do Cliente / Razão Social *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Dra. Mariana Costa ou Tech Solutions Ltda"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1 uppercase tracking-wider text-[10px]">
                    CPF ou CNPJ
                  </label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1 uppercase tracking-wider text-[10px]">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1 uppercase tracking-wider text-[10px]">
                  E-mail de Contato / Cobrança
                </label>
                <input
                  type="email"
                  placeholder="cliente@empresa.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>

              {/* Categoria Padrão de Receita */}
              <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-200 space-y-2">
                <span className="block font-bold text-gray-800 text-[11px]">
                  📈 Padrões de Faturamento (Opcional)
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                      Categoria de Receita
                    </label>
                    <select
                      value={parentCategoryId}
                      onChange={(e) => {
                        setParentCategoryId(e.target.value);
                        setSubCategoryId("");
                      }}
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white outline-none focus:border-primary text-xs"
                    >
                      <option value="">Selecione a categoria...</option>
                      {parentCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {availableSubcategories.length > 0 && (
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                        Subcategoria
                      </label>
                      <select
                        value={subCategoryId}
                        onChange={(e) => setSubCategoryId(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white outline-none focus:border-primary text-xs"
                      >
                        <option value="">Nenhuma (Geral)</option>
                        {availableSubcategories.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {sc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className={availableSubcategories.length > 0 ? "sm:col-span-2" : ""}>
                    <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">
                      Centro de Custo
                    </label>
                    <select
                      value={costCenter}
                      onChange={(e) => setCostCenter(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white outline-none focus:border-primary text-xs"
                    >
                      <option value="">Nenhum</option>
                      {costCenters.map((cc) => (
                        <option key={cc.id} value={cc.name}>
                          {cc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1 uppercase tracking-wider text-[10px]">
                  Observações Internas
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Contrato assinado em Jan/26, faturamento todo dia 10..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold shadow-xs transition-colors disabled:opacity-50"
                >
                  {saving ? "Salvando..." : editingCustomer ? "Atualizar Cliente" : "Cadastrar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
