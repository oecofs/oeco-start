"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import CategoriesManager from "@/components/CategoriesManager";
import SuppliersManager from "@/components/SuppliersManager";
import TeamManager from "@/components/TeamManager";
import CompaniesManager from "@/components/CompaniesManager";
import ObrasBackButton from "@/components/obras/ObrasBackButton";

type SettingsTab = "company" | "clients" | "account";
type CompanySubTab = "categories" | "suppliers" | "team";

export default function ObrasConfiguracoesPage() {
  const router = useRouter();
  const supabase = createClient();
  const { selectedCompany, isMaster, companies, refreshCompanies } = useCompany();

  const [activeTab, setActiveTab] = useState<SettingsTab>("company");
  const [companySubTab, setCompanySubTab] = useState<CompanySubTab>("categories");
  const [currentUserEmail, setCurrentUserEmail] = useState("");

  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  // Alteração de Senha
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserEmail(user.email || "");
      }
    }
    getUser();
  }, [supabase]);

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

  async function handleSeedConstructionCategories() {
    if (!selectedCompany?.id) return;
    if (
      !confirm(
        "Deseja carregar o catálogo padrão de categorias para Construção Civil (Materiais Básicos, Hidráulica, Elétrica, Mão de Obra, Acabamento, Equipamentos, etc.)?"
      )
    ) {
      return;
    }

    setSeeding(true);
    setSeedSuccess(false);
    try {
      const { error } = await supabase.rpc("seed_construction_categories", {
        p_company_id: selectedCompany.id,
      });

      if (error) throw error;

      setSeedSuccess(true);
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Erro ao carregar categorias.");
    } finally {
      setSeeding(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/obras/login");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <ObrasBackButton />
            <h1 className="text-xl sm:text-2xl font-black text-gray-900">
              Configurações
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Gerencie preferências da empresa ativa, clientes e sua conta de acesso.
          </p>
        </div>
      </div>

      {/* CONTROLE DE ABAS NO TOPO (EXATO PADRÃO DO FINANCEIRO GERAL) */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/80 rounded-xl border border-slate-300/60 inline-flex w-full sm:w-auto">
        {/* Aba 1: Empresa Ativa */}
        <button
          type="button"
          onClick={() => setActiveTab("company")}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === "company"
              ? "bg-white text-gray-900 shadow-sm"
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
                ? "bg-white text-gray-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>👑</span>
            <span>Gestão de Clientes (Master)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold">
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
              ? "bg-white text-gray-900 shadow-sm"
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
          <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                Empresa Selecionada no Momento
              </span>
              <h3 className="text-base sm:text-lg font-black text-gray-900 mt-0.5">
                {selectedCompany?.name || "Nenhuma empresa selecionada"}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Todas as alterações abaixo (categorias, fornecedores, equipe) são exclusivas desta empresa.
              </p>
            </div>

            {isMaster && (
              <button
                onClick={() => setActiveTab("clients")}
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-100 transition-colors self-start sm:self-auto whitespace-nowrap shadow-2xs"
              >
                Trocar / Gerenciar Empresas →
              </button>
            )}
          </div>

          {/* Sub-abas da Empresa Ativa */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 pb-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "categories", label: "🏷️ Categorias & Custos" },
                { id: "suppliers", label: "🏢 Fornecedores" },
                { id: "team", label: "👥 Equipe & Acessos" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCompanySubTab(tab.id as any)}
                  className={`px-3.5 py-2 text-xs rounded-xl font-bold transition-all cursor-pointer ${
                    companySubTab === tab.id
                      ? "bg-[#2C1810] text-white shadow-xs"
                      : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {companySubTab === "categories" && (
              <button
                type="button"
                onClick={handleSeedConstructionCategories}
                disabled={seeding}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-xs shadow-2xs transition-all active:scale-95 disabled:opacity-50"
              >
                <span>🏗️</span> {seeding ? "Carregando..." : "Carregar Categorias Padrão de Obra"}
              </button>
            )}
          </div>

          {seedSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-sm font-semibold">
              ✓ Categorias de Construção Civil geradas com sucesso!
            </div>
          )}

          {/* Renderização da Sub-aba Ativa */}
          <div className="pt-2">
            {companySubTab === "categories" && <CategoriesManager />}
            {companySubTab === "suppliers" && <SuppliersManager />}
            {companySubTab === "team" && <TeamManager />}
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: GESTÃO DE CLIENTES (MASTER) */}
      {activeTab === "clients" && isMaster && (
        <div className="pt-2">
          <CompaniesManager />
        </div>
      )}

      {/* CONTEÚDO DA ABA 3: MINHA CONTA */}
      {activeTab === "account" && (
        <div className="space-y-6 max-w-xl">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-2xs space-y-4">
            <h3 className="text-sm font-black text-gray-900">
              Dados do Usuário Logado
            </h3>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                E-mail de Acesso
              </label>
              <input
                type="text"
                disabled
                value={currentUserEmail}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 text-gray-700 font-medium"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-2xs space-y-4">
            <h3 className="text-sm font-black text-gray-900">
              Alterar Senha de Acesso
            </h3>

            {passwordMsg && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold ${
                  passwordMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {passwordMsg.text}
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Nova Senha
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={savingPassword}
                className="py-2.5 px-4 rounded-xl bg-[#2C1810] hover:bg-black text-white font-bold text-xs shadow-2xs transition-all disabled:opacity-50"
              >
                {savingPassword ? "Atualizando..." : "Salvar Nova Senha"}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-red-100 p-5 sm:p-6 shadow-2xs space-y-3">
            <h3 className="text-sm font-black text-red-700">Encerrar Sessão</h3>
            <p className="text-xs text-gray-500">
              Deseja sair da sua conta neste dispositivo?
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="py-2 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-2xs transition-all"
            >
              🚪 Sair do Sistema
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
