"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import Navigation from "@/components/Navigation";
import MonthSelector from "@/components/MonthSelector";
import Modal from "@/components/ui/Modal";
import { getCompanyAccountLedgerState } from "@/lib/ledger/closures";
import { generateMonthRange, formatMonthToBR } from "@/lib/reports/calculations";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts";

type KpiTab = "health" | "efficiency" | "collection";
type PeriodMode = "single" | "last3" | "last6" | "ytd" | "custom";

type RawTransaction = {
  id: string;
  amount: number;
  date: string;
  category_id: string | null;
  cost_center: string | null;
  is_reconciled: boolean;
  is_internal_transfer: boolean;
  month_ref: string;
};

type RawReceivable = {
  id: string;
  client_name: string;
  amount: number;
  received_amount: number;
  due_date: string;
  received_at: string | null;
  status: "open" | "partial" | "received" | "overdue";
  month_ref: string;
  is_active: boolean;
};

type RawCategory = {
  id: string;
  name: string;
  type: "income" | "expense";
};

type RawCostCenter = {
  id: string;
  name: string;
};

const CHART_COLORS = [
  "#2C1810", // Executive Brown
  "#C5A880", // Warm Gold
  "#059669", // Emerald
  "#D97706", // Amber
  "#DC2626", // Red
  "#2563EB", // Blue
  "#7C3AED", // Purple
  "#0D9488", // Teal
  "#4B5563", // Slate
];

export default function KpisPage() {
  const supabase = createClient();
  const { selectedCompany } = useCompany();

  // Estados de Período e Faixa
  const [periodMode, setPeriodMode] = useState<PeriodMode>("single");

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

  // Controle de Subabas Principais
  const [activeTab, setActiveTab] = useState<KpiTab>("health");
  const [loading, setLoading] = useState(true);

  // Dados brutos
  const [periodTransactions, setPeriodTransactions] = useState<RawTransaction[]>([]);
  const [historicalTransactions, setHistoricalTransactions] = useState<RawTransaction[]>([]);
  const [receivables, setReceivables] = useState<RawReceivable[]>([]);
  const [categories, setCategories] = useState<RawCategory[]>([]);
  const [costCenters, setCostCenters] = useState<RawCostCenter[]>([]);
  const [totalLedgerBalance, setTotalLedgerBalance] = useState(0);
  const [isMonthFullyReconciled, setIsMonthFullyReconciled] = useState(false);

  // Modal de sugestão de indicador
  const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);
  const [suggestionForm, setSuggestionForm] = useState({
    name: "",
    companyName: "",
    indicatorName: "",
    tabCategory: "Saúde Financeira & Liquidez",
    goal: "",
    formula: "",
  });

  // Determinar meses ativos com base no modo selecionado
  const { activeMonths, targetEndMonth, periodLabel } = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonthNum = now.getMonth() + 1;
    const currentMonthStr = `${curYear}-${String(curMonthNum).padStart(2, "0")}`;

    if (periodMode === "single") {
      return {
        activeMonths: [selectedMonth],
        targetEndMonth: selectedMonth,
        periodLabel: formatMonthToBR(selectedMonth),
      };
    }

    if (periodMode === "last3") {
      const d = new Date(curYear, curMonthNum - 3, 1);
      const sM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const range = generateMonthRange(sM, currentMonthStr);
      return {
        activeMonths: range,
        targetEndMonth: currentMonthStr,
        periodLabel: `Últimos 3 Meses (${formatMonthToBR(sM)} a ${formatMonthToBR(currentMonthStr)})`,
      };
    }

    if (periodMode === "last6") {
      const d = new Date(curYear, curMonthNum - 6, 1);
      const sM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const range = generateMonthRange(sM, currentMonthStr);
      return {
        activeMonths: range,
        targetEndMonth: currentMonthStr,
        periodLabel: `Últimos 6 Meses (${formatMonthToBR(sM)} a ${formatMonthToBR(currentMonthStr)})`,
      };
    }

    if (periodMode === "ytd") {
      const sM = `${curYear}-01`;
      const range = generateMonthRange(sM, currentMonthStr);
      return {
        activeMonths: range,
        targetEndMonth: currentMonthStr,
        periodLabel: `Ano Atual / YTD (${formatMonthToBR(sM)} a ${formatMonthToBR(currentMonthStr)})`,
      };
    }

    // Custom range
    const validStart = startMonth <= endMonth ? startMonth : endMonth;
    const validEnd = startMonth <= endMonth ? endMonth : startMonth;
    const range = generateMonthRange(validStart, validEnd);
    return {
      activeMonths: range,
      targetEndMonth: validEnd,
      periodLabel: `${formatMonthToBR(validStart)} a ${formatMonthToBR(validEnd)}`,
    };
  }, [periodMode, selectedMonth, startMonth, endMonth]);

  // Carregar dados de acordo com os meses ativos
  const loadKpiData = useCallback(async () => {
    if (!selectedCompany || activeMonths.length === 0) {
      setPeriodTransactions([]);
      setHistoricalTransactions([]);
      setReceivables([]);
      setCategories([]);
      setCostCenters([]);
      setTotalLedgerBalance(0);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // 1. Categorias e Centros de Custo
      const [catRes, ccRes] = await Promise.all([
        supabase.from("categories").select("id, name, type").eq("company_id", selectedCompany.id),
        supabase.from("cost_centers").select("id, name").eq("company_id", selectedCompany.id),
      ]);

      setCategories((catRes.data as RawCategory[]) || []);
      setCostCenters((ccRes.data as RawCostCenter[]) || []);

      const minMonth = activeMonths[0];
      const maxMonth = activeMonths[activeMonths.length - 1];

      // 2. Transações do período ativo com paginação
      let trxs: RawTransaction[] = [];
      let fromIdx = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("transactions")
          .select("id, amount, date, category_id, cost_center, is_reconciled, is_internal_transfer, month_ref")
          .eq("company_id", selectedCompany.id)
          .gte("month_ref", minMonth)
          .lte("month_ref", maxMonth)
          .range(fromIdx, fromIdx + step - 1);

        if (error || !data || data.length === 0) {
          hasMore = false;
          break;
        }

        trxs = trxs.concat(data as any);
        if (data.length < step) hasMore = false;
        else fromIdx += step;
      }
      setPeriodTransactions(trxs);

      // 3. Transações dos últimos 6 meses adicionais (se necessário para Burn Rate em modo single)
      const [curYear, curMonth] = targetEndMonth.split("-").map(Number);
      const startHistoryDate = new Date(curYear, curMonth - 6, 1);
      const startHistoryMonth = `${startHistoryDate.getFullYear()}-${String(startHistoryDate.getMonth() + 1).padStart(2, "0")}`;

      const { data: histTrxs } = await supabase
        .from("transactions")
        .select("id, amount, date, category_id, cost_center, is_reconciled, is_internal_transfer, month_ref")
        .eq("company_id", selectedCompany.id)
        .gte("month_ref", startHistoryMonth)
        .lte("month_ref", targetEndMonth);

      setHistoricalTransactions((histTrxs as RawTransaction[]) || []);

      // 4. Recebíveis do período
      const { data: recs } = await supabase
        .from("receivables")
        .select("id, client_name, amount, received_amount, due_date, received_at, status, month_ref, is_active")
        .eq("company_id", selectedCompany.id)
        .gte("month_ref", minMonth)
        .lte("month_ref", maxMonth)
        .eq("is_active", true);

      setReceivables((recs as RawReceivable[]) || []);

      // 5. Saldos de Contas via Ledger Pattern (no mês final do período)
      try {
        const ledgerItems = await getCompanyAccountLedgerState(
          supabase,
          selectedCompany.id,
          targetEndMonth
        );
        const totalBal = ledgerItems.reduce((sum, item) => sum + item.currentBalance, 0);
        setTotalLedgerBalance(totalBal);
        const allReconciled = ledgerItems.length > 0 && ledgerItems.every((item) => item.isMonthReconciled && !item.hasHistoricalPendency);
        setIsMonthFullyReconciled(allReconciled);
      } catch (e) {
        console.error("Erro ao carregar ledger no KPI:", e);
      }
    } catch (err) {
      console.error("Erro ao carregar indicadores:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedCompany, activeMonths, targetEndMonth]);

  useEffect(() => {
    loadKpiData();
  }, [loadKpiData]);

  // Pre-fill form when modal opens
  useEffect(() => {
    if (selectedCompany) {
      setSuggestionForm((prev) => ({
        ...prev,
        companyName: selectedCompany.name || "",
      }));
    }
  }, [selectedCompany]);

  // Format helpers
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);
  };

  const formatPct = (val: number) => {
    return `${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  };

  // ==========================================
  // CÁLCULOS DOS INDICADORES (KPIs)
  // ==========================================

  // Transações operacionais (exclui transferências internas)
  const operationalTrxs = useMemo(() => {
    return periodTransactions.filter((t) => !t.is_internal_transfer);
  }, [periodTransactions]);

  const totalIncome = useMemo(() => {
    return operationalTrxs
      .filter((t) => Number(t.amount) > 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [operationalTrxs]);

  const totalExpense = useMemo(() => {
    return operationalTrxs
      .filter((t) => Number(t.amount) < 0)
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  }, [operationalTrxs]);

  const netResult = totalIncome - totalExpense;
  const numMonthsInScope = Math.max(1, activeMonths.length);

  // 1. ABA: Saúde Financeira & Liquidez
  const netMarginPct = totalIncome > 0 ? (netResult / totalIncome) * 100 : 0;

  // Burn Rate Médio Mensal
  const historicalMonthlyExpenses = useMemo(() => {
    const map: Record<string, number> = {};
    const sourceTrxs = activeMonths.length > 1 ? periodTransactions : historicalTransactions;
    sourceTrxs.forEach((t) => {
      if (!t.is_internal_transfer && Number(t.amount) < 0) {
        map[t.month_ref] = (map[t.month_ref] || 0) + Math.abs(Number(t.amount));
      }
    });
    return map;
  }, [activeMonths.length, periodTransactions, historicalTransactions]);

  const burnRateAverage = useMemo(() => {
    const values = Object.values(historicalMonthlyExpenses);
    if (values.length === 0) return totalExpense / numMonthsInScope;
    const sum = values.reduce((acc, v) => acc + v, 0);
    return sum / values.length;
  }, [historicalMonthlyExpenses, totalExpense, numMonthsInScope]);

  // Runway Estimado em Meses
  const runwayMonths = useMemo(() => {
    if (burnRateAverage <= 0) return totalLedgerBalance > 0 ? 99 : 0;
    const months = totalLedgerBalance / burnRateAverage;
    return Math.max(0, months);
  }, [totalLedgerBalance, burnRateAverage]);

  // Ponto de Equilíbrio
  const breakEvenAmount = totalExpense;
  const coverageRatio = totalExpense > 0 ? totalIncome / totalExpense : totalIncome > 0 ? 10 : 1;

  // Gráfico de Tendência Temporal dos Meses Ativos
  const periodEvolutionChartData = useMemo(() => {
    const map: Record<string, { month: string; income: number; expense: number; balance: number }> = {};

    activeMonths.forEach((m) => {
      const [y, mm] = m.split("-");
      const dateObj = new Date(parseInt(y), parseInt(mm) - 1, 1);
      const label = dateObj.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      map[m] = { month: label, income: 0, expense: 0, balance: 0 };
    });

    periodTransactions.forEach((t) => {
      if (t.is_internal_transfer) return;
      const m = t.month_ref;
      if (!map[m]) return;

      const amt = Number(t.amount);
      if (amt > 0) {
        map[m].income += amt;
      } else {
        map[m].expense += Math.abs(amt);
      }
      map[m].balance = map[m].income - map[m].expense;
    });

    return Object.keys(map)
      .sort()
      .map((k) => map[k]);
  }, [activeMonths, periodTransactions]);

  // 2. ABA: Eficiência Operacional & Conciliação
  const totalTrxCount = periodTransactions.length;
  const reconciledTrxCount = periodTransactions.filter((t) => t.is_reconciled || t.is_internal_transfer).length;
  const pendingTrxCount = totalTrxCount - reconciledTrxCount;

  const reconciliationRatePct = totalTrxCount > 0 ? (reconciledTrxCount / totalTrxCount) * 100 : 0;

  const reconciledVolume = useMemo(() => {
    return periodTransactions
      .filter((t) => t.is_reconciled || t.is_internal_transfer)
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  }, [periodTransactions]);

  const totalVolume = useMemo(() => {
    return periodTransactions.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  }, [periodTransactions]);

  const pendingVolume = totalVolume - reconciledVolume;

  // Concentração de Despesas por Centro de Custo
  const costCenterBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    operationalTrxs
      .filter((t) => Number(t.amount) < 0)
      .forEach((t) => {
        const ccName = t.cost_center || "Não especificado";
        map[ccName] = (map[ccName] || 0) + Math.abs(Number(t.amount));
      });

    const entries = Object.entries(map).map(([name, value]) => ({
      name,
      value,
      pct: totalExpense > 0 ? (value / totalExpense) * 100 : 0,
    }));

    entries.sort((a, b) => b.value - a.value);
    return entries;
  }, [operationalTrxs, totalExpense]);

  // Concentração de Despesas por Categoria
  const categoryBreakdown = useMemo(() => {
    const catMapName = new Map(categories.map((c) => [c.id, c.name]));
    const map: Record<string, number> = {};

    operationalTrxs
      .filter((t) => Number(t.amount) < 0)
      .forEach((t) => {
        const name = (t.category_id && catMapName.get(t.category_id)) || "Sem Categoria";
        map[name] = (map[name] || 0) + Math.abs(Number(t.amount));
      });

    const entries = Object.entries(map).map(([name, value]) => ({
      name,
      value,
      pct: totalExpense > 0 ? (value / totalExpense) * 100 : 0,
    }));

    entries.sort((a, b) => b.value - a.value);
    return entries;
  }, [operationalTrxs, categories, totalExpense]);

  // 3. ABA: Ciclo de Cobrança & Clientes
  const totalReceivablesCount = receivables.length;
  const totalReceivablesAmount = useMemo(() => {
    return receivables.reduce((sum, r) => sum + Number(r.amount), 0);
  }, [receivables]);

  const receivedReceivables = useMemo(() => {
    return receivables.filter((r) => r.status === "received" || (r.received_amount && r.received_amount > 0));
  }, [receivables]);

  const overdueReceivables = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return receivables.filter((r) => r.status === "overdue" || (r.status === "open" && r.due_date < today));
  }, [receivables]);

  const overdueAmount = useMemo(() => {
    return overdueReceivables.reduce((sum, r) => sum + Number(r.amount), 0);
  }, [overdueReceivables]);

  const defaultRatePct = totalReceivablesAmount > 0 ? (overdueAmount / totalReceivablesAmount) * 100 : 0;

  const punctualityRatePct = useMemo(() => {
    if (receivedReceivables.length === 0) return 100;
    const paidOnTime = receivedReceivables.filter((r) => {
      if (!r.received_at) return true;
      const recDate = r.received_at.split("T")[0];
      return recDate <= r.due_date;
    }).length;
    return (paidOnTime / receivedReceivables.length) * 100;
  }, [receivedReceivables]);

  // Prazo Médio de Recebimento (DSO) aproximado
  const averageDaysToReceive = useMemo(() => {
    const settledWithDates = receivedReceivables.filter((r) => r.received_at && r.due_date);
    if (settledWithDates.length === 0) return 0;

    let totalDiffDays = 0;
    settledWithDates.forEach((r) => {
      const d1 = new Date(r.due_date).getTime();
      const d2 = new Date(r.received_at!.split("T")[0]).getTime();
      const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
      totalDiffDays += Math.max(0, diff);
    });

    return Math.round(totalDiffDays / settledWithDates.length);
  }, [receivedReceivables]);

  // Ticket Médio por Recebível
  const averageTicket = totalReceivablesCount > 0 ? totalReceivablesAmount / totalReceivablesCount : 0;

  // Concentração de Receita por Cliente (Top Clientes)
  const clientRevenueConcentration = useMemo(() => {
    const map: Record<string, number> = {};
    receivables.forEach((r) => {
      const cName = r.client_name || "Cliente Não Informado";
      map[cName] = (map[cName] || 0) + Number(r.amount);
    });

    const entries = Object.entries(map).map(([name, amount]) => ({
      name,
      amount,
      pct: totalReceivablesAmount > 0 ? (amount / totalReceivablesAmount) * 100 : 0,
    }));

    entries.sort((a, b) => b.amount - a.amount);
    return entries;
  }, [receivables, totalReceivablesAmount]);

  const top3ConcentrationPct = useMemo(() => {
    const top3 = clientRevenueConcentration.slice(0, 3);
    return top3.reduce((sum, c) => sum + c.pct, 0);
  }, [clientRevenueConcentration]);

  // Mensagem formatada em tempo real para o WhatsApp
  const formattedMessage = useMemo(() => {
    return `💡 *SUGESTÃO DE NOVO INDICADOR / KPI*\n\n` +
      `🏢 *Empresa:* ${suggestionForm.companyName || selectedCompany?.name || "Empresa"}\n` +
      `👤 *Solicitante:* ${suggestionForm.name.trim() || "Gestor"}\n` +
      `📂 *Categoria do Indicador:* ${suggestionForm.tabCategory}\n` +
      `🎯 *Nome do Indicador:* *${suggestionForm.indicatorName.trim() || "(Nome do Indicador)"}*\n\n` +
      `📌 *Objetivo / Decisão Apoiada:*\n${suggestionForm.goal.trim() || "Apoiar a tomada de decisão gerencial"}\n\n` +
      `🧮 *Fórmula / Origem dos Dados Sugerida:*\n${suggestionForm.formula.trim() || "A ser definida em conjunto com a equipe Oeco"}\n\n` +
      `_Enviado através do Oeco Start (Painel de Indicadores & KPIs)_`;
  }, [suggestionForm, selectedCompany]);

  const [copied, setCopied] = useState(false);

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(formattedMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Enviar Sugestão ao WhatsApp
  const handleSendSuggestionWhatsApp = () => {
    if (!suggestionForm.indicatorName.trim()) {
      alert("Por favor, preencha o nome do indicador sugerido.");
      return;
    }

    const supportPhone = "5511999999999"; // Fallback / Central Oeco
    const url = `https://wa.me/${supportPhone}?text=${encodeURIComponent(formattedMessage)}`;
    window.open(url, "_blank");
    setIsSuggestionModalOpen(false);
  };

  return (
    <Navigation>
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        {/* Top Header com Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-1">
              <Link href="/dashboard" className="hover:text-primary transition-colors flex items-center gap-1">
                <span>←</span>
                <span>Dashboard</span>
              </Link>
              <span>/</span>
              <span className="text-gray-800">Indicadores & KPIs</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <span>🎯</span>
              <span>Indicadores de Desempenho (KPIs)</span>
            </h1>
            <p className="text-xs md:text-sm text-gray-500 mt-1">
              Inteligência e métricas estratégicas consolidadas a partir das conciliações e fechamentos financeiros.
            </p>
          </div>
        </div>

        {/* BARRA DE SELEÇÃO DE PERÍODO & FAIXAS TEMPORAIS */}
        <div className="bg-white rounded-2xl border border-gray-200 p-3.5 md:p-4 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Atalhos Rápidos de Período */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setPeriodMode("single")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  periodMode === "single"
                    ? "bg-white text-gray-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Mês Específico
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode("last3")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  periodMode === "last3"
                    ? "bg-white text-gray-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Últimos 3 Meses
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode("last6")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  periodMode === "last6"
                    ? "bg-white text-gray-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Últimos 6 Meses
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode("ytd")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  periodMode === "ytd"
                    ? "bg-white text-gray-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Ano Atual (YTD)
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode("custom")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  periodMode === "custom"
                    ? "bg-white text-gray-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Faixa Personalizada
              </button>
            </div>

            {/* Inputs de Data / Seletores conforme o modo */}
            <div className="flex items-center gap-2 flex-wrap">
              {periodMode === "single" && (
                <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
              )}

              {periodMode === "custom" && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500 font-medium">De:</span>
                    <MonthSelector value={startMonth} onChange={setStartMonth} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500 font-medium">Até:</span>
                    <MonthSelector value={endMonth} onChange={setEndMonth} />
                  </div>
                </div>
              )}

              {(periodMode === "last3" || periodMode === "last6" || periodMode === "ytd") && (
                <span className="text-xs font-bold text-gray-700 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                  📅 {periodLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Hero Banner de Status Geral */}
        <div 
          className="bg-gradient-to-r from-[#2C1810] to-[#45271d] text-white rounded-2xl p-5 md:p-6 shadow-md border border-[#2C1810]/20"
          style={{ backgroundColor: "#2C1810" }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider block">
                Empresa Ativa
              </span>
              <p className="text-sm md:text-base font-bold text-white truncate mt-0.5">
                {selectedCompany?.name || "—"}
              </p>
              <span className="text-[10px] text-[#C5A880] font-medium block mt-0.5">
                Segmento: {selectedCompany?.segment === "legal" ? "Jurídico / Advocacia" : "Geral / B2B"}
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider block">
                Resultado do Período
              </span>
              <p className={`text-sm md:text-lg font-extrabold mt-0.5 ${netResult >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {formatCurrency(netResult)}
              </p>
              <span className="text-[10px] text-gray-300 block mt-0.5">
                Margem: <strong className="text-white">{formatPct(netMarginPct)}</strong>
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider block">
                Taxa de Conciliação
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm md:text-lg font-bold text-white">
                  {formatPct(reconciliationRatePct)}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${reconciliationRatePct === 100 ? "bg-emerald-500/30 text-emerald-200 border border-emerald-400/40" : "bg-amber-500/30 text-amber-200 border border-amber-400/40"}`}>
                  {reconciliationRatePct === 100 ? "100% Conciliado" : `${pendingTrxCount} pendente(s)`}
                </span>
              </div>
              <span className="text-[10px] text-gray-300 block mt-0.5">
                {reconciledTrxCount} de {totalTrxCount} transações tratadas
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider block">
                Caixa Consolidado
              </span>
              <p className="text-sm md:text-lg font-extrabold text-white mt-0.5">
                {formatCurrency(totalLedgerBalance)}
              </p>
              <span className="text-[10px] text-gray-300 block mt-0.5">
                Runway: <strong className="text-[#C5A880]">{runwayMonths >= 99 ? "∞" : `${runwayMonths.toFixed(1)} meses`}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* CONTROLE DE SUB-ABAS (UX ESTILO CONFIGURAÇÕES) */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/80 rounded-xl border border-slate-300/60 inline-flex w-full sm:w-auto">
          {/* Aba 1: Saúde Financeira & Liquidez */}
          <button
            type="button"
            onClick={() => setActiveTab("health")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "health"
                ? "bg-white text-[#2C1810] shadow-sm font-extrabold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>🩺</span>
            <span>1. Saúde Financeira & Liquidez</span>
          </button>

          {/* Aba 2: Eficiência Operacional & Conciliação */}
          <button
            type="button"
            onClick={() => setActiveTab("efficiency")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "efficiency"
                ? "bg-white text-[#2C1810] shadow-sm font-extrabold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>⚡</span>
            <span>2. Eficiência & Conciliação</span>
          </button>

          {/* Aba 3: Ciclo de Cobrança & Clientes */}
          <button
            type="button"
            onClick={() => setActiveTab("collection")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "collection"
                ? "bg-white text-[#2C1810] shadow-sm font-extrabold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>👥</span>
            <span>3. Ciclo de Cobrança & Clientes</span>
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="inline-block animate-spin text-3xl mb-3">🔄</div>
            <p className="text-sm font-medium text-gray-500">Calculando indicadores financeiros para {periodLabel}...</p>
          </div>
        ) : (
          <>
            {/* ======================================================== */}
            {/* SUB-ABA 1: SAÚDE FINANCEIRA & LIQUIDEZ */}
            {/* ======================================================== */}
            {activeTab === "health" && (
              <div className="space-y-6">
                {/* Grid de Cards de Indicadores */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Card 1: Margem Operacional Líquida */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between hover:border-[#2C1810]/30 transition-all">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Margem Operacional Líquida
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            netMarginPct >= 20
                              ? "bg-emerald-100 text-emerald-800"
                              : netMarginPct >= 10
                              ? "bg-blue-100 text-blue-800"
                              : netMarginPct >= 0
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {netMarginPct >= 20
                            ? "Excelente"
                            : netMarginPct >= 10
                            ? "Saudável"
                            : netMarginPct >= 0
                            ? "Atenção"
                            : "Crítico"}
                        </span>
                      </div>
                      <p className={`text-2xl md:text-3xl font-extrabold ${netMarginPct >= 0 ? "text-gray-900" : "text-rose-600"}`}>
                        {formatPct(netMarginPct)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Resultado de <strong>{formatCurrency(netResult)}</strong> sobre receitas de <strong>{formatCurrency(totalIncome)}</strong> no período.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                      🎯 <strong>Benchmark:</strong> Margens acima de <strong>20%</strong> conferem alta previsibilidade e capacidade de investimento.
                    </div>
                  </div>

                  {/* Card 2: Burn Rate Mensal Médio */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between hover:border-[#2C1810]/30 transition-all">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Burn Rate Médio (Saídas)
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
                          Média Mensal
                        </span>
                      </div>
                      <p className="text-2xl md:text-3xl font-extrabold text-gray-900">
                        {formatCurrency(burnRateAverage)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Total desembolsado no período: <strong>{formatCurrency(totalExpense)}</strong> ({numMonthsInScope} {numMonthsInScope === 1 ? "mês" : "meses"}).
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                      🔥 <strong>Ritmo de Caixa:</strong> Custo médio para manter a operação em pleno funcionamento a cada 30 dias.
                    </div>
                  </div>

                  {/* Card 3: Runway de Caixa */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between hover:border-[#2C1810]/30 transition-all">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Runway Estimado
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            runwayMonths >= 6
                              ? "bg-emerald-100 text-emerald-800"
                              : runwayMonths >= 3
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {runwayMonths >= 6 ? "Confortável" : runwayMonths >= 3 ? "Moderado" : "Alerta de Caixa"}
                        </span>
                      </div>
                      <p className="text-2xl md:text-3xl font-extrabold text-[#2C1810]">
                        {runwayMonths >= 99 ? "∞" : `${runwayMonths.toFixed(1)} meses`}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Com base no saldo consolidado de <strong>{formatCurrency(totalLedgerBalance)}</strong>.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                      🛡️ <strong>Segurança:</strong> Meses garantidos de sobrevivência operacional mesmo com receita zero.
                    </div>
                  </div>

                  {/* Card 4: Ponto de Equilíbrio (Break-Even) */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between hover:border-[#2C1810]/30 transition-all">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Ponto de Equilíbrio (Break-Even)
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-bold">
                          Meta Mínima
                        </span>
                      </div>
                      <p className="text-2xl md:text-3xl font-extrabold text-gray-900">
                        {formatCurrency(breakEvenAmount)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Faturamento mínimo necessário para cobrir todos os custos do período ({numMonthsInScope} {numMonthsInScope === 1 ? "mês" : "meses"}).
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                      ⚖️ Faturamento atingiu <strong>{formatPct(totalExpense > 0 ? (totalIncome / totalExpense) * 100 : 100)}</strong> do ponto de equilíbrio.
                    </div>
                  </div>

                  {/* Card 5: Índice de Cobertura de Despesas */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between hover:border-[#2C1810]/30 transition-all">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Índice de Cobertura
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            coverageRatio >= 1.2
                              ? "bg-emerald-100 text-emerald-800"
                              : coverageRatio >= 1.0
                              ? "bg-blue-100 text-blue-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {coverageRatio.toFixed(2)}x
                        </span>
                      </div>
                      <p className="text-2xl md:text-3xl font-extrabold text-gray-900">
                        {coverageRatio.toFixed(2)}x
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Para cada <strong>R$ 1,00</strong> gasto, entraram <strong>{formatCurrency(coverageRatio)}</strong>.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                      📈 Relação direta entre receita bruta gerada e despesas operacionais realizadas.
                    </div>
                  </div>

                  {/* Card 6: Saldo Líquido Operacional */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between hover:border-[#2C1810]/30 transition-all">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Saldo Líquido Operacional
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${netResult >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                          {netResult >= 0 ? "Superávit" : "Déficit"}
                        </span>
                      </div>
                      <p className={`text-2xl md:text-3xl font-extrabold ${netResult >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                        {formatCurrency(netResult)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Diferença consolidada de entradas e saídas no escopo ({periodLabel}).
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                      💰 Caixa líquido gerado puramente pelas atividades no período.
                    </div>
                  </div>
                </div>

                {/* Gráfico Temporal de Evolução */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <div>
                      <h3 className="text-base font-bold text-gray-900">Evolução Mensal: Receitas vs Despesas ({periodLabel})</h3>
                      <p className="text-xs text-gray-500">Detalhamento mês a mês dentro do período selecionado.</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-600" /> Receitas</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-500" /> Despesas</span>
                    </div>
                  </div>

                  <div className="h-72 w-full">
                    {periodEvolutionChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={periodEvolutionChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
                          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                          <RechartsTooltip
                            formatter={(value: any) => [formatCurrency(Number(value)), ""]}
                            contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                          />
                          <Bar dataKey="income" name="Receita" fill="#059669" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="expense" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-gray-400">
                        Nenhum dado registrado para o período selecionado.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* SUB-ABA 2: EFICIÊNCIA OPERACIONAL & CONCILIAÇÃO */}
            {/* ======================================================== */}
            {activeTab === "efficiency" && (
              <div className="space-y-6">
                {/* Grid de Cards de Conciliação */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Card 1: Índice de Conciliação */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between hover:border-[#2C1810]/30 transition-all">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Taxa de Conciliação Bancária
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            reconciliationRatePct === 100
                              ? "bg-emerald-100 text-emerald-800"
                              : reconciliationRatePct > 70
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {reconciliationRatePct === 100 ? "100% Plena" : "Em Aberto"}
                        </span>
                      </div>
                      <p className="text-2xl md:text-3xl font-extrabold text-gray-900">
                        {formatPct(reconciliationRatePct)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        <strong>{reconciledTrxCount}</strong> de <strong>{totalTrxCount}</strong> transações conciliadas no período.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                      🔍 <strong>Auditoria:</strong> Garante que as movimentações do extrato possuem lastro e classificação.
                    </div>
                  </div>

                  {/* Card 2: Volume Financeiro Conciliado */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between hover:border-[#2C1810]/30 transition-all">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Volume Reconciliado (R$)
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">
                          Volume Financeiro
                        </span>
                      </div>
                      <p className="text-2xl md:text-3xl font-extrabold text-gray-900">
                        {formatCurrency(reconciledVolume)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        De um total movimentado de <strong>{formatCurrency(totalVolume)}</strong>.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                      💼 Restam <strong>{formatCurrency(pendingVolume)}</strong> em pendências a serem tratadas no extrato.
                    </div>
                  </div>

                  {/* Card 3: Status de Fechamento */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between hover:border-[#2C1810]/30 transition-all">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Status do Fechamento (Ledger)
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isMonthFullyReconciled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                          {isMonthFullyReconciled ? "✓ Mês Fechado" : "⏳ Pendente"}
                        </span>
                      </div>
                      <p className="text-xl md:text-2xl font-extrabold text-gray-900">
                        {isMonthFullyReconciled ? "Contas Conciliadas" : `${pendingTrxCount} Pendência(s)`}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {isMonthFullyReconciled ? "Saldos de todas as contas 100% batidos com extratos." : "Existem lançamentos sem conciliação no período selecionado."}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                      🔒 <strong>Governança:</strong> Fechamentos evitam retrabalho e desvios de saldo contábil.
                    </div>
                  </div>
                </div>

                {/* Seção 2: Concentração de Custos por Centros de Custo e Categorias */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card Centros de Custo */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs">
                    <h3 className="text-sm font-bold text-gray-900 mb-1">
                      Despesas por Centro de Custo ({periodLabel})
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">
                      Identifique as unidades ou áreas que mais consom recursos.
                    </p>

                    {costCenterBreakdown.length > 0 ? (
                      <div className="space-y-3">
                        {costCenterBreakdown.slice(0, 5).map((cc, i) => (
                          <div key={i} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-gray-800 truncate max-w-[200px]">
                                {cc.name}
                              </span>
                              <div className="flex items-center gap-2 font-mono">
                                <span>{formatCurrency(cc.value)}</span>
                                <span className="text-[10px] text-gray-400">({formatPct(cc.pct)})</span>
                              </div>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full bg-[#2C1810] rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, cc.pct)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 py-6 text-center">
                        Nenhum centro de custo associado às despesas deste período.
                      </p>
                    )}
                  </div>

                  {/* Card Categorias de Despesa */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs">
                    <h3 className="text-sm font-bold text-gray-900 mb-1">
                      Top Categorias de Despesa ({periodLabel})
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">
                      Categorias com maior peso no orçamento da empresa.
                    </p>

                    {categoryBreakdown.length > 0 ? (
                      <div className="space-y-3">
                        {categoryBreakdown.slice(0, 5).map((cat, i) => (
                          <div key={i} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-gray-800 truncate max-w-[200px]">
                                {cat.name}
                              </span>
                              <div className="flex items-center gap-2 font-mono">
                                <span>{formatCurrency(cat.value)}</span>
                                <span className="text-[10px] text-gray-400">({formatPct(cat.pct)})</span>
                              </div>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full bg-[#C5A880] rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, cat.pct)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 py-6 text-center">
                        Nenhuma categoria de despesa classificada neste período.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* SUB-ABA 3: CICLO DE COBRANÇA & CLIENTES */}
            {/* ======================================================== */}
            {activeTab === "collection" && (
              <div className="space-y-6">
                {/* Grid de Cards de Cobrança */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Card 1: Prazo Médio de Recebimento (DSO) */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between hover:border-[#2C1810]/30 transition-all">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          DSO Médio
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">
                          Prazo de Liquidação
                        </span>
                      </div>
                      <p className="text-2xl md:text-3xl font-extrabold text-gray-900">
                        {averageDaysToReceive} <span className="text-base font-medium text-gray-500">dias</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Média de dias entre o vencimento e o crédito em conta.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                      ⏱️ Prazos menores aceleram o giro de capital de giro.
                    </div>
                  </div>

                  {/* Card 2: Índice de Inadimplência / Atrasos */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between hover:border-[#2C1810]/30 transition-all">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Taxa de Inadimplência
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            defaultRatePct === 0
                              ? "bg-emerald-100 text-emerald-800"
                              : defaultRatePct < 5
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {defaultRatePct === 0 ? "Zero Atrasos" : `${overdueReceivables.length} vencidos`}
                        </span>
                      </div>
                      <p className={`text-2xl md:text-3xl font-extrabold ${defaultRatePct === 0 ? "text-emerald-700" : "text-rose-600"}`}>
                        {formatPct(defaultRatePct)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        <strong>{formatCurrency(overdueAmount)}</strong> em atraso no período.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                      🚨 <strong>Alerta:</strong> Valores vencidos demandam régua de cobrança rápida via WhatsApp.
                    </div>
                  </div>

                  {/* Card 3: Índice de Pontualidade */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between hover:border-[#2C1810]/30 transition-all">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Pontualidade dos Clientes
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                          No Prazo
                        </span>
                      </div>
                      <p className="text-2xl md:text-3xl font-extrabold text-gray-900">
                        {formatPct(punctualityRatePct)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Recebíveis pagos rigorosamente até a data limite.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                      🤝 Clientes pontuais reduzem custo financeiro e estresse de caixa.
                    </div>
                  </div>

                  {/* Card 4: Ticket Médio por Recebível */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs flex flex-col justify-between hover:border-[#2C1810]/30 transition-all">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Ticket Médio
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-bold">
                          Por Fatura
                        </span>
                      </div>
                      <p className="text-2xl md:text-3xl font-extrabold text-gray-900">
                        {formatCurrency(averageTicket)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Total de <strong>{totalReceivablesCount}</strong> recebíveis faturados no período.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                      📊 Valor médio de contrato ou serviço faturado por item.
                    </div>
                  </div>
                </div>

                {/* Concentração de Clientes (Top Clientes) */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <div>
                      <h3 className="text-base font-bold text-gray-900">Concentração de Faturamento por Cliente ({periodLabel})</h3>
                      <p className="text-xs text-gray-500">
                        Avalie o risco de dependência de clientes. Top 3 clientes representam <strong>{formatPct(top3ConcentrationPct)}</strong> da receita.
                      </p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${top3ConcentrationPct > 60 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
                      {top3ConcentrationPct > 60 ? "⚠️ Alta Concentração (Top 3 > 60%)" : "✓ Carteira Balanceada"}
                    </span>
                  </div>

                  {clientRevenueConcentration.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {clientRevenueConcentration.slice(0, 6).map((c, idx) => (
                        <div key={idx} className="p-3.5 rounded-xl border border-gray-150 bg-slate-50/50 flex flex-col justify-between">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-bold text-gray-800 truncate" title={c.name}>
                              #{idx + 1} {c.name}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-primary bg-white px-1.5 py-0.5 rounded border border-gray-200">
                              {formatPct(c.pct)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[11px] text-gray-400">Total Faturado:</span>
                            <span className="text-xs font-extrabold text-gray-900">{formatCurrency(c.amount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 py-6 text-center">
                      Nenhum recebível faturado para análise de concentração no período selecionado.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* CARD FIXO NO FINAL DA PÁGINA: CTA DE SUGESTÃO DE INDICADOR (ESTILO CONCIERGE / LABORATÓRIO OECO) */}
            {/* ======================================================== */}
            <div 
              className="bg-gradient-to-r from-[#2C1810] via-[#3a2016] to-[#2C1810] text-white border border-[#C5A880]/40 rounded-2xl p-6 md:p-8 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 mt-8 relative overflow-hidden"
              style={{ backgroundColor: "#2C1810", color: "#FFFFFF" }}
            >
              {/* Brilho decorativo sutil de fundo */}
              <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-[#C5A880]/10 rounded-full blur-2xl pointer-events-none" />
              
              <div className="space-y-1.5 text-center md:text-left z-10">
                <h3 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 justify-center md:justify-start">
                  <span>💡</span>
                  <span>Possui uma sugestão de novo indicador?</span>
                </h3>
                <p className="text-xs md:text-sm text-gray-300 max-w-2xl leading-relaxed">
                  Desenvolvemos fórmulas, relatórios e métricas exclusivas sob medida para a realidade de gestão do seu negócio.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsSuggestionModalOpen(true)}
                className="px-6 py-3.5 bg-[#C5A880] hover:bg-[#d6ba94] text-[#2C1810] font-extrabold rounded-xl text-xs md:text-sm shadow-md transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer hover:scale-102 active:scale-98 shrink-0 z-10"
              >
                <span>💡</span>
                <span>Sugerir Novo Indicador</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL MOBILE-FIRST DE SUGESTÃO DE INDICADOR */}
      {/* ======================================================== */}
      <Modal
        isOpen={isSuggestionModalOpen}
        onClose={() => setIsSuggestionModalOpen(false)}
        title="Sugerir Novo Indicador / KPI"
        subtitle="Envie sua sugestão diretamente para a equipe de produto da Oeco"
        icon="💡"
        maxWidth="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsSuggestionModalOpen(false)}
              className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-gray-600 hover:text-gray-900 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSendSuggestionWhatsApp}
              disabled={!suggestionForm.indicatorName.trim()}
              className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>📲</span>
              <span>Enviar via WhatsApp</span>
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                Seu Nome
              </label>
              <input
                type="text"
                value={suggestionForm.name}
                onChange={(e) => setSuggestionForm({ ...suggestionForm, name: e.target.value })}
                placeholder="Ex: João Silva"
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                Empresa
              </label>
              <input
                type="text"
                value={suggestionForm.companyName}
                onChange={(e) => setSuggestionForm({ ...suggestionForm, companyName: e.target.value })}
                placeholder="Ex: Minha Empresa Ltda"
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-1">
              Categoria / Aba Sugerida *
            </label>
            <select
              value={suggestionForm.tabCategory}
              onChange={(e) => setSuggestionForm({ ...suggestionForm, tabCategory: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white font-medium text-gray-800"
            >
              <option value="Saúde Financeira & Liquidez">1. Saúde Financeira & Liquidez</option>
              <option value="Eficiência Operacional & Conciliação">2. Eficiência Operacional & Conciliação</option>
              <option value="Ciclo de Cobrança & Clientes">3. Ciclo de Cobrança & Clientes</option>
              <option value="Outro Eixo / Métrica Personalizada">4. Outro Eixo / Métrica Personalizada</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-1">
              Nome do Indicador Sugerido *
            </label>
            <input
              type="text"
              value={suggestionForm.indicatorName}
              onChange={(e) => setSuggestionForm({ ...suggestionForm, indicatorName: e.target.value })}
              placeholder="Ex: CAC, Margem de Contribuição por Linha, LTV, DPO..."
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-medium"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-1">
              Objetivo / Decisão que esse indicador apoia
            </label>
            <textarea
              rows={2}
              value={suggestionForm.goal}
              onChange={(e) => setSuggestionForm({ ...suggestionForm, goal: e.target.value })}
              placeholder="Ex: Saber quando podemos contratar novos colaboradores com segurança..."
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-1">
              Fórmula ou dados necessários (Opcional)
            </label>
            <input
              type="text"
              value={suggestionForm.formula}
              onChange={(e) => setSuggestionForm({ ...suggestionForm, formula: e.target.value })}
              placeholder="Ex: Dividir as despesas de marketing pelo número de clientes novos faturados..."
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>

          {/* Prévia da Mensagem Formatada em Tempo Real */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600">
                Prévia da Mensagem Estruturada
              </label>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{copied ? "✓ Copiado!" : "📋 Copiar Mensagem"}</span>
              </button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto overscroll-contain">
              {formattedMessage}
            </div>
          </div>
        </div>
      </Modal>
    </Navigation>
  );
}
