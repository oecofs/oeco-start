"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { createClient } from "@/lib/supabase/client";

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
    description: "Acesso total à empresa: configurações, transações, conciliação e relatórios.",
  },
  {
    value: "operator",
    label: "Operador Financeiro",
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
    description: "Lança transações, faturas a receber, contas a pagar e importa extratos.",
  },
  {
    value: "viewer",
    label: "Visualizador (Leitura)",
    badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
    description: "Apenas visualização de relatórios, dashboards e extratos (sem permissão de edição).",
  },
  {
    value: "master",
    label: "Master OECO",
    badgeColor: "bg-amber-100 text-amber-800 border-amber-200",
    description: "Administrador global da plataforma OECO com acesso a todas as empresas.",
  },
];

export default function TeamManager() {
  const supabase = createClient();
  const { selectedCompany, isMaster } = useCompany();

  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal de Adicionar / Convidar Membro
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "operator" | "viewer">("operator");
  const [invitePassword, setInvitePassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Buscar membros da empresa ativa
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
        // Fallback direto em user_companies
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

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Membros visíveis (Masters são 100% invisíveis para clientes regulares)
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
        // Fallback update direto
        await supabase
          .from("user_companies")
          .update({ role: newRole })
          .eq("company_id", selectedCompany.id)
          .eq("user_id", userId);
      }

      setFeedback({ type: "success", message: "Permissão do usuário atualizada com sucesso!" });
      fetchMembers();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro ao atualizar permissão." });
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

  // Adicionar / Convidar membro
  async function handleInviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompany || !inviteEmail.trim()) return;

    setSubmitting(true);
    setFeedback(null);

    const emailClean = inviteEmail.trim().toLowerCase();

    try {
      // 1. Tenta vincular diretamente caso o usuário já exista no sistema
      const { data, error } = await supabase.rpc("add_company_member_by_email", {
        p_company_id: selectedCompany.id,
        p_email: emailClean,
        p_role: inviteRole,
      });

      if (!error && data?.success) {
        setFeedback({
          type: "success",
          message: `Usuário "${emailClean}" adicionado à empresa com sucesso!`,
        });
        setShowInviteModal(false);
        setInviteEmail("");
        setInvitePassword("");
        fetchMembers();
        return;
      }

      // 2. Se o usuário ainda não existe no sistema, enviamos o link seguro de convite/ativação
      const origin = window.location.origin;
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(emailClean, {
        redirectTo: `${origin}/auth/reset-password`,
      });

      if (resetErr) {
        setFeedback({
          type: "error",
          message:
            data?.message ||
            resetErr.message ||
            "Não foi possível vincular. O e-mail precisa criar uma conta primeiro ou confirme o endereço digitado.",
        });
      } else {
        setFeedback({
          type: "success",
          message: `Convite de acesso enviado para "${emailClean}". Assim que ele definir a senha pelo e-mail, o acesso estará ativo!`,
        });
        setShowInviteModal(false);
        setInviteEmail("");
        setInvitePassword("");
        fetchMembers();
      }
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
            <span>👥 Equipe & Acessos da Empresa</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
              {visibleMembers.length} membro(s)
            </span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Gerencie os usuários que têm permissão de acesso a <strong>{selectedCompany?.name}</strong>.
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
          <span>+</span>
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

      {/* Busca & Lista de Membros */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <input
            type="text"
            placeholder="🔍 Buscar membro por e-mail ou cargo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-80 px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400 text-xs">
            Carregando membros da equipe...
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-xs">
            Nenhum membro encontrado. Clique em "+ Adicionar Membro" para conceder acesso.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Usuário / E-mail</th>
                  <th className="py-3 px-3">Nível de Acesso</th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMembers.map((member) => {
                  const roleObj = ROLE_DEFINITIONS.find((r) => r.value === member.role);
                  return (
                    <tr key={member.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                            {member.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900 block">
                                {member.email}
                              </span>
                              {member.role === "master" && (
                                <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
                                  👻 Suporte Master (Invisível para o cliente)
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-400">
                              {member.created_at
                                ? `Adicionado em ${new Date(member.created_at).toLocaleDateString("pt-BR")}`
                                : "Acesso Ativo"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                              roleObj?.badgeColor || "bg-gray-100 text-gray-700 border-gray-200"
                            }`}
                          >
                            {roleObj?.label || member.role}
                          </span>

                          {/* Se for Master, pode alterar cargo de qualquer um (exceto outros masters) */}
                          {member.role !== "master" && (
                            <select
                              value={member.role}
                              onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                              className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-primary"
                              title="Alterar papel"
                            >
                              <option value="admin">Administrador</option>
                              <option value="operator">Operador</option>
                              <option value="viewer">Visualizador</option>
                            </select>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-right">
                        {member.role !== "master" && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member)}
                            className="text-red-600 hover:text-red-800 text-xs font-semibold px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            Revogar Acesso
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Convidar / Adicionar Membro */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Adicionar Membro à Equipe</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Conceda acesso a <strong>{selectedCompany?.name}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInviteMember} className="space-y-4">
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

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
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
