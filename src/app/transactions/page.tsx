"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
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
  month_ref: string;
};

export default function TransactionsPage() {
  const supabase = createClient();

  const [selectedMonth, setSelectedMonth] = useState(() => {
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

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .order("name");

    setCategories(data || []);

    // Busca centros de custo da tabela dedicada
    const { data: ccData } = await supabase
      .from("cost_centers")
      .select("id, name")
      .order("name");

    setCostCenters(ccData || []);
  }, [supabase]);

  // Fetch transactions for selected month
  const fetchTransactions = useCallback(async () => {
    setLoading(true);

    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("month_ref", selectedMonth)
      .order("date", { ascending: false });

    setTransactions(data || []);
      // Buscar recebíveis do mês para o modal
      const { data: recData } = await supabase
        .from("receivables")
        .select("*")
        .eq("month_ref", selectedMonth)
        .eq("is_active", true);
      setReceivables(recData || []);
    setLoading(false);
  }, [supabase, selectedMonth]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Filter transactions by search
  const filteredTransactions = transactions.filter((t) =>
    t.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Check if all transactions are reconciled
  const allReconciled =
    transactions.length > 0 && transactions.every((t) => t.is_reconciled);

  // Get categories by type
  function getCategoriesByType(type: "income" | "expense"): Category[] {
    return categories.filter((c) => c.type === type && c.parent_id === null);
  }

  // Get subcategories for a parent
  function getSubcategories(parentId: string): Category[] {
    return categories.filter((c) => c.parent_id === parentId);
  }

   // Update category on a transaction
  async function handleCategoryChange(
    transactionId: string,
    categoryId: string | null
  ) {
    // Verifica se a categoria selecionada tem subcategorias
    let isReconciled = false;

    if (categoryId) {
      const selectedCategory = categories.find((c) => c.id === categoryId);
      const isSub = selectedCategory?.parent_id !== null && selectedCategory?.parent_id !== undefined;

      if (isSub) {
        // Selecionou uma subcategoria → conciliada
        isReconciled = true;
      } else {
        // Selecionou uma categoria pai → verifica se tem filhas
        const hasSubs = categories.some((c) => c.parent_id === categoryId);
        if (!hasSubs) {
          // Não tem subcategorias → só a categoria basta
          isReconciled = true;
        } else {
          // Tem subcategorias → precisa selecionar uma
          isReconciled = false;
        }
      }
    }

    // Otimistic update
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === transactionId
          ? {
              ...t,
              category_id: categoryId,
              is_reconciled: isReconciled,
            }
          : t
      )
    );

    const updates = {
      category_id: categoryId,
      is_reconciled: isReconciled,
    };

    await supabase.from("transactions").update(updates).eq("id", transactionId);
  }
  
  // Update cost center on a transaction
  async function handleCostCenterChange(
    transactionId: string,
    costCenter: string | null
  ) {
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === transactionId ? { ...t, cost_center: costCenter } : t
      )
    );

    await supabase
      .from("transactions")
      .update({ cost_center: costCenter })
      .eq("id", transactionId);
  }

  // Update description
  async function handleSaveDescription(transactionId: string) {
    if (!editDescription.trim()) return;

    setTransactions((prev) =>
      prev.map((t) =>
        t.id === transactionId ? { ...t, description: editDescription.trim() } : t
      )
    );

    await supabase
      .from("transactions")
      .update({ description: editDescription.trim() })
      .eq("id", transactionId);

    setEditingId(null);
  }

  // Format helpers
  function formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  }

  function getCategoryName(id: string | null): string {
    if (!id) return "";
    const cat = categories.find((c) => c.id === id);
    return cat?.name || "";
  }

  return (
    <Navigation>
      <div className="p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Transações</h1>
          <div className="flex flex-col sm:flex-row gap-2">
            <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        {/* Finalizar conciliação button */}
        {allReconciled && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-sm text-green-700 font-medium">
              ✅ Todas as transações foram conciliadas!
            </p>
            <button
              className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors text-sm whitespace-nowrap"
              onClick={() => setShowFinalizeModal(true)}
            >
              Finalizar conciliação
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400">Carregando transações...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && transactions.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 mb-2">Nenhuma transação encontrada neste mês.</p>
            <p className="text-sm text-gray-400">
              Clique em "Subir extrato" para importar.
            </p>
          </div>
        )}

        {/* Transactions table */}
        {!loading && transactions.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
                    <th className="py-3 px-2 md:px-3 font-medium whitespace-nowrap">Data</th>
                    <th className="py-3 px-2 md:px-3 font-medium">Descrição</th>
                    <th className="py-3 px-2 md:px-3 font-medium text-right whitespace-nowrap">Valor</th>
                    <th className="py-3 px-2 md:px-3 font-medium whitespace-nowrap">Categoria</th>
                    <th className="py-3 px-2 md:px-3 font-medium whitespace-nowrap">Subcategoria</th>
                    <th className="py-3 px-2 md:px-3 font-medium whitespace-nowrap">C. Custo</th>
                    <th className="py-3 px-2 md:px-3 font-medium whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((trx) => {
                    const type = trx.amount >= 0 ? "income" : "expense";
                    const cats = getCategoriesByType(type);
                    const subs = trx.category_id ? getSubcategories(trx.category_id) : [];

                    return (
                      <tr key={trx.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        {/* Data — não editável */}
                        <td className="py-2 px-2 md:px-3 text-gray-600 whitespace-nowrap">
                          {formatDate(trx.date)}
                        </td>

                        {/* Descrição — editável */}
                        <td className="py-2 px-2 md:px-3 text-gray-700">
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
                              <button
                                onClick={() => handleSaveDescription(trx.id)}
                                className="text-xs text-primary hover:bg-primary/10 px-1.5 py-0.5 rounded"
                              >
                                ✓
                              </button>
                            </div>
                          ) : (
                            <span
                              className="cursor-text hover:bg-gray-100 px-1 py-0.5 rounded"
                              onClick={() => {
                                setEditingId(trx.id);
                                setEditDescription(trx.description);
                              }}
                            >
                              {trx.description}
                            </span>
                          )}
                        </td>

                        {/* Valor — não editável */}
                        <td
                          className={`py-2 px-2 md:px-3 text-right font-medium whitespace-nowrap ${
                            trx.amount >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatCurrency(trx.amount)}
                        </td>

                        {/* Categoria — dropdown */}
                        <td className="py-2 px-2 md:px-3">
                          <select
                            value={trx.category_id || ""}
                            onChange={(e) =>
                              handleCategoryChange(
                                trx.id,
                                e.target.value || null
                              )
                            }
                            className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary bg-white max-w-[140px]"
                          >
                            <option value="">—</option>
                            {cats.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Subcategoria — dropdown dinâmico */}
                        <td className="py-2 px-2 md:px-3">
                          {subs.length > 0 ? (
                            <select
                              value={trx.category_id || ""}
                              onChange={(e) =>
                                handleCategoryChange(
                                  trx.id,
                                  e.target.value || null
                                )
                              }
                              className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary bg-white max-w-[120px]"
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

                        {/* Centro de Custo — dropdown opcional */}
                        <td className="py-2 px-2 md:px-3">
                          <select
                            value={trx.cost_center || ""}
                            onChange={(e) =>
                              handleCostCenterChange(
                                trx.id,
                                e.target.value || null
                              )
                            }
                            className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary bg-white max-w-[110px]"
                          >
                            <option value="">—</option>
                            {costCenters.map((cc) => (
                              <option key={cc.id} value={cc.name}>
                                {cc.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Status — automático */}
                        <td className="py-2 px-2 md:px-3">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                              trx.is_reconciled
                                ? "bg-green-100 text-green-700"
                                : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {trx.is_reconciled ? "Conciliada" : "Pendente"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary footer */}
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
              <span>
                {filteredTransactions.length} de {transactions.length} transações
              </span>
              <span>
                {transactions.filter((t) => t.is_reconciled).length} conciliadas •{" "}
                {transactions.filter((t) => !t.is_reconciled).length} pendentes
              </span>
            </div>
          </div>
        )}
        {/* Modal de finalização */}
        <FinalizeReconciliationModal
          open={showFinalizeModal}
          onClose={() => setShowFinalizeModal(false)}
          monthRef={selectedMonth}
          transactions={transactions}
          categories={categories}
          receivables={receivables}
        />
      </div>
    </Navigation>
  );
}
