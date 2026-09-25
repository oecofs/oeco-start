"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import Navigation from "@/components/Navigation";
import MonthSelector from "@/components/MonthSelector";
import SuppliersManager from "@/components/SuppliersManager";
import SupplierFinancialProfileDrawer from "@/components/SupplierFinancialProfileDrawer";
import { uploadFinancialDocument } from "@/lib/storage/attachments";

export type Supplier = {
  id: string;
  name: string;
  cnpj?: string | null;
  default_category_id?: string | null;
  default_cost_center?: string | null;
  default_pix_or_barcode?: string | null;
};

export type Payable = {
  id: string;
  company_id: string;
  supplier_name: string;
  supplier_id?: string | null;
  description: string;
  amount: number;
  due_date: string;
  month_ref: string;
  status: "open" | "paid" | "partial" | "overdue" | "cancelled";
  category_id: string | null;
  cost_center: string | null;
  barcode_or_pix: string | null;
  attachment_url: string | null;
  attachment_type: "file" | "external_link";
  paid_amount: number;
  paid_at: string | null;
  is_manual_paid: boolean;
  notes: string | null;
  installment_number: number | null;
  total_installments: number | null;
  parent_payable_id: string | null;
  is_active: boolean;
  created_at: string;
  isOverdueFromPast?: boolean;
  is_refundable_cost?: boolean;
  legal_case_id?: string | null;
  refund_status?: "pending" | "invoiced" | "refunded" | "non_refundable" | null;
  refunded_at?: string | null;
  refund_notes?: string | null;
};

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
};

type CostCenter = {
  id: string;
  name: string;
};

export default function PayablesPage() {
  const supabase = createClient();
  const router = useRouter();
  const { selectedCompany } = useCompany();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [payables, setPayables] = useState<Payable[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Mapeamento de transações bancárias vinculadas às contas a pagar
  const [linkedTransactionsMap, setLinkedTransactionsMap] = useState<
    Map<string, { id: string; amount: number; date: string; description: string; month_ref: string }>
  >(new Map());

  // Estado do Modal de Cadastro
  const [showModal, setShowModal] = useState(false);
  const [showSuppliersModal, setShowSuppliersModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingPayable, setEditingPayable] = useState<Payable | null>(null);

  // Formulário
  const [supplierName, setSupplierName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [costCenter, setCostCenter] = useState("");
  
  // Forma de Cobrança / Pagamento (Pix vs Boleto vs Outro)
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "boleto" | "other">("pix");
  const [pixKey, setPixKey] = useState("");
  const [barcode, setBarcode] = useState("");
  const [notes, setNotes] = useState("");

  // Módulo Jurídico: Custas Reembolsáveis
  const [legalCases, setLegalCases] = useState<{ id: string; case_number: string; client_name: string }[]>([]);
  const [isRefundableCost, setIsRefundableCost] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  
  // Parcelamento
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentsCount, setInstallmentsCount] = useState("2");

  // Anexo
  const [attachmentMode, setAttachmentMode] = useState<"file" | "link">("file");
  const [externalLink, setExternalLink] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Modal de Quitação Manual
  const [manualPayPayable, setManualPayPayable] = useState<Payable | null>(null);
  const [manualPayDate, setManualPayDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [manualPayAmount, setManualPayAmount] = useState("");

  // Modal de Visualização de Anexo
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Perfil 360° do Fornecedor
  const [profileDrawerSupplier, setProfileDrawerSupplier] = useState<Supplier | null>(null);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);

  const handleOpenSupplierProfile = (name: string) => {
    const existing = suppliers.find(
      (s) => s.name.trim().toLowerCase() === name.trim().toLowerCase()
    ) || {
      id: "",
      name: name,
    };
    setProfileDrawerSupplier(existing);
    setShowProfileDrawer(true);
  };

  // Helper para identificar boleto bancário por quantidade de dígitos
  const isLikelyBoleto = (val: string | null | undefined): boolean => {
    if (!val) return false;
    const digitsOnly = val.replace(/\D/g, "");
    return digitsOnly.length >= 40;
  };

  // Busca Categorias, Centros de Custo, Fornecedores e Processos (se jurídico)
  const loadAuxData = useCallback(async () => {
    if (!selectedCompany) return;
    const currentCompId = selectedCompany.id;
    const isLegal = selectedCompany.segment === "legal";

    const [catsRes, ccRes, supRes] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, parent_id")
        .eq("type", "expense")
        .order("sort_order", { ascending: true }),
      supabase
        .from("cost_centers")
        .select("id, name")
        .eq("company_id", currentCompId)
        .order("name", { ascending: true }),
      supabase
        .from("suppliers")
        .select("*")
        .eq("company_id", currentCompId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    if (catsRes.data) setCategories(catsRes.data);
    if (ccRes.data) setCostCenters(ccRes.data);
    if (supRes.data) setSuppliers(supRes.data);

    if (isLegal) {
      const { data: legalData } = await supabase
        .from("legal_cases")
        .select("id, case_number, client_name")
        .eq("company_id", currentCompId)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      setLegalCases(legalData || []);
    } else {
      setLegalCases([]);
    }
  }, [selectedCompany, supabase]);

  useEffect(() => {
    loadAuxData();
  }, [loadAuxData]);

  // Separação de Categorias Principais (Pai) e Subcategorias
  const parentCategories = useMemo(() => {
    return categories.filter((c) => !c.parent_id);
  }, [categories]);

  const availableSubcategories = useMemo(() => {
    if (!parentCategoryId) return [];
    return categories.filter((c) => c.parent_id === parentCategoryId);
  }, [categories, parentCategoryId]);

  // Ao alterar o fornecedor digitado ou selecionado no datalist
  const handleSupplierChange = (name: string) => {
    setSupplierName(name);

    // Tenta encontrar um fornecedor já cadastrado
    const matched = suppliers.find(
      (s) => s.name.trim().toLowerCase() === name.trim().toLowerCase()
    );

    if (matched) {
      if (matched.default_category_id) {
        const cat = categories.find((c) => c.id === matched.default_category_id);
        if (cat) {
          if (cat.parent_id) {
            setParentCategoryId(cat.parent_id);
            setSubCategoryId(cat.id);
          } else {
            setParentCategoryId(cat.id);
            setSubCategoryId("");
          }
        }
      }

      if (matched.default_cost_center) {
        setCostCenter(matched.default_cost_center);
      }

      // Se o fornecedor tem chave Pix fixa cadastrada, carrega automaticamente!
      if (matched.default_pix_or_barcode) {
        setPixKey(matched.default_pix_or_barcode);
        if (paymentMethod !== "boleto") {
          setPaymentMethod("pix");
        }
      }
    }
  };

  // Carrega Contas a Pagar do Mês + Pendências Passadas
  const loadPayables = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);

    try {
      // 1. Contas a pagar do mês selecionado
      const { data: monthData, error: mErr } = await supabase
        .from("payables")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .eq("month_ref", selectedMonth)
        .eq("is_active", true)
        .order("due_date", { ascending: true });

      if (mErr) console.error("Erro ao buscar contas do mês:", mErr);

      // 2. Contas de meses anteriores não pagas (Rolagem de atrasados)
      const { data: pastOverdueData, error: pErr } = await supabase
        .from("payables")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .lt("month_ref", selectedMonth)
        .eq("is_active", true)
        .neq("status", "paid")
        .order("due_date", { ascending: true });

      if (pErr) console.error("Erro ao buscar contas anteriores:", pErr);

      // 3. Transações bancárias vinculadas a contas a pagar
      const { data: linkedTrxs, error: tErr } = await supabase
        .from("transactions")
        .select("id, payable_id, amount, date, description, month_ref")
        .eq("company_id", selectedCompany.id)
        .not("payable_id", "is", null);

      if (tErr) console.error("Erro ao buscar transações vinculadas:", tErr);

      const trxMap = new Map<string, { id: string; amount: number; date: string; description: string; month_ref: string }>();
      (linkedTrxs || []).forEach((t) => {
        if (t.payable_id) {
          trxMap.set(t.payable_id, {
            id: t.id,
            amount: Math.abs(Number(t.amount)),
            date: t.date,
            description: t.description,
            month_ref: t.month_ref,
          });
        }
      });
      setLinkedTransactionsMap(trxMap);

      const today = new Date().toISOString().split("T")[0];

      function enrichPayable(p: any, isPastOverdue: boolean): Payable {
        const linked = trxMap.get(p.id);
        const actualPaid = linked ? linked.amount : Number(p.paid_amount || 0);
        const isPaid = (actualPaid >= Number(p.amount) && Number(p.amount) > 0) || p.status === "paid";
        const isPartial = actualPaid > 0 && actualPaid < Number(p.amount);

        let finalStatus: Payable["status"] = isPaid
          ? "paid"
          : isPartial
          ? "partial"
          : p.due_date < today
          ? "overdue"
          : p.status === "open"
          ? "open"
          : p.status;

        return {
          ...p,
          amount: Number(p.amount),
          paid_amount: actualPaid,
          paid_at: linked ? linked.date : p.paid_at,
          status: finalStatus,
          isOverdueFromPast: isPastOverdue,
        };
      }

      const listMonth = (monthData || []).map((p) => enrichPayable(p, false));
      const listPast = (pastOverdueData || []).map((p) => enrichPayable(p, true));

      setPayables([...listPast, ...listMonth]);
    } catch (err) {
      console.error("Erro geral ao carregar payables:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, selectedMonth, supabase]);

  useEffect(() => {
    loadPayables();
  }, [loadPayables]);

  // Cálculos dos KPIs
  const kpis = useMemo(() => {
    let totalScheduled = 0;
    let totalPaid = 0;
    let totalOpen = 0;
    let totalOverdue = 0;

    payables.forEach((p) => {
      const amt = p.amount;
      const pd = p.paid_amount;

      if (p.status === "paid") {
        totalPaid += pd || amt;
      } else if (p.status === "partial") {
        totalPaid += pd;
        totalOpen += amt - pd;
      } else if (p.status === "overdue") {
        totalOverdue += amt;
      } else {
        totalOpen += amt;
      }

      totalScheduled += amt;
    });

    return { totalScheduled, totalPaid, totalOpen, totalOverdue };
  }, [payables]);

  // Abre Modal de Novo/Editar
  const handleOpenModal = (payable?: Payable) => {
    if (payable) {
      setEditingPayable(payable);
      setSupplierName(payable.supplier_name);
      setDescription(payable.description);
      setAmount(String(payable.amount));
      setDueDate(payable.due_date);

      // Reconhece se a categoria salva é categoria pai ou subcategoria
      if (payable.category_id) {
        const cat = categories.find((c) => c.id === payable.category_id);
        if (cat) {
          if (cat.parent_id) {
            setParentCategoryId(cat.parent_id);
            setSubCategoryId(cat.id);
          } else {
            setParentCategoryId(cat.id);
            setSubCategoryId("");
          }
        } else {
          setParentCategoryId(payable.category_id);
          setSubCategoryId("");
        }
      } else {
        setParentCategoryId("");
        setSubCategoryId("");
      }

      setCostCenter(payable.cost_center || "");

      // Identifica se o código salvo é Boleto ou Pix
      const rawCode = payable.barcode_or_pix || "";
      const matchedSup = suppliers.find(
        (s) => s.name.trim().toLowerCase() === payable.supplier_name.trim().toLowerCase()
      );

      if (isLikelyBoleto(rawCode)) {
        setPaymentMethod("boleto");
        setBarcode(rawCode);
        setPixKey(matchedSup?.default_pix_or_barcode || "");
      } else if (rawCode) {
        setPaymentMethod("pix");
        setPixKey(rawCode);
        setBarcode("");
      } else {
        setPaymentMethod("pix");
        setPixKey(matchedSup?.default_pix_or_barcode || "");
        setBarcode("");
      }

      // Módulo Jurídico: Custas Reembolsáveis
      setIsRefundableCost(payable.is_refundable_cost || false);
      setSelectedCaseId(payable.legal_case_id || "");

      setNotes(payable.notes || "");
      setIsInstallment(false);
      setAttachmentMode(payable.attachment_type === "external_link" ? "link" : "file");
      setExternalLink(payable.attachment_type === "external_link" ? payable.attachment_url || "" : "");
      setSelectedFile(null);
    } else {
      setEditingPayable(null);
      setSupplierName("");
      setDescription("");
      setAmount("");
      setDueDate(`${selectedMonth}-10`);
      setParentCategoryId("");
      setSubCategoryId("");
      setCostCenter("");
      setPaymentMethod("pix");
      setPixKey("");
      setBarcode("");
      setIsRefundableCost(false);
      setSelectedCaseId("");
      setNotes("");
      setIsInstallment(false);
      setInstallmentsCount("2");
      setAttachmentMode("file");
      setExternalLink("");
      setSelectedFile(null);
    }
    setShowModal(true);
  };

  // Salvar Conta a Pagar
  const handleSavePayable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    const numAmount = parseFloat(amount.replace(",", "."));
    if (!supplierName.trim() || isNaN(numAmount) || numAmount <= 0 || !dueDate) {
      alert("Preencha o fornecedor, valor válido e a data de vencimento.");
      return;
    }

    setSaving(true);
    setUploadingAttachment(true);

    try {
      let attachmentUrl = editingPayable?.attachment_url || null;
      let finalAttachmentType: "file" | "external_link" = attachmentMode === "link" ? "external_link" : "file";

      if (attachmentMode === "link" && externalLink.trim()) {
        attachmentUrl = externalLink.trim();
      } else if (attachmentMode === "file" && selectedFile) {
        const uploadRes = await uploadFinancialDocument(supabase, selectedFile, selectedCompany.id, "payables");
        attachmentUrl = uploadRes.url;
        finalAttachmentType = "file";
      }

      const baseMonth = dueDate.slice(0, 7);
      const effectiveCategoryId = subCategoryId || parentCategoryId || null;

      // Código efetivo a ser gravado nesta conta a pagar específica
      const effectiveBarcodeOrPix =
        paymentMethod === "pix"
          ? pixKey.trim() || null
          : paymentMethod === "boleto"
          ? barcode.trim() || null
          : null;

      // Cadastra ou atualiza o fornecedor de forma transparente na tabela suppliers
      let targetSupplierId: string | null = null;
      try {
        const cleanSupplierName = supplierName.trim();
        const existing = suppliers.find(
          (s) => s.name.trim().toLowerCase() === cleanSupplierName.toLowerCase()
        );

        if (existing) {
          targetSupplierId = existing.id;

          // Se a forma for PIX e foi preenchido, ou se faltava categoria/centro de custo, atualiza o fornecedor no banco!
          const shouldUpdatePix =
            paymentMethod === "pix" &&
            pixKey.trim().length > 0 &&
            pixKey.trim() !== (existing.default_pix_or_barcode || "");
          const shouldUpdateCategory = !existing.default_category_id && effectiveCategoryId;
          const shouldUpdateCostCenter = !existing.default_cost_center && costCenter;

          if (shouldUpdatePix || shouldUpdateCategory || shouldUpdateCostCenter) {
            const updates: any = {};
            if (shouldUpdatePix) updates.default_pix_or_barcode = pixKey.trim();
            if (shouldUpdateCategory) updates.default_category_id = effectiveCategoryId;
            if (shouldUpdateCostCenter) updates.default_cost_center = costCenter;

            await supabase.from("suppliers").update(updates).eq("id", existing.id);

            // Atualiza estado local de fornecedores para refletir imediatamente
            setSuppliers((prev) =>
              prev.map((s) =>
                s.id === existing.id
                  ? {
                      ...s,
                      default_pix_or_barcode: updates.default_pix_or_barcode ?? s.default_pix_or_barcode,
                      default_category_id: updates.default_category_id ?? s.default_category_id,
                      default_cost_center: updates.default_cost_center ?? s.default_cost_center,
                    }
                  : s
              )
            );
          }
        } else {
          // Cria novo registro de fornecedor
          // NOTA: Se o pagamento for Pix, salva o Pix como fixo no fornecedor.
          // Se for Boleto, NÃO salva o código de barras no fornecedor (pois boletos são variáveis de cada mês).
          const supplierPix = paymentMethod === "pix" ? pixKey.trim() || null : null;

          const { data: newSup } = await supabase
            .from("suppliers")
            .insert({
              company_id: selectedCompany.id,
              name: cleanSupplierName,
              default_category_id: effectiveCategoryId,
              default_cost_center: costCenter || null,
              default_pix_or_barcode: supplierPix,
            })
            .select("id")
            .maybeSingle();

          if (newSup) {
            targetSupplierId = newSup.id;
            setSuppliers((prev) => [
              ...prev,
              {
                id: newSup.id,
                name: cleanSupplierName,
                default_category_id: effectiveCategoryId,
                default_cost_center: costCenter || null,
                default_pix_or_barcode: supplierPix,
              },
            ]);
          }
        }
      } catch (sErr) {
        console.warn("Nota: Registro de supplier transparente ignorado:", sErr);
      }

      const isLegal = selectedCompany.segment === "legal";
      const refundable = isLegal && isRefundableCost;
      const targetCaseId = refundable && selectedCaseId ? selectedCaseId : null;
      const targetRefundStatus = refundable ? (editingPayable?.refund_status || "pending") : null;

      if (editingPayable) {
        // Atualização de registro existente
        const { error } = await supabase
          .from("payables")
          .update({
            supplier_name: supplierName.trim(),
            supplier_id: targetSupplierId,
            description: description.trim() || supplierName.trim(),
            amount: numAmount,
            due_date: dueDate,
            month_ref: baseMonth,
            category_id: effectiveCategoryId,
            cost_center: costCenter || null,
            barcode_or_pix: effectiveBarcodeOrPix,
            notes: notes.trim() || null,
            attachment_url: attachmentUrl,
            attachment_type: finalAttachmentType,
            is_refundable_cost: refundable,
            legal_case_id: targetCaseId,
            refund_status: targetRefundStatus,
          })
          .eq("id", editingPayable.id);

        if (error) throw error;
      } else if (isInstallment && parseInt(installmentsCount) > 1) {
        // Lançamento Parcelado
        const count = parseInt(installmentsCount);
        const installmentAmount = Math.round((numAmount / count) * 100) / 100;
        const firstDue = new Date(`${dueDate}T12:00:00`);
        const rowsToInsert = [];

        for (let i = 1; i <= count; i++) {
          const currentDue = new Date(firstDue);
          currentDue.setMonth(currentDue.getMonth() + (i - 1));
          const dueStr = currentDue.toISOString().split("T")[0];
          const mRef = dueStr.slice(0, 7);

          rowsToInsert.push({
            company_id: selectedCompany.id,
            supplier_name: supplierName.trim(),
            supplier_id: targetSupplierId,
            description: `${description.trim() || supplierName.trim()} (${i}/${count})`,
            amount: installmentAmount,
            due_date: dueStr,
            month_ref: mRef,
            status: "open",
            category_id: effectiveCategoryId,
            cost_center: costCenter || null,
            barcode_or_pix: effectiveBarcodeOrPix,
            notes: notes.trim() || null,
            attachment_url: attachmentUrl,
            attachment_type: finalAttachmentType,
            installment_number: i,
            total_installments: count,
            is_refundable_cost: refundable,
            legal_case_id: targetCaseId,
            refund_status: targetRefundStatus,
          });
        }

        const { error } = await supabase.from("payables").insert(rowsToInsert);
        if (error) throw error;
      } else {
        // Lançamento Único
        const { error } = await supabase.from("payables").insert({
          company_id: selectedCompany.id,
          supplier_name: supplierName.trim(),
          supplier_id: targetSupplierId,
          description: description.trim() || supplierName.trim(),
          amount: numAmount,
          due_date: dueDate,
          month_ref: baseMonth,
          status: "open",
          category_id: effectiveCategoryId,
          cost_center: costCenter || null,
          barcode_or_pix: effectiveBarcodeOrPix,
          notes: notes.trim() || null,
          attachment_url: attachmentUrl,
          attachment_type: finalAttachmentType,
          is_refundable_cost: refundable,
          legal_case_id: targetCaseId,
          refund_status: targetRefundStatus,
        });

        if (error) throw error;
      }

      setShowModal(false);
      await loadPayables();
    } catch (err: any) {
      console.error("Erro ao salvar conta a pagar:", err);
      alert(`Erro ao salvar: ${err.message || "Tente novamente."}`);
    } finally {
      setSaving(false);
      setUploadingAttachment(false);
    }
  };

  // Quitação Manual (Espécie / Fora do Extrato)
  const handleSaveManualPayment = async () => {
    if (!manualPayPayable) return;
    const pdAmount = parseFloat(manualPayAmount.replace(",", "."));
    if (isNaN(pdAmount) || pdAmount <= 0) {
      alert("Informe um valor pago válido.");
      return;
    }

    try {
      const isFull = pdAmount >= manualPayPayable.amount;
      const { error } = await supabase
        .from("payables")
        .update({
          status: isFull ? "paid" : "partial",
          paid_amount: pdAmount,
          paid_at: manualPayDate,
          is_manual_paid: true,
        })
        .eq("id", manualPayPayable.id);

      if (error) throw error;

      setManualPayPayable(null);
      await loadPayables();
    } catch (err: any) {
      alert(`Erro na quitação manual: ${err.message}`);
    }
  };

  // Excluir Conta a Pagar
  const handleDeletePayable = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta conta a pagar?")) return;

    try {
      // 1. Desvincula qualquer transação bancária vinculada
      await supabase
        .from("transactions")
        .update({ payable_id: null })
        .eq("payable_id", id);

      // 2. Remove o registro
      const { error } = await supabase.from("payables").delete().eq("id", id);
      if (error) throw error;

      await loadPayables();
    } catch (err: any) {
      alert(`Erro ao excluir: ${err.message}`);
    }
  };

  // Copiar Chave Pix / Código de Barras
  const handleCopyBarcode = (code: string, isBoleto?: boolean) => {
    navigator.clipboard.writeText(code);
    alert(isBoleto ? "📄 Código de barras copiado!" : "⚡ Chave Pix copiada!");
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  };

  return (
    <Navigation>
      <div className="p-4 md:p-8 space-y-6">
        {/* Cabeçalho e Controles */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span>💳 Contas a Pagar</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Controle seus compromissos, anexe boletos e concilie automaticamente com o extrato bancário.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
            <button
              onClick={() => setShowSuppliersModal(true)}
              className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-semibold px-3.5 py-2.5 rounded-xl shadow-2xs transition-colors flex items-center gap-1.5"
              title="Gerenciar cadastro de fornecedores"
            >
              <span>👥</span>
              <span className="hidden sm:inline">Fornecedores</span>
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Nova Conta a Pagar</span>
            </button>
          </div>
        </div>

        {/* 4 Cards de Resumo Executivo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-2xs">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Previsto no Mês</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(kpis.totalScheduled)}</p>
            <p className="text-xs text-gray-400 mt-1">Total de contas com vencimento no mês</p>
          </div>

          <div className="bg-white rounded-xl border border-emerald-100 bg-emerald-50/20 p-5 shadow-2xs">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Pago / Liquidado</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(kpis.totalPaid)}</p>
            <p className="text-xs text-emerald-600/80 mt-1">Confirmado via extrato bancário</p>
          </div>

          <div className="bg-white rounded-xl border border-blue-100 bg-blue-50/20 p-5 shadow-2xs">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">A Pagar (Em Aberto)</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(kpis.totalOpen)}</p>
            <p className="text-xs text-blue-600/80 mt-1">Aguardando vencimento ou quitação</p>
          </div>

          <div className="bg-white rounded-xl border border-rose-100 bg-rose-50/20 p-5 shadow-2xs">
            <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Atrasado / Vencido</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{formatCurrency(kpis.totalOverdue)}</p>
            <p className="text-xs text-rose-600/80 mt-1">Vencimento anterior sem confirmação</p>
          </div>
        </div>

        {/* Tabela de Contas a Pagar */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">Compromissos Financeiros</h2>
            <span className="text-xs text-gray-500 font-medium">{payables.length} registros</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-400">Carregando contas a pagar...</div>
          ) : payables.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <p className="mb-2 text-3xl">📭</p>
              <p className="font-medium text-gray-600">Nenhuma conta a pagar encontrada neste mês.</p>
              <p className="text-xs mt-1">Clique em "+ Nova Conta a Pagar" para lançar seu primeiro compromisso.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50/80 text-gray-500 text-xs font-semibold uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3.5 px-4">Vencimento</th>
                    <th className="py-3.5 px-4">Favorecido / Descrição</th>
                    <th className="py-3.5 px-4">Categoria / C. Custo</th>
                    <th className="py-3.5 px-4 text-right">Valor Previsto</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4">Vínculo Bancário</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {payables.map((item) => {
                    const linked = linkedTransactionsMap.get(item.id);
                    const categoryObj = categories.find((c) => c.id === item.category_id);

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-gray-50/70 transition-colors ${
                          item.isOverdueFromPast ? "bg-amber-50/30" : ""
                        }`}
                      >
                        {/* Vencimento */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{formatDate(item.due_date)}</div>
                          {item.isOverdueFromPast && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                              Mês Anterior
                            </span>
                          )}
                        </td>

                        {/* Fornecedor / Descrição */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenSupplierProfile(item.supplier_name)}
                              className="text-left font-semibold text-gray-900 hover:text-primary hover:underline transition-colors cursor-pointer flex items-center gap-1 group"
                              title="Ver Perfil Financeiro 360° do Fornecedor"
                            >
                              <span>{item.supplier_name}</span>
                              <span className="text-[10px] text-gray-400 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all">
                                📊
                              </span>
                            </button>
                            {item.installment_number && item.total_installments && (
                              <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                                {item.installment_number}/{item.total_installments}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 truncate max-w-xs">{item.description}</div>
                          {item.is_refundable_cost && (
                            <div className="mt-1 flex items-center gap-1">
                              <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200/80 px-1.5 py-0.2 rounded-full inline-flex items-center gap-0.5">
                                <span>⚖️ Custa</span>
                              </span>
                              {item.refund_status === "refunded" ? (
                                <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1 rounded">
                                  ✓ Reembolsado
                                </span>
                              ) : item.refund_status === "invoiced" ? (
                                <span className="text-[9px] font-semibold text-blue-700 bg-blue-50 px-1 rounded">
                                  Cobrado
                                </span>
                              ) : (
                                <span className="text-[9px] font-semibold text-amber-700 bg-amber-50 px-1 rounded">
                                  A Cobrar
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Categoria */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="text-xs text-gray-700 font-medium">
                            {categoryObj ? categoryObj.name : "—"}
                          </div>
                          {item.cost_center && (
                            <div className="text-[11px] text-gray-400">🏷️ {item.cost_center}</div>
                          )}
                        </td>

                        {/* Valor */}
                        <td className="py-3 px-4 text-right whitespace-nowrap font-medium text-gray-900">
                          {formatCurrency(item.amount)}
                          {item.paid_amount > 0 && item.paid_amount !== item.amount && (
                            <div className="text-[10px] text-emerald-600">
                              Pago: {formatCurrency(item.paid_amount)}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {item.status === "paid" ? (
                            <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-100 text-emerald-800">
                              ✓ Pago
                            </span>
                          ) : item.status === "partial" ? (
                            <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-blue-100 text-blue-800">
                              Parcial
                            </span>
                          ) : item.status === "overdue" ? (
                            <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-rose-100 text-rose-800">
                              Atrasado
                            </span>
                          ) : (
                            <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-gray-100 text-gray-700">
                              Aberto
                            </span>
                          )}
                        </td>

                        {/* Vínculo Bancário */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {linked ? (
                            <Link
                              href={`/transactions?month=${linked.month_ref}&payable_id=${item.id}`}
                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold hover:bg-indigo-100 transition-colors"
                              title="Ver transação no extrato"
                            >
                              <span>🔗</span>
                              <span>Extrato ({formatDate(linked.date)})</span>
                            </Link>
                          ) : item.is_manual_paid ? (
                            <span className="text-[11px] text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded">
                              💵 Quitado em espécie
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Pendente no extrato</span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Anexo / Link */}
                            {item.attachment_url && (
                              <button
                                onClick={() => {
                                  if (item.attachment_type === "external_link") {
                                    window.open(item.attachment_url!, "_blank");
                                  } else {
                                    setPreviewUrl(item.attachment_url);
                                  }
                                }}
                                className="p-1.5 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                title={item.attachment_type === "external_link" ? "Abrir Link do Drive" : "Ver Comprovante / Boleto"}
                              >
                                {item.attachment_type === "external_link" ? "☁️" : "📎"}
                              </button>
                            )}

                            {/* Copiar Pix / Boleto */}
                            {item.barcode_or_pix && (
                              <button
                                onClick={() =>
                                  handleCopyBarcode(
                                    item.barcode_or_pix!,
                                    isLikelyBoleto(item.barcode_or_pix)
                                  )
                                }
                                className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold ${
                                  isLikelyBoleto(item.barcode_or_pix)
                                    ? "text-blue-600 hover:bg-blue-50"
                                    : "text-emerald-700 hover:bg-emerald-50"
                                }`}
                                title={
                                  isLikelyBoleto(item.barcode_or_pix)
                                    ? "Copiar Código de Barras do Boleto"
                                    : `Copiar Chave Pix: ${item.barcode_or_pix}`
                                }
                              >
                                <span>{isLikelyBoleto(item.barcode_or_pix) ? "📄" : "⚡"}</span>
                                <span className="hidden md:inline text-[11px] font-mono">
                                  {isLikelyBoleto(item.barcode_or_pix) ? "Boleto" : "Pix"}
                                </span>
                              </button>
                            )}

                            {/* Quitar Manualmente (se ainda não estiver pago) */}
                            {item.status !== "paid" && (
                              <button
                                onClick={() => {
                                  setManualPayPayable(item);
                                  setManualPayAmount(String(item.amount));
                                }}
                                className="text-xs text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded font-semibold transition-colors"
                                title="Quitar fora do extrato (dinheiro / caixa)"
                              >
                                Quitar
                              </button>
                            )}

                            {/* Editar */}
                            <button
                              onClick={() => handleOpenModal(item)}
                              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                              title="Editar"
                            >
                              ✏️
                            </button>

                            {/* Excluir */}
                            <button
                              onClick={() => handleDeletePayable(item.id)}
                              className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                              title="Excluir"
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
      </div>

      {/* MODAL DE CADASTRO / EDIÇÃO */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                {editingPayable ? "Editar Conta a Pagar" : "Nova Conta a Pagar"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePayable} className="space-y-4 mt-4 text-sm">
              {/* Fornecedor com Auto-complete e Histórico */}
              <div>
                <label className="block font-medium text-gray-700 mb-1 flex items-center justify-between">
                  <span>Fornecedor / Favorecido *</span>
                  {suppliers.length > 0 && (
                    <span className="text-[10px] text-gray-400 font-normal">
                      💡 {suppliers.length} fornecedores salvos
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  required
                  list="suppliers-datalist"
                  placeholder="Ex: Imobiliária Central, OAB-SP, Google..."
                  value={supplierName}
                  onChange={(e) => handleSupplierChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
                <datalist id="suppliers-datalist">
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.cnpj ? `CNPJ: ${s.cnpj}` : ""}
                    </option>
                  ))}
                </datalist>
              </div>

              {/* Descrição */}
              <div>
                <label className="block font-medium text-gray-700 mb-1">Descrição</label>
                <input
                  type="text"
                  placeholder="Ex: Aluguel da sala, Anuidade, Guia DARE..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>

              {/* Valor e Vencimento */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Valor (R$) *</label>
                  <input
                    type="text"
                    required
                    placeholder="0,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Vencimento *</label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  />
                </div>
              </div>

              {/* Categorização Contábil (Categoria Pai e Subcategoria em Cascata) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Categoria Principal</label>
                  <select
                    value={parentCategoryId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setParentCategoryId(val);
                      setSubCategoryId("");
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white text-xs"
                  >
                    <option value="">Selecione... (Opcional)</option>
                    {parentCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-gray-700 mb-1">Subcategoria</label>
                  <select
                    value={subCategoryId}
                    onChange={(e) => setSubCategoryId(e.target.value)}
                    disabled={!parentCategoryId || availableSubcategories.length === 0}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white text-xs ${
                      !parentCategoryId || availableSubcategories.length === 0
                        ? "opacity-50 cursor-not-allowed bg-gray-50"
                        : ""
                    }`}
                  >
                    <option value="">
                      {!parentCategoryId
                        ? "Selecione a principal primeiro"
                        : availableSubcategories.length === 0
                        ? "Sem subcategorias"
                        : "Selecione... (Opcional)"}
                    </option>
                    {availableSubcategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Centro de Custo */}
              <div>
                <label className="block font-medium text-gray-700 mb-1">Centro de Custo</label>
                <select
                  value={costCenter}
                  onChange={(e) => setCostCenter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white text-xs"
                >
                  <option value="">Selecione... (Opcional)</option>
                  {costCenters.map((cc) => (
                    <option key={cc.id} value={cc.name}>
                      {cc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Parcelamento (somente ao criar novo) */}
              {!editingPayable && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={isInstallment}
                      onChange={(e) => setIsInstallment(e.target.checked)}
                      className="rounded text-primary focus:ring-primary w-4 h-4"
                    />
                    <span>Parcelar este compromisso em várias vezes?</span>
                  </label>

                  {isInstallment && (
                    <div className="mt-2.5 flex items-center gap-3 pt-2 border-t border-gray-200/60">
                      <span className="text-xs text-gray-600">Número de parcelas:</span>
                      <select
                        value={installmentsCount}
                        onChange={(e) => setInstallmentsCount(e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white outline-none"
                      >
                        {[2, 3, 4, 5, 6, 10, 12, 24, 36].map((n) => (
                          <option key={n} value={n}>
                            {n}x mensais
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Forma de Cobrança / Pagamento (Pix Fixo vs Boleto Variável) */}
              <div className="space-y-2">
                <label className="block font-medium text-gray-700 text-xs">
                  Forma de Cobrança / Pagamento
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("pix")}
                    className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      paymentMethod === "pix"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-2xs font-bold"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span>⚡</span>
                    <span>PIX (Fixo)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("boleto")}
                    className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      paymentMethod === "boleto"
                        ? "border-blue-500 bg-blue-50 text-blue-800 shadow-2xs font-bold"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span>📄</span>
                    <span>Boleto (Variável)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("other")}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      paymentMethod === "other"
                        ? "border-gray-500 bg-gray-100 text-gray-800 shadow-2xs font-bold"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span>Outro</span>
                  </button>
                </div>

                {paymentMethod === "pix" && (
                  <div className="p-3 bg-emerald-50/60 border border-emerald-200/70 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-emerald-900 flex items-center gap-1">
                        <span>⚡ Chave Pix do Fornecedor</span>
                      </label>
                      <span className="text-[10px] text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full font-medium">
                        Salva no cadastro para os próximos meses
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="CPF, CNPJ, E-mail, Celular ou Chave Aleatória..."
                      value={pixKey}
                      onChange={(e) => setPixKey(e.target.value)}
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-400 focus:border-emerald-500 outline-none font-mono"
                    />
                    <p className="text-[11px] text-emerald-700">
                      💡 Esta chave fica gravada no registro do fornecedor. Se alterada aqui, atualiza o cadastro automaticamente.
                    </p>
                  </div>
                )}

                {paymentMethod === "boleto" && (
                  <div className="p-3 bg-blue-50/60 border border-blue-200/70 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-blue-900 flex items-center gap-1">
                        <span>📄 Linha Digitável / Código de Barras</span>
                      </label>
                      <span className="text-[10px] text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full font-medium">
                        Exclusivo deste mês
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="Cole a linha digitável do boleto deste mês..."
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      className="w-full px-3 py-2 border border-blue-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-500 outline-none font-mono"
                    />
                    <p className="text-[11px] text-blue-700">
                      💡 O código de barras é específico deste mês e não sobrescreve a chave Pix cadastral do fornecedor.
                    </p>
                  </div>
                )}
              </div>

              {/* Seção Jurídica: Custa Processual Reembolsável */}
              {selectedCompany?.segment === "legal" && (
                <div className="bg-amber-50/50 border border-amber-200/80 rounded-xl p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-amber-900">
                    <input
                      type="checkbox"
                      checked={isRefundableCost}
                      onChange={(e) => setIsRefundableCost(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                    />
                    <span>⚖️ Esta despesa é uma Custa Processual Reembolsável pelo cliente?</span>
                  </label>

                  {isRefundableCost && (
                    <div className="pt-2 border-t border-amber-200/60 space-y-1">
                      <label className="block text-[11px] font-semibold text-amber-800">
                        Vincular ao Processo / Cliente:
                      </label>
                      <select
                        value={selectedCaseId}
                        onChange={(e) => setSelectedCaseId(e.target.value)}
                        className="w-full px-3 py-1.5 border border-amber-300 rounded-lg text-xs bg-white outline-none"
                      >
                        <option value="">Selecione o processo...</option>
                        {legalCases.map((lc) => (
                          <option key={lc.id} value={lc.id}>
                            Proc: {lc.case_number} — {lc.client_name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-amber-700">
                        💡 Ficará disponível para prestação de contas com 1 clique no menu Processos.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Anexo Seguro / Link do Google Drive */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700 text-xs uppercase tracking-wider">
                    Comprovante ou Boleto (Opcional)
                  </span>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setAttachmentMode("file")}
                      className={`px-2 py-0.5 rounded-lg font-medium transition-colors ${
                        attachmentMode === "file"
                          ? "bg-primary text-white"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      Upload Direto
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttachmentMode("link")}
                      className={`px-2 py-0.5 rounded-lg font-medium transition-colors ${
                        attachmentMode === "link"
                          ? "bg-primary text-white"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      Link do Drive
                    </button>
                  </div>
                </div>

                {attachmentMode === "file" ? (
                  <div>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Aceita PDF ou fotos (comprimidas automaticamente para economizar espaço).
                    </p>
                  </div>
                ) : (
                  <div>
                    <input
                      type="url"
                      placeholder="https://drive.google.com/file/d/..."
                      value={externalLink}
                      onChange={(e) => setExternalLink(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs outline-none bg-white"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Custo zero: armazene no seu próprio Google Drive/OneDrive e cole o link de compartilhamento.
                    </p>
                  </div>
                )}
              </div>

              {/* Botões do Modal */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingAttachment}
                  className="bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-xl font-semibold shadow-xs disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <span className="animate-spin text-xs">⏳</span>}
                  <span>{saving ? "Salvando..." : "Salvar Compromisso"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE QUITAÇÃO MANUAL */}
      {manualPayPayable && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-gray-100">
            <h3 className="text-base font-bold text-gray-900 mb-1">Quitação Manual / Em Espécie</h3>
            <p className="text-xs text-gray-500 mb-4">
              Esta ação registra o pagamento sem criar transação no extrato bancário oficial.
            </p>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Favorecido</label>
                <p className="font-semibold text-gray-800">{manualPayPayable.supplier_name}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Data do Pagamento</label>
                <input
                  type="date"
                  value={manualPayDate}
                  onChange={(e) => setManualPayDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Valor Pago (R$)</label>
                <input
                  type="text"
                  value={manualPayAmount}
                  onChange={(e) => setManualPayAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => setManualPayPayable(null)}
                className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-xl text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveManualPayment}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-xl text-xs font-semibold"
              >
                Confirmar Quitação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PREVIEW DE COMPROVANTE */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 shadow-2xl relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h4 className="font-bold text-gray-800 text-sm">Visualizador de Comprovante</h4>
              <button
                onClick={() => setPreviewUrl(null)}
                className="text-gray-400 hover:text-gray-700 font-bold"
              >
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

      {/* MODAL DE FORNECEDORES */}
      {showSuppliersModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-gray-100 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span>👥 Banco de Fornecedores</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Edite chaves Pix fixas, centros de custo e categorias padrão de cada parceiro.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowSuppliersModal(false);
                  loadAuxData();
                }}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1.5 rounded-lg hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <SuppliersManager
              onUpdated={() => {
                loadAuxData();
              }}
            />
          </div>
        </div>
      )}

      {/* Drawer Perfil Financeiro 360° do Fornecedor */}
      <SupplierFinancialProfileDrawer
        isOpen={showProfileDrawer}
        onClose={() => setShowProfileDrawer(false)}
        supplier={profileDrawerSupplier}
        companyId={selectedCompany?.id || ""}
        companyName={selectedCompany?.name || "Empresa"}
      />
    </Navigation>
  );
}
