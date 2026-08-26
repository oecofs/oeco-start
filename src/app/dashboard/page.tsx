"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import Navigation from "@/components/Navigation";
import MonthSelector from "@/components/MonthSelector";
import { getCompanyAccountLedgerState } from "@/lib/ledger/closures";

export default function DashboardPage() {
  const supabase = createClient();
  const { selectedCompany } = useCompany();

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

  // Saldos por conta (Ledger Pattern)
  const [accountBalances, setAccountBalances] = useState<{
    id: string;
    name: string;
    initialBalance: number;
    openingBalance: number;
    monthMovement: number;
    currentBalance: number;
    isMonthReconciled: boolean;
    hasPending: boolean;
    pendingCount: number;
    pendingMonths: string[];
  }[]>([]);
    
  // Buscar dados do mês
  const fetchDashboardData = useCallback(async () => {
    if (!selectedCompany) {
      setTotalIncome(0);
      setTotalExpense(0);
      setTransactionsCount(0);
      setReconciledCount(0);
      setPendingReceivables(0);
      setPendingReceivablesCount(0);
      setOverdueReceivables(0);
      setAccountBalances([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const step = 1000;

    // 1. Transações do mês (busca com paginação para garantir que meses grandes não sejam truncados)
    let monthTrxs: Array<{
      amount: number;
      is_reconciled: boolean;
      is_internal_transfer: boolean;
    }> = [];
    let fromMonth = 0;
    let hasMoreMonth = true;

    while (hasMoreMonth) {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, is_reconciled, is_internal_transfer")
        .eq("company_id", selectedCompany.id)
        .eq("month_ref", selectedMonth)
        .range(fromMonth, fromMonth + step - 1);

      if (error || !data || data.length === 0) {
        hasMoreMonth = false;
        break;
      }

      monthTrxs = monthTrxs.concat(data as any);
      if (data.length < step) {
        hasMoreMonth = false;
      } else {
        fromMonth += step;
      }
    }

    const income = monthTrxs
      .filter((t) => t.amount > 0 && !t.is_internal_transfer)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const expense = monthTrxs
      .filter((t) => t.amount < 0 && !t.is_internal_transfer)
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

    setTotalIncome(income);
    setTotalExpense(expense);
    setTransactionsCount(monthTrxs.length);
    // Transações conciliadas ou transferências internas contam como tratadas/resolvidas
    setReconciledCount(monthTrxs.filter((t) => t.is_reconciled || t.is_internal_transfer).length);

    // 2. Recebíveis pendentes e vencidos
    const today = new Date().toISOString().split("T")[0];

    const { data: receivables } = await supabase
      .from("receivables")
      .select("amount, status, due_date")
      .eq("company_id", selectedCompany.id)
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

    // 3. Buscar contas bancárias e calcular saldos via Ledger Pattern
    try {
      const ledgerItems = await getCompanyAccountLedgerState(
        supabase,
        selectedCompany.id,
        selectedMonth
      );

      setAccountBalances(
        ledgerItems.map((item) => ({
          id: item.id,
          name: item.name,
          initialBalance: item.initialBalance,
          openingBalance: item.openingBalance,
          monthMovement: item.monthMovement,
          currentBalance: item.currentBalance,
          isMonthReconciled: item.isMonthReconciled,
          hasPending: item.hasHistoricalPendency,
          pendingCount: item.pendingCount,
          pendingMonths: item.pendingMonths,
        }))
      );
    } catch (ledgerErr) {
      console.error("Erro ao calcular ledger de saldos:", ledgerErr);
    }

    setLoading(false);
  }, [supabase, selectedMonth, selectedCompany]);

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
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
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
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
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
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
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
                <p className="text-xs text-gray-400 mt-1 text-right font-medium">
                  {reconcileProgress}%
                </p>
              </div>
            </div>

            {/* Caixa de saldo das contas */}
            {accountBalances.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 mb-6 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-gray-700">
                    Saldo das contas
                  </h2>
                  <Link
                    href="/bank-accounts"
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Gerenciar contas →
                  </Link>
                </div>
                <div className="space-y-3">
                  {accountBalances.map((acc) => (
                    <div key={acc.id} className="flex items-center justify-between pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-800">{acc.name}</p>
                          {acc.hasPending && (
                            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">
                              {acc.pendingCount} pendência(s)
                            </span>
                          )}
                        </div>
                        {acc.hasPending ? (
                          <p className="text-xs text-amber-600 mt-0.5">
                            ⚠ Transação(ões) não conciliada(s) em: {acc.pendingMonths.join(", ")}
                          </p>
                        ) : (
                          <p className="text-xs text-emerald-600 mt-0.5">
                            ✓ Todas as transações até este mês estão conciliadas
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`text-lg font-bold ${acc.currentBalance >= 0 ? "text-gray-800" : "text-red-600"}`}>
                          {formatCurrency(acc.currentBalance)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {accountBalances.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-gray-800">Saldo total consolidado</span>
                      {accountBalances.some((a) => a.hasPending) && (
                        <span className="block text-[11px] text-amber-600">
                          (Calculado com base no Ledger e movimentações até o mês)
                        </span>
                      )}
                    </div>
                    <span className="text-lg font-extrabold text-gray-900">
                      {formatCurrency(accountBalances.reduce((sum, a) => sum + a.currentBalance, 0))}
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {/* Card de Destaque — Relatórios Financeiros (BI) */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6 mb-6 shadow-sm hover:border-primary/40 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-base md:text-lg font-bold text-gray-800">
                    Relatórios Financeiros
                  </h2>
                  <p className="text-xs md:text-sm text-gray-500 leading-relaxed max-w-xl">
                    Explore análises verticais e horizontais (AV/AH), gráficos temporais, composição de receitas/despesas, etc.
                  </p>
                </div>
                <Link
                  href="/reports"
                  className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-medium text-xs md:text-sm px-4 py-2.5 rounded-lg shadow-sm transition-colors whitespace-nowrap flex-shrink-0"
                >
                  <span>Acessar Relatórios</span>
                  <span className="text-base">→</span>
                </Link>
              </div>
            </div>

            {/* Link para transações */}
            {transactionsCount > 0 && (
              <Link
                href="/transactions"
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-primary hover:bg-primary/5 transition-colors mb-6 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Ver transações de {selectedMonth}
                    </p>
                    <p className="text-xs text-gray-400">
                      {transactionsCount - reconciledCount} pendentes de conciliação
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
                <p className="text-gray-500 mt-3 mb-1 font-bold">
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
