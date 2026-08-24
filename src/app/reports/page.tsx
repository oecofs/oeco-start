"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import MonthSelector from "@/components/MonthSelector";
import {
  Granularity,
  Dimension,
  VisualMode,
  ReportTransaction,
  ReportCategory,
  ReportBankAccount,
  ReportCostCenter,
  ColumnDef,
  TableRowData,
  isVisualCompatible,
  generateMonthRange,
  getColumnsForGranularity,
  validateReconciliation,
  formatBRL,
  formatPercent,
  calculateAV,
  calculateAH,
  getAHColorClass,
  formatMonthToBR,
} from "@/lib/reports/calculations";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const CHART_COLORS = [
  "#1e3a5f", // Primary Navy
  "#0ea5e9", // Sky Blue
  "#10b981", // Emerald Green
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#14b8a6", // Teal
  "#f97316", // Orange
  "#64748b", // Slate
];

type DrillStep = {
  id: string;
  name: string;
  level: "root" | "category" | "subcategory";
  type?: "income" | "expense";
  categoryId?: string | null;
  subcategoryId?: string | null;
  bankAccountId?: string | null;
  costCenterName?: string | null;
};

export default function ReportsPage() {
  const supabase = createClient();
  const router = useRouter();
  const { selectedCompany } = useCompany();

  // Estados dos 4 Eixos de Filtragem
  const [granularity, setGranularity] = useState<Granularity>("month_by_month");

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [startMonth, setStartMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-01`;
  });

  const [endMonth, setEndMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [dimension, setDimension] = useState<Dimension>("category");
  const [visualMode, setVisualMode] = useState<VisualMode>("table");

  // Toggles da Tabela (AV / AH)
  const [showAV, setShowAV] = useState(true);
  const [showAH, setShowAH] = useState(true);

  // Linhas expandidas no Accordion da Tabela
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Séries selecionadas para gráficos temporais (máx 3)
  const [selectedSeriesKeys, setSelectedSeriesKeys] = useState<string[]>([]);
  const [showSeriesSelectorModal, setShowSeriesSelectorModal] = useState(false);

  // Stack de Drill-Down
  const [drillStack, setDrillStack] = useState<DrillStep[]>([
    { id: "root", name: "Visão Geral", level: "root" },
  ]);

  // Dados do banco
  const [loading, setLoading] = useState(true);
  const [allTransactions, setAllTransactions] = useState<ReportTransaction[]>([]);
  const [categories, setCategories] = useState<ReportCategory[]>([]);
  const [bankAccounts, setBankAccounts] = useState<ReportBankAccount[]>([]);
  const [costCenters, setCostCenters] = useState<ReportCostCenter[]>([]);

  // Meses ativos no período
  const activeMonths = useMemo(() => {
    if (granularity === "single_month") {
      return [selectedMonth];
    }
    return generateMonthRange(startMonth, endMonth);
  }, [granularity, selectedMonth, startMonth, endMonth]);

  // Colunas geradas para o período
  const columns: ColumnDef[] = useMemo(() => {
    return getColumnsForGranularity(granularity, selectedMonth, startMonth, endMonth);
  }, [granularity, selectedMonth, startMonth, endMonth]);

  // Busca de dados
  const fetchData = useCallback(async () => {
    if (!selectedCompany) {
      setAllTransactions([]);
      setCategories([]);
      setBankAccounts([]);
      setCostCenters([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [trxsRes, catsRes, accsRes, ccRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, date, description, amount, category_id, cost_center, is_reconciled, is_internal_transfer, bank_account_id, month_ref")
        .eq("company_id", selectedCompany.id)
        .in("month_ref", activeMonths),
      supabase
        .from("categories")
        .select("id, name, type, parent_id, cost_center")
        .eq("company_id", selectedCompany.id)
        .order("name"),
      supabase
        .from("bank_accounts")
        .select("id, name, is_active")
        .eq("company_id", selectedCompany.id)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("cost_centers")
        .select("id, name")
        .eq("company_id", selectedCompany.id)
        .order("name"),
    ]);

    setAllTransactions(trxsRes.data || []);
    setCategories(catsRes.data || []);
    setBankAccounts(accsRes.data || []);
    setCostCenters(ccRes.data || []);
    setLoading(false);
  }, [supabase, activeMonths, selectedCompany]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Regra de Validação de Conciliação
  const reconciliationCheck = useMemo(() => {
    return validateReconciliation(allTransactions, activeMonths);
  }, [allTransactions, activeMonths]);

  // Mudança de Granularidade com Matriz de Compatibilidade
  function handleGranularityChange(newGranularity: Granularity) {
    setGranularity(newGranularity);
    if (!isVisualCompatible(newGranularity, visualMode)) {
      setVisualMode("table");
    }
  }

  // Alternar expansão do Accordion da Tabela
  function toggleRowExpansion(rowId: string) {
    setExpandedRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  }

  // Drill-down helpers
  const currentDrill = drillStack[drillStack.length - 1];

  function pushDrill(step: DrillStep) {
    setDrillStack((prev) => [...prev, step]);
  }

  function popDrill() {
    if (drillStack.length > 1) {
      setDrillStack((prev) => prev.slice(0, prev.length - 1));
    }
  }

  function resetDrill() {
    setDrillStack([{ id: "root", name: "Visão Geral", level: "root" }]);
  }

  function handleDimensionChange(newDim: Dimension) {
    setDimension(newDim);
    resetDrill();
    setSelectedSeriesKeys([]);
  }

  // Estrutura de dados para Tabela e Gráficos
  const tableData = useMemo(() => {
    const totalIncome: Record<string, number> = {};
    const totalExpense: Record<string, number> = {};
    const netBalance: Record<string, number> = {};

    for (const col of columns) {
      const colTrxs = allTransactions.filter((t) => col.monthRefs.includes(t.month_ref) && !t.is_internal_transfer);
      const inc = colTrxs.filter((t) => t.amount > 0).reduce((sum, t) => sum + Number(t.amount), 0);
      const exp = colTrxs.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
      totalIncome[col.key] = inc;
      totalExpense[col.key] = exp;
      netBalance[col.key] = inc - exp;
    }

    const rows: TableRowData[] = [];

    if (dimension === "cashflow") {
      // 1. Receitas
      const incomeCategories = categories.filter((c) => c.type === "income" && c.parent_id === null);
      const incomeChildren: TableRowData[] = incomeCategories.map((cat) => {
        const values: Record<string, number> = {};
        const subCatIds = new Set(categories.filter((c) => c.parent_id === cat.id).map((c) => c.id));

        for (const col of columns) {
          const sum = allTransactions
            .filter((t) => col.monthRefs.includes(t.month_ref) && t.amount > 0 && t.category_id && (t.category_id === cat.id || subCatIds.has(t.category_id)))
            .reduce((s, t) => s + Number(t.amount), 0);
          values[col.key] = sum;
        }

        return {
          id: `cat-${cat.id}`,
          name: cat.name,
          type: "income",
          categoryId: cat.id,
          values,
        };
      });

      rows.push({
        id: "cf-income",
        name: "Receitas Operacionais",
        type: "income",
        values: totalIncome,
        children: incomeChildren,
      });

      // 2. Despesas
      const expenseCategories = categories.filter((c) => c.type === "expense" && c.parent_id === null);
      const expenseChildren: TableRowData[] = expenseCategories.map((cat) => {
        const values: Record<string, number> = {};
        const subCatIds = new Set(categories.filter((c) => c.parent_id === cat.id).map((c) => c.id));

        for (const col of columns) {
          const sum = allTransactions
            .filter((t) => col.monthRefs.includes(t.month_ref) && t.amount < 0 && t.category_id && (t.category_id === cat.id || subCatIds.has(t.category_id)))
            .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
          values[col.key] = sum;
        }

        return {
          id: `cat-${cat.id}`,
          name: cat.name,
          type: "expense",
          categoryId: cat.id,
          values,
        };
      });

      rows.push({
        id: "cf-expense",
        name: "Despesas Operacionais",
        type: "expense",
        values: totalExpense,
        children: expenseChildren,
      });
    } else if (dimension === "category") {
      if (currentDrill.level === "root") {
        const parentCats = categories.filter((c) => c.parent_id === null);
        for (const parent of parentCats) {
          const subCats = categories.filter((c) => c.parent_id === parent.id);
          const subCatIds = new Set(subCats.map((c) => c.id));
          const values: Record<string, number> = {};

          for (const col of columns) {
            const sum = allTransactions
              .filter((t) => {
                if (!col.monthRefs.includes(t.month_ref) || t.is_internal_transfer) return false;
                if (!t.category_id) return false;
                return t.category_id === parent.id || subCatIds.has(t.category_id);
              })
              .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
            values[col.key] = sum;
          }

          const children: TableRowData[] = subCats.map((sub) => {
            const subValues: Record<string, number> = {};
            for (const col of columns) {
              const sum = allTransactions
                .filter((t) => col.monthRefs.includes(t.month_ref) && !t.is_internal_transfer && t.category_id === sub.id)
                .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
              subValues[col.key] = sum;
            }
            return {
              id: `sub-${sub.id}`,
              name: sub.name,
              type: sub.type,
              categoryId: parent.id,
              subcategoryId: sub.id,
              values: subValues,
            };
          });

          rows.push({
            id: `cat-${parent.id}`,
            name: parent.name,
            type: parent.type,
            categoryId: parent.id,
            values,
            children: children.length > 0 ? children : undefined,
          });
        }
      } else if (currentDrill.level === "category" && currentDrill.categoryId) {
        const subCats = categories.filter((c) => c.parent_id === currentDrill.categoryId);
        for (const sub of subCats) {
          const subValues: Record<string, number> = {};
          for (const col of columns) {
            const sum = allTransactions
              .filter((t) => col.monthRefs.includes(t.month_ref) && !t.is_internal_transfer && t.category_id === sub.id)
              .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
            subValues[col.key] = sum;
          }
          rows.push({
            id: `sub-${sub.id}`,
            name: sub.name,
            type: sub.type,
            categoryId: currentDrill.categoryId,
            subcategoryId: sub.id,
            values: subValues,
          });
        }
      }
    } else if (dimension === "bank_account") {
      for (const acc of bankAccounts) {
        const values: Record<string, number> = {};
        for (const col of columns) {
          const sum = allTransactions
            .filter((t) => col.monthRefs.includes(t.month_ref) && !t.is_internal_transfer && t.bank_account_id === acc.id)
            .reduce((s, t) => s + Number(t.amount), 0);
          values[col.key] = sum;
        }
        rows.push({
          id: `acc-${acc.id}`,
          name: acc.name,
          bankAccountId: acc.id,
          values,
        });
      }
    } else if (dimension === "cost_center") {
      const distinctCCs = Array.from(
        new Set([
          ...costCenters.map((cc) => cc.name),
          ...allTransactions.map((t) => t.cost_center || "(Sem Centro de Custo)"),
        ])
      ).filter(Boolean);

      for (const ccName of distinctCCs) {
        const values: Record<string, number> = {};
        for (const col of columns) {
          const sum = allTransactions
            .filter((t) => {
              if (!col.monthRefs.includes(t.month_ref) || t.is_internal_transfer) return false;
              const name = t.cost_center || "(Sem Centro de Custo)";
              return name === ccName;
            })
            .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
          values[col.key] = sum;
        }
        rows.push({
          id: `cc-${ccName}`,
          name: ccName,
          costCenterName: ccName,
          values,
        });
      }
    }

    return {
      rows,
      totalIncome,
      totalExpense,
      netBalance,
    };
  }, [dimension, currentDrill, categories, bankAccounts, costCenters, columns, allTransactions]);

  // Séries padrão selecionadas para gráficos (inicializa com até as 3 primeiras)
  useEffect(() => {
    if (tableData.rows.length > 0 && selectedSeriesKeys.length === 0) {
      setSelectedSeriesKeys(tableData.rows.slice(0, 3).map((r) => r.id));
    }
  }, [tableData.rows, selectedSeriesKeys.length]);

  // Preparação de dados para Gráficos Temporais (Barras e Linhas)
  const temporalChartData = useMemo(() => {
    return columns.map((col) => {
      const point: Record<string, any> = {
        name: col.label,
        key: col.key,
      };

      for (const row of tableData.rows) {
        point[row.id] = row.values[col.key] || 0;
      }

      return point;
    });
  }, [columns, tableData.rows]);

  // Preparação de dados para Pizza (Composição)
  const pieChartData = useMemo(() => {
    const colKey = columns[0]?.key || "total";
    return tableData.rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        value: Math.abs(row.values[colKey] || 0),
        rawRow: row,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [columns, tableData.rows]);

  const totalPieValue = useMemo(() => {
    return pieChartData.reduce((sum, item) => sum + item.value, 0);
  }, [pieChartData]);

  // Alternar seleção de série (máx 3)
  function toggleSeriesKey(key: string) {
    setSelectedSeriesKeys((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, key];
    });
  }

  // Redirecionamento com filtros para /transactions
  function handleNavigateToTransactions(catId?: string | null, subId?: string | null) {
    const targetMonth = granularity === "single_month" ? selectedMonth : endMonth;
    const params = new URLSearchParams();
    params.set("month", targetMonth);
    if (catId) params.set("category_id", catId);
    if (subId) params.set("subcategory_id", subId);
    router.push(`/transactions?${params.toString()}`);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600 hover:text-primary bg-slate-100 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              <span>←</span> Voltar ao Dashboard
            </Link>
            <div className="h-4 w-px bg-gray-200 hidden sm:block" />
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                Relatórios Financeiros
              </h1>
              <p className="text-xs text-slate-500">
                BI, Inteligência Financeira e Análise de Margens
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20">
              Modo CFO / Auditoria
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* ========================================================================= */}
        {/* PORTÃO DE CONCILIAÇÃO (GATEKEEPER)                                       */}
        {/* ========================================================================= */}
        {!loading && !reconciliationCheck.isClean && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="text-3xl">⚠️</span>
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-amber-900">
                  Conciliação Pendente no Período Selecionado
                </h2>
                <p className="text-sm text-amber-800">
                  Por integridade analítica, o sistema de BI não processa relatórios para períodos que contenham pendências de conciliação.
                </p>
                <div className="mt-3 p-3 bg-white/80 border border-amber-200 rounded-xl">
                  <p className="text-xs font-semibold text-amber-900 mb-1">
                    Há transações não conciliadas em:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {reconciliationCheck.pendingMonths.map((m) => (
                      <span
                        key={m}
                        className="text-xs font-bold bg-amber-200/70 text-amber-900 px-2.5 py-1 rounded-md"
                      >
                        {formatMonthToBR(m)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="pt-2 flex items-center gap-3">
                  <Link
                    href={`/transactions?month=${reconciliationCheck.pendingMonths[0]}`}
                    className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow"
                  >
                    <span>Ir para Conciliação de {formatMonthToBR(reconciliationCheck.pendingMonths[0])}</span>
                    <span>→</span>
                  </Link>
                  <span className="text-xs text-amber-700">
                    Conclua a conciliação para desbloquear esta visão.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4 EIXOS DE FILTRAGEM (PILLS HORIZONTAIS)                                   */}
        {/* ========================================================================= */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* EIXO 1: GRANULARIDADE */}
            <div className="lg:col-span-4 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1. Granularidade
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                {(
                  [
                    { key: "single_month", label: "Mês Único" },
                    { key: "month_by_month", label: "Mês a Mês" },
                    { key: "quarter", label: "Trimestre" },
                    { key: "total", label: "Total Período" },
                  ] as { key: Granularity; label: string }[]
                ).map((g) => (
                  <button
                    key={g.key}
                    onClick={() => handleGranularityChange(g.key)}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all text-center ${
                      granularity === g.key
                        ? "bg-white text-primary shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* EIXO 2: PERÍODO */}
            <div className="lg:col-span-4 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                2. Período
              </label>
              {granularity === "single_month" ? (
                <div className="flex items-center">
                  <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-8 flex-shrink-0">
                      De:
                    </span>
                    <MonthSelector value={startMonth} onChange={setStartMonth} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-8 flex-shrink-0">
                      Até:
                    </span>
                    <MonthSelector value={endMonth} onChange={setEndMonth} />
                  </div>
                </div>
              )}
            </div>

            {/* EIXO 3: ÂNGULO DE ANÁLISE */}
            <div className="lg:col-span-4 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                3. Ângulo de Análise
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                {(
                  [
                    { key: "category", label: "Por Categoria" },
                    { key: "cashflow", label: "Fluxo de Caixa" },
                    { key: "bank_account", label: "Por Conta" },
                    { key: "cost_center", label: "Por Centro Custo" },
                  ] as { key: Dimension; label: string }[]
                ).map((d) => (
                  <button
                    key={d.key}
                    onClick={() => handleDimensionChange(d.key)}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all text-center ${
                      dimension === d.key
                        ? "bg-white text-primary shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* EIXO 4: VISUALIZAÇÃO & MATRIZ DE COMPATIBILIDADE */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                4. Visualização
              </span>
              <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-xl inline-flex">
                {(
                  [
                    { key: "table", label: "📊 Tabela", badge: "AV/AH" },
                    { key: "pie", label: "🥧 Pizza", badge: "Composição" },
                    { key: "bar", label: "📶 Barras", badge: "Máx 3" },
                    { key: "line", label: "📈 Linha", badge: "Máx 3" },
                  ] as { key: VisualMode; label: string; badge: string }[]
                ).map((v) => {
                  const compatible = isVisualCompatible(granularity, v.key);
                  return (
                    <button
                      key={v.key}
                      disabled={!compatible}
                      onClick={() => setVisualMode(v.key)}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        visualMode === v.key
                          ? "bg-white text-primary shadow-sm"
                          : compatible
                          ? "text-slate-600 hover:text-slate-900"
                          : "text-slate-300 cursor-not-allowed opacity-50"
                      }`}
                    >
                      <span>{v.label}</span>
                      <span className="text-[10px] px-1 py-0.2 rounded bg-slate-200 text-slate-600">
                        {v.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SELETOR DE SÉRIES / TOGGLES EXCLUSIVOS */}
            <div className="flex items-center gap-3">
              {visualMode === "table" && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAV(!showAV)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                      showAV
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span>AV (Vertical %)</span>
                  </button>

                  <button
                    onClick={() => setShowAH(!showAH)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                      showAH
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span>AH (Horizontal Δ%)</span>
                  </button>
                </div>
              )}

              {(visualMode === "bar" || visualMode === "line") && (
                <button
                  onClick={() => setShowSeriesSelectorModal(true)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2"
                >
                  <span>🎯 Filtrar Séries ({selectedSeriesKeys.length}/3)</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* DRILL-DOWN STACK & BREADCRUMBS                                            */}
        {/* ========================================================================= */}
        <section className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-400">Navegação:</span>
            {drillStack.map((step, idx) => (
              <div key={step.id} className="flex items-center gap-2">
                {idx > 0 && <span className="text-xs text-slate-300">/</span>}
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                    idx === drillStack.length - 1
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-slate-600"
                  }`}
                >
                  {step.name}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {drillStack.length > 1 && (
              <button
                onClick={popDrill}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
              >
                <span>←</span> Voltar
              </button>
            )}

            {currentDrill.level !== "root" && (
              <button
                onClick={() =>
                  handleNavigateToTransactions(
                    currentDrill.categoryId,
                    currentDrill.subcategoryId
                  )
                }
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow flex items-center gap-1"
              >
                <span>→ Ver transações detalhadas</span>
              </button>
            )}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* ÁREA DE VISUALIZAÇÃO PRINCIPAL                                            */}
        {/* ========================================================================= */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
            <p className="text-slate-400 font-medium">Carregando dados analíticos...</p>
          </div>
        ) : !reconciliationCheck.isClean ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400">
            Relatório bloqueado devido a pendências de conciliação.
          </div>
        ) : (
          <section className="space-y-6">
            {/* --------------------------------------------------------------------- */}
            {/* 1. MODO TABELA COM AV / AH & ACCORDION INLINE                         */}
            {/* --------------------------------------------------------------------- */}
            {visualMode === "table" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 uppercase font-bold tracking-wider">
                        <th className="py-3 px-4 min-w-[220px]">Dimensão / Linha</th>
                        {columns.map((col) => (
                          <th key={col.key} className="py-3 px-4 text-right min-w-[160px]">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tableData.rows.map((row) => {
                        const isExpanded = expandedRows[row.id];
                        const hasChildren = row.children && row.children.length > 0;

                        return (
                          <div key={row.id} className="contents">
                            {/* Linha Pai */}
                            <tr className="hover:bg-slate-50 transition-colors group">
                              <td className="py-3 px-4 flex items-center gap-2">
                                {hasChildren ? (
                                  <button
                                    onClick={() => toggleRowExpansion(row.id)}
                                    className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-primary transition-colors font-mono font-bold text-xs"
                                  >
                                    {isExpanded ? "▼" : "▶"}
                                  </button>
                                ) : (
                                  <span className="w-5 h-5" />
                                )}

                                <button
                                  onClick={() => {
                                    if (row.categoryId && currentDrill.level === "root") {
                                      pushDrill({
                                        id: row.id,
                                        name: row.name,
                                        level: "category",
                                        type: row.type as any,
                                        categoryId: row.categoryId,
                                      });
                                    }
                                  }}
                                  className="font-bold text-slate-900 hover:text-primary text-left transition-colors"
                                >
                                  {row.name}
                                </button>
                              </td>

                              {columns.map((col, colIdx) => {
                                const val = row.values[col.key] || 0;
                                const prevVal = colIdx > 0 ? row.values[columns[colIdx - 1].key] : undefined;

                                const groupTotal =
                                  row.type === "income"
                                    ? tableData.totalIncome[col.key]
                                    : row.type === "expense"
                                    ? tableData.totalExpense[col.key]
                                    : Math.abs(tableData.netBalance[col.key]);

                                const av = calculateAV(val, groupTotal);
                                const ah = calculateAH(val, prevVal);

                                return (
                                  <td key={col.key} className="py-3 px-4 text-right">
                                    <div className="font-semibold text-slate-900">
                                      {formatBRL(val)}
                                    </div>
                                    <div className="flex items-center justify-end gap-1.5 mt-0.5 text-[10px]">
                                      {showAV && (
                                        <span className="text-slate-500 bg-slate-100 px-1 py-0.2 rounded font-mono">
                                          AV: {av.toFixed(1)}%
                                        </span>
                                      )}
                                      {showAH && colIdx > 0 && ah !== null && (
                                        <span className={`font-mono ${getAHColorClass(ah, row.type)}`}>
                                          AH: {formatPercent(ah)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>

                            {/* Sublinhas expandidas (Accordion Inline) */}
                            {hasChildren && isExpanded && (
                              <div className="contents">
                                {row.children!.map((child) => (
                                  <tr key={child.id} className="bg-slate-50/70 hover:bg-slate-100/60 transition-colors">
                                    <td className="py-2.5 px-4 pl-10 flex items-center justify-between text-slate-700">
                                      <span className="font-medium text-slate-800">
                                        ↳ {child.name}
                                      </span>
                                      <button
                                        onClick={() =>
                                          handleNavigateToTransactions(
                                            child.categoryId,
                                            child.subcategoryId
                                          )
                                        }
                                        className="text-[10px] text-primary hover:underline"
                                      >
                                        ver transações
                                      </button>
                                    </td>

                                    {columns.map((col, colIdx) => {
                                      const childVal = child.values[col.key] || 0;
                                      const parentVal = row.values[col.key] || 0;
                                      const prevChildVal = colIdx > 0 ? child.values[columns[colIdx - 1].key] : undefined;

                                      const childAV = calculateAV(childVal, parentVal);
                                      const childAH = calculateAH(childVal, prevChildVal);

                                      return (
                                        <td key={col.key} className="py-2.5 px-4 text-right">
                                          <div className="font-medium text-slate-700">
                                            {formatBRL(childVal)}
                                          </div>
                                          <div className="flex items-center justify-end gap-1.5 mt-0.5 text-[10px]">
                                            {showAV && (
                                              <span className="text-slate-400 bg-white border border-slate-200 px-1 py-0.2 rounded font-mono">
                                                AV: {childAV.toFixed(1)}%
                                              </span>
                                            )}
                                            {showAH && colIdx > 0 && childAH !== null && (
                                              <span className={`font-mono ${getAHColorClass(childAH, child.type)}`}>
                                                AH: {formatPercent(childAH)}
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* TOTAIS CONSOLIDADOS (SE FOR FLUXO DE CAIXA OU CATEGORIAS) */}
                      {dimension === "cashflow" && (
                        <tr className="bg-primary/5 border-t-2 border-primary/20 font-bold">
                          <td className="py-3 px-4 text-primary uppercase">
                            = Saldo Líquido Operacional
                          </td>
                          {columns.map((col, colIdx) => {
                            const net = tableData.netBalance[col.key] || 0;
                            const prevNet = colIdx > 0 ? tableData.netBalance[columns[colIdx - 1].key] : undefined;
                            const ah = calculateAH(net, prevNet);

                            return (
                              <td key={col.key} className="py-3 px-4 text-right">
                                <div className={`text-sm font-extrabold ${net >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                                  {formatBRL(net)}
                                </div>
                                {showAH && colIdx > 0 && ah !== null && (
                                  <div className={`text-[10px] font-mono mt-0.5 ${getAHColorClass(ah, "net")}`}>
                                    AH: {formatPercent(ah)}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* --------------------------------------------------------------------- */}
            {/* 2. MODO PIZZA (COMPOSIÇÃO & REPRESENTATIVIDADE)                         */}
            {/* --------------------------------------------------------------------- */}
            {visualMode === "pie" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-base font-bold text-slate-900">
                    Composição Percentual ({columns[0]?.label})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Clique em uma fatia para fazer drill-down e ver o detalhamento do grupo.
                  </p>
                </div>

                {pieChartData.length === 0 ? (
                  <div className="py-16 text-center text-slate-400">
                    Sem dados com valor positivo para exibir no gráfico de pizza.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                    <div className="lg:col-span-7 h-[360px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieChartData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={120}
                            innerRadius={60}
                            paddingAngle={3}
                            onClick={(entry: any) => {
                              const target = entry?.rawRow || entry?.payload?.rawRow || entry?.payload;
                              if (target?.categoryId && currentDrill.level === "root") {
                                pushDrill({
                                  id: target.id,
                                  name: target.name,
                                  level: "category",
                                  type: target.type as any,
                                  categoryId: target.categoryId,
                                });
                              }
                            }}
                            cursor="pointer"
                          >
                            {pieChartData.map((_, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            formatter={(value: any, name: any) => {
                              const valNum = Number(value);
                              const pct = totalPieValue > 0 ? (valNum / totalPieValue) * 100 : 0;
                              return [`${formatBRL(valNum)} (${pct.toFixed(1)}%)`, name];
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="lg:col-span-5 space-y-2 max-h-[360px] overflow-y-auto pr-2">
                      {pieChartData.map((item, idx) => {
                        const pct = totalPieValue > 0 ? (item.value / totalPieValue) * 100 : 0;
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              if (item.rawRow?.categoryId && currentDrill.level === "root") {
                                pushDrill({
                                  id: item.rawRow.id,
                                  name: item.rawRow.name,
                                  level: "category",
                                  type: item.rawRow.type as any,
                                  categoryId: item.rawRow.categoryId,
                                });
                              }
                            }}
                            className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center justify-between cursor-pointer transition-colors border border-slate-100"
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                              />
                              <div>
                                <p className="text-xs font-bold text-slate-800">{item.name}</p>
                                <p className="text-[10px] text-slate-500">{pct.toFixed(1)}% do total</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-bold text-slate-900">
                                {formatBRL(item.value)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --------------------------------------------------------------------- */}
            {/* 3. MODO BARRAS VERTICAIS (EVOLUÇÃO TEMPORAL)                           */}
            {/* --------------------------------------------------------------------- */}
            {visualMode === "bar" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Comparação Temporal em Barras
                    </h3>
                    <p className="text-xs text-slate-500">
                      Exibindo até 3 séries selecionadas ao longo do tempo.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowSeriesSelectorModal(true)}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Alterar séries selecionadas ({selectedSeriesKeys.length}/3)
                  </button>
                </div>

                <div className="h-[380px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={temporalChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                      />
                      <RechartsTooltip formatter={(val: any) => formatBRL(Number(val))} />
                      <Legend />
                      {selectedSeriesKeys.map((key, idx) => {
                        const row = tableData.rows.find((r) => r.id === key);
                        return (
                          <Bar
                            key={key}
                            dataKey={key}
                            name={row?.name || key}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                            radius={[4, 4, 0, 0]}
                          />
                        );
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* --------------------------------------------------------------------- */}
            {/* 4. MODO LINHAS (TENDÊNCIA E VOLATILIDADE)                              */}
            {/* --------------------------------------------------------------------- */}
            {visualMode === "line" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Tendência Temporal em Linhas
                    </h3>
                    <p className="text-xs text-slate-500">
                      Curva de evolução e volatilidade das séries selecionadas.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowSeriesSelectorModal(true)}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Alterar séries selecionadas ({selectedSeriesKeys.length}/3)
                  </button>
                </div>

                <div className="h-[380px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={temporalChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                      />
                      <RechartsTooltip formatter={(val: any) => formatBRL(Number(val))} />
                      <Legend />
                      {selectedSeriesKeys.map((key, idx) => {
                        const row = tableData.rows.find((r) => r.id === key);
                        return (
                          <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            name={row?.name || key}
                            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                            strokeWidth={3}
                            dot={{ r: 4 }}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL / BOTTOM SHEET: SELEÇÃO DE ATÉ 3 SÉRIES PARA GRÁFICOS               */}
      {/* ========================================================================= */}
      {showSeriesSelectorModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Selecionar Séries para o Gráfico
                </h3>
                <p className="text-xs text-slate-500">
                  Escolha no máximo 3 itens simultâneos para comparação limpa.
                </p>
              </div>
              <button
                onClick={() => setShowSeriesSelectorModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              {tableData.rows.map((row) => {
                const isSelected = selectedSeriesKeys.includes(row.id);
                const disabled = !isSelected && selectedSeriesKeys.length >= 3;

                return (
                  <label
                    key={row.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-primary/5 border-primary text-primary"
                        : disabled
                        ? "bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed opacity-60"
                        : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={disabled}
                        onChange={() => toggleSeriesKey(row.id)}
                        className="w-4 h-4 rounded text-primary focus:ring-primary border-slate-300"
                      />
                      <span className="text-xs font-bold">{row.name}</span>
                    </div>

                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 font-mono text-slate-600">
                      {row.type || "série"}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowSeriesSelectorModal(false)}
                className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-colors shadow"
              >
                Confirmar Seleção ({selectedSeriesKeys.length}/3)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
