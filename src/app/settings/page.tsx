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

type SettingsTab = "company" | "clients" | "account";

export default function SettingsPage() {
  const wl = getWhiteLabelConfig();
  const router = useRouter();
  const supabase = createClient();
  const { selectedCompany, isMaster, companies, refreshCompanies } = useCompany();

  const [activeTab, setActiveTab] = useState<SettingsTab>("company");
  const [currentUserEmail, setCurrentUserEmail] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

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
    } else {
      setCompanyName(selectedCompany.name || "");
      setBankName("");
    }
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
    await supabase
      .from("companies")
      .update({ name: companyName.trim() })
      .eq("id", selectedCompany.id);

    // 2. Check if settings record exists for this company
    const { data: existing } = await supabase
      .from("settings")
      .select("id")
      .eq("company_id", selectedCompany.id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("settings")
        .update({
          company_name: companyName.trim(),
          bank_name: bankName.trim() || null,
        })
        .eq("id", existing.id);

      if (error) {
        setError("Erro ao salvar configurações.");
      } else {
        setSuccess("Configurações salvas com sucesso!");
        refreshCompanies();
      }
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("settings").insert({
        company_name: companyName.trim(),
        bank_name: bankName.trim() || null,
        company_id: selectedCompany.id,
        user_id: user?.id,
        webhook_url: wl.webhookUrl || "https://placeholder.com/webhook",
      });

      if (error) {
        setError("Erro ao salvar configurações.");
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

            {/* Dados da empresa ativa */}
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

              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 shadow-sm"
              >
                {saving ? "Salvando..." : "Salvar Alterações"}
              </button>
            </form>

            {/* Contas bancárias */}
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

            {/* Categorias */}
            <CategoriesManager />

            {/* Centros de custo */}
            <CostCentersManager />
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
                className="px-4 py-2 bg-red-50 text-red-600 font-semibold text-xs rounded-lg hover:bg-red-100 transition-colors border border-red-100 self-start sm:self-auto"
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
