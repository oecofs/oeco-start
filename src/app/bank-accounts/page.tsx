"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import Navigation from "@/components/Navigation";

type BankAccount = {
  id: string;
  name: string;
  bank_name: string | null;
  agency: string | null;
  account_number: string | null;
  initial_balance: number;
  initial_balance_date: string;
  is_active: boolean;
  created_at: string;
};

type FormData = {
  name: string;
  bank_name: string;
  agency: string;
  account_number: string;
  initial_balance: string;
  initial_balance_date: string;
};

export default function BankAccountsPage() {
  const supabase = createClient();
  const { selectedCompany } = useCompany();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const emptyForm: FormData = {
    name: "",
    bank_name: "",
    agency: "",
    account_number: "",
    initial_balance: "0,00",
    initial_balance_date: new Date().toISOString().split("T")[0],
  };
  const [formData, setFormData] = useState<FormData>(emptyForm);

  const fetchAccounts = useCallback(async () => {
    if (!selectedCompany) {
      setAccounts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("company_id", selectedCompany.id)
      .order("created_at", { ascending: true });

    if (error) {
      setError("Erro ao carregar contas.");
    } else {
      setAccounts(data || []);
    }
    setLoading(false);
  }, [supabase, selectedCompany]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  function handleNew() {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  function handleEdit(account: BankAccount) {
    setEditingId(account.id);
    setFormData({
      name: account.name,
      bank_name: account.bank_name || "",
      agency: account.agency || "",
      account_number: account.account_number || "",
      initial_balance: String(account.initial_balance).replace(".", ","),
      initial_balance_date: account.initial_balance_date,
    });
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!formData.name.trim()) {
      setError("O nome da conta é obrigatório.");
      return;
    }

    if (!selectedCompany) {
      setError("Nenhuma empresa selecionada.");
      return;
    }

    const amountStr = formData.initial_balance.replace(/\./g, "").replace(",", ".");
    const amount = Number(amountStr) || 0;

    const payload: any = {
      name: formData.name.trim(),
      bank_name: formData.bank_name.trim() || null,
      agency: formData.agency.trim() || null,
      account_number: formData.account_number.trim() || null,
      initial_balance: amount,
      initial_balance_date: formData.initial_balance_date,
      is_active: true,
      company_id: selectedCompany.id,
    };

    if (editingId) {
      const { error } = await supabase
        .from("bank_accounts")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        setError("Erro ao atualizar conta.");
        return;
      }
      setSuccess("Conta atualizada com sucesso!");
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("bank_accounts").insert({
        ...payload,
        user_id: user?.id,
      });

      if (error) {
        setError("Erro ao criar conta.");
        return;
      }
      setSuccess("Conta criada com sucesso!");
    }

    setShowForm(false);
    fetchAccounts();
  }

  async function handleToggleActive(account: BankAccount) {
    await supabase
      .from("bank_accounts")
      .update({ is_active: !account.is_active })
      .eq("id", account.id);
    fetchAccounts();
  }

  async function handleDelete(account: BankAccount) {
    if (!confirm(`Excluir a conta "${account.name}"? As transações vinculadas ficarão sem conta.`)) return;
    await supabase.from("bank_accounts").delete().eq("id", account.id);
    setSuccess("Conta excluída.");
    fetchAccounts();
  }

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  }

  return (
    <Navigation>
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600 hover:text-primary bg-slate-100 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              <span>←</span> Configurações
            </Link>
            <h1 className="text-2xl font-bold text-gray-800">Contas Bancárias</h1>
          </div>
          <button
            onClick={handleNew}
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors whitespace-nowrap"
          >
            + Nova conta
          </button>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            {success}
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400">Carregando contas...</p>
          </div>
        )}

        {!loading && accounts.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <span className="text-4xl">🏦</span>
            <p className="text-gray-500 mt-3 mb-1">Nenhuma conta cadastrada</p>
            <p className="text-sm text-gray-400 mb-4">
              Cadastre suas contas bancárias para separar extratos e acompanhar saldos
            </p>
            <button
              onClick={handleNew}
              className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
            >
              + Criar conta
            </button>
          </div>
        )}

        {!loading && accounts.length > 0 && (
          <div className="space-y-2">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className={`bg-white rounded-xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-2 ${
                  acc.is_active ? "border-gray-200" : "border-gray-200 opacity-50"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-800">{acc.name}</span>
                    {!acc.is_active && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        Inativa
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{acc.bank_name || "—"}</span>
                    {acc.agency && <span>Ag: {acc.agency}</span>}
                    {acc.account_number && <span>CC: {acc.account_number}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    <span className="text-gray-400">
                      Saldo inicial: {formatCurrency(Number(acc.initial_balance))}
                    </span>
                    <span className="text-gray-400">
                      Data: {formatDate(acc.initial_balance_date)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleEdit(acc)}
                    className="text-xs text-gray-500 hover:bg-gray-100 px-2 py-1 rounded"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleToggleActive(acc)}
                    className="text-xs text-orange-500 hover:bg-orange-50 px-2 py-1 rounded whitespace-nowrap"
                  >
                    {acc.is_active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    onClick={() => handleDelete(acc)}
                    className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4 overflow-hidden backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl border border-gray-150 flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Fixo */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white shrink-0">
              <h3 className="text-base font-bold text-gray-800">
                {editingId ? "Editar Conta Bancária" : "Nova Conta Bancária"}
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold p-1.5 -mr-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
              {/* Body Rolável */}
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain flex-1">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Nome da conta *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2.5 sm:py-2 text-sm sm:text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Ex: Bradesco Principal"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Banco
                  </label>
                  <input
                    type="text"
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    className="w-full px-3 py-2.5 sm:py-2 text-sm sm:text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Ex: Bradesco, Itaú, Nubank..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Agência
                    </label>
                    <input
                      type="text"
                      value={formData.agency}
                      onChange={(e) => setFormData({ ...formData, agency: e.target.value })}
                      className="w-full px-3 py-2.5 sm:py-2 text-sm sm:text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Ex: 1234"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Conta corrente
                    </label>
                    <input
                      type="text"
                      value={formData.account_number}
                      onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                      className="w-full px-3 py-2.5 sm:py-2 text-sm sm:text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Ex: 12345-6"
                    />
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3.5 space-y-3 border border-gray-200">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Saldo inicial (R$)
                    </label>
                    <input
                      type="text"
                      value={formData.initial_balance}
                      onChange={(e) => setFormData({ ...formData, initial_balance: e.target.value })}
                      className="w-full px-3 py-2.5 sm:py-2 text-sm sm:text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white font-mono"
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Data do saldo inicial
                    </label>
                    <input
                      type="date"
                      value={formData.initial_balance_date}
                      onChange={(e) => setFormData({ ...formData, initial_balance_date: e.target.value })}
                      className="w-full px-3 py-2.5 sm:py-2 text-sm sm:text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Footer Fixo */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 p-3.5 sm:p-4 border-t border-gray-100 bg-gray-50/90 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="w-full sm:w-auto px-4 py-2.5 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors text-xs text-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-dark transition-colors shadow-xs text-center"
                >
                  {editingId ? "Salvar Alterações" : "Criar Conta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Navigation>
  );
}
