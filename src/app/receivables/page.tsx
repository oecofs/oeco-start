"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Navigation from "@/components/Navigation";
import MonthSelector from "@/components/MonthSelector";

type Receivable = {
  id: string;
  client_name: string;
  description: string;
  nf_number: string | null;
  amount: number;
  received_amount: number;
  due_date: string;
  status: "open" | "partial" | "received" | "overdue";
  is_recurring: boolean;
  recurring_day: number | null;
  received_at: string | null;
  linked_transaction_id: string | null;
  month_ref: string;
  is_active: boolean;
};

type FormData = {
  client_name: string;
  nf_number: string;
  description: string;
  amount: string;
  due_date: string;
  is_recurring: boolean;
  recurring_day: string;
};

export default function ReceivablesPage() {
  const supabase = createClient();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "overdue" | "received">("all");
  const [success, setSuccess] = useState("");

  const emptyForm: FormData = {
    client_name: "",
    nf_number: "",
    description: "",
    amount: "",
    due_date: "",
    is_recurring: false,
    recurring_day: "",
  };

  const [formData, setFormData] = useState<FormData>(emptyForm);

  // Fetch receivables for selected month
  const fetchReceivables = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("receivables")
      .select("*")
      .eq("month_ref", selectedMonth)
      .eq("is_active", true)
      .order("due_date", { ascending: true });

    if (error) {
      setError("Erro ao carregar recebíveis.");
    } else {
      // Atualiza status de vencidos
      const today = new Date().toISOString().split("T")[0];
      const updated = (data || []).map((r) => {
        // Migra status antigo "pending" para "open"
        let status: Receivable["status"] = (r.status === "pending" ? "open" : r.status) as Receivable["status"];
        if ((status === "open" || status === "partial") && r.due_date < today && r.status !== "received") {
          status = "overdue";
        }
        return { ...r, status, received_amount: r.received_amount || 0 };
      });
      setReceivables(updated);
    }
    setLoading(false);
  }, [supabase, selectedMonth]);

  useEffect(() => {
    fetchReceivables();
  }, [fetchReceivables]);

  // Open form for new
  function handleNew() {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  // Open form for editing
  function handleEdit(receivable: Receivable) {
    setEditingId(receivable.id);
    setFormData({
      client_name: receivable.client_name,
      nf_number: receivable.nf_number || "",
      description: receivable.description,
      amount: String(receivable.amount),
      due_date: receivable.due_date,
      is_recurring: receivable.is_recurring,
      recurring_day: receivable.recurring_day ? String(receivable.recurring_day) : "",
    });
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  // Save (create or update)
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!formData.client_name.trim()) {
      setError("O nome do cliente é obrigatório.");
      return;
    }
    if (!formData.description.trim()) {
      setError("A descrição é obrigatória.");
      return;
    }
    if (!formData.amount || isNaN(Number(formData.amount))) {
      setError("O valor é obrigatório.");
      return;
    }
    if (!formData.is_recurring && !formData.due_date) {
      setError("A data de vencimento é obrigatória (ou marque como recorrente).");
      return;
    }

    const amount = Number(formData.amount);
    let dueDate = formData.due_date;
    let monthRef = selectedMonth;

    // Se for recorrente e tiver dia definido, calcula a data do mês
    if (formData.is_recurring && formData.recurring_day) {
      const [year, month] = selectedMonth.split("-");
      const day = String(formData.recurring_day).padStart(2, "0");
      dueDate = `${year}-${month}-${day}`;
      monthRef = selectedMonth;
    } else if (dueDate) {
      monthRef = dueDate.substring(0, 7);
    }

    const payload = {
      client_name: formData.client_name.trim(),
      nf_number: formData.nf_number.trim() || null,
      description: formData.description.trim(),
      amount,
      due_date: dueDate,
      status: editingId ? undefined : "open",
      is_recurring: formData.is_recurring,
      recurring_day: formData.is_recurring && formData.recurring_day ? parseInt(formData.recurring_day) : null,
      month_ref: monthRef,
      is_active: true,
    };

    if (editingId) {
      const { error } = await supabase
        .from("receivables")
        .update(payload)
        .eq("id", editingId);

      if (error) {
        setError("Erro ao atualizar recebível.");
        return;
      }
      setSuccess("Recebível atualizado com sucesso!");
    } else {
      const { error } = await supabase.from("receivables").insert(payload);

      if (error) {
        setError("Erro ao criar recebível.");
        return;
      }
      setSuccess("Recebível criado com sucesso!");
    }

    setShowForm(false);
    fetchReceivables();
  }

  // Mark as received
  async function handleMarkReceived(receivable: Receivable) {
    const today = new Date().toISOString().split("T")[0];
    const { error } = await supabase
      .from("receivables")
      .update({
        status: "received",
        received_amount: receivable.amount,
        received_at: today,
      })
      .eq("id", receivable.id);
    if (error) {
      setError("Erro ao marcar como recebido.");
      return;
    }
    setSuccess("Recebível marcado como recebido!");
    fetchReceivables();
  }

  // Mark as pending again (undo)
  async function handleMarkPending(receivable: Receivable) {
    const { error } = await supabase
      .from("receivables")
      .update({
        status: "open",
        received_amount: 0,
        received_at: null,
      })
      .eq("id", receivable.id);
    if (error) {
      setError("Erro ao atualizar status.");
      return;
    }
    fetchReceivables();
  }

  // Stop recurrence
  async function handleStopRecurrence(receivable: Receivable) {
    if (!confirm(`Parar a recorrência de "${receivable.description}"? Este recebível não será gerado nos próximos meses.`)) return;

    const { error } = await supabase
      .from("receivables")
      .update({ is_active: false })
      .eq("id", receivable.id);

    if (error) {
      setError("Erro ao parar recorrência.");
      return;
    }

    setSuccess("Recorrência parada. Este recebível não será mais gerado automaticamente.");
    fetchReceivables();
  }
  
  // Delete
  async function handleDelete(receivable: Receivable) {
    if (!confirm(`Excluir o recebível "${receivable.description}"?`)) return;

    const { error } = await supabase
      .from("receivables")
      .update({ is_active: false })
      .eq("id", receivable.id);

    if (error) {
      setError("Erro ao excluir recebível.");
      return;
    }

    setSuccess("Recebível excluído.");
    fetchReceivables();
  }

  // Helpers
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

  // Summary
    // Aplicar filtro
  const filteredReceivables = receivables.filter((r) => {
    if (filter === "all") return true;
    if (filter === "pending") return r.status === "open";
    if (filter === "overdue") return r.status === "overdue";
    if (filter === "received") return r.status === "received" || r.status === "partial";
    return true;
  });
  const totalPending = receivables
    .filter((r) => r.status !== "received")
    .reduce((sum, r) => sum + Number(r.amount) - Number(r.received_amount || 0), 0);
  const totalReceived = receivables
    .reduce((sum, r) => sum + Number(r.received_amount || 0), 0);
  const overdueCount = receivables.filter((r) => r.status === "overdue").length;

  return (
    <Navigation>
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Recebíveis</h1>
          <div className="flex gap-2">
            <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
            <button
              onClick={handleNew}
              className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors whitespace-nowrap"
            >
              + Novo
            </button>
          </div>
        </div>

        {/* Messages */}
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

        {/* Summary cards */}
        {!loading && receivables.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
              <p className="text-xs text-gray-400 mb-1">A receber</p>
              <p className="text-lg md:text-xl font-bold text-gray-800">
                {formatCurrency(totalPending)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
              <p className="text-xs text-gray-400 mb-1">Recebido</p>
              <p className="text-lg md:text-xl font-bold text-green-600">
                {formatCurrency(totalReceived)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
              <p className="text-xs text-gray-400 mb-1">Vencidos</p>
              <p className={`text-lg md:text-xl font-bold ${overdueCount > 0 ? "text-red-600" : "text-gray-400"}`}>
                {overdueCount}
              </p>
            </div>
          </div>
        )}
        {/* Filtros */}
        {!loading && receivables.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {([
              { key: "all", label: "Todos" },
              { key: "pending", label: "Pendentes" },
              { key: "overdue", label: "Em atraso" },
              { key: "received", label: "Recebidos" },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  filter === f.key
                    ? "bg-primary text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
        
        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400">Carregando recebíveis...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && receivables.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <span className="text-4xl">💰</span>
            <p className="text-gray-500 mt-3 mb-1">Nenhum recebível neste mês</p>
            <p className="text-sm text-gray-400 mb-4">
              Cadastre contas a receber para acompanhar o fluxo de caixa
            </p>
            <button
              onClick={handleNew}
              className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
            >
              + Criar recebível
            </button>
          </div>
        )}

        {/* Receivables list */}
        {!loading && receivables.length > 0 && (
          <div className="space-y-2">
            {filteredReceivables.map((r) => (
              <div
                key={r.id}
                className={`bg-white rounded-xl border p-3 md:p-4 flex flex-col md:flex-row md:items-center justify-between gap-2 ${
                  r.status === "received"
                    ? "border-green-200 opacity-60"
                    : r.status === "overdue"
                    ? "border-red-200"
                    : "border-gray-200"
                }`}
              >
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.nf_number && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                        NF {r.nf_number}
                      </span>
                    )}
                    <span className="font-medium text-gray-800 truncate">
                      {r.description}
                    </span>
                    {r.is_recurring && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                        ↻ Recorrente
                      </span>
                    )}
                    {r.status === "received" ? (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                        ✓ Recebido
                      </span>
                    ) : r.status === "partial" ? (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                        ⏳ Parcial
                      </span>
                    ) : r.status === "overdue" ? (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                        ⚠ Vencido
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                        Pendente
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{r.client_name}</span>
                    <span>Venc: {formatDate(r.due_date)}</span>
                    {r.received_at && (
                      <span className="text-green-500">
                        Recebido em {formatDate(r.received_at)}
                      </span>
                    )}
                  </div>
                  {(r.received_amount > 0 || r.status === "partial") && (
                    <div className="flex items-center gap-3 mt-1 text-xs">
                      <span className="text-gray-400">Valor: {formatCurrency(Number(r.amount))}</span>
                      <span className="text-green-600">Recebido: {formatCurrency(Number(r.received_amount || 0))}</span>
                      <span className="text-orange-600 font-medium">Saldo: {formatCurrency(Number(r.amount) - Number(r.received_amount || 0))}</span>
                    </div>
                  )}
                </div>

                {/* Amount + actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-gray-800 text-sm md:text-base whitespace-nowrap">
                    {r.status === "partial" 
                      ? formatCurrency(Number(r.amount) - Number(r.received_amount || 0))
                      : formatCurrency(Number(r.amount))}
                  </span>
                  {r.status === "partial" && (
                    <span className="text-xs text-gray-400 line-through">
                      {formatCurrency(Number(r.amount))}
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {r.status !== "received" && (
                      <button
                        onClick={() => handleMarkReceived(r)}
                        className="text-xs text-green-600 hover:bg-green-50 px-2 py-1 rounded whitespace-nowrap"
                      >
                        ✓ Receber
                      </button>
                    )}
                    {r.status === "received" && (
                      <button
                        onClick={() => handleMarkPending(r)}
                        className="text-xs text-gray-500 hover:bg-gray-100 px-2 py-1 rounded"
                      >
                        ↩ Reverter
                      </button>
                    )}
                    {r.is_recurring && r.status !== "received" && (
                      <button
                        onClick={() => handleStopRecurrence(r)}
                        className="text-xs text-orange-500 hover:bg-orange-50 px-2 py-1 rounded whitespace-nowrap"
                      >
                        ⏹ Parar recorrência
                      </button>
                    )}                    
                    <button
                      onClick={() => handleEdit(r)}
                      className="text-xs text-gray-500 hover:bg-gray-100 px-2 py-1 rounded"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal form */}
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
              {editingId ? "Editar recebível" : "Novo recebível"}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              {/* Cliente */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cliente
                </label>
                <input
                  type="text"
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Ex: Padaria São João"
                  autoFocus
                />
              </div>
              {/* Número da NF */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número da NF
                </label>
                <input
                  type="text"
                  value={formData.nf_number}
                  onChange={(e) => setFormData({ ...formData, nf_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Ex: 12"
                />
              </div>
              {/* Descrição */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Ex: Fornada de pães - Semana 1"
                />
              </div>

              {/* Valor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="0,00"
                />
              </div>

              {/* Recorrência */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_recurring}
                    onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Recebível recorrente
                  </span>
                </label>

                {formData.is_recurring ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dia do vencimento (todo mês)
                    </label>
                    <select
                      value={formData.recurring_day}
                      onChange={(e) => setFormData({ ...formData, recurring_day: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                    >
                      <option value="">Selecione o dia...</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <option key={day} value={day}>
                          Dia {day}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      O sistema criará este recebível automaticamente todo mês no dia selecionado.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data de vencimento
                    </label>
                    <input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Buttons */}
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
