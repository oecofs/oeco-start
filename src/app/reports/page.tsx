"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import MonthSelector from "@/components/MonthSelector";
import Navigation from "@/components/Navigation";
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
  computeExecutiveDiagnostic,
  computeReconciledAiDiagnostic,
} from "@/lib/reports/diagnostics";
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
  level: "root" | "category" | "subcategory" | "account" | "cost_center";
  type?: "income" | "expense";
  categoryId?: string | null;
  subcategoryId?: string | null;
  bankAccountId?: string | null;
  costCenterName?: string | null;
};

export default function ReportsPage() {
  const supabase = createClient();
  const router = useRouter();
  const { selectedCompany, isMaster, userRole } = useCompany();

  // Permissão Master
  const isMasterUser = isMaster || userRole === "master";

  // Controle de Subabas Principais
  const [activeTab, setActiveTab] = useState<"reports" | "ai_diagnostic">("reports");

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

  // Subaba de IA / Diagnóstico CFO com IA (Exclusivo Master)
  const [aiStartMonth, setAiStartMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-01`;
  });
  const [aiEndMonth, setAiEndMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [aiCommentary, setAiCommentary] = useState<string>("");
  const [loadingAi, setLoadingAi] = useState(false);

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

  // Meses ativos no período do relatório principal
  const activeMonths = useMemo(() => {
    if (granularity === "single_month") {
      return [selectedMonth];
    }
    return generateMonthRange(startMonth, endMonth);
  }, [granularity, selectedMonth, startMonth, endMonth]);

  // Meses do diagnóstico de IA
  const aiTargetMonths = useMemo(() => {
    return generateMonthRange(aiStartMonth, aiEndMonth);
  }, [aiStartMonth, aiEndMonth]);

  // Todos os meses que precisam ser consultados do banco
  const queryMonths = useMemo(() => {
    const set = new Set(activeMonths);
    if (isMasterUser) {
      for (const m of aiTargetMonths) set.add(m);
    }
    return Array.from(set);
  }, [activeMonths, aiTargetMonths, isMasterUser]);

  // Colunas geradas para o período
  const columns: ColumnDef[] = useMemo(() => {
    return getColumnsForGranularity(granularity, selectedMonth, startMonth, endMonth);
  }, [granularity, selectedMonth, startMonth, endMonth]);

  // Label do período ativo
  const periodLabel = useMemo(() => {
    if (granularity === "single_month") {
      return formatMonthToBR(selectedMonth);
    }
    return `${formatMonthToBR(startMonth)} a ${formatMonthToBR(endMonth)}`;
  }, [granularity, selectedMonth, startMonth, endMonth]);

  // Label da dimensão ativa
  const dimensionLabel = useMemo(() => {
    if (dimension === "cashflow") return "Fluxo de Caixa";
    if (dimension === "category") return "Por Categoria";
    if (dimension === "bank_account") return "Por Conta";
    return "Por Centro Custo";
  }, [dimension]);

  // Busca de dados exata com filtro de meses para garantir 100% de integridade
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
        .in("month_ref", queryMonths),
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
  }, [supabase, queryMonths, selectedCompany]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Regra de Validação de Conciliação para o período principal
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
    setSelectedSeriesKeys([]);
  }

  function popDrill() {
    if (drillStack.length > 1) {
      setDrillStack((prev) => prev.slice(0, prev.length - 1));
      setSelectedSeriesKeys([]);
    }
  }

  function resetDrill() {
    setDrillStack([{ id: "root", name: "Visão Geral", level: "root" }]);
    setSelectedSeriesKeys([]);
  }

  function handleDimensionChange(newDim: Dimension) {
    setDimension(newDim);
    resetDrill();
    setSelectedSeriesKeys([]);
  }

  function toggleSeriesKey(key: string) {
    setSelectedSeriesKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : prev.length < 3 ? [...prev, key] : prev
    );
  }

  // Navegar direto para o Extrato Filtrado
  function handleNavigateToTransactions(catId?: string | null, subId?: string | null) {
    const targetMonth = granularity === "single_month" ? selectedMonth : endMonth;
    const params = new URLSearchParams();
    params.set("month", targetMonth);
    if (subId) {
      params.set("category_id", subId);
    } else if (catId) {
      params.set("category_id", catId);
    }
    router.push(`/transactions?${params.toString()}`);
  }

  // Estrutura de dados para Tabela e Gráficos (Idêntica ao motor de produção confiável)
  const tableData = useMemo(() => {
    const totalIncome: Record<string, number> = {};
    const totalExpense: Record<string, number> = {};
    const netBalance: Record<string, number> = {};

    for (const col of columns) {
      const colTrxs = allTransactions.filter(
        (t) => col.monthRefs.includes(t.month_ref) && !t.is_internal_transfer
      );
      const inc = colTrxs.filter((t) => t.amount > 0).reduce((sum, t) => sum + Number(t.amount), 0);
      const exp = colTrxs.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
      totalIncome[col.key] = inc;
      totalExpense[col.key] = exp;
      netBalance[col.key] = inc - exp;
    }

    const rows: TableRowData[] = [];

    // 1. FLUXO DE CAIXA
    if (dimension === "cashflow") {
      // Receitas Operacionais
      const incomeCategories = categories.filter((c) => c.type === "income" && c.parent_id === null);
      const incomeChildren: TableRowData[] = incomeCategories.map((cat) => {
        const values: Record<string, number> = {};
        const subCatIds = new Set(categories.filter((c) => c.parent_id === cat.id).map((c) => c.id));

        for (const col of columns) {
          const sum = allTransactions
            .filter(
              (t) =>
                col.monthRefs.includes(t.month_ref) &&
                t.amount > 0 &&
                t.category_id &&
                (t.category_id === cat.id || subCatIds.has(t.category_id))
            )
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

      // Despesas Operacionais
      const expenseCategories = categories.filter((c) => c.type === "expense" && c.parent_id === null);
      const expenseChildren: TableRowData[] = expenseCategories.map((cat) => {
        const values: Record<string, number> = {};
        const subCatIds = new Set(categories.filter((c) => c.parent_id === cat.id).map((c) => c.id));

        for (const col of columns) {
          const sum = allTransactions
            .filter(
              (t) =>
                col.monthRefs.includes(t.month_ref) &&
                t.amount < 0 &&
                t.category_id &&
                (t.category_id === cat.id || subCatIds.has(t.category_id))
            )
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
    }
    // 2. CATEGORIAS
    else if (dimension === "category") {
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
    }
    // 3. CONTAS BANCÁRIAS
    else if (dimension === "bank_account") {
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
    }
    // 4. CENTROS DE CUSTO
    else if (dimension === "cost_center") {
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

  // Diagnóstico Geral do Período Atual
  const diagnostic = useMemo(() => {
    return computeExecutiveDiagnostic(
      tableData.rows,
      columns,
      tableData.totalIncome,
      tableData.totalExpense,
      dimensionLabel
    );
  }, [tableData.rows, columns, tableData.totalIncome, tableData.totalExpense, dimensionLabel]);

  // Diagnóstico Específico para a Subaba de IA (Apenas Dados Conciliados do Período Selecionado pelo Master)
  const aiDiagnostic = useMemo(() => {
    return computeReconciledAiDiagnostic(allTransactions, categories, aiTargetMonths);
  }, [allTransactions, categories, aiTargetMonths]);

  // Sincroniza a narrativa inicial de IA
  useEffect(() => {
    if (!aiCommentary && aiDiagnostic.summaryNarrative) {
      setAiCommentary(aiDiagnostic.summaryNarrative);
    }
  }, [aiDiagnostic.summaryNarrative, aiCommentary]);

  // Séries padrão selecionadas para gráficos
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

  // Handlers de Exportação Dinâmica (Exclusivo Master)
  async function handleExportPdf() {
    if (!selectedCompany || !isMasterUser) return;
    try {
      const { exportReportToPdf } = await import("@/lib/reports/exportPdf");
      exportReportToPdf({
        companyName: selectedCompany.name,
        periodLabel,
        dimensionLabel,
        columns,
        rows: tableData.rows,
        totalIncomeByCol: tableData.totalIncome,
        totalExpenseByCol: tableData.totalExpense,
        netBalanceByCol: tableData.netBalance,
        diagnostic,
      });
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
    }
  }

  async function handleExportXlsx() {
    if (!selectedCompany || !isMasterUser) return;
    try {
      const { exportReportToXlsx } = await import("@/lib/reports/exportXlsx");
      exportReportToXlsx({
        companyName: selectedCompany.name,
        periodLabel,
        dimensionLabel,
        columns,
        rows: tableData.rows,
        totalIncomeByCol: tableData.totalIncome,
        totalExpenseByCol: tableData.totalExpense,
        netBalanceByCol: tableData.netBalance,
        diagnostic,
        transactions: allTransactions.filter((t) => activeMonths.includes(t.month_ref)),
        categories,
        bankAccounts,
      });
    } catch (err) {
      console.error("Erro ao gerar XLSX:", err);
    }
  }

  // Exportar Relatório de IA Conciliado do CFO em PDF
  async function handleExportAiPdf() {
    if (!selectedCompany || !isMasterUser) return;
    try {
      const { exportReportToPdf } = await import("@/lib/reports/exportPdf");
      const aiColumns: ColumnDef[] = aiTargetMonths.map((m) => ({
        key: m,
        label: formatMonthToBR(m),
        monthRefs: [m],
      }));

      const aiRows: TableRowData[] = aiDiagnostic.topExpenseCategories.map((c) => ({
        id: `ai-${c.name}`,
        name: c.name,
        type: "expense",
        values: { total: c.amount },
      }));

      exportReportToPdf({
        companyName: selectedCompany.name,
        periodLabel: `${formatMonthToBR(aiStartMonth)} a ${formatMonthToBR(aiEndMonth)} (Auditoria 100% Conciliada)`,
        dimensionLabel: "Diagnóstico CFO com Inteligência Artificial",
        columns: aiColumns,
        rows: aiRows,
        totalIncomeByCol: { total: aiDiagnostic.totalIncome },
        totalExpenseByCol: { total: aiDiagnostic.totalExpense },
        netBalanceByCol: { total: aiDiagnostic.netResult },
        diagnostic: {
          ...aiDiagnostic,
          summaryNarrative: aiCommentary || aiDiagnostic.summaryNarrative,
        },
      });
    } catch (err) {
      console.error("Erro ao exportar PDF do CFO:", err);
    }
  }

  // Gerar Síntese Executiva com IA Baseada EXCLUSIVAMENTE em Dados Conciliados
  function handleGenerateAiSummary() {
    setLoadingAi(true);
    setTimeout(() => {
      setAiCommentary(
        `💡 Parecer Executivo do CFO (Auditoria 100% Conciliada): Durante o período de ${formatMonthToBR(
          aiStartMonth
        )} a ${formatMonthToBR(aiEndMonth)}, foram auditados ${
          aiDiagnostic.reconciledCount
        } lançamentos conciliados. A operação registrou receita líquida de ${formatBRL(
          aiDiagnostic.totalIncome
        )} frente a despesas realizadas de ${formatBRL(
          aiDiagnostic.totalExpense
        )}, gerando margem operacional de ${aiDiagnostic.operatingMarginPercent.toFixed(
          1
        )}% e resultado líquido de ${formatBRL(
          aiDiagnostic.netResult
        )}. As 3 maiores rubricas de despesa (${aiDiagnostic.topExpenseCategories
          .map((t) => t.name)
          .join(", ")}) concentraram ${aiDiagnostic.paretoConcentrationPercent.toFixed(
          1
        )}% de todos os desembolsos realizados.`
      );
      setLoadingAi(false);
    }, 400);
  }

  return (
    <Navigation>
      <div className="p-4 md:p-8 space-y-6">
        {/* ========================================================================= */}
        {/* CABEÇALHO & EXPORTAÇÕES (MASTER ONLY)                                      */}
        {/* ========================================================================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Relatórios & Inteligência Financeira</h1>
            <p className="text-xs text-slate-500">
              Demonstrações financeiras com drill-down interativo e auditoria de inteligência executiva
            </p>
          </div>

          {/* Botões de Ação Exclusivos do Usuário Master */}
          {isMasterUser && activeTab === "reports" && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleExportPdf}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold rounded-xl text-xs transition-all shadow-xs flex items-center gap-1.5"
                title="Baixar Relatório Executivo em PDF"
              >
                <span>📄</span> Exportar PDF
              </button>

              <button
                onClick={handleExportXlsx}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center gap-1.5"
                title="Baixar Planilha Excel com Múltiplas Abas"
              >
                <span>📊</span> Exportar Excel
              </button>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* CONTROLE DE SUBABAS: RELATÓRIOS VS DIAGNÓSTICO CFO IA (MASTER)            */}
        {/* ========================================================================= */}
        <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("reports")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "reports"
                ? "bg-primary text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span>📊</span>
            <span>Demonstrações & Relatórios</span>
          </button>

          {isMasterUser && (
            <button
              type="button"
              onClick={() => setActiveTab("ai_diagnostic")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === "ai_diagnostic"
                  ? "bg-gradient-to-r from-indigo-900 to-indigo-800 text-white shadow-sm border border-indigo-700"
                  : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
              }`}
            >
              <span>⚡</span>
              <span>Diagnóstico CFO com IA</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold uppercase ${
                  activeTab === "ai_diagnostic"
                    ? "bg-white/20 text-white"
                    : "bg-indigo-200/80 text-indigo-900"
                }`}
              >
                Master
              </span>
            </button>
          )}
        </div>

        {/* ========================================================================= */}
        {/* CONTEÚDO DA SUBABA 1: DEMONSTRAÇÕES & RELATÓRIOS GERAIS                   */}
        {/* ========================================================================= */}
        {activeTab === "reports" && (
          <div className="space-y-6">
            {/* AVISO DE CONCILIAÇÃO PENDENTE (SE HOUVER) */}
            {!reconciliationCheck.isClean && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-amber-900">
                      Atenção: Período com Pendências de Conciliação
                    </h3>
                    <p className="text-xs text-amber-700">
                      Há transações não conciliadas em:
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {reconciliationCheck.pendingMonths.map((m) => (
                        <span
                          key={m}
                          className="text-xs font-bold bg-amber-200/70 text-amber-900 px-2.5 py-1 rounded-md"
                        >
                          {formatMonthToBR(m)}
                        </span>
                      ))}
                    </div>
                    <div className="pt-2">
                      <Link
                        href={`/transactions?month=${reconciliationCheck.pendingMonths[0]}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 hover:underline"
                      >
                        <span>Ir para Conciliação de {formatMonthToBR(reconciliationCheck.pendingMonths[0])} →</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* BLOCO DE CONTROLE DOS 4 EIXOS DE ANÁLISE */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* EIXO 1: GRANULARIDADE */}
                <div className="lg:col-span-4 space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
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
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
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
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
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
                <div className="flex items-center gap-3 flex-wrap">
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

            {/* DRILL-DOWN STACK & BREADCRUMBS */}
            <section className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-400">Navegação:</span>
                {drillStack.map((step, idx) => (
                  <div key={step.id} className="flex items-center gap-2">
                    {idx > 0 && <span className="text-xs text-slate-300">/</span>}
                    <button
                      type="button"
                      onClick={() => setDrillStack((prev) => prev.slice(0, idx + 1))}
                      className={`text-xs font-bold px-2 py-0.5 rounded-md transition-colors ${
                        idx === drillStack.length - 1
                          ? "bg-primary/10 text-primary border border-primary/20 cursor-default"
                          : "text-slate-600 hover:text-slate-900 hover:underline"
                      }`}
                    >
                      {step.name}
                    </button>
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
                      handleNavigateToTransactions(currentDrill.categoryId, currentDrill.subcategoryId)
                    }
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow flex items-center gap-1"
                  >
                    <span>→ Ver transações detalhadas</span>
                  </button>
                )}
              </div>
            </section>

            {/* ÁREA DE VISUALIZAÇÃO PRINCIPAL */}
            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
                <p className="text-slate-400 font-medium">Carregando dados analíticos...</p>
              </div>
            ) : (
              <section className="space-y-6">
                {/* 1. MODO TABELA COM AV / AH & ACCORDION INLINE */}
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
                              <Fragment key={row.id}>
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
                                  <Fragment>
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
                                  </Fragment>
                                )}
                              </Fragment>
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

                {/* 2. MODO PIZZA (COMPOSIÇÃO & REPRESENTATIVIDADE) */}
                {visualMode === "pie" && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <div className="mb-4">
                      <h3 className="text-base font-bold text-slate-900">
                        Composição Percentual ({columns[0]?.label})
                      </h3>
                      <p className="text-xs text-slate-500">
                        Distribuição proporcional das linhas selecionadas.
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
                                className="p-3 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span
                                    className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                                  />
                                  <div>
                                    <p className="text-xs font-bold text-slate-800">
                                      {item.name}
                                    </p>
                                    <p className="text-[10px] text-slate-500">{pct.toFixed(1)}% do total</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="text-xs font-bold text-slate-900 block">
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

                {/* 3. MODO BARRAS VERTICAIS */}
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

                {/* 4. MODO LINHAS */}
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
          </div>
        )}

        {/* ========================================================================= */}
        {/* CONTEÚDO DA SUBABA 2: DIAGNÓSTICO CFO COM IA (EXCLUSIVO MASTER)           */}
        {/* ========================================================================= */}
        {activeTab === "ai_diagnostic" && isMasterUser && (
          <div className="space-y-6 animate-in fade-in">
            {/* Bloco de Filtro de Período & Auditoria Conciliada */}
            <section className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚡</span>
                    <h2 className="text-lg font-extrabold text-white">
                      Diagnóstico Executivo do CFO (Auditoria com IA)
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 font-extrabold uppercase">
                      Master Only
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Análise estratégica calculada <strong>exclusivamente sobre lançamentos 100% conciliados</strong>.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleGenerateAiSummary}
                    disabled={loadingAi}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow flex items-center gap-2 disabled:opacity-50"
                  >
                    <span>✨</span>
                    <span>{loadingAi ? "Gerando Parecer..." : "Regerar Síntese com IA"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportAiPdf}
                    className="px-4 py-2 bg-white text-slate-900 hover:bg-slate-100 text-xs font-bold rounded-xl transition-all shadow flex items-center gap-1.5"
                  >
                    <span>📄</span>
                    <span>Exportar Relatório CFO (PDF)</span>
                  </button>
                </div>
              </div>

              {/* Seletor de Período Dedicado do Diagnóstico de IA */}
              <div className="bg-slate-950/70 rounded-2xl p-4 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                    Período da Auditoria de IA:
                  </label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">De:</span>
                      <MonthSelector value={aiStartMonth} onChange={setAiStartMonth} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">Até:</span>
                      <MonthSelector value={aiEndMonth} onChange={setAiEndMonth} />
                    </div>
                  </div>
                </div>

                <div className="text-left md:text-right space-y-1">
                  <span className="text-xs font-semibold text-emerald-400 block flex items-center gap-1.5 md:justify-end">
                    <span>🛡️</span>
                    <span>{aiDiagnostic.reconciledCount} lançamentos 100% conciliados</span>
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    {aiDiagnostic.totalTransactionsCount - aiDiagnostic.reconciledCount > 0
                      ? `(${aiDiagnostic.totalTransactionsCount - aiDiagnostic.reconciledCount} pendências desconsideradas da base)`
                      : "Base 100% limpa e conciliada"}
                  </span>
                </div>
              </div>

              {/* 4 KPIs Executivos */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Margem Operacional
                  </span>
                  <span className="text-2xl font-extrabold text-emerald-400 mt-1 block">
                    {aiDiagnostic.operatingMarginPercent.toFixed(1)}%
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    Resultado / Receita
                  </span>
                </div>

                <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Queima Média Mensal
                  </span>
                  <span className="text-2xl font-extrabold text-amber-300 mt-1 block">
                    {formatBRL(aiDiagnostic.avgMonthlyBurn)}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    Desembolso médio / mês
                  </span>
                </div>

                <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Concentração Pareto (Top 3)
                  </span>
                  <span className="text-2xl font-extrabold text-blue-300 mt-1 block">
                    {aiDiagnostic.paretoConcentrationPercent.toFixed(1)}%
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    3 maiores despesas
                  </span>
                </div>

                <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Resultado Líquido
                  </span>
                  <span
                    className={`text-2xl font-extrabold mt-1 block ${
                      aiDiagnostic.netResult >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {formatBRL(aiDiagnostic.netResult)}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    Total conciliado
                  </span>
                </div>
              </div>

              {/* Editor do Parecer Executivo do CFO */}
              <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                    <span>📝</span> Parecer Executivo do CFO (Editável):
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Você pode ajustar o texto antes de exportar
                  </span>
                </div>

                <textarea
                  rows={4}
                  value={aiCommentary}
                  onChange={(e) => setAiCommentary(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="Gerando parecer executivo..."
                />

                {/* Destaque das Maiores Despesas (Pareto) */}
                {aiDiagnostic.topExpenseCategories.length > 0 && (
                  <div className="pt-3 border-t border-slate-800/80 space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Ranking dos Maiores Centros de Custo & Despesas:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {aiDiagnostic.topExpenseCategories.map((top, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-200">{top.name}</span>
                            <span className="font-extrabold text-amber-300">
                              {top.sharePercent.toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full"
                              style={{ width: `${top.sharePercent}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 block">
                            Total: {formatBRL(top.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL / BOTTOM SHEET: SELEÇÃO DE ATÉ 3 SÉRIES PARA GRÁFICOS               */}
        {/* ========================================================================= */}
        {showSeriesSelectorModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
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
    </Navigation>
  );
}
