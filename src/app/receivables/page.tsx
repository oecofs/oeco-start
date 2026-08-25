"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import Navigation from "@/components/Navigation";
import MonthSelector from "@/components/MonthSelector";

type Receivable = {
  id: string;
  name?: string;
  client_name: string;
  description: string;
  nf_number: string | null;
  amount: number;
  received_amount: number;
  due_date: string;
  status: "open" | "partial" | "received" | "overdue";
  is_recurring: boolean;
  recurring_day: number | null;
  received_at: string | null;
  linked_transaction_id: string | null;
  month_ref: string;
  is_active: boolean;
  contract_id?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
  isOverdueFromPast?: boolean;
};

type Contract = {
  id: string;
  company_id: string;
  client_name: string;
  title: string;
  total_amount: number;
  start_date: string;
  status: "active" | "completed" | "cancelled";
  notes?: string | null;
  created_at?: string;
  // Calculados
  total_received?: number;
  progress_percent?: number;
  installments?: Receivable[];
  next_due_date?: string | null;
  has_overdue?: boolean;
};

type FormData = {
  client_name: string;
  nf_number: string;
  description: string;
  amount: string;
  due_date: string;
  is_recurring: boolean;
  recurring_day: string;
};

type ContractFormData = {
  client_name: string;
  title: string;
  total_amount: string;
  start_date: string;
  has_down_payment: boolean;
  down_payment_amount: string;
  down_payment_due_date: string;
  installments_count: string;
  installments_first_due_date: string;
  notes: string;
};

// Helper: Cálculo em cascata (Waterfall) de compensação de diferenças entre parcelas do contrato
function computeContractInstallmentsWithWaterfall(installments: Receivable[]) {
  const sorted = [...installments].sort(
    (a, b) => (a.installment_number ?? 999) - (b.installment_number ?? 999)
  );

  let accumulatedDifference = 0; // Se negativo: faltou pagar; se positivo: sobrou crédito

  return sorted.map((inst) => {
    const baseAmount = Number(inst.amount);
    const receivedAmount = Number(inst.received_amount || 0);
    const isReceived = inst.status === "received";
    const isPartial = inst.status === "partial";
    const hasPayment = isReceived || isPartial || receivedAmount > 0;

    const previousAdjustment = accumulatedDifference;
    // Ajusta o valor esperado desta parcela compensando a pendência ou crédito anterior
    const effectiveExpectedAmount = Math.max(0, baseAmount - previousAdjustment);

    let currentDifference = 0;
    let balanceRemaining = 0;

    if (hasPayment) {
      currentDifference = receivedAmount - effectiveExpectedAmount;
      accumulatedDifference = currentDifference;
      balanceRemaining = Math.max(0, effectiveExpectedAmount - receivedAmount);
    } else {
      currentDifference = 0;
      balanceRemaining = effectiveExpectedAmount;
      accumulatedDifference = 0; // Absorvido por esta parcela
    }

    return {
      ...inst,
      baseAmount,
      receivedAmount,
      previousAdjustment,
      effectiveExpectedAmount,
      currentDifference,
      balanceRemaining,
      hasPayment,
    };
  });
}

export default function ReceivablesPage() {
  const supabase = createClient();
  const router = useRouter();
  const { selectedCompany } = useCompany();

  // Controle de Abas Principais: 'titles' (Títulos do Mês) vs 'contracts' (Contratos Ativos)
  const [activeTab, setActiveTab] = useState<"titles" | "contracts">("titles");

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [allCompanyReceivables, setAllCompanyReceivables] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);

  // Modais
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showContractModal, setShowContractModal] = useState(false);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [selectedContractDetails, setSelectedContractDetails] = useState<Contract | null>(null);

  // Modal de Confirmação de Recebimento com Valor Customizável
  const [receiveModalItem, setReceiveModalItem] = useState<Receivable | null>(null);
  const [receiveAmountInput, setReceiveAmountInput] = useState("");
  const [receiveDateInput, setReceiveDateInput] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "overdue" | "received">("all");

  const emptyForm: FormData = {
    client_name: "",
    nf_number: "",
    description: "",
    amount: "",
    due_date: "",
    is_recurring: false,
    recurring_day: "",
  };

  const [formData, setFormData] = useState<FormData>(emptyForm);

  const todayStr = new Date().toISOString().split("T")[0];

  const emptyContractForm: ContractFormData = {
    client_name: "",
    title: "",
    total_amount: "",
    start_date: todayStr,
    has_down_payment: true,
    down_payment_amount: "",
    down_payment_due_date: todayStr,
    installments_count: "4",
    installments_first_due_date: "",
    notes: "",
  };

  const [contractForm, setContractForm] = useState<ContractFormData>(emptyContractForm);

  // 1. Busca Recebíveis do mês + Inadimplência acumulada de meses anteriores
  const fetchReceivablesData = useCallback(async () => {
    if (!selectedCompany) {
      setReceivables([]);
      setContracts([]);
      setAllCompanyReceivables([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // A. Recebíveis do mês vigente
      const { data: monthData, error: mErr } = await supabase
        .from("receivables")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .eq("month_ref", selectedMonth)
        .eq("is_active", true)
        .order("due_date", { ascending: true });

      if (mErr) console.error("Erro ao buscar recebíveis do mês:", mErr);

      // B. Recebíveis de meses anteriores que ainda estão em aberto/atrasados (Rolagem de Inadimplência)
      const { data: pastOverdueData, error: pErr } = await supabase
        .from("receivables")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .lt("month_ref", selectedMonth)
        .eq("is_active", true)
        .neq("status", "received")
        .order("due_date", { ascending: true });

      if (pErr) console.error("Erro ao buscar recebíveis anteriores:", pErr);

      // C. Todos os recebíveis da empresa (para contratos)
      const { data: allData } = await supabase
        .from("receivables")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .eq("is_active", true)
        .order("due_date", { ascending: true });

      // D. Transações bancárias vinculadas a recebíveis (Fonte da verdade para valores liquidados)
      const { data: linkedTransactions } = await supabase
        .from("transactions")
        .select("id, receivable_id, amount, date")
        .eq("company_id", selectedCompany.id)
        .not("receivable_id", "is", null);

      // E. Contratos da empresa
      const { data: contractsData } = await supabase
        .from("contracts")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .order("created_at", { ascending: false });

      const today = new Date().toISOString().split("T")[0];

      // Função de enriquecimento com sincronização de transações bancárias vinculadas
      function enrichReceivable(r: any, isOverdueFromPast: boolean): Receivable {
        const linkedTrxs = (linkedTransactions || []).filter((t) => t.receivable_id === r.id);
        const actualFromTrx = linkedTrxs.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
        const finalReceived = linkedTrxs.length > 0 ? actualFromTrx : Number(r.received_amount || 0);
        const latestPaymentDate = linkedTrxs.length > 0 ? linkedTrxs[0].date : r.received_at;

        const isReceived = finalReceived >= Number(r.amount) && Number(r.amount) > 0;
        const isPartial = finalReceived > 0 && finalReceived < Number(r.amount);
        let status: Receivable["status"] = isReceived
          ? "received"
          : isPartial
          ? "partial"
          : r.due_date < today
          ? "overdue"
          : ((r.status === "pending" ? "open" : r.status) as Receivable["status"]);

        return {
          ...r,
          received_amount: finalReceived,
          received_at: latestPaymentDate,
          status,
          isOverdueFromPast,
        };
      }

      const enrichedAll = (allData || []).map((r) => enrichReceivable(r, false));
      setAllCompanyReceivables(enrichedAll);

      const formattedPast = (pastOverdueData || []).map((r) => enrichReceivable(r, true));
      const formattedMonth = (monthData || []).map((r) => enrichReceivable(r, false));

      // Combina a lista (evitando duplicatas se o ID já existir)
      const existingIds = new Set(formattedMonth.map((m) => m.id));
      const combined = [...formattedPast.filter((p) => !existingIds.has(p.id)), ...formattedMonth];
      setReceivables(combined);

      // Processa contratos com seus recebíveis vinculados e sincronizados
      const populatedContracts: Contract[] = (contractsData || []).map((c) => {
        const linked = enrichedAll.filter((r) => r.contract_id === c.id);
        const totalReceived = linked.reduce((sum, r) => sum + Number(r.received_amount || 0), 0);
        const totalAmount = Number(c.total_amount) || 1;
        const progressPercent = Math.min(100, Math.round((totalReceived / totalAmount) * 100));
        const pendingInstallments = linked.filter((r) => r.status !== "received");
        const nextDueDate = pendingInstallments.length > 0 ? pendingInstallments[0].due_date : null;
        const hasOverdue = pendingInstallments.some((r) => r.due_date < today && r.status !== "received");

        return {
          ...c,
          total_amount: Number(c.total_amount),
          total_received: totalReceived,
          progress_percent: progressPercent,
          installments: linked,
          next_due_date: nextDueDate,
          has_overdue: hasOverdue,
        };
      });

      setContracts(populatedContracts);

      // Se o modal de detalhes do contrato estiver aberto, atualiza o contrato selecionado
      if (selectedContractDetails) {
        const updatedSelected = populatedContracts.find((c) => c.id === selectedContractDetails.id);
        if (updatedSelected) {
          setSelectedContractDetails(updatedSelected);
        }
      }
    } catch (err) {
      console.error("Erro geral ao carregar dados:", err);
      setError("Erro ao carregar dados de recebíveis.");
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedMonth, selectedCompany, selectedContractDetails?.id]);

  useEffect(() => {
    fetchReceivablesData();
  }, [fetchReceivablesData]);

  // Cálculos de Totais e Inadimplência
  const stats = useMemo(() => {
    const totalAmount = receivables.reduce((sum, r) => sum + Number(r.amount), 0);
    const totalReceived = receivables.reduce((sum, r) => sum + Number(r.received_amount || 0), 0);
    const totalPending = Math.max(0, totalAmount - totalReceived);

    const overduePastItems = receivables.filter((r) => r.isOverdueFromPast && r.status !== "received");
    const overduePastAmount = overduePastItems.reduce(
      (sum, r) => sum + Math.max(0, Number(r.amount) - Number(r.received_amount || 0)),
      0
    );

    const openCount = receivables.filter((r) => r.status === "open" || r.status === "partial").length;
    const overdueCount = receivables.filter((r) => r.status === "overdue").length;
    const receivedCount = receivables.filter((r) => r.status === "received").length;

    return {
      totalAmount,
      totalReceived,
      totalPending,
      overduePastItems,
      overduePastAmount,
      openCount,
      overdueCount,
      receivedCount,
    };
  }, [receivables]);

  // Contratos KPIs
  const contractStats = useMemo(() => {
    const totalContracted = contracts.reduce((sum, c) => sum + Number(c.total_amount), 0);
    const totalReceived = contracts.reduce((sum, c) => sum + Number(c.total_received || 0), 0);
    const totalPending = Math.max(0, totalContracted - totalReceived);
    const activeContractsCount = contracts.filter((c) => c.status === "active").length;

    return {
      totalContracted,
      totalReceived,
      totalPending,
      activeContractsCount,
    };
  }, [contracts]);

  // Títulos filtrados
  const filteredReceivables = useMemo(() => {
    return receivables.filter((r) => {
      if (filter === "pending") return r.status === "open" || r.status === "partial";
      if (filter === "overdue") return r.status === "overdue";
      if (filter === "received") return r.status === "received";
      return true;
    });
  }, [receivables, filter]);

  // Gerador de Parcelas em tempo real para o Modal de Contratos
  const previewInstallments = useMemo(() => {
    const total = parseFloat(contractForm.total_amount) || 0;
    if (total <= 0) return [];

    const items: Array<{
      label: string;
      installmentNumber: number;
      totalInstallments: number;
      amount: number;
      dueDate: string;
      monthRef: string;
    }> = [];

    let remainingTotal = total;
    let downPayment = 0;

    if (contractForm.has_down_payment) {
      downPayment = parseFloat(contractForm.down_payment_amount) || 0;
      if (downPayment > 0) {
        remainingTotal = Math.max(0, total - downPayment);
        const dDate = contractForm.down_payment_due_date || contractForm.start_date || todayStr;
        items.push({
          label: "Entrada",
          installmentNumber: 0,
          totalInstallments: parseInt(contractForm.installments_count) || 1,
          amount: downPayment,
          dueDate: dDate,
          monthRef: dDate.substring(0, 7),
        });
      }
    }

    const numInstallments = parseInt(contractForm.installments_count) || 1;
    if (numInstallments > 0 && remainingTotal > 0) {
      const installmentValue = Math.round((remainingTotal / numInstallments) * 100) / 100;
      const baseDateStr =
        contractForm.installments_first_due_date || contractForm.start_date || todayStr;
      const baseDate = new Date(baseDateStr + "T00:00:00");

      for (let i = 1; i <= numInstallments; i++) {
        const d = new Date(baseDate);
        const monthOffset = contractForm.has_down_payment && !contractForm.installments_first_due_date ? i : i - 1;
        d.setMonth(d.getMonth() + monthOffset);

        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const formattedDate = `${y}-${m}-${day}`;

        items.push({
          label: `Parcela ${i}/${numInstallments}`,
          installmentNumber: i,
          totalInstallments: numInstallments,
          amount: i === numInstallments ? remainingTotal - installmentValue * (numInstallments - 1) : installmentValue,
          dueDate: formattedDate,
          monthRef: `${y}-${m}`,
        });
      }
    }

    return items;
  }, [contractForm, todayStr]);

  // Abertura do Modal de Novo Contrato
  function handleOpenNewContract() {
    setEditingContractId(null);
    setContractForm(emptyContractForm);
    setShowContractModal(true);
    setError("");
    setSuccess("");
  }

  // Abertura do Modal de Edição de Contrato Existente
  function handleOpenEditContract(contract: Contract) {
    setEditingContractId(contract.id);
    const installments = contract.installments || [];
    const downPaymentItem = installments.find((i) => i.installment_number === 0);
    const regularInstallments = installments.filter((i) => (i.installment_number ?? 0) > 0);
    const firstRegularDueDate = regularInstallments.length > 0 ? regularInstallments[0].due_date : "";

    setContractForm({
      client_name: contract.client_name,
      title: contract.title,
      total_amount: String(contract.total_amount),
      start_date: contract.start_date || todayStr,
      has_down_payment: !!downPaymentItem,
      down_payment_amount: downPaymentItem ? String(downPaymentItem.amount) : "",
      down_payment_due_date: downPaymentItem ? downPaymentItem.due_date : todayStr,
      installments_count: String(regularInstallments.length || 4),
      installments_first_due_date: firstRegularDueDate,
      notes: contract.notes || "",
    });
    setShowContractModal(true);
    setError("");
    setSuccess("");
  }

  // Salvar Contrato (Criação ou Edição)
  async function handleSaveContract(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedCompany) {
      setError("Nenhuma empresa selecionada.");
      return;
    }
    if (!contractForm.client_name.trim()) {
      setError("Nome do cliente é obrigatório.");
      return;
    }
    if (!contractForm.title.trim()) {
      setError("Título do contrato é obrigatório.");
      return;
    }
    const totalAmount = parseFloat(contractForm.total_amount);
    if (!totalAmount || totalAmount <= 0) {
      setError("Valor total do contrato inválido.");
      return;
    }
    if (previewInstallments.length === 0) {
      setError("Nenhuma parcela foi gerada.");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (editingContractId) {
        // MODO EDIÇÃO
        const existingContract = contracts.find((c) => c.id === editingContractId);
        const existingInstallments = existingContract?.installments || [];
        const hasPaidInstallments = existingInstallments.some(
          (i) => i.status === "received" || Number(i.received_amount || 0) > 0
        );

        // 1. Atualiza dados do contrato
        const { error: cErr } = await supabase
          .from("contracts")
          .update({
            client_name: contractForm.client_name.trim(),
            title: contractForm.title.trim(),
            total_amount: totalAmount,
            start_date: contractForm.start_date || todayStr,
            notes: contractForm.notes.trim() || null,
          })
          .eq("id", editingContractId);

        if (cErr) {
          console.error("Erro ao atualizar contrato:", cErr);
          setError("Erro ao atualizar contrato no banco de dados.");
          return;
        }

        // Se nenhuma parcela foi paga ainda, podemos regenerar o cronograma completo
        if (!hasPaidInstallments) {
          // Remove parcelas antigas
          await supabase.from("receivables").delete().eq("contract_id", editingContractId);

          // Insere novo cronograma
          const installmentsToInsert = previewInstallments.map((item) => ({
            company_id: selectedCompany.id,
            user_id: user?.id,
            contract_id: editingContractId,
            client_name: contractForm.client_name.trim(),
            description: `${contractForm.title.trim()} (${item.label})`,
            amount: item.amount,
            due_date: item.dueDate,
            month_ref: item.monthRef,
            status: "open",
            received_amount: 0,
            is_active: true,
            installment_number: item.installmentNumber,
            total_installments: item.totalInstallments,
          }));

          const { error: rErr } = await supabase.from("receivables").insert(installmentsToInsert);
          if (rErr) console.error("Erro ao regenerar parcelas:", rErr);
        } else {
          // Se já tem parcelas com pagamentos, apenas atualiza client_name e título nas parcelas existentes
          await supabase
            .from("receivables")
            .update({
              client_name: contractForm.client_name.trim(),
            })
            .eq("contract_id", editingContractId);
        }

        setSuccess(`Contrato "${contractForm.title}" atualizado com sucesso!`);
        setShowContractModal(false);
        setEditingContractId(null);
        setContractForm(emptyContractForm);
        fetchReceivablesData();
        return;
      }

      // MODO CRIAÇÃO DE NOVO CONTRATO
      const { data: newContract, error: cErr } = await supabase
        .from("contracts")
        .insert({
          company_id: selectedCompany.id,
          client_name: contractForm.client_name.trim(),
          title: contractForm.title.trim(),
          total_amount: totalAmount,
          start_date: contractForm.start_date || todayStr,
          status: "active",
          notes: contractForm.notes.trim() || null,
          user_id: user?.id,
        })
        .select()
        .single();

      if (cErr || !newContract) {
        console.error("Erro ao criar contrato:", cErr);
        setError("Erro ao criar contrato no banco de dados.");
        return;
      }

      const installmentsToInsert = previewInstallments.map((item) => ({
        company_id: selectedCompany.id,
        user_id: user?.id,
        contract_id: newContract.id,
        client_name: contractForm.client_name.trim(),
        description: `${contractForm.title.trim()} (${item.label})`,
        amount: item.amount,
        due_date: item.dueDate,
        month_ref: item.monthRef,
        status: "open",
        received_amount: 0,
        is_active: true,
        installment_number: item.installmentNumber,
        total_installments: item.totalInstallments,
      }));

      const { error: rErr } = await supabase.from("receivables").insert(installmentsToInsert);

      if (rErr) {
        console.error("Erro ao gerar parcelas:", rErr);
        setError("Contrato criado, mas houve erro ao gerar algumas parcelas.");
        return;
      }

      setSuccess(`Contrato "${contractForm.title}" e ${previewInstallments.length} parcelas criados com sucesso!`);
      setShowContractModal(false);
      setContractForm(emptyContractForm);
      fetchReceivablesData();
    } catch (err) {
      console.error("Erro geral:", err);
      setError("Erro inesperado ao salvar contrato.");
    }
  }

  // Excluir Contrato e suas parcelas
  async function handleDeleteContract(contract: Contract) {
    const installments = contract.installments || [];
    const hasPaid = installments.some(
      (i) => i.status === "received" || Number(i.received_amount || 0) > 0
    );

    const msg = hasPaid
      ? `Atenção: O contrato "${contract.title}" possui parcelas já recebidas/vinculadas. Deseja realmente excluir este contrato e todas as suas parcelas?`
      : `Deseja realmente excluir o contrato "${contract.title}" e todas as suas parcelas?`;

    if (!confirm(msg)) return;

    try {
      // 1. Desvincula transações associadas aos recebíveis deste contrato
      const recIds = installments.map((i) => i.id);
      if (recIds.length > 0) {
        await supabase
          .from("transactions")
          .update({ receivable_id: null })
          .in("receivable_id", recIds);

        // 2. Remove os recebíveis do contrato
        await supabase.from("receivables").delete().eq("contract_id", contract.id);
      }

      // 3. Remove o contrato
      await supabase.from("contracts").delete().eq("id", contract.id);

      setSuccess(`Contrato "${contract.title}" excluído com sucesso!`);
      if (selectedContractDetails?.id === contract.id) {
        setSelectedContractDetails(null);
      }
      fetchReceivablesData();
    } catch (err) {
      console.error("Erro ao excluir contrato:", err);
      setError("Erro ao excluir contrato.");
    }
  }

  // Open form for individual receivable
  function handleNewReceivable() {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  function handleEditReceivable(receivable: Receivable) {
    setEditingId(receivable.id);
    setFormData({
      client_name: receivable.client_name,
      nf_number: receivable.nf_number || "",
      description: receivable.description,
      amount: String(receivable.amount),
      due_date: receivable.due_date,
      is_recurring: receivable.is_recurring,
      recurring_day: receivable.recurring_day ? String(receivable.recurring_day) : "",
    });
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  async function handleSaveReceivable(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!formData.client_name.trim()) {
      setError("O nome do cliente é obrigatório.");
      return;
    }
    if (!formData.description.trim()) {
      setError("A descrição é obrigatória.");
      return;
    }
    if (!formData.amount || isNaN(Number(formData.amount))) {
      setError("O valor é obrigatório.");
      return;
    }
    if (!formData.is_recurring && !formData.due_date) {
      setError("A data de vencimento é obrigatória.");
      return;
    }
    if (!selectedCompany) {
      setError("Nenhuma empresa selecionada.");
      return;
    }

    const amount = Number(formData.amount);
    let dueDate = formData.due_date;
    let monthRef = selectedMonth;

    if (formData.is_recurring && formData.recurring_day) {
      const [year, month] = selectedMonth.split("-");
      const day = String(formData.recurring_day).padStart(2, "0");
      dueDate = `${year}-${month}-${day}`;
      monthRef = selectedMonth;
    } else if (dueDate) {
      monthRef = dueDate.substring(0, 7);
    }

    const payload: any = {
      client_name: formData.client_name.trim(),
      nf_number: formData.nf_number.trim() || null,
      description: formData.description.trim(),
      amount,
      due_date: dueDate,
      status: editingId ? undefined : "open",
      is_recurring: formData.is_recurring,
      recurring_day: formData.is_recurring && formData.recurring_day ? parseInt(formData.recurring_day) : null,
      month_ref: monthRef,
      is_active: true,
      company_id: selectedCompany.id,
    };

    if (editingId) {
      const { error } = await supabase.from("receivables").update(payload).eq("id", editingId);
      if (error) {
        setError("Erro ao atualizar recebível.");
        return;
      }
      setSuccess("Recebível atualizado com sucesso!");
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("receivables").insert({
        ...payload,
        user_id: user?.id,
      });

      if (error) {
        setError("Erro ao criar recebível.");
        return;
      }
      setSuccess("Recebível criado com sucesso!");
    }

    setShowForm(false);
    fetchReceivablesData();
  }

  // Abrir Modal de Recebimento com Valor Customizável
  function handleOpenReceiveModal(receivable: Receivable) {
    setReceiveModalItem(receivable);
    const remaining = Math.max(0, Number(receivable.amount) - Number(receivable.received_amount || 0));
    setReceiveAmountInput(String(remaining > 0 ? remaining : receivable.amount));
    setReceiveDateInput(todayStr);
  }

  async function handleConfirmReceive(e: React.FormEvent) {
    e.preventDefault();
    if (!receiveModalItem) return;

    const amountPaid = parseFloat(receiveAmountInput);
    if (isNaN(amountPaid) || amountPaid <= 0) {
      setError("Informe um valor de recebimento válido.");
      return;
    }

    const currentReceived = Number(receiveModalItem.received_amount || 0);
    const newTotalReceived = currentReceived + amountPaid;
    const isFullOrSurplus = newTotalReceived >= Number(receiveModalItem.amount);
    const newStatus: "received" | "partial" = isFullOrSurplus ? "received" : "partial";

    const { error } = await supabase
      .from("receivables")
      .update({
        status: newStatus,
        received_amount: newTotalReceived,
        received_at: receiveDateInput || todayStr,
      })
      .eq("id", receiveModalItem.id);

    if (error) {
      setError("Erro ao registrar recebimento.");
      return;
    }

    setSuccess(
      isFullOrSurplus
        ? "Recebimento liquidado com sucesso!"
        : `Recebimento parcial de ${formatCurrency(amountPaid)} registrado. Saldo restante em aberto.`
    );
    setReceiveModalItem(null);
    fetchReceivablesData();
  }

  async function handleMarkPending(receivable: Receivable) {
    const { error } = await supabase
      .from("receivables")
      .update({
        status: "open",
        received_amount: 0,
        received_at: null,
      })
      .eq("id", receivable.id);

    if (error) {
      setError("Erro ao marcar como pendente.");
      return;
    }
    setSuccess("Recebível marcado como pendente!");
    fetchReceivablesData();
  }

  async function handleDeleteReceivable(id: string) {
    if (!confirm("Tem certeza que deseja excluir este recebível?")) return;
    const { error } = await supabase.from("receivables").delete().eq("id", id);
    if (error) {
      setError("Erro ao excluir recebível.");
      return;
    }
    setSuccess("Recebível excluído!");
    fetchReceivablesData();
  }

  function formatCurrency(val: number): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val || 0);
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return "—";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  }

  // Navegar direto para a transação bancária vinculada
  function handleNavigateToTransaction(receivable: Receivable) {
    const targetMonth = receivable.received_at
      ? receivable.received_at.substring(0, 7)
      : receivable.month_ref;
    router.push(`/transactions?month=${targetMonth}&receivable_id=${receivable.id}`);
  }

  return (
    <Navigation>
      <div className="p-4 md:p-8 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Recebíveis & Contratos</h1>
            <p className="text-xs text-gray-500">
              Gestão de faturas, contratos com parcelamento inteligente e controle de inadimplência
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {activeTab === "titles" && (
              <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
            )}

            {activeTab === "titles" ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleNewReceivable}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold rounded-xl text-xs transition-all shadow-xs flex items-center gap-1.5"
                >
                  <span>+</span> Título Avulso
                </button>
                <button
                  onClick={handleOpenNewContract}
                  className="px-4 py-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center gap-1.5"
                >
                  <span>📁</span> Novo Contrato (Entrada + Parcelas)
                </button>
              </div>
            ) : (
              <button
                onClick={handleOpenNewContract}
                className="px-4 py-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center gap-1.5"
              >
                <span>+</span> Novo Contrato (Entrada + Parcelas)
              </button>
            )}
          </div>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="font-bold text-xs">✕</button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess("")} className="font-bold text-xs">✕</button>
          </div>
        )}

        {/* CONTROLE DE ABAS: TÍTULOS VS CONTRATOS */}
        <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("titles")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "titles"
                ? "bg-primary text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span>📋</span>
            <span>Títulos & Parcelas do Mês</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeTab === "titles" ? "bg-white/20 text-white" : "bg-white text-slate-700"
              }`}
            >
              {receivables.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("contracts")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "contracts"
                ? "bg-primary text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span>📁</span>
            <span>Gestão de Contratos</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeTab === "contracts" ? "bg-white/20 text-white" : "bg-white text-slate-700"
              }`}
            >
              {contracts.length}
            </span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* CONTEÚDO DA ABA 1: TÍTULOS & PARCELAS                                      */}
        {/* ========================================================================= */}
        {activeTab === "titles" && (
          <div className="space-y-4">
            {/* CARD DE ALERTA DE INADIMPLÊNCIA ACUMULADA (ROLAGEM DE MESES ANTERIORES) */}
            {stats.overduePastItems.length > 0 && (
              <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center text-lg shadow-xs flex-shrink-0">
                    🚨
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-amber-900 flex items-center gap-2">
                      <span>Inadimplência Acumulada de Meses Anteriores</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-extrabold">
                        {stats.overduePastItems.length} título(s) pendente(s)
                      </span>
                    </h3>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Títulos que venceram antes de {selectedMonth} e ainda não foram totalmente liquidados continuam em cobrança ativa.
                    </p>
                  </div>
                </div>

                <div className="text-left md:text-right flex-shrink-0">
                  <span className="text-xs text-amber-800 font-medium block">Total em Atraso Acumulado:</span>
                  <span className="text-base font-extrabold text-amber-900">
                    {formatCurrency(stats.overduePastAmount)}
                  </span>
                </div>
              </div>
            )}

            {/* KPI Cards de Resumo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                  Total Previsto no Período
                </span>
                <span className="text-xl font-extrabold text-gray-900 mt-1 block">
                  {formatCurrency(stats.totalAmount)}
                </span>
                <span className="text-[11px] text-gray-400 mt-0.5 block">
                  {receivables.length} títulos listados
                </span>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block">
                  Total Já Recebido
                </span>
                <span className="text-xl font-extrabold text-emerald-700 mt-1 block">
                  {formatCurrency(stats.totalReceived)}
                </span>
                <span className="text-[11px] text-gray-400 mt-0.5 block">
                  {stats.receivedCount} títulos liquidados
                </span>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider block">
                  Saldo Pendente Restante
                </span>
                <span className="text-xl font-extrabold text-amber-700 mt-1 block">
                  {formatCurrency(stats.totalPending)}
                </span>
                <span className="text-[11px] text-gray-400 mt-0.5 block">
                  {stats.openCount + stats.overdueCount} títulos em aberto
                </span>
              </div>
            </div>

            {/* Filtros Rápidos de Status */}
            <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap shadow-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-2">
                  Filtrar:
                </span>
                {[
                  { id: "all", label: "Todos", count: receivables.length },
                  { id: "pending", label: "⏳ A Vencer", count: stats.openCount },
                  { id: "overdue", label: "🚨 Em Atraso", count: stats.overdueCount },
                  { id: "received", label: "✓ Recebidos", count: stats.receivedCount },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setFilter(st.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      filter === st.id
                        ? "bg-primary text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    <span>{st.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        filter === st.id ? "bg-white/20 text-white" : "bg-white text-slate-700"
                      }`}
                    >
                      {st.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tabela de Recebíveis */}
            {loading ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-400 text-sm">Carregando recebíveis...</p>
              </div>
            ) : filteredReceivables.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-500 font-semibold mb-1">Nenhum recebível encontrado.</p>
                <p className="text-xs text-gray-400">
                  Clique em "+ Título Avulso" ou "Novo Contrato" para adicionar.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-500 text-xs">
                        <th className="py-3 px-3 font-semibold">Cliente</th>
                        <th className="py-3 px-3 font-semibold">Descrição / Contrato</th>
                        <th className="py-3 px-3 font-semibold">NF</th>
                        <th className="py-3 px-3 font-semibold">Vencimento</th>
                        <th className="py-3 px-3 font-semibold text-right">Previsto</th>
                        <th className="py-3 px-3 font-semibold text-right">Recebido</th>
                        <th className="py-3 px-3 font-semibold text-right">Saldo</th>
                        <th className="py-3 px-3 font-semibold text-center">Status</th>
                        <th className="py-3 px-3 font-semibold text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredReceivables.map((r) => {
                        const isOverdue = r.status === "overdue";
                        const isReceived = r.status === "received";
                        const isPartial = r.status === "partial";
                        const amount = Number(r.amount);
                        const received = Number(r.received_amount || 0);
                        const balance = Math.max(0, amount - received);
                        const diff = received - amount;

                        return (
                          <tr
                            key={r.id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              r.isOverdueFromPast ? "bg-amber-50/30" : ""
                            }`}
                          >
                            <td className="py-2.5 px-3 font-bold text-gray-900 whitespace-nowrap">
                              {r.client_name}
                            </td>
                            <td className="py-2.5 px-3 text-gray-700">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium">{r.description}</span>
                                {r.contract_id && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800">
                                    📁 Contrato
                                    {r.installment_number !== null && r.total_installments
                                      ? r.installment_number === 0
                                        ? " (Entrada)"
                                        : ` (${r.installment_number}/${r.total_installments})`
                                      : ""}
                                  </span>
                                )}
                                {r.is_recurring && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800">
                                    🔄 Recorrente (Dia {r.recurring_day || "—"})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-gray-500 text-xs whitespace-nowrap">
                              {r.nf_number ? (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                                  NF {r.nf_number}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                              <div>
                                <span
                                  className={`font-semibold ${
                                    isOverdue ? "text-red-600 font-bold" : "text-gray-700"
                                  }`}
                                >
                                  {formatDate(r.due_date)}
                                </span>
                                {r.isOverdueFromPast && (
                                  <span className="text-[9px] text-amber-700 font-extrabold block">
                                    🚨 Vencido em {r.month_ref}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-gray-900 whitespace-nowrap">
                              {formatCurrency(amount)}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              {received > 0 ? (
                                <div>
                                  <span
                                    className={`font-bold ${
                                      received < amount
                                        ? "text-amber-700"
                                        : received > amount
                                        ? "text-blue-700"
                                        : "text-emerald-700"
                                    }`}
                                  >
                                    {formatCurrency(received)}
                                  </span>
                                  {diff !== 0 && (
                                    <span
                                      className={`text-[9px] font-extrabold block ${
                                        diff < 0 ? "text-amber-600" : "text-blue-600"
                                      }`}
                                    >
                                      {diff < 0
                                        ? `Faltam ${formatCurrency(Math.abs(diff))}`
                                        : `+${formatCurrency(diff)} excedente`}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">
                              <span className={balance > 0 ? "text-amber-700" : "text-emerald-600"}>
                                {formatCurrency(balance)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-block ${
                                  isReceived
                                    ? "bg-emerald-100 text-emerald-800"
                                    : isPartial
                                    ? "bg-orange-100 text-orange-800"
                                    : isOverdue
                                    ? "bg-red-100 text-red-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {isReceived
                                  ? "✓ Recebido"
                                  : isPartial
                                  ? "⚠️ Parcial"
                                  : isOverdue
                                  ? "🚨 Atrasado"
                                  : "⏳ Em Aberto"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Link para Extrato Bancário */}
                                {(isReceived || isPartial || received > 0) && (
                                  <button
                                    type="button"
                                    onClick={() => handleNavigateToTransaction(r)}
                                    className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                                    title="Ver transação bancária correspondente na aba Transações"
                                  >
                                    <span>🔍 Extrato</span>
                                  </button>
                                )}

                                {!isReceived ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReceiveModal(r)}
                                    className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-lg transition-colors"
                                    title="Registrar recebimento (integral ou parcial)"
                                  >
                                    ✓ Receber
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleMarkPending(r)}
                                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded-lg transition-colors"
                                    title="Desfazer recebimento"
                                  >
                                    ↩ Desfazer
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleEditReceivable(r)}
                                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                                  title="Editar"
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteReceivable(r.id)}
                                  className="p-1 text-red-400 hover:text-red-600 rounded"
                                  title="Excluir"
                                >
                                  🗑
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* CONTEÚDO DA ABA 2: GESTÃO DE CONTRATOS                                     */}
        {/* ========================================================================= */}
        {activeTab === "contracts" && (
          <div className="space-y-4">
            {/* KPI Cards de Contratos */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                  Contratos Ativos
                </span>
                <span className="text-2xl font-extrabold text-primary mt-1 block">
                  {contractStats.activeContractsCount}
                </span>
                <span className="text-[11px] text-gray-400 mt-0.5 block">
                  {contracts.length} contratos no total
                </span>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                  Volume Total Contratado
                </span>
                <span className="text-xl font-extrabold text-gray-900 mt-1 block">
                  {formatCurrency(contractStats.totalContracted)}
                </span>
                <span className="text-[11px] text-gray-400 mt-0.5 block">
                  Valor nominal de acordos
                </span>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block">
                  Total Já Liquidado
                </span>
                <span className="text-xl font-extrabold text-emerald-700 mt-1 block">
                  {formatCurrency(contractStats.totalReceived)}
                </span>
                <span className="text-[11px] text-emerald-600 font-semibold mt-0.5 block">
                  {contractStats.totalContracted > 0
                    ? `${Math.round((contractStats.totalReceived / contractStats.totalContracted) * 100)}% concluído`
                    : "0%"}
                </span>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider block">
                  Saldo Restante a Receber
                </span>
                <span className="text-xl font-extrabold text-amber-700 mt-1 block">
                  {formatCurrency(contractStats.totalPending)}
                </span>
                <span className="text-[11px] text-gray-400 mt-0.5 block">
                  Parcelas futuras e em aberto
                </span>
              </div>
            </div>

            {/* Grid de Cards de Contratos */}
            {contracts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary text-2xl flex items-center justify-center mx-auto">
                  📁
                </div>
                <h3 className="text-base font-bold text-gray-900">Nenhum contrato cadastrado ainda</h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  Cadastre contratos com entrada e parcelamento automático para acompanhar a liquidação financeira de cada cliente ao longo do tempo.
                </p>
                <button
                  type="button"
                  onClick={handleOpenNewContract}
                  className="px-4 py-2 bg-primary text-white font-bold rounded-xl text-xs hover:bg-primary-dark transition-all shadow-sm"
                >
                  + Criar Primeiro Contrato
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {contracts.map((contract) => {
                  const installments = contract.installments || [];
                  const paidCount = installments.filter((i) => i.status === "received").length;
                  const totalCount = installments.length;

                  return (
                    <div
                      key={contract.id}
                      className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-primary uppercase tracking-wider block truncate">
                              {contract.client_name}
                            </span>
                            <h3 className="font-extrabold text-gray-900 text-base leading-tight mt-0.5">
                              {contract.title}
                            </h3>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                contract.progress_percent === 100
                                  ? "bg-emerald-100 text-emerald-800"
                                  : contract.has_overdue
                                  ? "bg-red-100 text-red-800"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {contract.progress_percent === 100
                                ? "🏁 Concluído"
                                : contract.has_overdue
                                ? "🚨 Atraso"
                                : "🟢 Em dia"}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenEditContract(contract)}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                              title="Editar contrato"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteContract(contract)}
                              className="p-1 text-red-400 hover:text-red-600 rounded hover:bg-red-50"
                              title="Excluir contrato"
                            >
                              🗑
                            </button>
                          </div>
                        </div>

                        {/* Barra de Progresso Financeiro */}
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500 font-medium">Progresso Financeiro:</span>
                            <span className="font-extrabold text-gray-900">
                              {contract.progress_percent}%
                            </span>
                          </div>
                          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all"
                              style={{ width: `${contract.progress_percent}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-gray-500">
                            <span>Recebido: {formatCurrency(contract.total_received || 0)}</span>
                            <span>Total: {formatCurrency(contract.total_amount)}</span>
                          </div>
                        </div>

                        {/* Detalhes Rápidos */}
                        <div className="bg-slate-50 rounded-xl p-2.5 space-y-1 text-xs text-slate-600">
                          <div className="flex items-center justify-between">
                            <span>Parcelas:</span>
                            <span className="font-bold text-slate-800">
                              {paidCount} de {totalCount} pagas
                            </span>
                          </div>
                          {contract.next_due_date && (
                            <div className="flex items-center justify-between">
                              <span>Próximo Vencimento:</span>
                              <span className="font-bold text-primary">
                                {formatDate(contract.next_due_date)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Botões de Ação */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedContractDetails(contract)}
                          className="flex-1 py-2 px-3 bg-slate-100 hover:bg-primary hover:text-white text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          <span>👁️ Ver Extrato & Compensações</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditContract(contract)}
                          className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-2xs"
                          title="Editar contrato"
                        >
                          ✏️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL / DRAWER DE DETALHES E EXTRATO COM COMPENSAÇÃO EM CASCATA            */}
        {/* ========================================================================= */}
        {selectedContractDetails && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
              {/* Header do Contrato */}
              <div className="p-5 border-b border-gray-100 bg-slate-50 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider block">
                    {selectedContractDetails.client_name}
                  </span>
                  <h3 className="text-lg font-extrabold text-gray-900 mt-0.5">
                    {selectedContractDetails.title}
                  </h3>
                  <div className="flex items-center gap-4 mt-2 text-xs flex-wrap">
                    <span className="font-bold text-gray-800">
                      Total Contratado: {formatCurrency(selectedContractDetails.total_amount)}
                    </span>
                    <span className="text-emerald-700 font-bold">
                      Liquidado: {formatCurrency(selectedContractDetails.total_received || 0)} ({selectedContractDetails.progress_percent}%)
                    </span>
                    <span className="text-amber-700 font-bold">
                      Saldo Restante: {formatCurrency(Math.max(0, selectedContractDetails.total_amount - (selectedContractDetails.total_received || 0)))}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenEditContract(selectedContractDetails);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold rounded-xl text-xs transition-all shadow-xs flex items-center gap-1"
                  >
                    <span>✏️</span> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteContract(selectedContractDetails)}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-xl text-xs transition-all flex items-center gap-1"
                  >
                    <span>🗑</span> Excluir
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedContractDetails(null)}
                    className="p-1 text-gray-400 hover:text-gray-600 text-xl font-bold ml-1"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Lista de Parcelas com Compensação Waterfall */}
              <div className="p-5 overflow-y-auto flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Cronograma de Parcelas, Realizados & Ajustes de Saldo
                  </h4>
                  <span className="text-[11px] text-gray-500 font-medium">
                    ⚡ Diferenças são compensadas automaticamente na próxima fatura
                  </span>
                </div>

                {(() => {
                  const waterfallInstallments = computeContractInstallmentsWithWaterfall(
                    selectedContractDetails.installments || []
                  );

                  return (
                    <div className="space-y-3">
                      {waterfallInstallments.map((inst) => {
                        const isPaid = inst.status === "received";
                        const isPartial = inst.status === "partial";
                        const isOverdue = inst.due_date < todayStr && !isPaid;
                        const diff = inst.currentDifference;
                        const hasAdjustment = inst.previousAdjustment !== 0;

                        return (
                          <div
                            key={inst.id}
                            className={`p-4 rounded-xl border transition-all space-y-2.5 ${
                              isPaid && diff === 0
                                ? "bg-emerald-50/50 border-emerald-200"
                                : isPaid && diff > 0
                                ? "bg-blue-50/50 border-blue-200"
                                : isPartial || (isPaid && diff < 0)
                                ? "bg-amber-50/60 border-amber-300"
                                : isOverdue
                                ? "bg-red-50/50 border-red-200"
                                : "bg-white border-gray-200"
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                                    isPaid
                                      ? "bg-emerald-600 text-white"
                                      : isPartial
                                      ? "bg-amber-600 text-white"
                                      : isOverdue
                                      ? "bg-red-600 text-white"
                                      : "bg-slate-200 text-slate-700"
                                  }`}
                                >
                                  {inst.installment_number === 0 ? "E" : inst.installment_number}
                                </div>

                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-gray-900">
                                      {inst.installment_number === 0
                                        ? "Entrada"
                                        : `Parcela ${inst.installment_number}/${inst.total_installments}`}
                                    </span>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        isPaid
                                          ? "bg-emerald-100 text-emerald-800"
                                          : isPartial
                                          ? "bg-amber-100 text-amber-800"
                                          : isOverdue
                                          ? "bg-red-100 text-red-800"
                                          : "bg-slate-100 text-slate-700"
                                      }`}
                                    >
                                      {isPaid
                                        ? "✓ Liquidada"
                                        : isPartial
                                        ? "⚠️ Pagamento Parcial"
                                        : isOverdue
                                        ? "🚨 Vencida em Atraso"
                                        : "⏳ Em Aberto"}
                                    </span>
                                  </div>
                                  <span className="text-xs text-gray-500 block mt-0.5">
                                    Vencimento: {formatDate(inst.due_date)}{" "}
                                    {inst.received_at ? `• Pago em ${formatDate(inst.received_at)}` : ""}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 justify-end">
                                {inst.hasPayment && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedContractDetails(null);
                                      handleNavigateToTransaction(inst);
                                    }}
                                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                                    title="Ver transação bancária vinculada no extrato"
                                  >
                                    <span>🔍 Ver no Extrato</span>
                                  </button>
                                )}

                                {!isPaid && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleOpenReceiveModal(inst);
                                    }}
                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
                                  >
                                    ✓ Receber
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Detalhes Financeiros: Comparação Previsto, Recebido, Saldo e Ajuste de Saldo */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-100 text-xs">
                              <div className="bg-white/80 rounded-lg p-2 border border-gray-100">
                                <span className="text-[10px] text-gray-500 font-medium block">
                                  Valor Base Contrato:
                                </span>
                                <span className="font-bold text-gray-800">
                                  {formatCurrency(inst.baseAmount)}
                                </span>
                              </div>

                              <div className="bg-white/80 rounded-lg p-2 border border-gray-100">
                                <span className="text-[10px] text-gray-500 font-medium block">
                                  Previsto Ajustado:
                                </span>
                                <span className="font-extrabold text-gray-900">
                                  {formatCurrency(inst.effectiveExpectedAmount)}
                                </span>
                                {hasAdjustment && (
                                  <span
                                    className={`text-[9px] font-extrabold block ${
                                      inst.previousAdjustment < 0 ? "text-amber-600" : "text-blue-600"
                                    }`}
                                  >
                                    {inst.previousAdjustment < 0
                                      ? `+${formatCurrency(Math.abs(inst.previousAdjustment))} pendência anterior`
                                      : `-${formatCurrency(inst.previousAdjustment)} crédito anterior`}
                                  </span>
                                )}
                              </div>

                              <div className="bg-white/80 rounded-lg p-2 border border-gray-100">
                                <span className="text-[10px] text-gray-500 font-medium block">
                                  Efetivamente Recebido:
                                </span>
                                <span
                                  className={`font-extrabold ${
                                    inst.receivedAmount > 0 ? "text-emerald-700" : "text-gray-400"
                                  }`}
                                >
                                  {inst.receivedAmount > 0
                                    ? formatCurrency(inst.receivedAmount)
                                    : "R$ 0,00"}
                                </span>
                                {inst.hasPayment && diff !== 0 && (
                                  <span
                                    className={`text-[9px] font-extrabold block ${
                                      diff < 0 ? "text-amber-700" : "text-blue-700"
                                    }`}
                                  >
                                    {diff < 0
                                      ? `Diferença: -${formatCurrency(Math.abs(diff))}`
                                      : `Excedente: +${formatCurrency(diff)}`}
                                  </span>
                                )}
                              </div>

                              <div className="bg-white/80 rounded-lg p-2 border border-gray-100">
                                <span className="text-[10px] text-gray-500 font-medium block">
                                  Saldo a Liquidar:
                                </span>
                                <span
                                  className={`font-extrabold ${
                                    inst.balanceRemaining > 0 ? "text-amber-700" : "text-emerald-700"
                                  }`}
                                >
                                  {formatCurrency(inst.balanceRemaining)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Rodapé */}
              <div className="p-4 bg-slate-50 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedContractDetails(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL DE CONFIRMAÇÃO DE RECEBIMENTO COM VALOR CUSTOMIZÁVEL                */}
        {/* ========================================================================= */}
        {receiveModalItem && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Registrar Recebimento</h3>
                  <p className="text-xs text-gray-500">
                    {receiveModalItem.client_name} — {receiveModalItem.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReceiveModalItem(null)}
                  className="text-gray-400 hover:text-gray-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleConfirmReceive} className="space-y-4">
                <div className="bg-slate-50 rounded-xl p-3 space-y-1 text-xs border border-slate-200">
                  <div className="flex justify-between text-slate-600">
                    <span>Valor Nominal Previsto:</span>
                    <span className="font-bold text-slate-900">{formatCurrency(receiveModalItem.amount)}</span>
                  </div>
                  {receiveModalItem.received_amount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Já Recebido Anteriormente:</span>
                      <span className="font-bold">{formatCurrency(receiveModalItem.received_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-amber-700 font-bold border-t border-slate-200 pt-1">
                    <span>Saldo em Aberto:</span>
                    <span>
                      {formatCurrency(Math.max(0, receiveModalItem.amount - (receiveModalItem.received_amount || 0)))}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Valor Efetivamente Recebido (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={receiveAmountInput}
                    onChange={(e) => setReceiveAmountInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm font-extrabold text-gray-900 focus:ring-2 focus:ring-primary focus:outline-none"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Data do Recebimento *
                  </label>
                  <input
                    type="date"
                    required
                    value={receiveDateInput}
                    onChange={(e) => setReceiveDateInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                {/* Feedback em tempo real sobre a diferença */}
                {(() => {
                  const val = parseFloat(receiveAmountInput) || 0;
                  const currentRec = Number(receiveModalItem.received_amount || 0);
                  const totalAfter = currentRec + val;
                  const remaining = Number(receiveModalItem.amount) - totalAfter;

                  if (val <= 0) return null;

                  if (remaining > 0) {
                    return (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                        ⚠️ <strong>Pagamento Parcial</strong>: Faltarão{" "}
                        <strong>{formatCurrency(remaining)}</strong>. O saldo continuará em aberto e será compensado na próxima parcela se fizer parte de um contrato.
                      </div>
                    );
                  } else if (remaining < 0) {
                    return (
                      <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
                        ✨ <strong>Pagamento Excedente</strong>: Crédito de{" "}
                        <strong>{formatCurrency(Math.abs(remaining))}</strong> será abatido na próxima parcela do contrato.
                      </div>
                    );
                  } else {
                    return (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                        ✓ <strong>Liquidação Integral</strong>: O título será marcado como totalmente quitado.
                      </div>
                    );
                  }
                })()}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setReceiveModalItem(null)}
                    className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                  >
                    Confirmar Recebimento
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL DE CADASTRO / EDIÇÃO DE CONTRATO (ENTRADA + PARCELAMENTO)            */}
        {/* ========================================================================= */}
        {showContractModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <span>📁 {editingContractId ? "Editar Contrato" : "Novo Contrato"}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                      {editingContractId ? "Edição de Dados" : "Entrada + Parcelas"}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {editingContractId
                      ? "Atualize os dados do contrato e o cronograma de faturamento."
                      : "Gera automaticamente todas as parcelas e agenda no contas a receber."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowContractModal(false);
                    setEditingContractId(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveContract} className="overflow-y-auto flex-1 p-5 space-y-4">
                {editingContractId && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                    💡 <strong>Dica de Edição</strong>: Caso o contrato já possua parcelas com pagamentos efetuados, os dados cadastrais serão atualizados mantendo o histórico de recebimentos preservado.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Cliente *
                    </label>
                    <input
                      type="text"
                      required
                      value={contractForm.client_name}
                      onChange={(e) => setContractForm({ ...contractForm, client_name: e.target.value })}
                      placeholder="Ex: Nissi Engenharia"
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Título do Contrato *
                    </label>
                    <input
                      type="text"
                      required
                      value={contractForm.title}
                      onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })}
                      placeholder="Ex: Reforma Galpão 03"
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Valor Total do Contrato (R$) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={contractForm.total_amount}
                      onChange={(e) => setContractForm({ ...contractForm, total_amount: e.target.value })}
                      placeholder="50000.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Data de Início do Contrato *
                    </label>
                    <input
                      type="date"
                      required
                      value={contractForm.start_date}
                      onChange={(e) => setContractForm({ ...contractForm, start_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                </div>

                {/* Bloco de Entrada */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={contractForm.has_down_payment}
                      onChange={(e) => setContractForm({ ...contractForm, has_down_payment: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span>Possui Pagamento de Entrada?</span>
                  </label>

                  {contractForm.has_down_payment && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Valor da Entrada (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={contractForm.down_payment_amount}
                          onChange={(e) => setContractForm({ ...contractForm, down_payment_amount: e.target.value })}
                          placeholder="Ex: 10000.00"
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-primary focus:outline-none bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Vencimento da Entrada
                        </label>
                        <input
                          type="date"
                          value={contractForm.down_payment_due_date}
                          onChange={(e) => setContractForm({ ...contractForm, down_payment_due_date: e.target.value })}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-primary focus:outline-none bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Bloco de Parcelamento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Número de Parcelas Restantes
                    </label>
                    <select
                      value={contractForm.installments_count}
                      onChange={(e) => setContractForm({ ...contractForm, installments_count: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-primary focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24, 36].map((num) => (
                        <option key={num} value={num}>
                          {num}x parcela(s) mensais
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Data da 1ª Parcela (Opcional)
                    </label>
                    <input
                      type="date"
                      value={contractForm.installments_first_due_date}
                      onChange={(e) => setContractForm({ ...contractForm, installments_first_due_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                </div>

                {/* Notas / Observações */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Observações / Termos Adicionais (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={contractForm.notes}
                    onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })}
                    placeholder="Ex: Contrato assinado em 3 vias, garantia de 12 meses..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                {/* Prévia das Parcelas Geradas */}
                {previewInstallments.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-gray-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500 block">
                      ⚡ Prévia do Cronograma ({previewInstallments.length} lançamentos):
                    </span>
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                      {previewInstallments.map((item, idx) => (
                        <div key={idx} className="p-2.5 px-3 flex items-center justify-between text-xs bg-slate-50/50">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{item.label}</span>
                            <span className="text-slate-400">• Venc: {formatDate(item.dueDate)}</span>
                            <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-semibold">
                              Mês {item.monthRef}
                            </span>
                          </div>
                          <span className="font-extrabold text-primary">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-gray-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowContractModal(false);
                      setEditingContractId(null);
                    }}
                    className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                  >
                    {editingContractId ? "Salvar Alterações" : "Salvar e Gerar Contrato"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Formulário Título Avulso */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900">
                  {editingId ? "Editar Recebível" : "Novo Recebível Avulso"}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-gray-400 hover:text-gray-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveReceivable} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Cliente *</label>
                  <input
                    type="text"
                    required
                    value={formData.client_name}
                    onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                    placeholder="Nome do cliente"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Descrição *</label>
                  <input
                    type="text"
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Ex: Mensalidade de consultoria"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Valor (R$) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Número da NF</label>
                    <input
                      type="text"
                      value={formData.nf_number}
                      onChange={(e) => setFormData({ ...formData, nf_number: e.target.value })}
                      placeholder="Ex: 1042"
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Data de Vencimento *</label>
                  <input
                    type="date"
                    required={!formData.is_recurring}
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                  >
                    Salvar
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
