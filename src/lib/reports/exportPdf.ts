/**
 * Exportador de Relatórios Financeiros para PDF Profissional
 * Utiliza jsPDF e jspdf-autotable para renderizar relatórios executivos formatados.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { TableRowData, ColumnDef, formatBRL } from "./calculations";
import { ExecutiveDiagnostic } from "./diagnostics";

interface ExportPdfParams {
  companyName: string;
  periodLabel: string;
  dimensionLabel: string;
  columns: ColumnDef[];
  rows: TableRowData[];
  totalIncomeByCol: Record<string, number>;
  totalExpenseByCol: Record<string, number>;
  netBalanceByCol: Record<string, number>;
  diagnostic: ExecutiveDiagnostic;
}

export function exportReportToPdf({
  companyName,
  periodLabel,
  dimensionLabel,
  columns,
  rows,
  totalIncomeByCol,
  totalExpenseByCol,
  netBalanceByCol,
  diagnostic,
}: ExportPdfParams) {
  // Cria documento em formato paisagem (landscape) para caber múltiplas colunas com folga
  const doc = new jsPDF({
    orientation: columns.length > 4 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // 1. Cabeçalho Executivo
  doc.setFillColor(30, 58, 95); // Primary Navy #1e3a5f
  doc.rect(0, 0, pageWidth, 24, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("RELATÓRIO FINANCEIRO GERENCIAL", 14, 11);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Empresa: ${companyName}   |   Período: ${periodLabel}   |   Ângulo: ${dimensionLabel}`, 14, 18);

  const todayStr = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.text(`Gerado em: ${todayStr}`, pageWidth - 14, 18, { align: "right" });

  // 2. Bloco de KPIs (Cards de Resumo)
  let curY = 30;

  doc.setFillColor(248, 250, 252); // Slate-50
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.roundedRect(14, curY, pageWidth - 28, 20, 2, 2, "FD");

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");

  const colStep = (pageWidth - 28) / 4;

  // KPI 1: Receita
  doc.text("RECEITA CONSOLIDADA", 18, curY + 6);
  doc.setTextColor(16, 185, 129); // Green
  doc.setFontSize(11);
  doc.text(formatBRL(diagnostic.totalIncome), 18, curY + 14);

  // KPI 2: Despesas
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  doc.text("DESPESA CONSOLIDADA", 18 + colStep, curY + 6);
  doc.setTextColor(239, 68, 68); // Red
  doc.setFontSize(11);
  doc.text(formatBRL(diagnostic.totalExpense), 18 + colStep, curY + 14);

  // KPI 3: Resultado Líquido
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  doc.text("RESULTADO LÍQUIDO", 18 + colStep * 2, curY + 6);
  doc.setTextColor(diagnostic.netResult >= 0 ? 16 : 239, diagnostic.netResult >= 0 ? 185 : 68, diagnostic.netResult >= 0 ? 129 : 68);
  doc.setFontSize(11);
  doc.text(formatBRL(diagnostic.netResult), 18 + colStep * 2, curY + 14);

  // KPI 4: Margem Operacional
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  doc.text("MARGEM OPERACIONAL", 18 + colStep * 3, curY + 6);
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(11);
  doc.text(`${diagnostic.operatingMarginPercent.toFixed(1)}%`, 18 + colStep * 3, curY + 14);

  curY += 25;

  // 3. Síntese Executiva / Parecer Narrativo
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, curY, pageWidth - 28, 16, 2, 2, "FD");

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");

  const splitNarrative = doc.splitTextToSize(
    `Síntese: ${diagnostic.summaryNarrative}`,
    pageWidth - 36
  );
  doc.text(splitNarrative, 18, curY + 6);

  curY += 21;

  // 4. Montagem da Tabela com AutoTable
  const head = [["Dimensão / Rubrica", ...columns.map((c) => c.label)]];
  const body: any[][] = [];

  for (const row of rows) {
    body.push([row.name, ...columns.map((col) => formatBRL(row.values[col.key] || 0))]);

    if (row.children && row.children.length > 0) {
      for (const child of row.children) {
        body.push([`   ↳ ${child.name}`, ...columns.map((col) => formatBRL(child.values[col.key] || 0))]);
      }
    }
  }

  // Linhas de totais
  body.push([
    "TOTAL RECEITAS",
    ...columns.map((col) => formatBRL(totalIncomeByCol[col.key] || 0)),
  ]);
  body.push([
    "TOTAL DESPESAS",
    ...columns.map((col) => formatBRL(totalExpenseByCol[col.key] || 0)),
  ]);
  body.push([
    "SALDO LÍQUIDO",
    ...columns.map((col) => formatBRL(netBalanceByCol[col.key] || 0)),
  ]);

  autoTable(doc, {
    startY: curY,
    head: head,
    body: body,
    theme: "striped",
    headStyles: {
      fillColor: [30, 58, 95],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      halign: "right",
    },
    bodyStyles: {
      fontSize: 7.5,
      halign: "right",
      textColor: [51, 65, 85],
    },
    columnStyles: {
      0: { halign: "left", fontStyle: "bold", cellWidth: columns.length > 5 ? 50 : 65 },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      // Destaque para as 3 últimas linhas de total
      if (data.row.index >= body.length - 3) {
        data.cell.styles.fontStyle = "bold";
        if (data.row.index === body.length - 3) {
          data.cell.styles.textColor = [16, 185, 129];
        } else if (data.row.index === body.length - 2) {
          data.cell.styles.textColor = [239, 68, 68];
        } else if (data.row.index === body.length - 1) {
          data.cell.styles.fillColor = [238, 242, 255];
          data.cell.styles.textColor = [30, 58, 95];
        }
      }
    },
    didDrawPage: (data) => {
      // Rodapé
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      const pageStr = `Página ${doc.getNumberOfPages()}`;
      doc.text(pageStr, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
      doc.text("OECO Gestão Financeira Inteligente", 14, doc.internal.pageSize.getHeight() - 8);
    },
  });

  // Salva o PDF
  const filename = `Relatorio_Financeiro_${companyName.replace(/[^a-zA-Z0-9]/g, "_")}_${periodLabel.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
  doc.save(filename);
}
