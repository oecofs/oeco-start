/**
 * Diagnóstico Financeiro Executivo & Smart Insights
 * Computa automaticamente indicadores de performance, margens, regra de Pareto (80/20),
 * variações atípicas e previsibilidade financeira com base EXCLUSIVAMENTE em dados 100% conciliados.
 */

import { TableRowData, ColumnDef, ReportTransaction, ReportCategory, formatBRL } from "./calculations";

export type ExecutiveDiagnostic = {
  totalIncome: number;
  totalExpense: number;
  netResult: number;
  operatingMarginPercent: number;
  avgMonthlyBurn: number;
  topExpenseCategories: Array<{
    name: string;
    amount: number;
    sharePercent: number;
  }>;
  paretoConcentrationPercent: number; // % das 3 maiores despesas no total
  volatileAlerts: Array<{
    name: string;
    changePercent: number;
    type: "increase" | "decrease";
    description: string;
  }>;
  summaryNarrative: string;
  reconciledCount: number;
  totalTransactionsCount: number;
};

export function computeExecutiveDiagnostic(
  rows: TableRowData[],
  columns: ColumnDef[],
  totalIncomeByCol: Record<string, number>,
  totalExpenseByCol: Record<string, number>,
  dimensionName: string
): ExecutiveDiagnostic {
  // 1. Somatório do período
  let sumIncome = 0;
  let sumExpense = 0;

  for (const col of columns) {
    sumIncome += totalIncomeByCol[col.key] || 0;
    sumExpense += totalExpenseByCol[col.key] || 0;
  }

  const netResult = sumIncome - sumExpense;
  const operatingMarginPercent = sumIncome > 0 ? (netResult / sumIncome) * 100 : 0;
  const numMonths = Math.max(1, columns.reduce((acc, c) => acc + c.monthRefs.length, 0));
  const avgMonthlyBurn = sumExpense / numMonths;

  // 2. Top Categorias de Despesa (Pareto)
  const expenseRows = rows.filter((r) => r.type === "expense" || !r.type);
  const rankedExpenses = expenseRows
    .map((r) => {
      const rowSum = columns.reduce((acc, col) => acc + (r.values[col.key] || 0), 0);
      return {
        name: r.name,
        amount: rowSum,
        sharePercent: sumExpense > 0 ? (rowSum / sumExpense) * 100 : 0,
      };
    })
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const top3 = rankedExpenses.slice(0, 3);
  const paretoConcentrationPercent = top3.reduce((acc, e) => acc + e.sharePercent, 0);

  // 3. Alertas de Volatilidade / Picos Atípicos
  const volatileAlerts: ExecutiveDiagnostic["volatileAlerts"] = [];

  if (columns.length >= 2) {
    const firstCol = columns[0].key;
    const lastCol = columns[columns.length - 1].key;

    for (const r of rows) {
      const vFirst = r.values[firstCol] || 0;
      const vLast = r.values[lastCol] || 0;

      if (vFirst > 200 && vLast > 200) {
        const diffPercent = ((vLast - vFirst) / vFirst) * 100;
        if (Math.abs(diffPercent) >= 30) {
          volatileAlerts.push({
            name: r.name,
            changePercent: diffPercent,
            type: diffPercent > 0 ? "increase" : "decrease",
            description:
              diffPercent > 0
                ? `Aumento de +${diffPercent.toFixed(1)}% (${formatBRL(vFirst)} → ${formatBRL(vLast)})`
                : `Redução de ${diffPercent.toFixed(1)}% (${formatBRL(vFirst)} → ${formatBRL(vLast)})`,
          });
        }
      }
    }
  }

  // 4. Síntese Executiva Narrativa
  const healthStatus =
    netResult > 0 && operatingMarginPercent >= 15
      ? "superavitário e saudável"
      : netResult > 0
      ? "positivo, com margem operacional equilibrada"
      : "deficitário no período analisado";

  let narrative = `No período avaliado, a operação registrou receita consolidada de ${formatBRL(
    sumIncome
  )} contra despesas de ${formatBRL(sumExpense)}, resultando em saldo líquido de ${formatBRL(
    netResult
  )} (Margem Operacional de ${operatingMarginPercent.toFixed(1)}%), caracterizando um cenário ${healthStatus}.`;

  if (top3.length > 0) {
    narrative += ` Os 3 maiores grupos de desembolso (${top3
      .map((t) => `${t.name}: ${t.sharePercent.toFixed(1)}%`)
      .join(", ")}) concentram ${paretoConcentrationPercent.toFixed(1)}% do custo total.`;
  }

  if (avgMonthlyBurn > 0) {
    narrative += ` A taxa média de queima operacional foi de ${formatBRL(avgMonthlyBurn)}/mês.`;
  }

  return {
    totalIncome: sumIncome,
    totalExpense: sumExpense,
    netResult,
    operatingMarginPercent,
    avgMonthlyBurn,
    topExpenseCategories: top3,
    paretoConcentrationPercent,
    volatileAlerts: volatileAlerts.slice(0, 4),
    summaryNarrative: narrative,
    reconciledCount: 0,
    totalTransactionsCount: 0,
  };
}

/**
 * Computa diagnóstico executivo especificamente para o Módulo de IA / Master,
 * filtrando ESTRITAMENTE apenas transações marcadas como 100% conciliadas.
 */
export function computeReconciledAiDiagnostic(
  transactions: ReportTransaction[],
  categories: ReportCategory[],
  targetMonths: string[]
): ExecutiveDiagnostic {
  const monthSet = new Set(targetMonths);
  const periodTransactions = transactions.filter((t) => monthSet.has(t.month_ref) && !t.is_internal_transfer);
  const reconciledTrxs = periodTransactions.filter((t) => t.is_reconciled);

  let sumIncome = 0;
  let sumExpense = 0;
  const expenseByCategory: Record<string, number> = {};

  const categoryMap = new Map<string, ReportCategory>();
  for (const c of categories) {
    categoryMap.set(c.id, c);
  }

  for (const t of reconciledTrxs) {
    const val = Number(t.amount);
    if (val > 0) {
      sumIncome += val;
    } else if (val < 0) {
      const absVal = Math.abs(val);
      sumExpense += absVal;

      let catName = "(Sem Categoria)";
      if (t.category_id && categoryMap.has(t.category_id)) {
        const cat = categoryMap.get(t.category_id)!;
        if (cat.parent_id && categoryMap.has(cat.parent_id)) {
          catName = categoryMap.get(cat.parent_id)!.name;
        } else {
          catName = cat.name;
        }
      }
      expenseByCategory[catName] = (expenseByCategory[catName] || 0) + absVal;
    }
  }

  const netResult = sumIncome - sumExpense;
  const operatingMarginPercent = sumIncome > 0 ? (netResult / sumIncome) * 100 : 0;
  const numMonths = Math.max(1, targetMonths.length);
  const avgMonthlyBurn = sumExpense / numMonths;

  const rankedExpenses = Object.entries(expenseByCategory)
    .map(([name, amount]) => ({
      name,
      amount,
      sharePercent: sumExpense > 0 ? (amount / sumExpense) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const top3 = rankedExpenses.slice(0, 3);
  const paretoConcentrationPercent = top3.reduce((acc, e) => acc + e.sharePercent, 0);

  const healthStatus =
    netResult > 0 && operatingMarginPercent >= 15
      ? "superavitário com excelente rentabilidade"
      : netResult > 0
      ? "positivo com margem operacional ajustada"
      : "deficitário no período analisado";

  let narrative = `Auditoria de Dados 100% Conciliados: Foram auditados ${reconciledTrxs.length} lançamentos conciliados no período. A receita conciliada totalizou ${formatBRL(
    sumIncome
  )} frente a despesas liquidadas de ${formatBRL(sumExpense)}, resultando em resultado operacional de ${formatBRL(
    netResult
  )} (Margem de ${operatingMarginPercent.toFixed(1)}%), caracterizando um desempenho ${healthStatus}.`;

  if (top3.length > 0) {
    narrative += ` Os principais direcionadores de custo foram ${top3
      .map((t) => `${t.name} (${t.sharePercent.toFixed(1)}%)`)
      .join(", ")}, totalizando ${paretoConcentrationPercent.toFixed(1)}% do total desembolsado.`;
  }

  return {
    totalIncome: sumIncome,
    totalExpense: sumExpense,
    netResult,
    operatingMarginPercent,
    avgMonthlyBurn,
    topExpenseCategories: top3,
    paretoConcentrationPercent,
    volatileAlerts: [],
    summaryNarrative: narrative,
    reconciledCount: reconciledTrxs.length,
    totalTransactionsCount: periodTransactions.length,
  };
}
