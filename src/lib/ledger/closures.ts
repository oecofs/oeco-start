import { SupabaseClient } from "@supabase/supabase-js";

export type AccountLedgerItem = {
  id: string;
  name: string;
  initialBalance: number;
  openingBalance: number;
  monthMovement: number;
  currentBalance: number;
  isMonthReconciled: boolean;
  hasHistoricalPendency: boolean;
  pendingCount: number;
  pendingMonths: string[];
};

/**
 * Calcula o mês anterior no formato YYYY-MM
 */
export function getPreviousMonth(monthRef: string): string {
  const [yearStr, monthStr] = monthRef.split("-");
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Obtém o estado consolidado do Ledger para todas as contas bancárias no mês selecionado.
 * Lê o saldo findo do mês anterior (quando disponível e conciliado) e agrega com o mês atual.
 */
export async function getCompanyAccountLedgerState(
  supabase: SupabaseClient,
  companyId: string,
  selectedMonth: string
): Promise<AccountLedgerItem[]> {
  // 1. Busca contas bancárias ativas
  const { data: accounts, error: accError } = await supabase
    .from("bank_accounts")
    .select("id, name, initial_balance, initial_balance_date, is_active")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name");

  if (accError || !accounts || accounts.length === 0) {
    return [];
  }

  // 2. Busca fechamentos mensais anteriores existentes (até o mês anterior ao selecionado)
  const prevMonth = getPreviousMonth(selectedMonth);
  const { data: closures } = await supabase
    .from("bank_account_monthly_closures")
    .select("*")
    .eq("company_id", companyId)
    .lte("month_ref", prevMonth)
    .order("month_ref", { ascending: false });

  const closuresList = closures || [];

  // Mapeia o fechamento mais recente para cada conta bancária
  const latestClosureByAccount = new Map<string, any>();
  for (const c of closuresList) {
    if (!latestClosureByAccount.has(c.bank_account_id)) {
      latestClosureByAccount.set(c.bank_account_id, c);
    }
  }

  // 3. Busca transações do mês atual e validação de pendências históricas
  // Busca em lotes com paginação completa
  let allHistoricalTrxs: Array<{
    amount: number;
    is_reconciled: boolean;
    is_internal_transfer: boolean;
    bank_account_id: string | null;
    month_ref: string;
  }> = [];

  const step = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("transactions")
      .select("amount, is_reconciled, is_internal_transfer, bank_account_id, month_ref")
      .eq("company_id", companyId)
      .lte("month_ref", selectedMonth)
      .range(from, from + step - 1);

    if (error || !data || data.length === 0) {
      hasMore = false;
      break;
    }

    allHistoricalTrxs = allHistoricalTrxs.concat(data as any);
    if (data.length < step) {
      hasMore = false;
    } else {
      from += step;
    }
  }

  // 4. Constrói o saldo de cada conta combinando Ledger + Movimentações
  return accounts.map((acc) => {
    const accTrxs = allHistoricalTrxs.filter((t) => t.bank_account_id === acc.id);
    
    // Transações do mês selecionado
    const currentMonthTrxs = accTrxs.filter((t) => t.month_ref === selectedMonth);
    const monthMovement = currentMonthTrxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);

    // Pendências (exclui transferências internas)
    const pendingHistorical = accTrxs.filter(
      (t) => !t.is_reconciled && !t.is_internal_transfer
    );
    const pendingMonths = [...new Set(pendingHistorical.map((t) => t.month_ref))].sort();

    const pendingCurrentMonth = currentMonthTrxs.filter(
      (t) => !t.is_reconciled && !t.is_internal_transfer
    );

    // Determina o Saldo Inicial de Abertura (Opening Balance)
    let openingBalance = Number(acc.initial_balance || 0);
    const closure = latestClosureByAccount.get(acc.id);

    if (closure && closure.closing_balance !== undefined) {
      // Se tiver fechamento do mês anterior, o saldo de abertura é o saldo findo
      if (closure.month_ref === prevMonth) {
        openingBalance = Number(closure.closing_balance);
      } else {
        // Se o fechamento for de meses anteriores, soma as movimentações entre o fechamento e o mês atual
        const interimTrxs = accTrxs.filter(
          (t) => t.month_ref > closure.month_ref && t.month_ref < selectedMonth
        );
        const interimSum = interimTrxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
        openingBalance = Number(closure.closing_balance) + interimSum;
      }
    } else {
      // Se ainda não houver fechamento gravado, computa o histórico até o mês anterior
      const pastTrxs = accTrxs.filter((t) => t.month_ref < selectedMonth);
      const pastSum = pastTrxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
      openingBalance = Number(acc.initial_balance || 0) + pastSum;
    }

    const currentBalance = openingBalance + monthMovement;

    return {
      id: acc.id,
      name: acc.name,
      initialBalance: Number(acc.initial_balance || 0),
      openingBalance,
      monthMovement,
      currentBalance,
      isMonthReconciled: pendingCurrentMonth.length === 0,
      hasHistoricalPendency: pendingHistorical.length > 0,
      pendingCount: pendingHistorical.length,
      pendingMonths,
    };
  });
}

/**
 * Grava ou atualiza os fechamentos mensais de todas as contas da empresa para um mês específico
 */
export async function computeAndSaveMonthlyClosures(
  supabase: SupabaseClient,
  companyId: string,
  monthRef: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Busca contas bancárias
    const { data: accounts } = await supabase
      .from("bank_accounts")
      .select("id, name, initial_balance")
      .eq("company_id", companyId)
      .eq("is_active", true);

    if (!accounts || accounts.length === 0) {
      return { success: true, count: 0 };
    }

    // 2. Busca transações do mês e anteriores
    const ledgerState = await getCompanyAccountLedgerState(supabase, companyId, monthRef);

    const closuresToUpsert = [];

    for (const accState of ledgerState) {
      const { data: monthTrxs } = await supabase
        .from("transactions")
        .select("amount, is_reconciled, is_internal_transfer")
        .eq("company_id", companyId)
        .eq("bank_account_id", accState.id)
        .eq("month_ref", monthRef);

      const trxs = monthTrxs || [];
      const income = trxs
        .filter((t) => Number(t.amount) > 0)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const expense = trxs
        .filter((t) => Number(t.amount) < 0)
        .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
      const net = trxs.reduce((sum, t) => sum + Number(t.amount), 0);

      const isFullyReconciled = trxs.every(
        (t) => t.is_reconciled || t.is_internal_transfer
      );

      closuresToUpsert.push({
        company_id: companyId,
        bank_account_id: accState.id,
        month_ref: monthRef,
        opening_balance: accState.openingBalance,
        total_income: income,
        total_expense: expense,
        net_change: net,
        closing_balance: accState.openingBalance + net,
        is_fully_reconciled: isFullyReconciled,
        transaction_count: trxs.length,
        closed_at: new Date().toISOString(),
        user_id: user?.id || null,
      });
    }

    if (closuresToUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from("bank_account_monthly_closures")
        .upsert(closuresToUpsert, {
          onConflict: "company_id,bank_account_id,month_ref",
        });

      if (upsertError) {
        console.error("Erro ao salvar fechamentos mensais:", upsertError);
        return { success: false, count: 0, error: upsertError.message };
      }
    }

    return { success: true, count: closuresToUpsert.length };
  } catch (err: any) {
    console.error("Erro inesperado no fechamento mensal:", err);
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}
