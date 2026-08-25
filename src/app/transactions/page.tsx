"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import Navigation from "@/components/Navigation";
import MonthSelector from "@/components/MonthSelector";
import FinalizeReconciliationModal from "@/components/FinalizeReconciliationModal";
import {
  generateBulkSuggestions,
  HistoricalTransaction,
  SuggestionResult,
} from "@/lib/categorizer";

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
  const [historicalTransactions, setHistoricalTransactions] = useState<HistoricalTransaction[]>([]);
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
  const [contractsList, setContractsList] = useState<{ id: string; client_name: string; title: string }[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string }[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [showAccountFilter, setShowAccountFilter] = useState(false);

  // Modal de Vinculação de Recebíveis / Contratos
  const [linkingModalTrx, setLinkingModalTrx] = useState<Transaction | null>(null);
  const [linkingSearch, setLinkingSearch] = useState("");

  // Filtro de Status de Conciliação
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "reconciled">("all");

  // Filtro por recebível específico vindo da URL (ex: rastreabilidade de Contratos)
  const [filterReceivableId, setFilterReceivableId] = useState<string | null>(() => {
    return searchParams.get("receivable_id") || null;
  });

  // Estados do Motor de Sugestões Inteligentes
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [applyingBulk, setApplyingBulk] = useState(false);

  // Filtros Rápidos em Cascata (Pills)
  const [filterLevel1, setFilterLevel1] = useState<"all" | "income" | "expense" | "transfer">(() => {
    const urlType = searchParams.get("type");
    if (urlType === "income" || urlType === "expense" || urlType === "transfer") return urlType;
    return "all";
  });

  const [filterLevel2ParentId, setFilterLevel2ParentId] = useState<string | null>(() => {
    return searchParams.get("category_id") || null;
  });

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
      setHistoricalTransactions([]);
      setReceivables([]);
      setAllReceivables([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // 1. Transações do mês atual
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("company_id", selectedCompany.id)
      .eq("month_ref", selectedMonth)
      .order("date", { ascending: false });
    setTransactions(data || []);

    // 2. Histórico de transações categorizadas da empresa para alimentar o motor de IA/sugestões
    const { data: histData } = await supabase
      .from("transactions")
      .select("id, description, amount, category_id, cost_center, is_reconciled")
      .eq("company_id", selectedCompany.id)
      .not("category_id", "is", null)
      .limit(600);
    setHistoricalTransactions(histData || []);

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

    const { data: cData } = await supabase
      .from("contracts")
      .select("id, client_name, title")
      .eq("company_id", selectedCompany.id);
    setContractsList(cData || []);
    setLoading(false);
  }, [supabase, selectedMonth, selectedCompany]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Calcula sugestões inteligentes para as transações não categorizadas
  const suggestionsMap = useMemo(() => {
    return generateBulkSuggestions(
      transactions,
      historicalTransactions,
      categories as any,
      70
    );
  }, [transactions, historicalTransactions, categories]);

  // Sincroniza os IDs selecionados quando abrir o modal de revisão
  useEffect(() => {
    if (showReviewModal) {
      setSelectedSuggestionIds(Array.from(suggestionsMap.keys()));
    }
  }, [showReviewModal, suggestionsMap]);

  // Se veio receivable_id na URL, busca a transação correspondente para garantir que o mês selecionado seja exatamente o da transação bancária
  useEffect(() => {
    const urlRecId = searchParams.get("receivable_id");
    if (!urlRecId || !selectedCompany) return;

    async function syncMonthForReceivable() {
      // 1. Procura em transactions por receivable_id
      const { data: trxData } = await supabase
        .from("transactions")
        .select("month_ref")
        .eq("company_id", selectedCompany!.id)
        .eq("receivable_id", urlRecId)
        .maybeSingle();

      if (trxData?.month_ref) {
        setSelectedMonth(trxData.month_ref);
        return;
      }

      // 2. Procura em receivables pelo linked_transaction_id ou received_at
      const { data: recData } = await supabase
        .from("receivables")
        .select("received_at, linked_transaction_id")
        .eq("id", urlRecId)
        .maybeSingle();

      if (recData?.linked_transaction_id) {
        const { data: linkedTrx } = await supabase
          .from("transactions")
          .select("month_ref")
          .eq("id", recData.linked_transaction_id)
          .maybeSingle();

        if (linkedTrx?.month_ref) {
          setSelectedMonth(linkedTrx.month_ref);
          return;
        }
      }

      if (recData?.received_at) {
        setSelectedMonth(recData.received_at.substring(0, 7));
      }
    }

    syncMonthForReceivable();
  }, [searchParams, selectedCompany, supabase]);

  // Contadores para o filtro de status
  const statusCounts = useMemo(() => {
    const total = transactions.length;
    const pending = transactions.filter((t) => !t.is_reconciled && !t.is_internal_transfer).length;
    const reconciled = transactions.filter((t) => t.is_reconciled || t.is_internal_transfer).length;
    return { total, pending, reconciled };
  }, [transactions]);

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
      // 0. Filtro por recebível específico vindo de contrato
      if (filterReceivableId && t.receivable_id !== filterReceivableId) {
        return false;
      }

      // 1. Filtro de Status de Conciliação
      if (filterStatus === "pending" && (t.is_reconciled || t.is_internal_transfer)) {
        return false;
      }
      if (filterStatus === "reconciled" && !t.is_reconciled && !t.is_internal_transfer) {
        return false;
      }

      // 2. Busca textual
      const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // 3. Filtro de Contas Bancárias
      const matchesAccount =
        selectedAccountIds.length === 0 || selectedAccountIds.includes(t.bank_account_id || "");
      if (!matchesAccount) return false;

      // 4. Nível 1: Tipo
      if (filterLevel1 === "transfer") {
        return t.is_internal_transfer;
      }
      if (t.is_internal_transfer) {
        return filterLevel1 === "all";
      }
      if (filterLevel1 === "income" && t.amount < 0) return false;
      if (filterLevel1 === "expense" && t.amount >= 0) return false;

      // 5. Nível 3: Subcategoria específica
      if (filterLevel3SubId) {
        return t.category_id === filterLevel3SubId;
      }

      // 6. Nível 2: Categoria Pai ou qualquer uma de suas subcategorias
      if (filterLevel2ParentId) {
        if (!t.category_id) return false;
        if (t.category_id === filterLevel2ParentId) return true;
        const subCatIds = categories
          .filter((c) => c.parent_id === filterLevel2ParentId)
          .map((c) => c.id);
        return subCatIds.includes(t.category_id);
      }

      return true;
    });
  }, [
    transactions,
    filterStatus,
    searchTerm,
    selectedAccountIds,
    filterLevel1,
    filterLevel2ParentId,
    filterLevel3SubId,
    categories,
  ]);

  const allReconciled =
    transactions.length > 0 && transactions.every((t) => t.is_reconciled || t.is_internal_transfer);

  function getCategoriesByType(type: "income" | "expense"): Category[] {
    return categories.filter((c) => c.type === type && c.parent_id === null);
  }
  function getSubcategories(parentId: string): Category[] {
    return categories.filter((c) => c.parent_id === parentId);
  }
  function isSubcategory(categoryId: string | null): boolean {
    if (!categoryId) return false;
    const cat = categories.find((c) => c.id === categoryId);
    return !!cat?.parent_id;
  }
  function getParentCategoryId(categoryId: string | null): string | null {
    if (!categoryId) return null;
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return null;
    return cat.parent_id ? cat.parent_id : cat.id;
  }

  // Ação: Aceitar sugestão individual
  async function handleAcceptSingleSuggestion(trxId: string) {
    const sugg = suggestionsMap.get(trxId);
    if (!sugg) return;

    // Atualização otimista
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === trxId
          ? {
              ...t,
              category_id: sugg.categoryId,
              cost_center: sugg.costCenter || t.cost_center,
              is_reconciled: true,
            }
          : t
      )
    );

    await supabase
      .from("transactions")
      .update({
        category_id: sugg.categoryId,
        cost_center: sugg.costCenter || null,
        is_reconciled: true,
      })
      .eq("id", trxId);
  }

  // Ação: Aplicar sugestões selecionadas em lote
  async function handleApplySelectedSuggestions(idsToApply: string[]) {
    if (idsToApply.length === 0) return;
    setApplyingBulk(true);

    try {
      const updates = idsToApply
        .map((id) => {
          const sugg = suggestionsMap.get(id);
          if (!sugg) return null;
          return {
            id,
            category_id: sugg.categoryId,
            cost_center: sugg.costCenter || null,
            is_reconciled: true,
          };
        })
        .filter(Boolean) as Array<{ id: string; category_id: string; cost_center: string | null; is_reconciled: boolean }>;

      // Atualização otimista
      setTransactions((prev) =>
        prev.map((t) => {
          const upd = updates.find((u) => u.id === t.id);
          return upd ? { ...t, ...upd } : t;
        })
      );

      // Persiste no Supabase
      await Promise.all(
        updates.map((u) =>
          supabase
            .from("transactions")
            .update({
              category_id: u.category_id,
              cost_center: u.cost_center,
              is_reconciled: true,
            })
            .eq("id", u.id)
        )
      );

      setShowReviewModal(false);
    } catch (err) {
      console.error("Erro ao aplicar sugestões em lote:", err);
    } finally {
      setApplyingBulk(false);
    }
  }

  async function handleCategoryChange(transactionId: string, categoryId: string | null) {
    let costCenterToSet: string | null | undefined = undefined;
    if (categoryId) {
      const selectedCat = categories.find((c) => c.id === categoryId);
      if (selectedCat?.cost_center) {
        costCenterToSet = selectedCat.cost_center;
      }
    }

    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id === transactionId) {
          return {
            ...t,
            category_id: categoryId,
            cost_center: costCenterToSet !== undefined ? costCenterToSet : t.cost_center,
            is_reconciled: categoryId !== null,
          };
        }
        return t;
      })
    );

    const updatePayload: {
      category_id: string | null;
      is_reconciled: boolean;
      cost_center?: string | null;
    } = {
      category_id: categoryId,
      is_reconciled: categoryId !== null,
    };
    if (costCenterToSet !== undefined) {
      updatePayload.cost_center = costCenterToSet;
    }

    await supabase.from("transactions").update(updatePayload).eq("id", transactionId);
  }

  async function handleCostCenterChange(transactionId: string, costCenter: string | null) {
    setTransactions((prev) =>
      prev.map((t) => (t.id === transactionId ? { ...t, cost_center: costCenter } : t))
    );
    await supabase.from("transactions").update({ cost_center: costCenter }).eq("id", transactionId);
  }

  async function handleToggleTransfer(transactionId: string, isTransfer: boolean) {
    setTransferMenuId(null);
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === transactionId
          ? {
              ...t,
              is_internal_transfer: isTransfer,
              category_id: isTransfer ? null : t.category_id,
              cost_center: isTransfer ? null : t.cost_center,
              is_reconciled: false,
            }
          : t
      )
    );

    await supabase
      .from("transactions")
      .update({
        is_internal_transfer: isTransfer,
        category_id: isTransfer ? null : undefined,
        cost_center: isTransfer ? null : undefined,
        is_reconciled: false,
      })
      .eq("id", transactionId);
  }

  async function handleLinkReceivable(transactionId: string, receivableId: string) {
    setLinkMenuId(null);
    const trx = transactions.find((t) => t.id === transactionId);
    const rec = allReceivables.find((r) => r.id === receivableId);
    if (!trx || !rec) return;

    const trxVal = Math.abs(Number(trx.amount));
    const isFullyPaid = trxVal >= Number(rec.amount);
    const newStatus: "received" | "partial" = isFullyPaid ? "received" : "partial";

    // 1. Atualiza o recebível com o valor real e exato da transação bancária
    const { error: recErr } = await supabase
      .from("receivables")
      .update({
        received_amount: trxVal,
        status: newStatus,
        received_at: trx.date,
        linked_transaction_id: transactionId,
      })
      .eq("id", receivableId);

    if (recErr) console.error("Erro ao atualizar recebível:", recErr);

    // 2. Atualiza a transação bancária
    const updateData: any = {
      receivable_id: receivableId,
      is_reconciled: true,
    };
    if (rec.category_id) {
      updateData.category_id = rec.category_id;
    }

    const { error: trxErr } = await supabase
      .from("transactions")
      .update(updateData)
      .eq("id", transactionId);

    if (trxErr) console.error("Erro ao atualizar transação:", trxErr);

    setTransactions((prev) =>
      prev.map((t) => (t.id === transactionId ? { ...t, ...updateData } : t))
    );

    setAllReceivables((prev) =>
      prev.map((r) =>
        r.id === receivableId
          ? {
              ...r,
              received_amount: trxVal,
              status: newStatus,
              received_at: trx.date,
              linked_transaction_id: transactionId,
            }
          : r
      )
    );
  }

  async function handleUnlinkReceivable(transactionId: string) {
    const trx = transactions.find((t) => t.id === transactionId);
    if (!trx || !trx.receivable_id) return;

    const rec = allReceivables.find((r) => r.id === trx.receivable_id);
    if (rec) {
      await supabase
        .from("receivables")
        .update({
          received_amount: 0,
          status: "open",
          received_at: null,
          linked_transaction_id: null,
        })
        .eq("id", rec.id);

      setAllReceivables((prev) =>
        prev.map((r) =>
          r.id === rec.id
            ? {
                ...r,
                received_amount: 0,
                status: "open",
                received_at: null,
                linked_transaction_id: null,
              }
            : r
        )
      );
    }

    await supabase
      .from("transactions")
      .update({ receivable_id: null })
      .eq("id", transactionId);

    setTransactions((prev) =>
      prev.map((t) => (t.id === transactionId ? { ...t, receivable_id: null } : t))
    );
  }

  async function handleSaveDescription(transactionId: string) {
    if (!editDescription.trim()) return;
    setTransactions((prev) =>
      prev.map((t) => (t.id === transactionId ? { ...t, description: editDescription.trim() } : t))
    );
    await supabase
      .from("transactions")
      .update({ description: editDescription.trim() })
      .eq("id", transactionId);
    setEditingId(null);
  }

  async function handleDeleteTransaction(transactionId: string) {
    setDeleteConfirmId(null);
    setTransactions((prev) => prev.filter((t) => t.id !== transactionId));
    await supabase.from("transactions").delete().eq("id", transactionId);
  }

  function handleExportReconciled() {
    const reconciled = transactions.filter((t) => t.is_reconciled);
    if (reconciled.length === 0) return;

    const headers = ["Data", "Descrição", "Valor", "Categoria", "Subcategoria", "Centro de Custo", "Conta"];
    const rows = reconciled.map((t) => {
      const parentId = getParentCategoryId(t.category_id);
      const parentCat = categories.find((c) => c.id === parentId);
      const subCat = isSubcategory(t.category_id) ? categories.find((c) => c.id === t.category_id) : null;
      const acc = bankAccounts.find((a) => a.id === t.bank_account_id);

      return [
        t.date,
        `"${t.description.replace(/"/g, '""')}"`,
        t.amount.toFixed(2).replace(".", ","),
        parentCat ? `"${parentCat.name}"` : "",
        subCat ? `"${subCat.name}"` : "",
        t.cost_center ? `"${t.cost_center}"` : "",
        acc ? `"${acc.name}"` : "",
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `transacoes_conciliadas_${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(amount);
  }

  function formatDate(dateStr: string): string {
    const [, month, day] = dateStr.split("-");
    return `${day}/${month}`;
  }

  const openReceivables = useMemo(() => {
    return allReceivables.filter((r) => r.status !== "received" && r.status !== "paid");
  }, [allReceivables]);

  const filteredOpenReceivables = useMemo(() => {
    if (!linkingSearch.trim()) return openReceivables;
    const term = linkingSearch.toLowerCase();
    return openReceivables.filter((r) => {
      const contract = contractsList.find((c) => c.id === r.contract_id);
      const title = contract ? `${contract.client_name} ${contract.title}` : `${r.client_name} ${r.description}`;
      const nf = r.nf_number || "";
      return title.toLowerCase().includes(term) || nf.toLowerCase().includes(term);
    });
  }, [openReceivables, contractsList, linkingSearch]);

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

  const totalSuggestionsAvailable = suggestionsMap.size;

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

        {/* Banner de Filtro de Recebível Vinculado (vindo de Contratos) */}
        {filterReceivableId && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between gap-3 text-xs text-indigo-900 font-semibold shadow-xs">
            <div className="flex items-center gap-2">
              <span>🔗</span>
              <span>Filtrando pela transação bancária vinculada ao recebível selecionado no contrato.</span>
            </div>
            <button
              type="button"
              onClick={() => setFilterReceivableId(null)}
              className="px-2.5 py-1 bg-white hover:bg-indigo-100 border border-indigo-300 rounded-lg text-indigo-800 text-xs font-bold transition-colors shadow-2xs"
            >
              Limpar Filtro ✕
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* BANNER INTELIGENTE DE AUTO-CATEGORIZAÇÃO                                   */}
        {/* ========================================================================= */}
        {totalSuggestionsAvailable > 0 && statusCounts.pending > 0 && (
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50/70 to-blue-50/40 border border-blue-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center text-lg shadow-sm flex-shrink-0">
                🪄
              </div>
              <div>
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                  <span>{totalSuggestionsAvailable} sugestões automáticas prontas</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                    Alta Confiança
                  </span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Categorias e centros de custo identificados automaticamente com base no histórico anterior.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
              <button
                type="button"
                onClick={() => setShowReviewModal(true)}
                className="flex-1 sm:flex-initial px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                👁️ Revisar Seleção
              </button>
              <button
                type="button"
                onClick={() => handleApplySelectedSuggestions(Array.from(suggestionsMap.keys()))}
                disabled={applyingBulk}
                className="flex-1 sm:flex-initial px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <span>⚡</span>
                <span>{applyingBulk ? "Aplicando..." : `Aplicar Todas (${totalSuggestionsAvailable})`}</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* FILTROS RÁPIDOS EM CASCATA & STATUS DE CONCILIAÇÃO                        */}
        {/* ========================================================================= */}
        <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-2.5 shadow-sm">
          {/* Linha 0: Filtro de Status de Conciliação */}
          <div className="flex items-center gap-2 flex-wrap pb-2 border-b border-gray-100">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[50px]">
              Status:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: "all", label: "Todas", count: statusCounts.total },
                { id: "pending", label: "⏳ Pendentes", count: statusCounts.pending, color: "text-amber-700" },
                { id: "reconciled", label: "✓ Conciliadas", count: statusCounts.reconciled, color: "text-emerald-700" },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setFilterStatus(st.id as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    filterStatus === st.id
                      ? "bg-primary text-white shadow-sm"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <span>{st.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      filterStatus === st.id ? "bg-white/20 text-white" : "bg-white text-gray-600"
                    }`}
                  >
                    {st.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

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

        {!loading && filteredTransactions.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 mb-2">Nenhuma transação encontrada com os filtros selecionados.</p>
            {filterStatus !== "all" && (
              <button
                type="button"
                onClick={() => setFilterStatus("all")}
                className="text-xs text-primary font-bold hover:underline"
              >
                Limpar filtro de status
              </button>
            )}
          </div>
        )}

        {!loading && filteredTransactions.length > 0 && (
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
                    const suggestion = suggestionsMap.get(trx.id);

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
                              {(() => {
                                const linkedRec = trx.receivable_id
                                  ? allReceivables.find((r) => r.id === trx.receivable_id)
                                  : null;

                                if (trx.receivable_id && linkedRec) {
                                  const contract = contractsList.find((c) => c.id === linkedRec.contract_id);
                                  const badgeLabel = contract
                                    ? `${contract.client_name} (${linkedRec.installment_number === 0 ? "Entrada" : `Parc. ${linkedRec.installment_number}`})`
                                    : linkedRec.nf_number
                                    ? `NF ${linkedRec.nf_number}`
                                    : linkedRec.client_name;

                                  return (
                                    <button
                                      onClick={() => handleUnlinkReceivable(trx.id)}
                                      className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 flex items-center gap-1 whitespace-nowrap font-bold shadow-2xs"
                                      title="Clique para desvincular deste recebível"
                                    >
                                      <span>🔗 {badgeLabel}</span>
                                      <span className="text-red-500 font-bold ml-0.5">✕</span>
                                    </button>
                                  );
                                }

                                if (trx.amount > 0 && !trx.is_internal_transfer) {
                                  return (
                                    <div className="flex items-center gap-1">
                                      {trx.receivable_id && !linkedRec && (
                                        <button
                                          onClick={() => handleUnlinkReceivable(trx.id)}
                                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200 flex items-center gap-1 font-semibold"
                                          title="Limpar vínculo antigo inexistente"
                                        >
                                          ⚠️ Limpar Vínculo ✕
                                        </button>
                                      )}
                                      <button
                                        onClick={() => {
                                          setLinkingModalTrx(trx);
                                          setLinkingSearch("");
                                        }}
                                        className="text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors border border-indigo-200 shadow-2xs"
                                        title="Vincular a um contrato ou recebível"
                                      >
                                        <span>🔗</span>
                                        <span className="text-[11px]">Vincular</span>
                                      </button>
                                    </div>
                                  );
                                }

                                return null;
                              })()}
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
                            className={`text-xs px-2 py-1 border rounded focus:outline-none focus:ring-1 focus:ring-primary bg-white max-w-[140px] ${
                              suggestion && !trx.category_id && !trx.is_internal_transfer
                                ? "border-blue-300 bg-blue-50/30"
                                : "border-gray-300"
                            } ${trx.is_internal_transfer ? "opacity-30 cursor-not-allowed" : ""}`}
                          >
                            <option value="">—</option>
                            {cats.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>

                          {/* Sugestão de Categoria */}
                          {suggestion && !trx.category_id && !trx.is_internal_transfer && (
                            <span
                              className="text-[10px] text-blue-700 font-semibold block truncate mt-0.5 cursor-pointer hover:underline"
                              title={`Sugerido: ${suggestion.categoryName} (${suggestion.reason})`}
                              onClick={() => handleCategoryChange(trx.id, suggestion.categoryId)}
                            >
                              💡 {suggestion.categoryName}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 md:px-3">
                          {subs.length > 0 ? (
                            <select
                              value={subIsSelected ? trx.category_id ?? "" : ""}
                              onChange={(e) => handleCategoryChange(trx.id, e.target.value || null)}
                              disabled={trx.is_internal_transfer}
                              className={`text-xs px-2 py-1 border rounded focus:outline-none focus:ring-1 focus:ring-primary bg-white max-w-[120px] ${
                                suggestion && !trx.category_id && !trx.is_internal_transfer && suggestion.subcategoryName
                                  ? "border-blue-300 bg-blue-50/30"
                                  : "border-gray-300"
                              } ${trx.is_internal_transfer ? "opacity-30 cursor-not-allowed" : ""}`}
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

                          {/* Sugestão de Subcategoria */}
                          {suggestion && !trx.category_id && !trx.is_internal_transfer && suggestion.subcategoryName && (
                            <span
                              className="text-[10px] text-blue-700 font-semibold block truncate mt-0.5"
                              title={`Subcategoria sugerida: ${suggestion.subcategoryName}`}
                            >
                              💡 {suggestion.subcategoryName}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 md:px-3">
                          <select
                            value={trx.cost_center || ""}
                            onChange={(e) => handleCostCenterChange(trx.id, e.target.value || null)}
                            disabled={trx.is_internal_transfer}
                            className={`text-xs px-2 py-1 border rounded focus:outline-none focus:ring-1 focus:ring-primary bg-white max-w-[110px] ${
                              suggestion && !trx.cost_center && suggestion.costCenter && !trx.is_internal_transfer
                                ? "border-blue-300 bg-blue-50/30"
                                : "border-gray-300"
                            } ${trx.is_internal_transfer ? "opacity-30 cursor-not-allowed" : ""}`}
                          >
                            <option value="">—</option>
                            {costCenters.map((cc) => (
                              <option key={cc.id} value={cc.name}>
                                {cc.name}
                              </option>
                            ))}
                          </select>

                          {/* Sugestão de Centro de Custo */}
                          {suggestion && !trx.cost_center && suggestion.costCenter && !trx.is_internal_transfer && (
                            <span
                              className="text-[10px] text-blue-700 font-semibold block truncate mt-0.5"
                              title={`Centro de custo sugerido: ${suggestion.costCenter}`}
                            >
                              💡 {suggestion.costCenter}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 md:px-3">
                          <div>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap inline-block ${
                                trx.is_reconciled ? "bg-green-100 text-green-700 font-semibold" : "bg-yellow-100 text-yellow-700"
                              }`}
                            >
                              {trx.is_reconciled ? "Conciliada" : "Pendente"}
                            </span>

                            {/* Botão para Aprovar Tudo de uma vez nesta linha */}
                            {suggestion && !trx.is_reconciled && !trx.is_internal_transfer && (
                              <button
                                type="button"
                                onClick={() => handleAcceptSingleSuggestion(trx.id)}
                                className="mt-1 w-full bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold py-1 px-2 rounded-lg flex items-center justify-center gap-1 shadow-xs transition-all whitespace-nowrap"
                                title={`Aprovar: ${suggestion.categoryName} › ${suggestion.subcategoryName || ""} (${suggestion.costCenter || ""})`}
                              >
                                <span>✓ Aprovar Tudo</span>
                                <span className="text-[9px] opacity-85">({suggestion.confidence}%)</span>
                              </button>
                            )}
                          </div>
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
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL DE REVISÃO E SELEÇÃO EM LOTE DAS SUGESTÕES                          */}
        {/* ========================================================================= */}
        {showReviewModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
              {/* Topo do Modal */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <span>🪄 Revisar Sugestões Inteligentes</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                      {suggestionsMap.size} identificadas
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Selecione quais sugestões deseja aprovar para aplicar em lote instantaneamente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1"
                >
                  ✕
                </button>
              </div>

              {/* Ações Rápidas de Seleção */}
              <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedSuggestionIds.length === suggestionsMap.size && suggestionsMap.size > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSuggestionIds(Array.from(suggestionsMap.keys()));
                      } else {
                        setSelectedSuggestionIds([]);
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span>Selecionar Todas ({suggestionsMap.size})</span>
                </label>

                <span className="text-slate-500 font-medium">
                  {selectedSuggestionIds.length} selecionada(s)
                </span>
              </div>

              {/* Lista de Transações com Sugestão */}
              <div className="p-4 overflow-y-auto flex-1 space-y-2">
                {Array.from(suggestionsMap.entries()).map(([trxId, sugg]) => {
                  const trx = transactions.find((t) => t.id === trxId);
                  if (!trx) return null;
                  const isChecked = selectedSuggestionIds.includes(trxId);

                  return (
                    <div
                      key={trxId}
                      onClick={() => {
                        setSelectedSuggestionIds((prev) =>
                          prev.includes(trxId) ? prev.filter((id) => id !== trxId) : [...prev, trxId]
                        );
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isChecked
                          ? "bg-blue-50/60 border-blue-300 shadow-xs"
                          : "bg-white border-gray-200 hover:border-gray-300 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // tratado no onClick do container
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900 truncate">
                              {trx.description}
                            </span>
                            <span
                              className={`text-xs font-bold whitespace-nowrap ${
                                trx.amount >= 0 ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {formatCurrency(trx.amount)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs">
                            <span className="font-semibold text-blue-900">
                              💡 {sugg.categoryName}
                              {sugg.subcategoryName ? ` › ${sugg.subcategoryName}` : ""}
                            </span>
                            {sugg.costCenter && (
                              <span className="text-[10px] bg-white px-1.5 py-0.2 rounded border border-blue-200 text-blue-700">
                                🏷️ {sugg.costCenter}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400">{sugg.reason}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                          {sugg.confidence}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rodapé do Modal */}
              <div className="p-4 border-t border-gray-100 bg-slate-50 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={() => handleApplySelectedSuggestions(selectedSuggestionIds)}
                  disabled={selectedSuggestionIds.length === 0 || applyingBulk}
                  className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span>⚡</span>
                  <span>
                    {applyingBulk
                      ? "Aplicando..."
                      : `Aplicar ${selectedSuggestionIds.length} Sugestão(ões)`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de confirmação de exclusão */}
        {deleteConfirmId && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
              <h3 className="text-lg font-bold text-gray-900">Deletar Transação</h3>
              <p className="text-sm text-gray-600">
                Tem certeza que deseja deletar esta transação? Esta ação não pode ser desfeita.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDeleteTransaction(deleteConfirmId)}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  Deletar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de finalização */}
        {showFinalizeModal && (
          <FinalizeReconciliationModal
            open={showFinalizeModal}
            onClose={() => {
              setShowFinalizeModal(false);
              fetchTransactions();
            }}
            monthRef={selectedMonth}
            transactions={transactions}
            categories={categories}
            receivables={receivables}
            bankAccounts={bankAccounts}
          />
        )}

        {/* ========================================================================= */}
        {/* MODAL DE VINCULAÇÃO DE RECEBIMENTO AO CONTRATO OU TÍTULO                  */}
        {/* ========================================================================= */}
        {linkingModalTrx && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
              {/* Header do Modal */}
              <div className="p-5 border-b border-gray-100 bg-slate-50 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                    <span>🔗 Vincular Recebimento</span>
                  </h3>
                  <div className="mt-2 bg-white border border-gray-200 rounded-xl p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 font-medium">Transação Bancária:</span>
                      <span className="font-extrabold text-emerald-700 text-sm">
                        {formatCurrency(Math.abs(linkingModalTrx.amount))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-600">
                      <span className="truncate max-w-[280px] font-semibold">{linkingModalTrx.description}</span>
                      <span>{formatDate(linkingModalTrx.date)}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setLinkingModalTrx(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1"
                >
                  ✕
                </button>
              </div>

              {/* Busca e Lista */}
              <div className="p-4 space-y-3 flex-1 overflow-hidden flex flex-col">
                <input
                  type="text"
                  value={linkingSearch}
                  onChange={(e) => setLinkingSearch(e.target.value)}
                  placeholder="🔍 Buscar por cliente, contrato ou NF..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                  autoFocus
                />

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {filteredOpenReceivables.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-xs">
                      {openReceivables.length === 0
                        ? "Nenhum recebível em aberto disponível no momento."
                        : "Nenhum resultado encontrado para a busca."}
                    </div>
                  ) : (
                    filteredOpenReceivables.map((r) => {
                      const contract = contractsList.find((c) => c.id === r.contract_id);
                      const titleHeader = contract
                        ? `${contract.client_name} — ${contract.title}`
                        : `${r.client_name} — ${r.description}`;

                      const installmentBadge =
                        r.installment_number !== null && r.total_installments
                          ? r.installment_number === 0
                            ? "Entrada"
                            : `Parcela ${r.installment_number}/${r.total_installments}`
                          : null;

                      const remaining = Math.max(0, Number(r.amount) - Number(r.received_amount || 0));

                      return (
                        <div
                          key={r.id}
                          onClick={() => {
                            handleLinkReceivable(linkingModalTrx.id, r.id);
                            setLinkingModalTrx(null);
                          }}
                          className="p-3 rounded-xl border border-gray-200 hover:border-primary/60 hover:bg-indigo-50/40 cursor-pointer transition-all flex items-center justify-between gap-3 group"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-gray-900 group-hover:text-primary transition-colors truncate">
                                {titleHeader}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 flex-wrap">
                              {installmentBadge ? (
                                <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded font-bold text-[10px]">
                                  📁 {installmentBadge}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-bold text-[10px]">
                                  📋 Título Avulso
                                </span>
                              )}
                              {r.nf_number && (
                                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded font-semibold text-[10px]">
                                  NF {r.nf_number}
                                </span>
                              )}
                              <span>• Vencimento: {formatDate(r.due_date)}</span>
                            </div>
                          </div>

                          <div className="text-right flex-shrink-0">
                            <span className="text-xs font-extrabold text-gray-900 block">
                              {formatCurrency(Number(r.amount))}
                            </span>
                            {r.status === "partial" && (
                              <span className="text-[10px] text-amber-600 font-bold block">
                                Restam: {formatCurrency(remaining)}
                              </span>
                            )}
                            <span className="text-[10px] text-primary font-bold group-hover:underline block mt-0.5">
                              Vincular →
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Rodapé */}
              <div className="p-3.5 bg-slate-50 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setLinkingModalTrx(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                >
                  Fechar
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
    <Suspense
      fallback={
        <Navigation>
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        </Navigation>
      }
    >
      <TransactionsContent />
    </Suspense>
  );
}
