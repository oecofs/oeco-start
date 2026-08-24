"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import Navigation from "@/components/Navigation";
import MonthSelector from "@/components/MonthSelector";
import FinalizeReconciliationModal from "@/components/FinalizeReconciliationModal";

type Category = {
  id: string;
  name: string;
  type: "income" | "expense";
  parent_id: string | null;
  cost_center: string | null;
};

type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category_id: string | null;
  cost_center: string | null;
  is_reconciled: boolean;
  is_internal_transfer: boolean;
  receivable_id: string | null;
  bank_account_id: string | null;
  month_ref: string;
};

function TransactionsContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const { selectedCompany } = useCompany();

  // Mês inicial vindo da URL ou atual
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const urlMonth = searchParams.get("month");
    if (urlMonth && /^\d{4}-\d{2}$/.test(urlMonth)) return urlMonth;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [costCenters, setCostCenters] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [editDescription, setEditDescription] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [transferMenuId, setTransferMenuId] = useState<string | null>(null);
  const [linkMenuId, setLinkMenuId] = useState<string | null>(null);
  const [allReceivables, setAllReceivables] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string }[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [showAccountFilter, setShowAccountFilter] = useState(false);

  // Filtros Rápidos em Cascata (Pills)
  // Nível 1: 'all' | 'income' | 'expense' | 'transfer'
  const [filterLevel1, setFilterLevel1] = useState<"all" | "income" | "expense" | "transfer">(() => {
    const urlType = searchParams.get("type");
    if (urlType === "income" || urlType === "expense" || urlType === "transfer") return urlType;
    return "all";
  });

  // Nível 2: Categoria Pai ID
  const [filterLevel2ParentId, setFilterLevel2ParentId] = useState<string | null>(() => {
    return searchParams.get("category_id") || null;
  });

  // Nível 3: Subcategoria ID
  const [filterLevel3SubId, setFilterLevel3SubId] = useState<string | null>(() => {
    return searchParams.get("subcategory_id") || null;
  });

  const fetchCategories = useCallback(async () => {
    if (!selectedCompany) {
      setCategories([]);
      setCostCenters([]);
      setBankAccounts([]);
      return;
    }

    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("company_id", selectedCompany.id)
      .order("name");
    setCategories(data || []);

    const { data: ccData } = await supabase
      .from("cost_centers")
      .select("id, name")
      .eq("company_id", selectedCompany.id)
      .order("name");
    setCostCenters(ccData || []);

    const { data: accData } = await supabase
      .from("bank_accounts")
      .select("id, name")
      .eq("company_id", selectedCompany.id)
      .eq("is_active", true)
      .order("name");
    setBankAccounts(accData || []);
    if (accData && accData.length > 0 && selectedAccountIds.length === 0) {
      setSelectedAccountIds(accData.map((a: { id: string }) => a.id));
    }
  }, [supabase, selectedCompany, selectedAccountIds.length]);

  const fetchTransactions = useCallback(async () => {
    if (!selectedCompany) {
      setTransactions([]);
      setReceivables([]);
      setAllReceivables([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("company_id", selectedCompany.id)
      .eq("month_ref", selectedMonth)
      .order("date", { ascending: false });
    setTransactions(data || []);

    const { data: recData } = await supabase
      .from("receivables")
      .select("*")
      .eq("company_id", selectedCompany.id)
      .eq("month_ref", selectedMonth)
      .eq("is_active", true);
    setReceivables(recData || []);

    const { data: allRecData } = await supabase
      .from("receivables")
      .select("*")
      .eq("company_id", selectedCompany.id)
      .eq("is_active", true)
      .order("due_date", { ascending: true });
    setAllReceivables(allRecData || []);
    setLoading(false);
  }, [supabase, selectedMonth, selectedCompany]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Lista de Categorias Pai disponíveis para o Nível 2
  const availableParentCategories = useMemo(() => {
    if (filterLevel1 === "income") {
      return categories.filter((c) => c.type === "income" && c.parent_id === null);
    }
    if (filterLevel1 === "expense") {
      return categories.filter((c) => c.type === "expense" && c.parent_id === null);
    }
    if (filterLevel1 === "all") {
      return categories.filter((c) => c.parent_id === null);
    }
    return [];
  }, [filterLevel1, categories]);

  // Lista de Subcategorias disponíveis para o Nível 3
  const availableSubcategories = useMemo(() => {
    if (!filterLevel2ParentId) return [];
    return categories.filter((c) => c.parent_id === filterLevel2ParentId);
  }, [filterLevel2ParentId, categories]);

  // Handlers para os Filtros em Cascata
  function handleSelectLevel1(level: "all" | "income" | "expense" | "transfer") {
    setFilterLevel1(level);
    setFilterLevel2ParentId(null);
    setFilterLevel3SubId(null);
  }

  function handleSelectLevel2(parentId: string) {
    if (filterLevel2ParentId === parentId) {
      setFilterLevel2ParentId(null);
      setFilterLevel3SubId(null);
    } else {
      setFilterLevel2ParentId(parentId);
      setFilterLevel3SubId(null);
    }
  }

  function handleSelectLevel3(subId: string) {
    if (filterLevel3SubId === subId) {
      setFilterLevel3SubId(null);
    } else {
      setFilterLevel3SubId(subId);
    }
  }

  // Filtragem composta
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // 1. Busca textual
      const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // 2. Filtro de Contas Bancárias
      const matchesAccount = selectedAccountIds.length === 0 || selectedAccountIds.includes(t.bank_account_id || "");
      if (!matchesAccount) return false;

      // 3. Nível 1: Tipo
      if (filterLevel1 === "transfer") {
        return t.is_internal_transfer;
      }
      if (t.is_internal_transfer) {
        return filterLevel1 === "all";
      }
      if (filterLevel1 === "income" && t.amount < 0) return false;
      if (filterLevel1 === "expense" && t.amount >= 0) return false;

      // 4. Nível 3: Subcategoria específica
      if (filterLevel3SubId) {
        return t.category_id === filterLevel3SubId;
      }

      // 5. Nível 2: Categoria Pai ou qualquer uma de suas subcategorias
      if (filterLevel2ParentId) {
        if (!t.category_id) return false;
        if (t.category_id === filterLevel2ParentId) return true;
        const subCatIds = categories.filter((c) => c.parent_id === filterLevel2ParentId).map((c) => c.id);
        return subCatIds.includes(t.category_id);
      }

      return true;
    });
  }, [transactions, searchTerm, selectedAccountIds, filterLevel1, filterLevel2ParentId, filterLevel3SubId, categories]);

  const allReconciled = transactions.length > 0 && transactions.every((t) => t.is_reconciled || t.is_internal_transfer);

  function getCategoriesByType(type: "income" | "expense"): Category[] {
    return categories.filter((c) => c.type === type && c.parent_id === null);
  }
  function getSubcategories(parentId: string): Category[] {
    return categories.filter((c) => c.parent_id === parentId);
  }
  function getParentCategoryId(categoryId: string | null): string | null {
    if (!categoryId) return null;
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return null;
    return cat.parent_id || categoryId;
  }
  function isSubcategory(categoryId: string | null): boolean {
    if (!categoryId) return false;
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? cat.parent_id !== null : false;
  }

  async function handleCategoryChange(transactionId: string, categoryId: string | null) {
    let isReconciled = false;
    if (categoryId) {
      const selectedCategory = categories.find((c) => c.id === categoryId);
      const isSub = selectedCategory?.parent_id !== null && selectedCategory?.parent_id !== undefined;
      if (isSub) {
        isReconciled = true;
      } else {
        isReconciled = !categories.some((c) => c.parent_id === categoryId);
      }
    }
    setTransactions((prev) =>
      prev.map((t) => (t.id === transactionId ? { ...t, category_id: categoryId, is_reconciled: isReconciled } : t))
    );
    await supabase.from("transactions").update({ category_id: categoryId, is_reconciled: isReconciled }).eq("id", transactionId);
  }

  async function handleCostCenterChange(transactionId: string, costCenter: string | null) {
    setTransactions((prev) => (prev.map((t) => (t.id === transactionId ? { ...t, cost_center: costCenter } : t))));
    await supabase.from("transactions").update({ cost_center: costCenter }).eq("id", transactionId);
  }

  async function handleSaveDescription(transactionId: string) {
    if (!editDescription.trim()) return;
    setTransactions((prev) => (prev.map((t) => (t.id === transactionId ? { ...t, description: editDescription.trim() } : t))));
    await supabase.from("transactions").update({ description: editDescription.trim() }).eq("id", transactionId);
    setEditingId(null);
  }

  async function handleExportReconciled() {
    const reconciled = transactions.filter((t) => t.is_reconciled);
    if (reconciled.length === 0) return;

    const headers = ["Data", "Descrição", "Valor", "Categoria", "Subcategoria", "Centro de Custo"];

    const rows = reconciled.map((t) => {
      const cat = categories.find((c) => c.id === t.category_id);
      const parentCat = cat && cat.parent_id ? categories.find((c) => c.id === cat.parent_id) : null;

      const categoryName = parentCat ? parentCat.name : cat?.name || "";
      const subcategoryName = parentCat ? cat?.name || "" : "";

      const formattedDate = formatDate(t.date);
      const formattedValue = String(t.amount).replace(".", ",");

      const escapeCsv = (str: string) => `"${str.replace(/"/g, '""')}"`;

      return [
        escapeCsv(formattedDate),
        escapeCsv(t.description),
        escapeCsv(formattedValue),
        escapeCsv(categoryName),
        escapeCsv(subcategoryName),
        escapeCsv(t.cost_center || ""),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `conciliacao_${selectedMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleDeleteTransaction() {
    if (!deleteConfirmId) return;
    await supabase.from("transactions").delete().eq("id", deleteConfirmId);
    setTransactions((prev) => prev.filter((t) => t.id !== deleteConfirmId));
    setDeleteConfirmId(null);
    setOpenMenuId(null);
  }

  async function handleToggleTransfer(transactionId: string, isTransfer: boolean) {
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === transactionId
          ? {
              ...t,
              is_internal_transfer: isTransfer,
              category_id: isTransfer ? null : t.category_id,
              cost_center: isTransfer ? null : t.cost_center,
              is_reconciled: isTransfer ? true : t.is_reconciled,
            }
          : t
      )
    );
    if (isTransfer) {
      await supabase
        .from("transactions")
        .update({
          is_internal_transfer: true,
          category_id: null,
          cost_center: null,
          is_reconciled: true,
        })
        .eq("id", transactionId);
    } else {
      await supabase
        .from("transactions")
        .update({
          is_internal_transfer: false,
        })
        .eq("id", transactionId);
    }
    setTransferMenuId(null);
  }

  const openReceivables = allReceivables.filter((r) => r.status !== "received");

  async function handleLinkReceivable(transactionId: string, receivableId: string) {
    const trx = transactions.find((t) => t.id === transactionId);
    const rec = allReceivables.find((r) => r.id === receivableId);
    if (!trx || !rec) return;

    const transactionAmount = Math.abs(Number(trx.amount));
    const currentReceived = Number(rec.received_amount || 0);
    const newReceivedAmount = currentReceived + transactionAmount;
    const remaining = Number(rec.amount) - newReceivedAmount;
    const newStatus = remaining <= 0 ? "received" : "partial";

    await supabase.from("transactions").update({
      receivable_id: receivableId,
      is_reconciled: true,
    }).eq("id", transactionId);

    await supabase.from("receivables").update({
      received_amount: newReceivedAmount,
      status: newStatus,
      received_at: newStatus === "received" ? trx.date : null,
    }).eq("id", receivableId);

    setTransactions((prev) =>
      prev.map((t) => (t.id === transactionId ? { ...t, receivable_id: receivableId, is_reconciled: true } : t))
    );

    setAllReceivables((prev) =>
      prev.map((r) =>
        r.id === receivableId
          ? { ...r, received_amount: newReceivedAmount, status: newStatus, received_at: newStatus === "received" ? trx.date : r.received_at }
          : r
      )
    );

    setLinkMenuId(null);
  }

  async function handleUnlinkReceivable(transactionId: string) {
    const trx = transactions.find((t) => t.id === transactionId);
    if (!trx || !trx.receivable_id) return;

    const receivableId = trx.receivable_id;
    const rec = allReceivables.find((r) => r.id === receivableId);
    const transactionAmount = Math.abs(Number(trx.amount));
    const currentReceived = rec ? Number(rec.received_amount || 0) : 0;
    const newReceivedAmount = Math.max(0, currentReceived - transactionAmount);
    const newStatus = newReceivedAmount === 0 ? "open" : "partial";

    await supabase.from("transactions").update({
      receivable_id: null,
    }).eq("id", transactionId);

    await supabase.from("receivables").update({
      received_amount: newReceivedAmount,
      status: newStatus,
      received_at: null,
    }).eq("id", receivableId);

    setTransactions((prev) =>
      prev.map((t) => (t.id === transactionId ? { ...t, receivable_id: null } : t))
    );

    setAllReceivables((prev) =>
      prev.map((r) =>
        r.id === receivableId
          ? { ...r, received_amount: newReceivedAmount, status: newStatus, received_at: null }
          : r
      )
    );

    setLinkMenuId(null);
  }

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }
  function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  }

  function toggleAccount(accountId: string) {
    setSelectedAccountIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  }

  function selectAllAccounts() {
    setSelectedAccountIds(bankAccounts.map((a) => a.id));
  }

  function clearAccountFilter() {
    setSelectedAccountIds([]);
  }

  function getAccountName(accountId: string | null): string {
    if (!accountId) return "—";
    const acc = bankAccounts.find((a) => a.id === accountId);
    return acc ? acc.name : "—";
  }

  return (
    <Navigation>
      <div className="p-4 md:p-8 space-y-4">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Transações</h1>
            <p className="text-xs text-gray-500">Conciliação, classificação e auditoria financeira</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 flex-wrap items-center">
            <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
            {bankAccounts.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowAccountFilter(!showAccountFilter)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent whitespace-nowrap flex items-center gap-1"
                >
                  🏦 Contas
                  {selectedAccountIds.length < bankAccounts.length && (
                    <span className="text-xs text-gray-400">
                      ({selectedAccountIds.length}/{bankAccounts.length})
                    </span>
                  )}
                </button>
                {showAccountFilter && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowAccountFilter(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[220px]">
                      {bankAccounts.map((acc) => (
                        <label
                          key={acc.id}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedAccountIds.includes(acc.id)}
                            onChange={() => toggleAccount(acc.id)}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          {acc.name}
                        </label>
                      ))}
                      <div className="border-t border-gray-100 mt-1 pt-1 flex gap-1 px-3 py-1">
                        <button
                          onClick={selectAllAccounts}
                          className="text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded"
                        >
                          Selecionar todas
                        </button>
                        <button
                          onClick={clearAccountFilter}
                          className="text-xs text-gray-400 hover:bg-gray-100 px-2 py-1 rounded"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar descrição..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <button
              onClick={handleExportReconciled}
              disabled={transactions.filter((t) => t.is_reconciled).length === 0}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              title="Exportar transações conciliadas"
            >
              📥 Exportar
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* FILTROS RÁPIDOS EM CASCATA (PILLS)                                        */}
        {/* ========================================================================= */}
        <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-2.5 shadow-sm">
          {/* Nível 1: Tipo */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[50px]">
              Tipo:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: "all", label: "Todas" },
                { id: "income", label: "Receitas", badge: "↑" },
                { id: "expense", label: "Despesas", badge: "↓" },
                { id: "transfer", label: "Entre Contas", badge: "⇄" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectLevel1(item.id as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    filterLevel1 === item.id
                      ? "bg-primary text-white shadow-sm"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {item.badge && <span className="opacity-80">{item.badge}</span>}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Nível 2 (Dinâmico): Categorias Pai */}
          {filterLevel1 !== "transfer" && availableParentCategories.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-100">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[50px]">
                Categoria:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {availableParentCategories.map((parent) => (
                  <button
                    key={parent.id}
                    onClick={() => handleSelectLevel2(parent.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      filterLevel2ParentId === parent.id
                        ? "bg-primary text-white shadow-sm"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {parent.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Nível 3 (Dinâmico): Subcategorias */}
          {filterLevel1 !== "transfer" && availableSubcategories.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-100">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[50px]">
                Subcat:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {availableSubcategories.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => handleSelectLevel3(sub.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      filterLevel3SubId === sub.id
                        ? "bg-primary text-white shadow-sm"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {allReconciled && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-sm text-green-700 font-medium">✅ Todas as transações foram conciliadas!</p>
            <button
              onClick={() => setShowFinalizeModal(true)}
              className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors text-sm whitespace-nowrap"
            >
              Finalizar conciliação
            </button>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400">Carregando transações...</p>
          </div>
        )}

        {!loading && transactions.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 mb-2">Nenhuma transação encontrada neste mês.</p>
            <p className="text-sm text-gray-400">Clique em "Subir extrato" para importar.</p>
          </div>
        )}

        {!loading && transactions.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
                    <th className="py-3 px-2 md:px-3 font-medium whitespace-nowrap text-center w-10">Tipo</th>
                    <th className="py-3 px-2 md:px-3 font-medium whitespace-nowrap">Data</th>
                    <th className="py-3 px-2 md:px-3 font-medium">Descrição</th>
                    <th className="py-3 px-2 md:px-3 font-medium text-right whitespace-nowrap">Valor</th>
                    <th className="py-3 px-2 md:px-3 font-medium whitespace-nowrap">Categoria</th>
                    <th className="py-3 px-2 md:px-3 font-medium whitespace-nowrap">Subcategoria</th>
                    <th className="py-3 px-2 md:px-3 font-medium whitespace-nowrap">C. Custo</th>
                    <th className="py-3 px-2 md:px-3 font-medium whitespace-nowrap">Status</th>
                    <th className="py-3 px-2 md:px-3 font-medium whitespace-nowrap">Conta</th>
                    <th className="py-3 px-2 md:px-3 font-medium whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((trx, index) => {
                    const isNearBottom = index >= filteredTransactions.length - 3;
                    const dropdownPos = isNearBottom ? "bottom-full mb-1" : "top-full mt-1";
                    const type = trx.amount >= 0 ? "income" : "expense";
                    const cats = getCategoriesByType(type);
                    const parentId = getParentCategoryId(trx.category_id);
                    const subIsSelected = isSubcategory(trx.category_id);
                    const subs = parentId ? getSubcategories(parentId) : [];
                    return (
                      <tr key={trx.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-2 px-2 md:px-3 text-center whitespace-nowrap relative">
                          <button
                            onClick={() => setTransferMenuId(transferMenuId === trx.id ? null : trx.id)}
                            className="inline-flex items-center justify-center w-6 h-6 rounded-full hover:opacity-80"
                            style={{
                              backgroundColor: trx.is_internal_transfer ? "#9ca3af" : trx.amount >= 0 ? "#22c55e" : "#ef4444",
                            }}
                            title={
                              trx.is_internal_transfer
                                ? "Transferência entre contas"
                                : trx.amount >= 0
                                ? "Recebimento"
                                : "Pagamento"
                            }
                          >
                            {trx.is_internal_transfer ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M7 7h10M7 17h10M7 7l-3 3M7 7l3 3M17 17l3-3M17 17l-3-3" />
                              </svg>
                            ) : trx.amount >= 0 ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 19V5M5 12l7-7 7 7" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 5v14M19 12l-7 7-7-7" />
                              </svg>
                            )}
                          </button>
                          {transferMenuId === trx.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setTransferMenuId(null)} />
                              <div className={`absolute left-0 ${dropdownPos} z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[190px]`}>
                                {!trx.is_internal_transfer && (
                                  <button
                                    onClick={() => handleToggleTransfer(trx.id, true)}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                                  >
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ backgroundColor: "#9ca3af" }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M7 7h10M7 17h10M7 7l-3 3M7 7l3 3M17 17l3-3M17 17l-3-3" />
                                      </svg>
                                    </span>
                                    Transferência entre contas
                                  </button>
                                )}
                                {trx.is_internal_transfer && (
                                  <button
                                    onClick={() => handleToggleTransfer(trx.id, false)}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                                  >
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ backgroundColor: trx.amount >= 0 ? "#22c55e" : "#ef4444" }}>
                                      {trx.amount >= 0 ? (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M12 19V5M5 12l7-7 7 7" />
                                        </svg>
                                      ) : (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M12 5v14M19 12l-7 7-7-7" />
                                        </svg>
                                      )}
                                    </span>
                                    {trx.amount >= 0 ? "Recebimento" : "Pagamento"}
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="py-2 px-2 md:px-3 text-gray-600 whitespace-nowrap">{formatDate(trx.date)}</td>
                        <td className="py-2 px-2 md:px-3 text-gray-700 relative">
                          {editingId === trx.id ? (
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveDescription(trx.id);
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                              />
                              <button onClick={() => handleSaveDescription(trx.id)} className="text-xs text-primary hover:bg-primary/10 px-1.5 py-0.5 rounded">
                                ✓
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span
                                className="cursor-text hover:bg-gray-100 px-1 py-0.5 rounded"
                                onClick={() => {
                                  setEditingId(trx.id);
                                  setEditDescription(trx.description);
                                }}
                              >
                                {trx.description}
                              </span>
                              {trx.receivable_id ? (
                                (() => {
                                  const linkedRec = allReceivables.find((r) => r.id === trx.receivable_id);
                                  if (!linkedRec) return null;
                                  return (
                                    <button
                                      onClick={() => handleUnlinkReceivable(trx.id)}
                                      className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 flex items-center gap-1 whitespace-nowrap"
                                      title="Clique para desvincular"
                                    >
                                      {linkedRec.nf_number ? `NF ${linkedRec.nf_number}` : linkedRec.client_name} ✕
                                    </button>
                                  );
                                })()
                              ) : trx.amount > 0 && !trx.is_internal_transfer ? (
                                <>
                                  <button
                                    onClick={() => setLinkMenuId(linkMenuId === trx.id ? null : trx.id)}
                                    className="text-xs text-indigo-500 hover:bg-indigo-50 px-1.5 py-0.5 rounded"
                                    title="Vincular recebível"
                                  >
                                    🔗
                                  </button>
                                  {linkMenuId === trx.id && (
                                    <>
                                      <div className="fixed inset-0 z-10" onClick={() => setLinkMenuId(null)} />
                                      <div className={`absolute left-0 ${dropdownPos} z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[280px] max-h-[300px] overflow-y-auto`}>
                                        {openReceivables.length === 0 ? (
                                          <div className="px-3 py-2 text-sm text-gray-400">Nenhum recebível em aberto</div>
                                        ) : (
                                          openReceivables.map((r) => {
                                            const remaining = Number(r.amount) - Number(r.received_amount || 0);
                                            return (
                                              <button
                                                key={r.id}
                                                onClick={() => handleLinkReceivable(trx.id, r.id)}
                                                className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                                              >
                                                <div className="flex items-center gap-2">
                                                  {r.nf_number && (
                                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium whitespace-nowrap">
                                                      NF {r.nf_number}
                                                    </span>
                                                  )}
                                                  <span className="font-medium">{r.client_name}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                                                  <span>{formatCurrency(remaining)} a receber</span>
                                                  {r.status === "partial" && <span className="text-orange-500">parcial</span>}
                                                </div>
                                              </button>
                                            );
                                          })
                                        )}
                                      </div>
                                    </>
                                  )}
                                </>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className={`py-2 px-2 md:px-3 text-right font-medium whitespace-nowrap ${trx.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(trx.amount)}
                        </td>
                        <td className="py-2 px-2 md:px-3">
                          <select
                            value={parentId || ""}
                            onChange={(e) => handleCategoryChange(trx.id, e.target.value || null)}
                            disabled={trx.is_internal_transfer}
                            className={`text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary bg-white max-w-[140px] ${
                              trx.is_internal_transfer ? "opacity-30 cursor-not-allowed" : ""
                            }`}
                          >
                            <option value="">—</option>
                            {cats.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-2 md:px-3">
                          {subs.length > 0 ? (
                            <select
                              value={subIsSelected ? trx.category_id ?? "" : ""}
                              onChange={(e) => handleCategoryChange(trx.id, e.target.value || null)}
                              disabled={trx.is_internal_transfer}
                              className={`text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary bg-white max-w-[120px] ${
                                trx.is_internal_transfer ? "opacity-30 cursor-not-allowed" : ""
                              }`}
                            >
                              <option value="">—</option>
                              {subs.map((sub) => (
                                <option key={sub.id} value={sub.id}>
                                  {sub.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2 md:px-3">
                          <select
                            value={trx.cost_center || ""}
                            onChange={(e) => handleCostCenterChange(trx.id, e.target.value || null)}
                            disabled={trx.is_internal_transfer}
                            className={`text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary bg-white max-w-[110px] ${
                              trx.is_internal_transfer ? "opacity-30 cursor-not-allowed" : ""
                            }`}
                          >
                            <option value="">—</option>
                            {costCenters.map((cc) => (
                              <option key={cc.id} value={cc.name}>
                                {cc.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-2 md:px-3">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                              trx.is_reconciled ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {trx.is_reconciled ? "Conciliada" : "Pendente"}
                          </span>
                        </td>
                        <td className="py-2 px-2 md:px-3 text-xs text-gray-500 whitespace-nowrap">
                          {getAccountName(trx.bank_account_id)}
                        </td>
                        <td className="py-2 px-2 md:px-3 relative">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === trx.id ? null : trx.id)}
                            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                            title="Mais opções"
                          >
                            ⋮
                          </button>
                          {openMenuId === trx.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                              <div className={`absolute right-0 ${dropdownPos} z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]`}>
                                <button
                                  onClick={() => {
                                    setDeleteConfirmId(trx.id);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  🗑 Deletar transação
                                </button>
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
              <span>{filteredTransactions.length} de {transactions.length} transações</span>
              <span>
                {transactions.filter((t) => t.is_reconciled || t.is_internal_transfer).length} conciliadas •{" "}
                {transactions.filter((t) => !t.is_reconciled && !t.is_internal_transfer).length} pendentes
                {transactions.filter((t) => t.is_internal_transfer).length > 0
                  ? ` • ${transactions.filter((t) => t.is_internal_transfer).length} transferências`
                  : ""}
              </span>
            </div>
          </div>
        )}

        <FinalizeReconciliationModal
          open={showFinalizeModal}
          onClose={() => setShowFinalizeModal(false)}
          monthRef={selectedMonth}
          transactions={transactions}
          categories={categories}
          receivables={receivables}
          bankAccounts={bankAccounts}
        />

        {deleteConfirmId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Deletar transação?</h3>
              <p className="text-sm text-gray-500 mb-4">Esta ação não pode ser desfeita. A transação será removida permanentemente.</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  Cancelar
                </button>
                <button onClick={handleDeleteTransaction} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
                  Deletar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Navigation>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Carregando transações...</div>}>
      <TransactionsContent />
    </Suspense>
  );
}
