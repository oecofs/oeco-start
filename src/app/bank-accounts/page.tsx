"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
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
    setLoading(true);
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      setError("Erro ao carregar contas.");
    } else {
      setAccounts(data || []);
    }
    setLoading(false);
  }, [supabase]);

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

    const amountStr = formData.initial_balance.replace(/\./g, "").replace(",", ".");
    const amount = Number(amountStr) || 0;

    const payload = {
      name: formData.name.trim(),
      bank_name: formData.bank_name.trim() || null,
      agency: formData.agency.trim() || null,
      account_number: formData.account_number.trim() || null,
      initial_balance: amount,
      initial_balance_date: formData.initial_balance_date,
      is_active: true,
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
      const { error } = await supabase.from("bank_accounts").insert(payload);
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
          <h1 className="text-2xl font-bold text-gray-800">Contas Bancárias</h1>
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
          className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-[60] p-0 md:p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-4 md:p-6 max-h-[95vh] overflow-y-auto pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {editingId ? "Editar conta" : "Nova conta"}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome da conta
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Ex: Bradesco Principal"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Banco
                </label>
                <input
                  type="text"
                  value={formData.bank_name}
                  onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Ex: Bradesco"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agência
                  </label>
                  <input
                    type="text"
                    value={formData.agency}
                    onChange={(e) => setFormData({ ...formData, agency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Ex: 1234"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Conta corrente
                  </label>
                  <input
                    type="text"
                    value={formData.account_number}
                    onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Ex: 12345-6"
                  />
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Saldo inicial (R$)
                  </label>
                  <input
                    type="text"
                    value={formData.initial_balance}
                    onChange={(e) => setFormData({ ...formData, initial_balance: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data do saldo inicial
                  </label>
                  <input
                    type="date"
                    value={formData.initial_balance_date}
                    onChange={(e) => setFormData({ ...formData, initial_balance_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors"
                >
                  {editingId ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Navigation>
  );
}
