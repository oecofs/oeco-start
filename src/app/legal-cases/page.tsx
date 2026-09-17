"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import Navigation from "@/components/Navigation";
import { uploadFinancialDocument } from "@/lib/storage/attachments";
import DocumentAttachmentViewer from "@/components/DocumentAttachmentViewer";

export type LegalCase = {
  id: string;
  company_id: string;
  case_number: string;
  client_name: string;
  client_document: string | null;
  client_phone: string | null;
  court_courtroom: string | null;
  action_type: string | null;
  status: "active" | "closed" | "suspended";
  notes: string | null;
  created_at: string;
  // Fase 4: Pipeline de Êxito & Previsibilidade
  claim_value?: number | null;
  expected_fee_rate?: number | null;
  current_phase?: "initial" | "instruction" | "sentence" | "appeal" | "execution" | "settled" | null;
  probability?: "high" | "medium" | "low" | null;
  estimated_conclusion_date?: string | null;
  // Fase 4 (Ajustes): Áreas do Direito & Banca de Advogados
  practice_area?: string | null;
  responsible_lawyer?: string | null;
};

const PRACTICE_AREA_LABELS: Record<string, string> = {
  civel: "Cível & Consumidor",
  trabalhista: "Trabalhista",
  previdenciario: "Previdenciário (INSS)",
  tributario: "Tributário",
  familia: "Família & Sucessões",
  penal: "Penal & Criminal",
  imobiliario: "Imobiliário",
  empresarial: "Empresarial & Societário",
};

export type LegalFeeSplit = {
  id: string;
  company_id: string;
  legal_case_id: string;
  settlement_id: string | null;
  partner_name: string;
  partner_role: "partner" | "captador" | "correspondent" | "associate" | "expert";
  partner_pix_or_bank: string | null;
  split_type: "percentage" | "fixed";
  split_percentage: number;
  split_amount: number;
  payable_id: string | null;
  status: "pending" | "scheduled" | "paid";
  notes: string | null;
  created_at: string;
};

export type SettlementSplitInput = {
  id: string;
  partner_name: string;
  partner_role: "partner" | "captador" | "correspondent" | "associate" | "expert";
  partner_pix_or_bank: string;
  split_type: "percentage" | "fixed";
  split_percentage: number;
  split_amount: number;
};

export type LegalExpense = {
  id: string;
  source: "payable" | "transaction";
  case_id: string;
  description: string;
  amount: number;
  date: string;
  refund_status: "pending" | "invoiced" | "refunded" | "non_refundable";
  attachment_url: string | null;
  attachment_type?: string | null;
  raw_item: any;
};

export type LegalSettlement = {
  id: string;
  company_id: string;
  legal_case_id: string;
  settlement_number: string | null;
  issue_date: string;
  gross_amount: number;
  contractual_fee_rate: number;
  contractual_fee_amount: number;
  succumbence_fee_amount: number;
  deducted_costs_amount: number;
  net_client_amount: number;
  client_name: string;
  client_pix_or_bank: string | null;
  client_payable_id: string | null;
  status: "draft" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
};

const PIPELINE_COLUMNS = [
  {
    id: "initial" as const,
    label: "1. Petição Inicial",
    icon: "📝",
    color: "border-blue-400 bg-blue-50/20",
    badge: "bg-blue-100 text-blue-800",
    next: "instruction" as const,
    nextLabel: "Instrução",
  },
  {
    id: "instruction" as const,
    label: "2. Instrução & Provas",
    icon: "🔍",
    color: "border-sky-400 bg-sky-50/20",
    badge: "bg-sky-100 text-sky-800",
    next: "sentence" as const,
    nextLabel: "Sentença",
  },
  {
    id: "sentence" as const,
    label: "3. Sentença / Acórdão",
    icon: "⚖️",
    color: "border-indigo-400 bg-indigo-50/20",
    badge: "bg-indigo-100 text-indigo-800",
    next: "appeal" as const,
    nextLabel: "Recursos",
  },
  {
    id: "appeal" as const,
    label: "4. Fase Recursal",
    icon: "🏛️",
    color: "border-purple-400 bg-purple-50/20",
    badge: "bg-purple-100 text-purple-800",
    next: "execution" as const,
    nextLabel: "Execução",
  },
  {
    id: "execution" as const,
    label: "5. Execução & Alvará",
    icon: "💰",
    color: "border-amber-400 bg-amber-50/30",
    badge: "bg-amber-100 text-amber-800",
    next: "settled" as const,
    nextLabel: "Concluir",
  },
] as const;

export default function LegalCasesPage() {
  const supabase = createClient();
  const router = useRouter();
  const { selectedCompany, isMaster } = useCompany();

  // Abas principais: 'cases' (Processos & Custas), 'settlements' (Central de Alvarás & RPVs) e 'pipeline' (Pipeline de Êxito)
  const [activeTab, setActiveTab] = useState<"cases" | "settlements" | "pipeline">("cases");

  const [cases, setCases] = useState<LegalCase[]>([]);
  const [expenses, setExpenses] = useState<LegalExpense[]>([]);
  const [settlements, setSettlements] = useState<LegalSettlement[]>([]);
  const [feeSplits, setFeeSplits] = useState<LegalFeeSplit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [settlementSearchTerm, setSettlementSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending_refunds" | "active" | "closed">("all");

  // Configurações da empresa (chave Pix, patrono e OAB)
  const [officePixKey, setOfficePixKey] = useState("");
  const [officePatronName, setOfficePatronName] = useState("");
  const [officeOabNumber, setOfficeOabNumber] = useState("");
  const [officePracticeAreas, setOfficePracticeAreas] = useState<string[]>([
    "civel",
    "trabalhista",
    "previdenciario",
    "tributario",
    "familia",
    "penal",
  ]);
  const [officeLawyers, setOfficeLawyers] = useState<Array<{ id: string; name: string; oab: string; role: string }>>([]);
  const [officeSignatureMode, setOfficeSignatureMode] = useState<"responsible" | "firm" | "all">("responsible");

  // Filtro por Área de Atuação ('all' ou id da área)
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>("all");

  // Modal de Cadastro/Edição de Processo (com campos de Pipeline de Êxito)
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [editingCase, setEditingCase] = useState<LegalCase | null>(null);
  const [caseNumber, setCaseNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientDocument, setClientDocument] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [courtCourtroom, setCourtCourtroom] = useState("");
  const [actionType, setActionType] = useState("");
  const [practiceArea, setPracticeArea] = useState<string>("civel");
  const [responsibleLawyer, setResponsibleLawyer] = useState<string>("");
  const [caseStatus, setCaseStatus] = useState<"active" | "closed" | "suspended">("active");
  const [caseNotes, setCaseNotes] = useState("");
  // Fase 4: Pipeline
  const [claimValue, setClaimValue] = useState("");
  const [expectedFeeRate, setExpectedFeeRate] = useState("30");
  const [currentPhase, setCurrentPhase] = useState<"initial" | "instruction" | "sentence" | "appeal" | "execution" | "settled">("initial");
  const [probability, setProbability] = useState<"high" | "medium" | "low">("medium");
  const [estimatedConclusionDate, setEstimatedConclusionDate] = useState("");
  const [savingCase, setSavingCase] = useState(false);

  // Modal de Prestação de Contas & Reembolso
  const [statementCase, setStatementCase] = useState<LegalCase | null>(null);
  const [customPixKey, setCustomPixKey] = useState("");
  const [updatingRefund, setUpdatingRefund] = useState(false);

  // Modal de Nova Custa Direta para o Processo
  const [newCostCase, setNewCostCase] = useState<LegalCase | null>(null);
  const [costDescription, setCostDescription] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [costDueDate, setCostDueDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [costPaymentMethod, setCostPaymentMethod] = useState<"boleto" | "pix" | "other">("boleto");
  const [costBarcodeOrPix, setCostBarcodeOrPix] = useState("");
  const [costFile, setCostFile] = useState<File | null>(null);
  const [costLink, setCostLink] = useState("");
  const [costAttachmentMode, setCostAttachmentMode] = useState<"file" | "link">("file");
  const [savingCost, setSavingCost] = useState(false);

  // --- FASE 3 & 4: MODAL DE LIQUIDAÇÃO DE ALVARÁ COM SPLITS ---
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementCaseId, setSettlementCaseId] = useState("");
  const [settlementNumber, setSettlementNumber] = useState("");
  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [settlementGrossAmount, setSettlementGrossAmount] = useState("");
  const [settlementFeeRate, setSettlementFeeRate] = useState("30");
  const [settlementSuccumbence, setSettlementSuccumbence] = useState("0");
  const [settlementDeductPendingCosts, setSettlementDeductPendingCosts] = useState(true);
  const [settlementClientPix, setSettlementClientPix] = useState("");
  const [settlementDueDate, setSettlementDueDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [settlementNotes, setSettlementNotes] = useState("");
  const [settlementSplits, setSettlementSplits] = useState<SettlementSplitInput[]>([]);
  const [savingSettlement, setSavingSettlement] = useState(false);

  // Termo de Quitação & Prestação de Contas (Alvará liquidado)
  const [receiptSettlement, setReceiptSettlement] = useState<LegalSettlement | null>(null);

  // Checkbox para incluir guias/comprovantes anexados na impressão do PDF
  const [includeAttachmentsInStatement, setIncludeAttachmentsInStatement] = useState(true);
  const [includeAttachmentsInSettlement, setIncludeAttachmentsInSettlement] = useState(true);

  // Preview de Anexo
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Carrega dados gerais
  const loadData = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);

    try {
      const compId = selectedCompany.id;

      // 1. Busca Processos
      const { data: casesData, error: cErr } = await supabase
        .from("legal_cases")
        .select("*")
        .eq("company_id", compId)
        .order("created_at", { ascending: false });

      if (cErr) console.error("Erro ao carregar processos:", cErr);

      // 2. Busca Custas Reembolsáveis em Payables
      const { data: payablesData, error: pErr } = await supabase
        .from("payables")
        .select("*")
        .eq("company_id", compId)
        .eq("is_refundable_cost", true)
        .eq("is_active", true);

      if (pErr) console.error("Erro ao carregar payables reembolsáveis:", pErr);

      // 3. Busca Custas Reembolsáveis em Transactions
      const { data: trxData, error: tErr } = await supabase
        .from("transactions")
        .select("*")
        .eq("company_id", compId)
        .eq("is_refundable_cost", true);

      if (tErr) console.error("Erro ao carregar transações reembolsáveis:", tErr);

      // 4. Busca Liquidações de Alvarás / RPVs (legal_settlements)
      const { data: settlementsData, error: sErr } = await supabase
        .from("legal_settlements")
        .select("*")
        .eq("company_id", compId)
        .order("issue_date", { ascending: false });

      if (sErr) console.error("Erro ao carregar liquidações de alvarás:", sErr);
      setSettlements(settlementsData || []);

      // 5. Busca Splits de Honorários (legal_fee_splits)
      const { data: splitsData } = await supabase
        .from("legal_fee_splits")
        .select("*")
        .eq("company_id", compId)
        .order("created_at", { ascending: false });

      setFeeSplits(splitsData || []);

      // 6. Busca Configurações da Empresa (Pix, Patrono da Causa, OAB, Banca e Áreas)
      const { data: setts } = await supabase
        .from("settings")
        .select("bank_name, company_name, legal_patron_name, legal_oab_number, legal_practice_areas, legal_lawyers, legal_signature_mode")
        .eq("company_id", compId)
        .maybeSingle();

      if (setts) {
        setOfficePixKey(setts.bank_name || "");
        setOfficePatronName(setts.legal_patron_name || setts.company_name || selectedCompany.name || "");
        setOfficeOabNumber(setts.legal_oab_number || "");
        if (Array.isArray(setts.legal_practice_areas) && setts.legal_practice_areas.length > 0) {
          setOfficePracticeAreas(setts.legal_practice_areas);
        }
        if (Array.isArray(setts.legal_lawyers)) {
          setOfficeLawyers(setts.legal_lawyers);
        }
        if (setts.legal_signature_mode) {
          setOfficeSignatureMode(setts.legal_signature_mode);
        }
      } else {
        setOfficePatronName(selectedCompany.name || "");
        setOfficeOabNumber("");
      }

      setCases(casesData || []);

      // Unifica despesas de payables e transactions
      const mappedExpenses: LegalExpense[] = [];

      (payablesData || []).forEach((p) => {
        if (p.legal_case_id) {
          mappedExpenses.push({
            id: p.id,
            source: "payable",
            case_id: p.legal_case_id,
            description: p.description || p.supplier_name || "Custa Processual",
            amount: Number(p.amount),
            date: p.due_date,
            refund_status: p.refund_status || "pending",
            attachment_url: p.attachment_url,
            attachment_type: p.attachment_type,
            raw_item: p,
          });
        }
      });

      (trxData || []).forEach((t) => {
        // Evita duplicar se a transação já estiver vinculada a um payable que foi contabilizado
        const alreadyInPayables = (payablesData || []).some((p) => p.id === t.payable_id);
        if (t.legal_case_id && !alreadyInPayables) {
          mappedExpenses.push({
            id: t.id,
            source: "transaction",
            case_id: t.legal_case_id,
            description: t.description || "Despesa Judicial",
            amount: Math.abs(Number(t.amount)),
            date: t.date,
            refund_status: t.refund_status || "pending",
            attachment_url: null,
            raw_item: t,
          });
        }
      });

      setExpenses(mappedExpenses);
    } catch (err) {
      console.error("Erro ao carregar dados jurídicos:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cálculos de Totais e KPIs
  const kpis = useMemo(() => {
    let pendingRefundAmount = 0;
    let invoicedAmount = 0;
    let refundedAmount = 0;
    const casesWithPending = new Set<string>();

    expenses.forEach((e) => {
      if (e.refund_status === "pending") {
        pendingRefundAmount += e.amount;
        casesWithPending.add(e.case_id);
      } else if (e.refund_status === "invoiced") {
        invoicedAmount += e.amount;
        casesWithPending.add(e.case_id);
      } else if (e.refund_status === "refunded") {
        refundedAmount += e.amount;
      }
    });

    const activeCasesCount = cases.filter((c) => c.status === "active").length;

    return {
      pendingRefundAmount,
      invoicedAmount,
      refundedAmount,
      casesWithPendingCount: casesWithPending.size,
      activeCasesCount,
    };
  }, [cases, expenses]);

  // Mapeamento de Custas por Processo
  const caseExpensesMap = useMemo(() => {
    const map = new Map<string, { total: number; pending: number; refunded: number; list: LegalExpense[] }>();

    expenses.forEach((e) => {
      const current = map.get(e.case_id) || { total: 0, pending: 0, refunded: 0, list: [] };
      current.total += e.amount;
      if (e.refund_status === "pending" || e.refund_status === "invoiced") {
        current.pending += e.amount;
      } else if (e.refund_status === "refunded") {
        current.refunded += e.amount;
      }
      current.list.push(e);
      map.set(e.case_id, current);
    });

    return map;
  }, [expenses]);

  // Processos filtrados
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      // Filtro por Área de Atuação
      if (selectedAreaFilter !== "all" && (c.practice_area || "civel") !== selectedAreaFilter) {
        return false;
      }

      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.case_number.toLowerCase().includes(q) ||
        c.client_name.toLowerCase().includes(q) ||
        (c.court_courtroom && c.court_courtroom.toLowerCase().includes(q)) ||
        (c.action_type && c.action_type.toLowerCase().includes(q)) ||
        (c.responsible_lawyer && c.responsible_lawyer.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      const expInfo = caseExpensesMap.get(c.id);
      const hasPending = expInfo && expInfo.pending > 0;

      if (statusFilter === "pending_refunds") return hasPending;
      if (statusFilter === "active") return c.status === "active";
      if (statusFilter === "closed") return c.status === "closed";

      return true;
    });
  }, [cases, searchTerm, statusFilter, selectedAreaFilter, caseExpensesMap]);

  // Alvarás e Liquidações filtrados pela busca
  const filteredSettlements = useMemo(() => {
    if (!settlementSearchTerm.trim()) return settlements;
    const term = settlementSearchTerm.toLowerCase().trim();
    return settlements.filter((st) => {
      const linkedCase = cases.find((c) => c.id === st.legal_case_id);
      return (
        st.client_name?.toLowerCase().includes(term) ||
        st.settlement_number?.toLowerCase().includes(term) ||
        linkedCase?.case_number?.toLowerCase().includes(term) ||
        st.issue_date?.includes(term) ||
        st.notes?.toLowerCase().includes(term)
      );
    });
  }, [settlements, cases, settlementSearchTerm]);

  // Pipeline de Êxito: métricas e agrupamento por fase processual
  const pipelineData = useMemo(() => {
    let totalClaimValue = 0;
    let totalExpectedFees = 0;
    let totalWeightedFees = 0;
    let readyForAlvaraFees = 0;

    const phaseMap: Record<
      "initial" | "instruction" | "sentence" | "appeal" | "execution" | "settled",
      LegalCase[]
    > = {
      initial: [],
      instruction: [],
      sentence: [],
      appeal: [],
      execution: [],
      settled: [],
    };

    const scopedCases =
      selectedAreaFilter === "all"
        ? cases
        : cases.filter((c) => (c.practice_area || "civel") === selectedAreaFilter);

    scopedCases.forEach((c) => {
      const claim = Number(c.claim_value) || 0;
      const feeRate = Number(c.expected_fee_rate) || 30;
      const expectedFee = (claim * feeRate) / 100;

      // Peso por probabilidade
      const probWeight =
        c.probability === "high" ? 0.8 : c.probability === "low" ? 0.2 : 0.5;
      const weightedFee = expectedFee * probWeight;

      const phase = c.current_phase || "initial";
      if (phaseMap[phase]) {
        phaseMap[phase].push(c);
      } else {
        phaseMap.initial.push(c);
      }

      if (c.status === "active" && phase !== "settled") {
        totalClaimValue += claim;
        totalExpectedFees += expectedFee;
        totalWeightedFees += weightedFee;

        if (phase === "execution") {
          readyForAlvaraFees += expectedFee;
        }
      }
    });

    return {
      totalClaimValue,
      totalExpectedFees,
      totalWeightedFees,
      readyForAlvaraFees,
      phaseMap,
    };
  }, [cases, selectedAreaFilter]);

  // Avançar fase do processo rapidamente pelo Pipeline
  const handleAdvancePhase = async (
    c: LegalCase,
    newPhase: "initial" | "instruction" | "sentence" | "appeal" | "execution" | "settled"
  ) => {
    try {
      const { error } = await supabase
        .from("legal_cases")
        .update({ current_phase: newPhase })
        .eq("id", c.id);

      if (error) throw error;

      setCases((prev) =>
        prev.map((item) => (item.id === c.id ? { ...item, current_phase: newPhase } : item))
      );

      if (newPhase === "execution") {
        alert(`Processo ${c.case_number} avançou para a fase de Execução & Alvará!`);
      }
    } catch (err: any) {
      alert(`Erro ao avançar fase: ${err.message}`);
    }
  };

  // Abre Modal de Novo/Editar Processo
  const handleOpenCaseModal = (c?: LegalCase) => {
    if (c) {
      setEditingCase(c);
      setCaseNumber(c.case_number);
      setClientName(c.client_name);
      setClientDocument(c.client_document || "");
      setClientPhone(c.client_phone || "");
      setCourtCourtroom(c.court_courtroom || "");
      setActionType(c.action_type || "");
      setPracticeArea(c.practice_area || officePracticeAreas[0] || "civel");
      setResponsibleLawyer(c.responsible_lawyer || "");
      setCaseStatus(c.status);
      setCaseNotes(c.notes || "");
      // Fase 4
      setClaimValue(c.claim_value ? String(c.claim_value) : "");
      setExpectedFeeRate(c.expected_fee_rate ? String(c.expected_fee_rate) : "30");
      setCurrentPhase(c.current_phase || "initial");
      setProbability(c.probability || "medium");
      setEstimatedConclusionDate(c.estimated_conclusion_date || "");
    } else {
      setEditingCase(null);
      setCaseNumber("");
      setClientName("");
      setClientDocument("");
      setClientPhone("");
      setCourtCourtroom("");
      setActionType("");
      setPracticeArea(officePracticeAreas[0] || "civel");
      setResponsibleLawyer(officeLawyers[0]?.name || "");
      setCaseStatus("active");
      setCaseNotes("");
      // Fase 4
      setClaimValue("");
      setExpectedFeeRate("30");
      setCurrentPhase("initial");
      setProbability("medium");
      setEstimatedConclusionDate("");
    }
    setShowCaseModal(true);
  };

  // Salvar Processo
  const handleSaveCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    if (!caseNumber.trim() || !clientName.trim()) {
      alert("Informe o número do processo e o nome do cliente.");
      return;
    }

    setSavingCase(true);
    try {
      const cleanClaim = claimValue ? parseFloat(claimValue.replace(/\./g, "").replace(",", ".")) : 0;
      const cleanFeeRate = expectedFeeRate ? parseFloat(expectedFeeRate.replace(",", ".")) : 30;

      const payload = {
        company_id: selectedCompany.id,
        case_number: caseNumber.trim(),
        client_name: clientName.trim(),
        client_document: clientDocument.trim() || null,
        client_phone: clientPhone.trim() || null,
        court_courtroom: courtCourtroom.trim() || null,
        action_type: actionType.trim() || null,
        practice_area: practiceArea || null,
        responsible_lawyer: responsibleLawyer || null,
        status: caseStatus,
        notes: caseNotes.trim() || null,
        // Fase 4: Pipeline & Êxito
        claim_value: isNaN(cleanClaim) ? 0 : cleanClaim,
        expected_fee_rate: isNaN(cleanFeeRate) ? 30 : cleanFeeRate,
        current_phase: currentPhase,
        probability: probability,
        estimated_conclusion_date: estimatedConclusionDate || null,
      };

      if (editingCase) {
        const { error } = await supabase
          .from("legal_cases")
          .update(payload)
          .eq("id", editingCase.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("legal_cases").insert(payload);
        if (error) throw error;
      }

      setShowCaseModal(false);
      await loadData();
    } catch (err: any) {
      alert(`Erro ao salvar processo: ${err.message}`);
    } finally {
      setSavingCase(false);
    }
  };

  // Excluir Processo
  const handleDeleteCase = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este processo? As custas vinculadas terão o vínculo removido.")) return;

    try {
      const { error } = await supabase.from("legal_cases").delete().eq("id", id);
      if (error) throw error;
      await loadData();
    } catch (err: any) {
      alert(`Erro ao excluir processo: ${err.message}`);
    }
  };

  // Abre Modal de Prestação de Contas
  const handleOpenStatement = (c: LegalCase) => {
    setStatementCase(c);
    setCustomPixKey(officePixKey || "");
  };

  // Alterna status de reembolso de um item (pendente, cobrado, reembolsado)
  const handleUpdateRefundStatus = async (item: LegalExpense, newStatus: LegalExpense["refund_status"]) => {
    setUpdatingRefund(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const table = item.source === "payable" ? "payables" : "transactions";
      const updates: any = {
        refund_status: newStatus,
        ...(item.source === "payable" ? { refunded_at: newStatus === "refunded" ? today : null } : {}),
      };

      const { error } = await supabase.from(table).update(updates).eq("id", item.id);
      if (error) throw error;

      // Atualiza localmente
      setExpenses((prev) =>
        prev.map((e) => (e.id === item.id && e.source === item.source ? { ...e, refund_status: newStatus } : e))
      );
    } catch (err: any) {
      alert(`Erro ao atualizar status de reembolso: ${err.message}`);
    } finally {
      setUpdatingRefund(false);
    }
  };

  // Marcar todas as custas pendentes do processo como reembolsadas
  const handleMarkAllAsRefunded = async (caseId: string) => {
    if (!confirm("Confirmar que TODAS as custas pendentes deste processo foram reembolsadas pelo cliente?")) return;

    setUpdatingRefund(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      await Promise.all([
        supabase
          .from("payables")
          .update({ refund_status: "refunded", refunded_at: today })
          .eq("legal_case_id", caseId)
          .neq("refund_status", "refunded"),
        supabase
          .from("transactions")
          .update({ refund_status: "refunded" })
          .eq("legal_case_id", caseId)
          .neq("refund_status", "refunded"),
      ]);

      await loadData();
      alert("Todas as custas foram marcadas como reembolsadas com sucesso!");
    } catch (err: any) {
      alert(`Erro ao atualizar custas: ${err.message}`);
    } finally {
      setUpdatingRefund(false);
    }
  };

  // Gerar e Copiar Texto Formatado para WhatsApp
  const handleCopyWhatsAppMessage = (c: LegalCase) => {
    const expInfo = caseExpensesMap.get(c.id);
    const pendingItems = (expInfo?.list || []).filter(
      (e) => e.refund_status === "pending" || e.refund_status === "invoiced"
    );

    if (pendingItems.length === 0) {
      alert("Não há custas pendentes de reembolso para este processo.");
      return;
    }

    const itemsText = pendingItems
      .map(
        (it) =>
          `• ${formatDate(it.date)} — *${it.description}*: ${formatCurrency(it.amount)}`
      )
      .join("\n");

    const totalStr = formatCurrency(expInfo?.pending || 0);

    const text = `⚖️ *PRESTAÇÃO DE CONTAS — CUSTAS PROCESSUAIS*
*Processo:* ${c.case_number}
*Cliente:* ${c.client_name}${c.court_courtroom ? `\n*Vara / Fórum:* ${c.court_courtroom}` : ""}

Olá, *${c.client_name}*! Segue o demonstrativo das despesas e custas judiciais adiantadas pelo escritório em favor da sua causa:

${itemsText}

💰 *TOTAL A REEMBOLSAR: ${totalStr}*

${
  customPixKey.trim()
    ? `🔑 *Chave Pix para Reembolso:* \`${customPixKey.trim()}\`\n`
    : ""
}Todos os comprovantes oficiais e guias de recolhimento estão à disposição. 
Por gentileza, após a transferência, nos envie o comprovante para liquidação. Obrigado!`;

    navigator.clipboard.writeText(text);

    // Se o cliente tem WhatsApp cadastrado, abre diretamente o link do WhatsApp Web
    if (c.client_phone) {
      const cleanPhone = c.client_phone.replace(/\D/g, "");
      const fullPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
      const url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(text)}`;
      window.open(url, "_blank");
    } else {
      alert("Demonstrativo copiado para a área de transferência! Cole no WhatsApp do seu cliente.");
    }
  };

  // Salvar Custa Rápida Direta no Processo
  const handleSaveDirectCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !newCostCase) return;

    const numAmount = parseFloat(costAmount.replace(",", "."));
    if (!costDescription.trim() || isNaN(numAmount) || numAmount <= 0 || !costDueDate) {
      alert("Preencha a descrição, valor e data de vencimento válidos.");
      return;
    }

    setSavingCost(true);
    try {
      let attachmentUrl: string | null = null;
      let finalAttachmentType: "file" | "external_link" = costAttachmentMode === "link" ? "external_link" : "file";

      if (costAttachmentMode === "link" && costLink.trim()) {
        attachmentUrl = costLink.trim();
      } else if (costAttachmentMode === "file" && costFile) {
        const uploadRes = await uploadFinancialDocument(supabase, costFile, selectedCompany.id, "payables");
        attachmentUrl = uploadRes.url;
        finalAttachmentType = "file";
      }

      const baseMonth = costDueDate.slice(0, 7);

      const { error } = await supabase.from("payables").insert({
        company_id: selectedCompany.id,
        supplier_name: `Custa Judicial (${newCostCase.client_name})`,
        description: costDescription.trim(),
        amount: numAmount,
        due_date: costDueDate,
        month_ref: baseMonth,
        status: "open",
        barcode_or_pix: costBarcodeOrPix.trim() || null,
        attachment_url: attachmentUrl,
        attachment_type: finalAttachmentType,
        is_refundable_cost: true,
        legal_case_id: newCostCase.id,
        refund_status: "pending",
        notes: `Custa do Processo ${newCostCase.case_number}`,
      });

      if (error) throw error;

      setNewCostCase(null);
      setCostDescription("");
      setCostAmount("");
      setCostBarcodeOrPix("");
      setCostFile(null);
      setCostLink("");
      await loadData();
      alert("Custa processual registrada com sucesso no Contas a Pagar!");
    } catch (err: any) {
      alert(`Erro ao registrar custa: ${err.message}`);
    } finally {
      setSavingCost(false);
    }
  };

  // --- FASE 3 & 4: HANDLERS DE LIQUIDAÇÃO DE ALVARÁS & RPVs COM SPLITS ---
  const handleOpenSettlementModal = (preselectedCaseId?: string) => {
    const targetCaseId = preselectedCaseId || (cases.length > 0 ? cases[0].id : "");
    setSettlementCaseId(targetCaseId);
    setSettlementNumber("");
    setSettlementDate(new Date().toISOString().split("T")[0]);
    setSettlementGrossAmount("");
    setSettlementSuccumbence("0");
    setSettlementDeductPendingCosts(true);
    setSettlementDueDate(new Date().toISOString().split("T")[0]);
    setSettlementNotes("");
    setSettlementSplits([]);

    // Se já selecionou um processo, tenta preencher a chave Pix/banco do cliente e taxa contratada
    if (targetCaseId) {
      const selected = cases.find((c) => c.id === targetCaseId);
      if (selected) {
        setSettlementClientPix(selected.client_phone || "");
        if (selected.expected_fee_rate) {
          setSettlementFeeRate(String(selected.expected_fee_rate));
        } else {
          setSettlementFeeRate("30");
        }
      }
    } else {
      setSettlementFeeRate("30");
      setSettlementClientPix("");
    }

    setShowSettlementModal(true);
  };

  // Processo atualmente selecionado no modal de alvará
  const currentSettlementCase = useMemo(() => {
    return cases.find((c) => c.id === settlementCaseId) || null;
  }, [cases, settlementCaseId]);

  // Custas pendentes do processo selecionado no modal de alvará
  const settlementPendingCosts = useMemo(() => {
    if (!settlementCaseId) return 0;
    const expInfo = caseExpensesMap.get(settlementCaseId);
    return expInfo?.pending || 0;
  }, [settlementCaseId, caseExpensesMap]);

  // Cálculos dinâmicos em tempo real do Alvará (incluindo Splits de Honorários)
  const settlementCalculation = useMemo(() => {
    const gross = parseFloat(settlementGrossAmount.replace(",", ".")) || 0;
    const feeRate = parseFloat(settlementFeeRate.replace(",", ".")) || 0;
    const succumbence = parseFloat(settlementSuccumbence.replace(",", ".")) || 0;
    const costsToDeduct = settlementDeductPendingCosts ? settlementPendingCosts : 0;

    // Honorários contratuais sobre o valor bruto do alvará
    const contractualFee = (gross * feeRate) / 100;

    // Faturamento total que fica com o escritório (Honorários Contratuais + Sucumbência)
    const officeTotalRevenue = contractualFee + succumbence;

    // Repasse líquido para o cliente:
    // Bruto - Honorários Contratuais - Reembolso de Custas adiantadas
    const netClient = Math.max(0, gross - contractualFee - costsToDeduct);

    // Splits / Divisão de Honorários com Parceiros
    let totalSplits = 0;
    const computedSplits = settlementSplits.map((sp) => {
      let amount = 0;
      if (sp.split_type === "percentage") {
        amount = (officeTotalRevenue * (sp.split_percentage || 0)) / 100;
      } else {
        amount = Number(sp.split_amount) || 0;
      }
      totalSplits += amount;
      return { ...sp, split_amount: amount };
    });

    const netOfficeRevenue = Math.max(0, officeTotalRevenue - totalSplits);

    return {
      gross,
      feeRate,
      contractualFee,
      succumbence,
      costsToDeduct,
      officeTotalRevenue,
      netClient,
      totalSplits,
      computedSplits,
      netOfficeRevenue,
    };
  }, [
    settlementGrossAmount,
    settlementFeeRate,
    settlementSuccumbence,
    settlementDeductPendingCosts,
    settlementPendingCosts,
    settlementSplits,
  ]);

  // Helpers para gerenciamento de splits de honorários no modal de alvará
  const handleAddSplit = () => {
    setSettlementSplits((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        partner_name: "",
        partner_role: "partner",
        partner_pix_or_bank: "",
        split_type: "percentage",
        split_percentage: 20,
        split_amount: 0,
      },
    ]);
  };

  const handleUpdateSplit = (id: string, field: keyof SettlementSplitInput, value: any) => {
    setSettlementSplits((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleRemoveSplit = (id: string) => {
    setSettlementSplits((prev) => prev.filter((s) => s.id !== id));
  };

  // Salvar Liquidação do Alvará / RPV com Splits
  const handleSaveSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !currentSettlementCase) {
      alert("Selecione um processo válido para liquidar o alvará.");
      return;
    }

    if (settlementCalculation.gross <= 0) {
      alert("Informe um valor bruto válido para o alvará judicial.");
      return;
    }

    setSavingSettlement(true);
    try {
      const compId = selectedCompany.id;
      const today = new Date().toISOString().split("T")[0];
      const baseMonth = settlementDueDate.slice(0, 7);

      // 1. Gera Conta a Pagar (Repasse ao Cliente) no Contas a Pagar
      let createdPayableId: string | null = null;
      if (settlementCalculation.netClient > 0) {
        const { data: payableData, error: payErr } = await supabase
          .from("payables")
          .insert({
            company_id: compId,
            supplier_name: `Repasse Judicial: ${currentSettlementCase.client_name}`,
            description: `Repasse de Alvará/RPV - Proc. ${currentSettlementCase.case_number} (${settlementNumber.trim() || "Alvará Judicial"})`,
            amount: settlementCalculation.netClient,
            due_date: settlementDueDate,
            month_ref: baseMonth,
            status: "open",
            barcode_or_pix: settlementClientPix.trim() || null,
            is_refundable_cost: false,
            legal_case_id: currentSettlementCase.id,
            notes: `Liquidação de Alvará nº ${settlementNumber.trim() || "S/N"} no valor bruto de ${formatCurrency(
              settlementCalculation.gross
            )}. Retenção contratual de ${settlementCalculation.feeRate}% (${formatCurrency(
              settlementCalculation.contractualFee
            )}) e dedução de custas de ${formatCurrency(settlementCalculation.costsToDeduct)}.`,
          })
          .select("id")
          .single();

        if (payErr) throw payErr;
        createdPayableId = payableData?.id || null;
      }

      // 2. Se optou por deduzir custas pendentes, marca as custas do processo como 'refunded'
      if (settlementDeductPendingCosts && settlementPendingCosts > 0) {
        await Promise.all([
          supabase
            .from("payables")
            .update({ refund_status: "refunded", refunded_at: today, refund_notes: "Dedução automática no Alvará" })
            .eq("legal_case_id", currentSettlementCase.id)
            .neq("refund_status", "refunded"),
          supabase
            .from("transactions")
            .update({ refund_status: "refunded" })
            .eq("legal_case_id", currentSettlementCase.id)
            .neq("refund_status", "refunded"),
        ]);
      }

      // 3. Salva Registro do Alvará em legal_settlements
      const { data: savedSettlement, error: setErr } = await supabase
        .from("legal_settlements")
        .insert({
          company_id: compId,
          legal_case_id: currentSettlementCase.id,
          settlement_number: settlementNumber.trim() || "Alvará Judicial",
          issue_date: settlementDate,
          gross_amount: settlementCalculation.gross,
          contractual_fee_rate: settlementCalculation.feeRate,
          contractual_fee_amount: settlementCalculation.contractualFee,
          succumbence_fee_amount: settlementCalculation.succumbence,
          deducted_costs_amount: settlementCalculation.costsToDeduct,
          net_client_amount: settlementCalculation.netClient,
          client_name: currentSettlementCase.client_name,
          client_pix_or_bank: settlementClientPix.trim() || null,
          client_payable_id: createdPayableId,
          status: "completed",
          notes: settlementNotes.trim() || null,
        })
        .select("*")
        .single();

      if (setErr) throw setErr;

      // 4. Salva Splits / Divisão de Honorários com Parceiros em payables e legal_fee_splits
      if (savedSettlement && settlementCalculation.computedSplits.length > 0) {
        for (const sp of settlementCalculation.computedSplits) {
          if (sp.split_amount > 0 && sp.partner_name.trim()) {
            const roleLabels: Record<string, string> = {
              captador: "Captador",
              correspondent: "Correspondente",
              associate: "Associado",
              expert: "Perito",
              partner: "Parceiro",
            };
            const roleLabel = roleLabels[sp.partner_role] || "Parceiro";

            // Cria conta a pagar da comissão/split para o parceiro
            const { data: splitPayable } = await supabase
              .from("payables")
              .insert({
                company_id: compId,
                supplier_name: `Honorários Parceiro: ${sp.partner_name.trim()}`,
                description: `Split / Parceria (${roleLabel}) - Proc. ${currentSettlementCase.case_number} (${settlementNumber.trim() || "Alvará"})`,
                amount: sp.split_amount,
                due_date: settlementDueDate,
                month_ref: baseMonth,
                status: "open",
                barcode_or_pix: sp.partner_pix_or_bank.trim() || null,
                is_refundable_cost: false,
                legal_case_id: currentSettlementCase.id,
                notes: `Comissão de honorários referente a ${roleLabel} no alvará judicial. Rateio: ${
                  sp.split_type === "percentage" ? `${sp.split_percentage}%` : formatCurrency(sp.split_amount)
                }.`,
              })
              .select("id")
              .single();

            // Grava registro em legal_fee_splits
            await supabase.from("legal_fee_splits").insert({
              company_id: compId,
              legal_case_id: currentSettlementCase.id,
              settlement_id: savedSettlement.id,
              partner_name: sp.partner_name.trim(),
              partner_role: sp.partner_role,
              partner_pix_or_bank: sp.partner_pix_or_bank.trim() || null,
              split_type: sp.split_type,
              split_percentage: sp.split_percentage || 0,
              split_amount: sp.split_amount,
              payable_id: splitPayable?.id || null,
              status: "scheduled",
            });
          }
        }
      }

      setShowSettlementModal(false);
      await loadData();

      // Abre automaticamente o Termo de Prestação de Contas / Quitação do Alvará
      if (savedSettlement) {
        setReceiptSettlement(savedSettlement);
      } else {
        alert("Alvará liquidado com sucesso! Os repasses foram agendados no Contas a Pagar.");
      }
    } catch (err: any) {
      alert(`Erro ao liquidar alvará: ${err.message}`);
    } finally {
      setSavingSettlement(false);
    }
  };

  // Excluir Liquidação de Alvará / RPV
  const handleDeleteSettlement = async (st: LegalSettlement) => {
    const confirmDelete = window.confirm(
      `Deseja realmente excluir a liquidação "${st.settlement_number || "Alvará Judicial"}" de ${st.client_name}?\n\n` +
      `Atenção:\n` +
      `• A conta a pagar de repasse ao cliente (${formatCurrency(Number(st.net_client_amount))}) será removida;\n` +
      `• As contas a pagar de splits/comissões de parceiros serão excluídas;\n` +
      `• As custas processuais deduzidas neste alvará serão reabertas como pendentes;\n` +
      `• O registro desta liquidação será removido definitivamente.`
    );

    if (!confirmDelete) return;

    try {
      // 1. Exclui contas a pagar dos splits e os splits vinculados
      const { data: splitsToDelete } = await supabase
        .from("legal_fee_splits")
        .select("id, payable_id")
        .eq("settlement_id", st.id);

      if (splitsToDelete && splitsToDelete.length > 0) {
        for (const sp of splitsToDelete) {
          if (sp.payable_id) {
            await supabase.from("payables").delete().eq("id", sp.payable_id);
          }
        }
        await supabase.from("legal_fee_splits").delete().eq("settlement_id", st.id);
      }

      // 2. Se foi gerada uma conta a pagar de repasse ao cliente, exclui do contas a pagar
      if (st.client_payable_id) {
        await supabase.from("payables").delete().eq("id", st.client_payable_id);
      }

      // 2. Se houve dedução de custas, reverte as custas deduzidas para 'pending'
      if (Number(st.deducted_costs_amount) > 0) {
        await Promise.all([
          supabase
            .from("payables")
            .update({ refund_status: "pending", refunded_at: null, refund_notes: null })
            .eq("legal_case_id", st.legal_case_id)
            .eq("refund_notes", "Dedução automática no Alvará"),
          supabase
            .from("transactions")
            .update({ refund_status: "pending" })
            .eq("legal_case_id", st.legal_case_id)
            .eq("refund_status", "refunded"),
        ]);
      }

      // 3. Exclui a liquidação
      const { error: delErr } = await supabase
        .from("legal_settlements")
        .delete()
        .eq("id", st.id);

      if (delErr) throw delErr;

      alert("Liquidação judicial excluída com sucesso!");
      await loadData();
    } catch (err: any) {
      alert(`Erro ao excluir liquidação judicial: ${err.message}`);
    }
  };

  // Copiar Termo de Quitação do Alvará para WhatsApp
  const handleCopySettlementWhatsApp = (st: LegalSettlement) => {
    const c = cases.find((item) => item.id === st.legal_case_id);
    const caseNum = c?.case_number || "Não especificado";

    const text = `⚖️ *PRESTAÇÃO DE CONTAS E QUITAÇÃO DE ALVARÁ JUDICIAL*
*Processo:* ${caseNum}
*Beneficiário:* ${st.client_name}
*Data da Liquidação:* ${formatDate(st.issue_date)}
*Título / Alvará:* ${st.settlement_number || "Alvará Judicial"}

Prezado(a) *${st.client_name}*,
Informamos que os valores depositados em juízo foram liberados e liquidados com sucesso pelo escritório. Segue a prestação de contas detalhada:

💵 *Valor Bruto Liberado pelo Juízo:* ${formatCurrency(st.gross_amount)}
➖ *Honorários Advocatícios Contratuais (${st.contractual_fee_rate}%):* ${formatCurrency(st.contractual_fee_amount)}
${
  st.deducted_costs_amount > 0
    ? `➖ *Reembolso de Custas/Despesas Processuais Adiantadas:* ${formatCurrency(st.deducted_costs_amount)}\n`
    : ""
}━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 *VALOR LÍQUIDO A REPASSAR AO CLIENTE:* ${formatCurrency(st.net_client_amount)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${st.client_pix_or_bank ? `🔑 *Dados de Destino (Pix/Conta):* ${st.client_pix_or_bank}\n` : ""}
O agendamento da transferência já foi realizado e o comprovante bancário será anexado assim que liquidado.
Ficamos à disposição para quaisquer esclarecimentos.`;

    navigator.clipboard.writeText(text);

    if (c?.client_phone) {
      const cleanPhone = c.client_phone.replace(/\D/g, "");
      const fullPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
      const url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(text)}`;
      window.open(url, "_blank");
    } else {
      alert("Termo de prestação de contas do alvará copiado para o WhatsApp!");
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  };

  // Se a empresa não for jurídica, exibe mensagem explicativa e botão para o Master ativar
  if (selectedCompany && selectedCompany.segment !== "legal") {
    return (
      <Navigation>
        <div className="p-4 md:p-8 max-w-3xl mx-auto text-center py-16 space-y-4">
          <div className="text-5xl">⚖️</div>
          <h2 className="text-2xl font-bold text-gray-900">Módulo Jurídico Desativado</h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            A empresa ativa <strong>{selectedCompany.name}</strong> está configurada no segmento padrão (Comércio/Serviços Gerais).
          </p>
          {isMaster ? (
            <div className="pt-4">
              <Link
                href="/settings"
                className="bg-primary text-white text-xs font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-hover transition-colors inline-block"
              >
                Ativar Segmento Jurídico em Configurações (Master) →
              </Link>
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              Solicite ao administrador Master a ativação do módulo jurídico para este cliente.
            </p>
          )}
        </div>
      </Navigation>
    );
  }

  return (
    <Navigation>
      <div className="p-4 md:p-8 space-y-6 print:hidden">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span>⚖️ Gestão de Processos & Custas</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Monitore despesas judiciais adiantadas pelo escritório e preste contas com faturas prontas para WhatsApp e PDF.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleOpenSettlementModal()}
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <span>🏛️</span>
              <span>Liquidar Alvará / RPV</span>
            </button>
            <button
              onClick={() => handleOpenCaseModal()}
              className="bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Novo Processo</span>
            </button>
          </div>
        </div>

        {/* ABAS DO MÓDULO JURÍDICO */}
        <div className="flex border-b border-gray-200 gap-6 print:hidden">
          <button
            onClick={() => setActiveTab("cases")}
            className={`pb-3 text-sm font-semibold transition-colors relative flex items-center gap-2 ${
              activeTab === "cases" ? "text-primary border-b-2 border-primary" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span>⚖️ Processos & Custas Adiantadas</span>
            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
              {cases.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("settlements")}
            className={`pb-3 text-sm font-semibold transition-colors relative flex items-center gap-2 ${
              activeTab === "settlements" ? "text-amber-700 border-b-2 border-amber-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span>🏛️ Central de Alvarás, RPVs & Repasses</span>
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
              {settlements.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("pipeline")}
            className={`pb-3 text-sm font-semibold transition-colors relative flex items-center gap-2 ${
              activeTab === "pipeline" ? "text-purple-700 border-b-2 border-purple-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span>🎯 Pipeline de Êxito & Previsão</span>
            <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold">
              {cases.filter((c) => c.status === "active" && c.current_phase !== "settled").length}
            </span>
          </button>
        </div>

        {/* BARRA DE FILTROS POR ÁREA DE ATUAÇÃO (Cível, Trabalhista, Previdenciário, etc.) */}
        {(activeTab === "cases" || activeTab === "pipeline") && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 print:hidden">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
              <span>🏷️</span>
              <span>Filtrar Área:</span>
            </span>

            <button
              onClick={() => setSelectedAreaFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                selectedAreaFilter === "all"
                  ? "bg-primary text-white shadow-xs font-bold"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span>Todas as Áreas</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  selectedAreaFilter === "all" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {cases.length}
              </span>
            </button>

            {officePracticeAreas.map((areaId) => {
              const label = PRACTICE_AREA_LABELS[areaId] || areaId;
              const count = cases.filter((c) => (c.practice_area || "civel") === areaId).length;

              return (
                <button
                  key={areaId}
                  onClick={() => setSelectedAreaFilter(areaId)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer capitalize ${
                    selectedAreaFilter === areaId
                      ? "bg-amber-600 text-white shadow-xs font-bold"
                      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      selectedAreaFilter === areaId ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* CONTEÚDO DA ABA 1: PROCESSOS & CUSTAS ADIANTADAS */}
        {activeTab === "cases" && (
          <>
            {/* 4 Cards de Resumo Executivo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 print:hidden">
              <div className="bg-white rounded-xl border border-amber-200/70 bg-amber-50/20 p-5 shadow-2xs">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">A Reembolsar (Pendente)</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{formatCurrency(kpis.pendingRefundAmount)}</p>
                <p className="text-xs text-amber-600/90 mt-1">Custas adiantadas aguardando cobrança</p>
              </div>

              <div className="bg-white rounded-xl border border-blue-200/70 bg-blue-50/20 p-5 shadow-2xs">
                <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Faturado / Em Cobrança</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(kpis.invoicedAmount)}</p>
                <p className="text-xs text-blue-600/90 mt-1">Contas prestadas aguardando Pix do cliente</p>
              </div>

              <div className="bg-white rounded-xl border border-emerald-200/70 bg-emerald-50/20 p-5 shadow-2xs">
                <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Total Reembolsado</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(kpis.refundedAmount)}</p>
                <p className="text-xs text-emerald-600/90 mt-1">Valor recuperado pelo escritório</p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-2xs">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Processos com Custas</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{kpis.casesWithPendingCount}</p>
                <p className="text-xs text-gray-400 mt-1">de {kpis.activeCasesCount} processos ativos</p>
              </div>
            </div>

            {/* Barra de Filtros e Busca */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-2xs print:hidden">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="🔍 Buscar por número do processo (CNJ), cliente ou vara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-primary"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex gap-1.5 overflow-x-auto text-xs">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    statusFilter === "all" ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Todos ({cases.length})
                </button>
                <button
                  onClick={() => setStatusFilter("pending_refunds")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    statusFilter === "pending_refunds"
                      ? "bg-amber-600 text-white font-semibold"
                      : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60"
                  }`}
                >
                  ⚠️ Com Custas Pendentes ({kpis.casesWithPendingCount})
                </button>
                <button
                  onClick={() => setStatusFilter("active")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    statusFilter === "active" ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Ativos ({kpis.activeCasesCount})
                </button>
                <button
                  onClick={() => setStatusFilter("closed")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    statusFilter === "closed" ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Arquivados
                </button>
              </div>
            </div>

            {/* Listagem de Processos */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden print:border-none print:shadow-none">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between print:hidden">
                <h2 className="text-base font-semibold text-gray-800">Processos Cadastrados</h2>
                <span className="text-xs text-gray-500 font-medium">{filteredCases.length} processos</span>
              </div>

              {loading ? (
                <div className="p-12 text-center text-gray-400">Carregando processos e custas...</div>
              ) : filteredCases.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <p className="mb-2 text-3xl">⚖️</p>
                  <p className="font-medium text-gray-600">Nenhum processo encontrado com os filtros atuais.</p>
                  <p className="text-xs mt-1">Clique em "+ Novo Processo" para registrar sua primeira causa judicial.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50/80 text-gray-500 text-xs font-semibold uppercase tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="py-3.5 px-4">Processo (CNJ) / Cliente</th>
                        <th className="py-3.5 px-4">Vara / Comarca / Ação</th>
                        <th className="py-3.5 px-4 text-center">Status Causa</th>
                        <th className="py-3.5 px-4 text-right">Custas Adiantadas</th>
                        <th className="py-3.5 px-4 text-center">Status Reembolso</th>
                        <th className="py-3.5 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {filteredCases.map((c) => {
                        const expInfo = caseExpensesMap.get(c.id) || { total: 0, pending: 0, refunded: 0, list: [] };
                        const hasPending = expInfo.pending > 0;

                        return (
                          <tr key={c.id} className="hover:bg-gray-50/70 transition-colors">
                            {/* Processo / Cliente */}
                            <td className="py-3 px-4">
                              <div className="font-bold text-gray-900 font-mono text-xs flex items-center gap-1.5">
                                <span>{c.case_number}</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(c.case_number);
                                    alert("Número do processo copiado!");
                                  }}
                                  className="text-gray-400 hover:text-gray-700 text-[11px]"
                                  title="Copiar número"
                                >
                                  📋
                                </button>
                              </div>
                              <div className="font-semibold text-gray-800 text-sm mt-0.5">{c.client_name}</div>
                              {c.client_phone && (
                                <div className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                                  <span>📱</span>
                                  <span>{c.client_phone}</span>
                                </div>
                              )}
                            </td>

                            {/* Vara / Ação / Área / Advogado */}
                            <td className="py-3 px-4">
                              <div className="text-xs text-gray-800 font-medium">{c.court_courtroom || "—"}</div>
                              <div className="text-[11px] text-gray-500">{c.action_type || "Ação não especificada"}</div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {c.practice_area && (
                                  <span className="text-[9px] font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded capitalize">
                                    {PRACTICE_AREA_LABELS[c.practice_area] || c.practice_area}
                                  </span>
                                )}
                                {c.responsible_lawyer && (
                                  <span className="text-[9px] font-medium bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">
                                    👤 {c.responsible_lawyer}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Status da Causa */}
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              {c.status === "active" ? (
                                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-800">
                                  Ativo
                                </span>
                              ) : c.status === "closed" ? (
                                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-600">
                                  Arquivado
                                </span>
                              ) : (
                                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800">
                                  Suspenso
                                </span>
                              )}
                            </td>

                            {/* Custas Adiantadas */}
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="font-semibold text-gray-900">{formatCurrency(expInfo.total)}</div>
                              {hasPending ? (
                                <div className="text-[11px] font-bold text-amber-600">
                                  Pendente: {formatCurrency(expInfo.pending)}
                                </div>
                              ) : expInfo.total > 0 ? (
                                <div className="text-[11px] text-emerald-600">✓ 100% Reembolsado</div>
                              ) : (
                                <div className="text-[10px] text-gray-400">Sem custas</div>
                              )}
                            </td>

                            {/* Status do Reembolso */}
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              {hasPending ? (
                                <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                                  <span>⚠️</span>
                                  <span>Cobrar ({formatCurrency(expInfo.pending)})</span>
                                </span>
                              ) : expInfo.total > 0 ? (
                                <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-100 text-emerald-800">
                                  ✓ Liquidado
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>

                            {/* Ações */}
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Prestar Contas & Cobrar Custas */}
                                <button
                                  onClick={() => handleOpenStatement(c)}
                                  className="px-2.5 py-1 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center gap-1"
                                  title="Gerar demonstrativo de reembolso para WhatsApp ou PDF"
                                >
                                  <span>📄</span>
                                  <span>Cobrar Custas</span>
                                </button>

                                {/* Liquidar Alvará / RPV */}
                                <button
                                  onClick={() => handleOpenSettlementModal(c.id)}
                                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center gap-1"
                                  title="Liquidar Alvará / RPV judicial e calcular repasse ao cliente"
                                >
                                  <span>🏛️</span>
                                  <span>Liquidar Alvará</span>
                                </button>

                                {/* Custa Rápida */}
                                <button
                                  onClick={() => {
                                    setNewCostCase(c);
                                    setCostDescription(`Guia Judicial - Proc. ${c.case_number}`);
                                    setCostAmount("");
                                    setCostBarcodeOrPix("");
                                  }}
                                  className="p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="Adicionar custa / boleto a pagar deste processo"
                                >
                                  ➕
                                </button>

                                {/* Editar */}
                                <button
                                  onClick={() => handleOpenCaseModal(c)}
                                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                                  title="Editar processo"
                                >
                                  ✏️
                                </button>

                                {/* Excluir */}
                                <button
                                  onClick={() => handleDeleteCase(c.id)}
                                  className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                  title="Excluir processo"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* CONTEÚDO DA ABA 2: CENTRAL DE ALVARÁS, RPVs & REPASSES */}
        {activeTab === "settlements" && (
          <div className="space-y-6">
            {/* KPI Cards de Alvarás */}
            {(() => {
              const totalGross = settlements.reduce((acc, s) => acc + Number(s.gross_amount), 0);
              const totalFees = settlements.reduce(
                (acc, s) => acc + Number(s.contractual_fee_amount) + Number(s.succumbence_fee_amount),
                0
              );
              const totalClientNet = settlements.reduce((acc, s) => acc + Number(s.net_client_amount), 0);
              const totalCostsRecovered = settlements.reduce((acc, s) => acc + Number(s.deducted_costs_amount), 0);

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-2xs">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Alvarás / RPVs Depositados</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalGross)}</p>
                    <p className="text-xs text-gray-400 mt-1">{settlements.length} liquidações registradas</p>
                  </div>

                  <div className="bg-white rounded-xl border border-emerald-200 bg-emerald-50/20 p-5 shadow-2xs">
                    <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                      Honorários do Escritório (Receita)
                    </p>
                    <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(totalFees)}</p>
                    <p className="text-xs text-emerald-600/90 mt-1">Contratuais + Sucumbência líquida</p>
                  </div>

                  <div className="bg-white rounded-xl border border-blue-200 bg-blue-50/20 p-5 shadow-2xs">
                    <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">
                      Repasses aos Clientes
                    </p>
                    <p className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(totalClientNet)}</p>
                    <p className="text-xs text-blue-600/90 mt-1">Transf. de terceiros (Não tributável)</p>
                  </div>

                  <div className="bg-white rounded-xl border border-purple-200 bg-purple-50/20 p-5 shadow-2xs">
                    <p className="text-xs font-semibold text-purple-800 uppercase tracking-wider">
                      Custas Recuperadas
                    </p>
                    <p className="text-2xl font-bold text-purple-700 mt-1">{formatCurrency(totalCostsRecovered)}</p>
                    <p className="text-xs text-purple-600/90 mt-1">Reembolsadas direto na fonte</p>
                  </div>
                </div>
              );
            })()}

            {/* Tabela de Alvarás Liquidados */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Histórico de Alvarás e Liquidações Judiciais</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Demonstrativo de cisão contábil e repasses agendados no Contas a Pagar
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  {settlements.length > 0 && (
                    <div className="relative w-64 sm:w-72">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
                      <input
                        type="text"
                        placeholder="Buscar cliente, processo, alvará..."
                        value={settlementSearchTerm}
                        onChange={(e) => setSettlementSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
                      />
                      {settlementSearchTerm && (
                        <button
                          onClick={() => setSettlementSearchTerm("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold p-0.5"
                          title="Limpar pesquisa"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => handleOpenSettlementModal()}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <span>+</span>
                    <span>Nova Liquidação</span>
                  </button>
                </div>
              </div>

              {settlements.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <p className="mb-2 text-4xl">🏛️</p>
                  <p className="font-semibold text-gray-700 text-sm">Nenhum alvará ou RPV liquidado ainda.</p>
                  <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                    Ao receber um alvará judicial na conta do escritório, clique no botão acima para liquidar, reter honorários e agendar o repasse ao cliente.
                  </p>
                </div>
              ) : filteredSettlements.length === 0 ? (
                <div className="p-10 text-center text-gray-500">
                  <p className="text-3xl mb-1">🔍</p>
                  <p className="font-semibold text-sm text-gray-700">Nenhuma liquidação encontrada</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Não localizamos nenhum alvará correspondente ao termo "{settlementSearchTerm}".
                  </p>
                  <button
                    onClick={() => setSettlementSearchTerm("")}
                    className="mt-3 text-xs text-amber-700 hover:underline font-semibold"
                  >
                    Limpar pesquisa
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="py-3.5 px-4">Data / Título</th>
                        <th className="py-3.5 px-4">Processo / Cliente</th>
                        <th className="py-3.5 px-4 text-right">Bruto do Alvará</th>
                        <th className="py-3.5 px-4 text-right">Honorários Escritório</th>
                        <th className="py-3.5 px-4 text-right">Custas Deduções</th>
                        <th className="py-3.5 px-4 text-right">Líquido Repasse Cliente</th>
                        <th className="py-3.5 px-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {filteredSettlements.map((st) => {
                        const linkedCase = cases.find((c) => c.id === st.legal_case_id);
                        const totalFee = Number(st.contractual_fee_amount) + Number(st.succumbence_fee_amount);

                        return (
                          <tr key={st.id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="font-bold text-gray-900">{formatDate(st.issue_date)}</div>
                              <div className="text-[11px] text-gray-500">{st.settlement_number || "Alvará Judicial"}</div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-semibold text-gray-900">{st.client_name}</div>
                              <div className="font-mono text-[11px] text-gray-400">
                                {linkedCase?.case_number || "Proc. não localizado"}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right font-bold text-gray-900 whitespace-nowrap">
                              {formatCurrency(Number(st.gross_amount))}
                            </td>

                            <td className="py-3 px-4 text-right font-semibold text-emerald-700 whitespace-nowrap">
                              <div>{formatCurrency(totalFee)}</div>
                              <div className="text-[10px] text-emerald-600">
                                {st.contractual_fee_rate}% contratuais
                                {Number(st.succumbence_fee_amount) > 0 ? ` + sucumbência` : ""}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right font-medium text-purple-700 whitespace-nowrap">
                              {Number(st.deducted_costs_amount) > 0
                                ? formatCurrency(Number(st.deducted_costs_amount))
                                : "—"}
                            </td>

                            <td className="py-3 px-4 text-right font-bold text-blue-700 whitespace-nowrap">
                              <div>{formatCurrency(Number(st.net_client_amount))}</div>
                              <div className="text-[10px] text-gray-400 font-normal">
                                {st.client_pix_or_bank ? `Pix: ${st.client_pix_or_bank}` : "Dados não informados"}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => setReceiptSettlement(st)}
                                  className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                                  title="Ver Termo de Quitação & Prestação de Contas"
                                >
                                  <span>📜</span>
                                  <span>Termo</span>
                                </button>
                                <button
                                  onClick={() => handleCopySettlementWhatsApp(st)}
                                  className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors flex items-center justify-center"
                                  title="Enviar no WhatsApp do Cliente"
                                >
                                  <span>📲</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteSettlement(st)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center"
                                  title="Excluir Liquidação"
                                >
                                  <span>🗑️</span>
                                </button>
                              </div>
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

        {/* CONTEÚDO DA ABA 3: PIPELINE DE ÊXITO & PREVISÃO FINANCEIRA (FASE 4) */}
        {activeTab === "pipeline" && (
          <div className="space-y-6">
            {/* 4 Cards de Resumo Executivo do Pipeline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
              <div className="bg-white rounded-xl border border-indigo-200/80 bg-indigo-50/20 p-5 shadow-2xs">
                <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wider">Causas Ativas em Disputa</p>
                <p className="text-2xl font-bold text-indigo-700 mt-1">{formatCurrency(pipelineData.totalClaimValue)}</p>
                <p className="text-xs text-indigo-600/90 mt-1">Benefício econômico total em carteira</p>
              </div>

              <div className="bg-white rounded-xl border border-purple-200/80 bg-purple-50/20 p-5 shadow-2xs">
                <p className="text-xs font-semibold text-purple-800 uppercase tracking-wider">Honorários Potenciais</p>
                <p className="text-2xl font-bold text-purple-700 mt-1">{formatCurrency(pipelineData.totalExpectedFees)}</p>
                <p className="text-xs text-purple-600/90 mt-1">Projeção integral de êxito contratada</p>
              </div>

              <div className="bg-white rounded-xl border border-emerald-200/80 bg-emerald-50/20 p-5 shadow-2xs">
                <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Previsão Ponderada (Risco)</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(pipelineData.totalWeightedFees)}</p>
                <p className="text-xs text-emerald-600/90 mt-1">Ajustado por probabilidades (80%, 50%, 20%)</p>
              </div>

              <div className="bg-white rounded-xl border border-amber-200/80 bg-amber-50/20 p-5 shadow-2xs">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Em Fase de Execução / Alvará</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{formatCurrency(pipelineData.readyForAlvaraFees)}</p>
                <p className="text-xs text-amber-600/90 mt-1">Honorários prontos para levantamento</p>
              </div>
            </div>

            {/* FUNIL VISUAL DE FASES PROCESSUAIS (COLUNAS KANBAN) */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-gray-100">
                <div>
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <span>🎯 Funil de Fases Processuais & Honorários Futuros</span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Acompanhe a marcha dos processos em carteira e promova as causas rumo ao alvará judicial
                  </p>
                </div>

                <button
                  onClick={() => handleOpenCaseModal()}
                  className="bg-primary hover:bg-primary-hover text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <span>+</span>
                  <span>Novo Processo</span>
                </button>
              </div>

              {/* Grid das 5 Colunas do Pipeline */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto pb-2">
                {PIPELINE_COLUMNS.map((col) => {
                  const colCases: LegalCase[] = (pipelineData.phaseMap[col.id] || []).filter((c: LegalCase) => c.status === "active");
                  const colTotalFees = colCases.reduce(
                    (acc: number, c: LegalCase) => acc + ((Number(c.claim_value) || 0) * (Number(c.expected_fee_rate) || 30)) / 100,
                    0
                  );

                  return (
                    <div
                      key={col.id}
                      className={`rounded-xl border-t-4 ${col.color} border-x border-b border-gray-200 p-3 flex flex-col min-h-[500px]`}
                    >
                      {/* Cabeçalho da Coluna */}
                      <div className="pb-3 border-b border-gray-200 mb-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                            <span>{col.icon}</span>
                            <span>{col.label}</span>
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${col.badge}`}>
                            {colCases.length}
                          </span>
                        </div>
                        <p className="text-[11px] font-bold text-gray-700 mt-1.5">
                          Total: {formatCurrency(colTotalFees)}
                        </p>
                      </div>

                      {/* Lista de Cards de Processos */}
                      <div className="space-y-3 flex-1 overflow-y-auto">
                        {colCases.length === 0 ? (
                          <div className="h-40 border border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 p-3 text-center">
                            <span className="text-xl mb-1">{col.icon}</span>
                            <span className="text-[11px]">Nenhum processo nesta fase</span>
                          </div>
                        ) : (
                          colCases.map((c: LegalCase) => {
                            const claim = Number(c.claim_value) || 0;
                            const feeRate = Number(c.expected_fee_rate) || 30;
                            const expectedFee = (claim * feeRate) / 100;

                            return (
                              <div
                                key={c.id}
                                className="bg-white rounded-xl border border-gray-200 p-3 shadow-2xs hover:shadow-sm transition-all space-y-2 text-xs"
                              >
                                {/* Topo: CNJ e Probabilidade */}
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-mono text-[10px] font-bold text-gray-500 truncate" title={c.case_number}>
                                    {c.case_number}
                                  </span>
                                  {c.probability === "high" ? (
                                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                                      Alta 80%
                                    </span>
                                  ) : c.probability === "low" ? (
                                    <span className="text-[9px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                      Baixa 20%
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                                      Média 50%
                                    </span>
                                  )}
                                </div>

                                {/* Cliente, Assunto, Área e Advogado */}
                                <div>
                                  <p className="font-bold text-gray-900 leading-tight">{c.client_name}</p>
                                  <p className="text-[10px] text-gray-400 truncate mt-0.5">{c.action_type || "Ação Judicial"}</p>
                                  <div className="flex flex-wrap items-center gap-1 mt-1">
                                    {c.practice_area && (
                                      <span className="text-[9px] font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded capitalize">
                                        {PRACTICE_AREA_LABELS[c.practice_area] || c.practice_area}
                                      </span>
                                    )}
                                    {c.responsible_lawyer && (
                                      <span className="text-[9px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 truncate max-w-[120px]">
                                        👤 {c.responsible_lawyer}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Valores Financeiros */}
                                <div className="bg-gray-50 p-2 rounded-lg space-y-1 text-[11px] border border-gray-100">
                                  <div className="flex items-center justify-between text-gray-500">
                                    <span>Causa:</span>
                                    <span className="font-semibold text-gray-800">{claim > 0 ? formatCurrency(claim) : "—"}</span>
                                  </div>
                                  <div className="flex items-center justify-between font-bold text-purple-700 pt-0.5 border-t border-gray-200">
                                    <span>Êxito ({feeRate}%):</span>
                                    <span>{claim > 0 ? formatCurrency(expectedFee) : "—"}</span>
                                  </div>
                                </div>

                                {c.estimated_conclusion_date && (
                                  <p className="text-[10px] text-gray-400">
                                    📅 Previsão: {formatDate(c.estimated_conclusion_date)}
                                  </p>
                                )}

                                {/* Ações do Card */}
                                <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-1">
                                  <button
                                    onClick={() => handleOpenCaseModal(c)}
                                    className="text-gray-400 hover:text-gray-700 p-1 rounded"
                                    title="Editar valores e dados do processo"
                                  >
                                    ✏️
                                  </button>

                                  {col.id === "execution" ? (
                                    <button
                                      onClick={() => handleOpenSettlementModal(c.id)}
                                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] px-2.5 py-1 rounded-lg shadow-2xs flex items-center gap-1 transition-colors"
                                      title="Liquidar Alvará Judicial / RPV deste processo"
                                    >
                                      <span>🏛️</span>
                                      <span>Liquidar Alvará</span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleAdvancePhase(c, col.next as any)}
                                      className="text-[10px] font-bold text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                                      title={`Avançar processo para ${col.nextLabel}`}
                                    >
                                      <span>➔ {col.nextLabel}</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE CADASTRO / EDIÇÃO DE PROCESSO */}
      {showCaseModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                {editingCase ? "Editar Processo" : "Novo Processo Judicial"}
              </h3>
              <button
                onClick={() => setShowCaseModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCase} className="space-y-3.5 mt-4 text-sm">
              <div>
                <label className="block font-medium text-gray-700 mb-1 text-xs">
                  Número do Processo (CNJ) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 0001234-56.2024.8.26.0100"
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1 text-xs">Nome do Cliente *</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome completo ou Razão Social"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1 text-xs">WhatsApp / Telefone</label>
                  <input
                    type="tel"
                    placeholder="Ex: (11) 98765-4321"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1 text-xs">Vara / Fórum / Comarca</label>
                  <input
                    type="text"
                    placeholder="Ex: 2ª Vara Cível de SP"
                    value={courtCourtroom}
                    onChange={(e) => setCourtCourtroom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1 text-xs">Tipo de Ação / Assunto</label>
                  <input
                    type="text"
                    placeholder="Ex: Indenizatória, Trabalhista..."
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1 text-xs">CPF ou CNPJ do Cliente</label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={clientDocument}
                    onChange={(e) => setClientDocument(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1 text-xs">Status do Processo</label>
                  <select
                    value={caseStatus}
                    onChange={(e: any) => setCaseStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-xs bg-white"
                  >
                    <option value="active">Ativo em Tramitação</option>
                    <option value="suspended">Suspenso</option>
                    <option value="closed">Arquivado / Encerrado</option>
                  </select>
                </div>
              </div>

              {/* Área de Atuação e Advogado Responsável */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1 text-xs">Área de Atuação do Direito *</label>
                  <select
                    value={practiceArea}
                    onChange={(e) => setPracticeArea(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-xs bg-white capitalize"
                  >
                    {officePracticeAreas.map((areaId) => (
                      <option key={areaId} value={areaId}>
                        {PRACTICE_AREA_LABELS[areaId] || areaId}
                      </option>
                    ))}
                    {!officePracticeAreas.includes(practiceArea) && practiceArea && (
                      <option value={practiceArea}>{practiceArea}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-gray-700 mb-1 text-xs">Advogado Responsável</label>
                  <select
                    value={responsibleLawyer}
                    onChange={(e) => setResponsibleLawyer(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-xs bg-white"
                  >
                    <option value="">{officePatronName || "Sociedade / Titular Geral"}</option>
                    {officeLawyers.map((lawyer) => (
                      <option key={lawyer.id} value={lawyer.name}>
                        {lawyer.name} ({lawyer.oab || lawyer.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* FASE 4: PREVISIBILIDADE DE ÊXITO & PIPELINE (QUOTA LITIS) */}
              <div className="bg-indigo-50/60 border border-indigo-150 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <span>🎯</span>
                    <span>Previsibilidade de Êxito & Pipeline (Quota Litis)</span>
                  </span>
                  <span className="text-[10px] text-indigo-600 bg-indigo-100/70 px-2 py-0.5 rounded-full font-medium">
                    Previsão Financeira
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-indigo-900 mb-1 text-xs">
                      Valor da Causa / Pedido (R$)
                    </label>
                    <input
                      type="text"
                      placeholder="0,00"
                      value={claimValue}
                      onChange={(e) => setClaimValue(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-300 outline-none font-mono text-xs text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-indigo-900 mb-1 text-xs">
                      % Honorários de Êxito Combinados
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="30"
                        value={expectedFeeRate}
                        onChange={(e) => setExpectedFeeRate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-300 outline-none font-mono text-xs text-gray-900 pr-7"
                      />
                      <span className="absolute right-2.5 top-2 text-xs font-bold text-gray-400">%</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-medium text-indigo-900 mb-1 text-xs">Fase Processual</label>
                    <select
                      value={currentPhase}
                      onChange={(e: any) => setCurrentPhase(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-300 outline-none text-xs text-gray-900 font-medium"
                    >
                      <option value="initial">1. Petição Inicial</option>
                      <option value="instruction">2. Instrução / Provas</option>
                      <option value="sentence">3. Sentença</option>
                      <option value="appeal">4. Recursos</option>
                      <option value="execution">5. Execução / Alvará</option>
                      <option value="settled">Liquidado / Encerrado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-indigo-900 mb-1 text-xs">Probabilidade de Êxito</label>
                    <select
                      value={probability}
                      onChange={(e: any) => setProbability(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-300 outline-none text-xs text-gray-900 font-medium"
                    >
                      <option value="high">🟢 Alta (80%)</option>
                      <option value="medium">🟡 Média (50%)</option>
                      <option value="low">🔴 Baixa (20%)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-indigo-900 mb-1 text-xs">Previsão de Conclusão</label>
                    <input
                      type="date"
                      value={estimatedConclusionDate}
                      onChange={(e) => setEstimatedConclusionDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-300 outline-none text-xs text-gray-900"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1 text-xs">Observações do Caso</label>
                <textarea
                  rows={2}
                  placeholder="Anotações internas sobre acordos, honorários combinados ou custas..."
                  value={caseNotes}
                  onChange={(e) => setCaseNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCaseModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCase}
                  className="bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-xl font-semibold shadow-xs disabled:opacity-50 text-xs"
                >
                  {savingCase ? "Salvando..." : "Salvar Processo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE PRESTAÇÃO DE CONTAS & COBRANÇA */}
      {statementCase && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:static print:p-0 print:bg-white print:overflow-visible">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-gray-100 my-8 max-h-[92vh] overflow-y-auto print:max-h-none print:shadow-none print:border-none print:my-0 print:p-0 print:overflow-visible">
            {/* Cabeçalho da Fatura */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                    Demonstrativo de Reembolso
                  </span>
                  <span className="text-xs text-gray-400 font-mono">#{statementCase.case_number}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mt-1">
                  Prestação de Contas — {statementCase.client_name}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  <strong>Patrono:</strong> {officePatronName || selectedCompany?.name} {officeOabNumber ? `(${officeOabNumber})` : ""} • {statementCase.court_courtroom || "Fórum / Vara"} • {statementCase.action_type || "Ação Judicial"}
                </p>
              </div>

              <button
                onClick={() => setStatementCase(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1 rounded-lg no-print print:hidden"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            {/* Listagem de Despesas do Processo */}
            <div className="mt-4 space-y-4">
              {(() => {
                const expInfo = caseExpensesMap.get(statementCase.id) || { total: 0, pending: 0, refunded: 0, list: [] };
                const items = expInfo.list;

                if (items.length === 0) {
                  return (
                    <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <p className="font-semibold text-gray-600">Nenhuma despesa ou custa vinculada a este processo.</p>
                      <p className="text-xs mt-1">
                        Cadastre uma nova custa pelo botão "➕" na lista de processos ou vincule no Contas a Pagar.
                      </p>
                    </div>
                  );
                }

                return (
                  <div>
                    <table className="w-full text-xs text-left border border-gray-100 rounded-xl overflow-hidden">
                      <thead className="bg-gray-50 text-gray-600 font-semibold uppercase">
                        <tr>
                          <th className="py-2.5 px-3">Data</th>
                          <th className="py-2.5 px-3">Descrição da Custa / Guia</th>
                          <th className="py-2.5 px-3 text-right">Valor</th>
                          <th className="py-2.5 px-3 text-center">Comprovante</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                          <th className="py-2.5 px-3 text-right no-print print:hidden">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.map((it) => (
                          <tr key={`${it.source}-${it.id}`} className="hover:bg-gray-50/50">
                            <td className="py-2.5 px-3 whitespace-nowrap font-medium text-gray-700">
                              {formatDate(it.date)}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-gray-900">{it.description}</div>
                              <div className="text-[10px] text-gray-400">
                                {it.source === "payable" ? "Conta a Pagar" : "Débito em Extrato"}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-gray-900 whitespace-nowrap">
                              {formatCurrency(it.amount)}
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {it.attachment_url ? (
                                <button
                                  onClick={() => {
                                    if (it.attachment_type === "external_link") {
                                      window.open(it.attachment_url!, "_blank");
                                    } else {
                                      setPreviewUrl(it.attachment_url);
                                    }
                                  }}
                                  className="text-primary hover:underline text-xs font-semibold flex items-center justify-center gap-1 mx-auto"
                                >
                                  <span>📎</span>
                                  <span>Ver Guia</span>
                                </button>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {it.refund_status === "refunded" ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">
                                  ✓ Reembolsado
                                </span>
                              ) : it.refund_status === "invoiced" ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800">
                                  Cobrado
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800">
                                  Pendente
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap no-print print:hidden">
                              {it.refund_status !== "refunded" ? (
                                <button
                                  disabled={updatingRefund}
                                  onClick={() => handleUpdateRefundStatus(it, "refunded")}
                                  className="text-xs text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded font-semibold transition-colors"
                                  title="Marcar como reembolsado pelo cliente"
                                >
                                  ✓ Liquidar
                                </button>
                              ) : (
                                <button
                                  disabled={updatingRefund}
                                  onClick={() => handleUpdateRefundStatus(it, "pending")}
                                  className="text-[10px] text-gray-400 hover:text-amber-700 px-1.5 py-0.5 rounded"
                                  title="Reabrir pendência"
                                >
                                  Reabrir
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Resumo Financeiro da Cobrança */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">
                          Total Geral de Custas
                        </span>
                        <span className="text-base font-bold text-gray-900">{formatCurrency(expInfo.total)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block">
                          Já Reembolsado
                        </span>
                        <span className="text-base font-bold text-emerald-600">{formatCurrency(expInfo.refunded)}</span>
                      </div>
                      <div className="bg-amber-100/70 border border-amber-200 p-2.5 rounded-lg">
                        <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                          Saldo Pendente de Reembolso
                        </span>
                        <span className="text-lg font-bold text-amber-700">{formatCurrency(expInfo.pending)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Chave Pix para Recebimento do Reembolso */}
              <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
                  <span>Chave Pix do Escritório para Receber o Reembolso:</span>
                  <span className="text-[10px] text-gray-400 font-normal">Incluída na mensagem de cobrança</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: 12.345.678/0001-90 ou financeiro@escritorio.adv.br"
                  value={customPixKey}
                  onChange={(e) => setCustomPixKey(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* CONTROLE DE ANEXOS NA TELA (NÃO CARREGA ARQUIVOS PESADOS NO MODAL) */}
              {(() => {
                const expInfo = caseExpensesMap.get(statementCase.id) || { total: 0, pending: 0, refunded: 0, list: [] };
                const itemsWithAttach = expInfo.list.filter((it) => it.attachment_url);

                if (itemsWithAttach.length === 0) return null;

                return (
                  <>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print print:hidden">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">📎</span>
                        <div>
                          <p className="text-xs font-bold text-gray-800">
                            Comprovantes e Guias em Anexo ({itemsWithAttach.length} documento{itemsWithAttach.length > 1 ? "s" : ""})
                          </p>
                          <p className="text-[11px] text-gray-500">
                            Habilite para anexar os comprovantes organizados à folha de impressão / PDF gerado.
                          </p>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-gray-300 shadow-2xs hover:bg-gray-50 whitespace-nowrap self-start sm:self-auto">
                        <input
                          type="checkbox"
                          checked={includeAttachmentsInStatement}
                          onChange={(e) => setIncludeAttachmentsInStatement(e.target.checked)}
                          className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4"
                        />
                        <span className="text-xs font-bold text-gray-700">Anexar ao PDF</span>
                      </label>
                    </div>

                    {/* SEÇÃO DE ANEXOS PROCESSUAIS: VISÍVEL EXCLUSIVAMENTE NA IMPRESSÃO / PDF */}
                    {includeAttachmentsInStatement && (
                      <div className="hidden print:block print:break-before-page">
                        <div className="text-center pb-2 border-b border-gray-300 mb-4">
                          <h4 className="text-base font-bold uppercase tracking-wider text-gray-900">
                            ANEXOS: COMPROVANTES E GUIAS DE CUSTAS
                          </h4>
                          <p className="text-[11px] text-gray-500">
                            Documentos comprobatórios das despesas processuais reembolsadas neste demonstrativo
                          </p>
                        </div>

                        <div>
                          {itemsWithAttach.map((it, idx) => (
                            <div
                              key={it.id}
                              className={idx === 0 ? "mb-4" : "print:break-before-page pt-2 mb-4"}
                            >
                              <div className="flex items-center justify-between pb-1 border-b border-gray-300 mb-2">
                                <span className="font-bold text-gray-900 text-xs">
                                  Anexo {idx + 1}: {it.description}
                                </span>
                                <span className="font-bold text-gray-900 text-xs">{formatCurrency(it.amount)}</span>
                              </div>

                              <div className="w-full">
                                <DocumentAttachmentViewer
                                  url={it.attachment_url!}
                                  description={it.description}
                                  amount={it.amount}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Ações de Cobrança e Prestação de Contas */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100 print:hidden">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleMarkAllAsRefunded(statementCase.id)}
                    disabled={updatingRefund}
                    className="text-xs text-emerald-700 hover:bg-emerald-50 px-3 py-2 rounded-xl font-bold border border-emerald-300 transition-colors"
                  >
                    ✓ Quitar Todas as Custas
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="text-xs text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-xl font-semibold border border-gray-300 transition-colors flex items-center gap-1.5"
                  >
                    <span>🖨️</span>
                    <span>Imprimir / PDF</span>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      checked={includeAttachmentsInStatement}
                      onChange={(e) => setIncludeAttachmentsInStatement(e.target.checked)}
                      className="rounded border-gray-300 text-primary focus:ring-primary w-3.5 h-3.5"
                    />
                    <span>📎 Incluir guias no PDF</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => handleCopyWhatsAppMessage(statementCase)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <span>📲</span>
                    <span>Enviar Cobrança no WhatsApp</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE NOVA CUSTA DIRETA */}
      {newCostCase && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">Nova Custa Processual</h3>
                <p className="text-xs text-gray-500 mt-0.5">Proc: {newCostCase.case_number}</p>
              </div>
              <button onClick={() => setNewCostCase(null)} className="text-gray-400 hover:text-gray-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDirectCost} className="space-y-3.5 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Descrição da Custa / Guia *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Guia DARE Custas Iniciais, Diligência Oficial..."
                  value={costDescription}
                  onChange={(e) => setCostDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Valor (R$) *</label>
                  <input
                    type="text"
                    required
                    placeholder="0,00"
                    value={costAmount}
                    onChange={(e) => setCostAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Vencimento *</label>
                  <input
                    type="date"
                    required
                    value={costDueDate}
                    onChange={(e) => setCostDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Forma de Pagamento */}
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Forma de Pagamento</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCostPaymentMethod("boleto")}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold ${
                      costPaymentMethod === "boleto" ? "bg-blue-50 border-blue-500 text-blue-700" : "border-gray-200"
                    }`}
                  >
                    Boleto
                  </button>
                  <button
                    type="button"
                    onClick={() => setCostPaymentMethod("pix")}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold ${
                      costPaymentMethod === "pix" ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "border-gray-200"
                    }`}
                  >
                    Pix
                  </button>
                </div>
                <input
                  type="text"
                  placeholder={costPaymentMethod === "boleto" ? "Código de barras do boleto" : "Chave Pix do órgão"}
                  value={costBarcodeOrPix}
                  onChange={(e) => setCostBarcodeOrPix(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-primary mt-2 font-mono text-[11px]"
                />
              </div>

              {/* Anexo da Guia */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                <span className="font-semibold text-gray-700 block text-[11px]">Guia / Boleto em PDF (Opcional)</span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setCostFile(e.target.files?.[0] || null)}
                  className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:bg-primary/10 file:text-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setNewCostCase(null)}
                  className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-xl font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCost}
                  className="bg-primary hover:bg-primary-hover text-white px-4 py-1.5 rounded-xl font-semibold shadow-xs disabled:opacity-50"
                >
                  {savingCost ? "Salvando..." : "Salvar Custa no A Pagar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PREVIEW DE COMPROVANTE */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 shadow-2xl relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h4 className="font-bold text-gray-800 text-sm">Visualizador de Comprovante</h4>
              <button onClick={() => setPreviewUrl(null)} className="text-gray-400 hover:text-gray-700 font-bold">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2 flex items-center justify-center bg-gray-50 rounded-xl mt-2">
              {previewUrl.endsWith(".pdf") ? (
                <iframe src={previewUrl} className="w-full h-[600px] rounded-lg border border-gray-200" />
              ) : (
                <img
                  src={previewUrl}
                  alt="Comprovante"
                  className="max-h-[600px] max-w-full object-contain rounded-lg shadow-sm"
                />
              )}
            </div>
            <div className="flex justify-end mt-3">
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-3 py-1.5 rounded-lg"
              >
                Abrir em Nova Aba ↗
              </a>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE LIQUIDAÇÃO DE ALVARÁ & RPV (FASE 3) */}
      {showSettlementModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>🏛️</span>
                  <span>Liquidação de Alvará Judicial & RPV</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Calculadora automática de honorários, abatimento de custas e agendamento de repasse
                </p>
              </div>
              <button
                onClick={() => setShowSettlementModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSettlement} className="space-y-4 mt-4 text-xs">
              {/* Seleção do Processo */}
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Processo Judicial & Cliente *</label>
                <select
                  required
                  value={settlementCaseId}
                  onChange={(e) => {
                    const cId = e.target.value;
                    setSettlementCaseId(cId);
                    const selected = cases.find((c) => c.id === cId);
                    if (selected && selected.client_phone) {
                      setSettlementClientPix(selected.client_phone);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-amber-600 font-medium bg-white"
                >
                  <option value="">Selecione o processo...</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.case_number} — {c.client_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Título / Identificação e Data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Identificação do Título</label>
                  <input
                    type="text"
                    placeholder="Ex: Alvará nº 489/2026, RPV nº 2026.01"
                    value={settlementNumber}
                    onChange={(e) => setSettlementNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-amber-600 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Data do Depósito em Conta *</label>
                  <input
                    type="date"
                    required
                    value={settlementDate}
                    onChange={(e) => setSettlementDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-amber-600"
                  />
                </div>
              </div>

              {/* Valores: Bruto, % Contratual e Sucumbência */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Valor Bruto Depositado *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 100000,00"
                    value={settlementGrossAmount}
                    onChange={(e) => setSettlementGrossAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-amber-600 font-bold text-gray-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">% Honorários Contratuais</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={settlementFeeRate}
                      onChange={(e) => setSettlementFeeRate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-amber-600 font-semibold text-gray-800 pr-7"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Sucumbência (R$)</label>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={settlementSuccumbence}
                    onChange={(e) => setSettlementSuccumbence(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-amber-600 text-gray-800"
                    title="Honorários de sucumbência fixados pelo juiz e pertencentes ao advogado"
                  />
                </div>
              </div>

              {/* Abatimento Automático de Custas Processuais da Fase 2 */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settlementDeductPendingCosts}
                      onChange={(e) => setSettlementDeductPendingCosts(e.target.checked)}
                      className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 w-4 h-4"
                    />
                    <span className="font-semibold text-gray-800">
                      Ressarcir automaticamente custas adiantadas pelo escritório
                    </span>
                  </label>
                  <span className="font-bold text-purple-700 font-mono">
                    {formatCurrency(settlementPendingCosts)}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  {settlementPendingCosts > 0
                    ? `O escritório possui ${formatCurrency(
                        settlementPendingCosts
                      )} em custas judiciais/guias adiantadas neste processo. Ao manter selecionado, o valor será retido na fonte e as custas serão marcadas como reembolsadas.`
                    : "Este processo não possui custas judiciais pendentes no momento."}
                </p>
              </div>

              {/* FASE 4: RATEIO & SPLIT DE HONORÁRIOS COM PARCEIROS (OPCIONAL) */}
              <div className="bg-purple-50/60 border border-purple-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-purple-700 font-bold text-xs">🤝 Divisão de Honorários com Parceiros (Splits)</span>
                    <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-semibold">
                      {settlementSplits.length} {settlementSplits.length === 1 ? "parceiro" : "parceiros"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSplit}
                    className="text-xs font-bold text-purple-700 hover:text-purple-900 bg-white hover:bg-purple-100/70 border border-purple-300 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <span>+</span>
                    <span>Adicionar Parceiro / Captador</span>
                  </button>
                </div>

                <p className="text-[11px] text-gray-500 leading-snug">
                  Se você tiver parceiros (captadores, correspondentes ou advogados associados), informe o rateio abaixo. O sistema gerará as <strong>Contas a Pagar automáticas</strong> para cada parceiro e deduzirá da receita líquida do escritório.
                </p>

                {settlementSplits.length > 0 && (
                  <div className="space-y-2.5 pt-1">
                    {settlementSplits.map((split, index) => {
                      const comp = settlementCalculation.computedSplits.find((s) => s.id === split.id);
                      const computedVal = comp?.split_amount || 0;

                      return (
                        <div
                          key={split.id}
                          className="bg-white border border-purple-200/80 rounded-xl p-3 shadow-2xs space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-purple-900 flex items-center gap-1">
                              <span>#{index + 1}</span>
                              <span>Parceiro / Destinatário</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSplit(split.id)}
                              className="text-gray-400 hover:text-red-500 text-xs font-bold p-0.5 transition-colors cursor-pointer"
                              title="Remover parceiro"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <input
                                type="text"
                                placeholder="Nome do parceiro (ex: Dr. Carlos / Dra. Mariana)"
                                value={split.partner_name}
                                onChange={(e) => handleUpdateSplit(split.id, "partner_name", e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:border-purple-600"
                              />
                            </div>
                            <div>
                              <select
                                value={split.partner_role}
                                onChange={(e: any) => handleUpdateSplit(split.id, "partner_role", e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:border-purple-600 bg-white"
                              >
                                <option value="partner">Advogado Parceiro</option>
                                <option value="captador">Captador da Causa</option>
                                <option value="correspondent">Correspondente Jurídico</option>
                                <option value="associate">Advogado Associado</option>
                                <option value="expert">Perito / Técnico Assistente</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                            <div className="flex items-center gap-1.5">
                              <select
                                value={split.split_type}
                                onChange={(e: any) => handleUpdateSplit(split.id, "split_type", e.target.value)}
                                className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-purple-600 bg-white"
                              >
                                <option value="percentage">% dos Honorários</option>
                                <option value="fixed">Valor Fixo (R$)</option>
                              </select>
                            </div>

                            <div>
                              {split.split_type === "percentage" ? (
                                <div className="relative">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.5"
                                    placeholder="Ex: 20"
                                    value={split.split_percentage || ""}
                                    onChange={(e) =>
                                      handleUpdateSplit(split.id, "split_percentage", parseFloat(e.target.value) || 0)
                                    }
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:border-purple-600 pr-6 font-mono"
                                  />
                                  <span className="absolute right-2 top-1.5 text-xs font-bold text-gray-400">%</span>
                                </div>
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  step="10"
                                  placeholder="R$ fixo"
                                  value={split.split_amount || ""}
                                  onChange={(e) =>
                                    handleUpdateSplit(split.id, "split_amount", parseFloat(e.target.value) || 0)
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:border-purple-600 font-mono"
                                />
                              )}
                            </div>

                            <div>
                              <input
                                type="text"
                                placeholder="Chave Pix do parceiro..."
                                value={split.partner_pix_or_bank}
                                onChange={(e) => handleUpdateSplit(split.id, "partner_pix_or_bank", e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:border-purple-600 font-mono"
                              />
                            </div>
                          </div>

                          <div className="bg-purple-50/70 px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs border border-purple-100">
                            <span className="text-purple-800 font-medium text-[11px]">
                              Comissão apurada para este parceiro:
                            </span>
                            <span className="font-bold text-purple-950 font-mono">
                              {formatCurrency(computedVal)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* CARD DE CISÃO CONTÁBIL & TRIBUTÁRIA (Destaque Visual com Splits) */}
              <div className="bg-amber-50/70 border-2 border-amber-200 rounded-xl p-4 space-y-2.5">
                <p className="font-bold text-amber-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span>📊</span>
                  <span>Cisão Contábil Automática (Proteção Fiscal & Splits)</span>
                </p>

                <div
                  className={`grid ${
                    settlementCalculation.totalSplits > 0
                      ? "grid-cols-1 sm:grid-cols-3"
                      : "grid-cols-1 sm:grid-cols-2"
                  } gap-3 text-xs pt-1 border-t border-amber-200/60`}
                >
                  <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200/60">
                    <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                      Receita Bruta Honorários
                    </span>
                    <span className="text-base font-bold text-emerald-700">
                      {formatCurrency(settlementCalculation.officeTotalRevenue)}
                    </span>
                    <span className="text-[10px] text-gray-500 block mt-0.5">
                      Contratuais ({formatCurrency(settlementCalculation.contractualFee)})
                      {settlementCalculation.succumbence > 0
                        ? ` + Sucumb. (${formatCurrency(settlementCalculation.succumbence)})`
                        : ""}
                    </span>
                    <span className="text-[9px] text-emerald-800 font-semibold block mt-1 bg-emerald-100/60 px-1 py-0.5 rounded text-center">
                      Base Bruta do Alvará
                    </span>
                  </div>

                  {settlementCalculation.totalSplits > 0 && (
                    <div className="bg-white/80 p-2.5 rounded-lg border border-purple-200">
                      <span className="text-[10px] uppercase font-bold text-purple-800 block">
                        Comissões / Splits ({settlementCalculation.computedSplits.length})
                      </span>
                      <span className="text-base font-bold text-purple-700">
                        {formatCurrency(settlementCalculation.totalSplits)}
                      </span>
                      <span className="text-[10px] text-gray-500 block mt-0.5">
                        Líquido Escritório:{" "}
                        <strong className="text-emerald-800 font-bold">
                          {formatCurrency(settlementCalculation.netOfficeRevenue)}
                        </strong>
                      </span>
                      <span className="text-[9px] text-purple-800 font-semibold block mt-1 bg-purple-100/60 px-1 py-0.5 rounded text-center">
                        Gera Contas a Pagar
                      </span>
                    </div>
                  )}

                  <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200/60">
                    <span className="text-[10px] uppercase font-bold text-blue-800 block">
                      Repasse Líquido ao Cliente
                    </span>
                    <span className="text-base font-bold text-blue-700">
                      {formatCurrency(settlementCalculation.netClient)}
                    </span>
                    <span className="text-[10px] text-gray-500 block mt-0.5">
                      Depositado em conta do cliente
                    </span>
                    <span className="text-[9px] text-blue-800 font-semibold block mt-1 bg-blue-100/60 px-1 py-0.5 rounded text-center">
                      Repasse a Terceiros (Isento)
                    </span>
                  </div>
                </div>
              </div>

              {/* Dados do Repasse ao Cliente (Pix/Conta e Vencimento da Transferência) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Chave Pix ou Conta Bancária do Cliente
                  </label>
                  <input
                    type="text"
                    placeholder="Chave Pix, CPF, Agência e Conta..."
                    value={settlementClientPix}
                    onChange={(e) => setSettlementClientPix(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-amber-600 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Data Limite para Transferir ao Cliente *
                  </label>
                  <input
                    type="date"
                    required
                    value={settlementDueDate}
                    onChange={(e) => setSettlementDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-amber-600"
                  />
                </div>
              </div>

              {/* Observações / Notas */}
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Observações Internas (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Acordo homologado em audiência, aguardando envio do comprovante..."
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-amber-600"
                />
              </div>

              {/* Botões do Modal */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowSettlementModal(false)}
                  className="px-3.5 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingSettlement || settlementCalculation.gross <= 0}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-xl font-bold shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span>✓</span>
                  <span>{savingSettlement ? "Liquidando..." : "Confirmar & Gerar Repasse a Pagar"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TERMO DE QUITAÇÃO & PRESTAÇÃO DE CONTAS DO ALVARÁ (MODAL & PRINT VIEW) */}
      {receiptSettlement && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:static print:p-0 print:bg-white print:overflow-visible">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 my-8 flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:my-0 print:p-0 print:overflow-visible">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 print:hidden">
              <div>
                <h3 className="text-base font-bold text-gray-900">Termo de Prestação de Contas & Quitação</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Documento formal para assinatura ou envio em PDF para o cliente
                </p>
              </div>
              <button
                onClick={() => setReceiptSettlement(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* CONTEÚDO IMPRIMÍVEL DO TERMO */}
            <div className="flex-1 overflow-y-auto py-4 px-2 space-y-5 text-gray-800 text-xs">
              <div className="text-center border-b pb-4 border-gray-200 space-y-1">
                <p className="text-lg font-bold uppercase tracking-wider text-gray-900">
                  TERMO DE PRESTAÇÃO DE CONTAS E QUITAÇÃO DE ALVARÁ JUDICIAL
                </p>
                <p className="text-xs text-gray-500 font-medium">
                  Em cumprimento ao art. 668 do Código Civil e art. 34, XXI da Lei Federal nº 8.906/94 (Estatuto da OAB)
                </p>
              </div>

              {/* Qualificação do Caso */}
              {(() => {
                const targetCase = cases.find((c) => c.id === receiptSettlement.legal_case_id);
                return (
                  <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-1 text-xs">
                    <p>
                      <strong>Processo Judicial nº:</strong> {targetCase?.case_number || "—"}
                    </p>
                    <p>
                      <strong>Vara / Comarca:</strong> {targetCase?.court_courtroom || "—"}
                    </p>
                    <p>
                      <strong>Cliente / Outorgante:</strong> {receiptSettlement.client_name}
                    </p>
                    <p>
                      <strong>Patrono da Causa:</strong> {officePatronName || selectedCompany?.name || "Patrono da Causa"}
                      {officeOabNumber ? ` (${officeOabNumber})` : ""}
                    </p>
                    <p>
                      <strong>Título / Alvará:</strong> {receiptSettlement.settlement_number || "Alvará Judicial"}
                    </p>
                    <p>
                      <strong>Data da Liberação:</strong> {formatDate(receiptSettlement.issue_date)}
                    </p>
                  </div>
                );
              })()}

              {/* Demonstrativo Financeiro Formal */}
              <div>
                <p className="font-bold text-gray-900 text-xs mb-2 uppercase tracking-wide">
                  DEMONSTRATIVO FINANCEIRO DA LIQUIDAÇÃO
                </p>
                <table className="w-full border border-gray-200 text-xs">
                  <tbody>
                    <tr className="border-b bg-gray-50">
                      <td className="py-2 px-3 font-semibold text-gray-700">
                        1. VALOR BRUTO LEVANTADO PELO JUÍZO (ALVARÁ / RPV)
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-gray-900">
                        {formatCurrency(Number(receiptSettlement.gross_amount))}
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 px-3 text-gray-700">
                        (-) Honorários Advocatícios Contratuais ({receiptSettlement.contractual_fee_rate}%)
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-rose-600">
                        - {formatCurrency(Number(receiptSettlement.contractual_fee_amount))}
                      </td>
                    </tr>
                    {Number(receiptSettlement.deducted_costs_amount) > 0 && (
                      <tr className="border-b">
                        <td className="py-2 px-3 text-gray-700">
                          (-) Reembolso de Custas e Despesas Processuais Adiantadas pelo Escritório
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-purple-700">
                          - {formatCurrency(Number(receiptSettlement.deducted_costs_amount))}
                        </td>
                      </tr>
                    )}
                    <tr className="bg-blue-50/80 font-bold border-t-2 border-blue-300">
                      <td className="py-2.5 px-3 text-blue-900 text-sm">
                        (=) VALOR LÍQUIDO DISPONIBILIZADO AO CLIENTE
                      </td>
                      <td className="py-2.5 px-3 text-right text-blue-900 text-base font-bold">
                        {formatCurrency(Number(receiptSettlement.net_client_amount))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Dados Bancários do Repasse */}
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs">
                <p>
                  <strong>Dados para Transferência Bancária / Pix:</strong>{" "}
                  {receiptSettlement.client_pix_or_bank || "Conforme indicado pelo cliente"}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  A conta a pagar foi criada automaticamente e será liquidada via transferência bancária com o respectivo comprovante.
                </p>
              </div>

              {/* Cláusula de Quitação e Assinaturas */}
              <div className="space-y-8 pt-4">
                <p className="text-[11px] text-gray-600 leading-relaxed text-justify">
                  O(A) Outorgante declara que recebeu nesta data a exata prestação de contas dos valores levantados no processo acima identificado, dando ao escritório plena, geral, rasa e irrevogável quitação de todas as quantias devidas neste feito.
                </p>

                {/* Assinaturas Dinâmicas (Respeita o Modo de Assinatura Configurado) */}
                <div className="pt-6">
                  {(() => {
                    const linkedCase = cases.find((c) => c.id === receiptSettlement.legal_case_id);
                    const respLawyer = officeLawyers.find((l) => l.name === linkedCase?.responsible_lawyer);
                    const partners = officeLawyers.filter((l) => l.role === "partner");

                    let lawyerSignatures: Array<{ name: string; oab: string; title: string }> = [];

                    if (officeSignatureMode === "firm") {
                      lawyerSignatures = [
                        {
                          name: officePatronName || selectedCompany?.name || "Sociedade de Advogados",
                          oab: officeOabNumber ? `Inscrição OAB: ${officeOabNumber}` : "Sociedade de Advogados",
                          title: "Sociedade de Advogados (Pessoa Jurídica)",
                        },
                      ];
                    } else if (officeSignatureMode === "all" && partners.length > 0) {
                      lawyerSignatures = partners.map((p) => ({
                        name: p.name,
                        oab: p.oab ? `OAB: ${p.oab}` : "Advogado Sócio",
                        title: "Advogado(a) Sócio(a)",
                      }));
                    } else {
                      // Modo "responsible" (padrão)
                      lawyerSignatures = [
                        {
                          name:
                            respLawyer?.name ||
                            linkedCase?.responsible_lawyer ||
                            officePatronName ||
                            selectedCompany?.name ||
                            "Patrono da Causa",
                          oab: respLawyer?.oab
                            ? `OAB: ${respLawyer.oab}`
                            : officeOabNumber
                            ? `OAB: ${officeOabNumber}`
                            : "Patrono da Causa",
                          title: "Advogado(a) Responsável / Patrono",
                        },
                      ];
                    }

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-end">
                        <div className="space-y-6">
                          {lawyerSignatures.map((sig, sIdx) => (
                            <div key={sIdx} className="text-center border-t border-gray-400 pt-2">
                              <p className="font-bold text-gray-900 text-xs">{sig.name}</p>
                              <p className="text-[11px] text-gray-500">{sig.oab}</p>
                              <p className="text-[10px] text-gray-400 italic">{sig.title}</p>
                            </div>
                          ))}
                        </div>

                        <div className="text-center border-t border-gray-400 pt-2">
                          <p className="font-bold text-gray-900 text-xs">{receiptSettlement.client_name}</p>
                          <p className="text-[11px] text-gray-500">Cliente / Outorgante</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              {/* SEÇÃO DE ANEXOS DAS CUSTAS NO PDF / IMPRESSÃO (OCULTO NA TELA DO MODAL) */}
              {includeAttachmentsInSettlement && (() => {
                const caseExps = (caseExpensesMap.get(receiptSettlement.legal_case_id)?.list || []).filter(
                  (it) => it.attachment_url
                );

                if (caseExps.length === 0) return null;

                return (
                  <div className="hidden print:block print:break-before-page">
                    <div className="text-center pb-2 border-b border-gray-300 mb-4">
                      <h4 className="text-base font-bold uppercase tracking-wider text-gray-900">
                        ANEXOS: COMPROVANTES E GUIAS DE RECOLHIMENTO
                      </h4>
                      <p className="text-[11px] text-gray-500">
                        Documentos comprobatórios das despesas processuais reembolsadas na liquidação
                      </p>
                    </div>

                    <div>
                      {caseExps.map((it, idx) => (
                        <div
                          key={it.id}
                          className={idx === 0 ? "mb-4" : "print:break-before-page pt-2 mb-4"}
                        >
                          <div className="flex items-center justify-between pb-1 border-b border-gray-300 mb-2">
                            <span className="font-bold text-gray-900 text-xs">
                              Anexo {idx + 1}: {it.description}
                            </span>
                            <span className="font-bold text-gray-900 text-xs">{formatCurrency(it.amount)}</span>
                          </div>

                          <div className="w-full">
                            <DocumentAttachmentViewer
                              url={it.attachment_url!}
                              description={it.description}
                              amount={it.amount}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Ações do Termo */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-200 print:hidden">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReceiptSettlement(null)}
                  className="px-3.5 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium text-xs"
                >
                  Fechar
                </button>

                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={includeAttachmentsInSettlement}
                    onChange={(e) => setIncludeAttachmentsInSettlement(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary w-3.5 h-3.5"
                  />
                  <span>📎 Incluir guias e comprovantes no PDF</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="text-xs text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-xl font-semibold border border-gray-300 transition-colors flex items-center gap-1.5"
                >
                  <span>🖨️</span>
                  <span>Imprimir / Salvar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCopySettlementWhatsApp(receiptSettlement)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <span>📲</span>
                  <span>Enviar no WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Navigation>
  );
}
