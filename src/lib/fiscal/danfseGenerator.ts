/**
 * Oeco Start — Gerador de DANFSE (Documento Auxiliar da Nota Fiscal de Serviços Eletrônica)
 * Renderiza em PDF oficial (A4) utilizando jsPDF e jspdf-autotable.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { NfseInvoice } from "@/components/invoices/types";

interface GenerateDanfseOptions {
  invoice: NfseInvoice;
  companyName?: string;
  companyCnpj?: string;
  companyAddress?: string;
  companyMunicipalInscription?: string;
  isTestEnvironment?: boolean;
}

export function generateDanfsePdf({
  invoice,
  companyName = "Sua Empresa Ltda",
  companyCnpj = "00.000.000/0001-91",
  companyAddress = "Av. Paulista, 1000 - Bela Vista, São Paulo - SP",
  companyMunicipalInscription = "1234567-8",
  isTestEnvironment = true,
}: GenerateDanfseOptions) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Borda externa de segurança
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

  // 1. CABEÇALHO DO DOCUMENTO
  doc.setFillColor(245, 247, 250);
  doc.rect(8, 8, pageWidth - 16, 26, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text("NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e", 14, 16);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Documento Auxiliar da NFS-e (DANFSE) — Padrão Nacional / ABRASF", 14, 21);

  // Selo de Homologação / Testes
  if (isTestEnvironment) {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
    doc.roundedRect(pageWidth - 85, 11, 75, 10, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(180, 83, 9);
    doc.text("HOMOLOGAÇÃO - SEM VALOR FISCAL", pageWidth - 82, 17.5);
  } else {
    doc.setFillColor(220, 252, 231);
    doc.setDrawColor(22, 163, 74);
    doc.roundedRect(pageWidth - 75, 11, 65, 10, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(22, 101, 52);
    doc.text("EMISSÃO OFICIAL AUTORIZADA", pageWidth - 71, 17.5);
  }

  // QUADRO DE DADOS DE IDENTIFICAÇÃO DA NOTA
  let curY = 37;
  autoTable(doc, {
    startY: curY,
    margin: { left: 10, right: 10 },
    theme: "grid",
    head: [["Número da NFS-e", "Série", "Data e Hora de Emissão", "Código de Verificação", "Competência"]],
    body: [[
      invoice.number || "000001",
      invoice.series || "E",
      new Date(invoice.issue_date).toLocaleString("pt-BR"),
      invoice.verification_code || "AUT-TEST-99",
      invoice.competence_month || "2026-10",
    ]],
    styles: { fontSize: 8, cellPadding: 2.5, halign: "center" },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: "bold" },
  });

  curY = (doc as any).lastAutoTable.finalY + 4;

  // QUADRO DO PRESTADOR DE SERVIÇOS
  autoTable(doc, {
    startY: curY,
    margin: { left: 10, right: 10 },
    theme: "plain",
    head: [["PRESTADOR DE SERVIÇOS (EMISSOR)"]],
    body: [[
      `Razão Social / Nome: ${companyName}\n` +
      `CNPJ: ${companyCnpj}     Inscrição Municipal: ${companyMunicipalInscription}\n` +
      `Endereço: ${companyAddress}\n` +
      `Regime Tributário: ${invoice.tax_regime === "mei" ? "Microempreendedor Individual (MEI)" : "Simples Nacional"}`
    ]],
    styles: { fontSize: 8, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: "bold" },
  });

  curY = (doc as any).lastAutoTable.finalY + 4;

  // QUADRO DO TOMADOR DE SERVIÇOS
  autoTable(doc, {
    startY: curY,
    margin: { left: 10, right: 10 },
    theme: "plain",
    head: [["TOMADOR DE SERVIÇOS (DESTINATÁRIO)"]],
    body: [[
      `Nome / Razão Social: ${invoice.customer_name}\n` +
      `CPF / CNPJ: ${invoice.customer_document}\n` +
      `Município / UF: ${invoice.customer_city}\n` +
      `E-mail de Destino: ${invoice.customer_email || "Não informado"}`
    ]],
    styles: { fontSize: 8, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: "bold" },
  });

  curY = (doc as any).lastAutoTable.finalY + 4;

  // DISCRIMINAÇÃO DOS SERVIÇOS
  autoTable(doc, {
    startY: curY,
    margin: { left: 10, right: 10 },
    theme: "plain",
    head: [["DISCRIMINAÇÃO DOS SERVIÇOS PRESTADOS"]],
    body: [[
      `${invoice.service_description}\n\n` +
      `---------------------------------------------------------------------------------------------------------\n` +
      `Item da LC 116/03: ${invoice.service_code_lc116} | CNAE: ${invoice.cnae}\n` +
      `Tributação: ${invoice.tax_regime === "mei" ? "MEI (ISS Fixo - Não Retido)" : `Simples Nacional (Alíquota ISS: ${invoice.iss_rate}%)`}`
    ]],
    styles: { fontSize: 8, cellPadding: 3.5, textColor: [15, 23, 42] },
    headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: "bold" },
  });

  curY = (doc as any).lastAutoTable.finalY + 4;

  // QUADRO RESUMO DE TRIBUTOS
  autoTable(doc, {
    startY: curY,
    margin: { left: 10, right: 10 },
    theme: "grid",
    head: [["Valor Bruto (R$)", "Deduções (R$)", "Base de Cálculo (R$)", "Alíq. ISS (%)", "Valor do ISS (R$)", "ISS Retido?"]],
    body: [[
      `R$ ${invoice.amount.toFixed(2)}`,
      "R$ 0,00",
      `R$ ${invoice.amount.toFixed(2)}`,
      `${invoice.iss_rate.toFixed(2)}%`,
      `R$ ${invoice.iss_amount.toFixed(2)}`,
      invoice.iss_retained ? "SIM" : "NÃO",
    ]],
    styles: { fontSize: 8, cellPadding: 2.5, halign: "center" },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: "bold" },
  });

  curY = (doc as any).lastAutoTable.finalY + 2;

  // RETENÇÕES FEDERAIS E VALOR LÍQUIDO
  const netValue = invoice.iss_retained ? invoice.amount - invoice.iss_amount : invoice.amount;
  autoTable(doc, {
    startY: curY,
    margin: { left: 10, right: 10 },
    theme: "grid",
    head: [["PIS (R$)", "COFINS (R$)", "INSS (R$)", "IR (R$)", "CSLL (R$)", "VALOR LÍQUIDO (R$)"]],
    body: [[
      "R$ 0,00",
      "R$ 0,00",
      "R$ 0,00",
      "R$ 0,00",
      "R$ 0,00",
      `R$ ${netValue.toFixed(2)}`,
    ]],
    styles: { fontSize: 8, cellPadding: 2.5, halign: "center" },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: "bold" },
    columnStyles: {
      5: { fontStyle: "bold", textColor: [16, 185, 129] },
    },
  });

  curY = (doc as any).lastAutoTable.finalY + 6;

  // INFORMAÇÕES COMPLEMENTARES
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("OUTRAS INFORMAÇÕES / NOTAS COMPLEMENTARES:", 12, curY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "- Documento emitido por ME ou EPP optante pelo Simples Nacional.\n" +
    "- Não gera direito a crédito fiscal de IPI ou ICMS.\n" +
    (isTestEnvironment ? "- AMBIENTE DE HOMOLOGAÇÃO: Documento gerado para testes, sem validade tributária." : "- Transmissão processada e autorizada pelo sistema Spedy API."),
    12,
    curY + 4
  );

  // Rodapé com hash/chave
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Gerado via Oeco Start Fiscal em ${new Date().toLocaleString("pt-BR")} | ID: ${invoice.id}`,
    12,
    pageHeight - 11
  );

  // Abre o PDF em nova aba
  const pdfBlob = doc.output("blob");
  const blobUrl = URL.createObjectURL(pdfBlob);
  window.open(blobUrl, "_blank");
}

/**
 * Gera e dispara o download do arquivo XML padrão NFS-e
 */
export function downloadNfseXml(invoice: NfseInvoice, companyName = "Empresa Emissora") {
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Nfse versao="2.04">
    <InfNfse Id="NFS-${invoice.number || '000001'}">
      <Numero>${invoice.number || '000001'}</Numero>
      <CodigoVerificacao>${invoice.verification_code || 'AUT-TEST'}</CodigoVerificacao>
      <DataEmissao>${invoice.issue_date}</DataEmissao>
      <Competencia>${invoice.competence_month}-01</Competencia>
      <ValoresNfse>
        <ValorServicos>${invoice.amount.toFixed(2)}</ValorServicos>
        <ValorDeducoes>0.00</ValorDeducoes>
        <ValorPis>0.00</ValorPis>
        <ValorCofins>0.00</ValorCofins>
        <ValorInss>0.00</ValorInss>
        <ValorIr>0.00</ValorIr>
        <ValorCsll>0.00</ValorCsll>
        <IssRetido>${invoice.iss_retained ? 1 : 2}</IssRetido>
        <ValorIss>${invoice.iss_amount.toFixed(2)}</ValorIss>
        <Aliquota>${(invoice.iss_rate / 100).toFixed(4)}</Aliquota>
      </ValoresNfse>
      <PrestadorServico>
        <RazaoSocial>${companyName}</RazaoSocial>
      </PrestadorServico>
      <TomadorServico>
        <IdentificacaoTomador>
          <CpfCnpj>
            <Cnpj>${invoice.customer_document.replace(/\\D/g, '')}</Cnpj>
          </CpfCnpj>
        </IdentificacaoTomador>
        <RazaoSocial>${invoice.customer_name}</RazaoSocial>
      </TomadorServico>
      <DadosServico>
        <ItemListaServico>${invoice.service_code_lc116}</ItemListaServico>
        <CodigoCnae>${invoice.cnae.replace(/\\D/g, '')}</CodigoCnae>
        <Discriminacao>${invoice.service_description}</Discriminacao>
      </DadosServico>
    </InfNfse>
  </Nfse>
</CompNfse>`;

  const blob = new Blob([xmlContent], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `NFS-e_${invoice.number || "000001"}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
