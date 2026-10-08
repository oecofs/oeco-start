"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useCompany, Company } from "@/contexts/CompanyContext";
import { createClient } from "@/lib/supabase/client";
import { SYSTEM_MODULES, SystemModuleKey } from "@/lib/modules";

type CompanyMember = {
  id: string;
  user_id: string;
  email: string;
  role: "master" | "admin" | "operator" | "viewer";
  created_at: string;
};

const DEFAULT_MODULE_MAP: Record<SystemModuleKey, boolean> = {
  transactions: true,
  payables: true,
  receivables: true,
  cards: true,
  obras: false,
  legal_cases: false,
  reports: true,
  kpis: true,
};

export default function CompaniesManager() {
  const supabase = createClient();
  const {
    companies,
    selectedCompany,
    isMaster,
    selectCompany,
    refreshCompanies,
    createCompany,
    refreshModules,
    impersonateUser,
  } = useCompany();

  // Estados de Busca e Filtro
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Mapeamento de Módulos por Empresa: { [companyId]: { [moduleKey]: boolean } }
  const [companyModulesMap, setCompanyModulesMap] = useState<Record<string, Record<SystemModuleKey, boolean>>>({});
  const [togglingModule, setTogglingModule] = useState<{ companyId: string; moduleKey: string } | null>(null);

  // Modal de Criação de Nova Empresa
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCnpj, setCreateCnpj] = useState("");
  const [createModules, setCreateModules] = useState<Record<SystemModuleKey, boolean>>({ ...DEFAULT_MODULE_MAP });
  const [savingCreate, setSavingCreate] = useState(false);

  // Modal de Edição de Empresa
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editName, setEditName] = useState("");
  const [editCnpj, setEditCnpj] = useState("");
  const [editModules, setEditModules] = useState<Record<SystemModuleKey, boolean>>({ ...DEFAULT_MODULE_MAP });
  const [savingEdit, setSavingEdit] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Gestão de membros expandidos por empresa
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, CompanyMember[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<Record<string, boolean>>({});

  // Formulário para adicionar novo usuário rápido
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "operator" | "viewer">("admin");
  const [addingMember, setAddingMember] = useState(false);
  const [memberMessage, setMemberMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 1. Carregar módulos de todas as empresas cadastradas
  const fetchAllCompanyModules = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("company_modules")
        .select("company_id, module_key, is_enabled");

      if (!error && data) {
        const map: Record<string, Record<SystemModuleKey, boolean>> = {};
        data.forEach((row: any) => {
          if (!map[row.company_id]) {
            map[row.company_id] = { ...DEFAULT_MODULE_MAP };
          }
          map[row.company_id][row.module_key as SystemModuleKey] = Boolean(row.is_enabled);
        });
        setCompanyModulesMap(map);
      }
    } catch (err) {
      console.error("Erro ao buscar matriz de módulos das empresas:", err);
    }
  }, [supabase]);

  useEffect(() => {
    fetchAllCompanyModules();
  }, [fetchAllCompanyModules, companies]);

  // 2. Alternar status de um módulo para uma empresa (Master Checkbox)
  async function handleToggleModule(companyId: string, moduleKey: SystemModuleKey, currentStatus: boolean) {
    const nextStatus = !currentStatus;
    setTogglingModule({ companyId, moduleKey });

    // Atualização otimista na UI
    setCompanyModulesMap((prev) => ({
      ...prev,
      [companyId]: {
        ...(prev[companyId] || DEFAULT_MODULE_MAP),
        [moduleKey]: nextStatus,
      },
    }));

    try {
      const { data, error } = await supabase.rpc("toggle_company_module", {
        p_company_id: companyId,
        p_module_key: moduleKey,
        p_is_enabled: nextStatus,
      });

      if (error) {
        // Fallback update direto na tabela company_modules
        await supabase
          .from("company_modules")
          .upsert(
            {
              company_id: companyId,
              module_key: moduleKey,
              is_enabled: nextStatus,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "company_id,module_key" }
          );
      }

      // Se alterou a empresa selecionada no momento, atualiza a barra de navegação imediatamente
      if (selectedCompany?.id === companyId) {
        await refreshModules();
      }
    } catch (err: any) {
      console.error("Erro ao atualizar módulo da empresa:", err);
      // Reverter em caso de falha
      setCompanyModulesMap((prev) => ({
        ...prev,
        [companyId]: {
          ...(prev[companyId] || DEFAULT_MODULE_MAP),
          [moduleKey]: currentStatus,
        },
      }));
    } finally {
      setTogglingModule(null);
    }
  }

  // Presets Rápidos de Módulos para Criação / Edição
  const applyModulePreset = (
    type: "pme" | "obras" | "legal" | "full",
    targetSetter: React.Dispatch<React.SetStateAction<Record<SystemModuleKey, boolean>>>
  ) => {
    if (type === "pme") {
      targetSetter({
        transactions: true,
        payables: true,
        receivables: true,
        cards: true,
        obras: false,
        legal_cases: false,
        reports: true,
        kpis: true,
      });
    } else if (type === "obras") {
      targetSetter({
        transactions: true,
        payables: true,
        receivables: true,
        cards: false,
        obras: true,
        legal_cases: false,
        reports: true,
        kpis: true,
      });
    } else if (type === "legal") {
      targetSetter({
        transactions: true,
        payables: true,
        receivables: true,
        cards: false,
        obras: false,
        legal_cases: true,
        reports: true,
        kpis: true,
      });
    } else if (type === "full") {
      targetSetter({
        transactions: true,
        payables: true,
        receivables: true,
        cards: true,
        obras: true,
        legal_cases: true,
        reports: true,
        kpis: true,
      });
    }
  };

  // Buscar membros de uma empresa
  const fetchMembers = useCallback(
    async (companyId: string) => {
      setLoadingMembers((prev) => ({ ...prev, [companyId]: true }));
      try {
        const { data, error } = await supabase.rpc("get_company_members", {
          p_company_id: companyId,
        });

        if (!error && data) {
          setMembers((prev) => ({ ...prev, [companyId]: data }));
        } else {
          const { data: directData } = await supabase
            .from("user_companies")
            .select("id, user_id, role, created_at")
            .eq("company_id", companyId);

          setMembers((prev) => ({
            ...prev,
            [companyId]: (directData || []).map((d) => ({
              id: d.id,
              user_id: d.user_id,
              email: "Usuário (" + d.user_id.slice(0, 8) + "...)",
              role: d.role,
              created_at: d.created_at,
            })),
          }));
        }
      } catch (err) {
        console.error("Erro ao buscar membros:", err);
      } finally {
        setLoadingMembers((prev) => ({ ...prev, [companyId]: false }));
      }
    },
    [supabase]
  );

  useEffect(() => {
    if (expandedCompanyId) {
      fetchMembers(expandedCompanyId);
    }
  }, [expandedCompanyId, fetchMembers]);

  // Lista Filtrada de Empresas
  const filteredCompanies = useMemo(() => {
    const term = searchQuery.toLowerCase().trim();
    const cleanTermNumbers = searchQuery.replace(/\D/g, "");

    return companies.filter((comp) => {
      if (statusFilter === "active" && !comp.is_active) return false;
      if (statusFilter === "inactive" && comp.is_active) return false;
      if (!term) return true;

      if (comp.name.toLowerCase().includes(term)) return true;

      if (comp.cnpj) {
        const cleanCnpj = comp.cnpj.replace(/\D/g, "");
        if (cleanCnpj && cleanTermNumbers && cleanCnpj.includes(cleanTermNumbers)) return true;
        if (comp.cnpj.toLowerCase().includes(term)) return true;
      }

      const companyMembers = members[comp.id] || [];
      if (companyMembers.some((m) => m.email.toLowerCase().includes(term))) {
        return true;
      }

      return false;
    });
  }, [companies, searchQuery, statusFilter, members]);

  // Criar nova empresa
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!createName.trim()) {
      setError("O nome da empresa é obrigatório.");
      return;
    }

    setSavingCreate(true);
    const created = await createCompany(createName, createCnpj);

    if (created) {
      // Salva a matriz de módulos selecionados para a nova empresa
      try {
        const moduleInserts = Object.entries(createModules).map(([modKey, isEnabled]) => ({
          company_id: created.id,
          module_key: modKey,
          is_enabled: isEnabled,
        }));

        await supabase.from("company_modules").upsert(moduleInserts, { onConflict: "company_id,module_key" });
      } catch (modErr) {
        console.error("Erro ao salvar módulos da empresa:", modErr);
      }

      setSuccess(`Empresa "${created.name}" cadastrada com os módulos contratados!`);
      setCreateName("");
      setCreateCnpj("");
      setCreateModules({ ...DEFAULT_MODULE_MAP });
      setShowCreateModal(false);
      await refreshCompanies();
      await fetchAllCompanyModules();
    } else {
      setError("Erro ao criar empresa. Verifique as permissões.");
    }
    setSavingCreate(false);
  }

  // Abrir modal de edição da empresa
  function handleOpenEdit(comp: Company) {
    setEditingCompany(comp);
    setEditName(comp.name);
    setEditCnpj(comp.cnpj || "");
    const currentMods = companyModulesMap[comp.id] || { ...DEFAULT_MODULE_MAP };
    setEditModules({ ...currentMods });
    setError("");
    setSuccess("");
  }

  // Salvar edição da empresa
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCompany) return;
    setError("");

    if (!editName.trim()) {
      setError("O nome da empresa não pode ficar vazio.");
      return;
    }

    setSavingEdit(true);
    try {
      await supabase.rpc("update_company_info", {
        p_company_id: editingCompany.id,
        p_name: editName.trim(),
        p_cnpj: editCnpj.trim() || null,
      });

      await supabase
        .from("companies")
        .update({
          name: editName.trim(),
          cnpj: editCnpj.trim() || null,
        })
        .eq("id", editingCompany.id);

      await supabase
        .from("settings")
        .update({ company_name: editName.trim() })
        .eq("company_id", editingCompany.id);

      // Atualiza módulos contratados
      const moduleInserts = Object.entries(editModules).map(([modKey, isEnabled]) => ({
        company_id: editingCompany.id,
        module_key: modKey,
        is_enabled: isEnabled,
        updated_at: new Date().toISOString(),
      }));

      await supabase.from("company_modules").upsert(moduleInserts, { onConflict: "company_id,module_key" });

      setSuccess(`Empresa "${editName.trim()}" e seus módulos foram atualizados com sucesso!`);
      setEditingCompany(null);
      await refreshCompanies();
      await fetchAllCompanyModules();
      if (selectedCompany?.id === editingCompany.id) {
        await refreshModules();
      }
    } catch (err: any) {
      setError(err.message || "Erro ao salvar alterações da empresa.");
    } finally {
      setSavingEdit(false);
    }
  }

  // Ativar / Desativar status da empresa
  async function handleToggleStatus(company: Company) {
    const nextStatus = !company.is_active;
    const { error: updateErr } = await supabase
      .from("companies")
      .update({ is_active: nextStatus })
      .eq("id", company.id);

    if (!updateErr) {
      refreshCompanies();
    }
  }

  // Adicionar membro rápido
  async function handleAddMember(companyId: string, e: React.FormEvent) {
    e.preventDefault();
    setMemberMessage(null);

    if (!newUserEmail.trim()) {
      setMemberMessage({ type: "error", text: "Digite o e-mail do usuário." });
      return;
    }

    setAddingMember(true);
    try {
      const { data, error } = await supabase.rpc("add_company_member_by_email", {
        p_company_id: companyId,
        p_email: newUserEmail.trim(),
        p_role: newUserRole,
      });

      if (error || !data?.success) {
        setMemberMessage({
          type: "error",
          text: data?.message || error?.message || "Erro ao vincular usuário.",
        });
      } else {
        setMemberMessage({ type: "success", text: "Usuário vinculado com sucesso!" });
        setNewUserEmail("");
        fetchMembers(companyId);
      }
    } catch (err: any) {
      setMemberMessage({ type: "error", text: err.message || "Erro inesperado." });
    } finally {
      setAddingMember(false);
    }
  }

  // Alterar papel do usuário
  async function handleRoleChange(companyId: string, userId: string, newRole: string) {
    try {
      const { error: rpcErr } = await supabase.rpc("update_company_member_role", {
        p_company_id: companyId,
        p_user_id: userId,
        p_new_role: newRole,
      });

      if (rpcErr) {
        await supabase
          .from("user_companies")
          .update({ role: newRole })
          .eq("company_id", companyId)
          .eq("user_id", userId);
      }

      setMemberMessage({ type: "success", text: "Nível de acesso atualizado com sucesso!" });
      fetchMembers(companyId);
      refreshCompanies();
    } catch (err: any) {
      setMemberMessage({ type: "error", text: "Erro ao atualizar permissão do usuário." });
    }
  }

  // Remover usuário da empresa
  async function handleRemoveMember(companyId: string, userId: string, email: string) {
    if (!confirm(`Remover o acesso de "${email}" a esta empresa?`)) return;

    try {
      await supabase.rpc("remove_company_member", {
        p_company_id: companyId,
        p_user_id: userId,
      });
      fetchMembers(companyId);
    } catch {
      await supabase
        .from("user_companies")
        .delete()
        .eq("company_id", companyId)
        .eq("user_id", userId);
      fetchMembers(companyId);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Seção Master */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">Gestão de Empresas & Matriz de Módulos</h2>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase tracking-wider">
              Painel Master
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Habilite ou desabilite com um clique quais dos 8 módulos cada empresa cliente tem direito de acessar.
          </p>
        </div>

        <button
          onClick={() => {
            setError("");
            setSuccess("");
            setCreateModules({ ...DEFAULT_MODULE_MAP });
            setShowCreateModal(true);
          }}
          className="px-4 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-dark transition-all shadow-sm whitespace-nowrap self-start sm:self-auto flex items-center gap-1.5 cursor-pointer"
        >
          <span>➕</span> Cadastrar Nova Empresa
        </button>
      </div>

      {/* BARRA DE PESQUISA & FILTROS */}
      <div className="bg-white rounded-2xl border border-gray-200 p-3.5 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 text-sm">
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar empresa por nome, CNPJ ou e-mail de membro..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 text-xs"
              title="Limpar busca"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === "all" ? "bg-white text-primary shadow-xs" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Todas ({companies.length})
            </button>
            <button
              onClick={() => setStatusFilter("active")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === "active" ? "bg-white text-emerald-700 shadow-xs" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Ativas ({companies.filter((c) => c.is_active).length})
            </button>
            <button
              onClick={() => setStatusFilter("inactive")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === "inactive" ? "bg-white text-red-700 shadow-xs" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Inativas ({companies.filter((c) => !c.is_active).length})
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl p-3.5">
          {error}
        </div>
      )}
      {success && (
        <div className="text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-xl p-3.5">
          {success}
        </div>
      )}

      {/* Lista de Empresas Filtradas */}
      {filteredCompanies.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xl mx-auto">
            🔍
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Nenhuma empresa encontrada</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Não encontramos resultados para "{searchQuery}" com o filtro selecionado.
            </p>
          </div>
          <button
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
            }}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors inline-block cursor-pointer"
          >
            Limpar filtros de pesquisa
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCompanies.map((comp) => {
            const isCurrent = comp.id === selectedCompany?.id;
            const isExpanded = expandedCompanyId === comp.id;
            const companyMembers = members[comp.id] || [];
            const compMods = companyModulesMap[comp.id] || DEFAULT_MODULE_MAP;
            const activeCount = Object.values(compMods).filter(Boolean).length;

            return (
              <div
                key={comp.id}
                className={`bg-white rounded-2xl border transition-all shadow-xs overflow-hidden ${
                  isCurrent ? "border-primary/50 ring-2 ring-primary/10" : "border-gray-200"
                }`}
              >
                {/* Linha Principal da Empresa */}
                <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-lg flex-shrink-0 ${
                        isCurrent ? "bg-primary text-white shadow-xs" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      🏢
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base text-gray-900 truncate">{comp.name}</span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            Ativa no Momento
                          </span>
                        )}
                        {!comp.is_active && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            Inativa
                          </span>
                        )}
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {activeCount} de 8 módulos liberados
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">
                          {comp.cnpj ? `CNPJ: ${comp.cnpj}` : "Sem CNPJ cadastrado"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Botões de Ação */}
                  <div className="flex items-center gap-2 flex-wrap self-end md:self-auto flex-shrink-0">
                    <button
                      onClick={() => handleOpenEdit(comp)}
                      className="text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1 cursor-pointer"
                      title="Editar dados desta empresa"
                    >
                      <span>✏️</span> Editar
                    </button>

                    <button
                      onClick={() => setExpandedCompanyId(isExpanded ? null : comp.id)}
                      className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-colors flex items-center gap-1.5 cursor-pointer ${
                        isExpanded
                          ? "bg-slate-100 border-slate-300 text-slate-800"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span>👥</span>
                      <span>Membros ({companyMembers.length || "..."})</span>
                      <span className="text-[10px]">{isExpanded ? "▲" : "▼"}</span>
                    </button>

                    {!isCurrent ? (
                      <button
                        onClick={() => selectCompany(comp.id)}
                        className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-primary text-white hover:bg-primary-dark transition-colors shadow-xs cursor-pointer"
                      >
                        Acessar como Ativa →
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-emerald-600 px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-200">
                        ✓ Selecionada
                      </span>
                    )}

                    <button
                      onClick={() => handleToggleStatus(comp)}
                      className={`text-xs font-semibold px-2.5 py-2 rounded-xl border transition-colors cursor-pointer ${
                        comp.is_active
                          ? "border-red-200 text-red-600 hover:bg-red-50"
                          : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                      }`}
                    >
                      {comp.is_active ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </div>

                {/* MATRIZ DE CHECKBOXES DE MÓDULOS (EXCLUSIVO MASTER) */}
                <div className="p-4 bg-slate-50/70 border-b border-gray-100">
                  <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                      <span>🎛️</span> Módulos Habilitados para {comp.name}:
                    </span>
                    <span className="text-[10px] text-gray-400">
                      Marque para liberar ou desmarque para bloquear o acesso da empresa.
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                    {SYSTEM_MODULES.map((mod) => {
                      const isEnabled = Boolean(compMods[mod.key]);
                      const isBusy =
                        togglingModule?.companyId === comp.id && togglingModule?.moduleKey === mod.key;

                      return (
                        <label
                          key={mod.key}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-all select-none ${
                            isEnabled
                              ? "bg-white border-primary/30 text-gray-900 shadow-2xs"
                              : "bg-gray-100/70 border-gray-200 text-gray-400 opacity-60 hover:opacity-90"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            disabled={isBusy}
                            onChange={() => handleToggleModule(comp.id, mod.key, isEnabled)}
                            className="rounded text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                          />
                          <span className="text-sm">{mod.icon}</span>
                          <span className={`truncate ${isEnabled ? "font-bold text-gray-800" : "text-gray-500"}`}>
                            {mod.shortLabel}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Membros Expandidos */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 bg-white space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <span className="text-xs font-bold text-gray-700">Membros com acesso à empresa:</span>
                    </div>

                    {companyMembers.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">Nenhum membro vinculado ainda.</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {companyMembers.map((m) => (
                          <div key={m.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-800">{m.email}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-bold uppercase">
                                {m.role}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {m.role !== "master" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    selectCompany(comp.id);
                                    impersonateUser({
                                      userId: m.user_id,
                                      email: m.email,
                                      role: m.role as any,
                                    });
                                  }}
                                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1 cursor-pointer"
                                  title={`Personificar e visualizar o sistema exatamente como ${m.email}`}
                                >
                                  <span>👁️</span>
                                  <span>Ver como Usuário</span>
                                </button>
                              )}
                              <button
                                onClick={() => handleRemoveMember(comp.id, m.user_id, m.email)}
                                className="text-red-600 hover:text-red-800 text-[11px] font-semibold cursor-pointer"
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Cadastro de Nova Empresa */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4 overflow-hidden backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white shrink-0">
              <h3 className="text-base font-bold text-gray-900">Cadastrar Nova Empresa</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold p-1.5 -mr-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain flex-1">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Nome da Empresa / Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Ex: Padaria São João Ltda"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    CNPJ (opcional)
                  </label>
                  <input
                    type="text"
                    value={createCnpj}
                    onChange={(e) => setCreateCnpj(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                  />
                </div>

                {/* MATRIZ DE MÓDULOS CONTRATADOS */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                      Módulos Habilitados (Contrato)
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => applyModulePreset("pme", setCreateModules)}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                      >
                        🏢 PME
                      </button>
                      <button
                        type="button"
                        onClick={() => applyModulePreset("obras", setCreateModules)}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                      >
                        🏗️ Obras
                      </button>
                      <button
                        type="button"
                        onClick={() => applyModulePreset("legal", setCreateModules)}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                      >
                        ⚖️ Jurídico
                      </button>
                      <button
                        type="button"
                        onClick={() => applyModulePreset("full", setCreateModules)}
                        className="text-[10px] px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary font-bold cursor-pointer"
                      >
                        ⭐ Todos (8)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {SYSTEM_MODULES.map((mod) => {
                      const checked = Boolean(createModules[mod.key]);
                      return (
                        <label
                          key={mod.key}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                            checked
                              ? "bg-primary/5 border-primary/40 text-gray-900"
                              : "bg-slate-50 border-gray-200 text-gray-400"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setCreateModules((prev) => ({
                                ...prev,
                                [mod.key]: e.target.checked,
                              }))
                            }
                            className="mt-0.5 rounded text-primary focus:ring-primary cursor-pointer"
                          />
                          <div>
                            <div className="flex items-center gap-1.5 font-bold">
                              <span>{mod.icon}</span>
                              <span>{mod.label}</span>
                            </div>
                            <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{mod.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 p-3.5 sm:p-4 border-t border-gray-100 bg-gray-50/90 shrink-0">
                <button
                  type="button"
                  disabled={savingCreate}
                  onClick={() => setShowCreateModal(false)}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-100 transition-colors text-center cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCreate}
                  className="w-full sm:w-auto px-5 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-dark transition-colors shadow-sm disabled:opacity-50 text-center cursor-pointer"
                >
                  {savingCreate ? "Cadastrando..." : "Cadastrar Empresa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edição de Empresa */}
      {editingCompany && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4 overflow-hidden backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setEditingCompany(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white shrink-0">
              <h3 className="text-base font-bold text-gray-900">Editar Empresa & Módulos</h3>
              <button
                type="button"
                onClick={() => setEditingCompany(null)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold p-1.5 -mr-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain flex-1">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Nome da Empresa *
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Ex: Nissi Engenharia"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    CNPJ (opcional)
                  </label>
                  <input
                    type="text"
                    value={editCnpj}
                    onChange={(e) => setEditCnpj(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                  />
                </div>

                {/* MATRIZ DE MÓDULOS NA EDIÇÃO */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                      Módulos Habilitados
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => applyModulePreset("pme", setEditModules)}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                      >
                        🏢 PME
                      </button>
                      <button
                        type="button"
                        onClick={() => applyModulePreset("obras", setEditModules)}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                      >
                        🏗️ Obras
                      </button>
                      <button
                        type="button"
                        onClick={() => applyModulePreset("legal", setEditModules)}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                      >
                        ⚖️ Jurídico
                      </button>
                      <button
                        type="button"
                        onClick={() => applyModulePreset("full", setEditModules)}
                        className="text-[10px] px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary font-bold cursor-pointer"
                      >
                        ⭐ Todos (8)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {SYSTEM_MODULES.map((mod) => {
                      const checked = Boolean(editModules[mod.key]);
                      return (
                        <label
                          key={mod.key}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                            checked
                              ? "bg-primary/5 border-primary/40 text-gray-900"
                              : "bg-slate-50 border-gray-200 text-gray-400"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setEditModules((prev) => ({
                                ...prev,
                                [mod.key]: e.target.checked,
                              }))
                            }
                            className="mt-0.5 rounded text-primary focus:ring-primary cursor-pointer"
                          />
                          <div>
                            <div className="flex items-center gap-1.5 font-bold">
                              <span>{mod.icon}</span>
                              <span>{mod.label}</span>
                            </div>
                            <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{mod.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 p-3.5 sm:p-4 border-t border-gray-100 bg-gray-50/90 shrink-0">
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={() => setEditingCompany(null)}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-100 transition-colors text-center cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="w-full sm:w-auto px-5 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-dark transition-colors shadow-sm disabled:opacity-50 text-center cursor-pointer"
                >
                  {savingEdit ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
