"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getWhiteLabelConfig } from "@/lib/whitelabel";
import { useCompany } from "@/contexts/CompanyContext";
import Navigation from "@/components/Navigation";
import CategoriesManager from "@/components/CategoriesManager";
import CostCentersManager from "@/components/CostCentersManager";
import CompaniesManager from "@/components/CompaniesManager";
import SuppliersManager from "@/components/SuppliersManager";
import CustomersManager from "@/components/CustomersManager";
import TeamManager from "@/components/TeamManager";

type SettingsTab = "company" | "clients" | "account";
type CompanySubTab = "general" | "team" | "bank_accounts" | "categories" | "suppliers" | "customers";

type FirmLawyer = {
  id: string;
  name: string;
  oab: string;
  role: "partner" | "associate" | "counsel";
};

const DEFAULT_PRACTICE_AREAS = [
  { id: "civel", label: "Cível & Consumidor" },
  { id: "trabalhista", label: "Trabalhista" },
  { id: "previdenciario", label: "Previdenciário (INSS)" },
  { id: "tributario", label: "Tributário" },
  { id: "familia", label: "Família & Sucessões" },
  { id: "penal", label: "Penal & Criminal" },
  { id: "imobiliario", label: "Imobiliário" },
  { id: "empresarial", label: "Empresarial & Societário" },
];

export default function SettingsPage() {
  const wl = getWhiteLabelConfig();
  const router = useRouter();
  const supabase = createClient();
  const { selectedCompany, isMaster, companies, refreshCompanies } = useCompany();

  const [activeTab, setActiveTab] = useState<SettingsTab>("company");
  const [companySubTab, setCompanySubTab] = useState<CompanySubTab>("general");
  const [currentUserEmail, setCurrentUserEmail] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [companyPixKey, setCompanyPixKey] = useState("");
  const [bankName, setBankName] = useState("");
  const [legalPatronName, setLegalPatronName] = useState("");
  const [legalOabNumber, setLegalOabNumber] = useState("");
  // Novos campos: Banca de Advogados, Modo de Assinatura e Áreas de Atuação
  const [legalSignatureMode, setLegalSignatureMode] = useState<"responsible" | "firm" | "all">("responsible");
  const [legalLawyers, setLegalLawyers] = useState<FirmLawyer[]>([]);
  const [legalPracticeAreas, setLegalPracticeAreas] = useState<string[]>([
    "civel",
    "trabalhista",
    "previdenciario",
    "tributario",
    "familia",
    "penal",
  ]);
  const [newLawyerName, setNewLawyerName] = useState("");
  const [newLawyerOab, setNewLawyerOab] = useState("");
  const [newLawyerRole, setNewLawyerRole] = useState<"partner" | "associate" | "counsel">("partner");
  const [newAreaInput, setNewAreaInput] = useState("");

  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  // Alteração de Senha
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 6) {
      setPasswordMsg({ type: "error", text: "A nova senha deve ter no mínimo 6 caracteres." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "As senhas digitadas não coincidem." });
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setPasswordMsg({ type: "success", text: "Sua senha foi alterada com sucesso!" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordMsg({ type: "error", text: err.message || "Erro ao atualizar senha." });
    } finally {
      setSavingPassword(false);
    }
  }

  // Load settings and user on mount
  const loadSettings = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      setCurrentUserEmail(user.email || "");
    }

    if (!selectedCompany) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let settingsQuery = supabase.from("settings").select("*");
    let bankAccountsQuery = supabase.from("bank_accounts").select("*").order("name");

    settingsQuery = settingsQuery.eq("company_id", selectedCompany.id);
    bankAccountsQuery = bankAccountsQuery.eq("company_id", selectedCompany.id);

    const [{ data: settingsData, error }, { data: accsData }] = await Promise.all([
      settingsQuery.limit(1).maybeSingle(),
      bankAccountsQuery,
    ]);

    if (error && error.code !== "PGRST116") {
      setError("Erro ao carregar configurações.");
      setLoading(false);
      return;
    }

    if (settingsData) {
      setCompanyName(settingsData.company_name || selectedCompany.name || "");
      setBankName(settingsData.bank_name || "");
      setLegalPatronName(settingsData.legal_patron_name || "");
      setLegalOabNumber(settingsData.legal_oab_number || "");
      setLegalSignatureMode(settingsData.legal_signature_mode || "responsible");
      setLegalLawyers(Array.isArray(settingsData.legal_lawyers) ? settingsData.legal_lawyers : []);
      setLegalPracticeAreas(
        Array.isArray(settingsData.legal_practice_areas) && settingsData.legal_practice_areas.length > 0
          ? settingsData.legal_practice_areas
          : ["civel", "trabalhista", "previdenciario", "tributario", "familia", "penal"]
      );
    } else {
      setCompanyName(selectedCompany.name || "");
      setBankName("");
      setLegalPatronName("");
      setLegalOabNumber("");
      setLegalSignatureMode("responsible");
      setLegalLawyers([]);
      setLegalPracticeAreas(["civel", "trabalhista", "previdenciario", "tributario", "familia", "penal"]);
    }

    // Carregar Chave Pix padrão da empresa
    const savedLocalPix = typeof window !== "undefined" ? localStorage.getItem(`oeco_default_pix_${selectedCompany.id}`) : null;
    setCompanyPixKey(savedLocalPix || (selectedCompany as any).pix_key || selectedCompany.cnpj || "");

    setBankAccounts(accsData || []);
    setLoading(false);
  }, [supabase, selectedCompany]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function setError(msg: string) {
    setMessage(msg);
    setMessageType("error");
  }

  function setSuccess(msg: string) {
    setMessage(msg);
    setMessageType("success");
  }

  // Gerenciamento de Advogados da Banca
  const handleAddLawyer = () => {
    if (!newLawyerName.trim()) {
      alert("Informe o nome do advogado.");
      return;
    }
    const newLawyer: FirmLawyer = {
      id: Math.random().toString(36).substring(2, 9),
      name: newLawyerName.trim(),
      oab: newLawyerOab.trim(),
      role: newLawyerRole,
    };
    setLegalLawyers((prev) => [...prev, newLawyer]);
    setNewLawyerName("");
    setNewLawyerOab("");
  };

  const handleRemoveLawyer = (id: string) => {
    setLegalLawyers((prev) => prev.filter((l) => l.id !== id));
  };

  // Gerenciamento de Áreas de Atuação
  const handleToggleArea = (areaId: string) => {
    setLegalPracticeAreas((prev) =>
      prev.includes(areaId) ? prev.filter((a) => a !== areaId) : [...prev, areaId]
    );
  };

  const handleAddCustomArea = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newAreaInput.trim().toLowerCase();
    if (!clean) return;
    if (!legalPracticeAreas.includes(clean)) {
      setLegalPracticeAreas((prev) => [...prev, clean]);
    }
    setNewAreaInput("");
  };

  // Save company settings
  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    if (!companyName.trim()) {
      setError("O nome da empresa é obrigatório.");
      setSaving(false);
      return;
    }

    if (!selectedCompany) {
      setError("Nenhuma empresa selecionada.");
      setSaving(false);
      return;
    }

    // 1. Atualiza na tabela companies
    try {
      await supabase
        .from("companies")
        .update({ 
          name: companyName.trim(),
          pix_key: companyPixKey.trim() || null
        })
        .eq("id", selectedCompany.id);
    } catch {
      await supabase
        .from("companies")
        .update({ name: companyName.trim() })
        .eq("id", selectedCompany.id);
    }

    if (typeof window !== "undefined") {
      if (companyPixKey.trim()) {
        localStorage.setItem(`oeco_default_pix_${selectedCompany.id}`, companyPixKey.trim());
      } else {
        localStorage.removeItem(`oeco_default_pix_${selectedCompany.id}`);
      }
    }

    // 2. Check if settings record exists for this company
    const { data: existing } = await supabase
      .from("settings")
      .select("id")
      .eq("company_id", selectedCompany.id)
      .limit(1)
      .maybeSingle();

    const legalPayload = {
      company_name: companyName.trim(),
      bank_name: bankName.trim() || null,
      legal_patron_name: legalPatronName.trim() || null,
      legal_oab_number: legalOabNumber.trim() || null,
      legal_signature_mode: legalSignatureMode,
      legal_lawyers: legalLawyers,
      legal_practice_areas: legalPracticeAreas,
    };

    if (existing) {
      const { error } = await supabase
        .from("settings")
        .update(legalPayload)
        .eq("id", existing.id);

      if (error) {
        console.error("Erro ao atualizar settings:", error);
        setError(`Erro ao salvar configurações: ${error.message || "Erro desconhecido"}`);
      } else {
        setSuccess("Configurações salvas com sucesso!");
        refreshCompanies();
      }
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("settings").insert({
        ...legalPayload,
        company_id: selectedCompany.id,
        user_id: user?.id,
        webhook_url: wl.webhookUrl || "https://placeholder.com/webhook",
      });

      if (error) {
        console.error("Erro ao inserir settings:", error);
        setError(`Erro ao salvar configurações: ${error.message || "Erro desconhecido"}`);
      } else {
        setSuccess("Configurações salvas com sucesso!");
        refreshCompanies();
      }
    }

    setSaving(false);
  }

  // Logout
  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <Navigation>
        <div className="p-4 md:p-8">
          <p className="text-gray-400 text-sm">Carregando configurações...</p>
        </div>
      </Navigation>
    );
  }

  return (
    <Navigation>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Configurações</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Gerencie preferências da empresa ativa, clientes e sua conta de acesso.
          </p>
        </div>

        {/* CONTROLE DE ABAS NO TOPO */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/80 rounded-xl border border-slate-300/60 inline-flex w-full sm:w-auto">
          {/* Aba 1: Empresa Ativa */}
          <button
            type="button"
            onClick={() => setActiveTab("company")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "company"
                ? "bg-white text-primary shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>🏢</span>
            <span className="truncate">
              Empresa Ativa {selectedCompany ? `(${selectedCompany.name})` : ""}
            </span>
          </button>

          {/* Aba 2: Gestão de Clientes / Master (EXCLUSIVO PARA MASTER) */}
          {isMaster && (
            <button
              type="button"
              onClick={() => setActiveTab("clients")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === "clients"
                  ? "bg-white text-primary shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>👑</span>
              <span>Gestão de Clientes (Master)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                {companies.length}
              </span>
            </button>
          )}

          {/* Aba 3: Minha Conta */}
          <button
            type="button"
            onClick={() => setActiveTab("account")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "account"
                ? "bg-white text-primary shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>👤</span>
            <span>Minha Conta</span>
          </button>
        </div>

        {/* CONTEÚDO DA ABA 1: EMPRESA ATIVA */}
        {activeTab === "company" && (
          <div className="space-y-6">
            {/* Banner de Contexto da Empresa Ativa */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Empresa Selecionada no Momento
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mt-0.5">
                  {selectedCompany?.name || "Nenhuma empresa selecionada"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Todas as alterações abaixo (contas, categorias, centros de custo) são exclusivas desta empresa.
                </p>
              </div>

              {isMaster && (
                <button
                  onClick={() => setActiveTab("clients")}
                  className="px-3 py-1.5 bg-white border border-primary/30 text-primary text-xs font-semibold rounded-lg hover:bg-primary/5 transition-colors self-start sm:self-auto whitespace-nowrap shadow-sm"
                >
                  Trocar / Gerenciar Empresas →
                </button>
              )}
            </div>

            {/* Sub-abas da Empresa Ativa (Pills Responsivos com Wrap — 100% Visíveis) */}
            <div className="bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/80 flex flex-wrap items-center gap-1.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setCompanySubTab("general")}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs rounded-xl font-bold transition-all cursor-pointer ${
                  companySubTab === "general"
                    ? "bg-primary text-white shadow-xs scale-[1.01]"
                    : "bg-white/70 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200/60 shadow-2xs"
                }`}
              >
                <span>🏢</span>
                <span>Dados da Empresa</span>
                {selectedCompany?.segment === "legal" && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                      companySubTab === "general"
                        ? "bg-white/20 text-white"
                        : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    Jurídico
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setCompanySubTab("bank_accounts")}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs rounded-xl font-bold transition-all cursor-pointer ${
                  companySubTab === "bank_accounts"
                    ? "bg-primary text-white shadow-xs scale-[1.01]"
                    : "bg-white/70 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200/60 shadow-2xs"
                }`}
              >
                <span>🏦</span>
                <span>Contas Bancárias</span>
                {bankAccounts.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                      companySubTab === "bank_accounts"
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {bankAccounts.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setCompanySubTab("categories")}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs rounded-xl font-bold transition-all cursor-pointer ${
                  companySubTab === "categories"
                    ? "bg-primary text-white shadow-xs scale-[1.01]"
                    : "bg-white/70 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200/60 shadow-2xs"
                }`}
              >
                <span>🏷️</span>
                <span>Categorias & Centros de Custo</span>
              </button>

              <button
                type="button"
                onClick={() => setCompanySubTab("customers")}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs rounded-xl font-bold transition-all cursor-pointer ${
                  companySubTab === "customers"
                    ? "bg-primary text-white shadow-xs scale-[1.01]"
                    : "bg-white/70 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200/60 shadow-2xs"
                }`}
              >
                <span>👥</span>
                <span>Clientes da Empresa</span>
              </button>

              <button
                type="button"
                onClick={() => setCompanySubTab("suppliers")}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs rounded-xl font-bold transition-all cursor-pointer ${
                  companySubTab === "suppliers"
                    ? "bg-primary text-white shadow-xs scale-[1.01]"
                    : "bg-white/70 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200/60 shadow-2xs"
                }`}
              >
                <span>🤝</span>
                <span>Fornecedores</span>
              </button>

              <button
                type="button"
                onClick={() => setCompanySubTab("team")}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs rounded-xl font-bold transition-all cursor-pointer ${
                  companySubTab === "team"
                    ? "bg-primary text-white shadow-xs scale-[1.01]"
                    : "bg-white/70 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200/60 shadow-2xs"
                }`}
              >
                <span>🛡️</span>
                <span>Equipe & Acessos</span>
              </button>
            </div>

            {/* 1. SUB-ABA: Dados da empresa ativa */}
            {companySubTab === "general" && (
              <form onSubmit={handleSaveSettings} className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 space-y-4 shadow-sm">
                <h2 className="text-base font-bold text-gray-800">Dados da empresa</h2>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Nome da empresa
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Ex: Padaria São João"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Banco principal
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Ex: Banco do Brasil"
                  />
                </div>

                <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-200/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-amber-950">
                      ⚡ Chave Pix Padrão da Empresa
                    </label>
                    <span className="text-[10px] text-amber-800 font-medium">
                      Usada nas mensagens de WhatsApp
                    </span>
                  </div>
                  <input
                    type="text"
                    value={companyPixKey}
                    onChange={(e) => setCompanyPixKey(e.target.value)}
                    className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                    placeholder="Ex: CNPJ, E-mail, Telefone ou Chave Aleatória"
                  />
                  {selectedCompany?.cnpj && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-[11px] text-gray-500">Sugestão:</span>
                      <button
                        type="button"
                        onClick={() => setCompanyPixKey(selectedCompany.cnpj || "")}
                        className="text-[11px] bg-white border border-amber-300 px-2 py-0.5 rounded text-amber-900 font-semibold hover:bg-amber-100 transition-colors"
                      >
                        Usar CNPJ da Empresa ({selectedCompany.cnpj})
                      </button>
                    </div>
                  )}
                </div>

                {/* SEÇÃO JURÍDICA COMPLETA: BANCA DE ADVOGADOS, ASSINATURA & ÁREAS DE ATUAÇÃO */}
                {selectedCompany?.segment === "legal" && (
                  <div className="pt-4 border-t border-gray-150 space-y-5 bg-amber-50/40 p-4 rounded-xl border border-amber-200/70">
                    <div className="flex items-center justify-between pb-2 border-b border-amber-200/50">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">⚖️</span>
                        <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                          Estrutura Jurídica, Banca de Advogados & Assinaturas
                        </h3>
                      </div>
                      <span className="text-[10px] bg-amber-200/70 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                        Módulo Jurídico
                      </span>
                    </div>

                    {/* 1. Sociedade / Patrono Geral */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-gray-800 mb-1">
                          Nome da Sociedade (PJ) ou Patrono Titular *
                        </label>
                        <input
                          type="text"
                          value={legalPatronName}
                          onChange={(e) => setLegalPatronName(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                          placeholder={`Padrão: ${companyName || "Nome da Sociedade de Advogados"}`}
                        />
                        <span className="text-[10px] text-gray-500 mt-0.5 block">
                          Razão social da Sociedade de Advogados ou nome do advogado titular.
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-800 mb-1">
                          OAB do Patrono / Registro
                        </label>
                        <input
                          type="text"
                          value={legalOabNumber}
                          onChange={(e) => setLegalOabNumber(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-white font-mono"
                          placeholder="Ex: OAB/SP 123.456 ou 1234/SP"
                        />
                        <span className="text-[10px] text-gray-500 mt-0.5 block">
                          Número da OAB da Sociedade ou Advogado Titular.
                        </span>
                      </div>
                    </div>

                    {/* 2. Regra de Assinatura nos Documentos */}
                    <div className="bg-white/80 p-3 rounded-xl border border-amber-200/70 space-y-2">
                      <label className="block text-xs font-bold text-gray-900">
                        Como as peças e prestações de contas devem ser assinadas?
                      </label>
                      <p className="text-[11px] text-gray-500">
                        Defina se o documento gerado em PDF sai com a assinatura do advogado do processo, da sociedade jurídica ou de toda a banca.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setLegalSignatureMode("responsible")}
                          className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                            legalSignatureMode === "responsible"
                              ? "border-amber-600 bg-amber-50 text-amber-950 font-bold shadow-2xs"
                              : "border-gray-200 hover:border-gray-300 text-gray-700 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">👤 Advogado do Caso</span>
                            {legalSignatureMode === "responsible" && (
                              <span className="text-amber-600 text-xs font-bold">✓</span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500 font-normal">
                            Assina o advogado responsável vinculado individualmente ao processo.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setLegalSignatureMode("firm")}
                          className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                            legalSignatureMode === "firm"
                              ? "border-amber-600 bg-amber-50 text-amber-950 font-bold shadow-2xs"
                              : "border-gray-200 hover:border-gray-300 text-gray-700 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">🏢 Patrono da Sociedade</span>
                            {legalSignatureMode === "firm" && (
                              <span className="text-amber-600 text-xs font-bold">✓</span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500 font-normal">
                            Assina com o nome da Sociedade / Titular configurado acima.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setLegalSignatureMode("all")}
                          className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                            legalSignatureMode === "all"
                              ? "border-amber-600 bg-amber-50 text-amber-950 font-bold shadow-2xs"
                              : "border-gray-200 hover:border-gray-300 text-gray-700 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">👥 Banca Completa</span>
                            {legalSignatureMode === "all" && (
                              <span className="text-amber-600 text-xs font-bold">✓</span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500 font-normal">
                            Co-assinatura com todos os advogados cadastrados na banca.
                          </p>
                        </button>
                      </div>
                    </div>

                    {/* 3. Banca de Advogados do Escritório */}
                    <div className="bg-white/80 p-3 rounded-xl border border-amber-200/70 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-gray-900">Banca de Advogados Integrantes</h4>
                          <p className="text-[11px] text-gray-500">
                            Cadastre os sócios, associados e consultores que podem assinar e atuar nos processos.
                          </p>
                        </div>
                        <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                          {legalLawyers.length} advogados
                        </span>
                      </div>

                      {/* Lista de advogados */}
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {legalLawyers.length === 0 ? (
                          <div className="text-center py-3 bg-amber-50/50 rounded-lg border border-dashed border-amber-200 text-xs text-amber-800/70">
                            Nenhum advogado individual cadastrado ainda na banca.
                          </div>
                        ) : (
                          legalLawyers.map((lawyer) => (
                            <div
                              key={lawyer.id}
                              className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm">⚖️</span>
                                <div>
                                  <span className="font-bold text-gray-900">{lawyer.name}</span>
                                  <span className="text-gray-400 font-mono text-[11px] ml-2">
                                    {lawyer.oab || "Sem OAB"}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    lawyer.role === "partner"
                                      ? "bg-amber-100 text-amber-800"
                                      : lawyer.role === "associate"
                                      ? "bg-blue-100 text-blue-800"
                                      : "bg-purple-100 text-purple-800"
                                  }`}
                                >
                                  {lawyer.role === "partner"
                                    ? "Sócio"
                                    : lawyer.role === "associate"
                                    ? "Associado"
                                    : "Consultor"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLawyer(lawyer.id)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors text-xs font-bold"
                                  title="Remover advogado"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Form rápido para adicionar advogado */}
                      <div className="pt-2 border-t border-gray-150 grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            placeholder="Nome do Advogado (ex: Dra. Mariana Costa)"
                            value={newLawyerName}
                            onChange={(e) => setNewLawyerName(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="OAB (ex: OAB/SP 456.789)"
                            value={newLawyerOab}
                            onChange={(e) => setNewLawyerOab(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:border-primary font-mono"
                          />
                        </div>
                        <div className="flex gap-1.5">
                          <select
                            value={newLawyerRole}
                            onChange={(e: any) => setNewLawyerRole(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:border-primary bg-white"
                          >
                            <option value="partner">Sócio</option>
                            <option value="associate">Associado</option>
                            <option value="counsel">Consultor</option>
                          </select>
                          <button
                            type="button"
                            onClick={handleAddLawyer}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0 shadow-2xs cursor-pointer"
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 4. Áreas de Atuação do Escritório (Filtros Inteligentes) */}
                    <div className="bg-white/80 p-3 rounded-xl border border-amber-200/70 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-gray-900">Áreas de Atuação do Escritório</h4>
                          <p className="text-[11px] text-gray-500">
                            Selecione as áreas em que o escritório atua para habilitar os filtros inteligentes nos processos e relatórios.
                          </p>
                        </div>
                        <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
                          {legalPracticeAreas.length} ativas
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {DEFAULT_PRACTICE_AREAS.map((area) => {
                          const isSelected = legalPracticeAreas.includes(area.id);
                          return (
                            <button
                              key={area.id}
                              type="button"
                              onClick={() => handleToggleArea(area.id)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                                isSelected
                                  ? "bg-amber-100 border-amber-400 text-amber-950 shadow-2xs font-bold"
                                  : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 opacity-60"
                              }`}
                            >
                              <span>{isSelected ? "✓" : "+"}</span>
                              <span>{area.label}</span>
                            </button>
                          );
                        })}

                        {/* Exibe áreas customizadas adicionadas */}
                        {legalPracticeAreas
                          .filter((a) => !DEFAULT_PRACTICE_AREAS.some((d) => d.id === a))
                          .map((custom) => (
                            <button
                              key={custom}
                              type="button"
                              onClick={() => handleToggleArea(custom)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold border bg-purple-100 border-purple-400 text-purple-950 shadow-2xs flex items-center gap-1.5 cursor-pointer capitalize"
                            >
                              <span>✓</span>
                              <span>{custom}</span>
                            </button>
                          ))}
                      </div>

                      {/* Adicionar área personalizada */}
                      <div className="pt-2 border-t border-gray-100 flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Outra área personalizada (ex: Marítimo, Agronegócio, Ambiental...)"
                          value={newAreaInput}
                          onChange={(e) => setNewAreaInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddCustomArea(e as any);
                            }
                          }}
                          className="w-full sm:w-80 px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={(e) => handleAddCustomArea(e as any)}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shrink-0 cursor-pointer"
                        >
                          + Adicionar Área
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 shadow-sm"
                >
                  {saving ? "Salvando..." : "Salvar Alterações"}
                </button>
              </form>
            )}

            {/* 2. SUB-ABA: Contas bancárias */}
            {companySubTab === "bank_accounts" && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-gray-800">Contas bancárias</h2>
                    <p className="text-xs text-gray-500">Contas correntes e saldos iniciais de {selectedCompany?.name}</p>
                  </div>
                  <Link
                    href="/bank-accounts"
                    className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors whitespace-nowrap shadow-sm"
                  >
                    + Gerenciar contas
                  </Link>
                </div>

                {bankAccounts.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhuma conta bancária cadastrada para esta empresa.</p>
                ) : (
                  <div className="space-y-2">
                    {bankAccounts.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-gray-800">{acc.name}</p>
                          <p className="text-gray-400 mt-0.5">
                            {acc.bank_name || "Banco não especificado"} {acc.agency ? `• Ag: ${acc.agency}` : ""} {acc.account_number ? `• CC: ${acc.account_number}` : ""}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            acc.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {acc.is_active ? "Ativa" : "Inativa"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. SUB-ABA: Categorias & Centros de Custo */}
            {companySubTab === "categories" && (
              <div className="space-y-6">
                <CategoriesManager />
                <CostCentersManager />
              </div>
            )}

            {/* 4. SUB-ABA: Equipe & Acessos da Empresa */}
            {companySubTab === "team" && (
              <div>
                <TeamManager />
              </div>
            )}

            {/* 5. SUB-ABA: Banco de Fornecedores */}
            {companySubTab === "suppliers" && (
              <div>
                <SuppliersManager />
              </div>
            )}

            {/* 6. SUB-ABA: Banco de Clientes */}
            {companySubTab === "customers" && (
              <div>
                <CustomersManager />
              </div>
            )}
          </div>
        )}

        {/* CONTEÚDO DA ABA 2: GESTÃO MASTER DE CLIENTES */}
        {activeTab === "clients" && (
          <div>
            <CompaniesManager />
          </div>
        )}

        {/* CONTEÚDO DA ABA 3: MINHA CONTA */}
        {activeTab === "account" && (
          <div className="space-y-6">
            {/* Dados do Usuário */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-gray-800">Dados do Usuário Logado</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    E-mail de Login
                  </span>
                  <span className="text-sm font-semibold text-slate-800">
                    {currentUserEmail || "Usuário Autenticado"}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Nível de Acesso
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                        isMaster
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-blue-100 text-blue-800 border-blue-200"
                      }`}
                    >
                      {isMaster ? "👑 Usuário Master (Acesso Global)" : "👔 Administrador"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Segurança & Alteração de Senha */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <span>🔒</span>
                  <span>Segurança & Alteração de Senha</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Atualize sua senha de acesso ao sistema com segurança.
                </p>
              </div>

              {passwordMsg && (
                <div
                  className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between ${
                    passwordMsg.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{passwordMsg.type === "success" ? "✓" : "⚠️"}</span>
                    <span>{passwordMsg.text}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPasswordMsg(null)}
                    className="opacity-60 hover:opacity-100 font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}

              <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    Nova Senha *
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo de 6 caracteres"
                    className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    Confirme a Nova Senha *
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingPassword}
                  className="px-4 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {savingPassword ? "Salvando Nova Senha..." : "Atualizar Minha Senha"}
                </button>
              </form>
            </div>

            {/* Logout */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Encerrar Sessão</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Desconectar com segurança desta máquina.
                </p>
              </div>

              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-50 text-red-600 font-semibold text-xs rounded-lg hover:bg-red-100 transition-colors border border-red-100 self-start sm:self-auto cursor-pointer"
              >
                Sair (Logout)
              </button>
            </div>
          </div>
        )}

        {/* Toast message */}
        {message && (
          <div
            className={`fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg shadow-xl z-50 text-xs font-semibold ${
              messageType === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </Navigation>
  );
}
