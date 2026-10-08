"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import Navigation from "@/components/Navigation";
import MonthSelector from "@/components/MonthSelector";
import { generateMonthRange, formatMonthToBR } from "@/lib/reports/calculations";
import {
  CardTerminal,
  CardRateRule,
  CardSale,
  CardInstallment,
  PaymentMethod,
  CardBrand,
  Acquirer,
  ACQUIRER_LABELS,
  PAYMENT_METHOD_LABELS,
  BRAND_LABELS,
  calculateSaleInstallments,
  findMatchingRateRule,
  calculateAnticipation,
} from "@/lib/cards";

type PeriodMode = "single" | "last3" | "last6" | "ytd" | "custom";

export default function CardsPage() {
  const supabase = createClient();
  const { selectedCompany } = useCompany();

  // Estados principais
  const [activeTab, setActiveTab] = useState<"schedule" | "sales" | "terminals" | "analytics">("schedule");
  
  // Estados de Período e Faixa (Modelo KPIs)
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

  const [loading, setLoading] = useState(true);
  const [terminals, setTerminals] = useState<CardTerminal[]>([]);
  const [rateRules, setRateRules] = useState<CardRateRule[]>([]);
  const [sales, setSales] = useState<CardSale[]>([]);
  const [installments, setInstallments] = useState<CardInstallment[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  // Modais
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [selectedTerminalForRates, setSelectedTerminalForRates] = useState<CardTerminal | null>(null);

  // Estados para Liquidação Bancária & Vínculo com Fluxo de Caixa (Fase 3)
  const [selectedInstallmentIds, setSelectedInstallmentIds] = useState<string[]>([]);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementForm, setSettlementForm] = useState({
    bank_account_id: "",
    settlement_date: new Date().toISOString().split("T")[0],
    create_transaction: true,
    notes: "",
  });
  const [settling, setSettling] = useState(false);

  // Estados para Auto-Conciliação Bancária
  const [isAutoReconcileModalOpen, setIsAutoReconcileModalOpen] = useState(false);
  const [autoReconciling, setAutoReconciling] = useState(false);
  const [autoReconcileReport, setAutoReconcileReport] = useState<any>(null);

  // Estados para Antecipação de Recebíveis (Fase 4)
  const [isAnticipationModalOpen, setIsAnticipationModalOpen] = useState(false);
  const [anticipationMonthlyRate, setAnticipationMonthlyRate] = useState("1.89");
  const [anticipationDate, setAnticipationDate] = useState(new Date().toISOString().split("T")[0]);
  const [anticipationBankId, setAnticipationBankId] = useState("");
  const [anticipationNotes, setAnticipationNotes] = useState("");
  const [anticipating, setAnticipating] = useState(false);

  // Estados para Cancelamento & Chargeback (Fase 4)
  const [isChargebackModalOpen, setIsChargebackModalOpen] = useState(false);
  const [selectedSaleForChargeback, setSelectedSaleForChargeback] = useState<CardSale | null>(null);
  const [chargebackAction, setChargebackAction] = useState<"cancel" | "chargeback">("chargeback");
  const [chargebackReason, setChargebackReason] = useState("");
  const [chargebackSubmitting, setChargebackSubmitting] = useState(false);

  // Estados de formulário para Terminal e Edição
  const [editingTerminal, setEditingTerminal] = useState<CardTerminal | null>(null);
  const [terminalForm, setTerminalForm] = useState({
    name: "",
    acquirer: "stone" as Acquirer,
    bank_account_id: "",
    is_active: true,
  });
  const [terminalRatesForm, setTerminalRatesForm] = useState<
    Array<{
      id?: string;
      payment_method: PaymentMethod;
      brand: string;
      min_installments: number;
      max_installments: number;
      mdr_percentage: number;
      settlement_days: number;
    }>
  >([]);

function HelpTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center ml-1.5 align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setShow(!show);
        }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="w-4 h-4 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 text-[10px] font-bold inline-flex items-center justify-center cursor-help transition-all shadow-xs"
        aria-label="Ajuda"
      >
        ?
      </button>
      {show && (
        <>
          {/* Overlay invisível para fechar ao tocar fora no mobile */}
          <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setShow(false)} />
          <span className="fixed sm:absolute bottom-4 sm:bottom-full left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:mb-2 max-w-sm sm:w-64 p-3 bg-gray-900/95 backdrop-blur-xs text-white text-[11px] font-normal leading-relaxed rounded-xl shadow-2xl z-50 border border-gray-700 animate-in fade-in zoom-in-95 duration-150 pointer-events-auto">
            <div className="flex items-start justify-between gap-2">
              <span>{text}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShow(false);
                }}
                className="sm:hidden text-gray-400 hover:text-white font-bold text-xs ml-1"
              >
                ✕
              </button>
            </div>
            <span className="hidden sm:block absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900/95" />
          </span>
        </>
      )}
    </span>
  );
}

  // Estados de formulário para Venda Manual
  const [saleForm, setSaleForm] = useState({
    terminal_id: "",
    sale_date: new Date().toISOString().substring(0, 16),
    gross_amount: "",
    payment_method: "credit_installment" as PaymentMethod,
    brand: "mastercard",
    installments_count: 3,
    card_last_digits: "",
    nsu: "",
    doc_number: "",
    authorization_code: "",
    customer_name: "",
    notes: "",
  });

  // Estados para OCR
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados para Importação CSV
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvTerminalId, setCsvTerminalId] = useState("");
  const [csvParsing, setCsvParsing] = useState(false);
  const [csvReport, setCsvReport] = useState<any>(null);

  // Filtro de Auditoria para Vendas
  const [salesFilter, setSalesFilter] = useState<"all" | "verified" | "divergence" | "pending">("all");

  // Determinar meses ativos com base no modo de período selecionado (Modelo KPIs)
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
        periodLabel: `Ano Atual YTD (${formatMonthToBR(sM)} a ${formatMonthToBR(currentMonthStr)})`,
      };
    }

    // Custom
    let sM = startMonth;
    let eM = endMonth;
    if (sM > eM) {
      const tmp = sM;
      sM = eM;
      eM = tmp;
    }
    const range = generateMonthRange(sM, eM);
    return {
      activeMonths: range,
      targetEndMonth: eM,
      periodLabel: `${formatMonthToBR(sM)} a ${formatMonthToBR(eM)}`,
    };
  }, [periodMode, selectedMonth, startMonth, endMonth]);

  // Carregar dados
  const fetchData = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);

    const minMonth = activeMonths[0] || selectedMonth;
    const maxMonth = activeMonths[activeMonths.length - 1] || selectedMonth;

    try {
      // 1. Maquininhas
      const { data: termData } = await supabase
        .from("card_terminals")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .order("name");

      setTerminals(termData || []);

      // 2. Regras de taxas
      const { data: rulesData } = await supabase
        .from("card_rate_rules")
        .select("*")
        .eq("company_id", selectedCompany.id);

      setRateRules(rulesData || []);

      // 3. Contas bancárias
      const { data: banksData } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("company_id", selectedCompany.id);

      setBankAccounts(banksData || []);

      // 4. Vendas do período
      const { data: salesData } = await supabase
        .from("card_sales")
        .select("*, terminal:card_terminals(id, name, acquirer)")
        .eq("company_id", selectedCompany.id)
        .gte("month_ref", minMonth)
        .lte("month_ref", maxMonth)
        .order("sale_date", { ascending: false });

      setSales((salesData as any) || []);

      // 5. Parcelas da agenda do período selecionado
      const { data: instData } = await supabase
        .from("card_installments")
        .select("*, sale:card_sales(*, terminal:card_terminals(id, name, acquirer))")
        .eq("company_id", selectedCompany.id)
        .gte("month_ref", minMonth)
        .lte("month_ref", maxMonth)
        .order("expected_date", { ascending: true });

      setInstallments((instData as any) || []);
    } catch (err) {
      console.error("Erro ao carregar dados do módulo de cartões:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, activeMonths, selectedMonth, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Cálculos de KPIs da Agenda do Mês
  const kpis = useMemo(() => {
    const totalGross = installments.reduce((acc, i) => acc + Number(i.gross_amount), 0);
    const totalFee = installments.reduce((acc, i) => acc + Number(i.fee_amount), 0);
    const totalNet = installments.reduce((acc, i) => acc + Number(i.net_amount), 0);
    const totalSettled = installments
      .filter((i) => i.status === "settled")
      .reduce((acc, i) => acc + Number(i.net_amount), 0);
    const totalPending = totalNet - totalSettled;
    const effectiveFeePercent = totalGross > 0 ? ((totalFee / totalGross) * 100).toFixed(2) : "0.00";

    // Métricas de Auditoria
    const totalFeeDifference = sales.reduce((acc, s) => acc + Number(s.fee_difference_amount || 0), 0);
    const verifiedSalesCount = sales.filter((s) => s.audit_status === "verified").length;
    const divergenceSalesCount = sales.filter((s) => s.audit_status === "divergence").length;

    return {
      totalGross,
      totalFee,
      totalNet,
      totalSettled,
      totalPending,
      effectiveFeePercent,
      totalFeeDifference,
      verifiedSalesCount,
      divergenceSalesCount,
    };
  }, [installments, sales]);

  // Vendas filtradas por status de auditoria
  const filteredSales = useMemo(() => {
    if (salesFilter === "all") return sales;
    if (salesFilter === "pending") {
      return sales.filter((s) => !s.audit_status || s.audit_status === "pending");
    }
    return sales.filter((s) => s.audit_status === salesFilter);
  }, [sales, salesFilter]);

  // Analytics e Estatísticas Comparativas da Empresa (Fase 4)
  const analytics = useMemo(() => {
    const totalGross = sales.reduce((acc, s) => acc + Number(s.gross_amount), 0);
    const totalFees = sales.reduce((acc, s) => acc + Number(s.real_fee_amount || s.total_fee_amount), 0);
    const totalNet = sales.reduce((acc, s) => acc + Number(s.net_amount), 0);
    const totalFeeDiff = sales.reduce((acc, s) => acc + Number(s.fee_difference_amount || 0), 0);
    const averageFeeRate = totalGross > 0 ? (totalFees / totalGross) * 100 : 0;

    // 1. Agrupamento por Maquininha
    const terminalMap: Record<
      string,
      {
        terminalId: string;
        name: string;
        acquirer: Acquirer;
        totalGross: number;
        totalFees: number;
        salesCount: number;
        divergenceCount: number;
        feeDifference: number;
      }
    > = {};

    sales.forEach((s) => {
      const tId = s.terminal_id || "unknown";
      if (!terminalMap[tId]) {
        terminalMap[tId] = {
          terminalId: tId,
          name: s.terminal?.name || "Sem Maquininha",
          acquirer: (s.terminal?.acquirer || "other") as Acquirer,
          totalGross: 0,
          totalFees: 0,
          salesCount: 0,
          divergenceCount: 0,
          feeDifference: 0,
        };
      }
      terminalMap[tId].totalGross += Number(s.gross_amount);
      terminalMap[tId].totalFees += Number(s.real_fee_amount || s.total_fee_amount);
      terminalMap[tId].salesCount += 1;
      if (s.audit_status === "divergence" || (s.fee_difference_amount || 0) > 0) {
        terminalMap[tId].divergenceCount += 1;
        terminalMap[tId].feeDifference += Number(s.fee_difference_amount || 0);
      }
    });

    const terminalStats = Object.values(terminalMap)
      .map((t) => ({
        ...t,
        effectiveFeeRate: t.totalGross > 0 ? (t.totalFees / t.totalGross) * 100 : 0,
      }))
      .sort((a, b) => a.effectiveFeeRate - b.effectiveFeeRate);

    // 2. Agrupamento por Modalidade
    const methodMap: Record<string, number> = {};
    sales.forEach((s) => {
      methodMap[s.payment_method] = (methodMap[s.payment_method] || 0) + Number(s.gross_amount);
    });
    const methodStats = Object.entries(methodMap)
      .map(([method, amount]) => ({
        method: method as PaymentMethod,
        label: PAYMENT_METHOD_LABELS[method as PaymentMethod] || method,
        amount,
        percentage: totalGross > 0 ? (amount / totalGross) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // 3. Agrupamento por Bandeira
    const brandMap: Record<string, number> = {};
    sales.forEach((s) => {
      const b = s.brand || "other";
      brandMap[b] = (brandMap[b] || 0) + Number(s.gross_amount);
    });
    const brandStats = Object.entries(brandMap)
      .map(([brand, amount]) => ({
        brand,
        label: BRAND_LABELS[brand] || brand,
        amount,
        percentage: totalGross > 0 ? (amount / totalGross) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalGross,
      totalFees,
      totalNet,
      totalFeeDiff,
      averageFeeRate,
      terminalStats,
      methodStats,
      brandStats,
      cheapestTerminal: terminalStats[0] || null,
    };
  }, [sales]);

  // Ação: Importar Extrato CSV da Maquininha
  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !csvFile || !csvTerminalId) {
      alert("Selecione o arquivo CSV e a maquininha.");
      return;
    }

    setCsvParsing(true);
    setCsvReport(null);

    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      formData.append("terminal_id", csvTerminalId);
      formData.append("company_id", selectedCompany.id);

      const res = await fetch("/api/cards/import-statement", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.report) {
        setCsvReport(data.report);
        fetchData();
      } else {
        alert(data.error || "Erro ao importar extrato.");
      }
    } catch (err: any) {
      alert("Erro na importação: " + err.message);
    } finally {
      setCsvParsing(false);
    }
  };

  // Ação: Abrir Modal para Nova Maquininha
  const handleOpenNewTerminalModal = () => {
    setEditingTerminal(null);
    setTerminalForm({
      name: "",
      acquirer: "stone" as Acquirer,
      bank_account_id: "",
      is_active: true,
    });
    setTerminalRatesForm([
      {
        payment_method: "debit",
        brand: "all",
        min_installments: 1,
        max_installments: 1,
        mdr_percentage: 1.2,
        settlement_days: 1,
      },
      {
        payment_method: "credit_cash",
        brand: "all",
        min_installments: 1,
        max_installments: 1,
        mdr_percentage: 2.5,
        settlement_days: 30,
      },
      {
        payment_method: "credit_installment",
        brand: "all",
        min_installments: 2,
        max_installments: 6,
        mdr_percentage: 3.5,
        settlement_days: 30,
      },
      {
        payment_method: "credit_installment",
        brand: "all",
        min_installments: 7,
        max_installments: 12,
        mdr_percentage: 4.5,
        settlement_days: 30,
      },
    ]);
    setIsTerminalModalOpen(true);
  };

  // Ação: Abrir Modal para Editar Maquininha e suas Taxas
  const handleOpenEditTerminalModal = (term: CardTerminal) => {
    setEditingTerminal(term);
    setTerminalForm({
      name: term.name,
      acquirer: term.acquirer,
      bank_account_id: term.bank_account_id || "",
      is_active: term.is_active,
    });
    const termRules = rateRules.filter((r) => r.terminal_id === term.id);
    if (termRules.length > 0) {
      setTerminalRatesForm(
        termRules.map((r) => ({
          id: r.id,
          payment_method: r.payment_method,
          brand: r.brand || "all",
          min_installments: r.min_installments,
          max_installments: r.max_installments,
          mdr_percentage: Number(r.mdr_percentage),
          settlement_days: Number(r.settlement_days),
        }))
      );
    } else {
      setTerminalRatesForm([
        {
          payment_method: "debit",
          brand: "all",
          min_installments: 1,
          max_installments: 1,
          mdr_percentage: 1.2,
          settlement_days: 1,
        },
        {
          payment_method: "credit_cash",
          brand: "all",
          min_installments: 1,
          max_installments: 1,
          mdr_percentage: 2.5,
          settlement_days: 30,
        },
        {
          payment_method: "credit_installment",
          brand: "all",
          min_installments: 2,
          max_installments: 6,
          mdr_percentage: 3.5,
          settlement_days: 30,
        },
        {
          payment_method: "credit_installment",
          brand: "all",
          min_installments: 7,
          max_installments: 12,
          mdr_percentage: 4.5,
          settlement_days: 30,
        },
      ]);
    }
    setIsTerminalModalOpen(true);
  };

  // Ação: Salvar ou Atualizar Maquininha e suas Taxas MDR
  const handleSaveTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    try {
      let terminalId = editingTerminal?.id;

      if (editingTerminal) {
        // 1. Atualizar dados cadastrais da maquininha
        const { error: termError } = await supabase
          .from("card_terminals")
          .update({
            name: terminalForm.name,
            acquirer: terminalForm.acquirer,
            bank_account_id: terminalForm.bank_account_id || null,
            is_active: terminalForm.is_active,
          })
          .eq("id", editingTerminal.id);

        if (termError) {
          alert("Erro ao atualizar maquininha: " + termError.message);
          return;
        }

        // 2. Limpar regras anteriores e reinserir as atualizadas
        await supabase.from("card_rate_rules").delete().eq("terminal_id", editingTerminal.id);
      } else {
        // 1. Inserir nova maquininha
        const { data: newTerm, error: termError } = await supabase
          .from("card_terminals")
          .insert({
            company_id: selectedCompany.id,
            name: terminalForm.name,
            acquirer: terminalForm.acquirer,
            bank_account_id: terminalForm.bank_account_id || null,
            is_active: terminalForm.is_active,
          })
          .select()
          .single();

        if (termError) {
          alert("Erro ao cadastrar maquininha: " + termError.message);
          return;
        }
        terminalId = newTerm.id;
      }

      // 3. Salvar as regras de taxas MDR
      if (terminalId && terminalRatesForm.length > 0) {
        const rulesToInsert = terminalRatesForm.map((rule) => ({
          company_id: selectedCompany.id,
          terminal_id: terminalId,
          payment_method: rule.payment_method,
          brand: rule.brand || "all",
          min_installments: Number(rule.min_installments),
          max_installments: Number(rule.max_installments),
          mdr_percentage: Number(rule.mdr_percentage),
          settlement_days: Number(rule.settlement_days),
        }));

        await supabase.from("card_rate_rules").insert(rulesToInsert);
      }

      setIsTerminalModalOpen(false);
      setEditingTerminal(null);
      fetchData();
    } catch (err: any) {
      alert("Erro ao salvar dados da maquininha: " + err.message);
    }
  };

  // Ação: Excluir Maquininha
  const handleDeleteTerminal = async (termId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta maquininha? As regras de taxas associadas serão removidas.")) {
      return;
    }

    const { error } = await supabase.from("card_terminals").delete().eq("id", termId);
    if (error) {
      alert("Erro ao excluir maquininha: " + error.message);
    } else {
      setIsTerminalModalOpen(false);
      setEditingTerminal(null);
      fetchData();
    }
  };

  // Ação: Salvar Venda Manual
  const handleSaveManualSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    const gross = parseFloat(saleForm.gross_amount.replace(",", "."));
    if (isNaN(gross) || gross <= 0) {
      alert("Informe um valor bruto válido.");
      return;
    }

    const termRules = rateRules.filter((r) => r.terminal_id === saleForm.terminal_id);
    const matchedRule = findMatchingRateRule(
      termRules,
      saleForm.payment_method,
      saleForm.installments_count,
      saleForm.brand
    );

    const saleDateObj = new Date(saleForm.sale_date);
    const calculated = calculateSaleInstallments({
      grossAmount: gross,
      paymentMethod: saleForm.payment_method,
      installmentsCount: saleForm.installments_count,
      saleDate: saleDateObj,
      rateRule: matchedRule,
    });

    const monthRef = saleDateObj.toISOString().substring(0, 7);

    // 1. Inserir a venda
    const { data: createdSale, error: saleError } = await supabase
      .from("card_sales")
      .insert({
        company_id: selectedCompany.id,
        terminal_id: saleForm.terminal_id,
        sale_date: saleDateObj.toISOString(),
        gross_amount: calculated.gross_amount,
        net_amount: calculated.net_amount,
        total_fee_amount: calculated.total_fee_amount,
        payment_method: saleForm.payment_method,
        brand: saleForm.brand,
        installments_count: saleForm.payment_method === "credit_installment" ? saleForm.installments_count : 1,
        authorization_code: saleForm.authorization_code || null,
        nsu: saleForm.nsu || null,
        doc_number: saleForm.doc_number || null,
        card_last_digits: saleForm.card_last_digits || null,
        customer_name: saleForm.customer_name || null,
        entry_source: "manual",
        notes: saleForm.notes || null,
        month_ref: monthRef,
        status: "pending",
      })
      .select()
      .single();

    if (saleError) {
      alert("Erro ao registrar venda: " + saleError.message);
      return;
    }

    // 2. Inserir as parcelas
    const installmentsToInsert = calculated.installments.map((inst) => ({
      company_id: selectedCompany.id,
      sale_id: createdSale.id,
      installment_number: inst.installment_number,
      total_installments: inst.total_installments,
      gross_amount: inst.gross_amount,
      fee_amount: inst.fee_amount,
      net_amount: inst.net_amount,
      expected_date: inst.expected_date,
      month_ref: inst.month_ref,
      status: "scheduled",
    }));

    await supabase.from("card_installments").insert(installmentsToInsert);

    setIsSaleModalOpen(false);
    setSaleForm({
      terminal_id: terminals[0]?.id || "",
      sale_date: new Date().toISOString().substring(0, 16),
      gross_amount: "",
      payment_method: "credit_installment",
      brand: "mastercard",
      installments_count: 3,
      card_last_digits: "",
      nsu: "",
      doc_number: "",
      authorization_code: "",
      customer_name: "",
      notes: "",
    });
    fetchData();
  };

  // Ação: Processar Imagem do Canhoto (OCR)
  const handleOcrFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrFile(file);
    setOcrPreviewUrl(URL.createObjectURL(file));
    setOcrLoading(true);
    setOcrResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("terminal_hint", terminals[0]?.acquirer || "stone");

    try {
      const res = await fetch("/api/cards/ocr-receipt", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.data) {
        setOcrResult(data.data);
      } else {
        alert(data.error || "Não foi possível extrair dados da imagem.");
      }
    } catch (err: any) {
      alert("Erro ao processar imagem: " + err.message);
    } finally {
      setOcrLoading(false);
    }
  };

  // Confirmar Lançamento do OCR
  const handleConfirmOcrSale = async () => {
    if (!selectedCompany || !ocrResult) return;

    // Encontrar terminal correspondente ou o primeiro ativo
    const selectedTerminalId =
      ocrResult.terminal_id ||
      terminals.find((t) => t.acquirer.toLowerCase() === (ocrResult.acquirer || "").toLowerCase())?.id ||
      terminals[0]?.id;

    if (!selectedTerminalId) {
      alert("Por favor, cadastre uma maquininha antes de salvar a venda.");
      return;
    }

    const gross = Number(ocrResult.gross_amount) || 0;
    const installmentsCount = Number(ocrResult.installments_count) || 1;
    const paymentMethod: PaymentMethod = ocrResult.payment_method || (installmentsCount > 1 ? "credit_installment" : "credit_cash");
    const brand = ocrResult.brand || "other";
    const saleDateObj = ocrResult.sale_date ? new Date(ocrResult.sale_date) : new Date();

    const termRules = rateRules.filter((r) => r.terminal_id === selectedTerminalId);
    const matchedRule = findMatchingRateRule(termRules, paymentMethod, installmentsCount, brand);

    const calculated = calculateSaleInstallments({
      grossAmount: gross,
      paymentMethod,
      installmentsCount,
      saleDate: saleDateObj,
      rateRule: matchedRule,
    });

    const monthRef = saleDateObj.toISOString().substring(0, 7);

    // Salvar venda
    const { data: createdSale, error: saleError } = await supabase
      .from("card_sales")
      .insert({
        company_id: selectedCompany.id,
        terminal_id: selectedTerminalId,
        sale_date: saleDateObj.toISOString(),
        gross_amount: calculated.gross_amount,
        net_amount: calculated.net_amount,
        total_fee_amount: calculated.total_fee_amount,
        payment_method: paymentMethod,
        brand: brand,
        installments_count: installmentsCount,
        authorization_code: ocrResult.authorization_code || null,
        nsu: ocrResult.nsu || null,
        doc_number: ocrResult.doc_number || null,
        card_last_digits: ocrResult.card_last_digits || null,
        terminal_serial: ocrResult.terminal_serial || null,
        notes: ocrResult.notes || null,
        entry_source: "ocr_receipt",
        month_ref: monthRef,
        status: "pending",
      })
      .select()
      .single();

    if (saleError) {
      alert("Erro ao salvar: " + saleError.message);
      return;
    }

    // Salvar parcelas
    const installmentsToInsert = calculated.installments.map((inst) => ({
      company_id: selectedCompany.id,
      sale_id: createdSale.id,
      installment_number: inst.installment_number,
      total_installments: inst.total_installments,
      gross_amount: inst.gross_amount,
      fee_amount: inst.fee_amount,
      net_amount: inst.net_amount,
      expected_date: inst.expected_date,
      month_ref: inst.month_ref,
      status: "scheduled",
    }));

    await supabase.from("card_installments").insert(installmentsToInsert);

    setIsOcrModalOpen(false);
    setOcrFile(null);
    setOcrPreviewUrl(null);
    setOcrResult(null);
    fetchData();
  };

  // Ação: Abrir Modal de Liquidação Bancária
  const handleOpenSettlementModal = (installmentIds: string[]) => {
    if (installmentIds.length === 0) return;

    setSelectedInstallmentIds(installmentIds);

    // Encontrar maquininha da primeira parcela para sugerir a conta bancária padrão
    const firstInst = installments.find((i) => i.id === installmentIds[0]);
    const termId = firstInst?.sale?.terminal_id;
    const term = terminals.find((t) => t.id === termId);
    const suggestedBankId = term?.bank_account_id || bankAccounts[0]?.id || "";

    const suggestedDate = firstInst?.expected_date || new Date().toISOString().split("T")[0];

    setSettlementForm({
      bank_account_id: suggestedBankId,
      settlement_date: suggestedDate,
      create_transaction: true,
      notes: "",
    });

    setIsSettlementModalOpen(true);
  };

  // Ação: Executar Liquidação Bancária e Criar Entrada no Fluxo de Caixa
  const handleExecuteSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || selectedInstallmentIds.length === 0) return;

    setSettling(true);
    try {
      const res = await fetch("/api/cards/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompany.id,
          installment_ids: selectedInstallmentIds,
          bank_account_id: settlementForm.bank_account_id,
          settlement_date: settlementForm.settlement_date,
          create_transaction: settlementForm.create_transaction,
          notes: settlementForm.notes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsSettlementModalOpen(false);
        setSelectedInstallmentIds([]);
        fetchData();
      } else {
        alert(data.error || "Erro ao liquidar parcelas.");
      }
    } catch (err: any) {
      alert("Erro na liquidação: " + err.message);
    } finally {
      setSettling(false);
    }
  };

  // Ação: Desfazer Liquidação de Parcela
  const handleUndoSettlement = async (inst: CardInstallment) => {
    if (!confirm("Deseja desfazer a liquidação desta parcela e retorná-la para Agendada?")) {
      return;
    }

    // 1. Se houver transação vinculada, remove a transação para manter integridade
    if (inst.linked_transaction_id) {
      await supabase.from("transactions").delete().eq("id", inst.linked_transaction_id);
    }

    // 2. Retorna parcela para scheduled
    await supabase
      .from("card_installments")
      .update({
        status: "scheduled",
        settled_date: null,
        settled_bank_account_id: null,
        linked_transaction_id: null,
        settlement_notes: null,
      })
      .eq("id", inst.id);

    fetchData();
  };

  // Ação: Auto-Conciliar com Extrato Bancário
  const handleAutoReconcileBank = async () => {
    if (!selectedCompany) return;

    setAutoReconciling(true);
    setAutoReconcileReport(null);

    try {
      const res = await fetch("/api/cards/auto-reconcile-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompany.id,
          month_ref: targetEndMonth,
        }),
      });

      const data = await res.json();
      if (data.success && data.report) {
        setAutoReconcileReport(data.report);
        setIsAutoReconcileModalOpen(true);
        fetchData();
      } else {
        alert(data.error || "Nenhum depósito correspondente encontrado no extrato bancário deste mês.");
      }
    } catch (err: any) {
      alert("Erro na auto-conciliação: " + err.message);
    } finally {
      setAutoReconciling(false);
    }
  };

  // Ação: Abrir Modal de Antecipação de Recebíveis (Fase 4)
  const handleOpenAnticipationModal = (instIds: string[]) => {
    if (instIds.length === 0) {
      alert("Selecione pelo menos uma parcela agendada para simular a antecipação.");
      return;
    }
    setSelectedInstallmentIds(instIds);

    const firstInst = installments.find((i) => i.id === instIds[0]);
    const termId = firstInst?.sale?.terminal_id;
    const term = terminals.find((t) => t.id === termId);
    const suggestedBankId = term?.bank_account_id || bankAccounts[0]?.id || "";

    setAnticipationBankId(suggestedBankId);
    setAnticipationMonthlyRate("1.89");
    setAnticipationDate(new Date().toISOString().split("T")[0]);
    setAnticipationNotes("");
    setIsAnticipationModalOpen(true);
  };

  // Ação: Executar Antecipação de Recebíveis (Fase 4)
  const handleExecuteAnticipation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || selectedInstallmentIds.length === 0 || !anticipationBankId) return;

    setAnticipating(true);
    try {
      const res = await fetch("/api/cards/anticipate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompany.id,
          installment_ids: selectedInstallmentIds,
          monthly_rate_percentage: parseFloat(anticipationMonthlyRate.replace(",", ".")),
          bank_account_id: anticipationBankId,
          anticipation_date: anticipationDate,
          notes: anticipationNotes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsAnticipationModalOpen(false);
        setSelectedInstallmentIds([]);
        fetchData();
      } else {
        alert(data.error || "Erro ao efetivar antecipação.");
      }
    } catch (err: any) {
      alert("Erro na antecipação: " + err.message);
    } finally {
      setAnticipating(false);
    }
  };

  // Ação: Abrir Modal de Cancelamento / Chargeback (Fase 4)
  const handleOpenChargebackModal = (sale: CardSale, action: "cancel" | "chargeback") => {
    setSelectedSaleForChargeback(sale);
    setChargebackAction(action);
    setChargebackReason("");
    setIsChargebackModalOpen(true);
  };

  // Ação: Executar Cancelamento / Chargeback (Fase 4)
  const handleExecuteChargeback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !selectedSaleForChargeback) return;

    setChargebackSubmitting(true);
    try {
      const res = await fetch("/api/cards/chargeback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompany.id,
          sale_id: selectedSaleForChargeback.id,
          action: chargebackAction,
          reason: chargebackReason,
          date: new Date().toISOString().split("T")[0],
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsChargebackModalOpen(false);
        setSelectedSaleForChargeback(null);
        fetchData();
      } else {
        alert(data.error || "Erro ao registrar cancelamento/chargeback.");
      }
    } catch (err: any) {
      alert("Erro: " + err.message);
    } finally {
      setChargebackSubmitting(false);
    }
  };

  // Ação: Exportar Relatório de Auditoria e Conciliação Mensal (Fase 4)
  const handleExportReport = () => {
    if (sales.length === 0 && installments.length === 0) {
      alert("Nenhum dado disponível para exportação neste mês.");
      return;
    }

    let csvContent =
      "\uFEFFData da Venda;Maquininha;Bandeira;Modalidade;Parcelas;NSU/CV;Autorização;DOC;Bruto (R$);Taxa MDR (R$);Líquido (R$);Status Auditoria;Origem\n";

    sales.forEach((s) => {
      const dataStr = new Date(s.sale_date).toLocaleDateString("pt-BR");
      const termName = s.terminal?.name || s.terminal?.acquirer || "Outra";
      const brandStr = BRAND_LABELS[s.brand] || s.brand;
      const methodStr = PAYMENT_METHOD_LABELS[s.payment_method] || s.payment_method;
      const parcs = s.installments_count || 1;
      const nsu = s.nsu || "";
      const aut = s.authorization_code || "";
      const doc = s.doc_number || "";
      const bruto = Number(s.gross_amount).toFixed(2).replace(".", ",");
      const taxa = Number(s.real_fee_amount || s.total_fee_amount).toFixed(2).replace(".", ",");
      const liquido = Number(s.net_amount).toFixed(2).replace(".", ",");
      const status =
        s.audit_status === "verified"
          ? "Auditada"
          : s.audit_status === "divergence"
          ? "Divergência"
          : s.status === "chargeback"
          ? "Chargeback"
          : s.status === "cancelled"
          ? "Cancelada"
          : "Pendente";
      const origem = s.entry_source;

      csvContent += `"${dataStr}";"${termName}";"${brandStr}";"${methodStr}";"${parcs}x";"${nsu}";"${aut}";"${doc}";"${bruto}";"${taxa}";"${liquido}";"${status}";"${origem}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_cartoes_${targetEndMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Navigation>
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header com Título e Ações */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">💳</span>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Controle de Cartões & Maquininhas</h1>
                <p className="text-sm text-gray-500">
                  Conciliação de vendas, taxas MDR e agenda de recebíveis futuros.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              onClick={() => {
                setCsvFile(null);
                setCsvReport(null);
                setCsvTerminalId(terminals[0]?.id || "");
                setIsCsvModalOpen(true);
              }}
              className="flex-1 sm:flex-initial px-3.5 py-2 sm:py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 text-xs sm:text-sm whitespace-nowrap cursor-pointer"
            >
              <span>📁</span> Extrato (CSV)
            </button>
            <button
              onClick={() => setIsOcrModalOpen(true)}
              className="flex-1 sm:flex-initial px-3.5 py-2 sm:py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-1.5 text-xs sm:text-sm whitespace-nowrap cursor-pointer"
            >
              <span>📸</span> Ler Canhoto
            </button>
            <button
              onClick={() => setIsSaleModalOpen(true)}
              className="w-full sm:w-auto px-4 py-2 sm:py-2.5 bg-primary text-white font-semibold rounded-xl shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-1.5 text-xs sm:text-sm cursor-pointer"
            >
              <span>➕</span> Nova Venda
            </button>
          </div>
        </div>

        {/* BARRA DE SELEÇÃO DE PERÍODO & FAIXAS TEMPORAIS (Modelo KPIs) */}
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

        {/* Navegação entre Abas */}
        <div className="flex items-center gap-2 border-b border-gray-200 pb-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab("schedule")}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "schedule"
                ? "bg-primary text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span>📅</span>
            <span>Agenda de Recebíveis</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === "schedule" ? "bg-white/20 text-white" : "bg-white text-slate-700 shadow-xs"
              }`}
            >
              {installments.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("sales")}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "sales"
                ? "bg-primary text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span>📋</span>
            <span>Vendas Registradas</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === "sales" ? "bg-white/20 text-white" : "bg-white text-slate-700 shadow-xs"
              }`}
            >
              {sales.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("terminals")}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "terminals"
                ? "bg-primary text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span>🏧</span>
            <span>Maquininhas & Taxas MDR</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === "terminals" ? "bg-white/20 text-white" : "bg-white text-slate-700 shadow-xs"
              }`}
            >
              {terminals.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "analytics"
                ? "bg-primary text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span>📊</span>
            <span>Analytics & Comparador</span>
          </button>
        </div>

        {/* CONTEÚDO DA ABA 1: AGENDA DE RECEBÍVEIS */}
        {activeTab === "schedule" && (
          <div className="space-y-6">
            {/* KPI Cards (5 cards de status e auditoria) */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-gray-200/80 shadow-sm">
                <span className="text-[10px] sm:text-xs font-semibold uppercase text-gray-400">Total Bruto</span>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-0.5 sm:mt-1">
                  {kpis.totalGross.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
                <span className="text-[10px] sm:text-xs text-gray-500">Período: {periodLabel}</span>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-gray-200/80 shadow-sm">
                <span className="text-[10px] sm:text-xs font-semibold uppercase text-red-500">Taxas Retidas</span>
                <p className="text-lg sm:text-2xl font-bold text-red-600 mt-0.5 sm:mt-1">
                  - {kpis.totalFee.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
                <span className="text-[10px] sm:text-xs text-red-500 font-medium">Médio: {kpis.effectiveFeePercent}%</span>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-emerald-100 bg-emerald-50/30 shadow-sm">
                <span className="text-[10px] sm:text-xs font-semibold uppercase text-emerald-600">Líquido Previsto</span>
                <p className="text-lg sm:text-2xl font-bold text-emerald-700 mt-0.5 sm:mt-1">
                  {kpis.totalNet.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
                <span className="text-[10px] sm:text-xs text-emerald-600">A receber no banco</span>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-blue-100 bg-blue-50/30 shadow-sm">
                <span className="text-[10px] sm:text-xs font-semibold uppercase text-blue-600">Já Liquidado</span>
                <p className="text-lg sm:text-2xl font-bold text-blue-700 mt-0.5 sm:mt-1">
                  {kpis.totalSettled.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
                <span className="text-[10px] sm:text-xs text-blue-600 font-medium">
                  Pendente: {kpis.totalPending.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>

              <div
                className={`col-span-2 sm:col-span-2 lg:col-span-1 p-3.5 sm:p-5 rounded-2xl border shadow-sm transition-all ${
                  kpis.totalFeeDifference > 0
                    ? "bg-red-50/50 border-red-200 text-red-900"
                    : "bg-purple-50/40 border-purple-200 text-purple-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Auditoria de Taxas</span>
                  <HelpTooltip text="Compara a taxa contratada com a taxa cobrada no extrato da operadora. Mostra se houve cobrança indevida." />
                </div>
                <p
                  className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${
                    kpis.totalFeeDifference > 0 ? "text-red-700" : "text-purple-700"
                  }`}
                >
                  {kpis.totalFeeDifference > 0
                    ? `+ ${kpis.totalFeeDifference.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                    : "0 divergências"}
                </p>
                <span className="text-[10px] sm:text-xs font-medium block">
                  {kpis.totalFeeDifference > 0
                    ? `⚠️ ${kpis.divergenceSalesCount} vendas com taxa a mais`
                    : `✓ ${kpis.verifiedSalesCount} vendas auditadas`}
                </span>
              </div>
            </div>

            {/* Tabela de Parcelas Agendadas */}
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-800">Cronograma de Depósitos no Banco</h2>
                  <span className="text-xs text-gray-500">Previsão e liquidação para {periodLabel}</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Botão de Auto-Conciliação com Extrato Bancário */}
                  <button
                    onClick={handleAutoReconcileBank}
                    disabled={autoReconciling}
                    className="px-3.5 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {autoReconciling ? (
                      <>
                        <span className="animate-spin">⚙️</span> Conciliando c/ Banco...
                      </>
                    ) : (
                      <>
                        <span>🏦</span> Auto-Conciliar c/ Extrato Bancário
                      </>
                    )}
                  </button>

                  {/* Botões de Ação em Lote (Liquidar & Antecipar) */}
                  {selectedInstallmentIds.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenSettlementModal(selectedInstallmentIds)}
                        className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
                      >
                        <span>⚡</span> Liquidar ({selectedInstallmentIds.length})
                      </button>

                      <button
                        onClick={() => handleOpenAnticipationModal(selectedInstallmentIds)}
                        className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold rounded-xl shadow-md shadow-purple-600/20 transition-all flex items-center gap-1.5 animate-pulse"
                      >
                        <span>🚀</span> Simular Antecipação ({selectedInstallmentIds.length})
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="p-8 text-center text-gray-400">Carregando recebíveis...</div>
              ) : installments.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <span className="text-4xl block mb-2">📭</span>
                  Nenhum recebível previsto para este mês. Lance novas vendas ou importe o extrato da maquininha.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm min-w-[780px]">
                    <thead>
                      <tr className="bg-gray-50/75 border-b border-gray-200/80 text-gray-500 text-xs uppercase font-semibold">
                        <th className="py-3 px-3 text-center w-10">
                          <input
                            type="checkbox"
                            checked={
                              installments.filter((i) => i.status === "scheduled").length > 0 &&
                              installments
                                .filter((i) => i.status === "scheduled")
                                .every((i) => selectedInstallmentIds.includes(i.id))
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedInstallmentIds(
                                  installments.filter((i) => i.status === "scheduled").map((i) => i.id)
                                );
                              } else {
                                setSelectedInstallmentIds([]);
                              }
                            }}
                            className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                          />
                        </th>
                        <th className="py-3 px-4">Data Prevista</th>
                        <th className="py-3 px-4">Maquininha</th>
                        <th className="py-3 px-4">Bandeira / Método</th>
                        <th className="py-3 px-4 text-center">Parcela</th>
                        <th className="py-3 px-4 text-right">Valor Bruto</th>
                        <th className="py-3 px-4 text-right">Taxa MDR</th>
                        <th className="py-3 px-4 text-right">Valor Líquido</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {installments.map((inst) => {
                        const acquirer = inst.sale?.terminal?.acquirer || "other";
                        const acquirerMeta = ACQUIRER_LABELS[acquirer] || ACQUIRER_LABELS.other;
                        const isSelected = selectedInstallmentIds.includes(inst.id);
                        const isSettled = inst.status === "settled";
                        const isAnticipated = inst.status === "anticipated";
                        const isCancelled = inst.status === "cancelled" || inst.status === "chargeback";
                        const settledBank = bankAccounts.find((b) => b.id === inst.settled_bank_account_id);

                        return (
                          <tr
                            key={inst.id}
                            className={`transition-colors ${
                              isSelected
                                ? "bg-emerald-50/40"
                                : isSettled
                                ? "bg-gray-50/30"
                                : isAnticipated
                                ? "bg-purple-50/30"
                                : isCancelled
                                ? "bg-red-50/30 opacity-60 line-through"
                                : "hover:bg-gray-50/60"
                            }`}
                          >
                            <td className="py-3.5 px-3 text-center">
                              {!isSettled && !isAnticipated && !isCancelled ? (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedInstallmentIds([...selectedInstallmentIds, inst.id]);
                                    } else {
                                      setSelectedInstallmentIds(
                                        selectedInstallmentIds.filter((id) => id !== inst.id)
                                      );
                                    }
                                  }}
                                  className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                                />
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-medium text-gray-900 whitespace-nowrap">
                              {new Date(inst.expected_date + "T12:00:00").toLocaleDateString("pt-BR")}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${acquirerMeta.color}`}
                              >
                                {inst.sale?.terminal?.name || acquirerMeta.label}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-gray-700">
                              <span className="capitalize font-semibold text-gray-800">
                                {BRAND_LABELS[inst.sale?.brand || ""] || inst.sale?.brand}
                              </span>
                              <span className="text-xs text-gray-400 block">
                                {PAYMENT_METHOD_LABELS[inst.sale?.payment_method || "debit"]}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center font-medium text-gray-600">
                              {inst.installment_number} / {inst.total_installments}
                            </td>
                            <td className="py-3.5 px-4 text-right text-gray-500 whitespace-nowrap">
                              {Number(inst.gross_amount).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </td>
                            <td className="py-3.5 px-4 text-right text-red-500 font-medium whitespace-nowrap">
                              -{" "}
                              {Number(inst.fee_amount).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </td>
                            <td className="py-3.5 px-4 text-right font-bold text-emerald-600 whitespace-nowrap">
                              {Number(isAnticipated ? inst.anticipation_net_amount || inst.net_amount : inst.net_amount).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </td>
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              {isSettled && (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    ✓ Liquidado
                                  </span>
                                  {settledBank && (
                                    <span className="block text-[11px] text-gray-500 font-medium">
                                      🏦 {settledBank.name}
                                    </span>
                                  )}
                                </div>
                              )}
                              {isAnticipated && (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
                                    ⚡ Antecipada
                                  </span>
                                  {settledBank && (
                                    <span className="block text-[11px] text-gray-500 font-medium">
                                      🏦 {settledBank.name}
                                    </span>
                                  )}
                                </div>
                              )}
                              {isCancelled && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                                  ❌ Cancelada
                                </span>
                              )}
                              {!isSettled && !isAnticipated && !isCancelled && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                                  ⏳ Agendado
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              {isSettled ? (
                                <button
                                  onClick={() => handleUndoSettlement(inst)}
                                  className="text-xs px-2.5 py-1 rounded-lg font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 transition-all"
                                >
                                  Desfazer
                                </button>
                              ) : isAnticipated ? (
                                <span className="text-xs text-purple-700 font-medium">Baixada no banco</span>
                              ) : isCancelled ? (
                                <span className="text-xs text-gray-400">Cancelada</span>
                              ) : (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleOpenSettlementModal([inst.id])}
                                    className="text-xs px-2.5 py-1 rounded-lg font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all flex items-center gap-1"
                                  >
                                    <span>🏦</span> Liquidar
                                  </button>
                                  <button
                                    onClick={() => handleOpenAnticipationModal([inst.id])}
                                    className="text-xs px-2.5 py-1 rounded-lg font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 shadow-xs transition-all flex items-center gap-1"
                                  >
                                    <span>⚡</span> Antecipar
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONTEÚDO DA ABA 2: VENDAS REGISTRADAS */}
        {activeTab === "sales" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-bold text-gray-800">Transações de Venda ({periodLabel})</h2>
                  <span className="text-xs text-gray-500">
                    {filteredSales.length} {filteredSales.length === 1 ? "venda" : "vendas"}
                  </span>
                </div>

                {/* Filtros de Auditoria e Ações */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => setSalesFilter("all")}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                        salesFilter === "all"
                          ? "bg-gray-900 text-white shadow-xs"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Todas ({sales.length})
                    </button>
                    <button
                      onClick={() => setSalesFilter("verified")}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                        salesFilter === "verified"
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                      }`}
                    >
                      <span>✓</span> Auditadas ({sales.filter((s) => s.audit_status === "verified").length})
                    </button>
                    <button
                      onClick={() => setSalesFilter("divergence")}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                        salesFilter === "divergence"
                          ? "bg-red-600 text-white shadow-xs"
                          : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                      }`}
                    >
                      <span>⚠️</span> Divergências ({sales.filter((s) => s.audit_status === "divergence").length})
                    </button>
                    <button
                      onClick={() => setSalesFilter("pending")}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                        salesFilter === "pending"
                          ? "bg-amber-600 text-white shadow-xs"
                          : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                      }`}
                    >
                      <span>⏳</span> Pendentes ({sales.filter((s) => !s.audit_status || s.audit_status === "pending").length})
                    </button>
                  </div>

                  <button
                    onClick={handleExportReport}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 border border-gray-200"
                  >
                    <span>📥</span> Exportar CSV
                  </button>
                </div>
              </div>

              {filteredSales.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <span className="text-3xl block mb-2">🔍</span>
                  Nenhuma venda encontrada para o filtro selecionado neste mês.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm min-w-[850px]">
                    <thead>
                      <tr className="bg-gray-50/75 border-b border-gray-200/80 text-gray-500 text-xs uppercase font-semibold">
                        <th className="py-3 px-4">Data/Hora</th>
                        <th className="py-3 px-4">Maquininha</th>
                        <th className="py-3 px-4">Bandeira / Método</th>
                        <th className="py-3 px-4">Identificadores</th>
                        <th className="py-3 px-4 text-center">Origem</th>
                        <th className="py-3 px-4 text-center">Auditoria</th>
                        <th className="py-3 px-4 text-right">Taxa Cobrada</th>
                        <th className="py-3 px-4 text-right">Bruto</th>
                        <th className="py-3 px-4 text-right">Líquido</th>
                        <th className="py-3 px-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredSales.map((sale) => {
                        const hasDivergence =
                          sale.audit_status === "divergence" || (sale.fee_difference_amount || 0) > 0;
                        const isVerified = sale.audit_status === "verified";
                        const isCancelled = sale.status === "cancelled";
                        const isChargeback = sale.status === "chargeback";
                        const acquirerMeta =
                          ACQUIRER_LABELS[sale.terminal?.acquirer || "other"] || ACQUIRER_LABELS.other;

                        return (
                          <tr
                            key={sale.id}
                            className={`hover:bg-gray-50/70 transition-colors ${
                              hasDivergence
                                ? "bg-red-50/30"
                                : isCancelled || isChargeback
                                ? "bg-gray-100/50 opacity-60"
                                : ""
                            }`}
                          >
                            <td className="py-3.5 px-4 font-medium text-gray-900 whitespace-nowrap">
                              {new Date(sale.sale_date).toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${acquirerMeta.color}`}
                              >
                                {sale.terminal?.name || acquirerMeta.label}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="capitalize font-semibold text-gray-800">
                                {BRAND_LABELS[sale.brand] || sale.brand}
                              </span>
                              <span className="text-xs text-gray-400 block">
                                {PAYMENT_METHOD_LABELS[sale.payment_method]} ({sale.installments_count}x)
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-xs text-gray-600">
                              {sale.nsu && <span className="block">NSU/CV: {sale.nsu}</span>}
                              {sale.authorization_code && (
                                <span className="block text-gray-400">AUT: {sale.authorization_code}</span>
                              )}
                              {sale.doc_number && (
                                <span className="block text-gray-400">DOC: {sale.doc_number}</span>
                              )}
                              {!sale.nsu && !sale.authorization_code && !sale.doc_number && "—"}
                            </td>
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              {sale.entry_source === "ocr_receipt" && (
                                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                                  📸 Canhoto
                                </span>
                              )}
                              {sale.entry_source === "manual" && (
                                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-semibold">
                                  ✍️ Manual
                                </span>
                              )}
                              {sale.entry_source === "csv_import" && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                                  📁 Extrato
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              {isCancelled && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-200 text-gray-700">
                                  ❌ Cancelada
                                </span>
                              )}
                              {isChargeback && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300">
                                  ⚠️ Chargeback
                                </span>
                              )}
                              {!isCancelled && !isChargeback && isVerified && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <span>✓</span> Auditada
                                </span>
                              )}
                              {!isCancelled && !isChargeback && hasDivergence && (
                                <span
                                  title={`Cobrado a mais: R$ ${Number(sale.fee_difference_amount || 0).toFixed(2)}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 animate-pulse"
                                >
                                  <span>⚠️</span> +
                                  {Number(sale.fee_difference_amount || 0).toLocaleString("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  })}
                                </span>
                              )}
                              {!isCancelled && !isChargeback && !isVerified && !hasDivergence && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                  <span>⏳</span> Pendente
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <span className="font-semibold text-red-600">
                                -{" "}
                                {Number(sale.real_fee_amount || sale.total_fee_amount).toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })}
                              </span>
                              {sale.real_fee_percentage ? (
                                <span className="block text-[11px] text-gray-400">
                                  {sale.real_fee_percentage}% cobrado
                                </span>
                              ) : null}
                            </td>
                            <td className="py-3.5 px-4 text-right font-medium text-gray-900 whitespace-nowrap">
                              {Number(sale.gross_amount).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </td>
                            <td className="py-3.5 px-4 text-right font-bold text-emerald-600 whitespace-nowrap">
                              {Number(sale.net_amount).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </td>
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              {!isCancelled && !isChargeback ? (
                                <button
                                  onClick={() => handleOpenChargebackModal(sale, "chargeback")}
                                  className="text-xs px-2 py-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                  title="Contestar venda ou registrar cancelamento/chargeback"
                                >
                                  ⚠️ Contestar
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONTEÚDO DA ABA 3: MAQUININHAS & TAXAS MDR */}
        {activeTab === "terminals" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Maquininhas Cadastradas</h2>
                <p className="text-sm text-gray-500">Configure suas taxas MDR para cálculo automático dos recebíveis.</p>
              </div>
              <button
                onClick={handleOpenNewTerminalModal}
                className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl shadow-sm hover:opacity-95 transition-all flex items-center gap-1.5"
              >
                <span>➕</span> Nova Maquininha
              </button>
            </div>

            {terminals.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl border border-gray-200/80 text-center text-gray-400">
                <span className="text-4xl block mb-2">🏧</span>
                Nenhuma maquininha cadastrada ainda. Clique no botão acima para adicionar a primeira.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {terminals.map((term) => {
                  const acquirerMeta = ACQUIRER_LABELS[term.acquirer] || ACQUIRER_LABELS.other;
                  const termRules = rateRules.filter((r) => r.terminal_id === term.id);

                  return (
                    <div
                      key={term.id}
                      className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm space-y-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border mb-2 ${acquirerMeta.color}`}
                          >
                            {acquirerMeta.label}
                          </span>
                          <h3 className="text-lg font-bold text-gray-900">{term.name}</h3>
                          <span className="text-xs text-gray-400 block mt-0.5">
                            Status: {term.is_active ? "🟢 Ativa" : "🔴 Inativa"}
                          </span>
                        </div>

                        <button
                          onClick={() => handleOpenEditTerminalModal(term)}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs whitespace-nowrap"
                        >
                          <span>⚙️</span> Editar Maquininha & Taxas
                        </button>
                      </div>

                      {/* Tabela Resumo de Taxas */}
                      <div className="border border-gray-100 rounded-xl overflow-hidden text-xs">
                        <table className="w-full text-left">
                          <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                            <tr>
                              <th className="p-2">Modalidade</th>
                              <th className="p-2">Faixa</th>
                              <th className="p-2 text-right">Taxa MDR (%)</th>
                              <th className="p-2 text-right">Prazo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {termRules.map((rule) => (
                              <tr key={rule.id}>
                                <td className="p-2 font-medium text-gray-700">
                                  {PAYMENT_METHOD_LABELS[rule.payment_method]}
                                </td>
                                <td className="p-2 text-gray-500">
                                  {rule.payment_method === "credit_installment"
                                    ? `${rule.min_installments}x a ${rule.max_installments}x`
                                    : "1x"}
                                </td>
                                <td className="p-2 text-right font-bold text-primary">
                                  {Number(rule.mdr_percentage).toFixed(2)}%
                                </td>
                                <td className="p-2 text-right text-gray-500">D+{rule.settlement_days}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CONTEÚDO DA ABA 4: ANALYTICS & COMPARADOR (FASE 4) */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            {/* Header de Analytics com Exportação */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Inteligência Financeira & Comparador</h2>
                <p className="text-xs text-gray-500">
                  Visão consolidada de taxas, faturamento por adquirente e mix de pagamentos de {periodLabel}.
                </p>
              </div>
              <button
                onClick={handleExportReport}
                className="px-4 py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span>📊</span> Exportar Relatório Mensal (CSV/Excel)
              </button>
            </div>

            {/* 4 Cards de Métricas Principais */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/80 shadow-sm">
                <span className="text-[10px] sm:text-xs font-semibold uppercase text-gray-400">Faturamento Bruto</span>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                  {analytics.totalGross.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
                <span className="text-[10px] sm:text-xs text-gray-500">{sales.length} vendas registradas</span>
              </div>

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-red-100 bg-red-50/20 shadow-sm">
                <span className="text-[10px] sm:text-xs font-semibold uppercase text-red-500">Taxas Retidas (MDR)</span>
                <p className="text-lg sm:text-2xl font-bold text-red-600 mt-1">
                  - {analytics.totalFees.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
                <span className="text-[10px] sm:text-xs text-red-500 font-bold">
                  {analytics.averageFeeRate.toFixed(2)}% de taxa média
                </span>
              </div>

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-100 bg-emerald-50/20 shadow-sm">
                <span className="text-[10px] sm:text-xs font-semibold uppercase text-emerald-600">Líquido Creditado</span>
                <p className="text-lg sm:text-2xl font-bold text-emerald-700 mt-1">
                  {analytics.totalNet.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
                <span className="text-[10px] sm:text-xs text-emerald-600">Entrada real no caixa</span>
              </div>

              <div
                className={`p-4 sm:p-5 rounded-2xl border shadow-sm ${
                  analytics.totalFeeDiff > 0
                    ? "bg-amber-50/70 border-amber-200 text-amber-900"
                    : "bg-purple-50/30 border-purple-200 text-purple-900"
                }`}
              >
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Auditoria de Cobrança</span>
                <p className="text-lg sm:text-2xl font-bold mt-1">
                  {analytics.totalFeeDiff > 0
                    ? `+ ${analytics.totalFeeDiff.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                    : "0 divergências"}
                </p>
                <span className="text-[10px] sm:text-xs font-medium block">
                  {analytics.totalFeeDiff > 0 ? "Cobrado acima do contratado" : "Taxas 100% de acordo"}
                </span>
              </div>
            </div>

            {/* Insight Inteligente Estratégico */}
            {analytics.cheapestTerminal && analytics.terminalStats.length > 1 && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 p-4 sm:p-5 rounded-2xl flex items-start gap-3 shadow-xs">
                <span className="text-2xl">💡</span>
                <div className="space-y-1 text-xs">
                  <span className="font-bold text-blue-900 text-sm block">Insight de Economia com Maquininhas:</span>
                  <p className="text-blue-800 leading-relaxed">
                    A maquininha <strong>{analytics.cheapestTerminal.name}</strong> teve o menor custo efetivo neste mês (
                    <strong>{analytics.cheapestTerminal.effectiveFeeRate.toFixed(2)}%</strong> de taxa média real).
                    {analytics.terminalStats.length > 1 && (
                      <span>
                        {" "}Comparada à maquininha mais cara ({analytics.terminalStats[analytics.terminalStats.length - 1].name} com{" "}
                        {analytics.terminalStats[analytics.terminalStats.length - 1].effectiveFeeRate.toFixed(2)}%),
                        concentrar suas vendas nela pode gerar economia imediata nas taxas retidas.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Grid 2 Colunas: Comparador de Maquininhas e Mix de Vendas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Comparador de Maquininhas */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <span>🏆</span> Comparador de Custo Real por Maquininha
                  </h3>
                  <span className="text-xs text-gray-400">Ordenado por menor taxa</span>
                </div>

                {analytics.terminalStats.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400">
                    Nenhuma venda registrada para comparação neste mês.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {analytics.terminalStats.map((term, idx) => {
                      const acquirerMeta = ACQUIRER_LABELS[term.acquirer] || ACQUIRER_LABELS.other;
                      const isCheapest = idx === 0;

                      return (
                        <div
                          key={term.terminalId}
                          className="p-3.5 rounded-xl border border-gray-100 hover:border-gray-200 bg-gray-50/50 space-y-2 transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${acquirerMeta.color}`}
                              >
                                {acquirerMeta.label}
                              </span>
                              <span className="font-bold text-gray-800 text-xs">{term.name}</span>
                              {isCheapest && (
                                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                  ★ Menor Taxa
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-bold text-primary">
                              {term.effectiveFeeRate.toFixed(2)}% taxa média
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-[11px] text-gray-600 pt-1 border-t border-gray-100">
                            <div>
                              <span className="text-gray-400 block text-[10px]">Vendas Brutas</span>
                              <span className="font-semibold text-gray-900">
                                {term.totalGross.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-400 block text-[10px]">Taxas Retidas</span>
                              <span className="font-semibold text-red-600">
                                -{" "}
                                {term.totalFees.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-gray-400 block text-[10px]">Divergências</span>
                              <span
                                className={`font-semibold ${
                                  term.divergenceCount > 0 ? "text-red-600 font-bold" : "text-emerald-600"
                                }`}
                              >
                                {term.divergenceCount > 0 ? `⚠️ ${term.divergenceCount} erro(s)` : "✓ Nenhuma"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Mix de Pagamentos (Modalidade & Bandeira) */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm space-y-6">
                {/* Distribuição por Modalidade */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <span>💳</span> Mix por Modalidade de Pagamento
                    </h3>
                    <span className="text-xs text-gray-400">% do total</span>
                  </div>

                  {analytics.methodStats.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-400">Sem dados no mês.</div>
                  ) : (
                    <div className="space-y-2.5">
                      {analytics.methodStats.map((item) => (
                        <div key={item.method} className="space-y-1">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="text-gray-700">{item.label}</span>
                            <span className="text-gray-900 font-bold">
                              {item.amount.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}{" "}
                              ({item.percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-primary h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(3, item.percentage)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Distribuição por Bandeira */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <span>🏷️</span> Mix por Bandeira de Cartão
                    </h3>
                    <span className="text-xs text-gray-400">% do total</span>
                  </div>

                  {analytics.brandStats.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-400">Sem dados no mês.</div>
                  ) : (
                    <div className="space-y-2.5">
                      {analytics.brandStats.map((item) => (
                        <div key={item.brand} className="space-y-1">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="text-gray-700 capitalize">{item.label}</span>
                            <span className="text-gray-900 font-bold">
                              {item.amount.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}{" "}
                              ({item.percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(3, item.percentage)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 1: CADASTRAR OU EDITAR MAQUININHA & TAXAS MDR */}
        {isTerminalModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-5 md:p-7 shadow-2xl space-y-5 my-auto border border-gray-100">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl bg-blue-50 p-2 rounded-xl">🏧</span>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {editingTerminal ? "Editar Maquininha & Taxas MDR" : "Cadastrar Nova Maquininha"}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Configure os dados da operadora e a grade de taxas para cálculo automático
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsTerminalModalOpen(false);
                    setEditingTerminal(null);
                  }}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold transition-all"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveTerminal} className="space-y-4 text-xs">
                {/* 1. Dados Básicos */}
                <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-200/70 space-y-3">
                  <span className="font-bold text-gray-800 text-xs block">Dados Cadastrais</span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Nome / Identificação
                        <HelpTooltip text="Identificação para você reconhecer a maquininha no sistema (ex: Stone Balcão Loja 1)." />
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Stone Balcão Loja 1"
                        value={terminalForm.name}
                        onChange={(e) => setTerminalForm({ ...terminalForm, name: e.target.value })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Operadora / Adquirente
                        <HelpTooltip text="Empresa de maquininha responsável pelo processamento dos pagamentos." />
                      </label>
                      <select
                        value={terminalForm.acquirer}
                        onChange={(e) => setTerminalForm({ ...terminalForm, acquirer: e.target.value as Acquirer })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary font-medium"
                      >
                        {Object.entries(ACQUIRER_LABELS).map(([key, item]) => (
                          <option key={key} value={key}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Conta Bancária de Depósito
                        <HelpTooltip text="Conta onde a adquirente faz a liquidação e crédito dos recebíveis." />
                      </label>
                      <select
                        value={terminalForm.bank_account_id}
                        onChange={(e) => setTerminalForm({ ...terminalForm, bank_account_id: e.target.value })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary font-medium"
                      >
                        <option value="">Selecione a conta de liquidação (opcional)</option>
                        {bankAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.bank_name || "Banco"} - {acc.account_number || acc.id}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Status da Maquininha
                        <HelpTooltip text="Maquininhas ativas aparecem disponíveis para novos lançamentos e leituras de comprovante." />
                      </label>
                      <select
                        value={terminalForm.is_active ? "true" : "false"}
                        onChange={(e) => setTerminalForm({ ...terminalForm, is_active: e.target.value === "true" })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary font-medium"
                      >
                        <option value="true">🟢 Ativa</option>
                        <option value="false">🔴 Inativa</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Grade de Taxas MDR */}
                <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-200/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-gray-800 text-xs block">Grade de Taxas MDR Contratadas</span>
                      <span className="text-[11px] text-gray-500">
                        O sistema usa estas taxas para calcular o líquido a receber e auditar cobranças indevidas no extrato.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setTerminalRatesForm([
                          ...terminalRatesForm,
                          {
                            payment_method: "credit_installment",
                            brand: "all",
                            min_installments: 2,
                            max_installments: 6,
                            mdr_percentage: 3.5,
                            settlement_days: 30,
                          },
                        ])
                      }
                      className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg font-bold transition-all"
                    >
                      + Adicionar Faixa
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-gray-500 font-semibold border-b border-gray-200 pb-1">
                          <th className="py-1 px-2">Modalidade</th>
                          <th className="py-1 px-2 text-center">Faixa (x)</th>
                          <th className="py-1 px-2 text-center">Taxa MDR (%)</th>
                          <th className="py-1 px-2 text-center">Prazo (Dias)</th>
                          <th className="py-1 px-2 text-center">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {terminalRatesForm.map((rule, idx) => (
                          <tr key={idx} className="hover:bg-white/60">
                            <td className="py-2 px-2">
                              <select
                                value={rule.payment_method}
                                onChange={(e) => {
                                  const updated = [...terminalRatesForm];
                                  const val = e.target.value as PaymentMethod;
                                  updated[idx] = {
                                    ...updated[idx],
                                    payment_method: val,
                                    min_installments: val === "credit_installment" ? 2 : 1,
                                    max_installments: val === "credit_installment" ? 6 : 1,
                                    settlement_days: val === "debit" ? 1 : 30,
                                  };
                                  setTerminalRatesForm(updated);
                                }}
                                className="border border-gray-300 rounded-lg px-2 py-1 text-gray-900 bg-white font-medium text-xs"
                              >
                                <option value="debit">Débito</option>
                                <option value="credit_cash">Crédito à Vista</option>
                                <option value="credit_installment">Crédito Parcelado</option>
                                <option value="voucher">Voucher</option>
                                <option value="pix">Pix Maquininha</option>
                              </select>
                            </td>

                            <td className="py-2 px-2 text-center">
                              {rule.payment_method === "credit_installment" ? (
                                <div className="inline-flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="2"
                                    max="18"
                                    value={rule.min_installments}
                                    onChange={(e) => {
                                      const updated = [...terminalRatesForm];
                                      updated[idx].min_installments = parseInt(e.target.value) || 2;
                                      setTerminalRatesForm(updated);
                                    }}
                                    className="w-12 text-center border border-gray-300 rounded-lg px-1 py-1 text-gray-900 bg-white font-medium"
                                  />
                                  <span>a</span>
                                  <input
                                    type="number"
                                    min="2"
                                    max="18"
                                    value={rule.max_installments}
                                    onChange={(e) => {
                                      const updated = [...terminalRatesForm];
                                      updated[idx].max_installments = parseInt(e.target.value) || 6;
                                      setTerminalRatesForm(updated);
                                    }}
                                    className="w-12 text-center border border-gray-300 rounded-lg px-1 py-1 text-gray-900 bg-white font-medium"
                                  />
                                </div>
                              ) : (
                                <span className="text-gray-400 font-mono">1x</span>
                              )}
                            </td>

                            <td className="py-2 px-2 text-center">
                              <div className="inline-flex items-center gap-1 justify-center">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={rule.mdr_percentage}
                                  onChange={(e) => {
                                    const updated = [...terminalRatesForm];
                                    updated[idx].mdr_percentage = parseFloat(e.target.value) || 0;
                                    setTerminalRatesForm(updated);
                                  }}
                                  className="w-16 text-center font-bold text-primary border border-gray-300 rounded-lg px-1 py-1 bg-white"
                                />
                                <span className="font-bold text-gray-500">%</span>
                              </div>
                            </td>

                            <td className="py-2 px-2 text-center">
                              <div className="inline-flex items-center gap-1 justify-center">
                                <span className="text-gray-400 font-semibold">D+</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="90"
                                  value={rule.settlement_days}
                                  onChange={(e) => {
                                    const updated = [...terminalRatesForm];
                                    updated[idx].settlement_days = parseInt(e.target.value) || 1;
                                    setTerminalRatesForm(updated);
                                  }}
                                  className="w-12 text-center border border-gray-300 rounded-lg px-1 py-1 text-gray-900 bg-white"
                                />
                              </div>
                            </td>

                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = terminalRatesForm.filter((_, i) => i !== idx);
                                  setTerminalRatesForm(updated);
                                }}
                                className="text-red-500 hover:text-red-700 font-bold px-1.5 py-0.5 rounded hover:bg-red-50 transition-all text-xs"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                  {editingTerminal ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteTerminal(editingTerminal.id)}
                      className="text-xs text-red-600 hover:text-red-800 font-semibold hover:underline flex items-center gap-1"
                    >
                      <span>🗑️</span> Excluir Maquininha
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsTerminalModalOpen(false);
                        setEditingTerminal(null);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 font-medium"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-primary text-white rounded-xl font-bold hover:opacity-95 shadow-md shadow-primary/20"
                    >
                      {editingTerminal ? "Salvar Alterações" : "Cadastrar Maquininha"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: NOVA VENDA MANUAL */}
        {isSaleModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-5 md:p-7 shadow-2xl space-y-5 my-auto border border-gray-100">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl bg-blue-50 p-2 rounded-xl">💳</span>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Registrar Venda no Cartão</h3>
                    <p className="text-xs text-gray-500">Lançamento manual com cálculo automático de taxas e parcelas</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSaleModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold transition-all"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveManualSale} className="space-y-4 text-xs">
                <div className="space-y-3 bg-gray-50/70 p-4 rounded-2xl border border-gray-200/70">
                  {/* 1. Maquininha */}
                  <div>
                    <label className="block text-gray-700 font-bold mb-1">
                      Maquininha de Destino
                      <HelpTooltip text="Selecione a maquininha onde a venda foi passada para calcular automaticamente as taxas MDR e as datas de depósito." />
                    </label>
                    <select
                      required
                      value={saleForm.terminal_id}
                      onChange={(e) => setSaleForm({ ...saleForm, terminal_id: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary font-medium"
                    >
                      <option value="">Selecione a maquininha...</option>
                      {terminals.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({ACQUIRER_LABELS[t.acquirer]?.label || t.acquirer})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Valor Bruto e Bandeira */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Valor Bruto (R$)
                        <HelpTooltip text="Valor total passado na maquininha antes do desconto da taxa cobrada pela operadora." />
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="180,00"
                        value={saleForm.gross_amount}
                        onChange={(e) => setSaleForm({ ...saleForm, gross_amount: e.target.value })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary font-bold text-base"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Bandeira
                        <HelpTooltip text="Bandeira do cartão (Visa, Mastercard, Elo, etc.) utilizada na transação." />
                      </label>
                      <select
                        value={saleForm.brand}
                        onChange={(e) => setSaleForm({ ...saleForm, brand: e.target.value })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary capitalize font-medium"
                      >
                        {Object.entries(BRAND_LABELS)
                          .filter(([k]) => k !== "all")
                          .map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {/* 3. Modalidade e Parcelas */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Modalidade
                        <HelpTooltip text="Débito (D+1), Crédito à Vista (1x em D+30) ou Crédito Parcelado (desdobra em parcelas mensais futuras)." />
                      </label>
                      <select
                        value={saleForm.payment_method}
                        onChange={(e) =>
                          setSaleForm({ ...saleForm, payment_method: e.target.value as PaymentMethod })
                        }
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary font-medium"
                      >
                        <option value="debit">Débito</option>
                        <option value="credit_cash">Crédito à Vista (1x)</option>
                        <option value="credit_installment">Crédito Parcelado</option>
                        <option value="voucher">Voucher / Refeição</option>
                        <option value="pix">Pix Maquininha</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Nº de Parcelas
                        <HelpTooltip text="Quantidade total de parcelas no crédito (ex: 2x a 18x)." />
                      </label>
                      <input
                        type="number"
                        min="2"
                        max="18"
                        disabled={saleForm.payment_method !== "credit_installment"}
                        value={saleForm.installments_count}
                        onChange={(e) =>
                          setSaleForm({ ...saleForm, installments_count: parseInt(e.target.value) || 2 })
                        }
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white disabled:bg-gray-100 disabled:text-gray-400 font-medium"
                      />
                    </div>
                  </div>

                  {/* 4. Data/Hora e 4 Dígitos do Cartão */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Data e Hora da Venda
                        <HelpTooltip text="Data e horário em que a venda foi realizada no terminal." />
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={saleForm.sale_date}
                        onChange={(e) => setSaleForm({ ...saleForm, sale_date: e.target.value })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Cartão (4 Últimos Dígitos)
                        <HelpTooltip text="Últimos 4 dígitos impressos no comprovante (ex: **** 9208). Ajuda a conferir qual cliente fez o pagamento." />
                      </label>
                      <input
                        type="text"
                        maxLength={4}
                        placeholder="Ex: 9208"
                        value={saleForm.card_last_digits}
                        onChange={(e) => setSaleForm({ ...saleForm, card_last_digits: e.target.value })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white font-mono"
                      />
                    </div>
                  </div>

                  {/* 5. NSU / CV, Nº DOC e Autorização (AUT) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        NSU / CV
                        <HelpTooltip text="Número Sequencial Único ou Comprovante de Venda. Na Getnet aparece como CV e na Stone/Cielo como NSU." />
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 000001165"
                        value={saleForm.nsu}
                        onChange={(e) => setSaleForm({ ...saleForm, nsu: e.target.value })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Nº DOC
                        <HelpTooltip text="Número do Documento gerado pelo terminal POS para controle interno." />
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 000616"
                        value={saleForm.doc_number}
                        onChange={(e) => setSaleForm({ ...saleForm, doc_number: e.target.value })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Autorização (AUT)
                        <HelpTooltip text="Código emitido pela bandeira/banco emissor aprovando a compra. Aparece como AUT ou AUTO no comprovante." />
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 685327"
                        value={saleForm.authorization_code}
                        onChange={(e) => setSaleForm({ ...saleForm, authorization_code: e.target.value })}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white font-mono"
                      />
                    </div>
                  </div>

                  {/* 6. Observações */}
                  <div>
                    <label className="block text-gray-700 font-bold mb-1">
                      Observações (Opcional)
                      <HelpTooltip text="Campo livre para anotações internas (ex: nº da OS, nome do cliente, venda balcão, etc.)." />
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Venda balcão, OS 19327, etc."
                      value={saleForm.notes}
                      onChange={(e) => setSaleForm({ ...saleForm, notes: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsSaleModalOpen(false)}
                    className="px-5 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:opacity-95 transition-all shadow-md shadow-primary/20"
                  >
                    Salvar e Gerar Agenda
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 3: OCR DE COMPROVANTE (FOTO DO CANHOTO) */}
        {isOcrModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-4xl w-full p-5 md:p-7 shadow-2xl space-y-5 my-auto border border-gray-100">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl bg-emerald-50 p-2 rounded-xl">📸</span>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Leitor de Canhoto / Comprovante</h3>
                    <p className="text-xs text-gray-500">Extraia e audite dados do comprovante térmico</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsOcrModalOpen(false);
                    setOcrFile(null);
                    setOcrPreviewUrl(null);
                    setOcrResult(null);
                  }}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold transition-all"
                >
                  ✕
                </button>
              </div>

              {!ocrPreviewUrl ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 hover:border-emerald-500 hover:bg-emerald-50/20 rounded-3xl p-12 text-center cursor-pointer transition-all space-y-3"
                >
                  <span className="text-5xl block">📄</span>
                  <p className="font-bold text-gray-800 text-base">Clique ou arraste a foto do comprovante</p>
                  <p className="text-xs text-gray-400">Suporta JPG, PNG ou foto direto da câmera do celular</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleOcrFileSelect}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Foto Lado Esquerdo (5 cols) */}
                  <div className="md:col-span-5 bg-slate-50 rounded-2xl border border-slate-200/80 p-3 flex flex-col items-center justify-between">
                    <div className="w-full h-48 sm:h-64 md:h-80 flex items-center justify-center overflow-hidden rounded-xl bg-black/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ocrPreviewUrl}
                        alt="Comprovante"
                        className="max-h-full max-w-full object-contain shadow-sm"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setOcrFile(null);
                        setOcrPreviewUrl(null);
                        setOcrResult(null);
                      }}
                      className="text-xs font-semibold text-red-500 hover:text-red-700 mt-3 hover:underline flex items-center gap-1"
                    >
                      <span>🔄</span> Trocar imagem
                    </button>
                  </div>

                  {/* Formulário Lado Direito (7 cols) */}
                  <div className="md:col-span-7 flex flex-col justify-between">
                    {ocrLoading ? (
                      <div className="h-80 flex flex-col items-center justify-center text-center p-6 space-y-3">
                        <div className="animate-spin text-4xl">⚙️</div>
                        <p className="text-base font-bold text-gray-800">Processando comprovante...</p>
                        <p className="text-xs text-gray-500 max-w-xs">
                          Identificando operadora, valor, autorização e parcelamento.
                        </p>
                      </div>
                    ) : ocrResult ? (
                      <div className="space-y-4 text-xs max-h-[65vh] overflow-y-auto pr-1">
                        {/* Status / Alerta */}
                        {ocrResult.is_simulated ? (
                          <div className="bg-amber-50 border border-amber-200/80 p-3 rounded-2xl text-amber-900 text-xs">
                            <span className="font-bold block mb-0.5">⚠️ Chave de IA não configurada (.env.local)</span>
                            Preencha ou confirme os campos abaixo com base na foto ao lado.
                          </div>
                        ) : (
                          <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-2xl text-emerald-800 font-medium flex items-center justify-between">
                            <span>✓ Leitura da imagem realizada! Confira os dados:</span>
                            <span className="text-[11px] bg-emerald-200/90 text-emerald-900 px-2 py-0.5 rounded-full font-bold">
                              {ocrResult.confidence || 90}% confiança
                            </span>
                          </div>
                        )}

                        <div className="space-y-3 bg-gray-50/70 p-4 rounded-2xl border border-gray-200/70">
                          {/* 1. Maquininha */}
                          <div>
                            <label className="block text-gray-700 font-bold mb-1">
                              Maquininha de Destino
                              <HelpTooltip text="Selecione a maquininha onde a venda foi passada para calcular automaticamente as taxas MDR e as datas de depósito." />
                            </label>
                            <select
                              value={
                                ocrResult.terminal_id ||
                                terminals.find((t) => t.acquirer.toLowerCase() === (ocrResult.acquirer || "").toLowerCase())?.id ||
                                terminals[0]?.id ||
                                ""
                              }
                              onChange={(e) => setOcrResult({ ...ocrResult, terminal_id: e.target.value })}
                              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary font-medium"
                            >
                              {terminals.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({ACQUIRER_LABELS[t.acquirer]?.label || t.acquirer})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* 2. Valor Bruto e Bandeira */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-gray-700 font-bold mb-1">
                                Valor Bruto (R$)
                                <HelpTooltip text="Valor total passado na maquininha antes do desconto da taxa cobrada pela operadora." />
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="180.00"
                                value={ocrResult.gross_amount || ""}
                                onChange={(e) => setOcrResult({ ...ocrResult, gross_amount: parseFloat(e.target.value) || 0 })}
                                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary font-bold text-base"
                              />
                            </div>

                            <div>
                              <label className="block text-gray-700 font-bold mb-1">
                                Bandeira
                                <HelpTooltip text="Bandeira do cartão (Visa, Mastercard, Elo, etc.) utilizada na transação." />
                              </label>
                              <select
                                value={ocrResult.brand || "visa"}
                                onChange={(e) => setOcrResult({ ...ocrResult, brand: e.target.value })}
                                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary capitalize font-medium"
                              >
                                {Object.entries(BRAND_LABELS)
                                  .filter(([k]) => k !== "all")
                                  .map(([k, label]) => (
                                    <option key={k} value={k}>
                                      {label}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>

                          {/* 3. Modalidade e Parcelas */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-gray-700 font-bold mb-1">
                                Modalidade
                                <HelpTooltip text="Débito (D+1), Crédito à Vista (1x em D+30) ou Crédito Parcelado (desdobra em parcelas mensais futuras)." />
                              </label>
                              <select
                                value={ocrResult.payment_method || "credit_cash"}
                                onChange={(e) =>
                                  setOcrResult({
                                    ...ocrResult,
                                    payment_method: e.target.value,
                                    installments_count: e.target.value === "credit_installment" ? Math.max(2, ocrResult.installments_count || 2) : 1,
                                  })
                                }
                                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary font-medium"
                              >
                                <option value="debit">Débito</option>
                                <option value="credit_cash">Crédito à Vista (1x)</option>
                                <option value="credit_installment">Crédito Parcelado</option>
                                <option value="voucher">Voucher / Refeição</option>
                                <option value="pix">Pix Maquininha</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-gray-700 font-bold mb-1">
                                Nº de Parcelas
                                <HelpTooltip text="Quantidade total de parcelas no crédito (ex: 2x a 18x)." />
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="18"
                                disabled={ocrResult.payment_method !== "credit_installment"}
                                value={ocrResult.installments_count || 1}
                                onChange={(e) =>
                                  setOcrResult({ ...ocrResult, installments_count: parseInt(e.target.value) || 1 })
                                }
                                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white disabled:bg-gray-100 disabled:text-gray-400 font-medium"
                              />
                            </div>
                          </div>

                          {/* 4. Data/Hora e 4 Dígitos do Cartão */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-gray-700 font-bold mb-1">
                                Data e Hora da Venda
                                <HelpTooltip text="Data e horário em que a venda foi realizada no terminal." />
                              </label>
                              <input
                                type="datetime-local"
                                value={
                                  ocrResult.sale_date
                                    ? ocrResult.sale_date.substring(0, 16)
                                    : new Date().toISOString().substring(0, 16)
                                }
                                onChange={(e) => setOcrResult({ ...ocrResult, sale_date: e.target.value })}
                                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white font-mono"
                              />
                            </div>

                            <div>
                              <label className="block text-gray-700 font-bold mb-1">
                                Cartão (4 Últimos Dígitos)
                                <HelpTooltip text="Últimos 4 dígitos impressos no comprovante (ex: **** 9208). Ajuda a conferir qual cliente fez o pagamento." />
                              </label>
                              <input
                                type="text"
                                maxLength={4}
                                placeholder="Ex: 9208"
                                value={ocrResult.card_last_digits || ""}
                                onChange={(e) => setOcrResult({ ...ocrResult, card_last_digits: e.target.value })}
                                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white font-mono"
                              />
                            </div>
                          </div>

                          {/* 5. NSU / CV, Nº DOC e Código de Autorização (AUT) */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-gray-700 font-bold mb-1">
                                NSU / CV
                                <HelpTooltip text="Número Sequencial Único ou Comprovante de Venda. Na Getnet aparece como CV e na Stone/Cielo como NSU." />
                              </label>
                              <input
                                type="text"
                                placeholder="Ex: 000001165"
                                value={ocrResult.nsu || ""}
                                onChange={(e) => setOcrResult({ ...ocrResult, nsu: e.target.value })}
                                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white font-mono"
                              />
                            </div>

                            <div>
                              <label className="block text-gray-700 font-bold mb-1">
                                Nº DOC
                                <HelpTooltip text="Número do Documento gerado pelo terminal POS para controle interno." />
                              </label>
                              <input
                                type="text"
                                placeholder="Ex: 000616"
                                value={ocrResult.doc_number || ""}
                                onChange={(e) => setOcrResult({ ...ocrResult, doc_number: e.target.value })}
                                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white font-mono"
                              />
                            </div>

                            <div>
                              <label className="block text-gray-700 font-bold mb-1">
                                Autorização (AUT)
                                <HelpTooltip text="Código emitido pela bandeira/banco emissor aprovando a compra. Aparece como AUT ou AUTO no comprovante." />
                              </label>
                              <input
                                type="text"
                                placeholder="Ex: 685327"
                                value={ocrResult.authorization_code || ""}
                                onChange={(e) => setOcrResult({ ...ocrResult, authorization_code: e.target.value })}
                                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white font-mono"
                              />
                            </div>
                          </div>

                          {/* 6. Observações (No final, full width) */}
                          <div>
                            <label className="block text-gray-700 font-bold mb-1">
                              Observações (Opcional)
                              <HelpTooltip text="Campo livre para anotações internas (ex: nº da OS, nome do cliente, venda balcão, etc.)." />
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: Venda balcão, OS 19327, etc."
                              value={ocrResult.notes || ""}
                              onChange={(e) => setOcrResult({ ...ocrResult, notes: e.target.value })}
                              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white"
                            />
                          </div>
                        </div>

                        {/* Botões de Ação */}
                        <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                          <button
                            type="button"
                            onClick={() => {
                              setIsOcrModalOpen(false);
                              setOcrFile(null);
                              setOcrPreviewUrl(null);
                              setOcrResult(null);
                            }}
                            className="px-5 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold transition-all"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmOcrSale}
                            className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold hover:opacity-95 transition-all shadow-md shadow-emerald-600/20"
                          >
                            Confirmar & Gerar Recebível
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL 4: IMPORTAÇÃO DE EXTRATO DA MAQUININHA (CSV) */}
        {isCsvModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-5 md:p-7 shadow-2xl space-y-5 my-auto border border-gray-100">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl bg-blue-50 p-2 rounded-xl">📁</span>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Importar Extrato da Maquininha</h3>
                    <p className="text-xs text-gray-500">Conciliação inteligente e auditoria de taxas MDR cobradas</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsCsvModalOpen(false);
                    setCsvFile(null);
                    setCsvReport(null);
                  }}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold transition-all"
                >
                  ✕
                </button>
              </div>

              {/* Se o relatório pós-importação estiver pronto */}
              {csvReport ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-emerald-900 space-y-1">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <span className="text-lg">🎉</span>
                      Extrato processado e auditado com sucesso!
                    </div>
                    <p className="text-xs text-emerald-700">
                      Total de linhas analisadas no arquivo: <strong>{csvReport.totalRows}</strong>
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-green-50/70 border border-green-200 p-3.5 rounded-2xl">
                      <span className="text-xs font-semibold text-green-700 block">🟢 Vendas Conciliadas (Match)</span>
                      <p className="text-xl font-bold text-green-800 mt-1">{csvReport.matchedCount}</p>
                      <span className="text-[11px] text-green-600">Auditadas sem duplicar</span>
                    </div>

                    <div className="bg-blue-50/70 border border-blue-200 p-3.5 rounded-2xl">
                      <span className="text-xs font-semibold text-blue-700 block">🟡 Novas Vendas</span>
                      <p className="text-xl font-bold text-blue-800 mt-1">{csvReport.createdCount}</p>
                      <span className="text-[11px] text-blue-600">Inseridas na agenda</span>
                    </div>

                    <div
                      className={`p-3.5 rounded-2xl border ${
                        csvReport.divergenceCount > 0
                          ? "bg-red-50/70 border-red-200 text-red-900"
                          : "bg-purple-50/70 border-purple-200 text-purple-900"
                      }`}
                    >
                      <span className="text-xs font-semibold block">
                        {csvReport.divergenceCount > 0 ? "🔴 Taxas Divergentes" : "✓ Taxas Conferem"}
                      </span>
                      <p className="text-xl font-bold mt-1">
                        {csvReport.divergenceCount > 0
                          ? `+ ${Number(csvReport.totalFeeDifference || 0).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}`
                          : "0 divergências"}
                      </p>
                      <span className="text-[11px] opacity-80">
                        {csvReport.divergenceCount > 0
                          ? `${csvReport.divergenceCount} vendas cobradas a mais`
                          : "MDR 100% correto"}
                      </span>
                    </div>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-2xl flex justify-between items-center text-xs">
                    <div>
                      <span className="text-gray-500 block">Total Bruto do Lote</span>
                      <span className="font-bold text-gray-900 text-sm">
                        {Number(csvReport.totalGross || 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-500 block">Total Líquido Creditado</span>
                      <span className="font-bold text-emerald-600 text-sm">
                        {Number(csvReport.totalNet || 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCsvModalOpen(false);
                        setCsvFile(null);
                        setCsvReport(null);
                        setActiveTab("sales");
                      }}
                      className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:opacity-95 transition-all shadow-md shadow-primary/20"
                    >
                      Ver Vendas & Auditoria
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleImportCsv} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-gray-700 font-bold mb-1">
                      Maquininha de Destino
                      <HelpTooltip text="Selecione qual maquininha emitiu o extrato para aplicar as regras de taxas correspondentes." />
                    </label>
                    <select
                      required
                      value={csvTerminalId}
                      onChange={(e) => setCsvTerminalId(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary font-medium"
                    >
                      <option value="">Selecione a maquininha...</option>
                      {terminals.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({ACQUIRER_LABELS[t.acquirer]?.label || t.acquirer})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-700 font-bold mb-1">
                      Arquivo de Extrato (.CSV ou .TXT)
                      <HelpTooltip text="Exporte o relatório de vendas no portal da adquirente (Stone, Getnet, Cielo, Rede, PagBank, Mercado Pago, etc.) em formato CSV." />
                    </label>
                    <input
                      type="file"
                      required
                      accept=".csv, .txt"
                      onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 bg-white file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>

                  <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl text-[11px] text-slate-600 space-y-1.5">
                    <span className="font-bold text-slate-800 block">💡 Como funciona a conciliação inteligente:</span>
                    <ul className="list-disc list-inside space-y-1 text-slate-500">
                      <li>
                        <strong>Match em Cascata:</strong> Identifica vendas já cadastradas (por foto ou manual) usando Autorização, NSU/CV ou DOC e audita sem duplicar.
                      </li>
                      <li>
                        <strong>Auditoria de Taxa MDR:</strong> Compara a taxa contratada com o valor efetivamente cobrado pela operadora e alerta sobre cobranças indevidas.
                      </li>
                      <li>
                        <strong>Compatibilidade:</strong> Stone, Getnet, Cielo, Rede, PagBank, Mercado Pago, InfinitePay e adquirentes com extrato CSV padrão.
                      </li>
                    </ul>
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCsvModalOpen(false);
                        setCsvFile(null);
                      }}
                      className="px-5 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={csvParsing || !csvFile || !csvTerminalId}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-bold transition-all shadow-md shadow-blue-600/20 flex items-center gap-2"
                    >
                      {csvParsing ? (
                        <>
                          <span className="animate-spin">⚙️</span> Conciliando & Auditando...
                        </>
                      ) : (
                        <>
                          <span>🚀</span> Importar e Auditar
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* MODAL 5: CONFIRMAR DEPÓSITO BANCÁRIO & FLUXO DE CAIXA (FASE 3) */}
        {isSettlementModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-lg w-full p-5 md:p-7 shadow-2xl space-y-5 my-auto border border-gray-100">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl bg-emerald-50 p-2 rounded-xl">🏦</span>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Confirmar Depósito no Banco</h3>
                    <p className="text-xs text-gray-500">Liquidação de recebíveis e integração com Fluxo de Caixa</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSettlementModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold transition-all"
                >
                  ✕
                </button>
              </div>

              {/* Resumo do Lote de Parcelas */}
              {(() => {
                const targetInsts = installments.filter((i) => selectedInstallmentIds.includes(i.id));
                const sumGross = targetInsts.reduce((acc, i) => acc + Number(i.gross_amount), 0);
                const sumFee = targetInsts.reduce((acc, i) => acc + Number(i.fee_amount), 0);
                const sumNet = targetInsts.reduce((acc, i) => acc + Number(i.net_amount), 0);

                return (
                  <div className="space-y-4">
                    <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center text-xs text-emerald-800">
                        <span>Quantidade de Parcelas:</span>
                        <span className="font-bold">{targetInsts.length} parcela(s)</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-600">
                        <span>Valor Bruto Total:</span>
                        <span className="font-medium">
                          {sumGross.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-red-600">
                        <span>Desconto de Taxas MDR:</span>
                        <span className="font-medium">
                          - {sumFee.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-emerald-200/80 flex justify-between items-center">
                        <span className="text-xs font-bold text-emerald-900">Crédito Líquido no Banco:</span>
                        <span className="text-lg font-bold text-emerald-700">
                          {sumNet.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                      </div>
                    </div>

                    <form onSubmit={handleExecuteSettlement} className="space-y-4 text-xs">
                      <div>
                        <label className="block text-gray-700 font-bold mb-1">
                          Conta Bancária de Destino *
                          <HelpTooltip text="Selecione a conta corrente onde o dinheiro das vendas caiu ou foi creditado." />
                        </label>
                        <select
                          required
                          value={settlementForm.bank_account_id}
                          onChange={(e) =>
                            setSettlementForm({ ...settlementForm, bank_account_id: e.target.value })
                          }
                          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary font-medium"
                        >
                          <option value="">Selecione uma conta bancária...</option>
                          {bankAccounts.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} {b.bank_name ? `(${b.bank_name})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-gray-700 font-bold mb-1">
                          Data Efetiva do Depósito *
                          <HelpTooltip text="Data em que o valor compensou na sua conta bancária." />
                        </label>
                        <input
                          type="date"
                          required
                          value={settlementForm.settlement_date}
                          onChange={(e) =>
                            setSettlementForm({ ...settlementForm, settlement_date: e.target.value })
                          }
                          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white focus:outline-primary font-medium"
                        />
                      </div>

                      {/* Opção de Criar Transação no Fluxo de Caixa */}
                      <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-2xl flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          id="create_transaction_check"
                          checked={settlementForm.create_transaction}
                          onChange={(e) =>
                            setSettlementForm({ ...settlementForm, create_transaction: e.target.checked })
                          }
                          className="rounded text-primary focus:ring-primary w-4 h-4 mt-0.5 cursor-pointer"
                        />
                        <label htmlFor="create_transaction_check" className="cursor-pointer">
                          <span className="font-bold text-gray-800 block">Lançar no Fluxo de Caixa / Transações</span>
                          <span className="text-[11px] text-gray-500 block mt-0.5">
                            Cria automaticamente uma entrada de receita conciliada no valor líquido na conta bancária selecionada.
                          </span>
                        </label>
                      </div>

                      <div>
                        <label className="block text-gray-700 font-bold mb-1">
                          Observações (Opcional)
                          <HelpTooltip text="Anotações internas sobre o lote ou liquidação." />
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Depósito em lote Stone ref. vendas de fim de semana"
                          value={settlementForm.notes}
                          onChange={(e) =>
                            setSettlementForm({ ...settlementForm, notes: e.target.value })
                          }
                          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white"
                        />
                      </div>

                      <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => setIsSettlementModalOpen(false)}
                          className="px-5 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold transition-all"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={settling || !settlementForm.bank_account_id}
                          className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2"
                        >
                          {settling ? (
                            <>
                              <span className="animate-spin">⚙️</span> Liquidando...
                            </>
                          ) : (
                            <>
                              <span>✓</span> Confirmar Depósito
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* MODAL 6: RELATÓRIO DE AUTO-CONCILIAÇÃO BANCÁRIA (FASE 3) */}
        {isAutoReconcileModalOpen && autoReconcileReport && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-5 md:p-7 shadow-2xl space-y-5 my-auto border border-gray-100">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl bg-emerald-50 p-2 rounded-xl">🏦</span>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Auto-Conciliação com Extrato Bancário</h3>
                    <p className="text-xs text-gray-500">Resultado do cruzamento de extrato bancário com a agenda</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAutoReconcileModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold transition-all"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-emerald-900 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <span className="text-lg">🎉</span>
                    Cruzamento bancário concluído com sucesso!
                  </div>
                  <p className="text-xs text-emerald-700">
                    O sistema analisou os créditos bancários e vinculou automaticamente aos recebíveis de cartões agendados.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-green-50/70 border border-green-200 p-3.5 rounded-2xl">
                    <span className="text-xs font-semibold text-green-700 block">Depósitos no Extrato</span>
                    <p className="text-xl font-bold text-green-800 mt-1">
                      {autoReconcileReport.matchedBankTransactionsCount}
                    </p>
                    <span className="text-[11px] text-green-600">Créditos identificados</span>
                  </div>

                  <div className="bg-blue-50/70 border border-blue-200 p-3.5 rounded-2xl">
                    <span className="text-xs font-semibold text-blue-700 block">Parcelas Liquidadas</span>
                    <p className="text-xl font-bold text-blue-800 mt-1">
                      {autoReconcileReport.settledInstallmentsCount}
                    </p>
                    <span className="text-[11px] text-blue-600">Baixadas no cronograma</span>
                  </div>

                  <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-2xl">
                    <span className="text-xs font-semibold text-emerald-700 block">Total Conciliado</span>
                    <p className="text-xl font-bold text-emerald-800 mt-1">
                      {Number(autoReconcileReport.totalSettledAmount || 0).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </p>
                    <span className="text-[11px] text-emerald-600">Depositado na conta</span>
                  </div>
                </div>

                {autoReconcileReport.matches && autoReconcileReport.matches.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-700 uppercase">Detalhamento dos Matches Realizados:</h4>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                      {autoReconcileReport.matches.map((m: any, idx: number) => (
                        <div
                          key={idx}
                          className="bg-gray-50 border border-gray-200/80 p-3 rounded-xl flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-gray-900 block">{m.transaction_description}</span>
                            <span className="text-gray-500 text-[11px]">
                              Data: {new Date(m.date + "T12:00:00").toLocaleDateString("pt-BR")} • {m.matched_installments_count} parcela(s) associada(s)
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-emerald-600 text-sm">
                              {Number(m.amount).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </span>
                            <span className="block text-[10px] text-gray-400">Match por {m.match_type}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 p-6 rounded-2xl text-center text-xs text-gray-500">
                    Nenhum crédito bancário não vinculado correspondente foi encontrado para o período de {periodLabel}.
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsAutoReconcileModalOpen(false)}
                    className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:opacity-95 transition-all shadow-md shadow-primary/20"
                  >
                    Fechar e Ver Recebíveis
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 7: SIMULADOR & BAIXA DE ANTECIPAÇÃO DE RECEBÍVEIS (FASE 4) */}
        {isAnticipationModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-5 md:p-7 shadow-2xl space-y-5 my-auto border border-gray-100">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl bg-purple-50 p-2 rounded-xl">🚀</span>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Simulador de Antecipação de Recebíveis</h3>
                    <p className="text-xs text-gray-500">
                      Calcule o custo financeiro da taxa e libere o crédito imediato no banco
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAnticipationModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold transition-all"
                >
                  ✕
                </button>
              </div>

              {(() => {
                const targetInsts = installments.filter((i) => selectedInstallmentIds.includes(i.id));
                const rateNum = parseFloat(anticipationMonthlyRate.replace(",", ".")) || 0;
                const calcResult = calculateAnticipation(
                  targetInsts,
                  rateNum,
                  new Date(anticipationDate + "T12:00:00")
                );

                return (
                  <form onSubmit={handleExecuteAnticipation} className="space-y-4 text-xs">
                    {/* Parâmetros da Simulação */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-3.5 rounded-2xl border border-gray-200">
                      <div>
                        <label className="block text-gray-700 font-bold mb-1">
                          Taxa de Antecipação (% ao mês) *
                          <HelpTooltip text="Taxa mensal cobrada pela maquininha ou banco para adiantar o pagamento." />
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            placeholder="Ex: 1.89"
                            value={anticipationMonthlyRate}
                            onChange={(e) => setAnticipationMonthlyRate(e.target.value)}
                            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white font-bold text-sm"
                          />
                          <span className="absolute right-3 top-2 text-gray-400 font-bold">% a.m.</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-gray-700 font-bold mb-1">
                          Data do Crédito na Conta *
                          <HelpTooltip text="Data em que o valor antecipado cairá na sua conta bancária." />
                        </label>
                        <input
                          type="date"
                          required
                          value={anticipationDate}
                          onChange={(e) => setAnticipationDate(e.target.value)}
                          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white font-medium"
                        />
                      </div>
                    </div>

                    {/* Resumo do Cálculo em Cards */}
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="bg-gray-50 border border-gray-200 p-3 rounded-xl">
                        <span className="text-[10px] uppercase font-bold text-gray-400 block">Líquido Original</span>
                        <p className="text-base font-bold text-gray-800 mt-0.5">
                          {calcResult.totalOriginalNet.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </p>
                        <span className="text-[10px] text-gray-500">{targetInsts.length} parcela(s)</span>
                      </div>

                      <div className="bg-red-50 border border-red-200 p-3 rounded-xl">
                        <span className="text-[10px] uppercase font-bold text-red-500 block">Custo de Juros / Taxa</span>
                        <p className="text-base font-bold text-red-600 mt-0.5">
                          -{" "}
                          {calcResult.totalAnticipationFee.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </p>
                        <span className="text-[10px] text-red-500">Desconto financeiro</span>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-300 p-3 rounded-xl">
                        <span className="text-[10px] uppercase font-bold text-emerald-700 block">Receber Hoje</span>
                        <p className="text-base font-bold text-emerald-700 mt-0.5">
                          {calcResult.totalFinalNet.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </p>
                        <span className="text-[10px] text-emerald-600 font-medium">Crédito no banco</span>
                      </div>
                    </div>

                    {/* Tabela de Parcelas Selecionadas e Detalhamento Pró-Rata */}
                    <div className="border border-gray-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 sticky top-0">
                          <tr>
                            <th className="p-2">Parcela</th>
                            <th className="p-2">Vencimento Original</th>
                            <th className="p-2 text-center">Dias Adiantados</th>
                            <th className="p-2 text-right">Taxa Efetiva</th>
                            <th className="p-2 text-right">Líquido Final</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {calcResult.items.map((item) => (
                            <tr key={item.installment.id} className="hover:bg-gray-50/60">
                              <td className="p-2 font-medium text-gray-800">
                                {item.installment.installment_number}/{item.installment.total_installments} •{" "}
                                {item.installment.sale?.terminal?.name || "Cartão"}
                              </td>
                              <td className="p-2 text-gray-600">
                                {new Date(item.installment.expected_date + "T12:00:00").toLocaleDateString("pt-BR")}
                              </td>
                              <td className="p-2 text-center font-bold text-purple-700">{item.daysToMaturity} dias</td>
                              <td className="p-2 text-right text-red-500 font-medium">
                                - {item.effectiveRatePercentage}% (
                                {item.anticipationFeeAmount.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })}
                                )
                              </td>
                              <td className="p-2 text-right font-bold text-emerald-600">
                                {item.finalNetAmount.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Seleção de Conta Bancária */}
                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Conta Bancária de Crédito *
                        <HelpTooltip text="Conta onde o valor líquido da antecipação será creditado hoje." />
                      </label>
                      <select
                        required
                        value={anticipationBankId}
                        onChange={(e) => setAnticipationBankId(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white font-medium"
                      >
                        <option value="">Selecione a conta bancária...</option>
                        {bankAccounts.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} {b.bank_name ? `(${b.bank_name})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 font-bold mb-1">
                        Observações (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Antecipação pontual para pagamento de fornecedores"
                        value={anticipationNotes}
                        onChange={(e) => setAnticipationNotes(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white"
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setIsAnticipationModalOpen(false)}
                        className="px-5 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={anticipating || !anticipationBankId || calcResult.totalFinalNet <= 0}
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-95 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-md shadow-purple-600/20 flex items-center gap-2"
                      >
                        {anticipating ? (
                          <>
                            <span className="animate-spin">⚙️</span> Efetivando Antecipação...
                          </>
                        ) : (
                          <>
                            <span>🚀</span> Confirmar & Efetivar Antecipação
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                );
              })()}
            </div>
          </div>
        )}

        {/* MODAL 8: REGISTRAR CANCELAMENTO OU CHARGEBACK (FASE 4) */}
        {isChargebackModalOpen && selectedSaleForChargeback && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-md w-full p-5 md:p-7 shadow-2xl space-y-5 my-auto border border-gray-100">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl bg-red-50 p-2 rounded-xl">⚠️</span>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Contestação / Cancelamento</h3>
                    <p className="text-xs text-gray-500">Gerenciamento de estorno e chargeback de cartão</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsChargebackModalOpen(false);
                    setSelectedSaleForChargeback(null);
                  }}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold transition-all"
                >
                  ✕
                </button>
              </div>

              {/* Informações da Venda */}
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 text-xs space-y-1">
                <div className="flex justify-between font-bold text-gray-900">
                  <span>Valor da Venda:</span>
                  <span>
                    {Number(selectedSaleForChargeback.gross_amount).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Data:</span>
                  <span>{new Date(selectedSaleForChargeback.sale_date).toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Maquininha:</span>
                  <span>{selectedSaleForChargeback.terminal?.name || "Cartão"}</span>
                </div>
                {selectedSaleForChargeback.nsu && (
                  <div className="flex justify-between text-gray-500">
                    <span>NSU:</span>
                    <span className="font-mono">{selectedSaleForChargeback.nsu}</span>
                  </div>
                )}
              </div>

              <form onSubmit={handleExecuteChargeback} className="space-y-4 text-xs">
                <div>
                  <label className="block text-gray-700 font-bold mb-1.5">Tipo de Ocorrência *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setChargebackAction("chargeback")}
                      className={`p-3 rounded-xl border text-center font-bold transition-all ${
                        chargebackAction === "chargeback"
                          ? "bg-red-50 border-red-500 text-red-700 ring-2 ring-red-500/20 shadow-xs"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <span className="block text-base mb-0.5">⚠️</span>
                      Chargeback
                      <span className="block text-[10px] font-normal text-gray-500 mt-0.5">
                        Contestado pelo cliente
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setChargebackAction("cancel")}
                      className={`p-3 rounded-xl border text-center font-bold transition-all ${
                        chargebackAction === "cancel"
                          ? "bg-gray-100 border-gray-600 text-gray-900 ring-2 ring-gray-600/20 shadow-xs"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <span className="block text-base mb-0.5">❌</span>
                      Cancelamento
                      <span className="block text-[10px] font-normal text-gray-500 mt-0.5">
                        Devolução amigável
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-1">
                    Motivo / Justificativa (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Cliente alegou não reconhecer a transação / Produto devolvido"
                    value={chargebackReason}
                    onChange={(e) => setChargebackReason(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white"
                  />
                </div>

                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[11px] text-amber-800 space-y-1">
                  <span className="font-bold block">💡 O que o sistema fará:</span>
                  <p>
                    As parcelas agendadas ainda não liquidadas desta venda serão canceladas da sua agenda de
                    recebíveis futuros para não distorcer o fluxo de caixa.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsChargebackModalOpen(false);
                      setSelectedSaleForChargeback(null);
                    }}
                    className="px-5 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold transition-all"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={chargebackSubmitting}
                    className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-md shadow-red-600/20 flex items-center gap-2"
                  >
                    {chargebackSubmitting ? (
                      <>
                        <span className="animate-spin">⚙️</span> Registrando...
                      </>
                    ) : (
                      <>
                        <span>✓</span> Confirmar Ocorrência
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Navigation>
  );
}
