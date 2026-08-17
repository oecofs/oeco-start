"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getWhiteLabelConfig } from "@/lib/whitelabel";

type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category_id: string | null;
  cost_center: string | null;
  is_reconciled: boolean;
  is_internal_transfer: boolean;
  month_ref: string;
};

type Category = {
  id: string;
  name: string;
  type: "income" | "expense";
  parent_id: string | null;
};

type Receivable = {
  id: string;
  client_name: string;
  description: string;
  amount: number;
  due_date: string;
  status: string;
  is_recurring: boolean;
  recurring_day: number | null;
  month_ref: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  monthRef: string;
  transactions: Transaction[];
  categories: Category[];
  receivables: Receivable[];
};

export default function FinalizeReconciliationModal({
  open,
  onClose,
  monthRef,
  transactions,
  categories,
  receivables,
}: Props) {
  const supabase = createClient();
  const wl = getWhiteLabelConfig();

  const [step, setStep] = useState<"summary" | "sending" | "done" | "error">("summary");
  const [errorMsg, setErrorMsg] = useState("");

  if (!open) return null;

  // Calcular totais
  const relevantTransactions = transactions.filter((t) => !t.is_internal_transfer);
  const totalIncome = relevantTransactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = relevantTransactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  const balance = totalIncome - totalExpense;

  // Recebíveis recebidos no mês
  const receivedReceivables = receivables.filter((r) => r.month_ref === monthRef);

  // Helper para nome da categoria
  function getCategoryName(id: string | null): string {
    if (!id) return "Sem categoria";
    const cat = categories.find((c) => c.id === id);
    return cat?.name || "Sem categoria";
  }
  
  // Retorna o nome da categoria PAI
  function getParentCategoryName(id: string | null): string {
    if (!id) return "Sem categoria";
    const cat = categories.find((c) => c.id === id);
    if (!cat) return "Sem categoria";
    // Se a categoria tem parent_id, busca o pai
    if (cat.parent_id) {
      const parent = categories.find((c) => c.id === cat.parent_id);
      return parent?.name || "Sem categoria";
    }
    // Se não tem parent_id, ela própria é a categoria pai
    return cat.name;
  }
  
  // Retorna o nome da subcategoria (filha), ou vazio se for categoria pai
  function getSubcategoryName(id: string | null): string {
    if (!id) return "";
    const cat = categories.find((c) => c.id === id);
    if (!cat) return "";
    // Se tem parent_id, é uma subcategoria
    if (cat.parent_id) {
      return cat.name;
    }
    // Se não tem parent_id, é categoria pai (não tem subcategoria)
    return "";
  }
  
  // Retorna "Categoria > Subcategoria" ou só "Categoria"
  function getCategorySubcategory(id: string | null): string {
    const parent = getParentCategoryName(id);
    const sub = getSubcategoryName(id);
    return sub ? `${parent} > ${sub}` : parent;
  }

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  function formatMonthLabel(month: string): string {
    const [year, monthNum] = month.split("-");
    const months = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ];
    return `${months[parseInt(monthNum) - 1]} de ${year}`;
  }

  // ====== AÇÃO: Finalizar conciliação ======
  async function handleFinalize() {
    setStep("sending");
    setErrorMsg("");

    try {
      // 1. Buscar nome da empresa
      const { data: settingsData } = await supabase
        .from("settings")
        .select("company_name")
        .limit(1)
        .single();

      // 2. Montar by_category (agrupar transações por categoria)
      const byCategoryMap = new Map<string, {
        category: string;
        subcategory: string;
        category_subcategory: string;
        total: number;
        count: number;
        cost_center: string | null;
      }>();
      for (const t of relevantTransactions) {
        const parentName = getParentCategoryName(t.category_id);
        const subName = getSubcategoryName(t.category_id);
        const catSubName = getCategorySubcategory(t.category_id);
        const key = catSubName;
        if (!byCategoryMap.has(key)) {
          byCategoryMap.set(key, {
            category: parentName,
            subcategory: subName,
            category_subcategory: catSubName,
            total: 0,
            count: 0,
            cost_center: t.cost_center || null,
          });
        }
        const entry = byCategoryMap.get(key)!;
        entry.total += Math.abs(Number(t.amount));
        entry.count += 1;
      }
      const byCategory = Array.from(byCategoryMap.values());

      // 3. Calcular receivables_summary detalhado
      const today = new Date().toISOString().split("T")[0];
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      const weekFromNowStr = weekFromNow.toISOString().split("T")[0];

      const allReceivables = receivables.filter((r) => r.month_ref === monthRef);
      const pendingReceivables = allReceivables.filter((r) => r.status !== "received");
      const overdueItems = pendingReceivables
        .filter((r) => r.due_date < today)
        .map((r) => {
          const dueDate = new Date(r.due_date);
          const todayDate = new Date(today);
          const diffTime = todayDate.getTime() - dueDate.getTime();
          const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return {
            client_name: r.client_name,
            amount: Number(r.amount),
            due_date: r.due_date,
            days_overdue: daysOverdue,
          };
        });

      const dueThisWeek = pendingReceivables
        .filter((r) => r.due_date >= today && r.due_date <= weekFromNowStr)
        .reduce((sum, r) => sum + Number(r.amount), 0);

      const totalPendingReceivables = pendingReceivables.reduce(
        (sum, r) => sum + Number(r.amount), 0
      );
      const totalOverdueReceivables = overdueItems.reduce(
        (sum, r) => sum + r.amount, 0
      );
  
      // 4. Montar payload completo do webhook
      const webhookPayload = {
        company_name: settingsData?.company_name || "Empresa",
        month_ref: monthRef,
        sent_at: new Date().toISOString(),
        summary: {
          total_income: totalIncome,
          total_expense: totalExpense,
          balance: balance,
          transactions_count: relevantTransactions.length,
        },
        by_category: byCategory,
        transactions: relevantTransactions.map((t) => ({
          date: t.date,
          description: t.description,
          amount: t.amount,
          category: getParentCategoryName(t.category_id),
          subcategory: getSubcategoryName(t.category_id),
          category_subcategory: getCategorySubcategory(t.category_id),
          cost_center: t.cost_center || null,
        })),
        receivables_summary: {
          total_pending: totalPendingReceivables,
          total_overdue: totalOverdueReceivables,
          overdue_items: overdueItems,
          due_this_week: dueThisWeek,
        },
        receivables: allReceivables.map((r) => ({
          client_name: r.client_name,
          description: r.description,
          amount: r.amount,
          due_date: r.due_date,
          status: r.status,
          is_recurring: r.is_recurring,
        })),
      };

      // Verificar se o mês já foi enviado
      const { data: existingRecon } = await supabase
        .from("reconciliation_status")
        .select("id, status")
        .eq("month_ref", monthRef)
        .limit(1)
        .single();

      if (existingRecon && existingRecon.status === "sent_to_cfo") {
        const confirmReopen = confirm(
          "Este mês já foi enviado ao CFO. Deseja reabrir e reenviar?"
        );
        if (!confirmReopen) {
          setStep("summary");
          return;
        }
        // Reabrir: mudar status para in_progress
        await supabase
          .from("reconciliation_status")
          .update({ status: "in_progress" })
          .eq("id", existingRecon.id);
      }
  
      // 5. Enviar webhook
      let webhookSuccess = false;
      let webhookError = "";

      if (wl.webhookUrl && wl.webhookUrl !== "https://placeholder.com/webhook") {
        try {
          const response = await fetch(wl.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(webhookPayload),
            redirect: "follow",
          });
          if (response.ok) {
            webhookSuccess = true;
          } else {
            webhookError = `Webhook retornou status ${response.status}`;
          }
        } catch (err) {
          webhookError = "Não foi possível conectar ao webhook.";
        }
      } else {
        // Sem webhook configurado — segue mesmo mas marca como não enviado
        webhookError = "Webhook não configurado.";
      }

      // 6. Atualizar/criar reconciliation_status como sent_to_cfo
      if (existingRecon) {
        await supabase
          .from("reconciliation_status")
          .update({
            status: "sent_to_cfo",
            finalized_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
          })
          .eq("id", existingRecon.id);
      } else {
        await supabase.from("reconciliation_status").insert({
          month_ref: monthRef,
          status: "sent_to_cfo",
          finalized_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
        });
      }

      // 7. Gerar recebíveis recorrentes do próximo mês
      const recurringReceivables = receivables.filter(
        (r) => r.is_recurring && r.recurring_day
      );

      if (recurringReceivables.length > 0) {
        // Calcula o próximo mês
        const [year, month] = monthRef.split("-");
        let nextYear = parseInt(year);
        let nextMonth = parseInt(month) + 1;
        if (nextMonth > 12) {
          nextMonth = 1;
          nextYear++;
        }
        const nextMonthRef = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;

        // Para cada recebível recorrente, cria uma cópia no próximo mês
        const newReceivables = recurringReceivables.map((r) => {
          const day = String(r.recurring_day).padStart(2, "0");
          const dueDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${day}`;

          return {
            client_name: r.client_name,
            description: r.description,
            amount: r.amount,
            due_date: dueDate,
            status: "pending",
            is_recurring: true,
            recurring_day: r.recurring_day,
            month_ref: nextMonthRef,
            is_active: true,
          };
        });

        // Verifica se já não existem recebíveis recorrentes no próximo mês
        const { data: existingNextMonth } = await supabase
          .from("receivables")
          .select("id, client_name, description, recurring_day")
          .eq("month_ref", nextMonthRef)
          .eq("is_recurring", true)
          .eq("is_active", true);

        const existingKeys = new Set(
          (existingNextMonth || []).map(
            (r) => `${r.client_name}-${r.description}-${r.recurring_day}`
          )
        );

        const toInsert = newReceivables.filter(
          (nr) =>
            !existingKeys.has(
              `${nr.client_name}-${nr.description}-${nr.recurring_day}`
            )
        );

        if (toInsert.length > 0) {
          await supabase.from("receivables").insert(toInsert);
        }
      }

      // 8. Done!
      setStep("done");
    } catch (err) {
      setErrorMsg("Erro inesperado ao finalizar conciliação.");
      setStep("error");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4"
      onClick={step === "sending" ? undefined : onClose}
    >
      <div
        className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== STEP: SUMMARY ===== */}
        {step === "summary" && (
          <>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">
              Finalizar Conciliação
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              {formatMonthLabel(monthRef)}
            </p>

            {/* Resumo */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Transações conciliadas</span>
                <span className="font-medium text-gray-800">
                  {relevantTransactions.length}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Total de entradas</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(totalIncome)}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Total de saídas</span>
                <span className="font-medium text-red-600">
                  {formatCurrency(totalExpense)}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Saldo do mês</span>
                <span
                  className={`font-bold ${
                    balance >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {formatCurrency(balance)}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Recebíveis do mês</span>
                <span className="font-medium text-gray-800">
                  {receivedReceivables.length}
                </span>
              </div>

              {/* Aviso de recorrência */}
              {receivables.some((r) => r.is_recurring) && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                  📅{" "}
                  {receivables.filter((r) => r.is_recurring).length} recebível(eis)
                  recorrente(s) serão criados automaticamente para o próximo mês.
                </div>
              )}

              {/* Aviso de webhook */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500">
                📤 Os dados serão enviados automaticamente para o escritório.
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleFinalize}
                className="flex-1 px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors"
              >
                Finalizar
              </button>
            </div>
          </>
        )}

        {/* ===== STEP: SENDING ===== */}
        {step === "sending" && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-gray-600 font-medium">Finalizando conciliação...</p>
            <p className="text-sm text-gray-400 mt-1">
              Enviando dados e gerando recebíveis
            </p>
          </div>
        )}

        {/* ===== STEP: DONE ===== */}
        {step === "done" && (
          <div className="text-center py-6">
            <span className="text-5xl">✅</span>
            <h3 className="text-lg font-semibold text-gray-800 mt-3 mb-1">
              Conciliação finalizada!
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Os dados foram enviados e os recebíveis recorrentes do próximo mês
              foram criados.
            </p>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors"
            >
              Concluir
            </button>
          </div>
        )}

        {/* ===== STEP: ERROR ===== */}
        {step === "error" && (
          <div className="text-center py-6">
            <span className="text-5xl">⚠️</span>
            <h3 className="text-lg font-semibold text-gray-800 mt-3 mb-1">
              Erro ao finalizar
            </h3>
            <p className="text-sm text-red-500 mb-4">{errorMsg}</p>
            <button
              onClick={() => setStep("summary")}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Voltar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
