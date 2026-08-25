/**
 * Exportador de Relatórios Financeiros para Excel (XLSX)
 * Gera planilhas completas com abas de Resumo Consolidado, Diagnóstico e Transações
 */

import * as XLSX from "xlsx";
import { TableRowData, ColumnDef, ReportTransaction, ReportCategory, ReportBankAccount } from "./calculations";
import { ExecutiveDiagnostic } from "./diagnostics";

interface ExportXlsxParams {
  companyName: string;
  periodLabel: string;
  dimensionLabel: string;
  columns: ColumnDef[];
  rows: TableRowData[];
  totalIncomeByCol: Record<string, number>;
  totalExpenseByCol: Record<string, number>;
  netBalanceByCol: Record<string, number>;
  diagnostic: ExecutiveDiagnostic;
  transactions: ReportTransaction[];
  categories: ReportCategory[];
  bankAccounts: ReportBankAccount[];
}

export function exportReportToXlsx({
  companyName,
  periodLabel,
  dimensionLabel,
  columns,
  rows,
  totalIncomeByCol,
  totalExpenseByCol,
  netBalanceByCol,
  diagnostic,
  transactions,
  categories,
  bankAccounts,
}: ExportXlsxParams) {
  const wb = XLSX.utils.book_new();

  // =========================================================================
  // ABA 1: VISÃO CONSOLIDADA
  // =========================================================================
  const consolidatedSheetData: any[][] = [];

  // Cabeçalho da Empresa e Relatório
  consolidatedSheetData.push(["RELATÓRIO FINANCEIRO GERENCIAL"]);
  consolidatedSheetData.push(["Empresa:", companyName]);
  consolidatedSheetData.push(["Período:", periodLabel]);
  consolidatedSheetData.push(["Ângulo de Análise:", dimensionLabel]);
  consolidatedSheetData.push([]); // Linha em branco

  // Cabeçalho da Tabela
  const headers = ["Dimensão / Rubrica", ...columns.map((c) => c.label)];
  consolidatedSheetData.push(headers);

  // Linhas da Tabela (com suporte a sublinhas)
  for (const row of rows) {
    const rowLine = [row.name, ...columns.map((col) => row.values[col.key] || 0)];
    consolidatedSheetData.push(rowLine);

    if (row.children && row.children.length > 0) {
      for (const child of row.children) {
        const childLine = [`  ↳ ${child.name}`, ...columns.map((col) => child.values[col.key] || 0)];
        consolidatedSheetData.push(childLine);
      }
    }
  }

  // Linha de Totais
  consolidatedSheetData.push([]);
  consolidatedSheetData.push(["TOTAL RECEITAS", ...columns.map((col) => totalIncomeByCol[col.key] || 0)]);
  consolidatedSheetData.push(["TOTAL DESPESAS", ...columns.map((col) => totalExpenseByCol[col.key] || 0)]);
  consolidatedSheetData.push(["SALDO LÍQUIDO", ...columns.map((col) => netBalanceByCol[col.key] || 0)]);

  const wsConsolidated = XLSX.utils.aoa_to_sheet(consolidatedSheetData);

  // Ajuste de largura das colunas
  wsConsolidated["!cols"] = [{ wch: 35 }, ...columns.map(() => ({ wch: 18 }))];
  XLSX.utils.book_append_sheet(wb, wsConsolidated, "Visão Consolidada");

  // =========================================================================
  // ABA 2: DIAGNÓSTICO EXECUTIVO
  // =========================================================================
  const diagnosticSheetData: any[][] = [
    ["DIAGNÓSTICO & PARECER EXECUTIVO"],
    ["Empresa:", companyName],
    ["Período:", periodLabel],
    [],
    ["INDICADORES CHAVE (KPIs)"],
    ["Receita Total:", diagnostic.totalIncome],
    ["Despesa Total:", diagnostic.totalExpense],
    ["Resultado Líquido:", diagnostic.netResult],
    ["Margem Operacional:", `${diagnostic.operatingMarginPercent.toFixed(2)}%`],
    ["Queima Média Mensal:", diagnostic.avgMonthlyBurn],
    [],
    ["CONCENTRAÇÃO DE GASTOS (REGRA 80/20)"],
    ["Rubrica", "Valor Acumulado", "% do Total de Despesas"],
    ...diagnostic.topExpenseCategories.map((top) => [top.name, top.amount, `${top.sharePercent.toFixed(1)}%`]),
    [],
    ["SÍNTESE EXECUTIVA"],
    [diagnostic.summaryNarrative],
  ];

  const wsDiagnostic = XLSX.utils.aoa_to_sheet(diagnosticSheetData);
  wsDiagnostic["!cols"] = [{ wch: 30 }, { wch: 25 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsDiagnostic, "Diagnóstico Executivo");

  // =========================================================================
  // ABA 3: TRANSAÇÕES DETALHADAS
  // =========================================================================
  const trxSheetData: any[][] = [
    ["Data", "Descrição", "Valor (R$)", "Categoria", "Centro de Custo", "Conta Bancária"],
  ];

  for (const t of transactions) {
    const cat = categories.find((c) => c.id === t.category_id);
    const acc = bankAccounts.find((a) => a.id === t.bank_account_id);
    trxSheetData.push([
      t.date,
      t.description,
      t.amount,
      cat ? cat.name : "(Não categorizado)",
      t.cost_center || "—",
      acc ? acc.name : "—",
    ]);
  }

  const wsTransactions = XLSX.utils.aoa_to_sheet(trxSheetData);
  wsTransactions["!cols"] = [
    { wch: 12 },
    { wch: 40 },
    { wch: 15 },
    { wch: 25 },
    { wch: 20 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTransactions, "Transações do Período");

  // Download do arquivo XLSX
  const filename = `Relatorio_Financeiro_${companyName.replace(/[^a-zA-Z0-9]/g, "_")}_${periodLabel.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
  XLSX.writeFile(wb, filename);
}
