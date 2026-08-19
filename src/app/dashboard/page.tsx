"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navigation from "@/components/Navigation";
import MonthSelector from "@/components/MonthSelector";

export default function DashboardPage() {
  const supabase = createClient();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [loading, setLoading] = useState(true);

  // Dados do mês
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [transactionsCount, setTransactionsCount] = useState(0);
  const [reconciledCount, setReconciledCount] = useState(0);

  // Recebíveis
  const [pendingReceivables, setPendingReceivables] = useState(0);
  const [pendingReceivablesCount, setPendingReceivablesCount] = useState(0);
  const [overdueReceivables, setOverdueReceivables] = useState(0);

  // Saldos por conta
  const [accountBalances, setAccountBalances] = useState<{
    id: string;
    name: string;
    initialBalance: number;
    currentBalance: number;
    hasPending: boolean;
    pendingCount: number;
    pendingMonths: string[];
  }[]>([]);
    
  // Buscar dados do mês
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);

    // 1. Transações do mês
    const { data: transactions } = await supabase
      .from("transactions")
      .select("amount, is_reconciled")
      .eq("month_ref", selectedMonth);

    const trxs = transactions || [];

    const income = trxs
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const expense = trxs
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

    setTotalIncome(income);
    setTotalExpense(expense);
    setTransactionsCount(trxs.length);
    setReconciledCount(trxs.filter((t) => t.is_reconciled).length);

    // 2. Recebíveis pendentes e vencidos
    const today = new Date().toISOString().split("T")[0];

    const { data: receivables } = await supabase
      .from("receivables")
      .select("amount, status, due_date")
      .eq("month_ref", selectedMonth)
      .eq("is_active", true);

    const recs = receivables || [];

    const pending = recs.filter((r) => r.status === "pending");
    const overdue = recs.filter(
      (r) => r.status === "pending" && r.due_date < today
    );

    setPendingReceivables(
      pending.reduce((sum, r) => sum + Number(r.amount), 0)
    );
    setPendingReceivablesCount(pending.length);
    setOverdueReceivables(
      overdue.reduce((sum, r) => sum + Number(r.amount), 0)
    );

    // 3. Buscar contas bancárias e calcular saldos conciliados
    const { data: accounts } = await supabase
      .from("bank_accounts")
      .select("id, name, initial_balance, initial_balance_date, is_active")
      .eq("is_active", true)
      .order("name");

    if (accounts && accounts.length > 0) {
      // Buscar TODAS as transações até o mês selecionado
      const { data: allTrxs } = await supabase
        .from("transactions")
        .select("amount, is_reconciled, bank_account_id, month_ref")
        .lte("month_ref", selectedMonth);

      const allTransactions = allTrxs || [];

      const balances = accounts.map((acc) => {
        const accTrxs = allTransactions.filter(
          (t) => t.bank_account_id === acc.id
        );
        const pending = accTrxs.filter((t) => !t.is_reconciled);
        const pendingMonths = [...new Set(pending.map((t) => t.month_ref))].sort();
        const reconciledSum = accTrxs
          .filter((t) => t.is_reconciled)
          .reduce((sum, t) => sum + Number(t.amount), 0);

        return {
          id: acc.id,
          name: acc.name,
          initialBalance: Number(acc.initial_balance || 0),
          currentBalance: Number(acc.initial_balance || 0) + reconciledSum,
          hasPending: pending.length > 0,
          pendingCount: pending.length,
          pendingMonths,
        };
      });
      setAccountBalances(balances);
    } else {
      setAccountBalances([]);
    }

    setLoading(false);
  }, [supabase, selectedMonth]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Format helpers
  function formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  // Calcular progresso da conciliação
  const reconcileProgress =
    transactionsCount > 0
      ? Math.round((reconciledCount / transactionsCount) * 100)
      : 0;

  const balance = totalIncome - totalExpense;

  return (
    <Navigation>
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        {/* Header com seletor de mês */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Carregando dados...</p>
          </div>
        ) : (
          <>
            {/* Cards principais — grid responsivo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Card 1: Saldo do mês */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-500">
                    Saldo do mês
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      balance >= 0
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {balance >= 0 ? "Positivo" : "Negativo"}
                  </span>
                </div>
                <p
                  className={`text-2xl font-bold ${
                    balance >= 0 ? "text-gray-800" : "text-red-600"
                  }`}
                >
                  {formatCurrency(balance)}
                </p>
                <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                  <span>
                    <span className="text-green-600 font-medium">↑</span>{" "}
                    {formatCurrency(totalIncome)}
                  </span>
                  <span>
                    <span className="text-red-600 font-medium">↓</span>{" "}
                    {formatCurrency(totalExpense)}
                  </span>
                </div>
              </div>

              {/* Card 2: A receber */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-500">
                    A receber
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    {pendingReceivablesCount}{" "}
                    {pendingReceivablesCount === 1 ? "item" : "itens"}
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-800">
                  {formatCurrency(pendingReceivables)}
                </p>
                {overdueReceivables > 0 && (
                  <p className="mt-3 text-xs text-red-500">
                    <span className="font-medium">⚠ Vencido:</span>{" "}
                    {formatCurrency(overdueReceivables)}
                  </p>
                )}
                {overdueReceivables === 0 && pendingReceivables > 0 && (
                  <p className="mt-3 text-xs text-green-500">
                    Nenhum recebível vencido
                  </p>
                )}
                {pendingReceivables === 0 && (
                  <p className="mt-3 text-xs text-gray-400">
                    Nenhum recebível pendente
                  </p>
                )}
              </div>

              {/* Card 3: Status da conciliação */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-500">
                    Conciliação
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      reconcileProgress === 100
                        ? "bg-green-100 text-green-700"
                        : reconcileProgress > 0
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {reconcileProgress === 100
                      ? "Completa"
                      : reconcileProgress > 0
                      ? "Em andamento"
                      : "Pendente"}
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-800">
                  {reconciledCount}
                  <span className="text-gray-400 text-lg font-normal">
                    {" "}
                    / {transactionsCount}
                  </span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  transações conciliadas
                </p>

                {/* Barra de progresso */}
                <div className="mt-3 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      reconcileProgress === 100
                        ? "bg-green-500"
                        : "bg-primary"
                    }`}
                    style={{ width: `${reconcileProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {reconcileProgress}%
                </p>
              </div>
            </div>

            {/* Caixa de saldo das contas */}
            {accountBalances.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 mb-6">
                <h2 className="text-sm font-medium text-gray-500 mb-3">
                  Saldo das contas
                </h2>
                <div className="space-y-3">
                  {accountBalances.map((acc) => (
                    <div key={acc.id} className="flex items-center justify-between pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-gray-700">{acc.name}</p>
                        {acc.hasPending ? (
                          <p className="text-xs text-red-500 mt-0.5">
                            ⚠ {acc.pendingCount} transação(ões) não conciliada(s) — {acc.pendingMonths.join(", ")}
                          </p>
                        ) : (
                          <p className="text-xs text-green-500 mt-0.5">
                            ✓ Todas as transações até este mês estão conciliadas
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        {acc.hasPending ? (
                          <span className="text-sm text-gray-400 italic">
                            Saldo indisponível
                          </span>
                        ) : (
                          <span className={`text-lg font-bold ${acc.currentBalance >= 0 ? "text-gray-800" : "text-red-600"}`}>
                            {formatCurrency(acc.currentBalance)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {!accountBalances.some((a) => a.hasPending) && accountBalances.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">Saldo total</span>
                    <span className="text-lg font-bold text-gray-800">
                      {formatCurrency(accountBalances.reduce((sum, a) => sum + a.currentBalance, 0))}
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {/* Link para transações */}
            {transactionsCount > 0 && (
              <Link
                href="/transactions"
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Ver transações
                    </p>
                    <p className="text-xs text-gray-400">
                      {transactionsCount - reconciledCount} pendentes de
                      conciliação
                    </p>
                  </div>
                  <span className="text-gray-400">→</span>
                </div>
              </Link>
            )}

            {/* Empty state — sem transações */}
            {transactionsCount === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <span className="text-4xl">📊</span>
                <p className="text-gray-500 mt-3 mb-1">
                  Nenhuma transação neste mês
                </p>
                <p className="text-sm text-gray-400 mb-4">
                  Suba o extrato bancário para começar a conciliação
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating button — Subir extrato (mobile) */}
      <Link
        href="/upload"
        className="md:hidden fixed bottom-20 right-4 bg-primary text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:bg-primary-dark transition-colors z-40"
      >
        <span className="text-2xl">+</span>
      </Link>

      {/* Floating button — Subir extrato (desktop) */}
      <Link
        href="/upload"
        className="hidden md:flex fixed bottom-6 right-6 bg-primary text-white px-4 py-2.5 rounded-lg shadow-lg hover:bg-primary-dark transition-colors items-center gap-2 z-40"
      >
        <span className="text-lg">📁</span>
        <span className="font-medium">Subir extrato</span>
      </Link>
    </Navigation>
  );
}
