"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { createClient } from "@/lib/supabase/client";
import { SYSTEM_MODULES, SystemModuleKey } from "@/lib/modules";

export type CompanyMember = {
  id: string;
  user_id: string;
  email: string;
  role: "master" | "admin" | "operator" | "viewer";
  created_at: string;
};

const ROLE_DEFINITIONS = [
  {
    value: "admin",
    label: "Administrador",
    badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
    description: "Acesso total aos módulos habilitados da empresa, gestão de membros e configurações.",
  },
  {
    value: "operator",
    label: "Operador",
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
    description: "Lança transações, conciliação e operações nos módulos autorizados pela empresa.",
  },
  {
    value: "viewer",
    label: "Visualizador (Leitura)",
    badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
    description: "Apenas visualização e consulta nos módulos autorizados (sem permissão de edição).",
  },
  {
    value: "master",
    label: "Master OECO",
    badgeColor: "bg-amber-100 text-amber-800 border-amber-200",
    description: "Administrador global da plataforma OECO com acesso irrestrito.",
  },
];

export default function TeamManager() {
  const supabase = createClient();
  const { selectedCompany, isMaster, realIsMaster, impersonateUser } = useCompany();

  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Módulos habilitados da empresa ativa (ex: { transactions: true, payables: true, ... })
  const [activeCompanyModules, setActiveCompanyModules] = useState<Record<SystemModuleKey, boolean>>({
    transactions: true,
    payables: true,
    receivables: true,
    cards: true,
    obras: false,
    legal_cases: false,
    reports: true,
    kpis: true,
  });

  // Permissões individuais de cada usuário: { [userId]: { [moduleKey]: boolean } }
  const [userPermissionsMap, setUserPermissionsMap] = useState<Record<string, Record<SystemModuleKey, boolean>>>({});
  const [togglingUserModule, setTogglingUserModule] = useState<{ userId: string; moduleKey: string } | null>(null);

  // Modal de Adicionar / Convidar Membro
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "operator" | "viewer">("operator");
  const [inviteModules, setInviteModules] = useState<Record<SystemModuleKey, boolean>>({
    transactions: true,
    payables: true,
    receivables: true,
    cards: true,
    obras: true,
    legal_cases: true,
    reports: true,
    kpis: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // 1. Buscar membros da empresa ativa
  const fetchMembers = useCallback(async () => {
    if (!selectedCompany) {
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_company_members", {
        p_company_id: selectedCompany.id,
      });

      if (!error && data) {
        setMembers(data);
      } else {
        const { data: directData } = await supabase
          .from("user_companies")
          .select("id, user_id, role, created_at")
          .eq("company_id", selectedCompany.id);

        setMembers(
          (directData || []).map((d) => ({
            id: d.id,
            user_id: d.user_id,
            email: "Usuário (" + d.user_id.slice(0, 8) + "...)",
            role: d.role,
            created_at: d.created_at,
          }))
        );
      }
    } catch (err) {
      console.error("Erro ao buscar membros:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedCompany]);

  // 2. Buscar módulos liberados pelo Master para esta empresa e permissões dos usuários
  const fetchCompanyAndUserModules = useCallback(async () => {
    if (!selectedCompany) return;

    try {
      // Busca módulos habilitados da empresa
      const { data: compModsData } = await supabase
        .from("company_modules")
        .select("module_key, is_enabled")
        .eq("company_id", selectedCompany.id);

      const compMap: Record<SystemModuleKey, boolean> = {
        transactions: true,
        payables: true,
        receivables: true,
        cards: true,
        obras: false,
        legal_cases: false,
        reports: true,
        kpis: true,
      };

      if (compModsData && compModsData.length > 0) {
        compModsData.forEach((row: any) => {
          compMap[row.module_key as SystemModuleKey] = Boolean(row.is_enabled);
        });
      }
      setActiveCompanyModules(compMap);

      // Busca permissões individuais dos usuários da empresa
      const { data: userPermsData } = await supabase
        .from("company_user_module_permissions")
        .select("user_id, module_key, can_access, can_edit")
        .eq("company_id", selectedCompany.id);

      const uMap: Record<string, Record<SystemModuleKey, boolean>> = {};
      if (userPermsData && userPermsData.length > 0) {
        userPermsData.forEach((row: any) => {
          if (!uMap[row.user_id]) {
            uMap[row.user_id] = {} as any;
          }
          uMap[row.user_id][row.module_key as SystemModuleKey] = Boolean(row.can_access);
        });
      }
      setUserPermissionsMap(uMap);
    } catch (err) {
      console.error("Erro ao buscar permissões modulares:", err);
    }
  }, [supabase, selectedCompany]);

  useEffect(() => {
    fetchMembers();
    fetchCompanyAndUserModules();
  }, [fetchMembers, fetchCompanyAndUserModules]);

  // Módulos disponíveis para esta empresa (que o Master liberou)
  const availableCompanyModules = useMemo(() => {
    return SYSTEM_MODULES.filter((mod) => activeCompanyModules[mod.key]);
  }, [activeCompanyModules]);

  // Membros visíveis (Masters são invisíveis para clientes comuns)
  const visibleMembers = useMemo(() => {
    if (!isMaster) {
      return members.filter((m) => m.role !== "master");
    }
    return members;
  }, [members, isMaster]);

  // Membros filtrados pela busca
  const filteredMembers = useMemo(() => {
    if (!searchTerm.trim()) return visibleMembers;
    const term = searchTerm.toLowerCase();
    return visibleMembers.filter(
      (m) => m.email.toLowerCase().includes(term) || m.role.toLowerCase().includes(term)
    );
  }, [visibleMembers, searchTerm]);

  // Alternar permissão de um módulo para um usuário específico
  async function handleToggleUserModule(userId: string, moduleKey: SystemModuleKey, currentAccess: boolean) {
    if (!selectedCompany) return;
    const nextAccess = !currentAccess;
    setTogglingUserModule({ userId, moduleKey });

    // Atualização otimista
    setUserPermissionsMap((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {}),
        [moduleKey]: nextAccess,
      },
    }));

    try {
      const { error } = await supabase.rpc("toggle_user_module_permission", {
        p_company_id: selectedCompany.id,
        p_user_id: userId,
        p_module_key: moduleKey,
        p_can_access: nextAccess,
        p_can_edit: nextAccess,
      });

      if (error) {
        await supabase
          .from("company_user_module_permissions")
          .upsert(
            {
              company_id: selectedCompany.id,
              user_id: userId,
              module_key: moduleKey,
              can_access: nextAccess,
              can_edit: nextAccess,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "company_id,user_id,module_key" }
          );
      }
    } catch (err: any) {
      console.error("Erro ao salvar permissão do usuário:", err);
      // Reverter em caso de falha
      setUserPermissionsMap((prev) => ({
        ...prev,
        [userId]: {
          ...(prev[userId] || {}),
          [moduleKey]: currentAccess,
        },
      }));
    } finally {
      setTogglingUserModule(null);
    }
  }

  // Alterar papel do usuário
  async function handleRoleChange(userId: string, newRole: string) {
    if (!selectedCompany) return;

    try {
      const { error: rpcErr } = await supabase.rpc("update_company_member_role", {
        p_company_id: selectedCompany.id,
        p_user_id: userId,
        p_new_role: newRole,
      });

      if (rpcErr) {
        await supabase
          .from("user_companies")
          .update({ role: newRole })
          .eq("company_id", selectedCompany.id)
          .eq("user_id", userId);
      }

      setFeedback({ type: "success", message: "Nível de acesso atualizado com sucesso!" });
      fetchMembers();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro ao atualizar papel." });
    }
  }

  // Remover membro da empresa
  async function handleRemoveMember(member: CompanyMember) {
    if (!selectedCompany) return;
    if (member.role === "master" && !isMaster) {
      alert("Apenas usuários Master podem gerenciar outros Masters.");
      return;
    }

    if (
      !confirm(
        `Deseja realmente remover o acesso de "${member.email}" à empresa ${selectedCompany.name}?`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase.rpc("remove_company_member", {
        p_company_id: selectedCompany.id,
        p_user_id: member.user_id,
      });

      if (error) {
        await supabase
          .from("user_companies")
          .delete()
          .eq("company_id", selectedCompany.id)
          .eq("user_id", member.user_id);
      }

      setFeedback({ type: "success", message: `Acesso de ${member.email} revogado.` });
      fetchMembers();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro ao remover membro." });
    }
  }

  // Adicionar / Convidar membro via API segura com pré-seleção de módulos
  async function handleInviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompany || !inviteEmail.trim()) return;

    setSubmitting(true);
    setFeedback(null);

    const emailClean = inviteEmail.trim().toLowerCase();

    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompany.id,
          email: emailClean,
          role: inviteRole,
        }),
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData?.error || "Erro ao processar convite.");
      }

      // Se foi cadastrado e tem userId, salva as permissões dos módulos escolhidos
      if (resData?.userId) {
        const permInserts = Object.entries(inviteModules).map(([mKey, canAccess]) => ({
          company_id: selectedCompany.id,
          user_id: resData.userId,
          module_key: mKey,
          can_access: canAccess,
          can_edit: inviteRole !== "viewer" && canAccess,
        }));

        await supabase
          .from("company_user_module_permissions")
          .upsert(permInserts, { onConflict: "company_id,user_id,module_key" });
      }

      setFeedback({
        type: "success",
        message: resData.message || `Convite enviado com sucesso para "${emailClean}".`,
      });
      setShowInviteModal(false);
      setInviteEmail("");
      fetchMembers();
      fetchCompanyAndUserModules();
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Erro inesperado ao processar convite.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Descrição */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <span>👥 Equipe & Permissões por Módulo</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
              {visibleMembers.length} membro(s)
            </span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Gerencie os usuários e dê check em quais dos módulos contratados de{" "}
            <strong>{selectedCompany?.name}</strong> cada membro pode operar.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFeedback(null);
            setShowInviteModal(true);
          }}
          className="bg-primary hover:bg-primary-dark text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <span>➕</span>
          <span>Adicionar Membro</span>
        </button>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between animate-in fade-in duration-150 ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{feedback.type === "success" ? "✓" : "⚠️"}</span>
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-bold opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Busca & Lista de Membros com Matriz de Permissões */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <input
            type="text"
            placeholder="🔍 Buscar membro por e-mail ou cargo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-80 px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs"
          />
          <div className="text-[11px] text-gray-400">
            Módulos liberados para esta empresa: <strong>{availableCompanyModules.length} de 8</strong>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400 text-xs">
            Carregando equipe e permissões...
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-xs">
            Nenhum membro encontrado. Clique em "+ Adicionar Membro" para convidar usuários.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMembers.map((member) => {
              const roleObj = ROLE_DEFINITIONS.find((r) => r.value === member.role);
              const isAdmin = member.role === "admin";
              const isMasterMember = member.role === "master";
              const userPerms = userPermissionsMap[member.user_id] || {};

              return (
                <div
                  key={member.id}
                  className="p-4 rounded-2xl border border-gray-200 hover:border-gray-300 bg-white transition-all shadow-2xs space-y-3"
                >
                  {/* Linha do Usuário */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm">
                        {member.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-gray-900">{member.email}</span>
                          {isMasterMember && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
                              👑 Master Global
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400">
                          {member.created_at
                            ? `Membro desde ${new Date(member.created_at).toLocaleDateString("pt-BR")}`
                            : "Acesso Ativo"}
                        </span>
                      </div>
                    </div>

                    {/* Cargo / Tag & Ações */}
                    <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
                      {!isMasterMember && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400 font-medium">Cargo:</span>
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                            className="text-xs font-semibold border border-gray-200 rounded-xl px-2.5 py-1.5 bg-slate-50 text-gray-800 focus:outline-none focus:border-primary"
                          >
                            <option value="admin">Administrador (Total)</option>
                            <option value="operator">Operador</option>
                            <option value="viewer">Visualizador</option>
                          </select>
                        </div>
                      )}

                      {!isMasterMember && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {realIsMaster && (
                            <button
                              type="button"
                              onClick={() =>
                                impersonateUser({
                                  userId: member.user_id,
                                  email: member.email,
                                  role: member.role as any,
                                })
                              }
                              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1 cursor-pointer"
                              title={`Personificar e visualizar o sistema exatamente como ${member.email}`}
                            >
                              <span>👁️</span>
                              <span>Ver como Usuário</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member)}
                            className="text-red-600 hover:text-red-800 text-xs font-semibold px-2.5 py-1.5 rounded-xl hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            Revogar Acesso
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Matriz de Checkboxes dos Módulos Liberados para a Empresa */}
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        Acesso aos Módulos da Empresa:
                      </span>
                      {isAdmin ? (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          ✓ Administrador possui acesso total a todos os módulos liberados
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">
                          Selecione os módulos que este membro pode acessar
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                      {availableCompanyModules.map((mod) => {
                        // Se for admin, tem acesso a tudo que a empresa tem
                        const isChecked = isAdmin ? true : userPerms[mod.key] !== false;
                        const isBusy =
                          togglingUserModule?.userId === member.user_id &&
                          togglingUserModule?.moduleKey === mod.key;

                        return (
                          <label
                            key={mod.key}
                            className={`flex items-center gap-1.5 p-2 rounded-xl border text-xs select-none transition-all ${
                              isAdmin
                                ? "bg-slate-50 border-slate-200 text-slate-700 opacity-80 cursor-default"
                                : isChecked
                                ? "bg-emerald-50/50 border-emerald-300 text-emerald-900 cursor-pointer shadow-2xs font-semibold"
                                : "bg-gray-50 border-gray-200 text-gray-400 cursor-pointer opacity-50 hover:opacity-80"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isAdmin || isBusy}
                              onChange={() =>
                                handleToggleUserModule(member.user_id, mod.key, isChecked)
                              }
                              className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer disabled:opacity-50"
                            />
                            <span>{mod.icon}</span>
                            <span className="truncate">{mod.shortLabel}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Convidar / Adicionar Membro */}
      {showInviteModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowInviteModal(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900">Adicionar Membro à Equipe</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Conceda acesso a <strong>{selectedCompany?.name}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold p-1.5 -mr-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInviteMember} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain flex-1">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    E-mail do Usuário *
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="exemplo@empresa.com.br"
                    className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    Nível de Acesso (Cargo) *
                  </label>
                  <div className="space-y-2">
                    {ROLE_DEFINITIONS.filter((r) => r.value !== "master").map((r) => (
                      <label
                        key={r.value}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          inviteRole === r.value
                            ? "border-primary bg-primary/5 shadow-2xs"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="invite_role"
                          value={r.value}
                          checked={inviteRole === r.value}
                          onChange={() => setInviteRole(r.value as any)}
                          className="mt-0.5 text-primary focus:ring-primary"
                        />
                        <div>
                          <span className="text-xs font-bold text-gray-900 block">{r.label}</span>
                          <span className="text-[11px] text-gray-500 leading-tight block mt-0.5">
                            {r.description}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Pré-seleção de Módulos para o Novo Usuário */}
                {inviteRole !== "admin" && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                      Módulos com Acesso Liberado:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {availableCompanyModules.map((mod) => (
                        <label
                          key={mod.key}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                            inviteModules[mod.key]
                              ? "bg-primary/5 border-primary/30 text-gray-900"
                              : "bg-slate-50 border-gray-200 text-gray-400"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(inviteModules[mod.key])}
                            onChange={(e) =>
                              setInviteModules((prev) => ({
                                ...prev,
                                [mod.key]: e.target.checked,
                              }))
                            }
                            className="rounded text-primary focus:ring-primary"
                          />
                          <span>{mod.icon}</span>
                          <span className="font-semibold">{mod.shortLabel}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 p-3.5 sm:p-4 border-t border-gray-100 bg-gray-50/90 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors border border-gray-200 sm:border-transparent rounded-xl text-center cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto px-5 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer text-center"
                >
                  {submitting ? "Processando..." : "Conceder Acesso"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
