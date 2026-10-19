"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Navigation from "@/components/Navigation";
import MonthSelector from "@/components/MonthSelector";
import { useCompany } from "@/contexts/CompanyContext";
import { createClient } from "@/lib/supabase/client";
import { ServiceTemplate, InvoiceCustomer, NfseInvoice, CompanyFiscalSettings } from "@/components/invoices/types";
import EmitNfseDrawer from "@/components/invoices/EmitNfseDrawer";
import ManageTemplatesModal from "@/components/invoices/ManageTemplatesModal";
import FiscalSettingsModal from "@/components/invoices/FiscalSettingsModal";
import { generateDanfsePdf, downloadNfseXml } from "@/lib/fiscal/danfseGenerator";

export default function InvoicesPage() {
  const supabase = createClient();
  const { selectedCompany, isModuleAccessible } = useCompany();

  const companyId = selectedCompany?.id || "default";

  // Mês Selecionado
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // 1. Modelos (Templates Fiscais) isolados estritamente por Empresa
  const [templates, setTemplates] = useState<ServiceTemplate[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`oeco_nfse_templates_${companyId}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return [];
  });

  // 2. Notas Fiscais isoladas por Empresa
  const [invoices, setInvoices] = useState<NfseInvoice[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`oeco_nfse_invoices_${companyId}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return [];
  });

  // 3. Clientes da Empresa
  const [customers, setCustomers] = useState<InvoiceCustomer[]>([]);

  // Modais e Gavetas
  const [isEmitDrawerOpen, setIsEmitDrawerOpen] = useState(false);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [isFiscalSettingsModalOpen, setIsFiscalSettingsModalOpen] = useState(false);
  const [fiscalSettings, setFiscalSettings] = useState<CompanyFiscalSettings | null>(null);

  // Recarregar templates e notas quando o usuário trocar de empresa
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTemplates = localStorage.getItem(`oeco_nfse_templates_${companyId}`);
      setTemplates(savedTemplates ? JSON.parse(savedTemplates) : []);

      const savedInvoices = localStorage.getItem(`oeco_nfse_invoices_${companyId}`);
      setInvoices(savedInvoices ? JSON.parse(savedInvoices) : []);
    }
  }, [companyId]);

  // Persistência por Empresa
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`oeco_nfse_templates_${companyId}`, JSON.stringify(templates));
    }
  }, [templates, companyId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`oeco_nfse_invoices_${companyId}`, JSON.stringify(invoices));
    }
  }, [invoices, companyId]);

  // Busca clientes reais cadastrados na empresa
  const fetchRealCustomers = useCallback(async () => {
    if (!selectedCompany?.id) return;
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, document, phone, email, street, number, complement, neighborhood, city, state, zip_code")
        .eq("company_id", selectedCompany.id)
        .eq("is_active", true);

      if (!error && data && data.length > 0) {
        const mapped: InvoiceCustomer[] = data.map((d: any) => ({
          id: d.id,
          name: d.name,
          document: d.document || "",
          phone: d.phone || "",
          email: d.email || "",
          street: d.street || "",
          number: d.number || "",
          complement: d.complement || "",
          neighborhood: d.neighborhood || "",
          city: d.city || "São Paulo",
          state: d.state || "SP",
          zip_code: d.zip_code || "",
        }));
        setCustomers(mapped);
      } else {
        setCustomers([]);
      }
    } catch (err) {
      console.error("Erro ao carregar clientes fiscais:", err);
    }
  }, [selectedCompany, supabase]);

  // Sincroniza dados com o backend/banco se disponível
  const fetchBackendData = useCallback(async () => {
    if (!selectedCompany?.id) return;
    try {
      const [tplRes, invRes, certRes] = await Promise.all([
        fetch(`/api/invoices/templates?company_id=${selectedCompany.id}`).catch(() => null),
        fetch(`/api/invoices?company_id=${selectedCompany.id}`).catch(() => null),
        fetch(`/api/invoices/certificate?company_id=${selectedCompany.id}`).catch(() => null),
      ]);

      if (tplRes && tplRes.ok) {
        const tplData = await tplRes.json();
        if (tplData.templates && tplData.templates.length > 0) {
          setTemplates(tplData.templates);
        }
      }

      if (invRes && invRes.ok) {
        const invData = await invRes.json();
        if (invData.invoices && invData.invoices.length > 0) {
          setInvoices(invData.invoices);
        }
      }

      if (certRes && certRes.ok) {
        const certData = await certRes.json();
        if (certData.settings) {
          setFiscalSettings(certData.settings);
        }
      }
    } catch {}
  }, [selectedCompany?.id]);

  useEffect(() => {
    fetchRealCustomers();
    fetchBackendData();
  }, [fetchRealCustomers, fetchBackendData]);

  // Atualização em tempo real dos dados do cliente (inclusive na tabela oficial do Supabase)
  const handleUpdateCustomer = async (cust: InvoiceCustomer) => {
    // 1. Atualiza estado em memória
    setCustomers((prev) => {
      const exists = prev.some((c) => c.id === cust.id);
      if (exists) {
        return prev.map((c) => (c.id === cust.id ? cust : c));
      }
      return [cust, ...prev];
    });

    // 2. Se houver conexão com Supabase e empresa ativa, persiste
    if (selectedCompany?.id) {
      try {
        if (cust.id.startsWith("cust-")) {
          // Novo cliente
          await supabase.from("customers").insert({
            company_id: selectedCompany.id,
            name: cust.name,
            document: cust.document,
            email: cust.email,
            phone: cust.phone,
            is_active: true,
          });
        } else {
          // Atualização de cliente existente
          await supabase
            .from("customers")
            .update({
              name: cust.name,
              document: cust.document,
              email: cust.email,
              phone: cust.phone,
            })
            .eq("id", cust.id);
        }
      } catch (err) {
        console.error("Erro ao salvar dados cadastrais do cliente:", err);
      }
    }
  };

  // Handlers de Modelos
  const handleSaveTemplate = (newTpl: ServiceTemplate) => {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === newTpl.id);
      if (exists) {
        return prev.map((t) => (t.id === newTpl.id ? newTpl : t));
      }
      return [newTpl, ...prev];
    });
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSaveNewTemplateFromDrawer = (tplData: Omit<ServiceTemplate, "id">) => {
    const created: ServiceTemplate = {
      ...tplData,
      id: `tpl-${Date.now()}`,
    };
    handleSaveTemplate(created);
  };

  // Handler de Sucesso na Emissão
  const handleInvoiceIssued = (newInvoice: NfseInvoice) => {
    setInvoices((prev) => [newInvoice, ...prev]);
  };

  // Handler de Cancelamento
  const handleCancelInvoice = (invoiceId: string) => {
    if (confirm("Tem certeza que deseja solicitar o cancelamento desta NFS-e junto à prefeitura?")) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? { ...inv, status: "cancelled", status_message: "Cancelada a pedido do emitente" }
            : inv
        )
      );
    }
  };

  // Filtragem de Notas
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesMonth = selectedMonth ? inv.competence_month === selectedMonth : true;
      const matchesStatus = statusFilter === "all" ? true : inv.status === statusFilter;
      const matchesSearch = searchTerm
        ? inv.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (inv.number && inv.number.includes(searchTerm)) ||
          inv.customer_document.includes(searchTerm)
        : true;

      return matchesMonth && matchesStatus && matchesSearch;
    });
  }, [invoices, selectedMonth, statusFilter, searchTerm]);

  // Métricas do Mês
  const monthKpis = useMemo(() => {
    const monthNotes = invoices.filter((inv) => inv.competence_month === selectedMonth);
    const authorized = monthNotes.filter((inv) => inv.status === "authorized");
    const processing = monthNotes.filter((inv) => inv.status === "processing");
    const rejected = monthNotes.filter((inv) => inv.status === "rejected");

    const totalBilled = authorized.reduce((acc, curr) => acc + curr.amount, 0);
    const totalIss = authorized.reduce((acc, curr) => acc + curr.iss_amount, 0);

    return {
      totalBilled,
      totalIss,
      authorizedCount: authorized.length,
      processingCount: processing.length,
      rejectedCount: rejected.length,
      totalCount: monthNotes.length,
    };
  }, [invoices, selectedMonth]);

  // Se o módulo de Notas Fiscais não estiver liberado para esta empresa
  if (selectedCompany && !isModuleAccessible("invoices")) {
    return (
      <Navigation>
        <div className="p-6 sm:p-12 max-w-lg mx-auto text-center space-y-4 pt-16">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-600 flex items-center justify-center text-3xl mx-auto border border-amber-200 shadow-sm">
            🔒
          </div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">
            Módulo de Notas Fiscais Não Contratado
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            O emissor de NFS-e não está ativo para a empresa <strong>{selectedCompany.name}</strong>.
            Para contratar e liberar a emissão de notas fiscais com integração à prefeitura, solicite a ativação com o administrador da sua conta.
          </p>
        </div>
      </Navigation>
    );
  }

  return (
    <Navigation>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        
        {/* BANNER LIMPO E DISCRETO DO MÓDULO FISCAL */}
        <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-sm border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 text-emerald-400 border border-white/10 flex items-center justify-center font-bold text-lg">
              🧾
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Módulo de Emissão Fiscal
                </span>
                {fiscalSettings?.environment === "production" ? (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Produção Oficial (Prefeitura)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Ambiente de Testes (Homologação)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {fiscalSettings?.environment === "production"
                  ? "Notas fiscais transmitidas com validade jurídica direta para a prefeitura"
                  : "Notas fiscais emitidas sem valor fiscal para validação de layout e fluxo"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setIsFiscalSettingsModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer"
              title="Configurar Certificado Digital A1 e Inscrição Municipal"
            >
              <span className={`w-2 h-2 rounded-full ${fiscalSettings?.has_certificate_a1 ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              <span>{fiscalSettings?.has_certificate_a1 ? "Certificado A1 Ativo" : "Certificado Digital A1"}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsTemplatesModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer"
            >
              <span>⚡</span> Modelos ({templates.length})
            </button>

            <button
              type="button"
              onClick={() => setIsEmitDrawerOpen(true)}
              className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 text-xs font-black transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <span>+</span> Emitir NFS-e
            </button>
          </div>
        </div>

        {/* CONTROLES DE COMPETÊNCIA E SELEÇÃO DE MÊS */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Notas Fiscais de Serviço (NFS-e)
            </h1>
            <p className="text-xs text-slate-500">
              Acompanhamento de emissões, apuração de faturamento e download de DANFSE/XML
            </p>
          </div>

          <div className="w-full sm:w-auto">
            <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
          </div>
        </div>

        {/* CARDS DE KPIS FISCAIS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Faturado no Mês (Autorizadas)
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              R$ {monthKpis.totalBilled.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-emerald-600 font-bold block">
              ✓ {monthKpis.authorizedCount} nota(s) válida(s)
            </span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              ISS no Simples (Informativo)
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-700">
              R$ {monthKpis.totalIss.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-500 font-medium block">
              Recolhido via DAS mensal
            </span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Total de Notas Emitidas
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {monthKpis.totalCount}
            </div>
            <span className="text-[10px] text-slate-500 font-medium block">
              Competência {selectedMonth}
            </span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Pendentes / Rejeitadas
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {monthKpis.processingCount + monthKpis.rejectedCount}
            </div>
            <span className="text-[10px] text-slate-500 font-medium block">
              {monthKpis.rejectedCount > 0 ? (
                <span className="text-rose-600 font-bold">{monthKpis.rejectedCount} rejeitada(s)</span>
              ) : (
                "Nenhuma rejeição registrada"
              )}
            </span>
          </div>
        </div>

        {/* BARRA DE FILTROS E BUSCA */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            {[
              { id: "all", label: "Todas" },
              { id: "authorized", label: "Autorizadas" },
              { id: "processing", label: "Em Processamento" },
              { id: "rejected", label: "Rejeitadas" },
              { id: "cancelled", label: "Canceladas" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === tab.id
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="w-full md:w-72">
            <input
              type="text"
              placeholder="Buscar por cliente, CNPJ ou nº da nota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* TABELA DE NOTAS FISCAIS */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Nº / Série</th>
                  <th className="py-3 px-4">Emissão</th>
                  <th className="py-3 px-4">Tomador (Cliente)</th>
                  <th className="py-3 px-4">Modelo / Discriminação</th>
                  <th className="py-3 px-4 text-right">Valor Bruto</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      <div className="text-2xl mb-1">🧾</div>
                      <p className="font-medium text-xs">Nenhuma nota fiscal emitida para esta empresa nesta competência.</p>
                      <button
                        type="button"
                        onClick={() => setIsEmitDrawerOpen(true)}
                        className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        Emitir primeira NFS-e
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        {inv.status === "authorized" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Autorizada
                          </span>
                        )}
                        {inv.status === "processing" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                            Processando
                          </span>
                        )}
                        {inv.status === "rejected" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Rejeitada
                          </span>
                        )}
                        {inv.status === "cancelled" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            Cancelada
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {inv.number ? `Nº ${inv.number}/${inv.series || "E"}` : "Em emissão..."}
                      </td>

                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(inv.issue_date).toLocaleDateString("pt-BR")}
                      </td>

                      <td className="py-3 px-4 max-w-[220px]">
                        <strong className="block text-slate-900 truncate">{inv.customer_name}</strong>
                        <span className="text-[11px] text-slate-400 block font-mono">{inv.customer_document}</span>
                      </td>

                      <td className="py-3 px-4 max-w-[260px]">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 mr-1.5">
                          {inv.template_name || "Serviço"}
                        </span>
                        <p className="text-xs text-slate-600 line-clamp-1 mt-0.5" title={inv.service_description}>
                          {inv.service_description}
                        </p>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <strong className="text-xs font-black text-slate-900 block">
                          R$ {inv.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </strong>
                        <span className="text-[10px] text-slate-400 block">
                          ISS {inv.iss_rate}%: R$ {inv.iss_amount.toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              generateDanfsePdf({
                                invoice: inv,
                                companyName: selectedCompany?.name || "Sua Empresa Ltda",
                                companyCnpj: selectedCompany?.cnpj || "00.000.000/0001-91",
                                companyMunicipalInscription: fiscalSettings?.municipal_inscription || "Isento",
                                isTestEnvironment: fiscalSettings?.environment !== "production",
                              });
                            }}
                            title="Visualizar / Baixar DANFSE em PDF"
                            className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 flex items-center justify-center text-xs transition-all cursor-pointer"
                          >
                            📄
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              downloadNfseXml(inv, selectedCompany?.name || "Sua Empresa");
                            }}
                            title="Baixar arquivo XML"
                            className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 flex items-center justify-center text-xs transition-all cursor-pointer"
                          >
                            💾
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const msg = encodeURIComponent(
                                `Olá ${inv.customer_name}! Segue sua Nota Fiscal nº ${inv.number} no valor de R$ ${inv.amount.toFixed(2)}. Acesse o DANFSE no link: ${inv.danfse_url}`
                              );
                              window.open(`https://wa.me/?text=${msg}`, "_blank");
                            }}
                            title="Enviar por WhatsApp"
                            className="w-7 h-7 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs transition-all cursor-pointer"
                          >
                            💬
                          </button>

                          {inv.status === "authorized" && (
                            <button
                              type="button"
                              onClick={() => handleCancelInvoice(inv.id)}
                              title="Solicitar cancelamento da NFS-e"
                              className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-600 flex items-center justify-center text-xs transition-all cursor-pointer"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* GAVETA DE EMISSÃO RÁPIDA */}
      <EmitNfseDrawer
        isOpen={isEmitDrawerOpen}
        onClose={() => setIsEmitDrawerOpen(false)}
        templates={templates}
        customers={customers}
        companyId={selectedCompany?.id}
        onSuccess={handleInvoiceIssued}
        onSaveNewTemplate={handleSaveNewTemplateFromDrawer}
        onUpdateCustomer={handleUpdateCustomer}
      />

      {/* MODAL DE GESTÃO DE MODELOS */}
      <ManageTemplatesModal
        isOpen={isTemplatesModalOpen}
        onClose={() => setIsTemplatesModalOpen(false)}
        templates={templates}
        onSaveTemplate={handleSaveTemplate}
        onDeleteTemplate={handleDeleteTemplate}
      />

      {/* MODAL DE CERTIFICADO DIGITAL & DADOS FISCAIS */}
      <FiscalSettingsModal
        isOpen={isFiscalSettingsModalOpen}
        onClose={() => setIsFiscalSettingsModalOpen(false)}
        companyId={selectedCompany?.id || companyId}
        companyName={selectedCompany?.name || "Sua Empresa"}
        onSaved={(updated) => setFiscalSettings(updated)}
      />
    </Navigation>
  );
}
