/**
 * Utilitários e cálculos matemáticos para o módulo de Relatórios Financeiros (BI)
 */

export type Granularity = "single_month" | "month_by_month" | "quarter" | "total";
export type Dimension = "cashflow" | "bank_account" | "category" | "cost_center";
export type VisualMode = "table" | "pie" | "bar" | "line";

export type ReportTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category_id: string | null;
  cost_center: string | null;
  is_reconciled: boolean;
  is_internal_transfer: boolean;
  bank_account_id: string | null;
  month_ref: string;
};

export type ReportCategory = {
  id: string;
  name: string;
  type: "income" | "expense";
  parent_id: string | null;
  cost_center?: string | null;
};

export type ReportBankAccount = {
  id: string;
  name: string;
  is_active: boolean;
};

export type ReportCostCenter = {
  id: string;
  name: string;
};

export type ColumnDef = {
  key: string;
  label: string;
  monthRefs: string[]; // meses correspondentes a esta coluna
};

export type TableRowData = {
  id: string;
  name: string;
  type?: "income" | "expense" | "transfer" | "net";
  categoryId?: string | null;
  subcategoryId?: string | null;
  costCenterName?: string | null;
  bankAccountId?: string | null;
  values: Record<string, number>; // key -> valor absoluto/monetário
  children?: TableRowData[];
};

export type CompatibilityMap = Record<Granularity, VisualMode[]>;

export const COMPATIBILITY_MATRIX: CompatibilityMap = {
  single_month: ["table", "pie"],
  month_by_month: ["table", "bar", "line"],
  quarter: ["table", "bar", "line"],
  total: ["table", "pie"],
};

/**
 * Retorna true se a visualização for permitida para a granularidade.
 */
export function isVisualCompatible(granularity: Granularity, visual: VisualMode): boolean {
  return COMPATIBILITY_MATRIX[granularity]?.includes(visual) ?? false;
}

/**
 * Gera lista de meses 'YYYY-MM' entre startMonth e endMonth inclusos.
 */
export function generateMonthRange(startMonth: string, endMonth: string): string[] {
  if (!startMonth || !endMonth) return [startMonth || endMonth || "2026-01"];
  if (startMonth > endMonth) {
    const temp = startMonth;
    startMonth = endMonth;
    endMonth = temp;
  }

  const [startYear, startM] = startMonth.split("-").map(Number);
  const [endYear, endM] = endMonth.split("-").map(Number);

  const months: string[] = [];
  let curYear = startYear;
  let curMonth = startM;

  while (curYear < endYear || (curYear === endYear && curMonth <= endM)) {
    months.push(`${curYear}-${String(curMonth).padStart(2, "0")}`);
    curMonth++;
    if (curMonth > 12) {
      curMonth = 1;
      curYear++;
    }
  }

  return months;
}

/**
 * Formata 'YYYY-MM' para 'MM/AAAA'
 */
export function formatMonthToBR(monthRef: string): string {
  if (!monthRef) return "";
  const [year, month] = monthRef.split("-");
  return `${month}/${year}`;
}

/**
 * Formata 'YYYY-MM' para 'MM/AA'
 */
export function formatMonthToShort(monthRef: string): string {
  if (!monthRef) return "";
  const [year, month] = monthRef.split("-");
  return `${month}/${year.slice(2)}`;
}

/**
 * Converte 'YYYY-MM' em Trimestre 'YYYY-QX' e label 'Q1/AA'
 */
export function getQuarterKey(monthRef: string): { key: string; label: string } {
  const [year, monthStr] = monthRef.split("-");
  const month = Number(monthStr);
  const q = Math.ceil(month / 3);
  return {
    key: `${year}-Q${q}`,
    label: `Q${q}/${year.slice(2)}`,
  };
}

/**
 * Gera as colunas de tempo com base na Granularidade
 */
export function getColumnsForGranularity(
  granularity: Granularity,
  selectedMonth: string,
  startMonth: string,
  endMonth: string
): ColumnDef[] {
  if (granularity === "single_month") {
    return [
      {
        key: selectedMonth,
        label: formatMonthToBR(selectedMonth),
        monthRefs: [selectedMonth],
      },
    ];
  }

  const range = generateMonthRange(startMonth, endMonth);

  if (granularity === "total") {
    return [
      {
        key: "total",
        label: "Total do Período",
        monthRefs: range,
      },
    ];
  }

  if (granularity === "month_by_month") {
    return range.map((m) => ({
      key: m,
      label: formatMonthToShort(m),
      monthRefs: [m],
    }));
  }

  if (granularity === "quarter") {
    const quartersMap = new Map<string, { label: string; monthRefs: string[] }>();
    for (const m of range) {
      const { key, label } = getQuarterKey(m);
      if (!quartersMap.has(key)) {
        quartersMap.set(key, { label, monthRefs: [] });
      }
      quartersMap.get(key)!.monthRefs.push(m);
    }

    return Array.from(quartersMap.entries()).map(([key, data]) => ({
      key,
      label: data.label,
      monthRefs: data.monthRefs,
    }));
  }

  return [];
}

/**
 * Validação de Conciliação:
 * Retorna se o período tem todas as transações conciliadas.
 */
export function validateReconciliation(
  transactions: ReportTransaction[],
  targetMonths: string[]
): { isClean: boolean; pendingMonths: string[] } {
  const targetSet = new Set(targetMonths);
  const pendingMonthsSet = new Set<string>();

  for (const t of transactions) {
    if (targetSet.has(t.month_ref)) {
      // Transferências internas automáticas ou já conciliadas não bloqueiam
      if (!t.is_reconciled && !t.is_internal_transfer) {
        pendingMonthsSet.add(t.month_ref);
      }
    }
  }

  const pendingMonths = Array.from(pendingMonthsSet).sort();
  return {
    isClean: pendingMonths.length === 0,
    pendingMonths,
  };
}

/**
 * Formata Moeda BRL
 */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Formata Porcentagem
 */
export function formatPercent(value: number): string {
  if (!isFinite(value) || isNaN(value)) return "0.0%";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/**
 * Calcula Análise Vertical (AV%): peso percentual de cada valor relativo ao total do grupo naquela coluna
 */
export function calculateAV(value: number, groupTotal: number): number {
  if (!groupTotal || groupTotal === 0) return 0;
  return (Math.abs(value) / Math.abs(groupTotal)) * 100;
}

/**
 * Calcula Análise Horizontal (AH%): variação percentual em relação ao período anterior
 */
export function calculateAH(currentValue: number, previousValue: number | undefined): number | null {
  if (previousValue === undefined) return null;
  if (previousValue === 0) {
    if (currentValue === 0) return 0;
    return currentValue > 0 ? 100 : -100;
  }
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

/**
 * Retorna classe de cor para Análise Horizontal (AH)
 * - Receita: + é verde, - é vermelho
 * - Despesa: + é vermelho (aumento de gasto), - é verde (redução de gasto)
 */
export function getAHColorClass(ah: number | null, type: "income" | "expense" | "transfer" | "net" = "income"): string {
  if (ah === null || ah === 0) return "text-gray-400";

  if (type === "expense") {
    return ah > 0 ? "text-red-600 font-medium" : "text-green-600 font-medium";
  }

  // Receitas, Líquido ou outros
  return ah > 0 ? "text-green-600 font-medium" : "text-red-600 font-medium";
}
