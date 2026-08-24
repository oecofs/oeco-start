"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useCompany, Company } from "@/contexts/CompanyContext";
import { createClient } from "@/lib/supabase/client";

type CompanyMember = {
  id: string;
  user_id: string;
  email: string;
  role: "master" | "admin" | "operator" | "viewer";
  created_at: string;
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrador (Empresa)", color: "bg-blue-100 text-blue-800" },
  { value: "operator", label: "Operador (Conciliação)", color: "bg-emerald-100 text-emerald-800" },
  { value: "viewer", label: "Visualizador (Leitura)", color: "bg-slate-100 text-slate-700" },
  { value: "master", label: "Master (Global)", color: "bg-amber-100 text-amber-800" },
];

export default function CompaniesManager() {
  const supabase = createClient();
  const { companies, selectedCompany, isMaster, selectCompany, refreshCompanies, createCompany } =
    useCompany();

  // Estados de Busca e Filtro
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Modal de Criação
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCnpj, setCreateCnpj] = useState("");
  const [savingCreate, setSavingCreate] = useState(false);

  // Modal de Edição de Empresa
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editName, setEditName] = useState("");
  const [editCnpj, setEditCnpj] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Gestão de membros expandidos por empresa
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, CompanyMember[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<Record<string, boolean>>({});

  // Formulário para adicionar novo usuário
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "operator" | "viewer">("admin");
  const [addingMember, setAddingMember] = useState(false);
  const [memberMessage, setMemberMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
          // Fallback se RPC não existir: busca direto em user_companies
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

  // Lista Filtrada de Empresas (Nome, CNPJ ou E-mail de Membro)
  const filteredCompanies = useMemo(() => {
    const term = searchQuery.toLowerCase().trim();
    const cleanTermNumbers = searchQuery.replace(/\D/g, "");

    return companies.filter((comp) => {
      // Filtro por status
      if (statusFilter === "active" && !comp.is_active) return false;
      if (statusFilter === "inactive" && comp.is_active) return false;

      // Se não houver termo de busca, retorna todas do status
      if (!term) return true;

      // Busca por Nome
      if (comp.name.toLowerCase().includes(term)) return true;

      // Busca por CNPJ
      if (comp.cnpj) {
        const cleanCnpj = comp.cnpj.replace(/\D/g, "");
        if (cleanCnpj && cleanTermNumbers && cleanCnpj.includes(cleanTermNumbers)) return true;
        if (comp.cnpj.toLowerCase().includes(term)) return true;
      }

      // Busca por e-mail dos membros já carregados
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
    setSavingCreate(false);

    if (created) {
      setSuccess(`Empresa "${created.name}" criada com sucesso com categorias padrão!`);
      setCreateName("");
      setCreateCnpj("");
      setShowCreateModal(false);
    } else {
      setError("Erro ao criar empresa. Verifique as permissões.");
    }
  }

  // Abrir modal de edição da empresa
  function handleOpenEdit(comp: Company) {
    setEditingCompany(comp);
    setEditName(comp.name);
    setEditCnpj(comp.cnpj || "");
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
      // 1. Tenta via RPC update_company_info
      const { error: rpcErr } = await supabase.rpc("update_company_info", {
        p_company_id: editingCompany.id,
        p_name: editName.trim(),
        p_cnpj: editCnpj.trim() || null,
      });

      if (rpcErr) {
        // Fallback direto nas tabelas
        await supabase
          .from("companies")
          .update({ name: editName.trim(), cnpj: editCnpj.trim() || null })
          .eq("id", editingCompany.id);

        await supabase
          .from("settings")
          .update({ company_name: editName.trim() })
          .eq("company_id", editingCompany.id);
      }

      setSuccess(`Empresa "${editName.trim()}" atualizada com sucesso!`);
      setEditingCompany(null);
      refreshCompanies();
    } catch (err: any) {
      setError(err.message || "Erro ao salvar alterações da empresa.");
    } finally {
      setSavingEdit(false);
    }
  }

  // Ativar / Desativar status
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

  // Adicionar membro por e-mail
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
          text: data?.message || error?.message || "Erro ao vincular usuário. Verifique se o e-mail está cadastrado.",
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

  // Alterar papel/perfil do usuário
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
    <div className="space-y-5">
      {/* Cabeçalho da Seção Master */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">Gestão de Empresas & Clientes</h2>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase tracking-wider">
              Painel Master
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Pesquise, edite empresas, ative/desative clientes e gerencie permissões de usuários.
          </p>
        </div>

        <button
          onClick={() => {
            setError("");
            setSuccess("");
            setShowCreateModal(true);
          }}
          className="px-4 py-2.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors shadow-sm whitespace-nowrap self-start sm:self-auto flex items-center gap-1.5"
        >
          <span>+</span> Cadastrar Nova Empresa
        </button>
      </div>

      {/* BARRA DE PESQUISA & FILTROS */}
      <div className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Input de Busca com Ícone */}
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 text-sm">
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar empresa por nome, CNPJ ou e-mail de usuário..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all"
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

        {/* Filtros de Status (Todas / Ativas / Inativas) + Contador */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-2.5 py-1.5 rounded-md transition-all ${
                statusFilter === "all" ? "bg-white text-primary shadow-xs" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Todas ({companies.length})
            </button>
            <button
              onClick={() => setStatusFilter("active")}
              className={`px-2.5 py-1.5 rounded-md transition-all ${
                statusFilter === "active" ? "bg-white text-emerald-700 shadow-xs" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Ativas ({companies.filter((c) => c.is_active).length})
            </button>
            <button
              onClick={() => setStatusFilter("inactive")}
              className={`px-2.5 py-1.5 rounded-md transition-all ${
                statusFilter === "inactive" ? "bg-white text-red-700 shadow-xs" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Inativas ({companies.filter((c) => !c.is_active).length})
            </button>
          </div>

          <span className="text-[11px] font-medium text-gray-400 hidden sm:inline">
            {filteredCompanies.length === companies.length
              ? `${companies.length} empresa(s)`
              : `${filteredCompanies.length} de ${companies.length}`}
          </span>
        </div>
      </div>

      {error && (
        <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg p-3.5">
          {error}
        </div>
      )}
      {success && (
        <div className="text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-lg p-3.5">
          {success}
        </div>
      )}

      {/* Lista de Empresas Filtradas */}
      {filteredCompanies.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center space-y-3">
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
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors inline-block"
          >
            Limpar filtros de pesquisa
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCompanies.map((comp) => {
            const isCurrent = comp.id === selectedCompany?.id;
            const isExpanded = expandedCompanyId === comp.id;
            const companyMembers = members[comp.id] || [];
            const isLoadingMembers = loadingMembers[comp.id];

            return (
              <div
                key={comp.id}
                className={`bg-white rounded-xl border transition-all shadow-sm overflow-hidden ${
                  isCurrent ? "border-primary/50 ring-1 ring-primary/20" : "border-gray-200"
                }`}
              >
                {/* Linha Principal da Empresa */}
                <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0 ${
                        isCurrent ? "bg-primary text-white" : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      🏢
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base text-gray-900 truncate">{comp.name}</span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            Empresa Ativa no App
                          </span>
                        )}
                        {!comp.is_active && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            Inativa
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {comp.cnpj ? `CNPJ: ${comp.cnpj}` : "Sem CNPJ cadastrado"}
                      </p>
                    </div>
                  </div>

                  {/* Botões de Ação */}
                  <div className="flex items-center gap-2 flex-wrap self-end md:self-auto flex-shrink-0">
                    {/* Botão Editar Empresa */}
                    <button
                      onClick={() => handleOpenEdit(comp)}
                      className="text-xs font-semibold px-2.5 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1"
                      title="Editar nome e CNPJ desta empresa"
                    >
                      <span>✏️</span> Editar
                    </button>

                    {/* Botão Usuários */}
                    <button
                      onClick={() => setExpandedCompanyId(isExpanded ? null : comp.id)}
                      className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-colors flex items-center gap-1.5 ${
                        isExpanded
                          ? "bg-slate-100 border-slate-300 text-slate-800"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span>👥</span>
                      <span>Usuários ({companyMembers.length || "..."})</span>
                      <span className="text-[10px]">{isExpanded ? "▲" : "▼"}</span>
                    </button>

                    {/* Botão Selecionar / Ativa */}
                    {!isCurrent ? (
                      <button
                        onClick={() => selectCompany(comp.id)}
                        className="text-xs font-semibold px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors shadow-sm"
                      >
                        Acessar como Ativa →
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-emerald-600 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-200">
                        ✓ Selecionada
                      </span>
                    )}

                    {/* Ativar / Desativar */}
                    {isMaster && (
                      <button
                        onClick={() => handleToggleStatus(comp)}
                        className={`text-xs px-2.5 py-2 rounded-lg transition-colors ${
                          comp.is_active ? "text-orange-600 hover:bg-orange-50" : "text-green-600 hover:bg-green-50"
                        }`}
                      >
                        {comp.is_active ? "Desativar" : "Ativar"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-painel: Usuários & Membros da Empresa (Expansível) */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-slate-50/70 p-4 md:p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                          Usuários & Permissões em {comp.name}
                        </h4>
                        <p className="text-xs text-slate-500">
                          Altere os níveis de permissão ou vincule novos e-mails para esta empresa.
                        </p>
                      </div>
                    </div>

                    {memberMessage && (
                      <div
                        className={`text-xs p-3 rounded-lg border font-medium ${
                          memberMessage.type === "success"
                            ? "bg-green-50 border-green-200 text-green-700"
                            : "bg-red-50 border-red-200 text-red-700"
                        }`}
                      >
                        {memberMessage.text}
                      </div>
                    )}

                    {/* Formulário: Vincular Novo Usuário */}
                    <form
                      onSubmit={(e) => handleAddMember(comp.id, e)}
                      className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center gap-2.5 shadow-sm"
                    >
                      <div className="flex-1 w-full">
                        <input
                          type="email"
                          required
                          value={newUserEmail}
                          onChange={(e) => setNewUserEmail(e.target.value)}
                          placeholder="Digite o e-mail do usuário (ex: cliente@empresa.com)"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>

                      <div className="w-full sm:w-52">
                        <select
                          value={newUserRole}
                          onChange={(e) => setNewUserRole(e.target.value as any)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="admin">Administrador (Total da Empresa)</option>
                          <option value="operator">Operador (Conciliação)</option>
                          <option value="viewer">Visualizador (Leitura)</option>
                        </select>
                      </div>

                      <button
                        type="submit"
                        disabled={addingMember}
                        className="w-full sm:w-auto px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors shadow-sm disabled:opacity-50 whitespace-nowrap"
                      >
                        {addingMember ? "Vinculando..." : "+ Vincular Usuário"}
                      </button>
                    </form>

                    {/* Lista de Membros */}
                    {isLoadingMembers ? (
                      <div className="text-center py-4 text-xs text-slate-400">Carregando usuários...</div>
                    ) : companyMembers.length === 0 ? (
                      <div className="text-center py-4 bg-white rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                        Nenhum usuário específico vinculado ainda.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {companyMembers.map((m) => {
                          return (
                            <div
                              key={m.id}
                              className="bg-white px-3.5 py-3 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="font-bold text-slate-800 truncate">{m.email}</span>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Seletor de Papel / Perfil Editável */}
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">Perfil:</span>
                                  <select
                                    value={m.role}
                                    onChange={(e) => handleRoleChange(comp.id, m.user_id, e.target.value)}
                                    className="px-2 py-1 bg-slate-50 border border-slate-300 rounded-md text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary"
                                  >
                                    {ROLE_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <button
                                  onClick={() => handleRemoveMember(comp.id, m.user_id, m.email)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors text-[11px] font-semibold"
                                >
                                  Remover
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Edição de Empresa */}
      {editingCompany && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
          onClick={() => setEditingCompany(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">Editar Empresa</h3>
              <button
                onClick={() => setEditingCompany(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Nome da Empresa / Cliente *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ex: Nissi Engenharia"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={() => setEditingCompany(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex-1 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors shadow-sm disabled:opacity-50"
                >
                  {savingEdit ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cadastro de Nova Empresa */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">Cadastrar Nova Empresa</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-primary/90 leading-relaxed">
              💡 <strong>Plano de Contas Automático:</strong> Ao criar a empresa, o catálogo de categorias financeiras padrão será clonado automaticamente para ela.
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={savingCreate}
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCreate}
                  className="flex-1 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors shadow-sm disabled:opacity-50"
                >
                  {savingCreate ? "Criando..." : "Criar Empresa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
